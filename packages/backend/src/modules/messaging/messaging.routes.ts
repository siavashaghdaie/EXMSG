import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { MessagingController } from './messaging.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new MessagingController();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (_req, _file, cb) => {
    cb(null, true); // Accept all file types
  },
});

// All messaging routes require authentication
router.use(authenticate);

// Conversations
router.get('/conversations', controller.getConversations);
router.post('/conversations', controller.createConversation);
router.get('/conversations/:conversationId', controller.getConversation);
router.delete('/conversations/:conversationId', controller.deleteConversation.bind(controller));

// Messages
router.get('/conversations/:conversationId/messages', controller.getMessages);
router.post('/conversations/:conversationId/messages', controller.sendMessage);
router.get('/messages/search', controller.searchMessages.bind(controller));
router.put('/messages/:messageId', controller.editMessage);
router.delete('/messages/:messageId', controller.deleteMessage);

// File upload
router.post('/conversations/:conversationId/upload', upload.single('file'), controller.uploadFile);

// Reactions
router.post('/messages/:messageId/reactions', controller.addReaction);
router.delete('/messages/:messageId/reactions/:emoji', controller.removeReaction);

// Read receipts
router.post('/conversations/:conversationId/read', controller.markAsRead);

// Message pinning
router.post('/conversations/:conversationId/pins', controller.pinMessage.bind(controller));
router.delete('/conversations/:conversationId/pins/:messageId', controller.unpinMessage.bind(controller));
router.get('/conversations/:conversationId/pins', controller.getPinnedMessages.bind(controller));

// Message forwarding
router.post('/messages/:messageId/forward', controller.forwardMessage.bind(controller));

export { router as messagingRoutes };
