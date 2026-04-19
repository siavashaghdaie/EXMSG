import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useSuperAdminStore } from '@/store/superAdminStore';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Toast } from '../common/Toast';

interface FormErrors {
  email?: string;
  password?: string;
}

export const SuperAdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const {
    login,
    verifyLoginOtp,
    resendLoginOtp,
    cancelPendingOtp,
    pendingOtpEmail,
    isLoading,
    error,
    clearError,
  } = useSuperAdminStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState({ email: false, password: false });

  // OTP state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Focus first OTP input when OTP step becomes visible
  useEffect(() => {
    if (pendingOtpEmail) {
      inputRefs.current[0]?.focus();
    }
  }, [pendingOtpEmail]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
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
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (touched[name as keyof typeof touched]) {
      setFormErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name } = e.target;
    setTouched((prev) => ({
      ...prev,
      [name]: true,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await login(formData.email, formData.password);
      // After login, the store either flips to isAuthenticated OR sets pendingOtpEmail.
      const { isAuthenticated, pendingOtpEmail } = useSuperAdminStore.getState();
      if (isAuthenticated) {
        navigate('/omnilink-backoffice-x7k9');
      } else if (pendingOtpEmail) {
        // Nothing to do — the OTP step is rendered by this same component
      }
    } catch (err) {
      // Error already in store; Toast will render it
    }
  };

  // --- OTP handlers ---------------------------------------------------------

  const handleDigitChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value;
    setDigits(newDigits);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    if (value && index === 5) {
      const code = newDigits.join('');
      if (code.length === 6) {
        handleVerify(code);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newDigits = [...digits];
      for (let i = 0; i < pasted.length && i < 6; i++) {
        newDigits[i] = pasted[i];
      }
      setDigits(newDigits);
      const focusIdx = Math.min(pasted.length, 5);
      inputRefs.current[focusIdx]?.focus();
      if (pasted.length === 6) {
        handleVerify(pasted);
      }
    }
  };

  const handleVerify = async (code?: string) => {
    const otpCode = code || digits.join('');
    if (otpCode.length !== 6 || !pendingOtpEmail) return;

    try {
      await verifyLoginOtp(pendingOtpEmail, otpCode);
      navigate('/omnilink-backoffice-x7k9');
    } catch {
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !pendingOtpEmail) return;
    try {
      await resendLoginOtp(pendingOtpEmail);
      setResendCooldown(60);
      setResendMessage('A new code has been sent to your email.');
      setTimeout(() => setResendMessage(''), 5000);
    } catch {
      // error already in store
    }
  };

  const handleBackToPassword = () => {
    cancelPendingOtp();
    setDigits(['', '', '', '', '', '']);
  };

  const maskedEmail = pendingOtpEmail
    ? pendingOtpEmail.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(b.length) + c)
    : '';

  // Show OTP step when we have a pending OTP email
  if (pendingOtpEmail) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">OmniLink</h1>
            <p className="text-slate-400 text-sm">Back Office — Two-Step Sign In</p>
          </div>

          <div className="bg-slate-800 rounded-lg shadow-xl p-8">
            <h2 className="text-xl font-semibold text-white mb-2">Enter verification code</h2>
            <p className="text-sm text-slate-400 mb-6">
              We sent a 6-digit code to <strong className="text-slate-200">{maskedEmail}</strong>
            </p>

            <div className="flex justify-center gap-2 mb-6">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  disabled={isLoading}
                  className={`
                    w-12 h-14 text-center text-2xl font-bold rounded-lg border-2 transition-all
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${digit
                      ? 'border-blue-500 bg-blue-900/30 text-blue-100'
                      : 'border-slate-600 bg-slate-700 text-white'
                    }
                  `}
                />
              ))}
            </div>

            <p className="text-center text-xs text-slate-500 mb-4">Code expires in 10 minutes</p>

            <Button
              type="button"
              disabled={isLoading || digits.join('').length !== 6}
              onClick={() => handleVerify()}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isLoading ? 'Verifying...' : 'Verify & Sign In'}
            </Button>

            <div className="text-center mt-4">
              <p className="text-xs text-slate-400 mb-1">Didn't receive the code?</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || isLoading}
                className={`text-sm font-semibold transition-colors ${
                  resendCooldown > 0
                    ? 'text-slate-500 cursor-not-allowed'
                    : 'text-blue-400 hover:text-blue-300 cursor-pointer'
                }`}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleBackToPassword}
              className="flex items-center justify-center gap-2 w-full text-sm text-slate-400 hover:text-slate-200 transition-colors mt-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Use a different account
            </button>
          </div>
        </div>

        {error && <Toast message={error} type="error" onClose={clearError} duration={5000} />}
        {resendMessage && <Toast message={resendMessage} type="success" onClose={() => setResendMessage('')} />}
      </div>
    );
  }

  // Default: password step
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">OmniLink</h1>
          <p className="text-slate-400 text-sm">Back Office</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800 rounded-lg shadow-xl p-8">
          <h2 className="text-xl font-semibold text-white mb-6">Super Admin Login</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="admin@omnilink.com"
                  className="pl-10 bg-slate-700 border-slate-600 text-white placeholder-slate-500 focus:border-blue-500"
                  disabled={isLoading}
                />
              </div>
              {touched.email && formErrors.email && (
                <p className="mt-1 text-sm text-red-400">{formErrors.email}</p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="••••••••"
                  className="pl-10 bg-slate-700 border-slate-600 text-white placeholder-slate-500 focus:border-blue-500"
                  disabled={isLoading}
                />
              </div>
              {touched.password && formErrors.password && (
                <p className="mt-1 text-sm text-red-400">{formErrors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Footer Text */}
          <p className="text-center text-slate-400 text-xs mt-6">
            Super Admin access only. A verification code will be sent to your email.
          </p>
        </div>
      </div>

      {/* Toast Notification */}
      {error && (
        <Toast
          message={error}
          type="error"
          onClose={() => clearError()}
          duration={5000}
        />
      )}
    </div>
  );
};
