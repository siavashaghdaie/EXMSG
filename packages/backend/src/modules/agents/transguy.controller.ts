/**
 * TransGuy Auto-Reply Controller
 *
 * When TransGuy is a member of a conversation, it automatically translates
 * incoming messages and sends the translation as a reply. It detects the
 * source language and translates to the other participants' preferred
 * language (or English by default).
 */

import { prisma } from '../../config/database';
import { emitToConversation } from '../../services/socket';
import { translateText, detectLanguage } from '../../services/translationService';

const TRANSGUY_EMAIL = 'transguy@omnilink.system';

// Cooldown to avoid translating TransGuy's own messages or rapid-fire loops
const recentTranslations = new Map<string, number>();
const COOLDOWN_MS = 2000;

/**
 * Called after a message is sent in a conversation.
 * Checks if TransGuy is a participant and auto-translates the message.
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

  // Don't translate TransGuy's own messages
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
  const lastTranslation = recentTranslations.get(cooldownKey);
  if (lastTranslation && Date.now() - lastTranslation < COOLDOWN_MS) return;
  recentTranslations.set(cooldownKey, Date.now());

  // Clean up old cooldown entries periodically
  if (recentTranslations.size > 500) {
    const now = Date.now();
    for (const [key, time] of recentTranslations) {
      if (now - time > 60000) recentTranslations.delete(key);
    }
  }

  try {
    // Get the sender's info
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true, username: true },
    });

    // Detect the source language
    const detectedLang = await detectLanguage(content);
    if (!detectedLang) return; // Can't detect = can't translate

    // Get all other participants (non-TransGuy, non-sender)
    const otherMembers = await prisma.conversationMember.findMany({
      where: {
        conversationId,
        userId: { notIn: [transguyUser.id, senderId] },
      },
      include: {
        user: { select: { id: true, displayName: true, username: true } },
      },
    });

    // Determine target language — use the conversation's translate setting,
    // or default to English if sender's language is not English,
    // or the detected language if sender is English
    let targetLang = 'English';

    // Check if any member has a translateLang preference
    const memberWithPref = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: { notIn: [transguyUser.id] },
        translateLang: { not: null },
      },
    });

    if (memberWithPref?.translateLang) {
      targetLang = memberWithPref.translateLang;
    } else {
      // Smart default: if the detected language IS the target, pick another
      const langLower = detectedLang.toLowerCase();
      if (langLower === 'en' || langLower === 'english') {
        // Message is already in English — try translating to Farsi/Persian
        // since this is an Iranian-developed app, or skip if no obvious target
        // Actually, let's just skip if the message is already in the target language
        return;
      }
    }

    // Don't translate if source and target are the same
    const sourceLangName = detectedLang.toLowerCase();
    const targetLangLower = targetLang.toLowerCase();
    if (
      sourceLangName === targetLangLower ||
      (sourceLangName === 'en' && targetLangLower === 'english') ||
      (sourceLangName === 'english' && targetLangLower === 'en')
    ) {
      return;
    }

    // Emit typing indicator
    emitToConversation(conversationId, 'typing:start', {
      userId: transguyUser.id,
      username: transguyUser.username,
      displayName: transguyUser.displayName,
    });

    // Translate the message
    const result = await translateText(content, targetLang);

    // Stop typing
    emitToConversation(conversationId, 'typing:stop', {
      userId: transguyUser.id,
    });

    if (!result.translatedText || result.translatedText === content) {
      return; // Translation didn't change anything
    }

    // Build the reply content with language info
    const senderName = sender?.displayName || sender?.username || 'Someone';
    const langLabel = result.detectedSourceLanguage?.toUpperCase() || detectedLang.toUpperCase();
    const replyContent = `🌐 *${senderName}* said (${langLabel} → ${targetLang}):\n\n${result.translatedText}`;

    // Create the message in DB
    const transMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId: transguyUser.id,
        content: replyContent,
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
      id: transMessage.id,
      conversationId,
      senderId: transMessage.sender.id,
      content: transMessage.content,
      type: transMessage.type,
      metadata: transMessage.metadata,
      reactions: {},
      createdAt: transMessage.createdAt,
      sender: transMessage.sender,
    });

    console.log(`[TransGuy] Translated message in conv ${conversationId}: ${langLabel} → ${targetLang}`);
  } catch (err) {
    console.error('[TransGuy] Auto-reply error:', err);
    // Stop typing indicator on error
    emitToConversation(conversationId, 'typing:stop', {
      userId: undefined,
    });
  }
}
