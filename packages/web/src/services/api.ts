import axios, { AxiosInstance, AxiosError } from 'axios';

// Types
interface AuthResponse {
  user: {
    id: string;
    email: string;
    username: string;
    avatar?: string;
    bio?: string;
  };
  accessToken: string;
  refreshToken: string;
}

interface VerificationRequiredResponse {
  requiresVerification: true;
  email: string;
  message?: string;
  error?: string;
  userId?: string;
  /** True when the server created an Organization alongside the user. */
  isPanelOwner?: boolean;
}

interface LoginOtpRequiredResponse {
  requiresOtp: true;
  purpose: 'login';
  email: string;
  message?: string;
}

/**
 * Returned by /auth/verify when the user is a Panel Owner newcomer. Per
 * spec 2.3.5, Panel Owners are NOT auto-logged-in after email verification;
 * they must complete a fresh login. This response contains no tokens.
 */
interface VerifiedRequiresLoginResponse {
  requiresLogin: true;
  email: string;
  message?: string;
  user?: { id: string; email: string; username: string };
}

interface OtpVerifyResponse extends AuthResponse {}

type RegisterResponse = AuthResponse | VerificationRequiredResponse;
export type LoginResponse = AuthResponse | LoginOtpRequiredResponse;
export type VerifyOtpResponse = OtpVerifyResponse | VerifiedRequiresLoginResponse;

function isVerificationRequired(data: any): data is VerificationRequiredResponse {
  return data && data.requiresVerification === true;
}

export function isLoginOtpRequired(data: any): data is LoginOtpRequiredResponse {
  return data && data.requiresOtp === true;
}

export function isVerifiedRequiresLogin(data: any): data is VerifiedRequiresLoginResponse {
  return data && data.requiresLogin === true;
}

// Subscription plan catalog types (mirror of backend plans.ts).
export type PlanId = 'starter' | 'professional' | 'business' | 'enterprise';

export interface PlanDefinition {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceAnnual: number;
  seatLimit: number;
  storageGb: number;
  aiAgentHours: number;
  prioritySupport: boolean;
  ssoEnabled: boolean;
  features: string[];
  publiclySelfServable: boolean;
  recommended: boolean;
  ctaLabel: string;
}

export interface RegisterOptions {
  companyName?: string;
  plan?: PlanId;
}

interface MessageAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
}

interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
  metadata?: string;
  reactions: Record<string, string[]>;
  attachments?: MessageAttachment[];
  editedAt?: string;
  readBy?: Record<string, string>;
  deliveredAt?: string;
  createdAt: string;
  sender?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  replyTo?: {
    id: string;
    content: string;
    sender?: {
      displayName: string;
    };
  };
}

interface ConversationResponse {
  id: string;
  name?: string;
  type?: 'DIRECT' | 'GROUP' | 'CHANNEL';
  participants: Array<{
    id: string;
    email: string;
    username: string;
    displayName?: string;
    avatar?: string;
  }>;
  lastMessage?: MessageResponse;
  unreadCount: number;
  linkedTask?: { id: string; title: string; archived?: boolean; deleted?: boolean } | null;
  linkedProject?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedMessages {
  messages: MessageResponse[];
  cursor?: string;
  hasMore: boolean;
}

interface SearchUsersResponse {
  id: string;
  email: string;
  username: string;
  avatar?: string;
  bio?: string;
}

interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatar?: string;
  avatarUrl?: string;
  bio?: string;
  status?: string;
  role?: string;               // System role: 'SUPER_ADMIN' | 'USER'
  orgRole?: string | null;     // Org membership role: 'OWNER' | 'ADMIN' | 'MEMBER'
  organizationId?: string | null;
  createdAt?: string;
}

interface LindaConversationSummary {
  id: string;
  title: string;
  isOwn: boolean;
  ownerName: string;
  ownerEmail?: string;
  ownerAvatar?: string;
  relatedUsers?: Array<{ id: string; name: string }>;
  lastMessage?: { content: string; role: string; createdAt: string };
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface LindaMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  hasAttachment?: boolean;
  attachmentName?: string;
  createdAt: string;
}

export interface LindaActivity {
  id: string;
  actionType: string;
  status: string;
  summary: string;
  details: any;
  targetUser?: { id: string; username: string; displayName: string; avatarUrl?: string } | null;
  createdAt: string;
}

export interface LindaMemory {
  id: string;
  category: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface StatusItem {
  id: string;
  type: 'text' | 'image' | 'video';
  content: string;
  bgColor?: string;
  caption?: string;
  viewCount: number;
  viewedByMe: boolean;
  likeCount?: number;
  likedByMe?: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface StatusLikeUser {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface UserStatusGroup {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  statuses: StatusItem[];
  hasUnviewed: boolean;
  latestAt: string;
}

export interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  pinned: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  noted?: boolean;
  notedAt?: string | null;
  reads?: Array<{
    userId: string;
    noted: boolean;
    notedAt?: string | null;
    user: { id: string; username: string; displayName: string; avatarUrl?: string };
  }>;
  likeCount?: number;
  dislikeCount?: number;
  userReaction?: 'like' | 'dislike' | null;
  commentCount?: number;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
}

// API Client Class
class APIClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    const baseURL = import.meta.env.VITE_API_URL || '/api';

    this.client = axios.create({
      baseURL,
      timeout: 10000,
      withCredentials: true,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor: inject auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: handle 401 and refresh token
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        const isAuthEndpoint =
          originalRequest?.url?.includes('/auth/login') ||
          originalRequest?.url?.includes('/auth/register') ||
          originalRequest?.url?.includes('/auth/refresh') ||
          originalRequest?.url?.includes('/auth/verify') ||
          originalRequest?.url?.includes('/auth/verify-login') ||
          originalRequest?.url?.includes('/auth/resend-otp') ||
          originalRequest?.url?.includes('/auth/plans') ||
          originalRequest?.url?.includes('/auth/accept-invite') ||
          originalRequest?.url?.includes('/auth/set-password') ||
          originalRequest?.url?.includes('/super-admin/login') ||
          originalRequest?.url?.includes('/super-admin/verify-login');
        if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (_refreshError) {
            // Refresh failed — silently log the user out. Never propagate
            // raw internal errors like "Session expired" to callers;
            // instead, the auth:logout event triggers a clean redirect.
            this.clearTokens();
            window.dispatchEvent(new CustomEvent('auth:logout'));
            // Reject with the ORIGINAL 401 error (not the refresh error)
            // so callers see a clean "Unauthorized" response, not an
            // internal "No refresh token" message.
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private getAccessToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  private getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  private clearTokens(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  private async refreshAccessToken(): Promise<string> {
    // Prevent multiple concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
          throw new Error('Session expired');
        }

        const response = await axios.post<AuthResponse>(
          `${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`,
          { refreshToken },
          { timeout: 10000 }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        this.setTokens(accessToken, newRefreshToken);
        return accessToken;
      } finally {
        // Always clear the cached promise so future calls get a fresh attempt
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Auth API
  async register(
    email: string,
    displayName: string,
    password: string,
    options?: RegisterOptions
  ): Promise<RegisterResponse> {
    const payload: Record<string, unknown> = {
      email,
      displayName,
      password,
    };
    if (options?.companyName) payload.companyName = options.companyName;
    if (options?.plan) payload.plan = options.plan;
    const response = await this.client.post<RegisterResponse>('/auth/register', payload);
    if (isVerificationRequired(response.data)) {
      return response.data;
    }
    const data = response.data as AuthResponse;
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async getPlans(): Promise<{ plans: PlanDefinition[] }> {
    const response = await this.client.get<{ plans: PlanDefinition[] }>('/auth/plans');
    return response.data;
  }

  // ─── Invite Flow ───────────────────────────────────────────────

  async acceptInvite(token: string): Promise<{
    valid: boolean;
    invite?: {
      email: string;
      orgName: string;
      displayName: string | null;
      inviterName: string;
      role: string;
    };
    error?: string;
  }> {
    const response = await this.client.get('/auth/accept-invite', { params: { token } });
    return response.data;
  }

  async setPassword(token: string, password: string): Promise<{
    success: boolean;
    email: string;
    message: string;
  }> {
    const response = await this.client.post('/auth/set-password', { token, password });
    return response.data;
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    // If the server requires OTP, do NOT store tokens — the client must
    // complete /auth/verify-login first.
    if (isLoginOtpRequired(response.data)) {
      return response.data;
    }
    const data = response.data as AuthResponse;
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const response = await this.client.post<VerifyOtpResponse>('/auth/verify', {
      email,
      code,
    });
    // Panel Owners are NOT auto-logged-in (spec 2.3.5). They must return
    // to the login page. Do not attempt to read/store tokens in this case.
    if (isVerifiedRequiresLogin(response.data)) {
      return response.data;
    }
    const data = response.data as OtpVerifyResponse;
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async verifyLoginOtp(email: string, code: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/verify-login', {
      email,
      code,
    });
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  async resendOtp(email: string, purpose: 'register' | 'login' = 'register'): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/resend-otp', {
      email,
      purpose,
    });
    return response.data;
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/refresh', {
      refreshToken,
    });
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    this.setTokens(accessToken, newRefreshToken);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } finally {
      this.clearTokens();
    }
  }

  async getMe(): Promise<UserProfile> {
    const response = await this.client.get('/auth/me');
    // Backend returns { user: { ... } }, unwrap it
    return response.data.user || response.data;
  }

  // Helper to normalize backend conversation shape to frontend ConversationResponse
  private normalizeConversation(conv: any): ConversationResponse {
    // Backend returns "members" with nested user objects; frontend expects "participants"
    const participants = (conv.members || conv.participants || []).map((m: any) => {
      const user = m.user || m;
      return {
        id: user.id,
        email: user.email || '',
        username: user.username || user.displayName || 'Unknown',
        displayName: user.displayName || undefined,
        avatar: user.avatarUrl || user.avatar,
      };
    });

    // Backend returns messages array with latest first; frontend expects lastMessage
    const lastMsg = conv.messages?.[0] || conv.lastMessage;
    const lastMessage: MessageResponse | undefined = lastMsg ? {
      id: lastMsg.id,
      content: lastMsg.content,
      senderId: lastMsg.sender?.id || lastMsg.senderId || '',
      conversationId: conv.id,
      createdAt: lastMsg.createdAt,
      reactions: {},
    } : undefined;

    return {
      id: conv.id,
      name: conv.name || undefined,
      type: conv.type || undefined,
      participants,
      lastMessage,
      unreadCount: conv.unreadCount || 0,
      linkedTask: conv.linkedTask || null,
      linkedProject: conv.linkedProject || null,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  // Messaging API
  async getConversations(skip: number = 0, limit: number = 20): Promise<ConversationResponse[]> {
    const response = await this.client.get('/conversations', {
      params: { skip, limit },
    });
    // Backend returns { conversations: [...] } — unwrap and normalize
    const raw = response.data.conversations || response.data;
    const conversations = Array.isArray(raw) ? raw : [];
    return conversations.map((c: any) => this.normalizeConversation(c));
  }

  async createConversation(
    participantIds: string[],
    name?: string
  ): Promise<ConversationResponse> {
    // Backend expects { type, memberIds, name, description }
    const type = participantIds.length === 1 && !name ? 'DIRECT' : 'GROUP';
    const response = await this.client.post(
      '/conversations',
      {
        type,
        memberIds: participantIds,
        name: name || undefined,
      }
    );
    // Backend returns { conversation: {...} } — unwrap and normalize
    const raw = response.data.conversation || response.data;
    return this.normalizeConversation(raw);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.client.delete(`/conversations/${conversationId}`);
  }

  async getMessages(
    conversationId: string,
    cursor?: string,
    limit: number = 50
  ): Promise<PaginatedMessages> {
    const response = await this.client.get(
      `/conversations/${conversationId}/messages`,
      {
        params: { cursor, limit },
      }
    );
    // Backend returns { messages, nextCursor }; frontend expects { messages, cursor, hasMore }
    const data = response.data;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];
    // Normalize backend message shape to frontend MessageResponse
    const messages: MessageResponse[] = rawMessages.map((m: any) => {
      // Convert readReceipts array to readBy map
      const readBy: Record<string, string> = {};
      if (Array.isArray(m.readReceipts)) {
        m.readReceipts.forEach((r: any) => {
          readBy[r.userId] = r.readAt;
        });
      }
      return {
        id: m.id,
        conversationId: m.conversationId || conversationId,
        senderId: m.sender?.id || m.senderId || '',
        content: m.content,
        type: m.type,
        metadata: m.metadata,
        attachments: m.attachments,
        reactions: m.reactions || {},
        readBy: Object.keys(readBy).length > 0 ? readBy : undefined,
        deliveredAt: m.deliveredAt,
        editedAt: m.editedAt,
        createdAt: m.createdAt,
        sender: m.sender,
        replyTo: m.replyTo,
      };
    });
    return {
      messages,
      cursor: data.nextCursor || data.cursor,
      hasMore: !!data.nextCursor || !!data.hasMore,
    };
  }

  async sendMessage(conversationId: string, content: string, replyToId?: string, storyReply?: { storyId: string; storyContent: string; storyType: string; storyBgColor?: string }): Promise<MessageResponse> {
    const response = await this.client.post(
      `/conversations/${conversationId}/messages`,
      { content, replyToId, ...(storyReply ? { type: 'STORY_REPLY', storyReply } : {}) }
    );
    // Backend returns { message: {...} } — unwrap and normalize
    const raw = response.data.message || response.data;
    return {
      id: raw.id,
      conversationId: raw.conversationId || conversationId,
      senderId: raw.sender?.id || raw.senderId || '',
      content: raw.content,
      type: raw.type,
      metadata: raw.metadata,
      attachments: raw.attachments,
      reactions: {},
      editedAt: raw.editedAt,
      createdAt: raw.createdAt,
      sender: raw.sender,
      replyTo: raw.replyTo,
    };
  }

  async uploadFile(conversationId: string, file: File, onProgress?: (progress: number) => void): Promise<MessageResponse> {
    const formData = new FormData();
    formData.append('file', file);

    // Don't set Content-Type manually — axios sets the correct multipart boundary automatically
    const response = await this.client.post(
      `/conversations/${conversationId}/upload`,
      formData,
      {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
            onProgress(progress);
          }
        },
      }
    );
    // Backend returns { message: {...} } — unwrap and normalize
    const raw = response.data.message || response.data;
    return {
      id: raw.id,
      conversationId: raw.conversationId || conversationId,
      senderId: raw.sender?.id || raw.senderId || '',
      content: raw.content,
      type: raw.type,
      attachments: raw.attachments,
      reactions: {},
      editedAt: raw.editedAt,
      createdAt: raw.createdAt,
      sender: raw.sender,
    };
  }

  async editMessage(_conversationId: string, messageId: string, content: string): Promise<MessageResponse> {
    const response = await this.client.put<MessageResponse>(
      `/messages/${messageId}`,
      { content }
    );
    return response.data;
  }

  async deleteMessage(_conversationId: string, messageId: string): Promise<void> {
    await this.client.delete(`/messages/${messageId}`);
  }

  async addReaction(
    _conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>(
      `/messages/${messageId}/reactions`,
      { emoji }
    );
    return response.data;
  }

  async removeReaction(
    _conversationId: string,
    messageId: string,
    emoji: string
  ): Promise<MessageResponse> {
    const response = await this.client.delete<MessageResponse>(
      `/messages/${messageId}/reactions/${emoji}`
    );
    return response.data;
  }

  async markAsRead(conversationId: string, messageId?: string): Promise<void> {
    await this.client.post(
      `/conversations/${conversationId}/read`,
      messageId ? { messageId } : {}
    );
  }

  // User API
  async searchUsers(query: string, limit: number = 20): Promise<SearchUsersResponse[]> {
    const response = await this.client.get<SearchUsersResponse[]>('/users/search', {
      params: { query, limit },
    });
    return response.data;
  }

  async updateProfile(updates: Partial<{ displayName: string; username: string; avatar: string; bio: string }>): Promise<UserProfile> {
    const response = await this.client.patch<UserProfile>('/users/profile', updates);
    return response.data;
  }

  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('avatar', file);
    // Don't set Content-Type manually — axios sets the correct multipart boundary automatically
    const response = await this.client.post<{ avatarUrl: string }>('/users/avatar', formData);
    return response.data;
  }

  // Message Pinning API
  async pinMessage(conversationId: string, messageId: string): Promise<void> {
    await this.client.post(`/conversations/${conversationId}/pins`, { messageId });
  }

  async unpinMessage(conversationId: string, messageId: string): Promise<void> {
    await this.client.delete(`/conversations/${conversationId}/pins/${messageId}`);
  }

  async getPinnedMessages(conversationId: string): Promise<MessageResponse[]> {
    const response = await this.client.get(`/conversations/${conversationId}/pins`);
    const pins = response.data.pins || [];
    return pins.map((pin: any) => {
      const msg = pin.message || pin;
      return {
        id: msg.id,
        conversationId: msg.conversationId || conversationId,
        senderId: msg.sender?.id || msg.senderId || '',
        content: msg.content,
        reactions: msg.reactions || {},
        createdAt: msg.createdAt,
        sender: msg.sender,
        replyTo: msg.replyTo,
      };
    });
  }

  // Message Search API
  async searchMessages(query: string, conversationId?: string): Promise<MessageResponse[]> {
    const response = await this.client.get('/messages/search', {
      params: { query, conversationId, limit: 30 },
    });
    const rawMessages = response.data.messages || [];
    return rawMessages.map((m: any) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.sender?.id || m.senderId || '',
      content: m.content,
      type: m.type,
      attachments: m.attachments,
      reactions: m.reactions || {},
      createdAt: m.createdAt,
      sender: m.sender,
      replyTo: m.replyTo,
    }));
  }

  // Message Forwarding API
  async forwardMessage(messageId: string, targetConversationIds: string[]): Promise<void> {
    await this.client.post(`/messages/${messageId}/forward`, { targetConversationIds });
  }

  // Linda AI Secretary API
  async chatWithLinda(message: string, conversationId?: string): Promise<{
    response: string;
    timestamp: string;
    conversationId: string;
    actions?: Array<{ type: string; target: string; status: string }>;
    generatedFiles?: Array<{ fileName: string; fileSize: number; mimeType: string; url: string }>;
  }> {
    const res = await this.client.post('/linda/chat', { message, conversationId }, { timeout: 60000 });
    return res.data;
  }

  async chatWithLindaFile(file: File, message?: string, conversationId?: string): Promise<{ response: string; timestamp: string; conversationId: string; generatedFiles?: Array<{ fileName: string; fileSize: number; mimeType: string; url: string }> }> {
    const formData = new FormData();
    formData.append('file', file);
    if (message) formData.append('message', message);
    if (conversationId) formData.append('conversationId', conversationId);
    const res = await this.client.post('/linda/chat/file', formData, {
      timeout: 60000,
    });
    return res.data;
  }

  async getLindaGreeting(): Promise<{ greeting: string; suggestions: string[] }> {
    const res = await this.client.get('/linda/greeting');
    return res.data;
  }

  async getLindaConversations(): Promise<{ conversations: LindaConversationSummary[] }> {
    const res = await this.client.get('/linda/conversations');
    return res.data;
  }

  async getAllLindaConversations(): Promise<{ conversations: LindaConversationSummary[] }> {
    const res = await this.client.get('/linda/conversations/all');
    return res.data;
  }

  async getLindaConversationMessages(conversationId: string): Promise<{
    conversation: { id: string; ownerName: string; isOwn: boolean };
    messages: LindaMessageData[];
  }> {
    const res = await this.client.get(`/linda/conversations/${conversationId}/messages`);
    return res.data;
  }

  async checkLindaManager(): Promise<{ isManager: boolean }> {
    const res = await this.client.get('/linda/manager-check');
    return res.data;
  }

  async getLindaActivities(): Promise<{ activities: LindaActivity[] }> {
    const res = await this.client.get('/linda/activities');
    return res.data;
  }

  async getLindaMemories(): Promise<{ memories: LindaMemory[] }> {
    const res = await this.client.get('/linda/memories');
    return res.data;
  }

  async deleteLindaMemory(memoryId: string): Promise<void> {
    await this.client.delete(`/linda/memories/${memoryId}`);
  }

  // Task Management API
  async getTasks(params?: { status?: string; view?: string; departmentId?: string; projectId?: string; archived?: string; deleted?: string; showAll?: string }): Promise<any[]> {
    const res = await this.client.get('/tasks', { params });
    return res.data.tasks || [];
  }

  async createTask(data: { title: string; description?: string; assignedToId?: string; deadline?: string; priority?: string; labels?: string[]; lindaFollowing?: boolean; lindaFollowInterval?: string; visibleToDepartmentIds?: string[]; departmentId?: string; projectId?: string; projectName?: string }): Promise<any> {
    const res = await this.client.post('/tasks', data);
    return res.data.task;
  }

  async updateTask(taskId: string, data: any): Promise<any> {
    const res = await this.client.patch(`/tasks/${taskId}`, data);
    return res.data.task;
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.client.delete(`/tasks/${taskId}`);
  }

  async restoreTask(taskId: string): Promise<any> {
    const res = await this.client.post(`/tasks/${taskId}/restore`);
    return res.data.task;
  }

  async createTaskConversation(taskId: string): Promise<{ conversationId: string }> {
    const res = await this.client.post(`/tasks/${taskId}/conversation`);
    return res.data;
  }

  // Admin API
  async getAdminDashboard(): Promise<any> {
    const res = await this.client.get('/admin/dashboard');
    return res.data;
  }

  async getAdminStats(): Promise<any> {
    const res = await this.client.get('/admin/stats');
    return res.data;
  }

  async getAdminUsers(search?: string, page = 1, limit = 20): Promise<any> {
    const res = await this.client.get('/admin/users', { params: { search, page, limit } });
    return res.data;
  }

  // Org Admin API
  async getOrgAdminDashboard(orgId?: string): Promise<any> {
    const res = await this.client.get('/org-admin/dashboard', { params: { orgId } });
    return res.data;
  }

  async getOrgAdminMembers(search?: string, page = 1, limit = 20, orgId?: string): Promise<any> {
    const res = await this.client.get('/org-admin/members', { params: { search, page, limit, orgId } });
    return res.data;
  }

  async getOrgAdminMemberActivity(userId: string, orgId?: string): Promise<any> {
    const res = await this.client.get(`/org-admin/member/${userId}/activity`, { params: { orgId } });
    return res.data;
  }

  async getOrgAdminMessages(page?: number, memberId?: string, search?: string, limit?: number, orgId?: string): Promise<any> {
    const res = await this.client.get('/org-admin/messages', {
      params: { page: page || 1, limit: limit || 20, memberId, search, orgId },
    });
    return res.data;
  }

  async getOrgAdminDailyReport(date?: string, orgId?: string): Promise<any> {
    const res = await this.client.get('/org-admin/reports/daily', { params: { date, orgId } });
    return res.data;
  }

  async getOrgAdminTaskReport(orgId?: string): Promise<any> {
    const res = await this.client.get('/org-admin/reports/tasks', { params: { orgId } });
    return res.data;
  }

  async getOrgAdminOrganization(orgId?: string): Promise<any> {
    const res = await this.client.get('/org-admin/organization', { params: { orgId } });
    return res.data;
  }

  async listOrgAdminOrganizations(): Promise<{ organizations: any[] }> {
    const res = await this.client.get('/org-admin/organizations');
    return res.data;
  }

  async createOrgAdminOrganization(data: { name: string; slug?: string; description?: string }): Promise<any> {
    const res = await this.client.post('/org-admin/organizations', data);
    return res.data;
  }

  async addOrgAdminMember(
    data: {
      email: string;
      displayName?: string;
      username?: string;
      password?: string;
      role?: 'OWNER' | 'ADMIN' | 'MEMBER';
    },
    orgId?: string
  ): Promise<any> {
    const res = await this.client.post('/org-admin/members', data, { params: { orgId } });
    return res.data;
  }

  async updateOrgAdminMemberRole(userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER', orgId?: string): Promise<any> {
    const res = await this.client.patch(`/org-admin/members/${userId}`, { role }, { params: { orgId } });
    return res.data;
  }

  async removeOrgAdminMember(userId: string, orgId?: string): Promise<void> {
    await this.client.delete(`/org-admin/members/${userId}`, { params: { orgId } });
  }

  async resendOrgAdminInvite(userId: string, orgId?: string): Promise<{ success: boolean; message: string; email: string }> {
    const res = await this.client.post(`/org-admin/members/${userId}/resend-invite`, {}, { params: { orgId } });
    return res.data;
  }

  // ─── Project Management ────────────────────────────────────────────────
  async getProjects(params?: { status?: string; search?: string }): Promise<{ projects: any[] }> {
    const res = await this.client.get('/projects', { params });
    return res.data;
  }

  async getProject(projectId: string): Promise<{ project: any }> {
    const res = await this.client.get(`/projects/${projectId}`);
    return res.data;
  }

  async createProject(data: { name: string; description?: string; specsAndGoals?: string; gitUrl?: string; storageUrl?: string; teamLeadId?: string; memberIds?: string[] }): Promise<any> {
    const res = await this.client.post('/projects', data);
    return res.data;
  }

  async updateProject(projectId: string, data: Record<string, any>): Promise<any> {
    const res = await this.client.patch(`/projects/${projectId}`, data);
    return res.data;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.client.delete(`/projects/${projectId}`);
  }

  async findOrCreateProject(name: string): Promise<{ project: any; created: boolean }> {
    const res = await this.client.post('/projects/find-or-create', { name });
    return res.data;
  }

  async addProjectMember(projectId: string, userId: string, role?: string): Promise<any> {
    const res = await this.client.post(`/projects/${projectId}/members`, { userId, role });
    return res.data;
  }

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    await this.client.delete(`/projects/${projectId}/members/${userId}`);
  }

  async getProjectMates(): Promise<{ mates: any[] }> {
    const res = await this.client.get('/projects/mates');
    return res.data;
  }

  // ─── Checklist Management ───────────────────────────────────────────────
  async getChecklists(params: { taskId?: string; projectId?: string }): Promise<{ checklists: any[] }> {
    const res = await this.client.get('/checklists', { params });
    return res.data;
  }

  async createChecklist(data: { taskId?: string; projectId?: string; title: string }): Promise<any> {
    const res = await this.client.post('/checklists', data);
    return res.data.checklist;
  }

  async updateChecklist(checklistId: string, data: { title?: string }): Promise<any> {
    const res = await this.client.patch(`/checklists/${checklistId}`, data);
    return res.data;
  }

  async deleteChecklist(checklistId: string): Promise<void> {
    await this.client.delete(`/checklists/${checklistId}`);
  }

  async addChecklistItem(checklistId: string, data: { title: string; assigneeId?: string; assigneeIds?: string[]; dueDate?: string }): Promise<any> {
    const res = await this.client.post(`/checklists/${checklistId}/items`, data);
    return res.data;
  }

  async updateChecklistItem(checklistId: string, itemId: string, data: { title?: string; completed?: boolean; assigneeId?: string; assigneeIds?: string[]; dueDate?: string; position?: number }): Promise<any> {
    const res = await this.client.patch(`/checklists/${checklistId}/items/${itemId}`, data);
    return res.data;
  }

  async deleteChecklistItem(checklistId: string, itemId: string): Promise<void> {
    await this.client.delete(`/checklists/${checklistId}/items/${itemId}`);
  }

  async toggleChecklistItem(checklistId: string, itemId: string): Promise<any> {
    const res = await this.client.post(`/checklists/${checklistId}/items/${itemId}/toggle`);
    return res.data;
  }

  // ─── Task Reactions & Comments ──────────────────────────────────────────
  async reactToTask(taskId: string, type: 'like' | 'dislike'): Promise<any> {
    const res = await this.client.post(`/tasks/${taskId}/react`, { type });
    return res.data;
  }

  async getTaskComments(taskId: string): Promise<{ comments: any[] }> {
    const res = await this.client.get(`/tasks/${taskId}/comments`);
    return res.data;
  }

  async addTaskComment(taskId: string, content: string): Promise<any> {
    const res = await this.client.post(`/tasks/${taskId}/comments`, { content });
    return res.data;
  }

  async updateTaskComment(taskId: string, commentId: string, content: string): Promise<any> {
    const res = await this.client.patch(`/tasks/${taskId}/comments/${commentId}`, { content });
    return res.data;
  }

  async deleteTaskComment(taskId: string, commentId: string): Promise<void> {
    await this.client.delete(`/tasks/${taskId}/comments/${commentId}`);
  }

  // Task Attachments
  async getTaskAttachments(taskId: string): Promise<any[]> {
    const res = await this.client.get(`/tasks/${taskId}/attachments`);
    return res.data.attachments || [];
  }

  async addTaskAttachment(taskId: string, data: { type: string; name: string; url: string; size?: number; mimeType?: string }): Promise<any> {
    const res = await this.client.post(`/tasks/${taskId}/attachments`, data);
    return res.data.attachment;
  }

  async deleteTaskAttachment(taskId: string, attachmentId: string): Promise<void> {
    await this.client.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
  }

  // ─── Department Management ─────────────────────────────────────────────
  async getDepartments(orgId?: string): Promise<{ departments: any[] }> {
    const res = await this.client.get('/org-admin/departments', { params: { orgId } });
    return res.data;
  }

  async createDepartment(name: string, description?: string, orgId?: string): Promise<any> {
    const res = await this.client.post('/org-admin/departments', { name, description }, { params: { orgId } });
    return res.data;
  }

  async updateDepartment(departmentId: string, data: { name?: string; description?: string }, orgId?: string): Promise<any> {
    const res = await this.client.patch(`/org-admin/departments/${departmentId}`, data, { params: { orgId } });
    return res.data;
  }

  async deleteDepartment(departmentId: string, orgId?: string): Promise<void> {
    await this.client.delete(`/org-admin/departments/${departmentId}`, { params: { orgId } });
  }

  async addDepartmentMember(departmentId: string, userId: string, orgId?: string): Promise<any> {
    const res = await this.client.post(`/org-admin/departments/${departmentId}/members`, { userId }, { params: { orgId } });
    return res.data;
  }

  async removeDepartmentMember(departmentId: string, userId: string, orgId?: string): Promise<void> {
    await this.client.delete(`/org-admin/departments/${departmentId}/members/${userId}`, { params: { orgId } });
  }

  // Status/Stories API
  async createTextStatus(content: string, bgColor?: string): Promise<StatusItem> {
    const { data } = await this.client.post('/status/text', { content, bgColor });
    return data;
  }

  async createMediaStatus(file: File, caption?: string): Promise<StatusItem> {
    const formData = new FormData();
    formData.append('file', file);
    if (caption) formData.append('caption', caption);
    // Don't set Content-Type manually — axios sets the correct multipart boundary automatically
    const { data } = await this.client.post('/status/media', formData);
    return data;
  }

  async getMyStatuses(): Promise<{ statuses: StatusItem[] }> {
    const { data } = await this.client.get('/status/mine');
    return data;
  }

  async getContactStatuses(): Promise<{ users: UserStatusGroup[] }> {
    const { data } = await this.client.get('/status/contacts');
    // Map backend shape { user: {id,username,...}, hasUnviewedStatus } to frontend UserStatusGroup
    const users = (data?.users || []).map((entry: any) => ({
      userId: entry.user?.id || entry.userId,
      username: entry.user?.username || entry.username,
      displayName: entry.user?.displayName || entry.displayName,
      avatarUrl: entry.user?.avatarUrl || entry.avatarUrl,
      statuses: entry.statuses || [],
      hasUnviewed: entry.hasUnviewedStatus ?? entry.hasUnviewed ?? false,
      latestAt: entry.statuses?.[0]?.createdAt || '',
    }));
    return { users };
  }

  async viewStatus(statusId: string): Promise<void> {
    await this.client.post(`/status/${statusId}/view`);
  }

  async deleteStatus(statusId: string): Promise<void> {
    await this.client.delete(`/status/${statusId}`);
  }

  async likeStatus(statusId: string): Promise<{ liked: boolean }> {
    const { data } = await this.client.post(`/status/${statusId}/like`);
    return data;
  }

  async getStatusLikes(statusId: string): Promise<{ likes: StatusLikeUser[] }> {
    const { data } = await this.client.get(`/status/${statusId}/likes`);
    return data;
  }

  // Announcements API
  async getAnnouncements(): Promise<{ announcements: AnnouncementItem[] }> {
    const { data } = await this.client.get('/announcements');
    return data;
  }

  async createAnnouncement(payload: { title: string; content: string; priority?: string; pinned?: boolean; expiresAt: string }): Promise<AnnouncementItem> {
    const { data } = await this.client.post('/announcements', payload);
    return data;
  }

  async updateAnnouncement(id: string, payload: { title?: string; content?: string; priority?: string; pinned?: boolean; expiresAt?: string }): Promise<AnnouncementItem> {
    const { data } = await this.client.put(`/announcements/${id}`, payload);
    return data;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await this.client.delete(`/announcements/${id}`);
  }

  async canAnnounce(): Promise<{ canAnnounce: boolean }> {
    const { data } = await this.client.get('/announcements/can-announce');
    return data;
  }

  async noteAnnouncement(id: string): Promise<{ success: boolean; noted: boolean; notedAt: string }> {
    const { data } = await this.client.post(`/announcements/${id}/note`);
    return data;
  }

  async unnoteAnnouncement(id: string): Promise<{ success: boolean; noted: boolean }> {
    const { data } = await this.client.delete(`/announcements/${id}/note`);
    return data;
  }

  async getUnnotedAnnouncementCount(): Promise<{ count: number }> {
    const { data } = await this.client.get('/announcements/unread-count');
    return data;
  }

  async reactToAnnouncement(id: string, type: 'like' | 'dislike'): Promise<any> {
    const res = await this.client.post(`/announcements/${id}/react`, { type });
    return res.data;
  }

  async getAnnouncementComments(id: string): Promise<{ comments: any[] }> {
    const res = await this.client.get(`/announcements/${id}/comments`);
    return res.data;
  }

  async addAnnouncementComment(id: string, content: string): Promise<any> {
    const res = await this.client.post(`/announcements/${id}/comments`, { content });
    return res.data;
  }

  async updateAnnouncementComment(announcementId: string, commentId: string, content: string): Promise<any> {
    const res = await this.client.patch(`/announcements/${announcementId}/comments/${commentId}`, { content });
    return res.data;
  }

  async deleteAnnouncementComment(announcementId: string, commentId: string): Promise<void> {
    await this.client.delete(`/announcements/${announcementId}/comments/${commentId}`);
  }

  // Super Admin API
  async superAdminLogin(email: string, password: string): Promise<LoginResponse> {
    const res = await this.client.post<LoginResponse>('/super-admin/login', { email, password });
    // If OTP is required, don't store any tokens yet
    if (isLoginOtpRequired(res.data)) {
      return res.data;
    }
    const data = res.data as AuthResponse;
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async verifySuperAdminLoginOtp(email: string, code: string): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/super-admin/verify-login', { email, code });
    this.setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data;
  }

  async getSuperAdminDashboard(): Promise<any> {
    const res = await this.client.get('/super-admin/dashboard');
    return res.data;
  }

  async getSuperAdminOrganizations(search?: string, page = 1, limit = 20): Promise<any> {
    const res = await this.client.get('/super-admin/organizations', {
      params: { search, page, limit },
    });
    return res.data;
  }

  async getSuperAdminUsers(search?: string, page = 1, limit = 20, role?: string): Promise<any> {
    const res = await this.client.get('/super-admin/users', {
      params: { search, page, limit, role },
    });
    return res.data;
  }

  async getSuperAdminActivity(): Promise<any> {
    const res = await this.client.get('/super-admin/activity-log');
    return res.data;
  }

  async getSuperAdminFinancial(): Promise<any> {
    const res = await this.client.get('/super-admin/financial');
    return res.data;
  }

  // Super Admin CRUD
  async createSuperAdminOrganization(data: { name: string; slug: string; description?: string }): Promise<any> {
    const res = await this.client.post('/super-admin/organizations', data);
    return res.data;
  }

  async updateSuperAdminOrganization(id: string, data: { name?: string; slug?: string; description?: string }): Promise<any> {
    const res = await this.client.patch(`/super-admin/organizations/${id}`, data);
    return res.data;
  }

  async deleteSuperAdminOrganization(id: string): Promise<any> {
    const res = await this.client.delete(`/super-admin/organizations/${id}`);
    return res.data;
  }

  async updateSuperAdminUser(id: string, data: { role?: string; displayName?: string; username?: string; emailVerified?: boolean }): Promise<any> {
    const res = await this.client.patch(`/super-admin/users/${id}`, data);
    return res.data;
  }

  async deleteSuperAdminUser(id: string): Promise<any> {
    const res = await this.client.delete(`/super-admin/users/${id}`);
    return res.data;
  }

  async resetSuperAdminUserPassword(id: string, newPassword: string): Promise<any> {
    const res = await this.client.post(`/super-admin/users/${id}/reset-password`, { newPassword });
    return res.data;
  }

  // Inter-Panel methods

  async getPublicPanels(): Promise<any> {
    const res = await this.client.get('/panels/public');
    return res.data;
  }

  async searchPanels(query: string): Promise<any> {
    const res = await this.client.get('/panels/search', { params: { q: query } });
    return res.data;
  }

  async sendPanelRequest(receiverOrgId: string, message?: string): Promise<any> {
    const res = await this.client.post('/panels/request', { receiverOrgId, message });
    return res.data;
  }

  async getPanelRequests(): Promise<any> {
    const res = await this.client.get('/panels/requests');
    return res.data;
  }

  async acceptPanelRequest(id: string): Promise<any> {
    const res = await this.client.post(`/panels/requests/${id}/accept`);
    return res.data;
  }

  async rejectPanelRequest(id: string): Promise<any> {
    const res = await this.client.post(`/panels/requests/${id}/reject`);
    return res.data;
  }

  // Org Profile methods

  async getOrgProfile(): Promise<any> {
    const res = await this.client.get('/org-admin/profile');
    return res.data;
  }

  async updateOrgProfile(data: { name?: string; description?: string; visibility?: string }): Promise<any> {
    const res = await this.client.patch('/org-admin/profile', data);
    return res.data;
  }

  async uploadOrgLogo(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await this.client.post('/org-admin/profile/logo', formData);
    return res.data;
  }

  // ==================== CALLS ====================

  async getCallHistory(params?: { limit?: number; offset?: number }): Promise<{ calls: any[] }> {
    const res = await this.client.get('/calls', { params });
    return res.data;
  }

  async getCall(callId: string): Promise<{ call: any }> {
    const res = await this.client.get(`/calls/${callId}`);
    return res.data;
  }
}

// Export singleton instance
export const api = new APIClient();

export type {
  AuthResponse,
  MessageResponse,
  ConversationResponse,
  PaginatedMessages,
  SearchUsersResponse,
  UserProfile,
  LindaConversationSummary,
  LindaMessageData,
};
