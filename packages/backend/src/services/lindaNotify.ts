/**
 * Shared utility for sending Linda bot DM notifications.
 * Reusable across tasks, announcements, and other modules.
 */
import { prisma } from '../config/database';
import { emitToConversation } from './socket';

const LINDA_EMAIL = 'linda@omnilink.system';

/** Get (or create) the Linda bot user ID — handles race conditions gracefully */
export async function getLindaBotUserId(): Promise<string> {
  let lindaUser = await prisma.user.findFirst({
    where: { email: LINDA_EMAIL },
    select: { id: true },
  });
  if (!lindaUser) {
    try {
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.hash(`linda-bot-${Date.now()}-${Math.random()}`, 10);
      lindaUser = await prisma.user.create({
        data: {
          email: LINDA_EMAIL,
          username: 'linda',
          displayName: 'Linda AI',
          passwordHash: hash,
          bio: 'Hi! I\'m Linda, your AI assistant. I can help you with tasks, documents, and more.',
          isOnline: true,
          status: 'Always here to help!',
          emailVerified: true,
        },
        select: { id: true },
      });
    } catch (err: any) {
      // Handle race condition: another process created Linda between our findFirst and create
      if (err.code === 'P2002') {
        lindaUser = await prisma.user.findFirst({
          where: { email: LINDA_EMAIL },
          select: { id: true },
        });
        if (!lindaUser) throw new Error('Failed to find or create Linda bot user');
      } else {
        throw err;
      }
    }
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

/**
 * Send a message from Linda into an existing GROUP conversation (e.g. a task chat room).
 * Also ensures Linda is a member of the conversation.
 */
export async function sendLindaToConversation(
  conversationId: string,
  content: string
): Promise<void> {
  try {
    const lindaId = await getLindaBotUserId();

    // Ensure Linda is a member of this conversation
    await ensureLindaInConversation(conversationId, lindaId);

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
  } catch (err) {
    console.error(`[Linda] Failed to send message to conversation ${conversationId}:`, err);
  }
}

/**
 * Ensure Linda bot is a member of the given conversation.
 * If not already a member, adds her.
 */
export async function ensureLindaInConversation(
  conversationId: string,
  lindaId?: string
): Promise<void> {
  const botId = lindaId || await getLindaBotUserId();
  const existing = await prisma.conversationMember.findFirst({
    where: { conversationId, userId: botId },
  });
  if (!existing) {
    await prisma.conversationMember.create({
      data: { conversationId, userId: botId, role: 'MEMBER' },
    });
  }
}

/**
 * Collect ALL user IDs related to a task: creator, assignee, co-assignees, checklist item assignees.
 * Excludes duplicates and the optional `excludeUserId` (the person making the change).
 */
export function getAllTaskRelatedUserIds(task: any, excludeUserId?: string): string[] {
  const ids = new Set<string>();

  if (task.createdById) ids.add(task.createdById);
  if (task.assignedToId) ids.add(task.assignedToId);

  if (Array.isArray(task.coAssigneeIds)) {
    task.coAssigneeIds.forEach((id: string) => ids.add(id));
  }

  // Checklist item assignees
  if (Array.isArray(task.checklists)) {
    for (const cl of task.checklists) {
      if (Array.isArray(cl.items)) {
        for (const item of cl.items) {
          if (Array.isArray(item.assigneeIds)) {
            item.assigneeIds.forEach((id: string) => ids.add(id));
          }
        }
      }
    }
  }

  if (excludeUserId) ids.delete(excludeUserId);
  return Array.from(ids);
}
