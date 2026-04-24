import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { emitToConversation } from '../../services/socket';
import { getOrgMemberIds } from '../../middleware/orgScope';

// Type-safe accessors for Announcement model
const db = prisma as any;

// Check if AnnouncementRead table exists (cached after first success, retries on failure)
let readsTableAvailable: boolean | null = null;

async function checkReadsTable(): Promise<boolean> {
  if (readsTableAvailable === true) return true;
  try {
    await db.announcementRead.findFirst({ take: 1 });
    readsTableAvailable = true;
    return true;
  } catch {
    readsTableAvailable = false;
    return false;
  }
}

// Helper: get or create Linda bot user
async function getLindaBotUserId(): Promise<string> {
  const LINDA_EMAIL = 'linda@omnilink.system';
  let lindaUser = await prisma.user.findFirst({ where: { email: LINDA_EMAIL }, select: { id: true } });
  if (!lindaUser) {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(`linda-bot-${Date.now()}-${Math.random()}`, 10);
    lindaUser = await prisma.user.create({
      data: {
        email: LINDA_EMAIL, username: 'linda', displayName: 'Linda AI',
        passwordHash: hash, bio: 'AI Coordinator', isOnline: true,
        status: 'Always here to help!',
      },
      select: { id: true },
    });
  }
  return lindaUser.id;
}

// Helper: Linda sends PM to a user about an announcement
async function lindaNotifyUser(lindaId: string, targetUserId: string, announcement: { title: string; content: string; priority: string; authorName: string }) {
  try {
    // Find or create DM conversation between Linda and target user
    let conversation = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: lindaId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          type: 'DIRECT',
          members: {
            create: [
              { userId: lindaId, role: 'OWNER' },
              { userId: targetUserId, role: 'MEMBER' },
            ],
          },
        },
      });
    }

    const priorityEmoji = announcement.priority === 'URGENT' ? '🚨' : announcement.priority === 'HIGH' ? '⚠️' : '📢';
    const msgContent = `${priorityEmoji} **New Announcement from ${announcement.authorName}**\n\n**${announcement.title}**\n${announcement.content}\n\nPlease check the Public Announcements board and mark it as "Noted" once you've read it.`;

    const newMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: lindaId,
        content: msgContent,
        type: 'TEXT',
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    emitToConversation(conversation.id, 'message:new', {
      id: newMessage.id,
      conversationId: conversation.id,
      senderId: newMessage.sender.id,
      content: newMessage.content,
      type: newMessage.type,
      reactions: {},
      createdAt: newMessage.createdAt,
      sender: newMessage.sender,
    });
  } catch (err) {
    console.error(`[Announcements] Failed to notify user ${targetUserId}:`, err);
  }
}

export class AnnouncementController {
  // POST /api/announcements - Create announcement
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { title, content, priority = 'NORMAL', pinned = false, expiresAt } = req.body;

      // Validate required fields
      if (!title || !content) {
        res.status(400).json({ error: 'Title and content are required' });
        return;
      }

      if (!expiresAt) {
        res.status(400).json({ error: 'Expiration date is required' });
        return;
      }

      // Check if user can announce (OWNER/ADMIN, or no org setup yet)
      const orgMember = await prisma.organizationMember.findFirst({
        where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
      });
      const orgCount = await prisma.organization.count();
      const userMembership = await prisma.organizationMember.findFirst({ where: { userId } });
      const canAnnounce = !!orgMember || orgCount === 0 || !userMembership;

      if (!canAnnounce) {
        res.status(403).json({ error: 'Only OWNER or ADMIN can create announcements' });
        return;
      }

      // Create announcement
      const announcement = await db.announcement.create({
        data: {
          authorId: userId,
          title: title.trim(),
          content: content.trim(),
          priority: priority.toUpperCase(),
          pinned: !!pinned,
          expiresAt: new Date(expiresAt),
          ...(req.orgId && { organizationId: req.orgId }),
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      // Linda notifies all users via PM (async, don't block response)
      this.notifyAllUsersViaLinda(announcement, req).catch(err => {
        console.error('[Announcements] Linda notification error:', err);
      });

      res.status(201).json({
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority,
        pinned: announcement.pinned,
        expiresAt: announcement.expiresAt,
        author: announcement.author,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
      });
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ error: 'Failed to create announcement' });
    }
  }

  // Notify all users via Linda PM
  private async notifyAllUsersViaLinda(announcement: any, req?: Request) {
    const lindaId = await getLindaBotUserId();
    const authorName = announcement.author?.displayName || announcement.author?.username || 'Admin';

    // Only notify users in the same organization
    const orgMemberIds = req ? await getOrgMemberIds(req) : [];
    const excludeIds = [lindaId, announcement.authorId];

    const allUsers = orgMemberIds.length > 0
      ? orgMemberIds
          .filter((id: string) => !excludeIds.includes(id))
          .map((id: string) => ({ id }))
      : await prisma.user.findMany({
          where: {
            id: { notIn: excludeIds },
            email: { not: 'linda@omnilink.system' },
          },
          select: { id: true },
        });

    // Send PM to each user
    for (const user of allUsers) {
      await lindaNotifyUser(lindaId, user.id, {
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority,
        authorName,
      });
    }

    console.log(`[Announcements] Linda notified ${allUsers.length} users about announcement "${announcement.title}"`);
  }

  // GET /api/announcements - Get all non-expired announcements with read status
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const now = new Date();
      const hasReads = await checkReadsTable();

      // Build the query — only include reads if the table exists
      const includeClause: any = {
        author: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        reactions: true,
        _count: { select: { comments: true } },
      };

      if (hasReads) {
        includeClause.reads = {
          select: {
            userId: true,
            noted: true,
            notedAt: true,
            user: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        };
      }

      const announcements = await db.announcement.findMany({
        where: {
          expiresAt: { gt: now },
          // Strictly scope to the current workspace — no global fallback
          ...(req.orgId ? { organizationId: req.orgId } : {}),
        },
        include: includeClause,
        orderBy: [
          { pinned: 'desc' },
          { createdAt: 'desc' },
        ],
      });

      res.json({
        announcements: announcements.map((a: any) => {
          const userRead = hasReads ? a.reads?.find((r: any) => r.userId === userId) : null;
          return {
            id: a.id,
            title: a.title,
            content: a.content,
            priority: a.priority,
            pinned: a.pinned,
            expiresAt: a.expiresAt,
            author: a.author,
            createdAt: a.createdAt,
            updatedAt: a.updatedAt,
            noted: userRead?.noted || false,
            notedAt: userRead?.notedAt || null,
            reads: hasReads ? (a.reads?.map((r: any) => ({
              userId: r.userId,
              noted: r.noted,
              notedAt: r.notedAt,
              user: r.user,
            })) || []) : [],
            likeCount: (a.reactions || []).filter((r: any) => r.type === 'like').length,
            dislikeCount: (a.reactions || []).filter((r: any) => r.type === 'dislike').length,
            userReaction: (a.reactions || []).find((r: any) => r.userId === userId)?.type || null,
            commentCount: a._count?.comments || 0,
          };
        }),
      });
    } catch (error: any) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ error: 'Failed to fetch announcements' });
    }
  }

  // POST /api/announcements/:id/note - Mark announcement as noted
  async noteAnnouncement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      try {
        const read = await db.announcementRead.upsert({
          where: {
            announcementId_userId: {
              announcementId: id,
              userId,
            },
          },
          update: {
            noted: true,
            notedAt: new Date(),
          },
          create: {
            announcementId: id,
            userId,
            noted: true,
            notedAt: new Date(),
          },
        });
        res.json({ success: true, noted: true, notedAt: read.notedAt });
      } catch (err: any) {
        console.warn('[Announcements] AnnouncementRead table not available:', err?.message);
        res.json({ success: true, noted: true, notedAt: new Date().toISOString() });
      }
    } catch (error) {
      console.error('Error noting announcement:', error);
      res.status(500).json({ error: 'Failed to note announcement' });
    }
  }

  // DELETE /api/announcements/:id/note - Unmark announcement as noted
  async unnoteAnnouncement(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      try {
        await db.announcementRead.upsert({
          where: {
            announcementId_userId: {
              announcementId: id,
              userId,
            },
          },
          update: {
            noted: false,
            notedAt: null,
          },
          create: {
            announcementId: id,
            userId,
            noted: false,
          },
        });
      } catch (err: any) {
        console.warn('[Announcements] AnnouncementRead table not available:', err?.message);
      }

      res.json({ success: true, noted: false });
    } catch (error) {
      console.error('Error unnoting announcement:', error);
      res.status(500).json({ error: 'Failed to unnote announcement' });
    }
  }

  // GET /api/announcements/unread-count - Get count of un-noted announcements
  async getUnnotedCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const now = new Date();
      const hasReads = await checkReadsTable();

      let unnotedCount = 0;

      if (hasReads) {
        const allAnnouncements = await db.announcement.findMany({
          where: {
            expiresAt: { gt: now },
          },
          select: {
            id: true,
            reads: {
              where: { userId, noted: true },
              select: { id: true },
            },
          },
        });
        unnotedCount = allAnnouncements.filter((a: any) => !a.reads || a.reads.length === 0).length;
      } else {
        // No reads table — count all non-expired announcements
        unnotedCount = await db.announcement.count({
          where: {
            expiresAt: { gt: now },
          },
        });
      }

      res.json({ count: unnotedCount });
    } catch (error) {
      console.error('Error getting unnoted count:', error);
      res.json({ count: 0 });
    }
  }

  // PUT /api/announcements/:id - Update announcement
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { title, content, priority, pinned, expiresAt } = req.body;

      const announcement = await db.announcement.findUnique({ where: { id } });

      if (!announcement) {
        res.status(404).json({ error: 'Announcement not found' });
        return;
      }

      if (announcement.authorId !== userId) {
        const isOwner = await prisma.organizationMember.findFirst({
          where: { userId, role: 'OWNER' },
        });
        if (!isOwner) {
          res.status(403).json({ error: 'Only author or OWNER can update this announcement' });
          return;
        }
      }

      const updated = await db.announcement.update({
        where: { id },
        data: {
          ...(title && { title: title.trim() }),
          ...(content && { content: content.trim() }),
          ...(priority && { priority: priority.toUpperCase() }),
          ...(pinned !== undefined && { pinned: !!pinned }),
          ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      res.json({
        id: updated.id,
        title: updated.title,
        content: updated.content,
        priority: updated.priority,
        pinned: updated.pinned,
        expiresAt: updated.expiresAt,
        author: updated.author,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('Error updating announcement:', error);
      res.status(500).json({ error: 'Failed to update announcement' });
    }
  }

  // DELETE /api/announcements/:id - Delete announcement
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const announcement = await db.announcement.findUnique({ where: { id } });

      if (!announcement) {
        res.status(404).json({ error: 'Announcement not found' });
        return;
      }

      if (announcement.authorId !== userId) {
        const isOwner = await prisma.organizationMember.findFirst({
          where: { userId, role: 'OWNER' },
        });
        if (!isOwner) {
          res.status(403).json({ error: 'Only author or OWNER can delete this announcement' });
          return;
        }
      }

      await db.announcement.delete({ where: { id } });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      res.status(500).json({ error: 'Failed to delete announcement' });
    }
  }

  // GET /api/announcements/can-announce - Check if user can announce
  async canAnnounce(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Check if user is OWNER or ADMIN in any organization
      const isManager = await prisma.organizationMember.findFirst({
        where: {
          userId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      });

      if (isManager) {
        res.json({ canAnnounce: true });
        return;
      }

      // If no organizations exist at all, allow any user to announce (initial setup)
      const orgCount = await prisma.organization.count();
      if (orgCount === 0) {
        res.json({ canAnnounce: true });
        return;
      }

      // Also allow if user has no org membership (standalone mode)
      const userMembership = await prisma.organizationMember.findFirst({
        where: { userId },
      });
      if (!userMembership) {
        res.json({ canAnnounce: true });
        return;
      }

      res.json({ canAnnounce: false });
    } catch (error) {
      console.error('Error checking announcement permission:', error);
      res.json({ canAnnounce: true }); // Default to true on error for usability
    }
  }

  // POST /api/announcements/:id/react
  async reactToAnnouncement(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { type } = req.body; // 'like' or 'dislike'

      if (!['like', 'dislike'].includes(type)) {
        res.status(400).json({ error: 'Invalid reaction type' });
        return;
      }

      // Check if user already reacted
      const existing = await db.announcementReaction.findUnique({
        where: { announcementId_userId: { announcementId: id, userId } },
      });

      if (existing) {
        if (existing.type === type) {
          // Same reaction = remove it (toggle off)
          await db.announcementReaction.delete({ where: { id: existing.id } });
          res.json({ reaction: null });
          return;
        } else {
          // Different reaction = update
          const updated = await db.announcementReaction.update({
            where: { id: existing.id },
            data: { type },
          });
          res.json({ reaction: updated });
          return;
        }
      }

      // New reaction
      const reaction = await db.announcementReaction.create({
        data: { announcementId: id, userId, type },
      });
      res.json({ reaction });
    } catch (err) {
      console.error('React to announcement error:', err);
      res.status(500).json({ error: 'Failed to react' });
    }
  }

  // GET /api/announcements/:id/comments
  async getComments(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const comments = await db.announcementComment.findMany({
        where: { announcementId: id },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      res.json({ comments });
    } catch (err) {
      console.error('Get comments error:', err);
      res.json({ comments: [] });
    }
  }

  // POST /api/announcements/:id/comments
  async addComment(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.userId;
      const { content } = req.body;

      if (!content?.trim()) {
        res.status(400).json({ error: 'Comment cannot be empty' });
        return;
      }

      const comment = await db.announcementComment.create({
        data: { announcementId: id, userId, content: content.trim() },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
      res.json({ comment });
    } catch (err) {
      console.error('Add comment error:', err);
      res.status(500).json({ error: 'Failed to add comment' });
    }
  }

  // PATCH /api/announcements/:id/comments/:commentId
  async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const { id, commentId } = req.params;
      const userId = req.user!.userId;
      const { content } = req.body;

      if (!content?.trim()) {
        res.status(400).json({ error: 'Comment cannot be empty' });
        return;
      }

      // Only the comment author can edit
      const existing = await db.announcementComment.findFirst({
        where: { id: commentId, announcementId: id, userId },
      });
      if (!existing) {
        res.status(403).json({ error: 'Not authorized to edit this comment' });
        return;
      }

      const updated = await db.announcementComment.update({
        where: { id: commentId },
        data: { content: content.trim() },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });
      res.json({ comment: updated });
    } catch (err) {
      console.error('Update comment error:', err);
      res.status(500).json({ error: 'Failed to update comment' });
    }
  }

  // DELETE /api/announcements/:id/comments/:commentId
  async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const { id, commentId } = req.params;
      const userId = req.user!.userId;
      await db.announcementComment.deleteMany({
        where: { id: commentId, announcementId: id, userId },
      });
      res.json({ success: true });
    } catch (err) {
      console.error('Delete comment error:', err);
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  }
}
