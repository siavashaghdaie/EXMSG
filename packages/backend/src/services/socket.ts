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

    // --- WEBRTC CALL SIGNALING ---

    // Initiate a call
    socket.on('call:initiate', (data: { conversationId: string; targetUserId: string; callType: 'audio' | 'video'; offer?: any }) => {
      const callData = {
        callerId: userId,
        callerName: socket.username,
        conversationId: data.conversationId,
        callType: data.callType,
        offer: data.offer,
        timestamp: new Date().toISOString(),
      };
      // Send to the target user's personal room
      io.to(`user:${data.targetUserId}`).emit('call:incoming', callData);
    });

    // Accept a call
    socket.on('call:accept', (data: { conversationId: string; targetUserId: string; answer?: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:accepted', {
        accepterId: userId,
        accepterName: socket.username,
        conversationId: data.conversationId,
        answer: data.answer,
      });
    });

    // Reject a call
    socket.on('call:reject', (data: { conversationId: string; targetUserId: string; reason?: string }) => {
      io.to(`user:${data.targetUserId}`).emit('call:rejected', {
        rejecterId: userId,
        conversationId: data.conversationId,
        reason: data.reason || 'declined',
      });
    });

    // End a call
    socket.on('call:end', (data: { conversationId: string; targetUserId: string }) => {
      io.to(`user:${data.targetUserId}`).emit('call:ended', {
        enderId: userId,
        conversationId: data.conversationId,
      });
    });

    // ICE candidate exchange
    socket.on('call:ice-candidate', (data: { targetUserId: string; candidate: any }) => {
      io.to(`user:${data.targetUserId}`).emit('call:ice-candidate', {
        senderId: userId,
        candidate: data.candidate,
      });
    });

    // WebRTC offer/answer exchange
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
