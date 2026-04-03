export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  status: string | null;
  isOnline: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface AuthResponse {
  user: Omit<User, 'lastSeenAt'>;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  displayName: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
