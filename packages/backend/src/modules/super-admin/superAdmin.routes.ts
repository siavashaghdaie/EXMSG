import { Router } from 'express';
import { SuperAdminController } from './superAdmin.controller';
import { authenticate } from '../../middleware/auth';
import { requireSuperAdmin } from '../../middleware/superAdmin';

const router = Router();
const controller = new SuperAdminController();

// Public login endpoint (no auth required, but validates SUPER_ADMIN role)
router.post('/super-admin/login', (req, res) => controller.login(req, res));

// Public verify-login endpoint — second step of 2FA (email OTP)
router.post('/super-admin/verify-login', (req, res) => controller.verifyLogin(req, res));

// Protected super admin endpoints
router.get('/super-admin/dashboard', authenticate, requireSuperAdmin, (req, res) =>
  controller.getDashboard(req, res)
);

router.get('/super-admin/organizations', authenticate, requireSuperAdmin, (req, res) =>
  controller.getOrganizations(req, res)
);

router.get('/super-admin/users', authenticate, requireSuperAdmin, (req, res) =>
  controller.getUsers(req, res)
);

router.get('/super-admin/activity-log', authenticate, requireSuperAdmin, (req, res) =>
  controller.getActivityLog(req, res)
);

router.get('/super-admin/financial', authenticate, requireSuperAdmin, (req, res) =>
  controller.getFinancial(req, res)
);

export { router as superAdminRoutes };
