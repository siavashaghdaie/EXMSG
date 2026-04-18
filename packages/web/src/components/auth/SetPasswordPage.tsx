import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Lock, MessageSquare, Building2, CheckCircle2, Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '../common/Button';
import { Toast } from '../common/Toast';

interface InviteData {
  email: string;
  orgName: string;
  displayName: string | null;
  inviterName: string;
  role: string;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 3) return { score, label: 'Fair', color: 'bg-yellow-500' };
  if (score <= 4) return { score, label: 'Good', color: 'bg-blue-500' };
  return { score, label: 'Strong', color: 'bg-green-500' };
}

export const SetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const token = searchParams.get('token');

  // Invite data can come from the AcceptInvitePage navigation state,
  // or we fetch it ourselves from the token.
  const passedInvite = (location.state as any)?.invite as InviteData | undefined;

  const [invite, setInvite] = useState<InviteData | null>(passedInvite || null);
  const [validating, setValidating] = useState(!passedInvite);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);

  const strength = useMemo(() => getPasswordStrength(password), [password]);

  // If we didn't receive invite data from navigation, validate the token
  useEffect(() => {
    if (passedInvite || !token) {
      setValidating(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await api.acceptInvite(token);
        if (cancelled) return;
        if (!result.valid || !result.invite) {
          setValidationError(result.error || 'This invitation link is invalid or has expired.');
        } else {
          setInvite(result.invite);
        }
      } catch (err: any) {
        if (cancelled) return;
        setValidationError(
          err?.response?.data?.error || 'Unable to validate invitation. Please try again.'
        );
      } finally {
        if (!cancelled) setValidating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, passedInvite]);

  // Validation
  const passwordError = useMemo(() => {
    if (!password) return null;
    if (password.length < 8) return 'At least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Add an uppercase letter';
    if (!/[a-z]/.test(password)) return 'Add a lowercase letter';
    if (!/[0-9]/.test(password)) return 'Add a number';
    return null;
  }, [password]);

  const confirmError = useMemo(() => {
    if (!confirmPassword) return null;
    if (confirmPassword !== password) return 'Passwords do not match';
    return null;
  }, [password, confirmPassword]);

  const canSubmit = password.length >= 8 && !passwordError && !confirmError && confirmPassword === password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !token) return;

    setSubmitting(true);
    setToast(null);

    try {
      const result = await api.setPassword(token, password);
      setToast({ message: result.message || 'Password set! Redirecting to login...', type: 'success' });

      // Store the email so the login page can prefill it
      setTimeout(() => {
        navigate('/login', {
          state: { inviteEmail: result.email },
        });
      }, 1500);
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to set password. Please try again.';
      setToast({ message: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // No token at all
  if (!token) {
    return (
      <PageWrapper>
        <ErrorState
          message="No invitation token found. Please check your email link."
          onLogin={() => navigate('/login')}
        />
      </PageWrapper>
    );
  }

  // Validating token
  if (validating) {
    return (
      <PageWrapper>
        <div className="text-center py-8">
          <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 text-sm">Verifying your invitation...</p>
        </div>
      </PageWrapper>
    );
  }

  // Token invalid
  if (validationError) {
    return (
      <PageWrapper>
        <ErrorState message={validationError} onLogin={() => navigate('/login')} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Org info banner */}
      {invite && (
        <div className="flex items-center gap-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg p-3 mb-6">
          <Building2 className="w-5 h-5 text-primary-600 dark:text-primary-400 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-primary-900 dark:text-primary-100">
              Joining {invite.orgName}
            </p>
            <p className="text-primary-700 dark:text-primary-300">
              {invite.email} &middot; {invite.role.toLowerCase()}
            </p>
          </div>
        </div>
      )}

      <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-1">
        Set Your Password
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Choose a secure password for your account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full pl-10 pr-10 py-2.5 border border-gray-300 dark:border-surface-600 rounded-lg bg-white dark:bg-surface-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {password && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      i <= strength.score ? strength.color : 'bg-gray-200 dark:bg-surface-600'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-xs ${passwordError ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                {passwordError || strength.label}
              </p>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Confirm Password
          </label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className={`w-full pl-10 pr-10 py-2.5 border rounded-lg bg-white dark:bg-surface-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ${
                confirmError
                  ? 'border-red-400 dark:border-red-500'
                  : 'border-gray-300 dark:border-surface-600'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmError && (
            <p className="mt-1 text-xs text-red-500">{confirmError}</p>
          )}
          {confirmPassword && !confirmError && confirmPassword === password && (
            <p className="mt-1 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Passwords match
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={!canSubmit || submitting}
          isLoading={submitting}
          className="w-full"
        >
          {submitting ? 'Setting password...' : 'Set Password & Continue'}
        </Button>
      </form>
    </PageWrapper>
  );
};

// ─── Helpers ──────────────────────────────────────────────────

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-start justify-center py-8 px-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
      </div>

      <div className="relative z-10 w-full max-w-md mt-12">
        <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-surface-700">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-800 dark:text-white">OmniLink</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message, onLogin }: { message: string; onLogin: () => void }) {
  return (
    <div className="text-center py-6">
      <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="w-7 h-7 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
        Invitation Error
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</p>
      <button
        onClick={onLogin}
        className="text-primary-600 hover:text-primary-700 text-sm font-medium"
      >
        Go to Login
      </button>
    </div>
  );
}
