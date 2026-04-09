import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { generateTokens, verifyRefreshToken } from '../../middleware/auth';
import { RegisterInput, LoginInput } from './auth.validation';
import { createAndSendOtp, verifyOtp } from '../../services/otp';
import { sendWelcomeEmail, isEmailConfigured } from '../../services/email';

const LINDA_EMAIL = 'linda@omnilink.system';

/** Ensure a DM conversation exists between a user and Linda */
async function ensureLindaDM(userId: string): Promise<void> {
  try {
    // Find or create the Linda bot user
    let lindaUser = await prisma.user.findFirst({ where: { email: LINDA_EMAIL }, select: { id: true } });
    if (!lindaUser) {
      lindaUser = await prisma.user.create({
        data: {
          email: LINDA_EMAIL,
          username: 'linda',
          displayName: 'Linda AI',
          passwordHash: 'BOT_ACCOUNT_NO_LOGIN',
          bio: 'Hi! I\'m Linda, your AI assistant. I can help you with tasks, documents, and more.',
          status: 'Always here to help!',
          isOnline: true,
          emailVerified: true,
        },
        select: { id: true },
      });
      console.log(`[Linda] Created bot user: ${lindaUser.id}`);
    }
    if (lindaUser.id === userId) return;

    // Check if DM already exists
    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: lindaUser.id } } },
        ],
      },
    });

    if (!existing) {
      await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          members: {
            create: [
              { userId: lindaUser.id, role: 'OWNER' },
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

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, username: rawUsername, displayName, password } = req.body as RegisterInput;

      // Normalize email to lowercase for case-insensitive handling
      const email = rawEmail.toLowerCase().trim();

      // Auto-generate username from email if not provided
      let username = rawUsername?.toLowerCase().trim() || '';
      if (!username) {
        const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '_');
        username = emailPrefix.slice(0, 30);
        if (username.length < 3) {
          username = username.padEnd(3, '_');
        }
      }

      // Check if user already exists (case-insensitive)
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

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user (unverified if email is configured)
      const emailEnabled = isEmailConfigured();
      const user = await prisma.user.create({
        data: { email, username, displayName, passwordHash, emailVerified: !emailEnabled },
        select: { id: true, email: true, username: true, displayName: true, emailVerified: true, createdAt: true },
      });

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

      res.status(201).json({ user, ...tokens });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Verify OTP code after registration — completes the signup flow.
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

      // Mark user as verified
      const user = await prisma.user.update({
        where: { email },
        data: { emailVerified: true },
        select: { id: true, email: true, username: true, displayName: true, emailVerified: true, createdAt: true },
      });

      // Generate tokens
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

      res.json({ user, ...tokens });
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
      const { email: rawEmail, password } = req.body as LoginInput;
      const email = rawEmail.toLowerCase().trim();

      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          passwordHash: true,
          avatarUrl: true,
          emailVerified: true,
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

      // Block unverified users — resend OTP
      if (!user.emailVerified && isEmailConfigured()) {
        await createAndSendOtp(email, 'register', user.id);
        res.status(403).json({
          error: 'Please verify your email before logging in. A new code has been sent.',
          requiresVerification: true,
          email: user.email,
        });
        return;
      }

      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      // Store refresh token
      await prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      const { passwordHash: _, emailVerified: __, ...userWithoutPassword } = user;

      // Ensure DM with Linda exists (fire-and-forget)
      ensureLindaDM(user.id).catch(() => {});

      res.json({ user: userWithoutPassword, ...tokens });
    } catch (error) {
      console.error('Login error:', error);
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
          isOnline: true,
          createdAt: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({ user });
    } catch (error) {
      console.error('Me error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
