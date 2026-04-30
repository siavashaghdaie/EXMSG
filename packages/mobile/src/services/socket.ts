import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/config/api';

// ─── Event Types ─────────────────────────────────────────────────────────────

interface TypingEvent {
  conversationId: string;
  userId: string;
  username: string;
}

interface MessageEvent {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  reactions: Record<string, string[]>;
  createdAt: string;
}

interface MessageEditedEvent {
  id: string;
  conversationId: string;
  content: string;
  editedAt: string;
}

interface MessageDeletedEvent {
  id: string;
  conversationId: string;
}

interface ReactionEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
  added: boolean;
}

interface UserStatusEvent {
  userId: string;
  status: 'online' | 'offline';
  lastSeen?: string;
}

// ─── Socket.io Client Service ────────────────────────────────────────────────

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventListeners: Map<string, Set<Function>> = new Map();

  /**
   * Connect to the Socket.io server with authentication
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io(SOCKET_URL, {
        auth: {
          token,
        },
        reconnection: true,
        reconnectionDelay: this.reconnectDelay,
        reconnectionAttempts: this.maxReconnectAttempts,
        transports: ['websocket', 'polling'],
      });

      this.socket.on('connect', () => {
        this.reconnectAttempts = 0;
        console.log('[Socket] Connected to server');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[Socket] Disconnected:', reason);
        this.emit('socket:disconnect', { reason });
      });

      this.socket.on('reconnect_attempt', () => {
        this.reconnectAttempts++;
        console.log(`[Socket] Reconnection attempt ${this.reconnectAttempts}`);
      });

      this.socket.on('reconnect', () => {
        this.reconnectAttempts = 0;
        console.log('[Socket] Reconnected to server');
        this.emit('socket:reconnect', {});
      });

      this.socket.on('error', (error) => {
        console.error('[Socket] Error:', error);
        this.emit('socket:error', { error });
      });

      // ─── Custom event listeners ───────────────────────────────────────

      this.socket.on('message:new', (data: MessageEvent) => {
        this.emit('message:new', data);
      });

      this.socket.on('message:edited', (data: MessageEditedEvent) => {
        this.emit('message:edited', data);
      });

      this.socket.on('message:deleted', (data: MessageDeletedEvent) => {
        this.emit('message:deleted', data);
      });

      this.socket.on('typing:start', (data: TypingEvent) => {
        this.emit('typing:start', data);
      });

      this.socket.on('typing:stop', (data: TypingEvent) => {
        this.emit('typing:stop', data);
      });

      this.socket.on('reaction:added', (data: ReactionEvent) => {
        this.emit('reaction:added', data);
      });

      this.socket.on('reaction:removed', (data: ReactionEvent) => {
        this.emit('reaction:removed', data);
      });

      this.socket.on('user:status', (data: UserStatusEvent) => {
        this.emit('user:status', data);
      });

      this.socket.on('user:online', (data: { userId: string }) => {
        this.emit('user:online', data);
      });

      this.socket.on('user:offline', (data: { userId: string }) => {
        this.emit('user:offline', data);
      });

      this.socket.on('users:online-list', (data: { userIds: string[] }) => {
        this.emit('users:online-list', data);
      });

      this.socket.on('conversation:created', (data: any) => {
        this.emit('conversation:created', data);
      });

      this.socket.on('conversation:updated', (data: any) => {
        this.emit('conversation:updated', data);
      });

      this.socket.on('buzz:received', (data: any) => {
        this.emit('buzz:received', data);
      });

      this.socket.on('messagesRead', (data: any) => {
        this.emit('messagesRead', data);
      });

      // ─── Call signaling events ──────────────────────────────────────
      this.socket.on('call:initiated', (data: any) => {
        this.emit('call:initiated', data);
      });

      this.socket.on('call:incoming', (data: any) => {
        this.emit('call:incoming', data);
      });

      this.socket.on('call:accepted', (data: any) => {
        this.emit('call:accepted', data);
      });

      this.socket.on('call:rejected', (data: any) => {
        this.emit('call:rejected', data);
      });

      this.socket.on('call:ended', (data: any) => {
        this.emit('call:ended', data);
      });

      this.socket.on('call:expired', (data: any) => {
        this.emit('call:expired', data);
      });

      this.socket.on('call:missed', (data: any) => {
        this.emit('call:missed', data);
      });

      this.socket.on('call:offer', (data: any) => {
        this.emit('call:offer', data);
      });

      this.socket.on('call:answer', (data: any) => {
        this.emit('call:answer', data);
      });

      this.socket.on('call:ice-candidate', (data: any) => {
        this.emit('call:ice-candidate', data);
      });

      this.socket.on('call:signal', (data: any) => {
        this.emit('call:signal', data);
      });
    });
  }

  /**
   * Disconnect from the Socket.io server
   */
  disconnect(): void {
    if (this.socket?.connected) {
      this.socket.disconnect();
    }
    this.socket = null;
    // NOTE: Do NOT clear eventListeners here.
    // Listeners are managed by setupChatSocketListeners / setupPresenceSocketListeners
    // which return their own cleanup functions. Clearing here would break reconnect flows.
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Join a conversation room
   */
  joinConversation(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:join', { conversationId });
    }
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:leave', { conversationId });
    }
  }

  /**
   * Emit typing start event
   */
  emitTypingStart(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('typing:start', { conversationId });
    }
  }

  /**
   * Emit typing stop event
   */
  emitTypingStop(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('typing:stop', { conversationId });
    }
  }

  /**
   * Send a BUZZ to get someone's attention (Yahoo Messenger style)
   */
  sendBuzz(conversationId: string, targetUserId?: string): void {
    if (this.socket?.connected) {
      this.socket.emit('buzz:send', { conversationId, targetUserId });
    }
  }

  /**
   * Register event listener
   */
  on<T = any>(event: string, callback: (data: T) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  /**
   * Register one-time event listener
   */
  once<T = any>(event: string, callback: (data: T) => void): void {
    const unsubscribe = this.on<T>(event, (data) => {
      callback(data);
      unsubscribe();
    });
  }

  /**
   * Emit custom event to all listeners
   */
  private emit<T = any>(event: string, data: T): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          (callback as Function)(data);
        } catch (error) {
          console.error(`[Socket] Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event
   */
  off(event: string): void {
    this.eventListeners.delete(event);
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this.eventListeners.clear();
  }

  /**
   * Request to mark messages as read
   */
  markAsRead(conversationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('conversation:mark-as-read', { conversationId });
    }
  }

  // ─── Call signaling emitters ──────────────────────────────────────

  emitCallInitiate(data: { conversationId: string; targetUserId: string; callType: 'audio' | 'video'; offer?: any }): void {
    this.socket?.emit('call:initiate', data);
  }

  emitCallAccept(data: { callId: string; targetUserId: string }): void {
    this.socket?.emit('call:accept', data);
  }

  emitCallReject(data: { callId: string; targetUserId: string; reason?: string }): void {
    this.socket?.emit('call:reject', data);
  }

  emitCallEnd(data: { callId: string; targetUserId: string }): void {
    this.socket?.emit('call:end', data);
  }

  emitCallOffer(data: { targetUserId: string; offer: any }): void {
    this.socket?.emit('call:offer', data);
  }

  emitCallAnswer(data: { targetUserId: string; answer: any }): void {
    this.socket?.emit('call:answer', data);
  }

  emitCallIceCandidate(data: { targetUserId: string; candidate: any }): void {
    this.socket?.emit('call:ice-candidate', data);
  }

  /**
   * Get socket instance (for advanced usage)
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
export const socket = new SocketService();

export type {
  TypingEvent,
  MessageEvent,
  MessageEditedEvent,
  MessageDeletedEvent,
  ReactionEvent,
  UserStatusEvent,
};
