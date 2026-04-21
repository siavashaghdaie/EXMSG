import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import {
  api,
  UserProfile,
  isLoginOtpRequired,
  isVerifiedRequiresLogin,
  RegisterOptions,
} from '@/services/api';
import { socket } from '@/services/socket';
import { secureStorage } from '@/services/secureStorage';

/**
 * What kind of OTP flow is currently pending.
 *  - 'register' -> user just signed up, needs to verify their email for the first time
 *  - 'login'    -> user logged in with correct password, needs to enter the 2FA code
 */
export type PendingOtpPurpose = 'register' | 'login' | null;

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCheckedAuth: boolean;
  error: string | null;
  pendingVerificationEmail: string | null;
  pendingOtpPurpose: PendingOtpPurpose;
  /**
   * True when the last successful /auth/verify was for a Panel Owner and the
   * user must now return to the login page to complete sign-in (spec 2.3.5).
   * Consumed and cleared by the LoginScreen banner.
   */
  justVerifiedRequiresLogin: boolean;
  justVerifiedEmail: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    displayName: string,
    password: string,
    options?: RegisterOptions
  ) => Promise<void>;
  verifyOtp: (email: string, code: string) => Promise<{ requiresLogin: boolean }>;
  verifyLoginOtp: (email: string, code: string) => Promise<void>;
  resendOtp: (email: string, purpose?: 'register' | 'login') => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  refreshToken: () => Promise<void>;
  clearError: () => void;
  clearPendingVerification: () => void;
  clearJustVerified: () => void;
  updateUser: (updates: Partial<UserProfile>) => void;
}

/**
 * Custom Zustand storage adapter that wraps expo-secure-store for persistence.
 * SecureStore is async, so we use createJSONStorage with an async adapter.
 */
const secureStoreAdapter = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (error) {
      console.warn('[AuthStore] Failed to persist state:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (error) {
      console.warn('[AuthStore] Failed to remove persisted state:', error);
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasCheckedAuth: false,
      error: null,
      pendingVerificationEmail: null,
      pendingOtpPurpose: null,
      justVerifiedRequiresLogin: false,
      justVerifiedEmail: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.login(email, password);

          // Two-factor path: server is asking for an OTP before it hands out tokens
          if (isLoginOtpRequired(response)) {
            set({
              isLoading: false,
              error: null,
              pendingVerificationEmail: response.email,
              pendingOtpPurpose: 'login',
            });
            return;
          }

          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
            pendingVerificationEmail: null,
            pendingOtpPurpose: null,
          });

          // Connect socket after successful login (fire-and-forget, don't block auth)
          const token = await secureStorage.getAccessToken();
          if (token) {
            socket.connect(token).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
        } catch (error: any) {
          // Check if the error response says verification is required
          if (error.response?.data?.requiresVerification) {
            set({
              isLoading: false,
              error: null,
              pendingVerificationEmail: error.response.data.email || email,
            });
            throw error;
          }
          const errorMessage =
            error.response?.data?.error ||
            error.response?.data?.message ||
            error.message ||
            'Login failed';
          set({
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      register: async (
        email: string,
        displayName: string,
        password: string,
        options?: RegisterOptions
      ) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.register(email, displayName, password, options);
          // Check if verification is required (email OTP flow)
          if ('requiresVerification' in response && response.requiresVerification) {
            set({
              isLoading: false,
              pendingVerificationEmail: response.email,
              pendingOtpPurpose: 'register',
            });
            return; // Don't throw -- this is a success, just needs verification
          }
          // Direct auth (no email configured on backend)
          const authResponse = response as {
            user: any;
            accessToken: string;
            refreshToken: string;
          };
          set({
            user: authResponse.user,
            isAuthenticated: true,
            isLoading: false,
            pendingVerificationEmail: null,
            pendingOtpPurpose: null,
          });

          const token = await secureStorage.getAccessToken();
          if (token) {
            socket.connect(token).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
        } catch (error: any) {
          // Also check error response for requiresVerification (409 duplicate but unverified)
          if (error.response?.data?.requiresVerification) {
            set({
              isLoading: false,
              error: null,
              pendingVerificationEmail: error.response.data.email || email,
              pendingOtpPurpose: 'register',
            });
            throw error;
          }
          const errorMessage =
            error.response?.data?.error ||
            error.response?.data?.message ||
            error.message ||
            'Registration failed';
          set({
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      verifyOtp: async (email: string, code: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.verifyOtp(email, code);

          // Panel Owner newcomers must return to the login page after
          // verification (spec 2.3.5). No tokens were issued.
          if (isVerifiedRequiresLogin(response)) {
            set({
              isAuthenticated: false,
              isLoading: false,
              hasCheckedAuth: true,
              pendingVerificationEmail: null,
              pendingOtpPurpose: null,
              justVerifiedRequiresLogin: true,
              justVerifiedEmail: response.email,
            });
            return { requiresLogin: true };
          }

          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
            pendingVerificationEmail: null,
            pendingOtpPurpose: null,
            justVerifiedRequiresLogin: false,
            justVerifiedEmail: null,
          });

          const token = await secureStorage.getAccessToken();
          if (token) {
            socket.connect(token).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
          return { requiresLogin: false };
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.error || error.message || 'Verification failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      verifyLoginOtp: async (email: string, code: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.verifyLoginOtp(email, code);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
            pendingVerificationEmail: null,
            pendingOtpPurpose: null,
          });

          const token = await secureStorage.getAccessToken();
          if (token) {
            socket.connect(token).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.error || error.message || 'Verification failed';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      resendOtp: async (
        email: string,
        purpose: 'register' | 'login' = 'register'
      ) => {
        set({ isLoading: true, error: null });
        try {
          await api.resendOtp(email, purpose);
          set({ isLoading: false });
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.error ||
            error.message ||
            'Failed to resend code';
          set({ isLoading: false, error: errorMessage });
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
          // Clear all secure storage
          await secureStorage.clearTokens();
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.message || error.message || 'Logout failed';
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
          const token = await secureStorage.getAccessToken();

          if (!token) {
            set({
              isAuthenticated: false,
              user: null,
              isLoading: false,
              hasCheckedAuth: true,
            });
            return;
          }

          // Verify token is still valid by fetching user profile
          // (the API interceptor may silently refresh the token during this call)
          const user = await api.getMe();
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
          });

          // Re-read the token AFTER the API call — it may have been refreshed
          const freshToken = await secureStorage.getAccessToken();
          if (freshToken) {
            socket.connect(freshToken).catch((err: unknown) => {
              console.warn('[Socket] Connection failed, will retry:', err);
            });
          }
        } catch (error: any) {
          // Token is invalid, clear it
          await secureStorage.clearTokens();
          set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
            hasCheckedAuth: true,
            error: null,
          });
        }
      },

      refreshToken: async () => {
        try {
          const refreshToken = await secureStorage.getRefreshToken();
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await api.refresh(refreshToken);
          set({
            user: response.user,
            isAuthenticated: true,
          });

          // Reconnect socket with new token
          const newAccessToken = await secureStorage.getAccessToken();
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

      clearPendingVerification: () => {
        set({ pendingVerificationEmail: null, pendingOtpPurpose: null });
      },

      clearJustVerified: () => {
        set({ justVerifiedRequiresLogin: false, justVerifiedEmail: null });
      },

      updateUser: (updates: Partial<UserProfile>) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        }));
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => secureStoreAdapter),
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
