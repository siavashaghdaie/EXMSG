import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, UserProfile } from '../services/api';
import { socket } from '../services/socket';

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
  updateUser: (updates: Partial<UserProfile>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login(email, password);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          });

          // Connect socket after successful login (fire-and-forget, don't block auth)
          const token = localStorage.getItem('accessToken');
          if (token) {
            socket.connect(token).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
        } catch (error: any) {
          const errorMessage = error.response?.data?.message || error.message || 'Login failed';
          set({
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      register: async (email: string, username: string, displayName: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.register(email, username, displayName, password);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
          });

          // Connect socket after successful registration (fire-and-forget, don't block auth)
          const token = localStorage.getItem('accessToken');
          if (token) {
            socket.connect(token).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.message || error.message || 'Registration failed';
          set({
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          await api.logout();
          socket.disconnect();
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
          // Clear all storage
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        } catch (error: any) {
          const errorMessage = error.response?.data?.message || error.message || 'Logout failed';
          set({
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      checkAuth: async () => {
        set({ isLoading: true, error: null });
        try {
          const token = localStorage.getItem('accessToken');

          if (!token) {
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
            });
            return;
          }

          // Verify token is still valid by fetching user profile
          const user = await api.getMe();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
          });

          // Connect socket with valid token (fire-and-forget)
          socket.connect(token).catch((err: unknown) => {
            console.warn('[Socket] Connection failed, will retry:', err);
          });
        } catch (error: any) {
          // Token is invalid, clear it
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
            error: null,
          });
        }
      },

      refreshToken: async () => {
        try {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await api.refresh(refreshToken);
          set({
            user: response.user,
            isAuthenticated: true,
          });

          // Reconnect socket with new token
          const newAccessToken = localStorage.getItem('accessToken');
          if (newAccessToken && !socket.isConnected()) {
            await socket.connect(newAccessToken);
          }
        } catch (error: any) {
          // Refresh failed, logout user
          const { logout } = get();
          await logout();
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },

      updateUser: (updates: Partial<UserProfile>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));
      },
    }),
    {
      name: 'auth-storage',
      // Only persist user and isAuthenticated, not loading or error states
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Safety: fix inconsistent persisted state on hydration
      onRehydrateStorage: () => (state) => {
        if (state && state.isAuthenticated && !state.user) {
          state.isAuthenticated = false;
        }
        // Fix nested user object from older getMe() bug: { user: { user: { id: ... } } }
        if (state?.user && (state.user as any).user && !(state.user as any).id) {
          (state as any).user = (state.user as any).user;
        }
      },
    }
  )
);

// Setup auto token refresh on auth events
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    socket.disconnect();
  });
}
