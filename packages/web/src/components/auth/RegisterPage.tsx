import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, MessageSquare, Building2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api, PlanDefinition, PlanId } from '@/services/api';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Toast } from '../common/Toast';

interface FormErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
  companyName?: string;
}

const VALID_PLAN_IDS: readonly PlanId[] = ['starter', 'professional', 'business', 'enterprise'] as const;

function parsePlanId(value: string | null): PlanId | null {
  if (!value) return null;
  return (VALID_PLAN_IDS as readonly string[]).includes(value) ? (value as PlanId) : null;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, isLoading, error, clearError } = useAuthStore();

  // Panel Owner flow is triggered either explicitly (?panelOwner=1) or
  // implicitly by landing here with a ?plan=<id> query param. The flag is
  // derived from the URL — it never changes within a single mount, but we
  // recompute if the user somehow navigates with new query params.
  const initialPlanId = useMemo(
    () => parsePlanId(searchParams.get('plan')),
    [searchParams]
  );
  const isPanelOwner = useMemo(
    () => searchParams.get('panelOwner') === '1' || initialPlanId !== null,
    [searchParams, initialPlanId]
  );

  const [selectedPlanId] = useState<PlanId>(initialPlanId ?? 'starter');
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [plansLoadError, setPlansLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Only Panel Owner registrations need the plan metadata. The legacy
    // "create a chat account" flow is unaffected.
    if (!isPanelOwner) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getPlans();
        if (cancelled) return;
        const match = res.plans.find((p) => p.id === selectedPlanId) ?? res.plans[0];
        setSelectedPlan(match || null);
        // If the plan in the URL is not self-servable (e.g. user deep-linked
        // to ?plan=professional), bounce them back to plan selection.
        if (match && !match.publiclySelfServable) {
          navigate(`/plans?highlight=${match.id}`, { replace: true });
        }
      } catch (err: any) {
        if (!cancelled) {
          setPlansLoadError(
            err?.response?.data?.error || err?.message || 'Could not load plan details'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPanelOwner, selectedPlanId, navigate]);

  const [formData, setFormData] = useState({
    email: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    agreeToTerms: false,
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState({
    email: false,
    displayName: false,
    password: false,
    confirmPassword: false,
    companyName: false,
  });

  const calculatePasswordStrength = (password: string): PasswordStrength => {
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const strengthMap: Record<number, PasswordStrength> = {
      0: { score: 0, label: 'Very weak', color: 'bg-red-500' },
      1: { score: 1, label: 'Weak', color: 'bg-red-500' },
      2: { score: 2, label: 'Fair', color: 'bg-yellow-500' },
      3: { score: 3, label: 'Good', color: 'bg-yellow-500' },
      4: { score: 4, label: 'Strong', color: 'bg-blue-500' },
      5: { score: 5, label: 'Very strong', color: 'bg-green-500' },
      6: { score: 6, label: 'Very strong', color: 'bg-green-500' },
    };

    return strengthMap[score] || strengthMap[0];
  };

  const passwordStrength = calculatePasswordStrength(formData.password);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Email validation
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Display name validation
    if (!formData.displayName.trim()) {
      errors.displayName = 'Display name is required';
    } else if (formData.displayName.length < 2) {
      errors.displayName = 'Display name must be at least 2 characters';
    }

    // Company name — only required for the Panel Owner flow
    if (isPanelOwner) {
      if (!formData.companyName.trim()) {
        errors.companyName = 'Company or team name is required';
      } else if (formData.companyName.trim().length < 2) {
        errors.companyName = 'Company name must be at least 2 characters';
      } else if (formData.companyName.trim().length > 100) {
        errors.companyName = 'Company name must be at most 100 characters';
      }
    }

    // Password validation
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (passwordStrength.score < 2) {
      errors.password = 'Password is too weak';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
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

    if (!formData.agreeToTerms) {
      alert('Please agree to the Terms of Service and Privacy Policy');
      return;
    }

    try {
      await register(
        formData.email,
        formData.displayName,
        formData.password,
        isPanelOwner
          ? {
              companyName: formData.companyName.trim(),
              plan: selectedPlanId,
            }
          : undefined
      );
      // Check if we need OTP verification
      const { pendingVerificationEmail, isAuthenticated } = useAuthStore.getState();
      if (pendingVerificationEmail) {
        navigate('/verify');
      } else if (isAuthenticated) {
        navigate('/chat');
      }
    } catch (err: any) {
      // If verification is required (e.g. 409 unverified duplicate), redirect
      const { pendingVerificationEmail, isAuthenticated } = useAuthStore.getState();
      if (pendingVerificationEmail) {
        navigate('/verify');
      } else if (isAuthenticated) {
        navigate('/chat');
      } else {
        console.error('Registration failed:', err);
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
            {isPanelOwner ? 'Create your workspace' : 'Join OmniLink'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isPanelOwner
              ? "You'll be the owner of your new OmniLink panel"
              : 'Create your account to get started'}
          </p>
        </div>

        {/* Selected plan banner — Panel Owner flow only */}
        {isPanelOwner && (
          <div className="mb-4 bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-800 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex-shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Selected plan</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                  {selectedPlan ? selectedPlan.name : selectedPlanId}
                  {selectedPlan && selectedPlan.priceMonthly === 0
                    ? ' — Free'
                    : selectedPlan && selectedPlan.priceMonthly > 0
                    ? ` — $${selectedPlan.priceMonthly}/user/mo`
                    : ''}
                </p>
              </div>
            </div>
            <Link
              to="/plans"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
            >
              Change
            </Link>
          </div>
        )}
        {isPanelOwner && plansLoadError && (
          <p className="mb-3 text-xs text-red-600 dark:text-red-400 text-center">
            {plansLoadError}
          </p>
        )}

        {/* Registration Card */}
        {/* Error Toast Popup */}
        {error && (
          <Toast message={error} type="error" onClose={clearError} />
        )}

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8 space-y-6 border border-gray-200 dark:border-gray-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Company name — Panel Owner flow only */}
            {isPanelOwner && (
              <Input
                type="text"
                name="companyName"
                label="Company or team name"
                placeholder="Acme Inc."
                value={formData.companyName}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.companyName ? formErrors.companyName : undefined}
                icon={<Building2 className="h-5 w-5" />}
                autoComplete="organization"
                disabled={isLoading}
              />
            )}

            {/* Email Input */}
            <Input
              type="email"
              name="email"
              label="Email address"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.email ? formErrors.email : undefined}
              icon={<Mail className="h-5 w-5" />}
              autoComplete="email"
              disabled={isLoading}
            />

            {/* Display Name Input */}
            <Input
              type="text"
              name="displayName"
              label="Display name"
              placeholder="John Doe"
              value={formData.displayName}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.displayName ? formErrors.displayName : undefined}
              icon={<User className="h-5 w-5" />}
              disabled={isLoading}
            />

            {/* Password Input */}
            <div>
              <Input
                type="password"
                name="password"
                label="Password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.password ? formErrors.password : undefined}
                icon={<Lock className="h-5 w-5" />}
                showPasswordToggle
                autoComplete="new-password"
                disabled={isLoading}
              />

              {/* Password Strength Indicator */}
              {formData.password && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`flex-1 h-1 rounded-full transition-colors ${
                          i < passwordStrength.score
                            ? passwordStrength.color
                            : 'bg-gray-300 dark:bg-gray-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Password strength:{' '}
                    <span className={`font-bold ${passwordStrength.color.replace('bg-', 'text-')}`}>
                      {passwordStrength.label}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <Input
              type="password"
              name="confirmPassword"
              label="Confirm password"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              onBlur={handleBlur}
              error={touched.confirmPassword ? formErrors.confirmPassword : undefined}
              icon={<Lock className="h-5 w-5" />}
              showPasswordToggle
              autoComplete="new-password"
              disabled={isLoading}
            />

            {/* Terms Agreement */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleChange}
                disabled={isLoading}
                className="w-4 h-4 mt-1 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 cursor-pointer disabled:opacity-50 flex-shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I agree to the{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Privacy Policy
                </a>
              </span>
            </label>

            {/* Submit Button */}
            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isLoading}
              disabled={isLoading || !formData.agreeToTerms}
              className="mt-6"
            >
              {isLoading ? 'Creating account...' : 'Create account'}
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

          {/* Sign In Link */}
          <p className="text-center text-gray-700 dark:text-gray-300">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 dark:text-gray-400 text-xs mt-6">
          We'll never share your personal information with anyone.
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
