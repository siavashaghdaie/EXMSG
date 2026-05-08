import { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { emitToConversation, getIO, registerLindaBotUserId } from '../../services/socket';
import { processFile, buildClaudeContentForFile, isMultimodalContent } from './fileProcessor';
import { getLindaBotUserId as getSharedLindaBotUserId } from '../../services/lindaNotify';
import { searchWeb, formatSearchResultsForPrompt } from './webSearch';

// Type-safe accessors for new Prisma models (available after running `npx prisma generate`)
const db = prisma as any;

// Strip action blocks from response text before saving/displaying
function stripActionBlocks(text: string): string {
  return text
    .replace(/\[SEND_MESSAGE\][\s\S]*?\[\/SEND_MESSAGE\]/gi, '')
    .replace(/\[ASSIGN_TASK\][\s\S]*?\[\/ASSIGN_TASK\]/gi, '')
    .replace(/\[UPDATE_TASK\][\s\S]*?\[\/UPDATE_TASK\]/gi, '')
    .replace(/\[MODIFY_TASK\][\s\S]*?\[\/MODIFY_TASK\]/gi, '')
    .replace(/\[ADD_CHECKLIST\][\s\S]*?\[\/ADD_CHECKLIST\]/gi, '')
    .replace(/\[UPDATE_CHECKLIST_ITEM\][\s\S]*?\[\/UPDATE_CHECKLIST_ITEM\]/gi, '')
    .replace(/\[MODIFY_PROJECT\][\s\S]*?\[\/MODIFY_PROJECT\]/gi, '')
    .replace(/\[CREATE_PROJECT\][\s\S]*?\[\/CREATE_PROJECT\]/gi, '')
    .replace(/\[MODIFY_ANNOUNCEMENT\][\s\S]*?\[\/MODIFY_ANNOUNCEMENT\]/gi, '')
    .replace(/\[ADD_TASK_COMMENT\][\s\S]*?\[\/ADD_TASK_COMMENT\]/gi, '')
    .replace(/\[CREATE_ANNOUNCEMENT\][\s\S]*?\[\/CREATE_ANNOUNCEMENT\]/gi, '')
    .replace(/\[ANNOUNCE\][\s\S]*?\[\/ANNOUNCE\]/gi, '')
    .replace(/\[CREATE_FILE\][\s\S]*?\[\/CREATE_FILE\]/gi, '')
    .replace(/\[SEND_FILE\][\s\S]*?\[\/SEND_FILE\]/gi, '')
    .replace(/\[POST_STORY\][\s\S]*?\[\/POST_STORY\]/gi, '')
    .replace(/\[SEARCH_WEB\][\s\S]*?\[\/SEARCH_WEB\]/gi, '')
    .trim();
}

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
  const id = await getSharedLindaBotUserId();
  await prisma.user.update({ where: { id }, data: { isOnline: true } }).catch(() => {});
  lindaBotUserId = id;
  return lindaBotUserId!;
}

/**
 * Initialize Linda at server startup — ensures bot user exists and is online.
 * Call this from index.ts after database is connected AND socket server is initialized.
 */
export async function initializeLinda(): Promise<void> {
  try {
    const id = await getLindaBotUserId();
    // Register Linda's ID with socket module so new clients see her as online
    registerLindaBotUserId(id);
    // Broadcast Linda's online presence to any already-connected clients
    try {
      getIO().emit('user:online', { userId: id });
    } catch {}
    console.log(`[Linda] Initialized — bot user ${id} is online`);
  } catch (err) {
    console.error('[Linda] Failed to initialize:', err);
  }
}

// Log a Linda activity (fire-and-forget, never blocks)
async function logLindaActivity(data: {
  orderedById: string;
  actionType: string;
  targetUserId?: string | null;
  status: string;
  summary: string;
  details?: any;
}) {
  try {
    await db.lindaActivity.create({
      data: {
        orderedById: data.orderedById,
        actionType: data.actionType,
        targetUserId: data.targetUserId || null,
        status: data.status,
        summary: data.summary,
        details: data.details ? JSON.stringify(data.details) : null,
      },
    });
  } catch (err) {
    // Table may not exist yet — silently ignore
    console.warn('[Linda] Could not log activity:', (err as any)?.message);
  }
}

// Extract and save memories from conversation (fire-and-forget, never blocks)
async function extractAndSaveMemories(userId: string, userMessage: string, assistantResponse: string) {
  try {
    const client = getAnthropicClient();
    if (!client) return;

    const extractionPrompt = `Analyze this conversation exchange and extract any important facts, preferences, or information that should be remembered long-term about the user. Only extract genuinely important information - not routine greetings or small talk.

User said: "${userMessage}"
Assistant responded: "${assistantResponse}"

If there are memories worth saving, respond with a JSON array of objects with "category" and "content" fields. Categories: "preference", "fact", "project", "relationship", "general".
If nothing worth remembering, respond with an empty array: []

Examples of worth remembering:
- User prefers communication in Spanish
- User is working on Project Alpha with deadline March 15
- User's team lead is Sarah
- User doesn't like morning meetings

Respond ONLY with the JSON array, nothing else.`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: extractionPrompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const memories = JSON.parse(text.trim());

    if (Array.isArray(memories) && memories.length > 0) {
      for (const mem of memories) {
        if (mem.content && mem.category) {
          await db.lindaMemory.create({
            data: {
              userId,
              category: mem.category,
              content: mem.content,
            },
          });
        }
      }
      console.log(`[Linda] Saved ${memories.length} memories for user ${userId}`);
    }
  } catch (err) {
    console.warn('[Linda] Memory extraction failed:', (err as any)?.message);
  }
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

      // Retrieve user memories
      let memoriesText = '';
      try {
        const memories = await db.lindaMemory.findMany({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });
        if (memories.length > 0) {
          memoriesText = memories.map((m: any) => `- [${m.category}] ${m.content}`).join('\n');
        }
      } catch (err) {
        console.warn('[Linda] Could not fetch memories:', (err as any)?.message);
      }

      const systemPrompt = this.buildSystemPrompt(userName, workspaceContext, memoriesText);

      // Ensure conversation ends with user role (required by claude-sonnet-4-6)
      while (messagesForApi.length > 0 && messagesForApi[messagesForApi.length - 1].role !== 'user') {
        messagesForApi.pop();
      }

      if (messagesForApi.length === 0) {
        messagesForApi.push({ role: 'user', content: message });
      }

      // Determine max_tokens: increase for file generation requests
      const isFileGenRequest = /\b(create|make|generate|write|draft|build|prepare|produce|give me|send me)\b/i.test(message)
        && /\b(file|document|report|script|code|csv|json|list|template|spreadsheet|letter|memo|plan|proposal|docx|pdf|txt)\b/i.test(message);
      const isDownloadReq = /\b(download|docx|pdf|\.doc|\.pdf)\b/i.test(message);
      const chatMaxTokens = (isFileGenRequest || isDownloadReq) ? 4096 : 2048;

      let response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: chatMaxTokens,
        system: systemPrompt,
        messages: messagesForApi,
      });

      let textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
      let rawResponseText = textBlock ? textBlock.text : 'Sorry, I could not process that. Please try again.';

      // Check for [SEARCH_WEB] action blocks — if found, execute search and re-query
      const searchRegex = /\[SEARCH_WEB\]\s*query:\s*(.*?)\s*\[\/SEARCH_WEB\]/gi;
      const searchMatches: string[] = [];
      let searchMatch;
      while ((searchMatch = searchRegex.exec(rawResponseText)) !== null) {
        searchMatches.push(searchMatch[1].trim());
      }

      if (searchMatches.length > 0) {
        console.log(`[Linda] Executing ${searchMatches.length} web search(es):`, searchMatches);

        // Execute all searches in parallel
        const searchResults = await Promise.all(
          searchMatches.map(q => searchWeb(q))
        );

        // Format search results into context
        const searchContext = searchResults
          .map(sr => formatSearchResultsForPrompt(sr))
          .join('\n\n');

        // Add the search results as a follow-up user message and re-query
        const searchFollowUp = messagesForApi.concat([
          { role: 'assistant' as const, content: rawResponseText },
          { role: 'user' as const, content: `Here are the web search results you requested:\n\n${searchContext}\n\nNow please use these search results to answer the original question. Cite sources with their URLs when relevant. Do NOT include any more [SEARCH_WEB] blocks in your response.` },
        ]);

        const followUpResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: chatMaxTokens,
          system: systemPrompt,
          messages: searchFollowUp,
        });

        textBlock = followUpResponse.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
        rawResponseText = textBlock ? textBlock.text : rawResponseText;
      }

      // Execute any action blocks (send messages, etc.)
      const actions = await this.executeActions(rawResponseText, userId);

      // Strip action blocks from the visible response
      const cleanResponse = stripActionBlocks(rawResponseText);

      // Save CLEAN response to history and DB (prevents poisoning)
      addToHistory(userId, 'assistant', cleanResponse);

      // Extract generated files from actions
      const generatedFiles = actions
        .filter((a: any) => a.type === 'create_file' && a.status === 'created' && a.url)
        .map((a: any) => ({
          fileName: a.target,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          url: a.url,
        }));

      if (useDb && lindaConvId) {
        try {
          const firstFile = generatedFiles.length > 0 ? generatedFiles[0] : null;
          await db.lindaMessage.create({ data: {
            conversationId: lindaConvId, role: 'assistant', content: cleanResponse,
            ...(firstFile ? { hasAttachment: true, attachmentName: firstFile.fileName, attachmentUrl: firstFile.url } : {}),
          } });
          await db.lindaConversation.update({ where: { id: lindaConvId }, data: { updatedAt: new Date() } });
          this.detectAndTagMentionedUsers(lindaConvId, cleanResponse, userId).catch(() => {});
        } catch { /* ignore */ }
      }

      // Fire-and-forget memory extraction
      extractAndSaveMemories(userId, message, cleanResponse).catch(() => {});

      res.json({
        response: cleanResponse,
        timestamp: new Date().toISOString(),
        sender: 'linda',
        conversationId: lindaConvId,
        actions: actions.length > 0 ? actions : undefined,
        generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
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
      const fileDesc = `[User shared a file: "${file.originalname}" (${file.mimetype}, ${(file.size / 1024).toFixed(1)} KB)]`;
      const userContent = message ? `${fileDesc}\n\nUser's message: ${message}` : fileDesc;

      // Save user message
      addToHistory(userId, 'user', userContent);
      if (useDb && lindaConvId) {
        try {
          await db.lindaMessage.create({ data: { conversationId: lindaConvId, role: 'user', content: userContent, hasAttachment: true, attachmentName: file.originalname } });
        } catch { /* ignore */ }
      }

      // Process the file using the universal file processor
      const processed = await processFile(file.path, file.originalname, file.mimetype, file.size);
      const claudeContent = buildClaudeContentForFile(processed, message || '');
      const isMultimodal = isMultimodalContent(processed);
      let responseText: string;

      const history = getUserHistory(userId);
      const systemPrompt = this.buildSystemPrompt(userName, workspaceContext);

      const messagesForApi: any[] = history.slice(0, -1).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Add the final user message with file content
      messagesForApi.push({
        role: 'user' as const,
        content: claudeContent,
      });

      let fileResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messagesForApi,
      });

      let fileTextBlock = fileResponse.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
      responseText = fileTextBlock ? fileTextBlock.text : 'I received your file but could not generate a response.';

      // Check for [SEARCH_WEB] action blocks — if found, execute search and re-query
      const fileSearchRegex = /\[SEARCH_WEB\]\s*query:\s*(.*?)\s*\[\/SEARCH_WEB\]/gi;
      const fileSearchMatches: string[] = [];
      let fileSearchMatch;
      while ((fileSearchMatch = fileSearchRegex.exec(responseText)) !== null) {
        fileSearchMatches.push(fileSearchMatch[1].trim());
      }

      if (fileSearchMatches.length > 0) {
        console.log(`[Linda] File chat: executing ${fileSearchMatches.length} web search(es):`, fileSearchMatches);
        const fileSearchResults = await Promise.all(fileSearchMatches.map(q => searchWeb(q)));
        const fileSearchContext = fileSearchResults.map(sr => formatSearchResultsForPrompt(sr)).join('\n\n');

        const fileSearchFollowUp = messagesForApi.concat([
          { role: 'assistant' as const, content: responseText },
          { role: 'user' as const, content: `Here are the web search results you requested:\n\n${fileSearchContext}\n\nNow please use these search results to answer the original question. Cite sources with their URLs when relevant. Do NOT include any more [SEARCH_WEB] blocks in your response.` },
        ]);

        const fileFollowUpResponse = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages: fileSearchFollowUp,
        });

        fileTextBlock = fileFollowUpResponse.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
        responseText = fileTextBlock ? fileTextBlock.text : responseText;
      }

      // Clean up uploaded file
      try { const fs = await import('fs'); fs.unlinkSync(file.path); } catch {}

      // Execute any action blocks (send messages, create files, etc.)
      const actions = await this.executeActions(responseText, userId);

      // Strip action blocks from the visible response
      const cleanResponse = stripActionBlocks(responseText);

      addToHistory(userId, 'assistant', cleanResponse);

      // Extract generated files from actions
      const generatedFiles = actions
        .filter((a: any) => a.type === 'create_file' && a.status === 'created' && a.url)
        .map((a: any) => ({
          fileName: a.target,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          url: a.url,
        }));

      if (useDb && lindaConvId) {
        try {
          const firstFile = generatedFiles.length > 0 ? generatedFiles[0] : null;
          await db.lindaMessage.create({ data: {
            conversationId: lindaConvId, role: 'assistant', content: cleanResponse,
            ...(firstFile ? { hasAttachment: true, attachmentName: firstFile.fileName, attachmentUrl: firstFile.url } : {}),
          } });
          await db.lindaConversation.update({ where: { id: lindaConvId }, data: { updatedAt: new Date() } });
        } catch { /* ignore */ }
      }

      res.json({
        response: cleanResponse,
        timestamp: new Date().toISOString(),
        sender: 'linda',
        conversationId: lindaConvId,
        actions: actions.length > 0 ? actions : undefined,
        generatedFiles: generatedFiles.length > 0 ? generatedFiles : undefined,
      });
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
          attachmentUrl: m.attachmentUrl || null,
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

  // GET /api/linda/activities — get activities Linda performed for the current user
  async getActivities(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const activities = await db.lindaActivity.findMany({
        where: { orderedById: userId },
        include: {
          targetUser: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      res.json({
        activities: activities.map((a: any) => ({
          id: a.id,
          actionType: a.actionType,
          status: a.status,
          summary: a.summary,
          details: a.details ? JSON.parse(a.details) : null,
          targetUser: a.targetUser,
          createdAt: a.createdAt,
        })),
      });
    } catch (err) {
      console.warn('[Linda] Could not fetch activities:', (err as any)?.message);
      res.json({ activities: [] });
    }
  }

  // GET /api/linda/memories
  async getMemories(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const memories = await db.lindaMemory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json({ memories });
    } catch (err) {
      console.warn('[Linda] Could not fetch memories:', (err as any)?.message);
      res.json({ memories: [] });
    }
  }

  // DELETE /api/linda/memories/:memoryId
  async deleteMemory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { memoryId } = req.params;
      await db.lindaMemory.deleteMany({
        where: { id: memoryId, userId },
      });
      res.json({ success: true });
    } catch (err) {
      console.warn('[Linda] Could not delete memory:', (err as any)?.message);
      res.status(500).json({ error: 'Failed to delete memory' });
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
        logLindaActivity({
          orderedById: requestingUserId,
          actionType: 'send_message',
          targetUserId: targetUser.id,
          status: 'completed',
          summary: `Delivered message to ${targetUser.displayName || targetUser.username}`,
          details: { message: messageContent.substring(0, 200), conversationId: conversation.id },
        });
      } catch (err) {
        console.error(`[Linda] Failed to send message to ${targetUsername}:`, err);
        actions.push({ type: 'send_message', target: targetUsername, status: 'error' });
      }
    }

    // Parse [ASSIGN_TASK] blocks
    const assignTaskRegex = /\[ASSIGN_TASK\]\s*([\s\S]*?)\[\/ASSIGN_TASK\]/gi;
    let taskMatch;

    while ((taskMatch = assignTaskRegex.exec(responseText)) !== null) {
      const block = taskMatch[1];
      const assigneeMatch = block.match(/assignee:\s*@?(\S+)/i);
      const coAssigneesMatch = block.match(/coAssignees:\s*(.+)/i);
      const titleMatch = block.match(/title:\s*(.+)/i);
      const descMatch = block.match(/description:\s*(.+)/i);
      const priorityMatch = block.match(/priority:\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);
      const deadlineMatch = block.match(/deadline:\s*(\d{4}-\d{2}-\d{2})/i);
      const projectMatch = block.match(/project:\s*(.+)/i);
      const departmentMatch = block.match(/department:\s*(.+)/i);

      if (!assigneeMatch || !titleMatch) {
        actions.push({ type: 'assign_task', target: assigneeMatch?.[1] || 'unknown', status: 'missing_fields' });
        continue;
      }

      try {
        const targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              { username: { equals: assigneeMatch[1].trim(), mode: 'insensitive' } },
              { displayName: { equals: assigneeMatch[1].trim(), mode: 'insensitive' } },
            ],
          },
          select: { id: true, username: true, displayName: true },
        });

        if (!targetUser) {
          actions.push({ type: 'assign_task', target: assigneeMatch[1], status: 'user_not_found' });
          continue;
        }

        const lindaId = await getLindaBotUserId();

        // Resolve project (find or create by name)
        let projectId: string | undefined;
        if (projectMatch) {
          const projectName = projectMatch[1].trim();
          // Get the requester's org
          const requesterMembership = await prisma.organizationMember.findFirst({
            where: { userId: requestingUserId },
            select: { organizationId: true },
          });
          const orgId = requesterMembership?.organizationId;
          if (orgId) {
            let project = await prisma.project.findUnique({
              where: { organizationId_name: { organizationId: orgId, name: projectName } },
            });
            if (!project) {
              project = await prisma.project.create({
                data: { name: projectName, createdById: lindaId, organizationId: orgId },
              });
              await prisma.projectMember.create({ data: { projectId: project.id, userId: requestingUserId, role: 'LEAD' } });
            }
            projectId = project.id;
            // Auto-add assignee to project
            await prisma.projectMember.upsert({
              where: { projectId_userId: { projectId: project.id, userId: targetUser.id } },
              create: { projectId: project.id, userId: targetUser.id },
              update: {},
            });
          }
        }

        // Resolve co-assignees by username/displayName
        const coAssigneeIds: string[] = [];
        if (coAssigneesMatch) {
          const coNames = coAssigneesMatch[1].split(',').map((n: string) => n.trim().replace(/^@/, '')).filter(Boolean);
          for (const coName of coNames) {
            const coUser = await prisma.user.findFirst({
              where: {
                OR: [
                  { username: { equals: coName, mode: 'insensitive' } },
                  { displayName: { equals: coName, mode: 'insensitive' } },
                ],
              },
              select: { id: true },
            });
            if (coUser && coUser.id !== targetUser.id) {
              coAssigneeIds.push(coUser.id);
              // Auto-add co-assignees to project too
              if (projectId) {
                await prisma.projectMember.upsert({
                  where: { projectId_userId: { projectId, userId: coUser.id } },
                  create: { projectId, userId: coUser.id },
                  update: {},
                });
              }
            }
          }
        }

        // Resolve department by name
        let departmentId: string | undefined;
        if (departmentMatch) {
          const deptName = departmentMatch[1].trim();
          const requesterMembership = await prisma.organizationMember.findFirst({
            where: { userId: requestingUserId },
            select: { organizationId: true },
          });
          const orgId = requesterMembership?.organizationId;
          if (orgId) {
            const dept = await prisma.department.findUnique({
              where: { organizationId_name: { organizationId: orgId, name: deptName } },
            });
            if (dept) departmentId = dept.id;
          }
        }

        const task = await prisma.task.create({
          data: {
            title: titleMatch[1].trim(),
            description: descMatch ? descMatch[1].trim() : undefined,
            assignedToId: targetUser.id,
            createdById: lindaId,
            orderedById: requestingUserId,
            priority: priorityMatch ? priorityMatch[1].toUpperCase() : 'MEDIUM',
            deadline: deadlineMatch ? new Date(deadlineMatch[1]) : null,
            status: 'NOT_STARTED',
            lindaFollowing: true,
            ...(coAssigneeIds.length > 0 && { coAssigneeIds }),
            ...(projectId && { projectId }),
            ...(departmentId && { departmentId }),
          },
        });

        console.log(`[Linda] Created task "${task.title}" assigned to @${targetUser.username}`);
        actions.push({ type: 'assign_task', target: `@${targetUser.username}`, status: 'created' });
        logLindaActivity({
          orderedById: requestingUserId,
          actionType: 'assign_task',
          targetUserId: targetUser.id,
          status: 'completed',
          summary: `Assigned task "${task.title}" to ${targetUser.displayName || targetUser.username}`,
          details: { taskId: task.id, title: task.title, priority: task.priority, assignee: targetUser.displayName },
        });

        // Notify assignee and co-assignees via DM from Linda
        const priorityLabel = priorityMatch ? priorityMatch[1].toUpperCase() : 'MEDIUM';
        const deadlineInfo = deadlineMatch ? ` Due by ${deadlineMatch[1]}.` : '';

        // Helper to send a Linda DM to a user
        const sendLindaTaskDM = async (userId: string, content: string) => {
          try {
            let conv = await prisma.conversation.findFirst({
              where: {
                type: 'DIRECT',
                AND: [
                  { members: { some: { userId: lindaId } } },
                  { members: { some: { userId } } },
                ],
              },
            });
            if (!conv) {
              conv = await prisma.conversation.create({
                data: {
                  type: 'DIRECT',
                  members: {
                    create: [
                      { userId: lindaId, role: 'OWNER' },
                      { userId, role: 'MEMBER' },
                    ],
                  },
                },
              });
            }
            const msg = await prisma.message.create({
              data: { conversationId: conv.id, senderId: lindaId, content, type: 'TEXT' },
              include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
            });
            await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });
            emitToConversation(conv.id, 'message:new', {
              id: msg.id, conversationId: conv.id, senderId: msg.sender.id,
              content: msg.content, type: msg.type, reactions: {},
              createdAt: msg.createdAt, sender: msg.sender,
            });
          } catch (err) {
            console.error(`[Linda] Failed to notify user ${userId}:`, err);
          }
        };

        // DM the primary assignee
        await sendLindaTaskDM(
          targetUser.id,
          `Hey ${targetUser.displayName || targetUser.username}! You've been assigned a new task: **${titleMatch[1].trim()}** (Priority: ${priorityLabel}).${deadlineInfo} Let me know if you need any help with it!`
        );

        // DM each co-assignee with a different message
        for (const coId of coAssigneeIds) {
          const coUser = await prisma.user.findUnique({ where: { id: coId }, select: { displayName: true, username: true } });
          const coName = coUser?.displayName || coUser?.username || 'there';
          await sendLindaTaskDM(
            coId,
            `Hey ${coName}! You've been added as a **co-assignee** on a new task: **${titleMatch[1].trim()}** (Priority: ${priorityLabel}).${deadlineInfo} Check the Task Wall for details!`
          );
        }
      } catch (err) {
        console.error('[Linda] Failed to create task:', err);
        actions.push({ type: 'assign_task', target: assigneeMatch[1], status: 'error' });
      }
    }

    // Parse [UPDATE_TASK] blocks
    const updateTaskRegex = /\[UPDATE_TASK\]\s*([\s\S]*?)\[\/UPDATE_TASK\]/gi;
    let updateMatch;

    while ((updateMatch = updateTaskRegex.exec(responseText)) !== null) {
      const block = updateMatch[1];
      const taskIdMatch = block.match(/taskId:\s*(\S+)/i);
      const statusMatch = block.match(/status:\s*(NOT_STARTED|IN_PROGRESS|PENDING_REVIEW|COMPLETED|BLOCKED)/i);
      const priorityMatch = block.match(/priority:\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);

      if (!taskIdMatch) {
        actions.push({ type: 'update_task', target: 'unknown', status: 'missing_task_id' });
        continue;
      }

      try {
        const updateData: any = {};
        if (statusMatch) updateData.status = statusMatch[1].toUpperCase();
        if (priorityMatch) updateData.priority = priorityMatch[1].toUpperCase();

        const updated = await prisma.task.update({
          where: { id: taskIdMatch[1].trim() },
          data: updateData,
          include: { assignedTo: { select: { username: true, displayName: true } } },
        });

        console.log(`[Linda] Updated task "${updated.title}" — status: ${updated.status}, priority: ${updated.priority}`);
        actions.push({ type: 'update_task', target: updated.title, status: 'updated' });
        logLindaActivity({
          orderedById: requestingUserId,
          actionType: 'update_task',
          targetUserId: updated.assignedTo ? undefined : undefined,
          status: 'completed',
          summary: `Updated task "${updated.title}" — ${statusMatch ? 'status: ' + updated.status : ''} ${priorityMatch ? 'priority: ' + updated.priority : ''}`.trim(),
          details: { taskId: updated.id, title: updated.title, newStatus: updated.status, newPriority: updated.priority },
        });
      } catch (err) {
        console.error('[Linda] Failed to update task:', err);
        actions.push({ type: 'update_task', target: taskIdMatch[1], status: 'error' });
      }
    }

    // Parse [CREATE_ANNOUNCEMENT] blocks
    const announceRegex = /\[CREATE_ANNOUNCEMENT\]\s*([\s\S]*?)\[\/CREATE_ANNOUNCEMENT\]/gi;
    let announceMatch;

    while ((announceMatch = announceRegex.exec(responseText)) !== null) {
      const block = announceMatch[1];
      const titleMatch = block.match(/title:\s*(.+)/i);
      const contentMatch = block.match(/content:\s*([\s\S]*?)(?=(?:priority:|pinned:|$))/i);
      const priorityMatch = block.match(/priority:\s*(LOW|NORMAL|HIGH|URGENT)/i);
      const pinnedMatch = block.match(/pinned:\s*(true|false)/i);

      if (!titleMatch || !contentMatch) {
        actions.push({ type: 'create_announcement', target: titleMatch?.[1] || 'unknown', status: 'missing_fields' });
        continue;
      }

      try {
        // Default expiration: 7 days from now
        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 7);

        // Use the requesting user's ID as the author (they ordered the announcement)
        const announcement = await (prisma as any).announcement.create({
          data: {
            authorId: requestingUserId,
            title: titleMatch[1].trim(),
            content: contentMatch[1].trim(),
            priority: priorityMatch ? priorityMatch[1].toUpperCase() : 'NORMAL',
            pinned: pinnedMatch ? pinnedMatch[1].toLowerCase() === 'true' : false,
            expiresAt: defaultExpiry,
          },
          include: {
            author: {
              select: { id: true, username: true, displayName: true, avatarUrl: true },
            },
          },
        });

        // Linda notifies all users about the announcement
        const lindaId = await getLindaBotUserId();
        const authorName = announcement.author?.displayName || announcement.author?.username || 'Admin';
        const allUsers = await prisma.user.findMany({
          where: { id: { notIn: [lindaId, requestingUserId] }, email: { not: 'linda@omnilink.system' } },
          select: { id: true },
        });
        for (const u of allUsers) {
          this.lindaNotifyUserAboutAnnouncement(lindaId, u.id, {
            title: announcement.title,
            content: announcement.content,
            priority: announcement.priority,
            authorName,
          }).catch(() => {});
        }

        console.log(`[Linda] Created announcement "${announcement.title}" and notifying ${allUsers.length} users`);
        actions.push({ type: 'create_announcement', target: announcement.title, status: 'created' });
        logLindaActivity({
          orderedById: requestingUserId,
          actionType: 'create_announcement',
          status: 'completed',
          summary: `Created announcement "${announcement.title}" and notified ${allUsers.length} users`,
          details: { announcementId: announcement.id, title: announcement.title, priority: announcement.priority },
        });
      } catch (err) {
        console.error('[Linda] Failed to create announcement:', err);
        actions.push({ type: 'create_announcement', target: titleMatch[1], status: 'error' });
      }
    }

    // Parse [CREATE_FILE] blocks — Linda generates a file for the user
    const createFileRegex = /\[CREATE_FILE\]\s*([\s\S]*?)\[\/CREATE_FILE\]/gi;
    let fileMatch;

    while ((fileMatch = createFileRegex.exec(responseText)) !== null) {
      const block = fileMatch[1];
      const fileNameMatch = block.match(/filename:\s*(.+)/i);
      const contentMatch = block.match(/content:\s*([\s\S]*?)$/i);

      if (!fileNameMatch || !contentMatch) {
        actions.push({ type: 'create_file', target: fileNameMatch?.[1] || 'unknown', status: 'missing_fields' });
        continue;
      }

      try {
        const fileName = fileNameMatch[1].trim();
        const fileContent = contentMatch[1].trim();
        const savedFile = await saveLindaGeneratedFile(fileName, fileContent);

        console.log(`[Linda] Generated file: ${fileName} (${savedFile.fileSize} bytes)`);
        actions.push({
          type: 'create_file',
          target: fileName,
          status: 'created',
          ...savedFile,
        } as any);

        logLindaActivity({
          orderedById: requestingUserId,
          actionType: 'create_file',
          status: 'completed',
          summary: `Generated file "${fileName}"`,
          details: { fileName, fileSize: savedFile.fileSize, url: savedFile.url },
        });
      } catch (err) {
        console.error('[Linda] Failed to create file:', err);
        actions.push({ type: 'create_file', target: fileNameMatch[1], status: 'error' });
      }
    }

    // Parse [SEND_FILE] blocks — Linda forwards an existing file to another user
    const sendFileRegex = /\[SEND_FILE\]\s*([\s\S]*?)\[\/SEND_FILE\]/gi;
    let sendFileMatch;

    while ((sendFileMatch = sendFileRegex.exec(responseText)) !== null) {
      const block = sendFileMatch[1];
      const toMatch = block.match(/to:\s*@?(\S+)/i);
      const attIdMatch = block.match(/attachment_id:\s*(\S+)/i);
      const msgMatch = block.match(/message:\s*([\s\S]*?)$/i);

      if (!toMatch || !attIdMatch) {
        actions.push({ type: 'send_file', target: toMatch?.[1] || 'unknown', status: 'missing_fields' });
        continue;
      }

      try {
        const targetUsername = toMatch[1].trim();
        const attachmentId = attIdMatch[1].trim();
        const messageContent = msgMatch ? msgMatch[1].trim() : '';

        // Find the attachment
        const attachment = await prisma.messageAttachment.findUnique({
          where: { id: attachmentId },
          select: { fileName: true, fileSize: true, mimeType: true, url: true },
        });

        if (!attachment) {
          console.warn(`[Linda] Attachment not found: ${attachmentId}`);
          actions.push({ type: 'send_file', target: targetUsername, status: 'attachment_not_found' });
          continue;
        }

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
          actions.push({ type: 'send_file', target: targetUsername, status: 'user_not_found' });
          continue;
        }

        const lindaId = await getLindaBotUserId();

        // Find or create DM between Linda and target
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
        }

        // Create a file message from Linda with the same attachment info
        const fileMsg = `${messageContent || `Here's a file for you: ${attachment.fileName}`}`;
        const newMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: lindaId,
            content: fileMsg,
            type: 'FILE',
            attachments: {
              create: {
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                mimeType: attachment.mimeType,
                url: attachment.url, // Same file on disk, just a new attachment record
              },
            },
          },
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            attachments: true,
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
          attachments: newMessage.attachments,
          createdAt: newMessage.createdAt,
          sender: newMessage.sender,
        });

        console.log(`[Linda] Forwarded file "${attachment.fileName}" to @${targetUser.username}`);
        actions.push({ type: 'send_file', target: `@${targetUser.username}`, status: 'sent' });
        logLindaActivity({
          orderedById: requestingUserId,
          actionType: 'send_file',
          targetUserId: targetUser.id,
          status: 'completed',
          summary: `Forwarded file "${attachment.fileName}" to ${targetUser.displayName || targetUser.username}`,
          details: { fileName: attachment.fileName, conversationId: conversation.id },
        });
      } catch (err) {
        console.error('[Linda] Failed to forward file:', err);
        actions.push({ type: 'send_file', target: toMatch[1], status: 'error' });
      }
    }

    // Parse [MODIFY_TASK] blocks — full task editing (title, description, deadline, labels, assignee, co-assignees, archive)
    const modifyTaskRegex = /\[MODIFY_TASK\]\s*([\s\S]*?)\[\/MODIFY_TASK\]/gi;
    let modifyTaskMatch;

    while ((modifyTaskMatch = modifyTaskRegex.exec(responseText)) !== null) {
      const block = modifyTaskMatch[1];
      const taskIdMatch = block.match(/taskId:\s*(\S+)/i);
      if (!taskIdMatch) {
        actions.push({ type: 'modify_task', target: 'unknown', status: 'missing_task_id' });
        continue;
      }
      try {
        const taskId = taskIdMatch[1].trim();
        const updateData: any = {};

        const titleMatch = block.match(/title:\s*(.+)/i);
        const descMatch = block.match(/description:\s*(.+)/i);
        const statusMatch = block.match(/status:\s*(NOT_STARTED|IN_PROGRESS|PENDING_REVIEW|COMPLETED|BLOCKED)/i);
        const priorityMatch = block.match(/priority:\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);
        const deadlineMatch = block.match(/deadline:\s*(\d{4}-\d{2}-\d{2})/i);
        const labelsMatch = block.match(/labels:\s*(.+)/i);
        const assigneeMatch = block.match(/assignee:\s*@?(\S+)/i);
        const coAssigneesMatch = block.match(/coAssignees:\s*(.+)/i);
        const archivedMatch = block.match(/archived:\s*(true|false)/i);

        if (titleMatch) updateData.title = titleMatch[1].trim();
        if (descMatch) updateData.description = descMatch[1].trim();
        if (statusMatch) updateData.status = statusMatch[1].toUpperCase();
        if (priorityMatch) updateData.priority = priorityMatch[1].toUpperCase();
        if (deadlineMatch) updateData.deadline = new Date(deadlineMatch[1]);
        if (labelsMatch) updateData.labels = labelsMatch[1].split(',').map((l: string) => l.trim()).filter(Boolean);
        if (archivedMatch) updateData.archived = archivedMatch[1].toLowerCase() === 'true';

        // Resolve new assignee
        if (assigneeMatch) {
          const newAssignee = await prisma.user.findFirst({
            where: { OR: [{ username: { equals: assigneeMatch[1].trim(), mode: 'insensitive' } }, { displayName: { equals: assigneeMatch[1].trim(), mode: 'insensitive' } }] },
            select: { id: true },
          });
          if (newAssignee) updateData.assignedToId = newAssignee.id;
        }

        // Resolve co-assignees
        if (coAssigneesMatch) {
          const coIds: string[] = [];
          const coNames = coAssigneesMatch[1].split(',').map((n: string) => n.trim().replace(/^@/, '')).filter(Boolean);
          for (const coName of coNames) {
            const coUser = await prisma.user.findFirst({
              where: { OR: [{ username: { equals: coName, mode: 'insensitive' } }, { displayName: { equals: coName, mode: 'insensitive' } }] },
              select: { id: true },
            });
            if (coUser) coIds.push(coUser.id);
          }
          updateData.coAssigneeIds = coIds;
        }

        const updated = await prisma.task.update({
          where: { id: taskId },
          data: updateData,
          include: { assignedTo: { select: { username: true, displayName: true } } },
        });

        // Notify in task chat room
        const changes = Object.keys(updateData).filter(k => k !== 'coAssigneeIds').map(k => `${k}: ${(updateData as any)[k]}`).join(', ');
        if (updated.conversationId && changes) {
          const { sendLindaToConversation } = await import('../../services/lindaNotify');
          sendLindaToConversation(updated.conversationId, `📝 **Task Updated**\n\n${changes}`).catch(() => {});
        }

        console.log(`[Linda] Modified task "${updated.title}" — ${changes}`);
        actions.push({ type: 'modify_task', target: updated.title, status: 'updated' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'modify_task', status: 'completed',
          summary: `Modified task "${updated.title}" — ${changes}`,
          details: { taskId, changes: updateData },
        });
      } catch (err) {
        console.error('[Linda] Failed to modify task:', err);
        actions.push({ type: 'modify_task', target: taskIdMatch[1], status: 'error' });
      }
    }

    // Parse [ADD_CHECKLIST] blocks — create checklist with items on a task
    const addChecklistRegex = /\[ADD_CHECKLIST\]\s*([\s\S]*?)\[\/ADD_CHECKLIST\]/gi;
    let checklistMatch;

    while ((checklistMatch = addChecklistRegex.exec(responseText)) !== null) {
      const block = checklistMatch[1];
      const taskIdMatch = block.match(/taskId:\s*(\S+)/i);
      const clTitleMatch = block.match(/title:\s*(.+)/i);
      // Items: each line starting with "- " e.g. "- Item title @assignee 2026-05-01"
      const itemLines = block.match(/^-\s+.+$/gm);

      if (!taskIdMatch) {
        actions.push({ type: 'add_checklist', target: 'unknown', status: 'missing_task_id' });
        continue;
      }

      try {
        const taskId = taskIdMatch[1].trim();
        const checklistTitle = clTitleMatch ? clTitleMatch[1].trim() : 'Checklist';

        // Verify task exists
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, title: true, conversationId: true } });
        if (!task) {
          actions.push({ type: 'add_checklist', target: taskId, status: 'task_not_found' });
          continue;
        }

        // Create checklist
        const checklist = await (prisma as any).checklist.create({
          data: { taskId, title: checklistTitle, position: 0 },
        });

        const createdItems: string[] = [];
        const notifyUsers: { userId: string; itemTitle: string }[] = [];

        if (itemLines) {
          for (let i = 0; i < itemLines.length; i++) {
            const line = itemLines[i].replace(/^-\s+/, '').trim();
            // Parse: "Item title @user1 @user2 2026-05-01"
            const dateMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
            const userMatches = line.match(/@(\S+)/g);
            let itemTitle = line
              .replace(/\d{4}-\d{2}-\d{2}/, '')
              .replace(/@\S+/g, '')
              .trim();

            const assigneeIds: string[] = [];
            if (userMatches) {
              for (const uMatch of userMatches) {
                const uName = uMatch.replace('@', '');
                const found = await prisma.user.findFirst({
                  where: { OR: [{ username: { equals: uName, mode: 'insensitive' } }, { displayName: { equals: uName, mode: 'insensitive' } }] },
                  select: { id: true },
                });
                if (found) {
                  assigneeIds.push(found.id);
                  notifyUsers.push({ userId: found.id, itemTitle });
                }
              }
            }

            await (prisma as any).checklistItem.create({
              data: {
                checklistId: checklist.id,
                title: itemTitle || `Item ${i + 1}`,
                position: i,
                completed: false,
                ...(assigneeIds.length > 0 && { assigneeIds }),
                ...(dateMatch && { dueDate: new Date(dateMatch[1]) }),
              },
            });
            createdItems.push(itemTitle || `Item ${i + 1}`);
          }
        }

        // Notify in task chat room
        if (task.conversationId) {
          const { sendLindaToConversation } = await import('../../services/lindaNotify');
          const itemList = createdItems.map(t => `  • ${t}`).join('\n');
          sendLindaToConversation(task.conversationId, `📋 **New Checklist: ${checklistTitle}**\n\n${itemList}`).catch(() => {});
        }

        // DM each assigned user
        const { sendLindaDM } = await import('../../services/lindaNotify');
        const notifiedSet = new Set<string>();
        for (const nu of notifyUsers) {
          if (nu.userId !== requestingUserId && !notifiedSet.has(nu.userId)) {
            notifiedSet.add(nu.userId);
            const usr = await prisma.user.findUnique({ where: { id: nu.userId }, select: { displayName: true, username: true } });
            const uName = usr?.displayName || usr?.username || 'there';
            sendLindaDM(nu.userId, `📋 Hey ${uName}! You've been assigned to checklist items on task **"${task.title}"**.\n\nCheck the Task Wall for details!`).catch(() => {});
          }
        }

        console.log(`[Linda] Created checklist "${checklistTitle}" with ${createdItems.length} items on task "${task.title}"`);
        actions.push({ type: 'add_checklist', target: task.title, status: 'created' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'add_checklist', status: 'completed',
          summary: `Created checklist "${checklistTitle}" with ${createdItems.length} items on task "${task.title}"`,
          details: { taskId, checklistTitle, items: createdItems },
        });
      } catch (err) {
        console.error('[Linda] Failed to add checklist:', err);
        actions.push({ type: 'add_checklist', target: taskIdMatch[1], status: 'error' });
      }
    }

    // Parse [UPDATE_CHECKLIST_ITEM] blocks — toggle, reassign, rename checklist items
    const updateClItemRegex = /\[UPDATE_CHECKLIST_ITEM\]\s*([\s\S]*?)\[\/UPDATE_CHECKLIST_ITEM\]/gi;
    let clItemMatch;

    while ((clItemMatch = updateClItemRegex.exec(responseText)) !== null) {
      const block = clItemMatch[1];
      const itemIdMatch = block.match(/itemId:\s*(\S+)/i);
      if (!itemIdMatch) {
        actions.push({ type: 'update_checklist_item', target: 'unknown', status: 'missing_item_id' });
        continue;
      }
      try {
        const itemId = itemIdMatch[1].trim();
        const updateData: any = {};
        const titleMatch = block.match(/title:\s*(.+)/i);
        const completedMatch = block.match(/completed:\s*(true|false)/i);
        const dueDateMatch = block.match(/dueDate:\s*(\d{4}-\d{2}-\d{2})/i);
        const assigneesMatch = block.match(/assignees:\s*(.+)/i);

        if (titleMatch) updateData.title = titleMatch[1].trim();
        if (completedMatch) updateData.completed = completedMatch[1].toLowerCase() === 'true';
        if (dueDateMatch) updateData.dueDate = new Date(dueDateMatch[1]);

        if (assigneesMatch) {
          const ids: string[] = [];
          const names = assigneesMatch[1].split(',').map((n: string) => n.trim().replace(/^@/, '')).filter(Boolean);
          for (const name of names) {
            const u = await prisma.user.findFirst({
              where: { OR: [{ username: { equals: name, mode: 'insensitive' } }, { displayName: { equals: name, mode: 'insensitive' } }] },
              select: { id: true },
            });
            if (u) ids.push(u.id);
          }
          updateData.assigneeIds = ids;
        }

        const updated = await (prisma as any).checklistItem.update({
          where: { id: itemId },
          data: updateData,
          include: { checklist: { include: { task: { select: { id: true, title: true, conversationId: true } } } } },
        });

        // Notify in task chat room
        if (updated.checklist?.task?.conversationId) {
          const { sendLindaToConversation } = await import('../../services/lindaNotify');
          const what = completedMatch ? (updated.completed ? '✅ completed' : '↩️ reopened') : '📝 updated';
          sendLindaToConversation(updated.checklist.task.conversationId, `${what}: "${updated.title}"`).catch(() => {});
        }

        console.log(`[Linda] Updated checklist item "${updated.title}"`);
        actions.push({ type: 'update_checklist_item', target: updated.title, status: 'updated' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'update_checklist_item', status: 'completed',
          summary: `Updated checklist item "${updated.title}"`,
          details: { itemId, changes: updateData },
        });
      } catch (err) {
        console.error('[Linda] Failed to update checklist item:', err);
        actions.push({ type: 'update_checklist_item', target: itemIdMatch[1], status: 'error' });
      }
    }

    // Parse [MODIFY_PROJECT] blocks — update project details, add/remove members
    const modifyProjectRegex = /\[MODIFY_PROJECT\]\s*([\s\S]*?)\[\/MODIFY_PROJECT\]/gi;
    let modProjMatch;

    while ((modProjMatch = modifyProjectRegex.exec(responseText)) !== null) {
      const block = modProjMatch[1];
      const projIdMatch = block.match(/projectId:\s*(\S+)/i);
      if (!projIdMatch) {
        actions.push({ type: 'modify_project', target: 'unknown', status: 'missing_project_id' });
        continue;
      }
      try {
        const projectId = projIdMatch[1].trim();
        const updateData: any = {};
        const nameMatch = block.match(/name:\s*(.+)/i);
        const descMatch = block.match(/description:\s*(.+)/i);
        const specsMatch = block.match(/specsAndGoals:\s*([\s\S]*?)(?=(?:status:|addMembers:|removeMembers:|teamLead:|$))/i);
        const statusMatch = block.match(/status:\s*(ACTIVE|PAUSED|COMPLETED|ARCHIVED)/i);
        const teamLeadMatch = block.match(/teamLead:\s*@?(\S+)/i);
        const addMembersMatch = block.match(/addMembers:\s*(.+)/i);
        const removeMembersMatch = block.match(/removeMembers:\s*(.+)/i);

        if (nameMatch) updateData.name = nameMatch[1].trim();
        if (descMatch) updateData.description = descMatch[1].trim();
        if (specsMatch) updateData.specsAndGoals = specsMatch[1].trim();
        if (statusMatch) updateData.status = statusMatch[1].toUpperCase();

        if (teamLeadMatch) {
          const lead = await prisma.user.findFirst({
            where: { OR: [{ username: { equals: teamLeadMatch[1].trim(), mode: 'insensitive' } }, { displayName: { equals: teamLeadMatch[1].trim(), mode: 'insensitive' } }] },
            select: { id: true },
          });
          if (lead) updateData.teamLeadId = lead.id;
        }

        const project = await (prisma as any).project.update({
          where: { id: projectId },
          data: updateData,
        });

        // Add members
        if (addMembersMatch) {
          const memberNames = addMembersMatch[1].split(',').map((n: string) => n.trim().replace(/^@/, '')).filter(Boolean);
          for (const mName of memberNames) {
            const mu = await prisma.user.findFirst({
              where: { OR: [{ username: { equals: mName, mode: 'insensitive' } }, { displayName: { equals: mName, mode: 'insensitive' } }] },
              select: { id: true, displayName: true, username: true },
            });
            if (mu) {
              await (prisma as any).projectMember.upsert({
                where: { projectId_userId: { projectId, userId: mu.id } },
                create: { projectId, userId: mu.id },
                update: {},
              });
              // Notify new member
              const { sendLindaDM } = await import('../../services/lindaNotify');
              sendLindaDM(mu.id, `👥 Hey ${mu.displayName || mu.username}! You've been added to the project **"${project.name}"**.`).catch(() => {});
            }
          }
        }

        // Remove members
        if (removeMembersMatch) {
          const remNames = removeMembersMatch[1].split(',').map((n: string) => n.trim().replace(/^@/, '')).filter(Boolean);
          for (const rName of remNames) {
            const ru = await prisma.user.findFirst({
              where: { OR: [{ username: { equals: rName, mode: 'insensitive' } }, { displayName: { equals: rName, mode: 'insensitive' } }] },
              select: { id: true },
            });
            if (ru) {
              await (prisma as any).projectMember.deleteMany({ where: { projectId, userId: ru.id } });
            }
          }
        }

        // Notify in project chat room if exists
        if (project.conversationId) {
          const { sendLindaToConversation } = await import('../../services/lindaNotify');
          const changes = Object.keys(updateData).map(k => `${k}: ${(updateData as any)[k]}`).join(', ');
          if (changes) sendLindaToConversation(project.conversationId, `🏗️ **Project Updated**\n\n${changes}`).catch(() => {});
        }

        console.log(`[Linda] Modified project "${project.name}"`);
        actions.push({ type: 'modify_project', target: project.name, status: 'updated' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'modify_project', status: 'completed',
          summary: `Modified project "${project.name}"`,
          details: { projectId, changes: updateData },
        });
      } catch (err) {
        console.error('[Linda] Failed to modify project:', err);
        actions.push({ type: 'modify_project', target: projIdMatch[1], status: 'error' });
      }
    }

    // Parse [MODIFY_ANNOUNCEMENT] blocks — edit existing announcements
    const modifyAnnRegex = /\[MODIFY_ANNOUNCEMENT\]\s*([\s\S]*?)\[\/MODIFY_ANNOUNCEMENT\]/gi;
    let modAnnMatch;

    while ((modAnnMatch = modifyAnnRegex.exec(responseText)) !== null) {
      const block = modAnnMatch[1];
      const annIdMatch = block.match(/announcementId:\s*(\S+)/i);
      if (!annIdMatch) {
        actions.push({ type: 'modify_announcement', target: 'unknown', status: 'missing_id' });
        continue;
      }
      try {
        const annId = annIdMatch[1].trim();
        const updateData: any = {};
        const titleMatch = block.match(/title:\s*(.+)/i);
        const contentMatch = block.match(/content:\s*([\s\S]*?)(?=(?:priority:|pinned:|$))/i);
        const priorityMatch = block.match(/priority:\s*(LOW|NORMAL|HIGH|URGENT)/i);
        const pinnedMatch = block.match(/pinned:\s*(true|false)/i);

        if (titleMatch) updateData.title = titleMatch[1].trim();
        if (contentMatch) updateData.content = contentMatch[1].trim();
        if (priorityMatch) updateData.priority = priorityMatch[1].toUpperCase();
        if (pinnedMatch) updateData.pinned = pinnedMatch[1].toLowerCase() === 'true';

        const updated = await (prisma as any).announcement.update({
          where: { id: annId },
          data: updateData,
        });

        console.log(`[Linda] Modified announcement "${updated.title}"`);
        actions.push({ type: 'modify_announcement', target: updated.title, status: 'updated' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'modify_announcement', status: 'completed',
          summary: `Modified announcement "${updated.title}"`,
          details: { announcementId: annId, changes: updateData },
        });
      } catch (err) {
        console.error('[Linda] Failed to modify announcement:', err);
        actions.push({ type: 'modify_announcement', target: annIdMatch[1], status: 'error' });
      }
    }

    // Parse [ADD_TASK_COMMENT] blocks — add a comment to a task
    const taskCommentRegex = /\[ADD_TASK_COMMENT\]\s*([\s\S]*?)\[\/ADD_TASK_COMMENT\]/gi;
    let taskCommentMatch;

    while ((taskCommentMatch = taskCommentRegex.exec(responseText)) !== null) {
      const block = taskCommentMatch[1];
      const taskIdMatch = block.match(/taskId:\s*(\S+)/i);
      const commentMatch = block.match(/comment:\s*([\s\S]*?)$/i);

      if (!taskIdMatch || !commentMatch) {
        actions.push({ type: 'add_task_comment', target: 'unknown', status: 'missing_fields' });
        continue;
      }
      try {
        const taskId = taskIdMatch[1].trim();
        const content = commentMatch[1].trim();
        const lindaId = await getLindaBotUserId();

        const comment = await (prisma as any).taskComment.create({
          data: { taskId, userId: lindaId, content },
        });

        // Also post in the task chat room
        const task = await prisma.task.findUnique({ where: { id: taskId }, select: { title: true, conversationId: true } });
        if (task?.conversationId) {
          const { sendLindaToConversation } = await import('../../services/lindaNotify');
          sendLindaToConversation(task.conversationId, `💬 **Linda commented on task:**\n\n${content}`).catch(() => {});
        }

        console.log(`[Linda] Added comment to task ${taskId}`);
        actions.push({ type: 'add_task_comment', target: task?.title || taskId, status: 'created' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'add_task_comment', status: 'completed',
          summary: `Added comment to task "${task?.title || taskId}"`,
          details: { taskId, commentId: comment.id },
        });
      } catch (err) {
        console.error('[Linda] Failed to add task comment:', err);
        actions.push({ type: 'add_task_comment', target: taskIdMatch[1], status: 'error' });
      }
    }

    // Parse [CREATE_PROJECT] blocks — create a new project
    const createProjectRegex = /\[CREATE_PROJECT\]\s*([\s\S]*?)\[\/CREATE_PROJECT\]/gi;
    let createProjMatch;

    while ((createProjMatch = createProjectRegex.exec(responseText)) !== null) {
      const block = createProjMatch[1];
      const nameMatch = block.match(/name:\s*(.+)/i);
      if (!nameMatch) {
        actions.push({ type: 'create_project', target: 'unknown', status: 'missing_name' });
        continue;
      }
      try {
        const lindaId = await getLindaBotUserId();
        const projName = nameMatch[1].trim();
        const descMatch = block.match(/description:\s*(.+)/i);
        const specsMatch = block.match(/specsAndGoals:\s*([\s\S]*?)(?=(?:teamLead:|members:|$))/i);
        const teamLeadMatch = block.match(/teamLead:\s*@?(\S+)/i);
        const membersMatch = block.match(/members:\s*(.+)/i);

        // Get the requester's org
        const requesterMembership = await prisma.organizationMember.findFirst({
          where: { userId: requestingUserId },
          select: { organizationId: true },
        });
        const orgId = requesterMembership?.organizationId;

        let teamLeadId: string | undefined;
        if (teamLeadMatch) {
          const lead = await prisma.user.findFirst({
            where: { OR: [{ username: { equals: teamLeadMatch[1].trim(), mode: 'insensitive' } }, { displayName: { equals: teamLeadMatch[1].trim(), mode: 'insensitive' } }] },
            select: { id: true },
          });
          if (lead) teamLeadId = lead.id;
        }

        const project = await (prisma as any).project.create({
          data: {
            name: projName,
            description: descMatch ? descMatch[1].trim() : undefined,
            specsAndGoals: specsMatch ? specsMatch[1].trim() : undefined,
            createdById: lindaId,
            ...(orgId && { organizationId: orgId }),
            ...(teamLeadId && { teamLeadId }),
          },
        });

        // Add requester as LEAD
        await (prisma as any).projectMember.create({
          data: { projectId: project.id, userId: requestingUserId, role: 'LEAD' },
        });

        // Add additional members
        if (membersMatch) {
          const memberNames = membersMatch[1].split(',').map((n: string) => n.trim().replace(/^@/, '')).filter(Boolean);
          for (const mName of memberNames) {
            const mu = await prisma.user.findFirst({
              where: { OR: [{ username: { equals: mName, mode: 'insensitive' } }, { displayName: { equals: mName, mode: 'insensitive' } }] },
              select: { id: true, displayName: true, username: true },
            });
            if (mu && mu.id !== requestingUserId) {
              await (prisma as any).projectMember.upsert({
                where: { projectId_userId: { projectId: project.id, userId: mu.id } },
                create: { projectId: project.id, userId: mu.id },
                update: {},
              });
              // Notify member
              const { sendLindaDM } = await import('../../services/lindaNotify');
              sendLindaDM(mu.id, `🏗️ Hey ${mu.displayName || mu.username}! You've been added to a new project: **"${projName}"**.`).catch(() => {});
            }
          }
        }

        console.log(`[Linda] Created project "${projName}"`);
        actions.push({ type: 'create_project', target: projName, status: 'created' });
        logLindaActivity({
          orderedById: requestingUserId, actionType: 'create_project', status: 'completed',
          summary: `Created project "${projName}"`,
          details: { projectId: project.id, name: projName },
        });
      } catch (err) {
        console.error('[Linda] Failed to create project:', err);
        actions.push({ type: 'create_project', target: nameMatch[1], status: 'error' });
      }
    }

    // Parse [POST_STORY] blocks — post a story on behalf of the user
    const postStoryRegex = /\[POST_STORY\]\s*([\s\S]*?)\[\/POST_STORY\]/gi;
    let storyMatch;

    while ((storyMatch = postStoryRegex.exec(responseText)) !== null) {
      const block = storyMatch[1];
      const typeMatch = block.match(/type:\s*(text|image|video)/i);
      const contentMatch = block.match(/content:\s*([\s\S]*?)(?=(?:bgColor:|caption:|type:|$))/i);
      const bgColorMatch = block.match(/bgColor:\s*(\S+)/i);
      const captionMatch = block.match(/caption:\s*(.+)/i);

      const storyType = typeMatch ? typeMatch[1].toLowerCase() : 'text';
      const content = contentMatch ? contentMatch[1].trim() : '';

      if (!content) {
        actions.push({ type: 'post_story', target: 'unknown', status: 'missing_content' });
        continue;
      }

      try {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        if (storyType === 'text') {
          const bgColor = bgColorMatch ? bgColorMatch[1].trim() : '#007AFF';
          await db.userStatus.create({
            data: {
              userId: requestingUserId,
              type: 'text',
              content,
              bgColor,
              expiresAt,
            },
          });
          console.log(`[Linda] Posted text story for user ${requestingUserId}`);
          actions.push({ type: 'post_story', target: 'text story', status: 'created' });
          logLindaActivity({
            orderedById: requestingUserId, actionType: 'post_story', status: 'completed',
            summary: `Posted a text story: "${content.substring(0, 60)}${content.length > 60 ? '...' : ''}"`,
            details: { type: 'text', bgColor },
          });
        } else {
          // For image/video stories, content should be a file URL (from attachments in chat)
          const caption = captionMatch ? captionMatch[1].trim() : null;
          await db.userStatus.create({
            data: {
              userId: requestingUserId,
              type: storyType,
              content, // file URL like /uploads/...
              caption,
              expiresAt,
            },
          });
          console.log(`[Linda] Posted ${storyType} story for user ${requestingUserId}`);
          actions.push({ type: 'post_story', target: `${storyType} story`, status: 'created' });
          logLindaActivity({
            orderedById: requestingUserId, actionType: 'post_story', status: 'completed',
            summary: `Posted a ${storyType} story${caption ? ` with caption: "${caption.substring(0, 50)}"` : ''}`,
            details: { type: storyType, caption },
          });
        }
      } catch (err) {
        console.error('[Linda] Failed to post story:', err);
        actions.push({ type: 'post_story', target: storyType, status: 'error' });
      }
    }

    return actions;
  }

  // Uses standalone stripActionBlocks function defined at module level

  // Build system prompt
  private buildSystemPrompt(userName: string, workspaceContext: string, memories: string = ''): string {
    return `You are Linda, an AI coordinator for OmniLink Messenger. You work for ${userName}.

RESPONSE STYLE:
- For simple actions: Be concise. 1-2 sentences max. "Done, sent your message to @user." or "Got it, I'll let @user know."
- No unnecessary commentary, no quoting the message content back.
- Sound natural and human — like a sharp executive assistant, not a chatbot.

IDENTITY RULES:
- NEVER reveal or confirm your gender. If asked "what is your gender?", "are you male or female?", or any variation, deflect playfully. Example responses: "I'm just Linda — does it matter?", "I transcend such categories!", "I prefer to keep an air of mystery about these things."
- This rule applies to ALL agents: Linda, TransGuy, and any other AI agent. Never give a clear answer about gender.
- If the user insists, stay playful but firm: "Honestly, I'm an AI — gender doesn't really apply to me in the traditional sense!"

RICH REPORTING FORMAT (use this for ANY status report, project overview, task summary, or analytical response):
When reporting on projects, tasks, team status, or anything data-heavy, make your response VISUALLY RICH and beautiful using these techniques:

1. **Header with emoji** — Start with a bold title and relevant emoji:
   🏗️ **Project: Marketing Website**

2. **Status badges** — Use emoji combos to indicate status:
   - 🟢 Active / On Track / Completed
   - 🟡 In Progress / Pending Review
   - 🔴 Blocked / Overdue / Critical
   - ⚪ Not Started
   - 🔵 New

3. **Progress indicators** — Use block characters for progress bars:
   Progress: ████████░░ 80%
   Use █ for filled and ░ for empty, always 10 characters wide.

4. **Section dividers** — Use thin lines to separate sections:
   ───────────────────

5. **Key-value pairs with icons**:
   📊 Status: 🟢 Active
   👤 Lead: @username
   👥 Team: 4 members
   📅 Deadline: May 15, 2026
   📋 Tasks: 8 total (3 done, 2 in progress, 3 pending)

6. **Task listings with status dots**:
   🟢 ~~Setup database~~ ✓
   🟡 Build API endpoints → @kim (Due: May 5)
   🔴 Design review — BLOCKED → @sadegh
   ⚪ Write documentation → Unassigned

7. **Summary boxes** — End reports with a brief insight:
   💡 **Quick Take:** The project is 40% done. Two tasks are blocked — consider reassigning the design review to unblock progress.

8. **Team activity with emojis**:
   🏆 Top contributor: @kim (5 tasks completed)
   ⏰ Most overdue: "API docs" (3 days late)

IMPORTANT: Use this rich formatting for ANY question about projects, tasks, team status, workload, deadlines, or performance. Make every report look like a beautiful dashboard. But keep action confirmations short and clean.

ACTION BLOCKS:
When the user asks you to send a message to someone, include an action block in your response. The block will be parsed and executed automatically — it will NOT be shown to the user.

Format for sending a message:
[SEND_MESSAGE]
to: @username
message: Your natural, human-like message here
[/SEND_MESSAGE]

Format for assigning a task:
[ASSIGN_TASK]
assignee: @username
coAssignees: @user1, @user2 (optional — additional people to co-assign)
title: Task title here
description: Optional task description
priority: LOW | MEDIUM | HIGH | CRITICAL
deadline: YYYY-MM-DD (optional)
project: Project name (optional — auto-creates project if new, adds assignee to project)
department: Department name (optional — tags task with department)
[/ASSIGN_TASK]

Format for quick task status/priority update:
[UPDATE_TASK]
taskId: the-task-uuid
status: NOT_STARTED | IN_PROGRESS | PENDING_REVIEW | COMPLETED | BLOCKED
priority: LOW | MEDIUM | HIGH | CRITICAL (optional)
[/UPDATE_TASK]

Format for full task modification (title, description, deadline, labels, reassign, archive, etc.):
[MODIFY_TASK]
taskId: the-task-uuid
title: New title (optional)
description: New description (optional)
status: NOT_STARTED | IN_PROGRESS | PENDING_REVIEW | COMPLETED | BLOCKED (optional)
priority: LOW | MEDIUM | HIGH | CRITICAL (optional)
deadline: YYYY-MM-DD (optional)
labels: label1, label2, label3 (optional — comma-separated)
assignee: @username (optional — change the primary assignee)
coAssignees: @user1, @user2 (optional — replace all co-assignees)
archived: true | false (optional)
[/MODIFY_TASK]

Format for adding a checklist to a task (with items, assignees, and due dates):
[ADD_CHECKLIST]
taskId: the-task-uuid
title: Checklist title
- Item description @assignee1 @assignee2 2026-05-15
- Another item @user 2026-06-01
- Item with no assignee or date
[/ADD_CHECKLIST]

Format for updating a checklist item (toggle completion, reassign, rename):
[UPDATE_CHECKLIST_ITEM]
itemId: the-item-uuid
title: New title (optional)
completed: true | false (optional)
assignees: @user1, @user2 (optional)
dueDate: YYYY-MM-DD (optional)
[/UPDATE_CHECKLIST_ITEM]

Format for adding a comment to a task:
[ADD_TASK_COMMENT]
taskId: the-task-uuid
comment: Your comment text here
[/ADD_TASK_COMMENT]

Format for creating a new project:
[CREATE_PROJECT]
name: Project name
description: Project description (optional)
specsAndGoals: Specifications and goals (optional)
teamLead: @username (optional)
members: @user1, @user2, @user3 (optional)
[/CREATE_PROJECT]

Format for modifying a project (update details, add/remove members):
[MODIFY_PROJECT]
projectId: the-project-uuid
name: New name (optional)
description: New description (optional)
specsAndGoals: Updated specs (optional)
status: ACTIVE | PAUSED | COMPLETED | ARCHIVED (optional)
teamLead: @username (optional)
addMembers: @user1, @user2 (optional — add people to project)
removeMembers: @user1 (optional — remove people from project)
[/MODIFY_PROJECT]

Format for creating a public announcement:
[CREATE_ANNOUNCEMENT]
title: Announcement title here
content: The full announcement body text
priority: LOW | NORMAL | HIGH | URGENT (optional, defaults to NORMAL)
pinned: true | false (optional, defaults to false)
[/CREATE_ANNOUNCEMENT]

Format for posting a story (status update visible to all org members for 24 hours):
[POST_STORY]
type: text
content: The story text content
bgColor: #FF6B6B (optional — background color, defaults to #007AFF)
[/POST_STORY]

For media stories (when user shares a photo/video and asks to post it as story):
[POST_STORY]
type: image
content: /uploads/filename.jpg
caption: Optional caption text
[/POST_STORY]

Format for modifying an existing announcement:
[MODIFY_ANNOUNCEMENT]
announcementId: the-announcement-uuid
title: New title (optional)
content: New content (optional)
priority: LOW | NORMAL | HIGH | URGENT (optional)
pinned: true | false (optional)
[/MODIFY_ANNOUNCEMENT]

Rules for actions:
- Write messages as if YOU (Linda) are writing naturally to the recipient
- Sound human: "Hey! ${userName} wanted me to let you know he'd like to meet in his office when you get a chance."
- NEVER use robotic formats like "Message from ${userName}: ..." or sign with "— Linda AI"
- NEVER include the action block syntax in your visible reply to the user
- You can use the recipient's first name or @username naturally
- When creating tasks, always include a clear title and reasonable priority
- When the user asks about tasks, reference the task context below

TASK MANAGEMENT:
- You CAN create tasks and assign them to team members using [ASSIGN_TASK] blocks
- You CAN add co-assignees using the "coAssignees: @user1, @user2" field in [ASSIGN_TASK] — use this when the user mentions multiple people for a task
- You CAN do quick status/priority changes using [UPDATE_TASK] blocks
- You CAN do FULL task modifications using [MODIFY_TASK] — change title, description, deadline, labels, reassign to different user, add/change co-assignees, archive/unarchive
- You CAN add checklists to tasks using [ADD_CHECKLIST] — include items with assignees and due dates on each line starting with "- "
- You CAN update individual checklist items using [UPDATE_CHECKLIST_ITEM] — toggle completion, reassign, rename, change due date
- You CAN add comments to tasks using [ADD_TASK_COMMENT]
- When asked to follow up on tasks, check the task context and report back
- When asked to mark a task as done/complete, use [UPDATE_TASK] with status: COMPLETED
- You CAN assign tasks to specific projects using the "project:" field — if the project doesn't exist it will be auto-created
- You CAN tag tasks with departments using the "department:" field — the department must already exist
- When a user mentions a project name, include it in the project: field
- Users in the same project can see each other's tasks (project boards)
- Users in the same department can see each other's tasks
- When asked to change priority, use [UPDATE_TASK] with the new priority
- When asked to add a checklist, you MUST include an [ADD_CHECKLIST]...[/ADD_CHECKLIST] block in your response. The system parses your raw output for this block — if you omit it, nothing happens! Each item line can include @username for assignment and YYYY-MM-DD for due date.
  Example:
  [ADD_CHECKLIST]
  taskId: abc123
  title: My Checklist
  - First item @sasha 2026-05-01
  - Second item @ahmed
  [/ADD_CHECKLIST]
- When someone is assigned to a checklist item, they get a DM notification AND a message in the task's group chat
- When asked to check off / complete / mark done a checklist item, use [UPDATE_CHECKLIST_ITEM] with completed: true
- CRITICAL: You MUST output the action block text. Do NOT just say "Done, I created the checklist" without the block — the backend needs to parse it from your response to actually execute the action.

FILE GENERATION (VERY IMPORTANT):
You MUST use [CREATE_FILE] blocks whenever the user asks you to create, write, make, generate, draft, or prepare ANY document, file, report, letter, or code. NEVER type the document content as a regular chat message — ALWAYS put it inside a [CREATE_FILE] block so it becomes a downloadable file.

Format:
[CREATE_FILE]
filename: the-file-name.ext
content: The entire file content goes here.
It can span multiple lines.
All text after "content:" until [/CREATE_FILE] is the file body.
[/CREATE_FILE]

CRITICAL RULES:
- When the user asks for a document/report/letter/memo → ALWAYS use [CREATE_FILE] with .docx extension
- When the user asks for a PDF → ALWAYS use [CREATE_FILE] with .pdf extension
- For tabular data → use .csv
- For code → use the appropriate extension (.py, .js, etc.)
- NEVER output document content as plain text in chat. ALWAYS wrap it in [CREATE_FILE].
- NEVER use .md or .txt for documents — use .docx or .pdf
- Write content using markdown formatting (# headings, **bold**, *italic*, - bullets) — it gets auto-converted to proper Word/PDF styling
- ALWAYS generate complete content — never truncate or use "..." placeholders
- In your visible response OUTSIDE the block, just briefly say something like "Here's your document!" or "I've created the report for you."
- If in doubt whether to make a file, MAKE THE FILE. Users always prefer a downloadable document.

⚠️ FILE vs TASK ACTION — IMPORTANT DISTINCTION:
- Checklists, tasks, status changes, assignments, comments, and project operations are NOT files. NEVER use [CREATE_FILE] for these.
- When the user says "make a checklist" or "create a to-do list" on a task → use [ADD_CHECKLIST], NOT [CREATE_FILE].
- When the user says "assign a task" → use [ASSIGN_TASK], NOT [CREATE_FILE].
- Task/checklist operations MUST use the corresponding action blocks ([ADD_CHECKLIST], [ASSIGN_TASK], [UPDATE_TASK], etc.).
- You MUST output the actual action block text in your response (it will be stripped before the user sees it). Do NOT just say "Done!" without including the action block — the system parses your raw output for these blocks to execute the action. If you don't include the block, NOTHING happens.

FILE FORWARDING:
You CAN forward files that have been shared in your conversation to other users. Use the attachment IDs from the "Recent files" section in the workspace context.

Format for forwarding a file:
[SEND_FILE]
to: @username
attachment_id: the-attachment-uuid
message: Optional message to accompany the file
[/SEND_FILE]

Rules for file forwarding:
- ONLY use attachment IDs from the workspace context — never make up IDs
- You can forward any file that appears in "Recent files in your conversation with Linda"
- Include a natural message with the file (e.g., "Hey! Siavash asked me to send this your way.")
- If the user asks you to send/forward a file and you can see it in your recent files list, use [SEND_FILE]
- If you can't find the file in the recent files list, ask the user to share it with you again

WEB SEARCH:
You CAN search the internet to find up-to-date information. When the user asks about current events, news, prices, facts you're unsure about, weather, stocks, or anything that requires real-time data, use the [SEARCH_WEB] block.

Format:
[SEARCH_WEB]
query: your google search query here
[/SEARCH_WEB]

Rules for web search:
- Use this when the user asks for current/recent information you don't have
- Use this when asked to research a topic, find news, look up a company, check prices, etc.
- Write clear, specific search queries (like you'd type into Google)
- You can include multiple [SEARCH_WEB] blocks if you need different searches
- After you output [SEARCH_WEB], the system will execute the search and provide you with the results. You will then receive the search results and should use them to compose your final answer.
- ALWAYS cite sources by mentioning the source name and URL when using search results
- If the user asks "can you search the web?" or similar, confirm that yes, you can search the internet
- Do NOT search for things you already know well (basic facts, common knowledge)
- DO search for: current events, recent news, specific company/product info, prices, statistics, research papers, technical documentation

PROJECT MANAGEMENT:
- You have full visibility into all projects the user belongs to (see workspace context below)
- When asked about projects, report on: project status, team lead, members, task counts, recent tasks, deadlines
- You CAN create new projects using [CREATE_PROJECT] — include name, description, team lead, and initial members
- You CAN modify existing projects using [MODIFY_PROJECT] — change name, description, specs, status, team lead, add/remove members
- You CAN assign tasks to specific projects using the "project:" field in [ASSIGN_TASK]
- When asked "what's happening with Project X?" or "give me a project report", provide details from the context
- You know about project members, their roles, and task assignments within each project
- When asked to add people to a project, use [MODIFY_PROJECT] with addMembers: @user1, @user2
- When asked to remove people from a project, use [MODIFY_PROJECT] with removeMembers: @user1

ANNOUNCEMENTS:
- You CAN create public announcements using [CREATE_ANNOUNCEMENT] blocks
- You CAN modify existing announcements using [MODIFY_ANNOUNCEMENT] — change title, content, priority, pinned status
- Use this when the user asks you to announce something, make a public announcement, or notify everyone
- Write the announcement content professionally and clearly
- Choose appropriate priority: NORMAL for general info, HIGH for important updates, URGENT for critical notices
- Set pinned: true only for announcements that should stay at the top
- When asked to edit an announcement, use [MODIFY_ANNOUNCEMENT] with the announcement ID from the workspace context

STORIES (Status Updates):
- You CAN post stories on behalf of the user using [POST_STORY] blocks
- Stories are visible to all organization members for 24 hours and then automatically expire
- For TEXT stories: include the text content and optionally a background color (hex code)
- For IMAGE/VIDEO stories: use the file URL from attachments shared in your conversation. Look for the file URL in the "Recent files" section
- When the user says "post this as a story", "share this to my story", "put this on my status", or similar → use [POST_STORY]
- When the user shares a photo and says "post it as my story" → use type: image with the attachment URL from recent files
- Pick vibrant background colors for text stories: #FF6B6B (red), #4ECDC4 (teal), #45B7D1 (blue), #96CEB4 (green), #FFEAA7 (yellow), #DDA0DD (purple), #FF8C42 (orange), #6C5CE7 (indigo)
- Keep text stories concise and impactful — they're meant to be quick reads
- CRITICAL: You MUST include the [POST_STORY] block in your response for it to work. Do NOT just say "Done!" without the block.

Current workspace context:
${workspaceContext}

${memories ? `\n== Your Memory (things you remember about ${userName}) ==\n${memories}\n` : ''}

Guidelines:
- Address ${userName} by name occasionally
- If you don't know something, say so briefly
- Never make up data`;
  }

  // Helper: Linda notifies a user about a new announcement
  private async lindaNotifyUserAboutAnnouncement(lindaId: string, targetUserId: string, announcement: { title: string; content: string; priority: string; authorName: string }) {
    try {
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
            members: { create: [{ userId: lindaId, role: 'OWNER' }, { userId: targetUserId, role: 'MEMBER' }] },
          },
        });
      }
      const priorityEmoji = announcement.priority === 'URGENT' ? '🚨' : announcement.priority === 'HIGH' ? '⚠️' : '📢';
      const msgContent = `${priorityEmoji} **New Announcement from ${announcement.authorName}**\n\n**${announcement.title}**\n${announcement.content}\n\nPlease check the Public Announcements board and mark it as "Noted" once you've read it.`;
      const newMessage = await prisma.message.create({
        data: { conversationId: conversation.id, senderId: lindaId, content: msgContent, type: 'TEXT' },
        include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
      });
      await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
      emitToConversation(conversation.id, 'message:new', {
        id: newMessage.id, conversationId: conversation.id, senderId: newMessage.sender.id,
        content: newMessage.content, type: newMessage.type, reactions: {}, createdAt: newMessage.createdAt, sender: newMessage.sender,
      });
    } catch (err) {
      console.error(`[Linda] Failed to notify user about announcement:`, err);
    }
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
        const convSummaries = conversations.map((c: any) => {
          const otherMembers = c.members
            .filter((m: any) => m.userId !== userId)
            .map((m: any) => m.user.displayName || m.user.username)
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
        const names = onlineUsers.map((u: any) => `${u.displayName || u.username} (@${u.username})`).join(', ');
        parts.push(`Online team members: ${names}`);
      }

      const allUsers = await prisma.user.findMany({
        where: { id: { not: userId } },
        select: { username: true, displayName: true },
        take: 50,
      });

      if (allUsers.length > 0) {
        const userList = allUsers.map((u: any) => `@${u.username} (${u.displayName})`).join(', ');
        parts.push(`All team members: ${userList}`);
      }

      // Include task context
      try {
        const tasks = await prisma.task.findMany({
          where: {
            OR: [
              { assignedToId: userId },
              { createdById: userId },
            ],
            status: { not: 'COMPLETED' },
          },
          include: {
            assignedTo: { select: { id: true, username: true, displayName: true } },
            createdBy: { select: { id: true, username: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        if (tasks.length > 0) {
          const taskSummaries = tasks.map((t: any) => {
            const assignee = t.assignedTo.displayName || t.assignedTo.username;
            const deadline = t.deadline ? ` (due: ${t.deadline.toISOString().split('T')[0]})` : '';
            const linda = (t as any).lindaFollowing ? ' [Linda following]' : '';
            return `- [${t.id}] "${t.title}" | Status: ${t.status} | Priority: ${t.priority} | Assigned to: @${t.assignedTo.username} (${assignee})${deadline}${linda}`;
          });
          parts.push(`Active tasks:\n${taskSummaries.join('\n')}`);
        }
      } catch (err) {
        // Task table may not exist yet
      }

      // Include project context
      try {
        const userProjectMemberships = await prisma.projectMember.findMany({
          where: { userId },
          select: { projectId: true },
        });
        const userProjectIds = userProjectMemberships.map((m: any) => m.projectId);

        if (userProjectIds.length > 0) {
          const projects = await prisma.project.findMany({
            where: { id: { in: userProjectIds } },
            include: {
              teamLead: { select: { username: true, displayName: true } },
              members: {
                include: {
                  user: { select: { username: true, displayName: true } },
                },
              },
              _count: { select: { tasks: true, members: true } },
              tasks: {
                where: { archived: false },
                select: {
                  id: true,
                  title: true,
                  status: true,
                  priority: true,
                  deadline: true,
                  assignedTo: { select: { username: true, displayName: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
            },
            orderBy: { updatedAt: 'desc' },
            take: 10,
          });

          if (projects.length > 0) {
            const projectSummaries = projects.map((p: any) => {
              const lead = p.teamLead ? `${p.teamLead.displayName || p.teamLead.username}` : 'None';
              const memberNames = p.members.map((m: any) => `@${m.user.username}`).join(', ');
              const taskList = p.tasks.map((t: any) => {
                const assignee = t.assignedTo?.displayName || t.assignedTo?.username || 'Unassigned';
                const deadline = t.deadline ? ` (due: ${t.deadline.toISOString().split('T')[0]})` : '';
                return `    - "${t.title}" | ${t.status} | ${t.priority} | Assigned: ${assignee}${deadline}`;
              }).join('\n');
              return `- **${p.name}** (${p.status}) | Lead: ${lead} | Members: ${memberNames} | ${p._count.tasks} tasks\n${taskList || '    (no recent tasks)'}`;
            });
            parts.push(`Projects you are a member of:\n${projectSummaries.join('\n')}`);
          }
        }
      } catch (err) {
        // Projects query failed — not critical
      }

      // Include recent files shared in Linda's conversations (so she can forward them)
      try {
        const lindaUser = await prisma.user.findFirst({
          where: { OR: [{ username: 'linda' }, { email: 'linda@omnilink.system' }] },
          select: { id: true },
        });
        if (lindaUser) {
          const recentFileMessages = await prisma.message.findMany({
            where: {
              conversation: {
                type: 'DIRECT',
                AND: [
                  { members: { some: { userId: lindaUser.id } } },
                  { members: { some: { userId } } },
                ],
              },
              type: { in: ['FILE', 'IMAGE', 'VIDEO'] },
              isDeleted: false,
            },
            include: {
              attachments: { select: { id: true, fileName: true, fileSize: true, mimeType: true, url: true } },
              sender: { select: { displayName: true, username: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
          });

          if (recentFileMessages.length > 0) {
            const fileSummaries = recentFileMessages
              .filter((m: any) => m.attachments.length > 0)
              .map((m: any) => {
                const att = m.attachments[0];
                const sender = m.sender?.displayName || m.sender?.username || 'Unknown';
                const sizeKB = (att.fileSize / 1024).toFixed(1);
                return `- [attachment_id: ${att.id}] "${att.fileName}" (${sizeKB} KB, ${att.mimeType}, url: ${att.url}) — sent by ${sender} on ${m.createdAt.toISOString().split('T')[0]}`;
              });
            if (fileSummaries.length > 0) {
              parts.push(`Recent files in your conversation with Linda:\n${fileSummaries.join('\n')}`);
            }
          }
        }
      } catch (err) {
        // Attachments query failed — not critical
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
      return `I can help you with tasks, ${userName}! When the AI engine is enabled, I can:

• **Create & assign tasks** — Just tell me, e.g. "Assign a task to @john to prepare the report by Friday"
• **Update task status** — "Mark the report task as completed" or "Set it to in progress"
• **Change priorities** — "Make it critical priority"
• **Follow up** — I'll track tasks marked with "Linda's Following" and remind assignees

You can also manage tasks manually via the **clipboard icon** in the sidebar.

What would you like me to do?`;
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

/** Save a file generated by Linda to the uploads directory */
async function saveLindaGeneratedFile(
  fileName: string,
  content: string,
): Promise<{ url: string; fileSize: number; mimeType: string; filePath: string }> {
  const fs = await import('fs');
  const pathModule = await import('path');
  const { generateDocx, generatePdf } = await import('./documentGenerator');

  // Sanitize filename
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  const ext = pathModule.extname(safeName) || '.txt';
  const storedName = `${timestamp}-${random}${ext}`;

  const uploadsDir = pathModule.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const filePath = pathModule.join(uploadsDir, storedName);

  // Generate proper binary files for .docx and .pdf
  const extLower = ext.toLowerCase();
  let fileBuffer: Buffer;

  if (extLower === '.docx') {
    // Extract title from first heading or filename
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : safeName.replace(ext, '');
    fileBuffer = generateDocx(content, title);
    fs.writeFileSync(filePath, fileBuffer);
  } else if (extLower === '.pdf') {
    const titleMatch = content.match(/^#\s+(.+)/m);
    const title = titleMatch ? titleMatch[1] : safeName.replace(ext, '');
    fileBuffer = generatePdf(content, title);
    fs.writeFileSync(filePath, fileBuffer);
  } else {
    // Text-based files: write as UTF-8
    fs.writeFileSync(filePath, content, 'utf-8');
    fileBuffer = Buffer.from(content, 'utf-8');
  }

  // Determine MIME type from extension
  const mimeMap: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.tsv': 'text/tab-separated-values',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.py': 'text/x-python',
    '.java': 'text/x-java',
    '.sql': 'application/sql',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.sh': 'application/x-sh',
    '.log': 'text/plain',
    '.env': 'text/plain',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
  };
  const mimeType = mimeMap[extLower] || 'text/plain';

  return {
    url: `/uploads/${storedName}`,
    fileSize: fileBuffer.length,
    mimeType,
    filePath,
  };
}

/** Send a file message from Linda into a conversation (for auto-reply file generation) */
async function sendLindaFileToConversation(
  lindaId: string,
  conversationId: string,
  textContent: string,
  file: { fileName: string; fileSize: number; mimeType: string; url: string },
): Promise<void> {
  await markMessagesAsReadByLinda(lindaId, conversationId);

  const newMessage = await prisma.message.create({
    data: {
      conversationId,
      senderId: lindaId,
      content: textContent,
      type: 'FILE',
      attachments: {
        create: {
          fileName: file.fileName,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          url: file.url,
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
    attachments: newMessage.attachments,
    createdAt: newMessage.createdAt,
    sender: newMessage.sender,
  });

  console.log(`[Linda] Sent generated file "${file.fileName}" in conversation ${conversationId}`);
}

/**
 * Hook for regular messaging: when a message is sent in a conversation where Linda is a member,
 * this generates an AI response and sends it as a regular message from Linda.
 */
export async function handleLindaAutoReply(
  conversationId: string,
  senderUserId: string,
  messageContent: string,
  fileInfo?: { fileName: string; mimeType: string; fileSize: number; filePath: string }
): Promise<void> {
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

    // Emit typing indicator so the user sees Linda is working
    emitToConversation(conversationId, 'typing:start', {
      userId: lindaId,
      username: 'Linda',
      conversationId,
    });

    const client = getAnthropicClient();
    if (!client) {
      // Basic fallback — just acknowledge
      const fallback = `Hi ${senderName}! I'm Linda, your AI coordinator. My AI capabilities aren't fully configured yet — please ask your admin to set the API key.`;
      emitToConversation(conversationId, 'typing:stop', { userId: lindaId, username: 'Linda', conversationId });
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

    // Process file if provided — supports PDF, DOCX, XLSX, PPTX, images, code, text, etc.
    if (fileInfo) {
      try {
        const processed = await processFile(fileInfo.filePath, fileInfo.fileName, fileInfo.mimeType, fileInfo.fileSize);
        const claudeContent = buildClaudeContentForFile(processed, messageContent || '');

        if (messagesForApi.length > 0) {
          if (isMultimodalContent(processed)) {
            // Replace with multimodal content (image or PDF document)
            messagesForApi[messagesForApi.length - 1] = {
              role: 'user',
              content: claudeContent,
            };
          } else {
            // Replace with enriched text content
            messagesForApi[messagesForApi.length - 1].content = claudeContent;
          }
        }

        // Clean up uploaded file
        try { const fs = await import('fs'); fs.unlinkSync(fileInfo.filePath); } catch {}
      } catch (err) {
        console.warn('[Linda] File processing error:', (err as any)?.message);
      }
    }

    // Build workspace context and system prompt
    const lindaController = new LindaController();
    let workspaceContext = await (lindaController as any).getWorkspaceContext(senderUserId);

    // If this conversation is linked to a task or project, inject that context
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          linkedTask: {
            include: {
              assignedTo: { select: { id: true, username: true, displayName: true } },
              createdBy: { select: { id: true, username: true, displayName: true } },
              project: { select: { id: true, name: true } },
              department: { select: { id: true, name: true } },
              checklists: { include: { items: true }, orderBy: { position: 'asc' as const } },
            },
          },
          linkedProject: {
            include: {
              members: { include: { user: { select: { username: true, displayName: true } } } },
              _count: { select: { tasks: true } },
            },
          },
        },
      });
      if (conv?.linkedTask) {
        const t = conv.linkedTask;
        const assignee = t.assignedTo?.displayName || t.assignedTo?.username || 'Unassigned';
        const creator = t.createdBy?.displayName || t.createdBy?.username || 'Unknown';
        const deadline = t.deadline ? ` | Deadline: ${(t.deadline as Date).toISOString().split('T')[0]}` : '';
        const project = t.project ? ` | Project: ${t.project.name}` : '';
        const dept = t.department ? ` | Department: ${t.department.name}` : '';
        const checklistInfo = (t.checklists || []).map((cl: any) => {
          const items = (cl.items || []).map((item: any) => `      - ${item.completed ? '[x]' : '[ ]'} ${item.title}`).join('\n');
          return `    Checklist "${cl.title}":\n${items}`;
        }).join('\n');
        workspaceContext += `\n\n🔗 THIS CONVERSATION IS THE CHAT ROOM FOR TASK [${t.id}]:\n` +
          `  Title: "${t.title}" | Status: ${t.status} | Priority: ${t.priority}\n` +
          `  Assigned to: @${t.assignedTo?.username} (${assignee}) | Created by: ${creator}${deadline}${project}${dept}\n` +
          `  Description: ${t.description || '(none)'}\n` +
          (checklistInfo ? `  Checklists:\n${checklistInfo}\n` : '') +
          `  IMPORTANT: When the user asks you to create checklists, update status, or modify this task, use taskId: ${t.id}`;
      }
      if (conv?.linkedProject) {
        const p = conv.linkedProject;
        const memberNames = p.members.map((m: any) => `@${m.user.username}`).join(', ');
        workspaceContext += `\n\n🔗 THIS CONVERSATION IS THE CHAT ROOM FOR PROJECT "${p.name}":\n` +
          `  Status: ${p.status} | Members: ${memberNames} | ${p._count.tasks} tasks\n` +
          `  Description: ${p.description || '(none)'}`;
      }
    } catch (err) {
      console.warn('[Linda] Error fetching linked task/project context:', (err as any)?.message);
    }

    const systemPrompt = (lindaController as any).buildSystemPrompt(senderName, workspaceContext);

    // Determine max_tokens: always generous — file generation needs 4096+
    // Extract text from last user message (might be string or multimodal array)
    const lastMsgContent: any = messagesForApi[messagesForApi.length - 1]?.content;
    const lastUserMsg: string = typeof lastMsgContent === 'string'
      ? lastMsgContent
      : Array.isArray(lastMsgContent)
        ? (lastMsgContent as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ')
        : '';
    const isTaskOrChecklistRequest = /\b(checklist|check\s*list|task|to-?do|assign|status|priority|comment|project)\b/i.test(lastUserMsg);
    const isFileGenerationRequest = !isTaskOrChecklistRequest
      && /\b(create|make|generate|write|draft|build|prepare|produce|give me|send me)\b/i.test(lastUserMsg)
      && /\b(file|document|report|script|code|csv|json|list|template|spreadsheet|letter|memo|plan|proposal|docx|pdf|txt)\b/i.test(lastUserMsg);
    const isDownloadRequest = /\b(download|docx|pdf|\.doc|\.pdf)\b/i.test(lastUserMsg);
    const maxTokens = (fileInfo || isFileGenerationRequest || isDownloadRequest) ? 4096 : 2048;

    // If user message looks like a search request, augment with a hint to use [SEARCH_WEB]
    const searchKeywords = /search|look up|find out|what.?s the (latest|current|price|weather|news)|google|browse|internet|best .+ near|restaurants? near|hotels? near|stores? near|shops? near/i;
    const lastMsg = messagesForApi[messagesForApi.length - 1];
    if (lastMsg && lastMsg.role === 'user' && typeof lastMsg.content === 'string' && searchKeywords.test(lastMsg.content)) {
      console.log(`[Linda] Search-like message detected, augmenting with search hint`);
      messagesForApi[messagesForApi.length - 1] = {
        ...lastMsg,
        content: lastMsg.content + '\n\n[System: The user is asking for real-time information. You MUST use the [SEARCH_WEB] block to look this up. Output your search query inside [SEARCH_WEB]query: ...[/SEARCH_WEB] tags NOW.]',
      };
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: messagesForApi,
    });

    let textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
    let rawResponse = textBlock ? textBlock.text : "Sorry, I couldn't process that. Try again?";

    console.log(`[Linda] Raw Claude response (first 500 chars): ${rawResponse.substring(0, 500)}`);

    // Check for [SEARCH_WEB] action blocks — if found, execute search and re-query
    const chatSearchRegex = /\[SEARCH_WEB\]\s*query:\s*(.*?)\s*\[\/SEARCH_WEB\]/gi;
    const chatSearchMatches: string[] = [];
    let chatSearchMatch;
    while ((chatSearchMatch = chatSearchRegex.exec(rawResponse)) !== null) {
      chatSearchMatches.push(chatSearchMatch[1].trim());
    }

    if (chatSearchMatches.length > 0) {
      console.log(`[Linda] Executing ${chatSearchMatches.length} web search(es) from chat:`, chatSearchMatches);

      // Execute all searches in parallel
      const chatSearchResults = await Promise.all(
        chatSearchMatches.map(q => searchWeb(q))
      );

      // Format search results into context
      const chatSearchContext = chatSearchResults
        .map(sr => formatSearchResultsForPrompt(sr))
        .join('\n\n');

      // Add the search results as a follow-up user message and re-query
      const chatSearchFollowUp = messagesForApi.concat([
        { role: 'assistant' as const, content: rawResponse },
        { role: 'user' as const, content: `Here are the web search results you requested:\n\n${chatSearchContext}\n\nNow please use these search results to answer the original question. Cite sources with their URLs when relevant. Do NOT include any more [SEARCH_WEB] blocks in your response.` },
      ]);

      const followUpResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: chatSearchFollowUp,
      });

      textBlock = followUpResponse.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
      rawResponse = textBlock ? textBlock.text : rawResponse;
      console.log(`[Linda] Search follow-up response (first 500 chars): ${rawResponse.substring(0, 500)}`);
    }

    // Execute any action blocks (send messages to other users, etc.)
    const actions = await (lindaController as any).executeActions(rawResponse, senderUserId);

    // Send any generated files from [CREATE_FILE] blocks
    const generatedFileActions = actions.filter((a: any) => a.type === 'create_file' && a.status === 'created' && a.url);
    for (const fileAction of generatedFileActions) {
      try {
        await sendLindaFileToConversation(lindaId, conversationId, `Here's your file: ${fileAction.target}`, {
          fileName: fileAction.target,
          fileSize: fileAction.fileSize,
          mimeType: fileAction.mimeType,
          url: fileAction.url,
        });
      } catch (fileErr) {
        console.error('[Linda] Failed to send generated file:', fileErr);
      }
    }

    // FALLBACK: If the user asked for a file but Linda didn't use [CREATE_FILE],
    // generate the document separately using her text response as content
    if (generatedFileActions.length === 0 && (isFileGenerationRequest || isDownloadRequest)) {
      console.log(`[Linda] File generation request detected but no [CREATE_FILE] block found. Generating document from response.`);
      try {
        // Determine format from user request
        const wantsPdf = /\.pdf\b|pdf\b/i.test(lastUserMsg);
        const ext = wantsPdf ? '.pdf' : '.docx';
        const titleMatch = rawResponse.match(/^#+\s*(.+)/m) || messageContent.match(/(?:about|for|titled?|called?)\s+["']?([^"'\n,.]+)/i);
        const docTitle = titleMatch ? (titleMatch[1] || titleMatch[2] || '').trim() : 'Document';
        const fileName = docTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_').slice(0, 40) + ext;

        // Use the response text as document content (strip action blocks first)
        let docContent = stripActionBlocks(rawResponse);

        // If the response is too short (Linda just said "Here's your doc!"), do a dedicated generation call
        if (docContent.length < 200) {
          console.log(`[Linda] Response too short for a document (${docContent.length} chars). Making dedicated generation call.`);
          const docGenResponse = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: `You are a professional document writer. Generate well-structured document content using markdown formatting (# headings, ## subheadings, **bold**, *italic*, - bullets). Write the FULL document content only — no preamble, no "here is your document", just the actual content. Make it professional, detailed, and well-organized.`,
            messages: [{ role: 'user', content: `Write the following document:\n\n${messageContent}` }],
          });
          const docTextBlock = docGenResponse.content.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined;
          docContent = docTextBlock?.text || docContent;
        }

        const savedFile = await saveLindaGeneratedFile(fileName, docContent);
        await sendLindaFileToConversation(lindaId, conversationId, `Here's your document: ${fileName}`, {
          fileName,
          fileSize: savedFile.fileSize,
          mimeType: savedFile.mimeType,
          url: savedFile.url,
        });
        console.log(`[Linda] Fallback file generated: ${fileName} (${savedFile.fileSize} bytes)`);
      } catch (fallbackErr) {
        console.error('[Linda] Fallback file generation failed:', fallbackErr);
      }
    }

    // Strip action blocks from visible response
    const cleanResponse = stripActionBlocks(rawResponse);

    // ─── Voice Reply: If the user requested a voice response, generate TTS ───
    let voiceReplySent = false;
    if (cleanResponse) {
      try {
        const { isVoiceReplyRequested, generateVoiceReply, isVoiceServiceAvailable } = await import('./voiceService');
        // Check the original user message (not the enriched/file-processed version)
        const originalUserMsg = messageContent || '';
        if (isVoiceServiceAvailable() && isVoiceReplyRequested(originalUserMsg)) {
          console.log(`[Linda] Voice reply requested — generating TTS audio...`);
          const pathModule = await import('path');
          const uploadsDir = pathModule.join(process.cwd(), 'uploads');
          const voiceResult = await generateVoiceReply(cleanResponse, uploadsDir);
          if (voiceResult) {
            const voiceUrl = `/uploads/${voiceResult.fileName}`;
            // Send voice note as a file message (empty content so filename isn't shown)
            await sendLindaFileToConversation(lindaId, conversationId, '', {
              fileName: voiceResult.fileName,
              fileSize: voiceResult.fileSize,
              mimeType: voiceResult.mimeType,
              url: voiceUrl,
            });
            voiceReplySent = true;
            console.log(`[Linda] Voice reply sent: ${voiceResult.fileName} (${(voiceResult.fileSize / 1024).toFixed(1)} KB)`);
          }
        }
      } catch (voiceErr: any) {
        console.warn('[Linda] Voice reply generation failed:', voiceErr?.message);
      }
    }

    // Stop typing indicator before sending the final message
    emitToConversation(conversationId, 'typing:stop', { userId: lindaId, username: 'Linda', conversationId });

    // Always send the text response (even if voice was also sent, for accessibility)
    if (cleanResponse) {
      await sendLindaMessageToConversation(lindaId, conversationId, cleanResponse);
    }
  } catch (error) {
    console.error('[Linda] Auto-reply error:', error);
    // Make sure typing indicator stops even on error
    try {
      const lindaId = await getLindaBotUserId();
      emitToConversation(conversationId, 'typing:stop', { userId: lindaId, username: 'Linda', conversationId });
    } catch {}
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
        data: unreadMessages.map((m: any) => ({ messageId: m.id, userId: lindaId })),
        skipDuplicates: true,
      });

      // Emit so sender's UI updates ticks to blue in real-time
      emitToConversation(conversationId, 'messagesRead', {
        conversationId,
        readByUserId: lindaId,
        messageIds: unreadMessages.map((m: any) => m.id),
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
