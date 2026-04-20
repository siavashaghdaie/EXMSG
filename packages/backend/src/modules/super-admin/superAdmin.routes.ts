import { Router } from 'express';
import { SuperAdminController } from './superAdmin.controller';
import { requireSuperAdmin } from '../../middleware/superAdmin';

const router = Router();
const controller = new SuperAdminController();

// Public login endpoints (no auth required)
router.post('/super-admin/login', (req, res) => controller.login(req, res));
router.post('/super-admin/verify-login', (req, res) => controller.verifyLogin(req, res));

// All protected endpoints use requireSuperAdmin which handles its own JWT auth
// (separate from the regular user `authenticate` middleware)
router.get('/super-admin/dashboard', requireSuperAdmin, (req, res) =>
  controller.getDashboard(req, res)
);

// Organizations CRUD
router.get('/super-admin/organizations', requireSuperAdmin, (req, res) =>
  controller.getOrganizations(req, res)
);
router.post('/super-admin/organizations', requireSuperAdmin, (req, res) =>
  controller.createOrganization(req, res)
);
router.patch('/super-admin/organizations/:id', requireSuperAdmin, (req, res) =>
  controller.updateOrganization(req, res)
);
router.delete('/super-admin/organizations/:id', requireSuperAdmin, (req, res) =>
  controller.deleteOrganization(req, res)
);

// Users CRUD
router.get('/super-admin/users', requireSuperAdmin, (req, res) =>
  controller.getUsers(req, res)
);
router.patch('/super-admin/users/:id', requireSuperAdmin, (req, res) =>
  controller.updateUser(req, res)
);
router.delete('/super-admin/users/:id', requireSuperAdmin, (req, res) =>
  controller.deleteUser(req, res)
);
router.post('/super-admin/users/:id/reset-password', requireSuperAdmin, (req, res) =>
  controller.resetUserPassword(req, res)
);

// Super admin password change
router.post('/super-admin/change-password', requireSuperAdmin, (req, res) =>
  controller.changeSuperAdminPassword(req, res)
);

// Activity & Financial
router.get('/super-admin/activity-log', requireSuperAdmin, (req, res) =>
  controller.getActivityLog(req, res)
);
router.get('/super-admin/financial', requireSuperAdmin, (req, res) =>
  controller.getFinancial(req, res)
);

export { router as superAdminRoutes };
