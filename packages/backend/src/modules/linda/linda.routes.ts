import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { LindaController } from './linda.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new LindaController();

// Configure multer for Linda file uploads (temp storage)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'linda-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit for Linda
});

// Chat endpoints
router.post('/linda/chat', authenticate, controller.chat.bind(controller));
router.post('/linda/chat/file', authenticate, upload.single('file'), controller.chatWithFile.bind(controller));

// Greeting
router.get('/linda/greeting', authenticate, controller.getGreeting.bind(controller));

// Conversation management
router.get('/linda/conversations', authenticate, controller.getConversations.bind(controller));
router.get('/linda/conversations/all', authenticate, controller.getAllConversations.bind(controller));
router.get('/linda/conversations/:id/messages', authenticate, controller.getConversationMessages.bind(controller));

// Activities
router.get('/linda/activities', authenticate, controller.getActivities.bind(controller));

// Manager check
router.get('/linda/manager-check', authenticate, controller.checkManager.bind(controller));

export { router as lindaRoutes };
