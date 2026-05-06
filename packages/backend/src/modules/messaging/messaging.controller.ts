import { Request, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../config/database';
import { emitToConversation } from '../../services/socket';
import { handleLindaAutoReply } from '../linda/linda.controller';
import { getOrgMemberIds } from '../../middleware/orgScope';
import { translateText, translateTexts, isTranslationAvailable } from '../../services/translationService';
import { transcribeAudio } from '../linda/voiceService';

const execFileAsync = promisify(execFile);

/**
 * Transcode a voice file to mp4/aac for universal playback (iOS Safari can't play webm).
 * Returns the new filename if transcoded, or the original if transcoding fails/not needed.
 */
async function transcodeToMp4(filePath: string, filename: string): Promise<{ filename: string; path: string }> {
  const ext = path.extname(filename).toLowerCase();
  // Only transcode webm/ogg voice files
  if (ext !== '.webm' && ext !== '.ogg') {
    return { filename, path: filePath };
  }

  const newFilename = filename.replace(/\.(webm|ogg)$/i, '.mp4');
  const newPath = filePath.replace(/\.(webm|ogg)$/i, '.mp4');

  try {
    await execFileAsync('ffmpeg', [
      '-i', filePath,
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      newPath,
    ], { timeout: 30000 });

    // Remove original webm file
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }

    console.log(`[Transcode] ${filename} → ${newFilename}`);
    return { filename: newFilename, path: newPath };
  } catch (err) {
    console.error('[Transcode] ffmpeg failed, keeping original:', err);
    return { filename, path: filePath };
  }
}

export class MessagingController {
  // GET /api/conversations
  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const orgId = req.orgId ?? null;

      const conversations = await prisma.conversation.findMany({
        where: {
          isArchived: false,
          ...(orgId
            ? {
                OR: [
                  { organizationId: orgId, members: { some: { userId } } },
                  { isInterPanel: true, members: { some: { userId } } },
                  // Include Linda bot DMs and other org-less conversations
                  { organizationId: null, members: { some: { userId } } },
                ],
              }
            : { members: { some: { userId } } }),
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
              attachments: { select: { id: true, fileName: true, mimeType: true } },
            },
          },
          linkedTask: {
            select: { id: true, title: true, archived: true, deleted: true },
          },
          linkedProject: {
            select: { id: true, name: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Filter out conversations linked to archived or deleted tasks (they're only accessible from the task card)
      const visibleConversations = conversations.filter((conv: any) => {
        if (conv.linkedTask && (conv.linkedTask.archived || conv.linkedTask.deleted)) {
          return false;
        }
        return true;
      });

      // Calculate unread counts for each conversation
      const conversationsWithUnread = await Promise.all(
        visibleConversations.map(async (conv: any) => {
          const membership = conv.members.find((m: any) => m.userId === userId);
          const lastReadAt = membership?.lastReadAt || new Date(0);
          const unreadCount = await prisma.message.count({
            where: {
              conversationId: conv.id,
              createdAt: { gt: lastReadAt },
              senderId: { not: userId },
              isDeleted: false,
            },
          });
          return {
            ...conv,
            unreadCount,
            isFavorite: membership?.isFavorite || false,
            isMuted: membership?.isMuted || false,
            isPinned: membership?.isPinned || false,
          };
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

      // Org-scoping: verify all participants belong to the same organization
      const orgId = req.orgId ?? null;
      if (orgId) {
        const orgMemberIds = await getOrgMemberIds(req);
        const nonOrgParticipants = allMemberIds.filter((id: string) => !orgMemberIds.includes(id));
        if (nonOrgParticipants.length > 0) {
          res.status(403).json({ error: 'All participants must belong to the same organization' });
          return;
        }
      }

      const conversation = await prisma.conversation.create({
        data: {
          type,
          name: type === 'DIRECT' ? null : name,
          description,
          organizationId: orgId,
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

      const orgId = req.orgId ?? null;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          members: { some: { userId } },
          ...(orgId
            ? {
                OR: [
                  { organizationId: orgId },
                  { isInterPanel: true },
                ],
              }
            : {}),
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
          isDeleted: true,
          expiresAt: true,
          isViewOnce: true,
          viewedAt: true,
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

      const reversed = messages.reverse();

      // ── Auto-translate if enabled for this user in this chat ──
      const member = membership as any; // Prisma generated type may lag behind schema
      const autoTranslate = member.autoTranslate === true;
      const translateLang: string | null = member.translateLang ?? null;
      const translateMyFrom: string | null = member.translateMyFrom ?? null;
      const translateMyTo: string | null = member.translateMyTo ?? null;

      if (autoTranslate && isTranslationAvailable() && translateLang) {
        // Collect text messages AND voice messages that need translation
        const toTranslate: { idx: number; text: string; isOwn: boolean; isVoice?: boolean }[] = [];
        for (let i = 0; i < reversed.length; i++) {
          const msg = reversed[i] as any;
          const isOwn = msg.senderId === userId;

          if (msg.type === 'TEXT' && msg.content?.trim()) {
            // Text messages
            if (!isOwn) {
              toTranslate.push({ idx: i, text: msg.content, isOwn: false });
            } else if (translateMyFrom && translateMyTo) {
              toTranslate.push({ idx: i, text: msg.content, isOwn: true });
            }
          } else if (msg.type === 'FILE' && msg.attachments?.some((a: any) => a.mimeType?.startsWith('audio/'))) {
            // Voice/audio messages — check for transcript in metadata
            let voiceTranscript: string | null = null;
            try {
              const meta = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata;
              voiceTranscript = meta?.voiceTranscript || null;
            } catch { /* ignore parse errors */ }

            if (voiceTranscript && !isOwn) {
              toTranslate.push({ idx: i, text: voiceTranscript, isOwn: false, isVoice: true });
            }
          }
        }

        if (toTranslate.length > 0) {
          try {
            // Batch: others first, then own
            const othersItems = toTranslate.filter(t => !t.isOwn);
            const ownItems = toTranslate.filter(t => t.isOwn);

            const [othersResults, ownResults] = await Promise.all([
              othersItems.length > 0
                ? translateTexts(othersItems.map(t => t.text), translateLang)
                : Promise.resolve([]),
              ownItems.length > 0 && translateMyTo
                ? translateTexts(ownItems.map(t => t.text), translateMyTo, translateMyFrom || undefined)
                : Promise.resolve([]),
            ]);

            // Attach translations
            for (let i = 0; i < othersItems.length; i++) {
              const item = othersItems[i];
              const msg = reversed[item.idx] as any;
              const result = othersResults[i];
              if (result && result.translatedText !== item.text) {
                msg.translatedContent = result.translatedText;
                msg.translatedFrom = result.detectedSourceLanguage || null;
                msg.translatedTo = translateLang;
                // For voice messages, also expose the original transcript
                if (item.isVoice) {
                  msg.voiceTranscript = item.text;
                }
              }
            }
            for (let i = 0; i < ownItems.length; i++) {
              const msg = reversed[ownItems[i].idx] as any;
              const result = (ownResults as any[])[i];
              if (result && result.translatedText !== msg.content) {
                msg.translatedContent = result.translatedText;
                msg.translatedFrom = translateMyFrom;
                msg.translatedTo = translateMyTo;
              }
            }
          } catch (err) {
            console.error('[Translation] batch translate error in getMessages:', err);
            // Non-fatal — messages returned without translation
          }
        }
      }

      res.json({
        messages: reversed,
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

      // Check if conversation has disappearing messages enabled
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { disappearingSeconds: true },
      });
      const expiresAt = conversation?.disappearingSeconds
        ? new Date(Date.now() + conversation.disappearingSeconds * 1000)
        : undefined;

      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content,
          type,
          replyToId,
          metadata: storyReply ? JSON.stringify(storyReply) : null,
          ...(expiresAt ? { expiresAt } : {}),
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
        ...(message.expiresAt ? { expiresAt: message.expiresAt } : {}),
        ...(message.isViewOnce ? { isViewOnce: true } : {}),
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

      // Get the message to find its conversationId for socket emission
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true },
      });

      if (message) {
        emitToConversation(message.conversationId, 'reaction:added', {
          userId,
          conversationId: message.conversationId,
          messageId,
          emoji,
        });
      }

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

      // Get the message to find its conversationId for socket emission
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true },
      });

      await prisma.messageReaction.delete({
        where: { messageId_userId_emoji: { messageId, userId, emoji } },
      });

      if (message) {
        emitToConversation(message.conversationId, 'reaction:removed', {
          userId,
          conversationId: message.conversationId,
          messageId,
          emoji,
        });
      }

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
          data: unreadMessages.map((m: any) => ({
            messageId: m.id,
            userId,
          })),
          skipDuplicates: true,
        });

        // Emit read receipt event so sender sees blue ticks in real-time
        emitToConversation(conversationId, 'messagesRead', {
          conversationId,
          readByUserId: userId,
          messageIds: unreadMessages.map((m: any) => m.id),
        });
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

      const orgId = req.orgId ?? null;

      // Build where clause with OR to search both message content and conversation names
      const where: any = {
        AND: [
          {
            conversation: {
              members: { some: { userId } },
              ...(orgId
                ? {
                    OR: [
                      { organizationId: orgId },
                      { isInterPanel: true },
                    ],
                  }
                : {}),
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

      // Transcode voice messages (webm/ogg → mp4) for iOS Safari compatibility
      let finalFilename = file.filename;
      let finalMimeType = file.mimetype;
      let finalSize = file.size;
      let finalOriginalName = file.originalname;
      let finalFilePath = file.path; // Track the actual file path (may change after transcode)

      if (file.mimetype.startsWith('audio/') && /\.(webm|ogg)$/i.test(file.filename)) {
        const result = await transcodeToMp4(file.path, file.filename);
        finalFilename = result.filename;
        finalFilePath = result.path; // Use transcoded path (original webm is deleted by transcode)
        if (finalFilename !== file.filename) {
          finalMimeType = 'audio/mp4';
          finalOriginalName = file.originalname.replace(/\.(webm|ogg)$/i, '.mp4');
          try { finalSize = fs.statSync(result.path).size; } catch { /* keep original size */ }
        }
      }

      // Check for view-once flag from request body (multipart form field)
      const isViewOnce = req.body.viewOnce === 'true' || req.body.viewOnce === true;

      // Check if conversation has disappearing messages enabled
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { disappearingSeconds: true },
      });
      const fileExpiresAt = conv?.disappearingSeconds
        ? new Date(Date.now() + conv.disappearingSeconds * 1000)
        : undefined;

      // Create message with file attachment
      const message = await prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          content: '',
          type: 'FILE',
          isViewOnce,
          ...(fileExpiresAt ? { expiresAt: fileExpiresAt } : {}),
          attachments: {
            create: {
              fileName: finalOriginalName,
              fileSize: finalSize,
              mimeType: finalMimeType,
              url: `/uploads/${finalFilename}`,
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
        ...(message.expiresAt ? { expiresAt: message.expiresAt } : {}),
        ...(message.isViewOnce ? { isViewOnce: true } : {}),
      });

      // Trigger Linda auto-reply with file context
      handleLindaAutoReply(conversationId, userId, message.content || '', {
        fileName: finalOriginalName,
        mimeType: finalMimeType,
        fileSize: finalSize,
        filePath: finalFilePath,
      }).catch((err) => {
        console.error('[Linda] Auto-reply hook error (file):', err);
      });

      // ── Voice transcription for TransGuy translation ──
      // Async: transcribe audio messages so they can be translated
      if (finalMimeType.startsWith('audio/')) {
        (async () => {
          try {
            const transcript = await transcribeAudio(finalFilePath, finalOriginalName);
            if (transcript) {
              // Store transcript in message metadata
              await prisma.message.update({
                where: { id: message.id },
                data: { metadata: JSON.stringify({ voiceTranscript: transcript }) },
              });
              console.log(`[TransGuy] Voice transcribed for message ${message.id}: "${transcript.slice(0, 80)}..."`);

              // Emit event so frontend can translate in real-time
              emitToConversation(conversationId, 'message:voiceTranscribed', {
                id: message.id,
                conversationId,
                voiceTranscript: transcript,
              });
            }
          } catch (err) {
            console.error('[TransGuy] Voice transcription error:', err);
          }
        })();
      }
    } catch (error) {
      console.error('Upload file error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/messages/:messageId/view-once
  async markViewOnce(req: Request, res: Response): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user!.userId;

      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { id: true, conversationId: true, senderId: true, isViewOnce: true, viewedAt: true },
      });

      if (!message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      if (!message.isViewOnce) {
        res.status(400).json({ error: 'Message is not view-once' });
        return;
      }

      // Sender can always view their own media
      if (message.senderId === userId) {
        res.json({ alreadyViewed: false, viewedAt: null });
        return;
      }

      if (message.viewedAt) {
        res.json({ alreadyViewed: true, viewedAt: message.viewedAt });
        return;
      }

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: message.conversationId, userId } },
      });
      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      // Mark as viewed
      const updated = await prisma.message.update({
        where: { id: messageId },
        data: { viewedAt: new Date() },
      });

      // Notify sender that their view-once media was opened
      emitToConversation(message.conversationId, 'message:viewOnceOpened', {
        messageId,
        viewedAt: updated.viewedAt,
      });

      res.json({ alreadyViewed: false, viewedAt: updated.viewedAt });
    } catch (err) {
      console.error('[ViewOnce] markViewOnce error:', err);
      res.status(500).json({ error: 'Failed to mark as viewed' });
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

      // Create or find existing pin (upsert to avoid duplicate errors)
      const pin = await prisma.pinnedMessage.upsert({
        where: { messageId_conversationId: { messageId, conversationId } },
        create: { messageId, conversationId },
        update: {},
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

  // POST /api/translate
  // Body: { text: string, targetLang: string, sourceLang?: string }
  //    OR { texts: string[], targetLang: string, sourceLang?: string }
  async translateMessage(req: Request, res: Response): Promise<void> {
    try {
      if (!isTranslationAvailable()) {
        res.status(503).json({ error: 'Translation service not configured' });
        return;
      }

      const { text, texts, targetLang, sourceLang } = req.body;

      if (!targetLang) {
        res.status(400).json({ error: 'targetLang is required' });
        return;
      }

      if (texts && Array.isArray(texts)) {
        const results = await translateTexts(texts, targetLang, sourceLang);
        res.json({ translations: results });
      } else if (text) {
        const result = await translateText(text, targetLang, sourceLang);
        res.json({ translation: result });
      } else {
        res.status(400).json({ error: 'text or texts[] is required' });
      }
    } catch (error) {
      console.error('Translate error:', error);
      res.status(500).json({ error: 'Translation failed' });
    }
  }
}
