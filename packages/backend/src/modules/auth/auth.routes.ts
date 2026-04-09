import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { registerSchema, loginSchema, refreshSchema, verifyOtpSchema, resendOtpSchema } from './auth.validation';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new AuthController();

router.post('/register', validate(registerSchema), controller.register);
router.post('/verify', validate(verifyOtpSchema), controller.verifyRegistration);
router.post('/resend-otp', validate(resendOtpSchema), controller.resendOtp);
router.post('/login', validate(loginSchema), controller.login);
router.post('/refresh', validate(refreshSchema), controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.me);

export { router as authRoutes };
