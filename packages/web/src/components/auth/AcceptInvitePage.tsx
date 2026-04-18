import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, Building2, MessageSquare } from 'lucide-react';
import { api } from '@/services/api';

interface InviteData {
  email: string;
  orgName: string;
  displayName: string | null;
  inviterName: string;
  role: string;
}

export const AcceptInvitePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteData | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No invitation token found. Please check your email link and try again.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await api.acceptInvite(token);
        if (cancelled) return;

        if (!result.valid || !result.invite) {
          setError(result.error || 'This invitation link is invalid or has expired.');
          setLoading(false);
          return;
        }

        setInvite(result.invite);
        setLoading(false);

        // Auto-redirect to set-password after a short delay so the user
        // can see the welcome message before being taken to password setup.
        setTimeout(() => {
          if (!cancelled) {
            navigate(`/set-password?token=${encodeURIComponent(token)}`, {
              state: { invite: result.invite },
            });
          }
        }, 2500);
      } catch (err: any) {
        if (cancelled) return;
        const msg =
          err?.response?.data?.error ||
          (err?.code === 'ERR_NETWORK'
            ? 'Unable to connect. Please check your internet connection.'
            : 'Something went wrong. Please try again.');
        setError(msg);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center py-8 px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white dark:bg-surface-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-surface-700">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-800 dark:text-white">OmniLink</span>
          </div>

          {loading && (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 text-primary-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Verifying your invitation...
              </p>
            </div>
          )}

          {error && (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                Invitation Error
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{error}</p>
              <button
                onClick={() => navigate('/login')}
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Go to Login
              </button>
            </div>
          )}

          {invite && !error && !loading && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-7 h-7 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-2">
                Welcome to {invite.orgName}!
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {invite.inviterName} has invited you to join as{' '}
                <span className="font-medium">{invite.role.toLowerCase()}</span>.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                Email verified: <span className="font-medium">{invite.email}</span>
              </p>
              <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirecting to set your password...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
