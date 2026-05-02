import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
      .optional(),
    displayName: z
      .string()
      .min(1, 'Display name is required')
      .max(50, 'Display name must be at most 50 characters'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    // Panel Owner newcomer fields (section 2.3 of the spec).
    // When companyName is provided, the backend treats the signup as a
    // Panel Owner flow: it creates an Organization and attaches the new
    // user as OWNER. When it is absent, the endpoint behaves exactly
    // like the existing "create a chat account" flow used by invited
    // members and returning users on the legacy register page.
    companyName: z
      .string()
      .min(2, 'Company name must be at least 2 characters')
      .max(100, 'Company name must be at most 100 characters')
      .optional(),
    plan: z.enum(['starter', 'professional', 'business', 'enterprise']).optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    // Accept either a valid email or a username (non-email string).
    // The controller will look up the user by email OR username.
    email: z.string().min(1, 'Email or username is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d{6}$/, 'Code must be numeric'),
  }),
});

// Same shape as verifyOtpSchema, separate export for clarity at the route level
export const verifyLoginSchema = verifyOtpSchema;

export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    purpose: z.enum(['register', 'login', 'reset']).optional().default('register'),
  }),
});

// ─── Invite Flow Schemas ───────────────────────────────────────

export const setPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Invitation token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
