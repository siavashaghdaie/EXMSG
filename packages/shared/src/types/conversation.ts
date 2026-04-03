export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';
export type ConvRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  description: string | null;
  avatarUrl: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  members: ConversationMember[];
  lastMessage?: {
    id: string;
    content: string | null;
    type: string;
    createdAt: string;
    sender: { id: string; displayName: string };
  };
}

export interface ConversationMember {
  id: string;
  userId: string;
  role: ConvRole;
  isMuted: boolean;
  joinedAt: string;
  lastReadAt: string | null;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    isOnline?: boolean;
  };
}

export interface CreateConversationPayload {
  type: ConversationType;
  name?: string;
  description?: string;
  memberIds: string[];
}
