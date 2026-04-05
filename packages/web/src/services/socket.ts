import { io, Socket } from 'socket.io-client';

// Event Types
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

// Socket.io Client Service
class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // These are internal socket event listeners that dispatch to custom events
  }

  /**
   * Connect to the Socket.io server with authentication
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // In production, connect to the same host (nginx proxies /socket.io/ to backend)
      // In development, connect to localhost:3001
      const socketURL = import.meta.env.VITE_SOCKET_URL || (
        import.meta.env.PROD ? window.location.origin : 'http://localhost:3001'
      );

      this.socket = io(socketURL, {
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

      // Custom event listeners
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

      this.socket.on('conversation:created', (data: any) => {
        this.emit('conversation:created', data);
      });

      this.socket.on('conversation:updated', (data: any) => {
        this.emit('conversation:updated', data);
      });

      this.socket.on('buzz:received', (data: any) => {
        this.emit('buzz:received', data);
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
    this.eventListeners.clear();
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
