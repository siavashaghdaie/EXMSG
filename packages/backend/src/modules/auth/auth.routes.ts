import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middleware/validate';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyOtpSchema,
  verifyLoginSchema,
  resendOtpSchema,
  setPasswordSchema,
} from './auth.validation';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();

// Apply stricter rate limiting to auth endpoints
router.use(authLimiter);
const controller = new AuthController();

// Public plan catalog (used by landing page + plan selection screen)
router.get('/plans', (req, res) => controller.listPlans(req, res));
router.post('/register', validate(registerSchema), (req, res) => controller.register(req, res));
router.post('/verify', validate(verifyOtpSchema), (req, res) => controller.verifyRegistration(req, res));
router.post('/resend-otp', validate(resendOtpSchema), (req, res) => controller.resendOtp(req, res));
router.post('/login', validate(loginSchema), (req, res) => controller.login(req, res));
router.post('/verify-login', validate(verifyLoginSchema), (req, res) => controller.verifyLogin(req, res));
router.post('/refresh', validate(refreshSchema), (req, res) => controller.refresh(req, res));
router.post('/logout', authenticate, (req, res) => controller.logout(req, res));
router.get('/me', authenticate, (req, res) => controller.me(req, res));

// ─── Privacy Settings ─────────────────────────────────────────
router.get('/privacy', authenticate, (req, res) => controller.getPrivacySettings(req, res));
router.patch('/privacy', authenticate, (req, res) => controller.updatePrivacySettings(req, res));

// ─── Invite Flow ───────────────────────────────────────────────
router.get('/accept-invite', (req, res) => controller.acceptInvite(req, res));
router.post('/set-password', validate(setPasswordSchema), (req, res) => controller.setPassword(req, res));

export { router as authRoutes };
