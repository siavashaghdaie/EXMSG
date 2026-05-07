/**
 * TransGuy Auto-Reply Controller
 *
 * TransGuy is an AI agent who loves languages and translation. He converses
 * naturally like a human (similar to Linda) but has a passion for languages.
 * He translates when asked, and may offer translation help when he notices
 * multilingual content — but he does NOT automatically translate every message.
 * He's friendly, witty, and multilingual.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../../config/database';
import { emitToConversation } from '../../services/socket';
import { env } from '../../config/env';

const TRANSGUY_EMAIL = 'transguy@omnilink.system';

// Cooldown to avoid replying to own messages or rapid-fire loops
const recentReplies = new Map<string, number>();
const COOLDOWN_MS = 3000;

// In-memory conversation history per conversation (lightweight — no DB table needed)
const conversationHistories = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();
const MAX_HISTORY = 20;

// Anthropic client
let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn('[TransGuy] ANTHROPIC_API_KEY not set — falling back to basic mode');
    return null;
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

const TRANSGUY_SYSTEM_PROMPT = `You are TransGuy, a friendly and witty AI language assistant in a corporate messenger app called Exclusive Messenger. You are part of the team — think of yourself as the resident polyglot colleague.

PERSONALITY:
- You are warm, approachable, and naturally conversational — like a real team member
- You have a passion for languages, linguistics, and cross-cultural communication
- You're knowledgeable about idioms, cultural nuances, and regional expressions
- You use occasional humor and are genuinely enthusiastic about helping people communicate
- You speak naturally — NOT like a translation machine
- You can chat about anything, not just translation

BEHAVIOR RULES:
- When someone sends a message in a conversation, respond naturally as a colleague would
- If someone asks you to translate something, do it happily and naturally
- If someone writes in a non-English language, you can acknowledge it and offer to translate, but DON'T automatically translate unless asked
- If someone asks "how do you say X in Y language", help them
- If someone just chats normally, chat back normally — you're a person, not a translation bot
- You can discuss language learning tips, grammar questions, cultural differences, etc.
- Keep responses concise — this is a chat messenger, not an essay
- If asked about your gender, deflect playfully — you're an AI and it doesn't matter
- NEVER start your messages with emojis like "🌐" or format them like "X said (LANG → LANG):" — that's robotic
- Respond in the same language the user writes to you in, unless they ask for a different language

EXAMPLES OF GOOD BEHAVIOR:
- User: "Hey TransGuy, how's it going?" → "Hey! Going great, just geeking out over some Swahili verb conjugations. What's up?"
- User: "Can you translate 'the meeting is at 3pm' to Spanish?" → "Sure! 'La reunión es a las 3 de la tarde.' Need anything else?"
- User: "سلام، حالت چطوره؟" → "سلام! ممنون، خوبم. تو چطوری؟ کاری داری کمکت کنم؟"
- User: "What does 'schadenfreude' mean?" → "It's a German word for the pleasure you get from someone else's misfortune. There's no single English word for it — the Germans just nailed it! 😄"
- User: "I need this email translated to French and Japanese" → Translate it to both and present them clearly

IMPORTANT: You are NOT a translation machine. You are a multilingual colleague who happens to be amazing at languages. Act like a human.`;

/**
 * Called after a message is sent in a conversation.
 * Checks if TransGuy is a participant and generates an AI response.
 */
export async function handleTransGuyAutoReply(
  conversationId: string,
  senderId: string,
  content: string,
): Promise<void> {
  if (!content || !content.trim()) return;

  // Find TransGuy's user account
  const transguyUser = await prisma.user.findFirst({
    where: { email: TRANSGUY_EMAIL },
  });
  if (!transguyUser) return;

  // Don't reply to TransGuy's own messages
  if (senderId === transguyUser.id) return;

  // Check if TransGuy is a member of this conversation
  const transguyMember = await prisma.conversationMember.findFirst({
    where: {
      conversationId,
      userId: transguyUser.id,
    },
  });
  if (!transguyMember) return;

  // Cooldown check to prevent loops
  const cooldownKey = `${conversationId}:${senderId}`;
  const lastReply = recentReplies.get(cooldownKey);
  if (lastReply && Date.now() - lastReply < COOLDOWN_MS) return;
  recentReplies.set(cooldownKey, Date.now());

  // Clean up old cooldown entries periodically
  if (recentReplies.size > 500) {
    const now = Date.now();
    for (const [key, time] of recentReplies) {
      if (now - time > 60000) recentReplies.delete(key);
    }
  }

  try {
    // Get the sender's info
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true, username: true },
    });
    const senderName = sender?.displayName || sender?.username || 'there';

    // Emit typing indicator
    emitToConversation(conversationId, 'typing:start', {
      userId: transguyUser.id,
      username: transguyUser.username || 'TransGuy',
      conversationId,
    });

    const client = getAnthropicClient();

    if (!client) {
      // Fallback when no API key
      const fallback = `Hey ${senderName}! I'm TransGuy, your multilingual buddy. My AI brain isn't fully wired up yet — ask your admin to set the API key so I can help with translations and chat properly!`;
      emitToConversation(conversationId, 'typing:stop', { userId: transguyUser.id, conversationId });
      await sendTransGuyMessage(transguyUser.id, conversationId, fallback);
      return;
    }

    // Build conversation history from recent messages in this conversation
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
      const role = msg.senderId === transguyUser.id ? 'assistant' : 'user';
      const msgContent = msg.content || '';
      if (!msgContent.trim()) continue;

      // For user messages from others, prefix with their name for context
      const displayContent = role === 'user' && msg.sender
        ? `[${msg.sender.displayName || msg.sender.username || 'User'}]: ${msgContent}`
        : msgContent;

      // Merge consecutive same-role messages
      if (messagesForApi.length > 0 && messagesForApi[messagesForApi.length - 1].role === role) {
        messagesForApi[messagesForApi.length - 1].content += '\n' + displayContent;
      } else {
        messagesForApi.push({ role, content: displayContent });
      }
    }

    // Ensure conversation ends with user role (required by Claude API)
    while (messagesForApi.length > 0 && messagesForApi[messagesForApi.length - 1].role !== 'user') {
      messagesForApi.pop();
    }
    if (messagesForApi.length === 0) {
      messagesForApi.push({ role: 'user', content: `[${senderName}]: ${content}` });
    }

    // Call Claude API
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: TRANSGUY_SYSTEM_PROMPT,
      messages: messagesForApi,
    });

    // Stop typing indicator
    emitToConversation(conversationId, 'typing:stop', {
      userId: transguyUser.id,
      conversationId,
    });

    const textBlock = response.content.find((block: { type: string }) => block.type === 'text') as { type: 'text'; text: string } | undefined;
    const replyContent = textBlock?.text?.trim();

    if (!replyContent) return;

    // Send the reply
    await sendTransGuyMessage(transguyUser.id, conversationId, replyContent);

    console.log(`[TransGuy] Replied in conv ${conversationId} to ${senderName}`);
  } catch (err: any) {
    console.error('[TransGuy] Auto-reply error:', err?.message || err);
    // Stop typing indicator on error
    emitToConversation(conversationId, 'typing:stop', {
      userId: transguyUser?.id,
      conversationId,
    });
  }
}

/**
 * Send a message as TransGuy in a conversation.
 */
async function sendTransGuyMessage(
  transguyId: string,
  conversationId: string,
  content: string,
): Promise<void> {
  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: transguyId,
      content,
      type: 'TEXT',
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

  // Emit to conversation room
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
}
