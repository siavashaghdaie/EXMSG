import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { OrgAdminController } from './orgAdmin.controller';
import { authenticate } from '../../middleware/auth';
import { requireOrgAdmin } from '../../middleware/orgAdmin';

const router = Router();
const controller = new OrgAdminController();

// Configure multer for org logo uploads
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/logos/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

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

router.get('/org-admin/profile', (req, res) =>
  controller.getProfile(req, res)
);

router.patch('/org-admin/profile', (req, res) =>
  controller.updateProfile(req, res)
);

router.post('/org-admin/profile/logo', logoUpload.single('logo'), (req, res) =>
  controller.uploadLogo(req, res)
);

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

router.post('/org-admin/members/:userId/resend-invite', (req, res) =>
  controller.resendInvite(req, res)
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

// ─── Department Management ──────────────────────────────────────────────
router.get('/org-admin/departments', (req, res) =>
  controller.getDepartments(req, res)
);

router.post('/org-admin/departments', (req, res) =>
  controller.createDepartment(req, res)
);

router.patch('/org-admin/departments/:departmentId', (req, res) =>
  controller.updateDepartment(req, res)
);

router.delete('/org-admin/departments/:departmentId', (req, res) =>
  controller.deleteDepartment(req, res)
);

router.post('/org-admin/departments/:departmentId/members', (req, res) =>
  controller.addDepartmentMember(req, res)
);

router.delete('/org-admin/departments/:departmentId/members/:userId', (req, res) =>
  controller.removeDepartmentMember(req, res)
);

export { router as orgAdminRoutes };
