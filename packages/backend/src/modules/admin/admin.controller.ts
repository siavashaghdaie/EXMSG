import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export class AdminController {
  // GET /api/admin/dashboard
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Parallel queries for dashboard stats
      const [
        totalUsers,
        onlineUsers,
        totalConversations,
        messagesToday,
        messagesThisWeek,
        recentUsers,
        topGroups,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isOnline: true } }),
        prisma.conversation.count(),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
        prisma.message.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            username: true,
            displayName: true,
            email: true,
            avatarUrl: true,
            isOnline: true,
            lastSeenAt: true,
            createdAt: true,
          },
        }),
        prisma.conversation.findMany({
          where: { type: { in: ['GROUP', 'CHANNEL'] } },
          orderBy: { updatedAt: 'desc' },
          take: 5,
          select: {
            id: true,
            name: true,
            type: true,
            updatedAt: true,
            _count: { select: { members: true, messages: true } },
          },
        }),
      ]);

      res.json({
        stats: {
          totalUsers,
          onlineUsers,
          totalConversations,
          messagesToday,
          messagesThisWeek,
          avgMessagesPerDay: Math.round(messagesThisWeek / 7),
        },
        recentUsers,
        topGroups,
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/admin/users
  async getUsers(req: Request, res: Response): Promise<void> {
    try {
      const { search, page = '1', limit = '20' } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};
      if (search) {
        where.OR = [
          { username: { contains: search as string, mode: 'insensitive' } },
          { displayName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
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
            isOnline: true,
            lastSeenAt: true,
            createdAt: true,
            bio: true,
            status: true,
            _count: { select: { conversationMembers: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        users,
        total,
        page: parseInt(page as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/admin/stats
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get detailed statistics
      const [
        totalUsers,
        onlineUsers,
        newUsersToday,
        newUsersThisWeek,
        totalConversations,
        directConversations,
        groupConversations,
        channelConversations,
        messagesToday,
        messagesThisWeek,
        messagesThisMonth,
        totalMessages,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isOnline: true } }),
        prisma.user.count({ where: { createdAt: { gte: today } } }),
        prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.conversation.count(),
        prisma.conversation.count({ where: { type: 'DIRECT' } }),
        prisma.conversation.count({ where: { type: 'GROUP' } }),
        prisma.conversation.count({ where: { type: 'CHANNEL' } }),
        prisma.message.count({ where: { createdAt: { gte: today } } }),
        prisma.message.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.message.count({ where: { createdAt: { gte: monthAgo } } }),
        prisma.message.count(),
      ]);

      res.json({
        users: {
          total: totalUsers,
          online: onlineUsers,
          newToday: newUsersToday,
          newThisWeek: newUsersThisWeek,
        },
        conversations: {
          total: totalConversations,
          direct: directConversations,
          group: groupConversations,
          channel: channelConversations,
        },
        messages: {
          today: messagesToday,
          thisWeek: messagesThisWeek,
          thisMonth: messagesThisMonth,
          total: totalMessages,
          avgPerDay: Math.round(messagesThisWeek / 7),
        },
      });
    } catch (error) {
      console.error('Stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
