import { Router } from 'express';
import { AnnouncementController } from './announcement.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new AnnouncementController();

// All routes require authentication
// Static routes MUST come before parameterized routes
router.get('/announcements/can-announce', authenticate, controller.canAnnounce.bind(controller));
router.get('/announcements/unread-count', authenticate, controller.getUnnotedCount.bind(controller));
router.get('/announcements', authenticate, controller.getAll.bind(controller));
router.post('/announcements', authenticate, controller.create.bind(controller));
router.put('/announcements/:id', authenticate, controller.update.bind(controller));
router.delete('/announcements/:id', authenticate, controller.delete.bind(controller));
router.post('/announcements/:id/note', authenticate, controller.noteAnnouncement.bind(controller));
router.delete('/announcements/:id/note', authenticate, controller.unnoteAnnouncement.bind(controller));

export { router as announcementRoutes };
