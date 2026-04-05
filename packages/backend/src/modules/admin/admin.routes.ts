import { Router } from 'express';
import { AdminController } from './admin.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new AdminController();

router.get('/admin/dashboard', authenticate, (req, res) => controller.getDashboard(req, res));
router.get('/admin/users', authenticate, (req, res) => controller.getUsers(req, res));
router.get('/admin/stats', authenticate, (req, res) => controller.getStats(req, res));

export { router as adminRoutes };
