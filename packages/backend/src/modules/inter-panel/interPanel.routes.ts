import { Router } from 'express';
import { InterPanelController } from './interPanel.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new InterPanelController();

// Public route - no authentication required
router.get('/panels/public', controller.listPublicPanels);

// All routes below require authentication
router.get('/panels/search', authenticate, controller.searchPanels);
router.post('/panels/request', authenticate, controller.sendRequest);
router.get('/panels/requests', authenticate, controller.listRequests);
router.post('/panels/requests/:id/accept', authenticate, controller.acceptRequest);
router.post('/panels/requests/:id/reject', authenticate, controller.rejectRequest);

export { router as interPanelRoutes };
