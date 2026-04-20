/**
 * Shared utility for sending Linda bot DM notifications.
 * Reusable across tasks, announcements, and other modules.
 */
import { prisma } from '../config/database';
import { emitToConversation } from './socket';

const LINDA_EMAIL = 'linda@omnilink.system';

/** Get (or create) the Linda bot user ID */
export async function getLindaBotUserId(): Promise<string> {
  let lindaUser = await prisma.user.findFirst({
    where: { email: LINDA_EMAIL },
    select: { id: true },
  });
  if (!lindaUser) {
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash(`linda-bot-${Date.now()}-${Math.random()}`, 10);
    lindaUser = await prisma.user.create({
      data: {
        email: LINDA_EMAIL,
        username: 'linda',
        displayName: 'Linda AI',
        passwordHash: hash,
        bio: 'AI Coordinator',
        isOnline: true,
        status: 'Always here to help!',
      },
      select: { id: true },
    });
  }
  return lindaUser.id;
}

/**
 * Send a direct message from Linda to a specific user.
 * Creates the DM conversation if it doesn't exist yet.
 */
export async function sendLindaDM(
  targetUserId: string,
  content: string
): Promise<void> {
  try {
    const lindaId = await getLindaBotUserId();

    // Don't message Linda herself
    if (targetUserId === lindaId) return;

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

    const newMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
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
    console.error(`[Linda] Failed to send DM to user ${targetUserId}:`, err);
  }
}
