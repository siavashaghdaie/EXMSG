// Socket.io event types for type-safe real-time communication

export interface ServerToClientEvents {
  'message:new': (message: unknown) => void;
  'message:edited': (message: unknown) => void;
  'message:deleted': (data: { messageId: string }) => void;
  'message:read': (data: { userId: string; messageId: string }) => void;
  'typing:update': (data: { userId: string; username: string; isTyping: boolean }) => void;
  'user:online': (data: { userId: string }) => void;
  'user:offline': (data: { userId: string }) => void;
  'reaction:added': (data: { userId: string; conversationId: string; messageId: string; emoji: string }) => void;
  'reaction:removed': (data: { userId: string; conversationId: string; messageId: string; emoji: string }) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (conversationId: string) => void;
  'conversation:leave': (conversationId: string) => void;
  'message:send': (data: { conversationId: string; message: unknown }) => void;
  'message:edit': (data: { conversationId: string; message: unknown }) => void;
  'message:delete': (data: { conversationId: string; messageId: string }) => void;
  'message:read': (data: { conversationId: string; messageId: string }) => void;
  'typing:start': (conversationId: string) => void;
  'typing:stop': (conversationId: string) => void;
  'reaction:add': (data: { conversationId: string; messageId: string; emoji: string }) => void;
  'reaction:remove': (data: { conversationId: string; messageId: string; emoji: string }) => void;
}
