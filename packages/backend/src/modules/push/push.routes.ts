import { Router } from 'express';
import { PushController } from './push.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new PushController();

// Public endpoint — client needs this before auth to set up push
router.get('/push/vapid-public-key', (req, res) => controller.getVapidPublicKey(req, res));

// Authenticated endpoints
router.post('/push/subscribe', authenticate, (req, res) => controller.subscribe(req, res));
router.post('/push/unsubscribe', authenticate, (req, res) => controller.unsubscribe(req, res));

export { router as pushRoutes };
