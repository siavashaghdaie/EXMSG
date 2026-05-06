import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { emitToConversation } from '../../services/socket';

export class ChatSettingsController {

  // ============================================
  // CONVERSATION SETTINGS (per-user)
  // ============================================

  // GET /api/conversations/:conversationId/settings
  async getSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member of this conversation' });
        return;
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { disappearingSeconds: true, type: true, name: true },
      });

      res.json({
        isMuted: member.isMuted,
        muteUntil: member.muteUntil,
        isPinned: member.isPinned,
        isLocked: member.isLocked,
        isFavorite: member.isFavorite,
        autoTranslate: member.autoTranslate,
        translateLang: member.translateLang,
        translateMyFrom: member.translateMyFrom,
        translateMyTo: member.translateMyTo,
        customNotificationSound: member.customNotificationSound,
        chatWallpaper: member.chatWallpaper,
        saveMedia: member.saveMedia,
        disappearingSeconds: conversation?.disappearingSeconds ?? null,
      });
    } catch (err) {
      console.error('[ChatSettings] getSettings error:', err);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  }

  // PATCH /api/conversations/:conversationId/settings
  async updateSettings(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;
      const {
        isMuted, muteUntil, isPinned, isLocked, isFavorite,
        autoTranslate, translateLang, translateMyFrom, translateMyTo,
        customNotificationSound, chatWallpaper, saveMedia,
      } = req.body;

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member of this conversation' });
        return;
      }

      const data: any = {};
      if (isMuted !== undefined) data.isMuted = isMuted;
      if (muteUntil !== undefined) data.muteUntil = muteUntil ? new Date(muteUntil) : null;
      if (isPinned !== undefined) data.isPinned = isPinned;
      if (isLocked !== undefined) data.isLocked = isLocked;
      if (isFavorite !== undefined) data.isFavorite = isFavorite;
      if (autoTranslate !== undefined) data.autoTranslate = autoTranslate;
      if (translateLang !== undefined) data.translateLang = translateLang;
      if (translateMyFrom !== undefined) data.translateMyFrom = translateMyFrom;
      if (translateMyTo !== undefined) data.translateMyTo = translateMyTo;
      if (customNotificationSound !== undefined) data.customNotificationSound = customNotificationSound;
      if (chatWallpaper !== undefined) data.chatWallpaper = chatWallpaper;
      if (saveMedia !== undefined) data.saveMedia = saveMedia;

      const updated = await prisma.conversationMember.update({
        where: { id: member.id },
        data,
      });

      res.json(updated);
    } catch (err) {
      console.error('[ChatSettings] updateSettings error:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  }

  // ============================================
  // DISAPPEARING MESSAGES (conversation-level)
  // ============================================

  // PATCH /api/conversations/:conversationId/disappearing
  async setDisappearing(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;
      const { seconds } = req.body; // null = off, 86400 = 24h, 604800 = 7d, 7776000 = 90d

      // Check membership
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member of this conversation' });
        return;
      }

      const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { disappearingSeconds: seconds },
      });

      // Create system message
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
      const label = seconds ? formatDuration(seconds) : 'off';
      await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: 'SYSTEM',
          content: `${user?.displayName} turned ${seconds ? 'on' : 'off'} disappearing messages${seconds ? ` (${label})` : ''}`,
        },
      });

      // Notify members
      emitToConversation(conversationId, 'conversation:updated', {
        conversationId,
        disappearingSeconds: seconds,
      });

      res.json({ disappearingSeconds: conversation.disappearingSeconds });
    } catch (err) {
      console.error('[ChatSettings] setDisappearing error:', err);
      res.status(500).json({ error: 'Failed to update disappearing messages' });
    }
  }

  // ============================================
  // STARRED MESSAGES
  // ============================================

  // POST /api/conversations/:conversationId/stars/:messageId
  async starMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId, messageId } = req.params;

      // Verify membership
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member' });
        return;
      }

      const star = await prisma.starredMessage.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, conversationId, userId },
        update: {},
      });

      res.json(star);
    } catch (err) {
      console.error('[ChatSettings] starMessage error:', err);
      res.status(500).json({ error: 'Failed to star message' });
    }
  }

  // DELETE /api/conversations/:conversationId/stars/:messageId
  async unstarMessage(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { messageId } = req.params;

      await prisma.starredMessage.deleteMany({
        where: { messageId, userId },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('[ChatSettings] unstarMessage error:', err);
      res.status(500).json({ error: 'Failed to unstar message' });
    }
  }

  // GET /api/conversations/:conversationId/stars
  async getStarredMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const stars = await prisma.starredMessage.findMany({
        where: { conversationId, userId },
        include: {
          message: {
            include: {
              sender: { select: { id: true, displayName: true, avatarUrl: true } },
              attachments: true,
            },
          },
        },
        orderBy: { starredAt: 'desc' },
      });

      res.json(stars);
    } catch (err) {
      console.error('[ChatSettings] getStarredMessages error:', err);
      res.status(500).json({ error: 'Failed to get starred messages' });
    }
  }

  // ============================================
  // MEDIA, LINKS & DOCS
  // ============================================

  // GET /api/conversations/:conversationId/media
  async getMedia(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;
      const { type } = req.query; // 'media' | 'links' | 'docs'

      // Verify membership
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member' });
        return;
      }

      let where: any = { conversationId, isDeleted: false };

      if (type === 'media') {
        // Images, videos, and voice/audio messages
        where.OR = [
          { type: { in: ['IMAGE', 'VIDEO', 'VOICE'] } },
          { type: 'FILE', attachments: { some: { mimeType: { startsWith: 'audio/' } } } },
        ];
      } else if (type === 'docs') {
        // Files that are NOT audio (actual documents)
        where.type = 'FILE';
        where.NOT = { attachments: { some: { mimeType: { startsWith: 'audio/' } } } };
      } else if (type === 'links') {
        where.content = { contains: 'http' };
        where.type = 'TEXT';
      }

      const messages = await prisma.message.findMany({
        where,
        include: {
          sender: { select: { id: true, displayName: true, avatarUrl: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Count total by each type
      const mediaCounts = await Promise.all([
        prisma.message.count({
          where: {
            conversationId, isDeleted: false,
            OR: [
              { type: { in: ['IMAGE', 'VIDEO', 'VOICE'] } },
              { type: 'FILE', attachments: { some: { mimeType: { startsWith: 'audio/' } } } },
            ],
          },
        }),
        prisma.message.count({
          where: {
            conversationId, isDeleted: false, type: 'FILE',
            NOT: { attachments: { some: { mimeType: { startsWith: 'audio/' } } } },
          },
        }),
        prisma.message.count({ where: { conversationId, isDeleted: false, type: 'TEXT', content: { contains: 'http' } } }),
      ]);

      res.json({
        messages,
        counts: {
          media: mediaCounts[0],
          docs: mediaCounts[1],
          links: mediaCounts[2],
        },
      });
    } catch (err) {
      console.error('[ChatSettings] getMedia error:', err);
      res.status(500).json({ error: 'Failed to get media' });
    }
  }

  // ============================================
  // BLOCK / REPORT USER
  // ============================================

  // POST /api/users/:targetUserId/block
  async blockUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { targetUserId } = req.params;

      if (userId === targetUserId) {
        res.status(400).json({ error: 'Cannot block yourself' });
        return;
      }

      const block = await prisma.blockedUser.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } },
        create: { blockerId: userId, blockedId: targetUserId, reason: req.body.reason },
        update: {},
      });

      res.json(block);
    } catch (err) {
      console.error('[ChatSettings] blockUser error:', err);
      res.status(500).json({ error: 'Failed to block user' });
    }
  }

  // DELETE /api/users/:targetUserId/block
  async unblockUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { targetUserId } = req.params;

      await prisma.blockedUser.deleteMany({
        where: { blockerId: userId, blockedId: targetUserId },
      });

      res.json({ success: true });
    } catch (err) {
      console.error('[ChatSettings] unblockUser error:', err);
      res.status(500).json({ error: 'Failed to unblock user' });
    }
  }

  // GET /api/users/blocked
  async getBlockedUsers(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const blocked = await prisma.blockedUser.findMany({
        where: { blockerId: userId },
        include: {
          blocked: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
      });

      res.json(blocked);
    } catch (err) {
      console.error('[ChatSettings] getBlockedUsers error:', err);
      res.status(500).json({ error: 'Failed to get blocked users' });
    }
  }

  // POST /api/users/:targetUserId/report
  async reportUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { targetUserId } = req.params;
      const { reason, details } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'Reason is required' });
        return;
      }

      const report = await prisma.reportedUser.create({
        data: {
          reporterId: userId,
          reportedId: targetUserId,
          reason,
          details,
        },
      });

      res.json(report);
    } catch (err) {
      console.error('[ChatSettings] reportUser error:', err);
      res.status(500).json({ error: 'Failed to report user' });
    }
  }

  // ============================================
  // GROUPS IN COMMON
  // ============================================

  // GET /api/users/:targetUserId/common-groups
  async getCommonGroups(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { targetUserId } = req.params;

      // Find group conversations where both users are members
      const myGroups = await prisma.conversationMember.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      const myGroupIds = myGroups.map((g) => g.conversationId);

      const commonGroups = await prisma.conversation.findMany({
        where: {
          id: { in: myGroupIds },
          type: 'GROUP',
          members: { some: { userId: targetUserId } },
        },
        include: {
          members: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      });

      res.json(commonGroups);
    } catch (err) {
      console.error('[ChatSettings] getCommonGroups error:', err);
      res.status(500).json({ error: 'Failed to get common groups' });
    }
  }

  // ============================================
  // CLEAR CHAT
  // ============================================

  // POST /api/conversations/:conversationId/clear
  async clearChat(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      // Verify membership
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member' });
        return;
      }

      // Soft-delete all messages (mark as deleted for this user)
      // For now, we'll actually delete them since we don't have per-user deletion
      await prisma.message.updateMany({
        where: { conversationId },
        data: { isDeleted: true },
      });

      emitToConversation(conversationId, 'chat:cleared', { conversationId, clearedBy: userId });

      res.json({ success: true });
    } catch (err) {
      console.error('[ChatSettings] clearChat error:', err);
      res.status(500).json({ error: 'Failed to clear chat' });
    }
  }

  // ============================================
  // EXPORT CHAT
  // ============================================

  // GET /api/conversations/:conversationId/export
  async exportChat(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      // Verify membership
      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member' });
        return;
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          members: { include: { user: { select: { displayName: true } } } },
        },
      });

      const messages = await prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        include: {
          sender: { select: { displayName: true } },
          attachments: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Format as text
      const chatName = conversation?.name || 'Chat';
      let text = `Chat export: ${chatName}\n`;
      text += `Exported on: ${new Date().toISOString()}\n`;
      text += `Total messages: ${messages.length}\n`;
      text += '─'.repeat(50) + '\n\n';

      for (const msg of messages) {
        const time = new Date(msg.createdAt).toLocaleString();
        const sender = msg.sender.displayName;
        const content = msg.content || (msg.attachments.length > 0 ? `[${msg.type}: ${msg.attachments[0].fileName}]` : `[${msg.type}]`);
        text += `[${time}] ${sender}: ${content}\n`;
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${chatName.replace(/[^a-zA-Z0-9]/g, '_')}_export.txt"`);
      res.send(text);
    } catch (err) {
      console.error('[ChatSettings] exportChat error:', err);
      res.status(500).json({ error: 'Failed to export chat' });
    }
  }

  // ============================================
  // CHAT INFO (combined endpoint for settings page)
  // ============================================

  // GET /api/conversations/:conversationId/info
  async getChatInfo(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const member = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!member) {
        res.status(404).json({ error: 'Not a member' });
        return;
      }

      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true, username: true, displayName: true,
                  avatarUrl: true, email: true, isOnline: true,
                  lastSeenAt: true, bio: true, status: true,
                },
              },
            },
          },
          linkedTask: { select: { id: true, title: true } },
          linkedProject: { select: { id: true, name: true } },
        },
      });

      // Get media counts (media includes images, videos, and audio/voice files)
      const [mediaCount, docCount, linkCount] = await Promise.all([
        prisma.message.count({
          where: {
            conversationId, isDeleted: false,
            OR: [
              { type: { in: ['IMAGE', 'VIDEO', 'VOICE'] } },
              { type: 'FILE', attachments: { some: { mimeType: { startsWith: 'audio/' } } } },
            ],
          },
        }),
        prisma.message.count({
          where: {
            conversationId, isDeleted: false, type: 'FILE',
            NOT: { attachments: { some: { mimeType: { startsWith: 'audio/' } } } },
          },
        }),
        prisma.message.count({ where: { conversationId, isDeleted: false, type: 'TEXT', content: { contains: 'http' } } }),
      ]);

      // Get starred message count
      const starredCount = await prisma.starredMessage.count({
        where: { conversationId, userId },
      });

      // For DM, get the other user and check if blocked
      let otherUser = null;
      let isBlocked = false;
      if (conversation?.type === 'DIRECT') {
        const otherMember = conversation.members.find((m) => m.userId !== userId);
        if (otherMember) {
          otherUser = otherMember.user;
          const blockRecord = await prisma.blockedUser.findUnique({
            where: { blockerId_blockedId: { blockerId: userId, blockedId: otherMember.userId } },
          });
          isBlocked = !!blockRecord;
        }
      }

      // Get common groups for DM
      let commonGroups: any[] = [];
      if (conversation?.type === 'DIRECT' && otherUser) {
        const myGroupIds = (await prisma.conversationMember.findMany({
          where: { userId },
          select: { conversationId: true },
        })).map((g) => g.conversationId);

        commonGroups = await prisma.conversation.findMany({
          where: {
            id: { in: myGroupIds },
            type: 'GROUP',
            members: { some: { userId: otherUser.id } },
          },
          select: {
            id: true, name: true, avatarUrl: true,
            members: {
              include: {
                user: { select: { id: true, displayName: true } },
              },
              take: 4,
            },
          },
        });
      }

      res.json({
        conversation,
        settings: {
          isMuted: member.isMuted,
          muteUntil: member.muteUntil,
          isPinned: member.isPinned,
          isLocked: member.isLocked,
          isFavorite: member.isFavorite,
          autoTranslate: member.autoTranslate,
          translateLang: member.translateLang,
          translateMyFrom: member.translateMyFrom,
          translateMyTo: member.translateMyTo,
          customNotificationSound: member.customNotificationSound,
          chatWallpaper: member.chatWallpaper,
          saveMedia: member.saveMedia,
        },
        mediaCounts: { media: mediaCount, docs: docCount, links: linkCount },
        starredCount,
        otherUser,
        isBlocked,
        commonGroups,
      });
    } catch (err) {
      console.error('[ChatSettings] getChatInfo error:', err);
      res.status(500).json({ error: 'Failed to get chat info' });
    }
  }
}

// Helper: format seconds to human-readable duration
function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)} days`;
  return `${Math.round(seconds / 604800)} weeks`;
}
