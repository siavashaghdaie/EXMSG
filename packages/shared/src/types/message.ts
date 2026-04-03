export type MessageType = 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE' | 'VIDEO' | 'SYSTEM' | 'POLL';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  type: MessageType;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  replyTo: {
    id: string;
    content: string | null;
    sender: { displayName: string };
  } | null;
  readReceipts: { userId: string; readAt: string }[];
}

export interface MessageAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  user: { id: string; displayName: string };
}

export interface SendMessagePayload {
  content: string;
  type?: MessageType;
  replyToId?: string;
}
