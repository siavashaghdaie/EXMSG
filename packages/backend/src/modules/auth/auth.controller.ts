import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { generateTokens, verifyRefreshToken } from '../../middleware/auth';
import { RegisterInput, LoginInput } from './auth.validation';
import { createAndSendOtp, verifyOtp } from '../../services/otp';
import { sendWelcomeEmail, isEmailConfigured } from '../../services/email';
import { validateInviteToken, consumeInviteToken } from '../../services/invite';
import { getLindaBotUserId } from '../../services/lindaNotify';
import { PLAN_ORDER, PLANS, PlanId, canSelfRegisterOn, isValidPlan } from './plans';

/**
 * Derive a URL-friendly slug from a company name. Collisions are resolved
 * by appending a short random suffix.
 */
function slugifyCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';
}

async function generateUniqueOrgSlug(companyName: string): Promise<string> {
  const base = slugifyCompanyName(companyName);
  // Try the plain slug first, then progressively append random suffixes.
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0
      ? base
      : `${base}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback: append a timestamp.
  return `${base}-${Date.now().toString(36)}`;
}

/** Ensure a DM conversation exists between a user and Linda */
async function ensureLindaDM(userId: string): Promise<void> {
  try {
    // Use the shared getLindaBotUserId to avoid duplicate-creation race conditions
    const lindaId = await getLindaBotUserId();
    if (lindaId === userId) return;

    // Check if DM already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: lindaId } } },
        ],
      },
    });

    if (!existing) {
      await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          members: {
            create: [
              { userId: lindaId, role: 'OWNER' },
              { userId, role: 'MEMBER' },
            ],
          },
        },
      });
      console.log(`[Linda] Created DM with user ${userId}`);
    }
  } catch (err) {
    console.error('[Linda] Failed to ensure DM:', err);
  }
}

/**
 * Enrich a plain user object with org membership info (orgRole, organizationId).
 * Used in login/register/verifyLogin responses so the frontend knows the
 * user's role immediately without a separate /auth/me call.
 */
async function enrichUserWithOrgInfo(user: { id: string; [key: string]: any }) {
  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: 'asc' },
      select: { role: true, organizationId: true },
    });
    return {
      ...user,
      orgRole: membership?.role || null,
      organizationId: membership?.organizationId || null,
    };
  } catch {
    return { ...user, orgRole: null, organizationId: null };
  }
}

export class AuthController {
  /**
   * Public catalog endpoint for plans. Feeds the landing page and plan
   * selection screen so the frontend has a single source of truth.
   */
  async listPlans(_req: Request, res: Response): Promise<void> {
    try {
      const plans = PLAN_ORDER.map((id) => PLANS[id]);
      res.json({ plans });
    } catch (error) {
      console.error('List plans error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async register(req: Request, res: Response): Promise<void> {
    try {
      const {
        email: rawEmail,
        username: rawUsername,
        displayName,
        password,
        companyName: rawCompanyName,
        plan: rawPlan,
      } = req.body as RegisterInput;

      // Normalize email to lowercase for case-insensitive handling
      const email = rawEmail.toLowerCase().trim();

      // Panel Owner newcomer detection — per section 2.3 of the spec, supplying
      // a company name means "this person is creating a new org and will become
      // its OWNER". Without it, we fall back to the legacy "chat account only"
      // flow used for invited members and casual sign-ups.
      const companyName = rawCompanyName?.trim();
      const isPanelOwnerSignup = !!companyName;

      let selectedPlanId: PlanId = 'starter';
      if (isPanelOwnerSignup) {
        if (rawPlan && !isValidPlan(rawPlan)) {
          res.status(400).json({ error: 'Unknown plan' });
          return;
        }
        selectedPlanId = (rawPlan as PlanId | undefined) ?? 'starter';
        if (!canSelfRegisterOn(selectedPlanId)) {
          res.status(400).json({
            error:
              'The selected plan is not available for self-serve signup yet. Please pick Starter or contact sales for Enterprise plans.',
            availablePlans: PLAN_ORDER.filter((id) => canSelfRegisterOn(id)),
          });
          return;
        }
      }

      // Auto-generate username from email if not provided
      let username = rawUsername?.toLowerCase().trim() || '';
      if (!username) {
        const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '_');
        username = emailPrefix.slice(0, 30);
        if (username.length < 3) {
          username = username.padEnd(3, '_');
        }
      }

      // Check if user already exists (case-insensitive) by email, username, OR displayName
      const existing = await prisma.user.findFirst({
        where: {
          OR: [
            { email: { equals: email, mode: 'insensitive' } },
            { username: { equals: username, mode: 'insensitive' } },
          ],
        },
      });

      if (existing) {
        if (existing.email.toLowerCase() === email) {
          // If they exist but aren't verified, resend OTP and tell them
          if (!existing.emailVerified && isEmailConfigured()) {
            await createAndSendOtp(email, 'register', existing.id);
            res.status(409).json({
              error: 'An account with this email already exists but is not verified. A new verification code has been sent.',
              requiresVerification: true,
              email,
            });
            return;
          }
          res.status(409).json({ error: 'An account with this email already exists' });
          return;
        } else {
          username = `${username.slice(0, 25)}_${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
        }
      }

      // ── Duplicate display-name guard ─────────────────────────────
      // If another user already has this exact display name, reject with
      // a helpful message. This prevents two "Sadegh"s in the UI.
      const displayNameDupe = await prisma.user.findFirst({
        where: {
          displayName: { equals: displayName, mode: 'insensitive' },
          NOT: { email: { equals: email, mode: 'insensitive' } },
        },
        select: { id: true, displayName: true },
      });

      if (displayNameDupe) {
        res.status(409).json({
          error: `The display name "${displayName}" is already taken. Please choose a different name or add a distinguishing detail (e.g. "${displayName} M." or "${displayName} (Dev)").`,
        });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user (unverified if email is configured)
      const emailEnabled = isEmailConfigured();

      // For Panel Owner signups we create User + Organization + OrganizationMember
      // atomically so a failure anywhere rolls everything back. We also promote
      // the user's role to ORG_ADMIN so they see the Panel Owner dashboard on
      // first login.
      let user;
      if (isPanelOwnerSignup && companyName) {
        const slug = await generateUniqueOrgSlug(companyName);
        const txResult = await prisma.$transaction(async (tx: any) => {
          const createdUser = await tx.user.create({
            data: {
              email,
              username,
              displayName,
              passwordHash,
              emailVerified: !emailEnabled,
              role: 'ORG_ADMIN',
            },
            select: { id: true, email: true, username: true, displayName: true, emailVerified: true, createdAt: true, role: true },
          });

          // The `plan` / `planStatus` fields were added to the Organization model
          // at the same time as this code. Until `prisma generate` runs on the
          // developer's machine, TypeScript may not see them yet, so we cast
          // the `data` object to `any` for those two fields only.
          const orgData: any = {
            name: companyName,
            slug,
            description: `Organization owned by ${displayName}`,
            plan: selectedPlanId,
            planStatus: 'active',
          };
          const createdOrg = await tx.organization.create({
            data: orgData,
            select: { id: true, name: true, slug: true },
          });

          await tx.organizationMember.create({
            data: {
              organizationId: createdOrg.id,
              userId: createdUser.id,
              role: 'OWNER',
            },
          });

          return { createdUser, createdOrg };
        });
        user = txResult.createdUser;
        console.log(
          `[Auth] Panel Owner signup: user=${user.id} org=${txResult.createdOrg.id} plan=${selectedPlanId}`
        );
      } else {
        user = await prisma.user.create({
          data: { email, username, displayName, passwordHash, emailVerified: !emailEnabled },
          select: { id: true, email: true, username: true, displayName: true, emailVerified: true, createdAt: true, role: true },
        });
      }

      // If email is configured, send OTP and require verification
      if (emailEnabled) {
        const otpResult = await createAndSendOtp(email, 'register', user.id);
        if (!otpResult.success) {
          console.error('[Auth] Failed to send registration OTP:', otpResult.error);
        }
        res.status(201).json({
          message: 'Account created. Please check your email for a verification code.',
          requiresVerification: true,
          email: user.email,
          userId: user.id,
          isPanelOwner: isPanelOwnerSignup,
        });
        return;
      }

      // Email not configured — issue tokens immediately (dev mode)
      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      ensureLindaDM(user.id).catch(() => {});

      const enrichedUser = await enrichUserWithOrgInfo(user);
      res.status(201).json({ user: enrichedUser, ...tokens, isPanelOwner: isPanelOwnerSignup });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Verify OTP code after registration — completes the signup flow.
   *
   * Two behaviors:
   *   - Panel Owner signups (user is OWNER of an Organization) → mark email
   *     verified, do NOT issue tokens, return { requiresLogin: true, email }.
   *     This matches section 2.3.5 of the spec: newcomers land on the login
   *     page with a success banner and sign in with their password + login OTP.
   *   - All other signups (invited members, legacy chat accounts) → keep the
   *     existing behavior and issue tokens immediately to avoid regressing the
   *     non-newcomer flow.
   */
  async verifyRegistration(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, code } = req.body;
      const email = rawEmail?.toLowerCase().trim();

      if (!email || !code) {
        res.status(400).json({ error: 'Email and verification code are required' });
        return;
      }

      // Verify the OTP
      const result = await verifyOtp(email, code, 'register');
      if (!result.valid) {
        res.status(400).json({ error: result.error });
        return;
      }

      // Mark user as verified and check whether they own an organization.
      const user = await prisma.user.update({
        where: { email },
        data: { emailVerified: true },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          emailVerified: true,
          createdAt: true,
          organizations: {
            where: { role: 'OWNER' },
            select: { organizationId: true },
            take: 1,
          },
        },
      });

      const isPanelOwner = user.organizations.length > 0;
      // Strip the relation before sending the user back to the client.
      const { organizations, ...userPayload } = user;

      if (isPanelOwner) {
        // Send the welcome email but withhold tokens — the spec requires the
        // Panel Owner to sign in on the login page with password + login OTP.
        sendWelcomeEmail(email, user.displayName).catch(() => {});
        res.json({
          requiresLogin: true,
          email: user.email,
          message: 'Your email has been verified. Sign in to open your panel.',
          user: userPayload,
        });
        return;
      }

      // Legacy non-Panel-Owner flow: issue tokens immediately.
      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Set up Linda DM and send welcome email
      ensureLindaDM(user.id).catch(() => {});
      sendWelcomeEmail(email, user.displayName).catch(() => {});

      const enrichedPayload = await enrichUserWithOrgInfo(userPayload);
      res.json({ user: enrichedPayload, ...tokens });
    } catch (error) {
      console.error('Verify registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Resend OTP for registration or login.
   */
  async resendOtp(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, purpose } = req.body;
      const email = rawEmail?.toLowerCase().trim();
      const otpPurpose = purpose === 'login' ? 'login' : 'register';

      if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      const result = await createAndSendOtp(email, otpPurpose as 'register' | 'login');
      if (!result.success) {
        res.status(429).json({ error: result.error });
        return;
      }

      res.json({ message: 'Verification code sent. Please check your email.' });
    } catch (error) {
      console.error('Resend OTP error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawIdentifier, password } = req.body as LoginInput;
      const identifier = rawIdentifier.toLowerCase().trim();

      // Determine if the user entered an email or a username
      const isEmail = identifier.includes('@');

      const user = await prisma.user.findFirst({
        where: isEmail
          ? { email: { equals: identifier, mode: 'insensitive' } }
          : {
              OR: [
                { username: { equals: identifier, mode: 'insensitive' } },
                { email: { equals: identifier, mode: 'insensitive' } },
              ],
            },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          passwordHash: true,
          avatarUrl: true,
          emailVerified: true,
          role: true,
        },
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        res.status(401).json({ error: 'Invalid email or password' });
        return;
      }

      // Super admins live in their own table and must NOT log in via /auth/login.
      // This is a safety net in case legacy SUPER_ADMIN users still exist in the
      // users table after the migration.
      if (user.role === 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Super admins must use the back-office login panel.' });
        return;
      }

      // Block unverified users — resend registration OTP
      if (!user.emailVerified && isEmailConfigured()) {
        await createAndSendOtp(email, 'register', user.id);
        res.status(403).json({
          error: 'Please verify your email before logging in. A new code has been sent.',
          requiresVerification: true,
          email: user.email,
        });
        return;
      }

      // ---------------------------------------------------------------------
      // Two-factor via email OTP on every login
      // ---------------------------------------------------------------------
      // When email is configured we NEVER issue tokens from /auth/login directly.
      // Instead we generate a 6-digit code, email it to the user, and require
      // them to complete the flow by calling /auth/verify-login. Only the
      // follow-up call returns access+refresh tokens.
      if (isEmailConfigured()) {
        const otpResult = await createAndSendOtp(email, 'login', user.id);
        if (!otpResult.success) {
          console.error('[Auth] Failed to send login OTP:', otpResult.error);
          res.status(500).json({ error: otpResult.error || 'Failed to send verification code' });
          return;
        }
        res.json({
          requiresOtp: true,
          purpose: 'login',
          email: user.email,
          message: 'A verification code has been sent to your email.',
        });
        return;
      }

      // Email is not configured (dev mode) — issue tokens immediately
      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const { passwordHash: _, emailVerified: __, role: ___, ...userWithoutPassword } = user;

      // Ensure DM with Linda exists (fire-and-forget)
      ensureLindaDM(user.id).catch(() => {});

      const enrichedUser = await enrichUserWithOrgInfo(userWithoutPassword as any);
      res.json({ user: enrichedUser, ...tokens });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Complete a login flow by verifying the 6-digit code sent to the user's email.
   * Returns access + refresh tokens on success.
   */
  async verifyLogin(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, code } = req.body;
      const email = rawEmail?.toLowerCase().trim();

      if (!email || !code) {
        res.status(400).json({ error: 'Email and verification code are required' });
        return;
      }

      const result = await verifyOtp(email, code, 'login');
      if (!result.valid) {
        res.status(400).json({ error: result.error });
        return;
      }

      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          status: true,
          role: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Ensure DM with Linda exists (fire-and-forget)
      ensureLindaDM(user.id).catch(() => {});

      const enrichedUser = await enrichUserWithOrgInfo(user);
      res.json({ user: enrichedUser, ...tokens });
    } catch (error) {
      console.error('Verify login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;

      // Verify token
      const payload = verifyRefreshToken(refreshToken);

      // Check if token exists in DB
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!storedToken) {
        res.status(401).json({ error: 'Invalid refresh token' });
        return;
      }

      // Delete old refresh token
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });

      // Generate new tokens
      const tokens = generateTokens({
        userId: payload.userId,
        email: payload.email,
        username: payload.username,
      });

      // Store new refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: payload.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      res.json(tokens);
    } catch (error) {
      console.error('Refresh error:', error);
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Delete all refresh tokens for this user
      await prisma.refreshToken.deleteMany({ where: { userId } });

      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          status: true,
          role: true,
          isOnline: true,
          createdAt: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Also fetch the user's org membership role (OWNER / ADMIN / MEMBER)
      const orgMembership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: 'asc' },
        select: { role: true, organizationId: true },
      });

      res.json({
        user: {
          ...user,
          orgRole: orgMembership?.role || null,
          organizationId: orgMembership?.organizationId || null,
        },
      });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ─── Invite Flow ──────────────────────────────────────────────

  /**
   * GET /auth/accept-invite?token=xxx
   *
   * Called when the invitee clicks the email link. Validates the token
   * and returns invite metadata (org name, email, etc.) so the frontend
   * can show the "Set your password" page.
   *
   * This endpoint does NOT consume the token — that happens in set-password.
   */
  async acceptInvite(req: Request, res: Response): Promise<void> {
    try {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: 'Invitation token is required.' });
        return;
      }

      const result = await validateInviteToken(token);
      if (!result.valid || !result.invite) {
        res.status(400).json({ error: result.error || 'Invalid invitation.' });
        return;
      }

      // Mark the user's email as verified (clicking the link IS verification)
      await prisma.user.updateMany({
        where: {
          email: { equals: result.invite.email, mode: 'insensitive' },
          emailVerified: false,
        },
        data: { emailVerified: true },
      });

      res.json({
        valid: true,
        invite: {
          email: result.invite.email,
          orgName: result.invite.orgName,
          displayName: result.invite.displayName,
          inviterName: result.invite.inviterName,
          role: result.invite.role,
        },
      });
    } catch (error) {
      console.error('Accept invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /auth/set-password
   *
   * Sets a new password for an invited user. The token is consumed
   * (marked as used) after success. The user is NOT auto-logged-in;
   * they must go through the normal login + OTP flow.
   *
   * Body: { token: string, password: string }
   */
  async setPassword(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body || {};

      if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Invitation token is required.' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters.' });
        return;
      }

      // Validate the token again (it could have expired since acceptInvite)
      const result = await validateInviteToken(token);
      if (!result.valid || !result.invite) {
        res.status(400).json({ error: result.error || 'Invalid invitation.' });
        return;
      }

      const email = result.invite.email;

      // Find the user (should exist — addMember created them)
      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      if (!user) {
        res.status(404).json({ error: 'User account not found. Please contact your administrator.' });
        return;
      }

      // Hash the new password and update the user
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerified: true, // belt-and-suspenders — also set in acceptInvite
        },
      });

      // Consume the token (one-time use)
      await consumeInviteToken(token);

      // Send a welcome email
      if (isEmailConfigured()) {
        sendWelcomeEmail(email, user.displayName).catch((err) => {
          console.error('[Invite] Welcome email failed:', err);
        });
      }

      res.json({
        success: true,
        email,
        message: 'Password set successfully. You can now sign in.',
      });
    } catch (error) {
      console.error('Set password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
