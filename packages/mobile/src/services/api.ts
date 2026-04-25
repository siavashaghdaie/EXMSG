import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL, REQUEST_TIMEOUT, UPLOAD_TIMEOUT } from '@/config/api';
import { secureStorage } from './secureStorage';

// ─── Event Emitter for auth events (replaces window.dispatchEvent) ───────────

type AuthEventListener = () => void;

class AuthEventEmitter {
  private listeners: Set<AuthEventListener> = new Set();

  onLogout(listener: AuthEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitLogout(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('[AuthEvent] Error in logout listener:', error);
      }
    });
  }
}

export const authEvents = new AuthEventEmitter();

// ─── Types ───────────────────────────────────────────────────────────────────

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
  participants: Array<{
    id: string;
    email: string;
    username: string;
    displayName?: string;
    avatar?: string;
  }>;
  lastMessage?: MessageResponse;
  unreadCount: number;
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

/**
 * React Native file descriptor for FormData uploads.
 * Unlike web File/Blob, RN uses { uri, name, type } objects.
 */
export interface RNFileDescriptor {
  uri: string;
  name: string;
  type: string;
}

// ─── API Client Class ────────────────────────────────────────────────────────

class APIClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;
  /**
   * In-memory token cache so we don't await SecureStore on every request.
   * The cache is populated on setTokens / refreshAccessToken and cleared
   * on clearTokens / logout.
   */
  private cachedAccessToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: REQUEST_TIMEOUT,
    });

    this.setupInterceptors();
  }

  /**
   * Must be called once at app start (e.g. in the root component or auth
   * provider) to hydrate the in-memory token from SecureStore.
   */
  async hydrate(): Promise<void> {
    this.cachedAccessToken = await secureStorage.getAccessToken();
  }

  private setupInterceptors(): void {
    // Request interceptor: inject auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = this.cachedAccessToken;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
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
            // Refresh failed — silently log the user out.
            await this.clearTokens();
            authEvents.emitLogout();
            // Reject with the ORIGINAL 401 error so callers see a clean
            // "Unauthorized" response, not an internal refresh error.
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      },
    );
  }

  private async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    this.cachedAccessToken = accessToken;
    await secureStorage.setTokens(accessToken, refreshToken);
  }

  private async clearTokens(): Promise<void> {
    this.cachedAccessToken = null;
    await secureStorage.clearTokens();
  }

  private async refreshAccessToken(): Promise<string> {
    // Prevent multiple concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const refreshToken = await secureStorage.getRefreshToken();
        if (!refreshToken) {
          throw new Error('Session expired');
        }

        const response = await axios.post<AuthResponse>(
          `${API_BASE_URL}/auth/refresh`,
          { refreshToken },
          { timeout: REQUEST_TIMEOUT },
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        await this.setTokens(accessToken, newRefreshToken);
        return accessToken;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // ─── Auth API ────────────────────────────────────────────────────────────

  async register(
    email: string,
    displayName: string,
    password: string,
    options?: RegisterOptions,
  ): Promise<RegisterResponse> {
    const payload: Record<string, unknown> = { email, displayName, password };
    if (options?.companyName) payload.companyName = options.companyName;
    if (options?.plan) payload.plan = options.plan;
    const response = await this.client.post<RegisterResponse>('/auth/register', payload);
    if (isVerificationRequired(response.data)) {
      return response.data;
    }
    const data = response.data as AuthResponse;
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async getPlans(): Promise<{ plans: PlanDefinition[] }> {
    const response = await this.client.get<{ plans: PlanDefinition[] }>('/auth/plans');
    return response.data;
  }

  // ─── Invite Flow ─────────────────────────────────────────────────────────

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
    const response = await this.client.post<LoginResponse>('/auth/login', { email, password });
    if (isLoginOtpRequired(response.data)) {
      return response.data;
    }
    const data = response.data as AuthResponse;
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async verifyOtp(email: string, code: string): Promise<VerifyOtpResponse> {
    const response = await this.client.post<VerifyOtpResponse>('/auth/verify', { email, code });
    if (isVerifiedRequiresLogin(response.data)) {
      return response.data;
    }
    const data = response.data as OtpVerifyResponse;
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async verifyLoginOtp(email: string, code: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/verify-login', { email, code });
    const { accessToken, refreshToken } = response.data;
    await this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  async resendOtp(email: string, purpose: 'register' | 'login' = 'register'): Promise<{ message: string }> {
    const response = await this.client.post<{ message: string }>('/auth/resend-otp', { email, purpose });
    return response.data;
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/refresh', { refreshToken });
    const { accessToken, refreshToken: newRefreshToken } = response.data;
    await this.setTokens(accessToken, newRefreshToken);
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.post('/auth/logout');
    } finally {
      await this.clearTokens();
    }
  }

  async getMe(): Promise<UserProfile> {
    const response = await this.client.get('/auth/me');
    return response.data.user || response.data;
  }

  // ─── Conversation normalization ──────────────────────────────────────────

  private normalizeConversation(conv: any): ConversationResponse {
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

    const lastMsg = conv.messages?.[0] || conv.lastMessage;
    const lastMessage: MessageResponse | undefined = lastMsg
      ? {
          id: lastMsg.id,
          content: lastMsg.content,
          senderId: lastMsg.sender?.id || lastMsg.senderId || '',
          conversationId: conv.id,
          createdAt: lastMsg.createdAt,
          reactions: {},
        }
      : undefined;

    return {
      id: conv.id,
      name: conv.name || undefined,
      participants,
      lastMessage,
      unreadCount: conv.unreadCount || 0,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }

  // ─── Messaging API ──────────────────────────────────────────────────────

  async getConversations(skip: number = 0, limit: number = 20): Promise<ConversationResponse[]> {
    const response = await this.client.get('/conversations', { params: { skip, limit } });
    const raw = response.data.conversations || response.data;
    const conversations = Array.isArray(raw) ? raw : [];
    return conversations.map((c: any) => this.normalizeConversation(c));
  }

  async createConversation(participantIds: string[], name?: string): Promise<ConversationResponse> {
    const type = participantIds.length === 1 && !name ? 'DIRECT' : 'GROUP';
    const response = await this.client.post('/conversations', {
      type,
      memberIds: participantIds,
      name: name || undefined,
    });
    const raw = response.data.conversation || response.data;
    return this.normalizeConversation(raw);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.client.delete(`/conversations/${conversationId}`);
  }

  async getMessages(conversationId: string, cursor?: string, limit: number = 50): Promise<PaginatedMessages> {
    const response = await this.client.get(`/conversations/${conversationId}/messages`, {
      params: { cursor, limit },
    });
    const data = response.data;
    const rawMessages = Array.isArray(data.messages) ? data.messages : [];

    const messages: MessageResponse[] = rawMessages.map((m: any) => {
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

  async sendMessage(
    conversationId: string,
    content: string,
    replyToId?: string,
    storyReply?: { storyId: string; storyContent: string; storyType: string; storyBgColor?: string },
  ): Promise<MessageResponse> {
    const response = await this.client.post(`/conversations/${conversationId}/messages`, {
      content,
      replyToId,
      ...(storyReply ? { type: 'STORY_REPLY', storyReply } : {}),
    });
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

  /**
   * Upload a file in a conversation.
   *
   * React Native FormData accepts { uri, name, type } objects in place of
   * web File/Blob instances, so the `file` parameter uses RNFileDescriptor.
   */
  async uploadFile(
    conversationId: string,
    file: RNFileDescriptor,
    onProgress?: (progress: number) => void,
  ): Promise<MessageResponse> {
    const formData = new FormData();
    // React Native's FormData accepts the { uri, name, type } descriptor
    formData.append('file', file as any);

    const response = await this.client.post(`/conversations/${conversationId}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
          onProgress(progress);
        }
      },
    });
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
    const response = await this.client.put<MessageResponse>(`/messages/${messageId}`, { content });
    return response.data;
  }

  async deleteMessage(_conversationId: string, messageId: string): Promise<void> {
    await this.client.delete(`/messages/${messageId}`);
  }

  async addReaction(_conversationId: string, messageId: string, emoji: string): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>(`/messages/${messageId}/reactions`, { emoji });
    return response.data;
  }

  async removeReaction(_conversationId: string, messageId: string, emoji: string): Promise<MessageResponse> {
    const response = await this.client.delete<MessageResponse>(`/messages/${messageId}/reactions/${emoji}`);
    return response.data;
  }

  async markAsRead(conversationId: string, messageId?: string): Promise<void> {
    await this.client.post(`/conversations/${conversationId}/read`, messageId ? { messageId } : {});
  }

  // ─── User API ────────────────────────────────────────────────────────────

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

  async uploadAvatar(file: RNFileDescriptor): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append('avatar', file as any);
    const response = await this.client.post<{ avatarUrl: string }>('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT,
    });
    return response.data;
  }

  // ─── Message Pinning API ────────────────────────────────────────────────

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

  // ─── Message Search API ─────────────────────────────────────────────────

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

  // ─── Message Forwarding API ─────────────────────────────────────────────

  async forwardMessage(messageId: string, targetConversationIds: string[]): Promise<void> {
    await this.client.post(`/messages/${messageId}/forward`, { targetConversationIds });
  }

  // ─── Linda AI Secretary API ─────────────────────────────────────────────

  async chatWithLinda(
    message: string,
    conversationId?: string,
  ): Promise<{
    response: string;
    timestamp: string;
    conversationId: string;
    actions?: Array<{ type: string; target: string; status: string }>;
    generatedFiles?: Array<{ fileName: string; fileSize: number; mimeType: string; url: string }>;
  }> {
    const res = await this.client.post('/linda/chat', { message, conversationId }, { timeout: 60000 });
    return res.data;
  }

  async chatWithLindaFile(
    file: RNFileDescriptor,
    message?: string,
    conversationId?: string,
  ): Promise<{
    response: string;
    timestamp: string;
    conversationId: string;
    generatedFiles?: Array<{ fileName: string; fileSize: number; mimeType: string; url: string }>;
  }> {
    const formData = new FormData();
    formData.append('file', file as any);
    if (message) formData.append('message', message);
    if (conversationId) formData.append('conversationId', conversationId);
    const res = await this.client.post('/linda/chat/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
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

  // ─── Task Management API ───────────────────────────────────────────────

  async getTasks(params?: { status?: string; view?: string; departmentId?: string; projectId?: string }): Promise<any[]> {
    const res = await this.client.get('/tasks', { params });
    return res.data.tasks || [];
  }

  async createTask(data: {
    title: string;
    description?: string;
    assignedToId?: string;
    deadline?: string;
    priority?: string;
    labels?: string[];
    lindaFollowing?: boolean;
    lindaFollowInterval?: string;
    departmentId?: string;
    projectId?: string;
    projectName?: string;
    visibleToDepartmentIds?: string[];
  }): Promise<any> {
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

  // ─── Admin API ──────────────────────────────────────────────────────────

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

  // ─── Org Admin API ─────────────────────────────────────────────────────

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
    orgId?: string,
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
    return res.data;
  }

  async updateChecklist(checklistId: string, data: { title?: string }): Promise<any> {
    const res = await this.client.patch(`/checklists/${checklistId}`, data);
    return res.data;
  }

  async deleteChecklist(checklistId: string): Promise<void> {
    await this.client.delete(`/checklists/${checklistId}`);
  }

  async addChecklistItem(checklistId: string, data: { title: string; assigneeId?: string; dueDate?: string }): Promise<any> {
    const res = await this.client.post(`/checklists/${checklistId}/items`, data);
    return res.data;
  }

  async updateChecklistItem(checklistId: string, itemId: string, data: { title?: string; completed?: boolean; assigneeId?: string; dueDate?: string; position?: number }): Promise<any> {
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

  // ─── Department Management ────────────────────────────────────────────

  async getDepartments(orgId?: string): Promise<{ departments: any[] }> {
    const res = await this.client.get('/org-admin/departments', { params: { orgId } });
    return res.data;
  }

  async createDepartment(name: string, description?: string, orgId?: string): Promise<any> {
    const res = await this.client.post('/org-admin/departments', { name, description }, { params: { orgId } });
    return res.data;
  }

  async addDepartmentMember(departmentId: string, userId: string, orgId?: string): Promise<any> {
    const res = await this.client.post(`/org-admin/departments/${departmentId}/members`, { userId }, { params: { orgId } });
    return res.data;
  }

  async removeDepartmentMember(departmentId: string, userId: string, orgId?: string): Promise<void> {
    await this.client.delete(`/org-admin/departments/${departmentId}/members/${userId}`, { params: { orgId } });
  }

  // ─── Status/Stories API ─────────────────────────────────────────────────

  async createTextStatus(content: string, bgColor?: string): Promise<StatusItem> {
    const { data } = await this.client.post('/status/text', { content, bgColor });
    return data;
  }

  async createMediaStatus(file: RNFileDescriptor, caption?: string): Promise<StatusItem> {
    const formData = new FormData();
    formData.append('file', file as any);
    if (caption) formData.append('caption', caption);
    const { data } = await this.client.post('/status/media', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT,
    });
    return data;
  }

  async getMyStatuses(): Promise<{ statuses: StatusItem[] }> {
    const { data } = await this.client.get('/status/mine');
    return data;
  }

  async getContactStatuses(): Promise<{ users: UserStatusGroup[] }> {
    const { data } = await this.client.get('/status/contacts');
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

  // ─── Announcements API ─────────────────────────────────────────────────

  async getAnnouncements(): Promise<{ announcements: AnnouncementItem[] }> {
    const { data } = await this.client.get('/announcements');
    return data;
  }

  async createAnnouncement(payload: {
    title: string;
    content: string;
    priority?: string;
    pinned?: boolean;
    expiresAt: string;
  }): Promise<AnnouncementItem> {
    const { data } = await this.client.post('/announcements', payload);
    return data;
  }

  async updateAnnouncement(
    id: string,
    payload: { title?: string; content?: string; priority?: string; pinned?: boolean; expiresAt?: string },
  ): Promise<AnnouncementItem> {
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

  // ─── Inter-Panel API ──────────────────────────────────────────────────

  async getPublicPanels(): Promise<any[]> {
    const { data } = await this.client.get('/inter-panel/public');
    return data.panels || data;
  }

  async searchPanels(query: string): Promise<any[]> {
    const { data } = await this.client.get('/inter-panel/search', { params: { query } });
    return data.panels || data;
  }

  async sendPanelRequest(targetOrgId: string, message?: string): Promise<any> {
    const { data } = await this.client.post('/inter-panel/request', { targetOrgId, message });
    return data;
  }

  async getPanelRequests(): Promise<any> {
    const { data } = await this.client.get('/inter-panel/requests');
    return data;
  }

  async acceptPanelRequest(requestId: string): Promise<any> {
    const { data } = await this.client.post(`/inter-panel/requests/${requestId}/accept`);
    return data;
  }

  async rejectPanelRequest(requestId: string): Promise<any> {
    const { data } = await this.client.post(`/inter-panel/requests/${requestId}/reject`);
    return data;
  }

  // ─── Org Profile API ──────────────────────────────────────────────────

  async getOrgProfile(): Promise<any> {
    const { data } = await this.client.get('/org-admin/profile');
    return data;
  }

  async updateOrgProfile(updates: { name?: string; description?: string; visibility?: string }): Promise<any> {
    const { data } = await this.client.patch('/org-admin/profile', updates);
    return data;
  }

  async uploadOrgLogo(file: RNFileDescriptor): Promise<{ logoUrl: string }> {
    const formData = new FormData();
    formData.append('logo', file as any);
    const { data } = await this.client.post('/org-admin/profile/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: UPLOAD_TIMEOUT,
    });
    return data;
  }

  // ─── Super Admin API ───────────────────────────────────────────────────

  async superAdminLogin(email: string, password: string): Promise<LoginResponse> {
    const res = await this.client.post<LoginResponse>('/super-admin/login', { email, password });
    if (isLoginOtpRequired(res.data)) {
      return res.data;
    }
    const data = res.data as AuthResponse;
    await this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async verifySuperAdminLoginOtp(email: string, code: string): Promise<AuthResponse> {
    const res = await this.client.post<AuthResponse>('/super-admin/verify-login', { email, code });
    await this.setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data;
  }

  async getSuperAdminDashboard(): Promise<any> {
    const res = await this.client.get('/super-admin/dashboard');
    return res.data;
  }

  async getSuperAdminOrganizations(search?: string, page = 1, limit = 20): Promise<any> {
    const res = await this.client.get('/super-admin/organizations', { params: { search, page, limit } });
    return res.data;
  }

  async getSuperAdminUsers(search?: string, page = 1, limit = 20, role?: string): Promise<any> {
    const res = await this.client.get('/super-admin/users', { params: { search, page, limit, role } });
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

  async updateSuperAdminUser(
    id: string,
    data: { role?: string; displayName?: string; username?: string; emailVerified?: boolean },
  ): Promise<any> {
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
}

// Export singleton instance
export const api = new APIClient();

export type {
  AuthResponse,
  MessageResponse,
  MessageAttachment,
  ConversationResponse,
  PaginatedMessages,
  SearchUsersResponse,
  UserProfile,
  LindaConversationSummary,
  LindaMessageData,
};
