import { Router } from 'express';
import { CallController } from './call.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new CallController();

router.use(authenticate);

router.get('/calls/turn-credentials', (req, res) => controller.getTurnCredentials(req, res));
router.get('/calls', (req, res) => controller.getCallHistory(req, res));
router.get('/calls/:callId', (req, res) => controller.getCall(req, res));

export { router as callRoutes };
