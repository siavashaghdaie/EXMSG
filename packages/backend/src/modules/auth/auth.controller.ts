import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { generateTokens, verifyRefreshToken } from '../../middleware/auth';
import { RegisterInput, LoginInput } from './auth.validation';

const LINDA_EMAIL = 'linda@omnilink.system';

/** Ensure a DM conversation exists between a user and Linda */
async function ensureLindaDM(userId: string): Promise<void> {
  try {
    const lindaUser = await prisma.user.findFirst({ where: { email: LINDA_EMAIL }, select: { id: true } });
    if (!lindaUser || lindaUser.id === userId) return;

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
        // Extract local part of email and sanitize to valid username chars
        const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '_');
        username = emailPrefix.slice(0, 30);
        // Ensure minimum 3 characters
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
          res.status(409).json({ error: 'An account with this email already exists' });
        } else {
          // Username collision — append random digits and retry
          username = `${username.slice(0, 25)}_${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`;
        }
        if (existing.email.toLowerCase() === email) return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const user = await prisma.user.create({
        data: { email, username, displayName, passwordHash },
        select: { id: true, email: true, username: true, displayName: true, createdAt: true },
      });

      // Generate tokens
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
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Ensure DM with Linda exists for new user
      ensureLindaDM(user.id).catch(() => {});

      res.status(201).json({ user, ...tokens });
    } catch (error) {
      console.error('Register error:', error);
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

      const { passwordHash: _, ...userWithoutPassword } = user;

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
