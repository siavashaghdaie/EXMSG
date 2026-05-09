import { Router } from 'express';
import { PermissionsController } from './permissions.controller';
import { authenticate } from '../../middleware/auth';
import { requireOrgAdmin } from '../../middleware/orgAdmin';

const router = Router();
const controller = new PermissionsController();

// All routes require authentication
router.use(authenticate);

// Anyone can get permission definitions and their own permissions
router.get('/permissions/definitions', (req, res) => controller.getDefinitions(req, res));
router.get('/permissions/me', (req, res) => controller.getMyPermissions(req, res));

// Org admin only: view/set member permissions
router.get('/permissions/members/:userId', requireOrgAdmin, (req, res) => controller.getMemberPermissions(req, res));
router.put('/permissions/members/:userId', requireOrgAdmin, (req, res) => controller.setMemberPermissions(req, res));

export { router as permissionsRoutes };
