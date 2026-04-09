import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, UserProfile, isLoginOtpRequired } from '../services/api';

interface SuperAdminState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCheckedAuth: boolean;
  error: string | null;
  pendingOtpEmail: string | null;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  verifyLoginOtp: (email: string, code: string) => Promise<void>;
  resendLoginOtp: (email: string) => Promise<void>;
  cancelPendingOtp: () => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
}

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      hasCheckedAuth: false,
      error: null,
      pendingOtpEmail: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.superAdminLogin(email, password);

          // Two-factor path — server wants an emailed OTP before it issues tokens
          if (isLoginOtpRequired(response)) {
            set({
              isLoading: false,
              error: null,
              pendingOtpEmail: response.email,
              isAuthenticated: false,
            });
            return;
          }

          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
            pendingOtpEmail: null,
          });
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.error || error.response?.data?.message || error.message || 'Login failed';
          set({
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      verifyLoginOtp: async (email: string, code: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await api.verifySuperAdminLoginOtp(email, code);
          set({
            user: response.user,
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
            pendingOtpEmail: null,
          });
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.error || error.response?.data?.message || error.message || 'Verification failed';
          set({
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          throw error;
        }
      },

      resendLoginOtp: async (email: string) => {
        set({ isLoading: true, error: null });
        try {
          // Trigger a fresh OTP by re-calling super admin login endpoint would need the
          // password again. Use the regular resend-otp path instead with purpose=login.
          await api.resendOtp(email, 'login');
          set({ isLoading: false });
        } catch (error: any) {
          const errorMessage =
            error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to resend code';
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      cancelPendingOtp: () => {
        set({ pendingOtpEmail: null, error: null });
      },

      logout: async () => {
        // Do NOT clear shared accessToken/refreshToken here — the regular
        // authStore owns those. Simply drop super-admin identity.
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
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
              hasCheckedAuth: true,
            });
            return;
          }

          // Verify the current token actually belongs to a super admin.
          // IMPORTANT: do NOT clear the token on failure — it may belong
          // to a regular user whose session we shouldn't touch.
          await api.getSuperAdminDashboard();
          set({
            isAuthenticated: true,
            isLoading: false,
            hasCheckedAuth: true,
          });
        } catch (error: any) {
          set({
            isAuthenticated: false,
            user: null,
            isLoading: false,
            hasCheckedAuth: true,
            error: null,
          });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'super-admin-storage',
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
      },
    }
  )
);
