import { Router } from 'express';
import { E2EEController } from './e2ee.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new E2EEController();

// All routes require authentication
router.use(authenticate);

// Key management
router.post('/keys', controller.uploadPublicKey.bind(controller));
router.get('/keys', controller.getMyKeys.bind(controller));
router.get('/keys/:userId', controller.getUserKeys.bind(controller));
router.delete('/keys/:deviceId', controller.revokeKey.bind(controller));

// Conversation E2EE toggle
router.post('/conversations/:conversationId/enable', controller.enableE2EE.bind(controller));
router.post('/conversations/:conversationId/disable', controller.disableE2EE.bind(controller));
router.get('/conversations/:conversationId/keys', controller.getConversationKeys.bind(controller));

export default router;
