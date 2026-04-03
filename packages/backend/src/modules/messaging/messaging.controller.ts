import { Request, Response } from 'express';
import { prisma } from '../../config/database';

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

      res.json({ conversations });
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
        include: {
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
      const { content, type = 'TEXT', replyToId } = req.body;

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

      await prisma.readReceipt.upsert({
        where: { messageId_userId: { messageId, userId } },
        create: { messageId, userId },
        update: { readAt: new Date() },
      });

      // Update last read timestamp
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
}
