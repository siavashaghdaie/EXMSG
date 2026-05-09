import { Router } from 'express';
import { AuditController } from './audit.controller';
import { authenticate } from '../../middleware/auth';
import { requireOrgAdmin } from '../../middleware/orgAdmin';

const router = Router();
const controller = new AuditController();

// All audit routes require authentication + org admin
router.use(authenticate);
router.use(requireOrgAdmin);

router.get('/audit/logs', (req, res) => controller.getLogs(req, res));
router.get('/audit/logs/summary', (req, res) => controller.getSummary(req, res));
router.get('/audit/logs/export', (req, res) => controller.exportLogs(req, res));

export { router as auditRoutes };
