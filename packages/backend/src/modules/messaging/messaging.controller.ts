import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { emitToConversation } from '../../services/socket';
import { handleLindaAutoReply } from '../linda/linda.controller';

export class MessagingController {
  // GET /api/conversations
  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const conversations = await prisma.conversation.findMany({
        where: {
          members: { some: { userId } },
          isArchived: false,
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  email: true,
                  isOnline: true,
                },
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              type: true,
              createdAt: true,
              sender: { select: { id: true, displayName: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Calculate unread counts for each conversation
      const conversationsWithUnread = await Promise.all(
        conversations.map(async (conv) => {
          const membership = conv.members.find((m) => m.userId === userId);
          const lastReadAt = membership?.lastReadAt || new Date(0);
          const unreadCount = await prisma.message.count({
            where: {
              conversationId: conv.id,
              createdAt: { gt: lastReadAt },
              senderId: { not: userId },
              isDeleted: false,
            },
          });
          return { ...conv, unreadCount };
        })
      );

      res.json({ conversations: conversationsWithUnread });
    } catch (error) {
      console.error('Get conversations error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/conversations
  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { type, name, memberIds, description } = req.body;

      // For direct messages, check if conversation already exists
      if (type === 'DIRECT' && memberIds.length === 1) {
        const existing = await prisma.conversation.findFirst({
          where: {
            type: 'DIRECT',
            AND: [
              { members: { some: { userId } } },
              { members: { some: { userId: memberIds[0] } } },
            ],
          },
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, username: true, displayName: true, avatarUrl: true },
                },
              },
            },
          },
        });

        if (existing) {
          res.json({ conversation: existing });
          return;
        }
      }

      const allMemberIds = [userId, ...memberIds.filter((id: string) => id !== userId)];

      const conversation = await prisma.conversation.create({
        data: {
          type,
          name: type === 'DIRECT' ? null : name,
          description,
          members: {
            create: allMemberIds.map((id: string, index: number) => ({
              userId: id,
              role: index === 0 ? 'OWNER' : 'MEMBER',
            })),
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
            },
          },
        },
      });

      res.status(201).json({ conversation });
    } catch (error) {
      console.error('Create conversation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/conversations/:conversationId
  async deleteConversation(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      // For DIRECT conversations, archive it (soft delete) for this user
      // For GROUP conversations, remove the member (leave)
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, members: { select: { userId: true } } },
      });

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      if (conversation.type === 'DIRECT') {
        // Archive the conversation so it disappears from the user's list
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { isArchived: true },
        });
      } else {
        // Leave group — remove membership
        await prisma.conversationMember.delete({
          where: { conversationId_userId: { conversationId, userId } },
        });

        // If no members remain, archive the conversation
        const remainingMembers = await prisma.conversationMember.count({
          where: { conversationId },
        });
        if (remainingMembers === 0) {
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isArchived: true },
          });
        }
      }

      res.json({ message: 'Conversation removed' });
    } catch (error) {
      console.error('Delete conversation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/conversations/:conversationId
  async getConversation(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          members: { some: { userId } },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  isOnline: true,
                  lastSeenAt: true,
                },
              },
            },
          },
          pins: {
            include: {
              message: { include: { sender: { select: { displayName: true } } } },
            },
          },
        },
      });

      if (!conversation) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      res.json({ conversation });
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/conversations/:conversationId/messages
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;
      const { cursor, limit = '50' } = req.query;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      const messages = await prisma.message.findMany({
        where: { conversationId, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        ...(cursor ? { cursor: { id: cursor as string }, skip: 1 } : {}),
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          content: true,
          type: true,
          metadata: true,
          isEdited: true,
          createdAt: true,
          updatedAt: true,
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          attachments: true,
          reactions: {
            include: { user: { select: { id: true, displayName: true } } },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              sender: { select: { displayName: true } },
            },
          },
          readReceipts: {
            select: { userId: true, readAt: true },
          },
        },
      });

      res.json({
        messages: messages.reverse(),
        nextCursor: messages.length > 0 ? messages[0].id : null,
      });
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/conversations/:conversationId/messages
  async sendMessage(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;
      const { content, type = 'TEXT', replyToId, storyReply } = req.body;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          type,
          replyToId,
          metadata: storyReply ? JSON.stringify(storyReply) : null,
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          attachments: true,
          replyTo: {
            select: {
              id: true,
              content: true,
              sender: { select: { displayName: true } },
            },
          },
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      res.status(201).json({ message });

      // Emit to conversation room for real-time delivery
      emitToConversation(conversationId, 'message:new', {
        id: message.id,
        conversationId,
        senderId: message.sender.id,
        content: message.content,
        type: message.type,
        metadata: message.metadata,
        reactions: {},
        createdAt: message.createdAt,
        sender: message.sender,
      });

      // Check if Linda is in this conversation and should auto-reply
      handleLindaAutoReply(conversationId, userId, content).catch((err) => {
        console.error('[Linda] Auto-reply hook error:', err);
      });
    } catch (error) {
      console.error('Send message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PUT /api/messages/:messageId
  async editMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user!.userId;
      const { content } = req.body;

      const message = await prisma.message.findUnique({ where: { id: messageId } });

      if (!message || message.senderId !== userId) {
        res.status(403).json({ error: 'Cannot edit this message' });
        return;
      }

      // Enforce 10-minute edit window
      const tenMinutes = 10 * 60 * 1000;
      if (Date.now() - new Date(message.createdAt).getTime() > tenMinutes) {
        res.status(403).json({ error: 'Messages can only be edited within 10 minutes of sending' });
        return;
      }

      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content, isEdited: true },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      res.json({ message: updated });

      // Emit edit event
      emitToConversation(updated.conversationId ?? '', 'message:edited', {
        id: updated.id,
        conversationId: updated.conversationId,
        content: updated.content,
        editedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('Edit message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/messages/:messageId
  async deleteMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user!.userId;

      const message = await prisma.message.findUnique({ where: { id: messageId } });

      if (!message || message.senderId !== userId) {
        res.status(403).json({ error: 'Cannot delete this message' });
        return;
      }

      await prisma.message.update({
        where: { id: messageId },
        data: { isDeleted: true, content: null },
      });

      res.json({ message: 'Message deleted' });

      // Emit delete event
      emitToConversation(message.conversationId, 'message:deleted', {
        id: message.id,
        conversationId: message.conversationId,
      });
    } catch (error) {
      console.error('Delete message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/messages/:messageId/reactions
  async addReaction(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user!.userId;
      const { emoji } = req.body;

      const reaction = await prisma.messageReaction.upsert({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
        create: { messageId, userId, emoji },
        update: {},
      });

      res.status(201).json({ reaction });
    } catch (error) {
      console.error('Add reaction error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/messages/:messageId/reactions/:emoji
  async removeReaction(req: Request, res: Response): Promise<void> {
    try {
      const { messageId, emoji } = req.params;
      const userId = req.user!.userId;

      await prisma.messageReaction.delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });

      res.json({ message: 'Reaction removed' });
    } catch (error) {
      console.error('Remove reaction error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/conversations/:conversationId/read
  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;
      const { messageId } = req.body;

      // Create read receipt for specific message if provided
      if (messageId) {
        await prisma.readReceipt.upsert({
          where: { messageId_userId: { messageId, userId } },
          create: { messageId, userId },
          update: { readAt: new Date() },
        });
      }

      // Also create read receipts for ALL unread messages from others in this conversation
      // This enables WhatsApp-style blue ticks for senders
      const unreadMessages = await prisma.message.findMany({
        where: {
          conversationId,
          senderId: { not: userId },
          isDeleted: false,
          readReceipts: {
            none: { userId },
          },
        },
        select: { id: true },
      });

      if (unreadMessages.length > 0) {
        await prisma.readReceipt.createMany({
          data: unreadMessages.map((m) => ({
            messageId: m.id,
            userId,
          })),
          skipDuplicates: true,
        });

        // Emit read receipt event so sender sees blue ticks in real-time
        const io = req.app.get('io');
        if (io) {
          io.to(`conversation:${conversationId}`).emit('messagesRead', {
            conversationId,
            readByUserId: userId,
            messageIds: unreadMessages.map((m) => m.id),
          });
        }
      }

      // Always update last read timestamp on the conversation membership
      await prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: new Date() },
      });

      res.json({ message: 'Marked as read' });
    } catch (error) {
      console.error('Mark as read error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/messages/search
  async searchMessages(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { query, conversationId, limit = '20' } = req.query;

      if (!query || typeof query !== 'string' || query.trim().length < 2) {
        res.status(400).json({ error: 'Search query must be at least 2 characters' });
        return;
      }

      // Build where clause with OR to search both message content and conversation names
      const where: any = {
        AND: [
          {
            conversation: {
              members: { some: { userId } },
            },
          },
          {
            OR: [
              { content: { contains: query as string, mode: 'insensitive' } },
              { conversation: { name: { contains: query as string, mode: 'insensitive' } } },
            ],
          },
        ],
        isDeleted: false,
      };

      if (conversationId) {
        where.conversationId = conversationId as string;
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          conversation: {
            select: { id: true, name: true, type: true },
          },
        },
      });

      res.json({ messages });
    } catch (error) {
      console.error('Search messages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/conversations/:conversationId/upload
  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const file = req.file;

      // Create message with file attachment
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: `Sent a file: ${file.originalname}`,
          type: 'FILE',
          attachments: {
            create: {
              fileName: file.originalname,
              fileSize: file.size,
              mimeType: file.mimetype,
              url: `/uploads/${file.filename}`,
            },
          },
        },
        include: {
          sender: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          attachments: true,
        },
      });

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      res.status(201).json({ message });

      // Emit to conversation room for real-time delivery
      emitToConversation(conversationId, 'message:new', {
        id: message.id,
        conversationId,
        senderId: message.sender.id,
        content: message.content,
        type: message.type,
        attachments: message.attachments,
        reactions: {},
        createdAt: message.createdAt,
        sender: message.sender,
      });

      // Trigger Linda auto-reply with file context
      handleLindaAutoReply(conversationId, userId, message.content || '', {
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        filePath: file.path,
      }).catch((err) => {
        console.error('[Linda] Auto-reply hook error (file):', err);
      });
    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/conversations/:conversationId/pins
  async pinMessage(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;
      const { messageId } = req.body;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      // Verify message exists and belongs to this conversation
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message || message.conversationId !== conversationId) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      // Create pin
      const pin = await prisma.pinnedMessage.create({
        data: { messageId, conversationId },
        include: {
          message: {
            include: {
              sender: { select: { id: true, displayName: true } },
              replyTo: {
                select: {
                  id: true,
                  content: true,
                  sender: { select: { displayName: true } },
                },
              },
            },
          },
        },
      });

      res.status(201).json({ pin });
    } catch (error) {
      console.error('Pin message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/conversations/:conversationId/pins/:messageId
  async unpinMessage(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId, messageId } = req.params;
      const userId = req.user!.userId;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      await prisma.pinnedMessage.deleteMany({
        where: { conversationId, messageId },
      });

      res.json({ message: 'Message unpinned' });
    } catch (error) {
      console.error('Unpin message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/conversations/:conversationId/pins
  async getPinnedMessages(req: Request, res: Response): Promise<void> {
    try {
      const { conversationId } = req.params;
      const userId = req.user!.userId;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      const pins = await prisma.pinnedMessage.findMany({
        where: { conversationId },
        include: {
          message: {
            include: {
              sender: { select: { id: true, displayName: true } },
              replyTo: {
                select: {
                  id: true,
                  content: true,
                  sender: { select: { displayName: true } },
                },
              },
            },
          },
        },
        orderBy: { pinnedAt: 'desc' },
      });

      res.json({ pins });
    } catch (error) {
      console.error('Get pinned messages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/messages/:messageId/forward
  async forwardMessage(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user!.userId;
      const { targetConversationIds } = req.body;

      if (!Array.isArray(targetConversationIds) || targetConversationIds.length === 0) {
        res.status(400).json({ error: 'targetConversationIds must be a non-empty array' });
        return;
      }

      // Get original message
      const original = await prisma.message.findUnique({
        where: { id: messageId },
        include: { sender: { select: { displayName: true } } },
      });

      if (!original || original.isDeleted) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      const forwarded: any[] = [];
      for (const convId of targetConversationIds) {
        // Verify membership
        const membership = await prisma.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId: convId, userId } },
        });
        if (!membership) continue;

        const msg = await prisma.message.create({
          data: {
            conversationId: convId,
            senderId: userId,
            content: original.content || '',
            type: original.type,
          },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        });
        forwarded.push(msg);
      }

      res.json({ forwarded });
    } catch (error) {
      console.error('Forward message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
