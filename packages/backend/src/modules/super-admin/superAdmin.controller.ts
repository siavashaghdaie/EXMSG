import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { generateTokens } from '../../middleware/auth';
import { createAndSendOtp, verifyOtp } from '../../services/otp';
import { isEmailConfigured } from '../../services/email';

export class SuperAdminController {
  /**
   * POST /api/super-admin/login
   * Super Admin login - only works for users with SUPER_ADMIN role
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          passwordHash: true,
        },
      });

      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // Check if user is super admin
      if (user.role !== 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Only Super Admins can access the back office' });
        return;
      }

      // Validate password
      const passwordValid = await bcrypt.compare(password, user.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      // ---------------------------------------------------------------------
      // Two-factor via email OTP on every Panel Owner login
      // ---------------------------------------------------------------------
      if (isEmailConfigured()) {
        const otpResult = await createAndSendOtp(user.email, 'login', user.id);
        if (!otpResult.success) {
          console.error('[Super Admin] Failed to send login OTP:', otpResult.error);
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

      // Email not configured (dev mode) — issue tokens immediately
      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (error) {
      console.error('Super Admin login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /api/super-admin/verify-login
   * Complete a Panel Owner login by verifying the 6-digit code.
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

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          role: true,
        },
      });

      if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      // Enforce that only SUPER_ADMINs get tokens from this endpoint
      if (user.role !== 'SUPER_ADMIN') {
        res.status(403).json({ error: 'Only Panel Owners can access the back office' });
        return;
      }

      const tokens = generateTokens({
        userId: user.id,
        email: user.email,
        username: user.username,
      });

      res.json({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });
    } catch (error) {
      console.error('Super Admin verify-login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/super-admin/dashboard
   * Main dashboard data with platform-wide statistics
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        totalOrganizations,
        totalUsers,
        totalMessages,
        activeUsersToday,
        messagesToday,
        newSignupsData,
        messagesPerDayData,
        topOrganizations,
      ] = await Promise.all([
        prisma.organization.count(),
        prisma.user.count({
          where: { role: 'USER' }, // Don't count admins in user stats
        }),
        prisma.message.count(),
        prisma.user.count({
          where: {
            isOnline: true,
            role: 'USER',
          },
        }),
        prisma.message.count({
          where: { createdAt: { gte: today } },
        }),
        // New signups by day (last 7 days)
        prisma.user.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: sevenDaysAgo },
            role: 'USER',
          },
          _count: { id: true },
        }),
        // Messages per day (last 7 days)
        prisma.message.groupBy({
          by: ['createdAt'],
          where: { createdAt: { gte: sevenDaysAgo } },
          _count: { id: true },
        }),
        // Top organizations by message count
        prisma.organization.findMany({
          take: 5,
          orderBy: {
            channels: { _count: 'desc' },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                channels: true,
              },
            },
          },
        }),
      ]);

      // Calculate new signups by day
      const newSignupsByDay: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        newSignupsByDay[dateStr] = 0;
      }

      newSignupsData.forEach((entry: any) => {
        const dateStr = entry.createdAt.toISOString().split('T')[0];
        if (dateStr in newSignupsByDay) {
          newSignupsByDay[dateStr] = entry._count.id;
        }
      });

      // Calculate messages per day
      const messagesPerDay: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        messagesPerDay[dateStr] = 0;
      }

      messagesPerDayData.forEach((entry: any) => {
        const dateStr = entry.createdAt.toISOString().split('T')[0];
        if (dateStr in messagesPerDay) {
          messagesPerDay[dateStr] = entry._count.id;
        }
      });

      res.json({
        stats: {
          totalOrganizations,
          totalUsers,
          totalMessages,
          activeUsersToday,
          messagesToday,
          revenue: 0, // Placeholder for when billing is implemented
        },
        charts: {
          newSignupsByDay,
          messagesPerDay,
        },
        topOrganizations,
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/super-admin/organizations
   * List all organizations with stats
   */
  async getOrganizations(req: Request, res: Response): Promise<void> {
    try {
      const { search, page = '1', limit = '20' } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { slug: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [organizations, total] = await Promise.all([
        prisma.organization.findMany({
          where,
          skip,
          take: parseInt(limit as string),
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            avatarUrl: true,
            description: true,
            createdAt: true,
            _count: {
              select: {
                members: true,
                channels: true,
              },
            },
          },
        }),
        prisma.organization.count({ where }),
      ]);

      // Get message count for each organization (via channels)
      const orgsWithStats = await Promise.all(
        organizations.map(async (org) => {
          // Get this org's channels (which each link to a conversation)
          const orgChannels = await prisma.channel.findMany({
            where: { organizationId: org.id, conversationId: { not: null } },
            select: { conversationId: true },
          });
          const conversationIds = orgChannels
            .map((c) => c.conversationId)
            .filter((id): id is string => id !== null);

          const messageCount = conversationIds.length
            ? await prisma.message.count({
                where: { conversationId: { in: conversationIds } },
              })
            : 0;

          return {
            ...org,
            messageCount,
          };
        })
      );

      res.json({
        organizations: orgsWithStats,
        total,
        page: parseInt(page as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      });
    } catch (error) {
      console.error('Get organizations error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/super-admin/users
   * List all users across all organizations
   */
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const { search, page = '1', limit = '20', role } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search as string, mode: 'insensitive' } },
          { displayName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (role) {
        where.role = role as string;
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: parseInt(limit as string),
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            role: true,
            isOnline: true,
            lastSeenAt: true,
            createdAt: true,
            organizations: {
              select: {
                organization: {
                  select: { id: true, name: true, slug: true },
                },
              },
            },
            _count: {
              select: { sentMessages: true },
            },
          },
        }),
        prisma.user.count({ where }),
      ]);

      const formattedUsers = users.map((user) => ({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        isOnline: user.isOnline,
        lastSeenAt: user.lastSeenAt,
        createdAt: user.createdAt,
        messageCount: user._count.sentMessages,
        organizations: user.organizations.map((org) => org.organization),
      }));

      res.json({
        users: formattedUsers,
        total,
        page: parseInt(page as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/super-admin/activity-log
   * Recent platform activity log
   */
  async getActivityLog(req: Request, res: Response): Promise<void> {
    try {
      const [recentUsers, recentMessages] = await Promise.all([
        prisma.user.findMany({
          take: 25,
          orderBy: { createdAt: 'desc' },
          where: { role: 'USER' },
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            createdAt: true,
          },
        }),
        prisma.message.findMany({
          take: 25,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            createdAt: true,
            sender: {
              select: {
                username: true,
                displayName: true,
              },
            },
          },
        }),
      ]);

      // Combine and sort by date
      const activities: any[] = [
        ...recentUsers.map((user) => ({
          id: user.id,
          type: 'user_signup',
          description: `${user.displayName} (${user.username}) signed up`,
          user: { username: user.username, displayName: user.displayName, email: user.email },
          timestamp: user.createdAt,
        })),
        ...recentMessages.map((msg) => ({
          id: msg.id,
          type: 'message_sent',
          description: `${msg.sender.displayName} sent a message`,
          user: msg.sender,
          timestamp: msg.createdAt,
        })),
      ];

      activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      res.json({
        activities: activities.slice(0, 50),
      });
    } catch (error) {
      console.error('Activity log error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/super-admin/financial
   * Financial report placeholder
   */
  async getFinancial(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        revenue: 0,
        subscriptions: 0,
        mrr: 0,
        plans: [
          { name: 'Free', count: 0, revenue: 0 },
          { name: 'Pro', count: 0, revenue: 0 },
          { name: 'Enterprise', count: 0, revenue: 0 },
        ],
      });
    } catch (error) {
      console.error('Financial error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
