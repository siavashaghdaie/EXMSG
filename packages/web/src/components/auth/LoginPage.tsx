import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, Lock, MessageSquare, CheckCircle2, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Toast } from '../common/Toast';

interface FormErrors {
  email?: string;
  password?: string;
}

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    login,
    isLoading,
    error,
    clearError,
    justVerifiedRequiresLogin,
    justVerifiedEmail,
    clearJustVerified,
  } = useAuthStore();

  // SetPasswordPage passes inviteEmail via location state after a successful password set.
  const inviteEmail = (location.state as any)?.inviteEmail as string | undefined;

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState({ email: false, password: false });
  const [showVerifiedBanner, setShowVerifiedBanner] = useState(false);

  // Load remember me data on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail, rememberMe: true }));
    }
  }, []);

  // Handle the "just verified, please sign in" banner that the Panel Owner
  // register → verify → login flow hands us via the auth store.
  useEffect(() => {
    if (justVerifiedRequiresLogin) {
      setShowVerifiedBanner(true);
      if (justVerifiedEmail) {
        setFormData(prev => ({ ...prev, email: justVerifiedEmail }));
      }
      // Clear the flag right away so refreshing doesn't keep showing it.
      clearJustVerified();
    }
  }, [justVerifiedRequiresLogin, justVerifiedEmail, clearJustVerified]);

  // Handle the invite flow: SetPasswordPage passes inviteEmail after
  // the invitee successfully sets their password.
  useEffect(() => {
    if (inviteEmail) {
      setShowVerifiedBanner(true);
      setFormData(prev => ({ ...prev, email: inviteEmail }));
    }
  }, [inviteEmail]);

  const validateIdentifier = (value: string): boolean => {
    // Accept either a valid email or a username (3+ chars, alphanumeric + underscore)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    return emailRegex.test(value) || usernameRegex.test(value);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.email.trim()) {
      errors.email = 'Email or username is required';
    } else if (!validateIdentifier(formData.email)) {
      errors.email = 'Please enter a valid email address or username';
    }

    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error when user starts typing
    if (touched[name as keyof typeof touched]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      // Save email if remember me is checked
      if (formData.rememberMe) {
        localStorage.setItem('rememberedEmail', formData.email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      await login(formData.email, formData.password);
      // After login, either we're authenticated OR the server wants an OTP.
      const { pendingVerificationEmail, isAuthenticated } = useAuthStore.getState();
      if (pendingVerificationEmail) {
        navigate('/verify');
      } else if (isAuthenticated) {
        navigate('/chat');
      }
    } catch (err: any) {
      // If verification required, redirect to OTP page
      const { pendingVerificationEmail, isAuthenticated } = useAuthStore.getState();
      if (pendingVerificationEmail) {
        navigate('/verify');
      } else if (isAuthenticated) {
        navigate('/chat');
      } else {
        console.error('Login failed:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-start justify-center py-8 px-4">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 dark:bg-blue-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-purple-200 dark:bg-purple-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-200 dark:bg-pink-900/20 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg">
              <MessageSquare className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome back
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Sign in to your OmniLink account
          </p>
        </div>

        {/* Post-verification success banner (Panel Owner flow, spec 2.3.5) */}
        {showVerifiedBanner && (
          <div className="mb-4 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                Your email is verified
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                Sign in with your new password to open your workspace panel.
              </p>
            </div>
            <button
              onClick={() => setShowVerifiedBanner(false)}
              className="text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Login Card */}
        {/* Error Toast Popup */}
        {error && (
          <Toast message={error} type="error" onClose={clearError} />
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 space-y-6 border border-gray-200 dark:border-gray-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email or Username Input */}
            <Input
              type="text"
              name="email"
              label="Email or username"
              placeholder="you@example.com or username"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.email ? formErrors.email : undefined}
              icon={<Mail className="h-5 w-5" />}
              autoComplete="email"
              disabled={isLoading}
            />

            {/* Password Input */}
            <Input
              type="password"
              name="password"
              label="Password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.password ? formErrors.password : undefined}
              icon={<Lock className="h-5 w-5" />}
              showPasswordToggle
              autoComplete="current-password"
              disabled={isLoading}
            />

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  disabled={isLoading}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 cursor-pointer disabled:opacity-50"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                  Remember me
                </span>
              </label>
              <Link
                to="/forgot-password"
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading}
              disabled={isLoading}
              className="mt-6"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                or
              </span>
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-gray-700 dark:text-gray-300">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold transition-colors"
            >
              Create one
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 dark:text-gray-400 text-sm mt-6">
          By signing in, you agree to our{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">
            Privacy Policy
          </a>
        </p>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};
