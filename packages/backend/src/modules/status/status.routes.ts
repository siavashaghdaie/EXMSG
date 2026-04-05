import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { StatusController } from './status.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new StatusController();

// Configure multer for Status media uploads (temp storage)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'status-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for status media
});

// POST endpoints for creating statuses
router.post('/status/text', authenticate, controller.createTextStatus.bind(controller));
router.post('/status/media', authenticate, upload.single('file'), controller.createMediaStatus.bind(controller));

// GET endpoints for fetching statuses
router.get('/status/mine', authenticate, controller.getMyStatuses.bind(controller));
router.get('/status/contacts', authenticate, controller.getContactStatuses.bind(controller));

// POST endpoint for marking status as viewed
router.post('/status/:id/view', authenticate, controller.viewStatus.bind(controller));

// DELETE endpoint for deleting own status
router.delete('/status/:id', authenticate, controller.deleteStatus.bind(controller));

// POST endpoint for liking/unliking a status
router.post('/status/:id/like', authenticate, controller.likeStatus.bind(controller));

// GET endpoint for fetching status likes
router.get('/status/:id/likes', authenticate, controller.getStatusLikes.bind(controller));

export { router as statusRoutes };
