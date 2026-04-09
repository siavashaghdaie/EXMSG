import { Router } from 'express';
import { OrgAdminController } from './orgAdmin.controller';
import { authenticate } from '../../middleware/auth';
import { requireOrgAdmin } from '../../middleware/orgAdmin';

const router = Router();
const controller = new OrgAdminController();

// All routes require authentication
router.use(authenticate);

// Endpoints that don't need orgId resolution first (super admin listing/creating orgs)
router.get('/org-admin/organizations', (req, res) =>
  controller.listOrganizations(req, res)
);

router.post('/org-admin/organizations', (req, res) =>
  controller.createOrganization(req, res)
);

// All following routes require the caller to be an org admin (or SUPER_ADMIN)
router.use(requireOrgAdmin);

router.get('/org-admin/organization', (req, res) =>
  controller.getOrganization(req, res)
);

router.get('/org-admin/dashboard', (req, res) =>
  controller.getDashboard(req, res)
);

router.get('/org-admin/members', (req, res) =>
  controller.getMembers(req, res)
);

router.post('/org-admin/members', (req, res) =>
  controller.addMember(req, res)
);

router.patch('/org-admin/members/:userId', (req, res) =>
  controller.updateMemberRole(req, res)
);

router.delete('/org-admin/members/:userId', (req, res) =>
  controller.removeMember(req, res)
);

router.get('/org-admin/member/:userId/activity', (req, res) =>
  controller.getMemberActivity(req, res)
);

router.get('/org-admin/messages', (req, res) =>
  controller.getMessages(req, res)
);

router.get('/org-admin/reports/daily', (req, res) =>
  controller.getDailyReport(req, res)
);

router.get('/org-admin/reports/tasks', (req, res) =>
  controller.getTaskReport(req, res)
);

export { router as orgAdminRoutes };
