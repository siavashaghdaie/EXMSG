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

interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  reactions: Record<string, string[]>;
  editedAt?: string;
  createdAt: string;
}

interface ConversationResponse {
  id: string;
  name?: string;
  participants: Array<{
    id: string;
    email: string;
    username: string;
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
  avatar?: string;
  bio?: string;
  createdAt: string;
}

// API Client Class
class APIClient {
  private client: AxiosInstance;
  private refreshPromise: Promise<string> | null = null;

  constructor() {
    const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed, trigger logout
            this.clearTokens();
            window.dispatchEvent(new CustomEvent('auth:logout'));
            return Promise.reject(refreshError);
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
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      try {
        const response = await axios.post<AuthResponse>(
          `${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/auth/refresh`,
          { refreshToken },
          { timeout: 10000 }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;
        this.setTokens(accessToken, newRefreshToken);
        return accessToken;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // Auth API
  async register(email: string, username: string, displayName: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/register', {
      email,
      username,
      displayName,
      password,
    });
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
    return response.data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', {
      email,
      password,
    });
    const { accessToken, refreshToken } = response.data;
    this.setTokens(accessToken, refreshToken);
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
    const response = await this.client.get<UserProfile>('/auth/me');
    return response.data;
  }

  // Messaging API
  async getConversations(skip: number = 0, limit: number = 20): Promise<ConversationResponse[]> {
    const response = await this.client.get<ConversationResponse[]>('/conversations', {
      params: { skip, limit },
    });
    return response.data;
  }

  async createConversation(
    participantIds: string[],
    name?: string
  ): Promise<ConversationResponse> {
    const response = await this.client.post<ConversationResponse>(
      '/conversations',
      {
        participantIds,
        name,
      }
    );
    return response.data;
  }

  async getMessages(
    conversationId: string,
    cursor?: string,
    limit: number = 50
  ): Promise<PaginatedMessages> {
    const response = await this.client.get<PaginatedMessages>(
      `/conversations/${conversationId}/messages`,
      {
        params: { cursor, limit },
      }
    );
    return response.data;
  }

  async sendMessage(conversationId: string, content: string): Promise<MessageResponse> {
    const response = await this.client.post<MessageResponse>(
      `/conversations/${conversationId}/messages`,
      { content }
    );
    return response.data;
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

  async updateProfile(updates: Partial<{ username: string; avatar: string; bio: string }>): Promise<UserProfile> {
    const response = await this.client.patch<UserProfile>('/users/profile', updates);
    return response.data;
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
};
