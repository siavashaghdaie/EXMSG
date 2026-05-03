import { Router } from 'express';
import { AgentController } from './agent.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new AgentController();

// All routes require authentication
router.use(authenticate);

// Agent catalog (marketplace browsing)
router.get('/agents/catalog', (req, res) => controller.getCatalog(req, res));

// Org-specific hired agents
router.get('/agents/hired', (req, res) => controller.getHiredAgents(req, res));

// Hire / fire / settings
router.post('/agents/:agentId/hire', (req, res) => controller.hireAgent(req, res));
router.delete('/agents/:agentId/fire', (req, res) => controller.fireAgent(req, res));
router.patch('/agents/:agentId/settings', (req, res) => controller.updateSettings(req, res));

export { router as agentRoutes };
