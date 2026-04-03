import { Router } from 'express';
import { MessagingController } from './messaging.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new MessagingController();

// All messaging routes require authentication
router.use(authenticate);

// Conversations
router.get('/conversations', controller.getConversations);
router.post('/conversations', controller.createConversation);
router.get('/conversations/:conversationId', controller.getConversation);

// Messages
router.get('/conversations/:conversationId/messages', controller.getMessages);
router.post('/conversations/:conversationId/messages', controller.sendMessage);
router.put('/messages/:messageId', controller.editMessage);
router.delete('/messages/:messageId', controller.deleteMessage);

// Reactions
router.post('/messages/:messageId/reactions', controller.addReaction);
router.delete('/messages/:messageId/reactions/:emoji', controller.removeReaction);

// Read receipts
router.post('/conversations/:conversationId/read', controller.markAsRead);

export { router as messagingRoutes };
