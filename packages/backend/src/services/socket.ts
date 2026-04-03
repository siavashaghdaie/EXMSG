import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { cacheUtils } from '../config/redis';
import { AuthPayload } from '../middleware/auth';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
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

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;

    console.warn(`User connected: ${socket.username} (${userId})`);

    // Set user online
    cacheUtils.setUserOnline(userId);

    // Join user's personal room for direct notifications
    socket.join(`user:${userId}`);

    // Broadcast online status
    socket.broadcast.emit('user:online', { userId });

    // --- EVENT HANDLERS ---

    // Join a conversation room
    socket.on('conversation:join', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    // Leave a conversation room
    socket.on('conversation:leave', (conversationId: string) => {
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
    socket.on('typing:start', async (conversationId: string) => {
      await cacheUtils.setTyping(userId, conversationId);
      socket
        .to(`conversation:${conversationId}`)
        .emit('typing:update', { userId, username: socket.username, isTyping: true });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket
        .to(`conversation:${conversationId}`)
        .emit('typing:update', { userId, username: socket.username, isTyping: false });
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

    // Disconnect
    socket.on('disconnect', async () => {
      console.warn(`User disconnected: ${socket.username}`);
      await cacheUtils.setUserOffline(userId);
      socket.broadcast.emit('user:offline', { userId });
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
