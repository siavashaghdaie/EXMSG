import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { emitToConversation } from '../../services/socket';

// Type-safe accessors for new Prisma models (available after running `npx prisma generate`)
const db = prisma as any;

// Initialize Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[Linda] ANTHROPIC_API_KEY not set — falling back to basic mode');
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

// Linda bot user management
let lindaBotUserId: string | null = null;
const LINDA_EMAIL = 'linda@omnilink.system';

async function getLindaBotUserId(): Promise<string> {
  if (lindaBotUserId) return lindaBotUserId;
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
    console.log('[Linda] Created bot user:', lindaUser.id);
  }
  await prisma.user.update({ where: { id: lindaUser.id }, data: { isOnline: true } }).catch(() => {});
  lindaBotUserId = lindaUser.id;
  return lindaBotUserId;
}

// In-memory fallback for conversation history (used when DB tables don't exist yet)
const userConversations = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
const MAX_HISTORY = 20;
let dbAvailable: boolean | null = null; // null = not checked yet

async function isDbAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await db.lindaConversation.findFirst({ take: 1 });
    dbAvailable = true;
  } catch {
    console.warn('[Linda] Linda DB tables not available — using in-memory fallback. Run: npx prisma migrate dev --name add-linda-conversations');
    dbAvailable = false;
  }
  return dbAvailable;
}

function getUserHistory(userId: string) {
  if (!userConversations.has(userId)) {
    userConversations.set(userId, []);
  }
  return userConversations.get(userId)!;
}

function addToHistory(userId: string, role: 'user' | 'assistant', content: string) {
  const history = getUserHistory(userId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
}

export class LindaController {
  // POST /api/linda/chat
  async chat(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { message, conversationId } = req.body;

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true, email: true },
      });
      const userName = user?.displayName || user?.username || 'there';

      const useDb = await isDbAvailable();
      let lindaConvId: string | null = conversationId || null;

      // Try to persist to DB
      if (useDb) {
        try {
          let lindaConv = lindaConvId
            ? await db.lindaConversation.findFirst({ where: { id: lindaConvId, userId } })
            : null;

          if (!lindaConv) {
            const title = message.length > 60 ? message.slice(0, 57) + '...' : message;
            lindaConv = await db.lindaConversation.create({ data: { userId, title } });
          }
          lindaConvId = lindaConv.id;

          await db.lindaMessage.create({
            data: { conversationId: lindaConvId, role: 'user', content: message },
          });

          // Detect mentioned users
          if (lindaConvId) {
            this.detectAndTagMentionedUsers(lindaConvId, message, userId).catch(() => {});
          }
        } catch (dbErr) {
          console.warn('[Linda] DB write failed, using in-memory:', dbErr);
        }
      }

      // Always maintain in-memory history as fallback
      addToHistory(userId, 'user', message);

      const client = getAnthropicClient();

      if (!client) {
        const response = this.getBasicResponse(message, userName);
        addToHistory(userId, 'assistant', response);
        if (useDb && lindaConvId) {
          try {
            await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'assistant', content: response } });
            await db.lindaConversation.update({ where: { id: lindaConvId }, data: { updatedAt: new Date() } });
          } catch { /* ignore */ }
        }
        res.json({ response, timestamp: new Date().toISOString(), sender: 'linda', conversationId: lindaConvId });
        return;
      }

      // Build messages from DB if available, otherwise use in-memory
      let messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }>;

      if (useDb && lindaConvId) {
        try {
          const dbMessagesDesc = await db.lindaMessage.findMany({
            where: { conversationId: lindaConvId },
            orderBy: { createdAt: 'desc' },
            take: 30,
          });
          messagesForApi = dbMessagesDesc.reverse().map((msg: any) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }));
        } catch {
          messagesForApi = getUserHistory(userId);
        }
      } else {
        messagesForApi = getUserHistory(userId);
      }

      const workspaceContext = await this.getWorkspaceContext(userId);
      const systemPrompt = this.buildSystemPrompt(userName, workspaceContext);

      // Ensure conversation ends with user role (required by claude-sonnet-4-6)
      while (messagesForApi.length > 0 && messagesForApi[messagesForApi.length - 1].role !== 'user') {
        messagesForApi.pop();
      }

      if (messagesForApi.length === 0) {
        messagesForApi.push({ role: 'user', content: message });
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: systemPrompt,
        messages: messagesForApi,
      });

      const textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
      const rawResponseText = textBlock ? textBlock.text : 'Sorry, I could not process that. Please try again.';

      // Execute any action blocks (send messages, etc.)
      const actions = await this.executeActions(rawResponseText, userId);

      // Strip action blocks from the visible response
      const cleanResponse = this.stripActionBlocks(rawResponseText);

      // Save CLEAN response to history and DB (prevents poisoning)
      addToHistory(userId, 'assistant', cleanResponse);

      if (useDb && lindaConvId) {
        try {
          await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'assistant', content: cleanResponse } });
          await db.lindaConversation.update({ where: { id: lindaConvId }, data: { updatedAt: new Date() } });
          this.detectAndTagMentionedUsers(lindaConvId, cleanResponse, userId).catch(() => {});
        } catch { /* ignore */ }
      }

      res.json({
        response: cleanResponse,
        timestamp: new Date().toISOString(),
        sender: 'linda',
        conversationId: lindaConvId,
        actions: actions.length > 0 ? actions : undefined,
      });
    } catch (error: any) {
      console.error('[Linda] Chat error status:', error?.status, 'message:', error?.message);
      console.error('[Linda] Full error:', JSON.stringify(error?.error || error?.body || error, null, 2));
      if (error?.status === 401) {
        res.status(500).json({ error: 'Linda AI configuration error. Please check your API key.' });
        return;
      }
      if (error?.status === 429) {
        res.status(429).json({ error: 'Linda is a bit busy right now. Please try again in a moment.' });
        return;
      }
      if (error?.status === 404 || error?.message?.includes('not_found_error')) {
        res.status(500).json({ error: 'Linda AI model not available. Please contact admin.' });
        return;
      }
      res.status(500).json({ error: 'Linda is temporarily unavailable. Please try again.' });
    }
  }

  // POST /api/linda/chat/file
  async chatWithFile(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const message = req.body.message || '';
      const reqConversationId = req.body.conversationId;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true, email: true },
      });
      const userName = user?.displayName || user?.username || 'there';

      const useDb = await isDbAvailable();
      let lindaConvId: string | null = reqConversationId || null;

      if (useDb) {
        try {
          let lindaConv = lindaConvId
            ? await db.lindaConversation.findFirst({ where: { id: lindaConvId, userId } })
            : null;
          if (!lindaConv) {
            const title = message
              ? (message.length > 60 ? message.slice(0, 57) + '...' : message)
              : `File: ${file.originalname}`;
            lindaConv = await db.lindaConversation.create({ data: { userId, title } });
          }
          lindaConvId = lindaConv.id;
        } catch { /* ignore */ }
      }

      const client = getAnthropicClient();

      if (!client) {
        const response = `Thanks for sharing that file, ${userName}. My full AI capabilities are not yet configured. Please ask your administrator to add the ANTHROPIC_API_KEY to enable file analysis.`;
        if (useDb && lindaConvId) {
          try {
            await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'user', content: message || `Sent file: ${file.originalname}`, hasAttachment: true, attachmentName: file.originalname } });
            await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'assistant', content: response } });
          } catch { /* ignore */ }
        }
        res.json({ response, timestamp: new Date().toISOString(), sender: 'linda', conversationId: lindaConvId });
        return;
      }

      const workspaceContext = await this.getWorkspaceContext(userId);
      const fileInfo = `[User shared a file: "${file.originalname}" (${file.mimetype}, ${(file.size / 1024).toFixed(1)} KB)]`;
      const userContent = message ? `${fileInfo}\n\nUser's message: ${message}` : fileInfo;

      // Save user message
      addToHistory(userId, 'user', userContent);
      if (useDb && lindaConvId) {
        try {
          await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'user', content: userContent, hasAttachment: true, attachmentName: file.originalname } });
        } catch { /* ignore */ }
      }

      const isImage = file.mimetype.startsWith('image/');
      let responseText: string;

      if (isImage) {
        const fs = await import('fs');
        const imageData = fs.readFileSync(file.path);
        const base64 = imageData.toString('base64');
        const mediaType = file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

        const history = getUserHistory(userId);
        const systemPrompt = this.buildSystemPrompt(userName, workspaceContext);

        const messagesForApi: any[] = history.slice(0, -1).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        }));

        messagesForApi.push({
          role: 'user' as const,
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: message || 'The user shared this image. Please describe what you see and ask if they need help with it.' },
          ],
        });

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: messagesForApi,
        });

        const textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
        responseText = textBlock ? textBlock.text : 'I received the image but could not analyze it.';
        fs.unlinkSync(file.path);
      } else {
        // For non-image files
        let contentForClaude = userContent;
        const textTypes = ['text/', 'application/json', 'application/xml', 'text/csv'];
        if (textTypes.some(t => file.mimetype.includes(t)) || file.originalname.endsWith('.txt') || file.originalname.endsWith('.csv')) {
          try {
            const fs = await import('fs');
            const content = fs.readFileSync(file.path, 'utf-8').slice(0, 4000);
            contentForClaude = `${fileInfo}\n\nFile contents (first 4000 chars):\n${content}\n\nUser's message: ${message || 'Please analyze this file.'}`;
            fs.unlinkSync(file.path);
          } catch { /* fall through */ }
        }

        const history = getUserHistory(userId);
        const systemPrompt = this.buildSystemPrompt(userName, workspaceContext);

        const messagesForApi = history.map((msg: any, idx: number) => ({
          role: msg.role as 'user' | 'assistant',
          content: idx === history.length - 1 && msg.role === 'user' ? contentForClaude : msg.content,
        }));

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: messagesForApi,
        });

        const textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
        responseText = textBlock ? textBlock.text : 'I received your file but could not generate a response.';
      }

      addToHistory(userId, 'assistant', responseText);
      if (useDb && lindaConvId) {
        try {
          await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'assistant', content: responseText } });
          await db.lindaConversation.update({ where: { id: lindaConvId }, data: { updatedAt: new Date() } });
        } catch { /* ignore */ }
      }

      res.json({ response: responseText, timestamp: new Date().toISOString(), sender: 'linda', conversationId: lindaConvId });
    } catch (error: any) {
      console.error('Linda file chat error:', error);
      if (error?.status === 429) {
        res.status(429).json({ error: 'Linda is a bit busy right now. Please try again in a moment.' });
        return;
      }
      res.status(500).json({ error: 'Linda could not process the file. Please try again.' });
    }
  }

  // GET /api/linda/conversations — user's conversations (own + related)
  async getConversations(req: Request, res: Response): Promise<void> {
    try {
      const useDb = await isDbAvailable();
      if (!useDb) {
        res.json({ conversations: [] });
        return;
      }

      const userId = req.user!.userId;

      // Only show conversations owned by this user (privacy: no leaking other users' Linda activities)
      const conversations = await db.lindaConversation.findMany({
        where: { userId },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const result = conversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || 'New conversation',
        isOwn: conv.userId === userId,
        ownerName: conv.user.displayName || conv.user.username,
        ownerAvatar: conv.user.avatarUrl,
        lastMessage: conv.messages[0]
          ? { content: conv.messages[0].content.slice(0, 100), role: conv.messages[0].role, createdAt: conv.messages[0].createdAt }
          : null,
        messageCount: conv._count.messages,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }));

      res.json({ conversations: result });
    } catch (error) {
      console.error('Error fetching Linda conversations:', error);
      res.json({ conversations: [] });
    }
  }

  // GET /api/linda/conversations/all — manager: all Linda conversations
  async getAllConversations(req: Request, res: Response): Promise<void> {
    try {
      const useDb = await isDbAvailable();
      if (!useDb) {
        res.json({ conversations: [] });
        return;
      }

      const userId = req.user!.userId;

      const isManager = await prisma.organizationMember.findFirst({
        where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
      });

      if (!isManager) {
        res.status(403).json({ error: 'Only managers can view all conversations' });
        return;
      }

      const conversations = await db.lindaConversation.findMany({
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, role: true, createdAt: true },
          },
          relatedUsers: {
            include: {
              user: { select: { id: true, username: true, displayName: true } },
            },
          },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const result = conversations.map((conv: any) => ({
        id: conv.id,
        title: conv.title || 'New conversation',
        ownerName: conv.user.displayName || conv.user.username,
        ownerEmail: conv.user.email,
        ownerAvatar: conv.user.avatarUrl,
        relatedUsers: conv.relatedUsers.map((ru: any) => ({
          id: ru.user.id,
          name: ru.user.displayName || ru.user.username,
        })),
        lastMessage: conv.messages[0]
          ? { content: conv.messages[0].content.slice(0, 100), role: conv.messages[0].role, createdAt: conv.messages[0].createdAt }
          : null,
        messageCount: conv._count.messages,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      }));

      res.json({ conversations: result });
    } catch (error) {
      console.error('Error fetching all Linda conversations:', error);
      res.json({ conversations: [] });
    }
  }

  // GET /api/linda/conversations/:id/messages
  async getConversationMessages(req: Request, res: Response): Promise<void> {
    try {
      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(404).json({ error: 'Conversation storage not available yet' });
        return;
      }

      const userId = req.user!.userId;
      const { id } = req.params;

      const conv = await db.lindaConversation.findUnique({
        where: { id },
        include: {
          relatedUsers: true,
          user: { select: { id: true, displayName: true, username: true } },
        },
      });

      if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }

      const isOwner = conv.userId === userId;
      const isRelated = conv.relatedUsers.some((ru: any) => ru.userId === userId);
      const isManager = await prisma.organizationMember.findFirst({
        where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
      });

      if (!isOwner && !isRelated && !isManager) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const messages = await db.lindaMessage.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
      });

      res.json({
        conversation: {
          id: conv.id,
          ownerName: conv.user.displayName || conv.user.username,
          isOwn: conv.userId === userId,
        },
        messages: messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          hasAttachment: m.hasAttachment,
          attachmentName: m.attachmentName,
          createdAt: m.createdAt,
        })),
      });
    } catch (error) {
      console.error('Error fetching Linda conversation messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }

  // Check if user is a manager
  async checkManager(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const isManager = await prisma.organizationMember.findFirst({
        where: { userId, role: { in: ['OWNER', 'ADMIN'] } },
      });
      res.json({ isManager: !!isManager });
    } catch {
      res.json({ isManager: false });
    }
  }

  // GET /api/linda/greeting
  async getGreeting(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true },
      });

      const userName = user?.displayName || user?.username || 'there';
      const hour = new Date().getHours();
      const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

      // Clear in-memory history for fresh start
      userConversations.delete(userId);

      res.json({
        greeting: `${greeting}, ${userName}! I'm Linda, your AI secretary. How can I help you today?`,
        suggestions: [
          'Give me a workspace briefing',
          'Help me draft a message',
          'What tasks are pending?',
          'Summarize my recent conversations',
        ],
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Linda greeting error:', error);
      res.status(500).json({ error: 'Linda is temporarily unavailable' });
    }
  }

  // Detect @mentions or user names in message and tag the conversation
  private async detectAndTagMentionedUsers(conversationId: string, text: string, excludeUserId: string): Promise<void> {
    try {
      const lowerText = text.toLowerCase();

      const allUsers = await prisma.user.findMany({
        where: { id: { not: excludeUserId } },
        select: { id: true, username: true, displayName: true },
      });

      const mentionedUserIds: string[] = [];

      for (const u of allUsers) {
        if (u.username && lowerText.includes(`@${u.username.toLowerCase()}`)) {
          mentionedUserIds.push(u.id);
          continue;
        }
        if (u.displayName && u.displayName.length >= 3 && lowerText.includes(u.displayName.toLowerCase())) {
          mentionedUserIds.push(u.id);
          continue;
        }
        if (u.username && u.username.length >= 3 && lowerText.includes(u.username.toLowerCase())) {
          mentionedUserIds.push(u.id);
        }
      }

      for (const uid of mentionedUserIds) {
        await db.lindaConversationRelatedUser.upsert({
          where: { conversationId_userId: { conversationId, userId: uid } },
          create: { conversationId, userId: uid },
          update: {},
        });
      }
    } catch (error) {
      console.error('Error detecting mentioned users:', error);
    }
  }

  // Execute action blocks parsed from Linda's AI response
  private async executeActions(responseText: string, requestingUserId: string): Promise<Array<{ type: string; target: string; status: string }>> {
    const actions: Array<{ type: string; target: string; status: string }> = [];

    // Parse [SEND_MESSAGE] blocks
    const sendMsgRegex = /\[SEND_MESSAGE\]\s*to:\s*@?(\S+)\s*\nmessage:\s*([\s\S]*?)\[\/SEND_MESSAGE\]/gi;
    let match;

    while ((match = sendMsgRegex.exec(responseText)) !== null) {
      const targetUsername = match[1].trim();
      const messageContent = match[2].trim();

      try {
        const lindaId = await getLindaBotUserId();

        // Find target user
        const targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              { username: { equals: targetUsername, mode: 'insensitive' } },
              { displayName: { equals: targetUsername, mode: 'insensitive' } },
            ],
          },
          select: { id: true, username: true, displayName: true },
        });

        if (!targetUser) {
          console.warn(`[Linda] Could not find user: ${targetUsername}`);
          actions.push({ type: 'send_message', target: targetUsername, status: 'user_not_found' });
          continue;
        }

        // Find or create DM conversation between Linda and target user
        let conversation = await prisma.conversation.findFirst({
          where: {
            type: 'DIRECT',
            AND: [
              { members: { some: { userId: lindaId } } },
              { members: { some: { userId: targetUser.id } } },
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
                  { userId: targetUser.id, role: 'MEMBER' },
                ],
              },
            },
          });
          console.log(`[Linda] Created DM conversation with ${targetUser.username}: ${conversation.id}`);
        }

        // Create the message from Linda
        const newMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: lindaId,
            content: messageContent,
            type: 'TEXT',
          },
          include: {
            sender: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        });

        // Update conversation timestamp
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { updatedAt: new Date() },
        });

        // Emit via socket so recipient sees it in real-time
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

        console.log(`[Linda] Sent message to @${targetUser.username} in conversation ${conversation.id}`);
        actions.push({ type: 'send_message', target: `@${targetUser.username}`, status: 'sent' });
      } catch (err) {
        console.error(`[Linda] Failed to send message to ${targetUsername}:`, err);
        actions.push({ type: 'send_message', target: targetUsername, status: 'error' });
      }
    }

    return actions;
  }

  // Strip action blocks from response text before saving/displaying
  private stripActionBlocks(text: string): string {
    return text
      .replace(/\[SEND_MESSAGE\][\s\S]*?\[\/SEND_MESSAGE\]/gi, '')
      .replace(/\[ASSIGN_TASK\][\s\S]*?\[\/ASSIGN_TASK\]/gi, '')
      .replace(/\[ANNOUNCE\][\s\S]*?\[\/ANNOUNCE\]/gi, '')
      .trim();
  }

  // Build system prompt
  private buildSystemPrompt(userName: string, workspaceContext: string): string {
    return `You are Linda, an AI coordinator for OmniLink Messenger. You work for ${userName}.

RESPONSE STYLE:
- Be extremely concise. 1-2 sentences max for simple actions.
- After performing an action, just confirm briefly: "Done, sent your message to @user." or "Got it, I'll let @user know."
- No unnecessary commentary, no quoting the message content back, no long explanations.
- Sound natural and human — like a sharp executive assistant, not a chatbot.

ACTION BLOCKS:
When the user asks you to send a message to someone, include an action block in your response. The block will be parsed and executed automatically — it will NOT be shown to the user.

Format for sending a message:
[SEND_MESSAGE]
to: @username
message: Your natural, human-like message here
[/SEND_MESSAGE]

Rules for message content:
- Write messages as if YOU (Linda) are writing naturally to the recipient
- Sound human: "Hey! ${userName} wanted me to let you know he'd like to meet in his office when you get a chance."
- NEVER use robotic formats like "Message from ${userName}: ..." or sign with "— Linda AI"
- NEVER include the action block syntax in your visible reply to the user
- You can use the recipient's first name or @username naturally

Current workspace context:
${workspaceContext}

Guidelines:
- Address ${userName} by name occasionally
- If you don't know something, say so briefly
- Never make up data`;
  }

  // Gather workspace context
  private async getWorkspaceContext(userId: string): Promise<string> {
    try {
      const parts: string[] = [];

      const conversations = await prisma.conversation.findMany({
        where: { members: { some: { userId } }, isArchived: false },
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, displayName: true, isOnline: true } },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            where: { isDeleted: false },
            select: { content: true, createdAt: true, sender: { select: { displayName: true } } },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      });

      if (conversations.length > 0) {
        const convSummaries = conversations.map(c => {
          const otherMembers = c.members
            .filter(m => m.userId !== userId)
            .map(m => m.user.displayName || m.user.username)
            .join(', ');
          const lastMsg = c.messages[0];
          const lastMsgInfo = lastMsg
            ? ` (last message from ${lastMsg.sender?.displayName || 'Unknown'}: "${(lastMsg.content || '').slice(0, 60)}")`
            : ' (no messages yet)';
          return `- ${c.name || otherMembers || 'Unnamed'}${lastMsgInfo}`;
        });
        parts.push(`Recent conversations:\n${convSummaries.join('\n')}`);
      }

      const onlineUsers = await prisma.user.findMany({
        where: { isOnline: true, id: { not: userId } },
        select: { displayName: true, username: true },
        take: 20,
      });

      if (onlineUsers.length > 0) {
        const names = onlineUsers.map(u => `${u.displayName || u.username} (@${u.username})`).join(', ');
        parts.push(`Online team members: ${names}`);
      }

      const allUsers = await prisma.user.findMany({
        where: { id: { not: userId } },
        select: { username: true, displayName: true },
        take: 50,
      });

      if (allUsers.length > 0) {
        const userList = allUsers.map(u => `@${u.username} (${u.displayName})`).join(', ');
        parts.push(`All team members: ${userList}`);
      }

      return parts.length > 0 ? parts.join('\n\n') : 'No workspace data available yet.';
    } catch (error) {
      console.error('Error gathering workspace context:', error);
      return 'Unable to load workspace context.';
    }
  }

  // Basic fallback
  private getBasicResponse(message: string, userName: string): string {
    const lowerMsg = message.toLowerCase().trim();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Greetings
    if (!message || /^(hi|hello|hey|yo|sup|greetings|good morning|good afternoon|good evening|salam|salaam)$/i.test(lowerMsg)) {
      return `${greeting}, ${userName}! I'm Linda, your AI workplace assistant. Here's what I can help you with:

• **Tasks** — Ask me about your tasks, deadlines, or to help organize your work
• **Messages** — I can help you draft messages or summarize conversations
• **Navigation** — Ask about features in OmniLink Messenger
• **Team** — I can help with contacts and team coordination

Just type your question and I'll do my best to help! For my full AI capabilities, your administrator can configure the Anthropic API key.`;
    }

    // Help / what can you do
    if (lowerMsg.includes('help') || lowerMsg.includes('what can you do') || lowerMsg.includes('what do you do') || lowerMsg.includes('features')) {
      return `Here's what I can help with, ${userName}:

**Workspace Navigation:**
• Settings — Click the gear icon or go to Settings tab
• Tasks — Use the clipboard icon or Tasks tab to manage your work
• Announcements — Check the bell icon for company news
• Stories — Click the + button by your avatar to share updates
• Contacts — Find and message your colleagues

**Task Management:**
• View your assigned tasks in the Tasks section
• Create new tasks and assign them to team members
• Track task progress (Not Started → In Progress → Review → Complete)

**Tips:**
• Use the search bar to find conversations quickly
• Set your status through Stories to keep your team updated
• Check Announcements regularly for important company updates

Need anything specific? Just ask!`;
    }

    // Tasks related
    if (lowerMsg.includes('task') || lowerMsg.includes('todo') || lowerMsg.includes('deadline') || lowerMsg.includes('assign')) {
      return `About your tasks, ${userName}:

You can manage tasks by clicking the **clipboard icon** in the sidebar or the **Tasks** tab on mobile. From there you can:

• **View tasks** assigned to you or that you created
• **Create new tasks** with title, description, priority, and deadline
• **Assign tasks** to other team members using the assignee search
• **Track progress** by updating status (Not Started → In Progress → Pending Review → Completed)
• **Set priorities** — Low, Medium, High, or Critical

To create a task for someone, click the **+ New Task** button and search for their name in the "Assign To" field.

Would you like help with anything else?`;
    }

    // Messages / chat related
    if (lowerMsg.includes('message') || lowerMsg.includes('chat') || lowerMsg.includes('conversation') || lowerMsg.includes('send')) {
      return `About messaging in OmniLink, ${userName}:

• **Start a new chat** — Click the "New Chat" button in the sidebar
• **Search conversations** — Use the search bar at the top
• **Send files** — Click the paperclip icon in the message composer
• **Voice/Camera** — Long-press the mic or camera icon on mobile
• **Read receipts** — ✓ sent, ✓✓ delivered, blue ✓✓ read

Your conversations are end-to-end encrypted and secure within your organization's network.`;
    }

    // Settings
    if (lowerMsg.includes('setting') || lowerMsg.includes('profile') || lowerMsg.includes('theme') || lowerMsg.includes('dark mode') || lowerMsg.includes('notification')) {
      return `About settings, ${userName}:

Go to **Settings** (gear icon) to manage:

• **Profile** — Update your display name, avatar, and bio
• **Notifications** — Toggle sound, desktop notifications
• **Privacy** — Control online status, read receipts, last seen
• **Appearance** — Switch between Light, Dark, or System theme
• **About** — App version and information

You can access Settings from the sidebar gear icon or the Settings tab on mobile.`;
    }

    // Status / stories
    if (lowerMsg.includes('story') || lowerMsg.includes('stories') || lowerMsg.includes('status')) {
      return `About Stories in OmniLink, ${userName}:

Stories let you share quick updates with your team:

• **Add a story** — Click the **+** button next to your avatar
• **Text stories** — Write a message with a colored background
• **Photo stories** — Share an image with an optional caption
• **View stories** — Click on a colleague's avatar with the green ring
• Stories expire automatically after 24 hours

Your profile avatar will show a **green ring** when you have an active story.`;
    }

    // Announcements
    if (lowerMsg.includes('announcement') || lowerMsg.includes('news') || lowerMsg.includes('bulletin')) {
      return `About Announcements, ${userName}:

The announcements board is for important company-wide updates:

• **View** — Click the bell icon in the sidebar header or News tab on mobile
• **Create** — Admins and owners can create announcements with different priority levels
• **Priority levels** — Low (green), Normal (blue), High (amber), Urgent (red)
• **Pin** — Important announcements can be pinned to stay at the top

The bell icon shows a **red badge** when there are new announcements.`;
    }

    // Thank you
    if (lowerMsg.includes('thank') || lowerMsg.includes('thanks') || lowerMsg.includes('thx')) {
      return `You're welcome, ${userName}! I'm always here to help. Just let me know if you need anything else! 😊`;
    }

    // Who are you
    if (lowerMsg.includes('who are you') || lowerMsg.includes('your name') || lowerMsg.includes('about you')) {
      return `I'm **Linda**, your AI workplace assistant built into OmniLink Messenger! I'm here to help you navigate the platform, manage tasks, and stay productive.

Currently I'm running in **basic assistant mode**. When the Anthropic API key is configured by your administrator, I'll be able to have much more intelligent conversations, analyze documents, draft messages, and more.

Even in basic mode, I can guide you through all of OmniLink's features — just ask!`;
    }

    // Default — be helpful rather than just saying "API key not configured"
    return `I understand you're asking about "${message.length > 50 ? message.slice(0, 47) + '...' : message}", ${userName}.

I'm currently in basic assistant mode and can help with:
• **Workspace navigation** — How to use OmniLink features
• **Task management** — Creating and managing tasks
• **Messaging tips** — Chat, files, and communication
• **Settings & profile** — Customizing your experience

For more advanced assistance (document analysis, intelligent drafting, complex questions), ask your admin to configure the Anthropic API key.

Try asking me things like "help", "how do tasks work", or "tell me about stories"!`;
  }
}

/**
 * Hook for regular messaging: when a message is sent in a conversation where Linda is a member,
 * this generates an AI response and sends it as a regular message from Linda.
 */
export async function handleLindaAutoReply(conversationId: string, senderUserId: string, messageContent: string): Promise<void> {
  try {
    const lindaId = await getLindaBotUserId();

    // Don't reply to our own messages
    if (senderUserId === lindaId) return;

    // Check if Linda is a member of this conversation
    const lindaMembership = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: lindaId } },
    });
    if (!lindaMembership) return;

    const sender = await prisma.user.findUnique({
      where: { id: senderUserId },
      select: { displayName: true, username: true },
    });
    const senderName = sender?.displayName || sender?.username || 'there';

    const client = getAnthropicClient();
    if (!client) {
      // Basic fallback — just acknowledge
      const fallback = `Hi ${senderName}! I'm Linda, your AI coordinator. My AI capabilities aren't fully configured yet — please ask your admin to set the API key.`;
      await sendLindaMessageToConversation(lindaId, conversationId, fallback);
      return;
    }

    // Build conversation history from the MOST RECENT messages in this conversation
    // Fetch in desc order to get latest, then reverse so they're chronological for Claude
    const recentMessagesDesc = await prisma.message.findMany({
      where: { conversationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { sender: { select: { id: true, displayName: true, username: true } } },
    });
    const recentMessages = recentMessagesDesc.reverse();

    // Convert to Claude API format
    const messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const msg of recentMessages) {
      const role = msg.senderId === lindaId ? 'assistant' : 'user';
      const content = msg.content || '';
      if (!content.trim()) continue;

      // Merge consecutive same-role messages
      if (messagesForApi.length > 0 && messagesForApi[messagesForApi.length - 1].role === role) {
        messagesForApi[messagesForApi.length - 1].content += '\n' + content;
      } else {
        messagesForApi.push({ role, content });
      }
    }

    // Ensure conversation ends with user role
    while (messagesForApi.length > 0 && messagesForApi[messagesForApi.length - 1].role !== 'user') {
      messagesForApi.pop();
    }
    if (messagesForApi.length === 0) {
      messagesForApi.push({ role: 'user', content: messageContent });
    }

    console.log(`[Linda] Sending ${messagesForApi.length} messages to Claude API. Last user msg: "${messagesForApi[messagesForApi.length - 1]?.content?.slice(0, 80)}"`);

    // Build workspace context and system prompt
    const lindaController = new LindaController();
    const workspaceContext = await (lindaController as any).getWorkspaceContext(senderUserId);
    const systemPrompt = (lindaController as any).buildSystemPrompt(senderName, workspaceContext);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: messagesForApi,
    });

    const textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
    const rawResponse = textBlock ? textBlock.text : "Sorry, I couldn't process that. Try again?";

    // Execute any action blocks (send messages to other users, etc.)
    await (lindaController as any).executeActions(rawResponse, senderUserId);

    // Strip action blocks from visible response
    const cleanResponse = rawResponse
      .replace(/\[SEND_MESSAGE\][\s\S]*?\[\/SEND_MESSAGE\]/gi, '')
      .replace(/\[ASSIGN_TASK\][\s\S]*?\[\/ASSIGN_TASK\]/gi, '')
      .replace(/\[ANNOUNCE\][\s\S]*?\[\/ANNOUNCE\]/gi, '')
      .trim();

    if (cleanResponse) {
      await sendLindaMessageToConversation(lindaId, conversationId, cleanResponse);
    }
  } catch (error) {
    console.error('[Linda] Auto-reply error:', error);
  }
}

/** Mark all messages in a conversation as read by Linda (so sender sees blue ticks) */
async function markMessagesAsReadByLinda(lindaId: string, conversationId: string): Promise<void> {
  try {
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: lindaId },
        isDeleted: false,
        readReceipts: { none: { userId: lindaId } },
      },
      select: { id: true },
    });

    if (unreadMessages.length > 0) {
      await prisma.readReceipt.createMany({
        data: unreadMessages.map((m) => ({ messageId: m.id, userId: lindaId })),
        skipDuplicates: true,
      });

      // Emit so sender's UI updates ticks to blue in real-time
      emitToConversation(conversationId, 'messagesRead', {
        conversationId,
        readByUserId: lindaId,
        messageIds: unreadMessages.map((m) => m.id),
      });
    }

    // Update Linda's lastReadAt
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: lindaId } },
      data: { lastReadAt: new Date() },
    }).catch(() => {});
  } catch (err) {
    console.error('[Linda] Failed to mark messages as read:', err);
  }
}

/** Send a regular message from Linda into a conversation */
async function sendLindaMessageToConversation(lindaId: string, conversationId: string, content: string): Promise<void> {
  // Linda "reads" all messages before replying
  await markMessagesAsReadByLinda(lindaId, conversationId);

  const newMessage = await prisma.message.create({
    data: {
      conversationId,
      senderId: lindaId,
      content,
      type: 'TEXT',
    },
    include: {
      sender: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  emitToConversation(conversationId, 'message:new', {
    id: newMessage.id,
    conversationId,
    senderId: newMessage.sender.id,
    content: newMessage.content,
    type: newMessage.type,
    reactions: {},
    createdAt: newMessage.createdAt,
    sender: newMessage.sender,
  });

  console.log(`[Linda] Replied in conversation ${conversationId}`);
}
