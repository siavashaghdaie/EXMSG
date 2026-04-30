import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { cacheUtils } from '../config/redis';
import { prisma } from '../config/database';
import { AuthPayload } from '../middleware/auth';

// Linda bot user ID — set by initializeLinda() to avoid circular imports
let _lindaBotUserId: string | null = null;
export function registerLindaBotUserId(id: string) { _lindaBotUserId = id; }

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  orgId?: string | null;
}

let io: Server;

export function initializeSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;

    console.warn(`User connected: ${socket.username} (${userId})`);

    // Set user online in cache
    cacheUtils.setUserOnline(userId);

    // Update database to mark user as online
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: true, lastSeenAt: new Date() },
      });
    } catch (error) {
      console.error('Failed to update user online status in database:', error);
    }

    // Resolve user's organization and join org room
    let orgId: string | null = null;
    try {
      const membership = await prisma.organizationMember.findFirst({
        where: { userId },
        select: { organizationId: true },
        orderBy: { joinedAt: 'asc' },
      });
      orgId = membership?.organizationId || null;
      socket.orgId = orgId;
      if (orgId) {
        socket.join(`org:${orgId}`);
      }
    } catch (error) {
      console.error('Failed to resolve user org for socket:', error);
    }

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    // Auto-join ALL conversation rooms so the user receives real-time events
    // This is more robust than relying on the client to join rooms
    try {
      const userConversations = await prisma.conversationParticipant.findMany({
        where: { userId },
        select: { conversationId: true },
      });
      for (const cp of userConversations) {
        socket.join(`conversation:${cp.conversationId}`);
      }
      console.log(`[Socket] Auto-joined ${userConversations.length} conversation rooms for ${socket.username}`);
    } catch (error) {
      console.error('Failed to auto-join conversation rooms:', error);
    }

    // Broadcast online status to org members only (or all if no org)
    if (orgId) {
      socket.to(`org:${orgId}`).emit('user:online', { userId });
    } else {
      socket.broadcast.emit('user:online', { userId });
    }

    // Send the full list of currently online users (scoped to org) to THIS newly connected client
    try {
      let onlineWhere: any = { isOnline: true };
      if (orgId) {
        // Only show online users from the same org
        const orgMembers = await prisma.organizationMember.findMany({
          where: { organizationId: orgId },
          select: { userId: true },
        });
        const orgMemberIds = orgMembers.map((m: any) => m.userId);
        onlineWhere = { isOnline: true, id: { in: orgMemberIds } };
      }
      const onlineUsers = await prisma.user.findMany({
        where: onlineWhere,
        select: { id: true },
      });
      const onlineUserIds = onlineUsers.map((u: any) => u.id);
      // Include Linda bot if registered
      if (_lindaBotUserId && !onlineUserIds.includes(_lindaBotUserId)) {
        onlineUserIds.push(_lindaBotUserId);
      }
      socket.emit('users:online-list', { userIds: onlineUserIds });
    } catch (err) {
      console.error('Failed to fetch online users list:', err);
      // Fallback: at least tell about Linda
      if (_lindaBotUserId) {
        socket.emit('user:online', { userId: _lindaBotUserId });
      }
    }

    // --- EVENT HANDLERS ---

    // Join a conversation room
    socket.on('conversation:join', (data: string | { conversationId: string }) => {
      const conversationId = typeof data === 'string' ? data : data.conversationId;
      socket.join(`conversation:${conversationId}`);
    });

    // Leave a conversation room
    socket.on('conversation:leave', (data: string | { conversationId: string }) => {
      const conversationId = typeof data === 'string' ? data : data.conversationId;
      socket.leave(`conversation:${conversationId}`);
    });

    // New message - broadcast to conversation members
    socket.on('message:send', (data: { conversationId: string; message: unknown }) => {
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('message:new', data.message);
    });

    // Message edited
    socket.on('message:edit', (data: { conversationId: string; message: unknown }) => {
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('message:edited', data.message);
    });

    // Message deleted
    socket.on('message:delete', (data: { conversationId: string; messageId: string }) => {
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('message:deleted', { messageId: data.messageId });
    });

    // Typing indicator
    socket.on('typing:start', async (data: string | { conversationId: string }) => {
      const conversationId = typeof data === 'string' ? data : data.conversationId;
      await cacheUtils.setTyping(userId, conversationId);
      socket
        .to(`conversation:${conversationId}`)
        .emit('typing:start', { userId, username: socket.username, conversationId });
    });

    socket.on('typing:stop', (data: string | { conversationId: string }) => {
      const conversationId = typeof data === 'string' ? data : data.conversationId;
      socket
        .to(`conversation:${conversationId}`)
        .emit('typing:stop', { userId, username: socket.username, conversationId });
    });

    // Read receipt
    socket.on('message:read', (data: { conversationId: string; messageId: string }) => {
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('message:read', { userId, messageId: data.messageId });
    });

    // Reaction
    socket.on('reaction:add', (data: { conversationId: string; messageId: string; emoji: string }) => {
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('reaction:added', { userId, ...data });
    });

    socket.on('reaction:remove', (data: { conversationId: string; messageId: string; emoji: string }) => {
      socket
        .to(`conversation:${data.conversationId}`)
        .emit('reaction:removed', { userId, ...data });
    });

    // Buzz - Yahoo Messenger style attention grab
    socket.on('buzz:send', (data: { conversationId: string; targetUserId?: string }) => {
      const buzzData = {
        senderId: userId,
        senderName: socket.username,
        conversationId: data.conversationId,
        targetUserId: data.targetUserId,
        timestamp: new Date().toISOString()
      };
      // Send to the conversation room (excluding sender)
      socket.to(`conversation:${data.conversationId}`).emit('buzz:received', buzzData);
      // Also send to the specific target user's personal room if specified
      if (data.targetUserId) {
        socket.to(`user:${data.targetUserId}`).emit('buzz:received', buzzData);
      }
    });

    // --- Helper: create a SYSTEM message in a conversation and broadcast it ---
    async function postCallSystemMessage(conversationId: string | null, senderId: string, content: string) {
      if (!conversationId) return;
      try {
        const msg = await prisma.message.create({
          data: {
            conversationId,
            senderId,
            content,
            type: 'SYSTEM',
          },
          include: { sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
        });
        io.to(`conversation:${conversationId}`).emit('message:new', msg);
        // Touch the conversation so it sorts to top (updatedAt is auto-managed by @updatedAt)
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      } catch (err) {
        console.error('[Call] Failed to post system message:', err);
      }
    }

    // --- WEBRTC CALL SIGNALING (with DB tracking) ---

    // Initiate a call — creates a Call record and rings the target
    socket.on('call:initiate', async (data: { conversationId: string; targetUserId: string; callType: 'audio' | 'video' }) => {
      try {
        // Org-scoping: verify caller and target are in the same organization
        if (orgId) {
          const targetMembership = await prisma.organizationMember.findFirst({
            where: { userId: data.targetUserId, organizationId: orgId },
            select: { id: true },
          });
          if (!targetMembership) {
            socket.emit('call:error', { message: 'Cannot call users outside your organization' });
            return;
          }
        }

        // Check if target user is online
        const targetUser = await prisma.user.findUnique({
          where: { id: data.targetUserId },
          select: { id: true, isOnline: true, displayName: true, username: true },
        });

        // Get caller info
        const caller = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, displayName: true, username: true, avatarUrl: true },
        });

        // Create call record in DB
        const call = await (prisma as any).call.create({
          data: {
            callerId: userId,
            calleeId: data.targetUserId,
            conversationId: data.conversationId || null,
            type: data.callType,
            status: 'RINGING',
          },
        });

        const callData = {
          callId: call.id,
          callerId: userId,
          callerName: caller?.displayName || caller?.username || socket.username,
          callerAvatar: caller?.avatarUrl || null,
          conversationId: data.conversationId,
          callType: data.callType,
          timestamp: new Date().toISOString(),
        };

        // Send to the target user's personal room
        io.to(`user:${data.targetUserId}`).emit('call:incoming', callData);

        // Also confirm to the caller with the callId
        socket.emit('call:initiated', callData);

        // Auto-expire the call after 45 seconds if not answered
        setTimeout(async () => {
          try {
            const currentCall = await (prisma as any).call.findUnique({ where: { id: call.id } });
            if (currentCall && currentCall.status === 'RINGING') {
              await (prisma as any).call.update({
                where: { id: call.id },
                data: { status: 'MISSED', endedAt: new Date() },
              });
              io.to(`user:${userId}`).emit('call:missed', { callId: call.id, targetUserId: data.targetUserId });
              io.to(`user:${data.targetUserId}`).emit('call:expired', { callId: call.id });

              // Post "Missed call" system message in the conversation
              const callerName = caller?.displayName || caller?.username || 'Someone';
              const callTypeEmoji = data.callType === 'video' ? '📹' : '📞';
              await postCallSystemMessage(data.conversationId, userId, `${callTypeEmoji} Missed ${data.callType} call from ${callerName}`);

              // Linda missed-call notification
              try {
                const { sendLindaDM } = await import('./lindaNotify');
                const callerDisplayName = caller?.displayName || caller?.username || 'Someone';
                sendLindaDM(data.targetUserId, `📞 **Missed Call**\n\nYou missed a ${data.callType} call from **${callerDisplayName}**.`).catch(() => {});
              } catch {}
            }
          } catch (err) {
            console.error('[Call] Auto-expire error:', err);
          }
        }, 45000);
      } catch (err) {
        console.error('[Call] Initiate error:', err);
        socket.emit('call:error', { message: 'Failed to initiate call' });
      }
    });

    // Accept a call
    socket.on('call:accept', async (data: { callId: string; targetUserId: string }) => {
      try {
        await (prisma as any).call.update({
          where: { id: data.callId },
          data: { status: 'ACTIVE', startedAt: new Date() },
        });

        const accepter = await prisma.user.findUnique({
          where: { id: userId },
          select: { displayName: true, username: true, avatarUrl: true },
        });

        io.to(`user:${data.targetUserId}`).emit('call:accepted', {
          callId: data.callId,
          accepterId: userId,
          accepterName: accepter?.displayName || accepter?.username || socket.username,
          accepterAvatar: accepter?.avatarUrl || null,
        });
      } catch (err) {
        console.error('[Call] Accept error:', err);
      }
    });

    // Reject a call
    socket.on('call:reject', async (data: { callId: string; targetUserId: string; reason?: string }) => {
      try {
        const call = await (prisma as any).call.findUnique({ where: { id: data.callId } });
        await (prisma as any).call.update({
          where: { id: data.callId },
          data: { status: data.reason === 'busy' ? 'BUSY' : 'REJECTED', endedAt: new Date() },
        });
        io.to(`user:${data.targetUserId}`).emit('call:rejected', {
          callId: data.callId,
          rejecterId: userId,
          reason: data.reason || 'declined',
        });

        // Post system message in conversation
        if (call?.conversationId) {
          const callTypeEmoji = call.type === 'video' ? '📹' : '📞';
          const reasonText = data.reason === 'busy' ? 'User was busy' : 'Call declined';
          await postCallSystemMessage(call.conversationId, userId, `${callTypeEmoji} ${reasonText}`);
        }
      } catch (err) {
        console.error('[Call] Reject error:', err);
      }
    });

    // End a call
    socket.on('call:end', async (data: { callId: string; targetUserId: string }) => {
      try {
        const call = await (prisma as any).call.findUnique({ where: { id: data.callId } });
        let duration = 0;
        if (call) {
          duration = call.startedAt ? Math.round((Date.now() - new Date(call.startedAt).getTime()) / 1000) : 0;
          await (prisma as any).call.update({
            where: { id: data.callId },
            data: { status: 'ENDED', endedAt: new Date(), duration },
          });
        }
        io.to(`user:${data.targetUserId}`).emit('call:ended', {
          callId: data.callId,
          enderId: userId,
        });

        // Post system message with call duration
        if (call?.conversationId) {
          const callTypeEmoji = call.type === 'video' ? '📹' : '📞';
          if (duration > 0) {
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
            await postCallSystemMessage(call.conversationId, userId, `${callTypeEmoji} ${call.type === 'video' ? 'Video' : 'Voice'} call · ${durationStr}`);
          } else {
            await postCallSystemMessage(call.conversationId, userId, `${callTypeEmoji} Call ended`);
          }
        }
      } catch (err) {
        console.error('[Call] End error:', err);
      }
    });

    // ICE candidate exchange
    socket.on('call:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:ice-candidate', {
        senderId: userId,
        candidate: data.candidate,
      });
    });

    // WebRTC offer (SDP)
    socket.on('call:offer', (data: { targetUserId: string; offer: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:offer', {
        senderId: userId,
        offer: data.offer,
      });
    });

    // WebRTC answer (SDP)
    socket.on('call:answer', (data: { targetUserId: string; answer: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:answer', {
        senderId: userId,
        answer: data.answer,
      });
    });

    // Legacy signal relay (backward compat)
    socket.on('call:signal', (data: { targetUserId: string; signal: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:signal', {
        senderId: userId,
        signal: data.signal,
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.warn(`User disconnected: ${socket.username}`);

      // Set user offline in cache
      await cacheUtils.setUserOffline(userId);

      // Update database to mark user as offline
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { isOnline: false, lastSeenAt: new Date() },
        });
      } catch (error) {
        console.error('Failed to update user offline status in database:', error);
      }

      // Broadcast offline status to org members only (or all if no org)
      if (socket.orgId) {
        socket.to(`org:${socket.orgId}`).emit('user:offline', { userId });
      } else {
        socket.broadcast.emit('user:offline', { userId });
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

// Helper to emit to specific user
export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data);
}

// Helper to emit to conversation
export function emitToConversation(
  conversationId: string,
  event: string,
  data: unknown,
): void {
  getIO().to(`conversation:${conversationId}`).emit(event, data);
}
