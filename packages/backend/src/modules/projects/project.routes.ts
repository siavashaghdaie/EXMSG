import { Router } from 'express';
import { ProjectController } from './project.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new ProjectController();

// All routes require authentication
router.use(authenticate);

// Project CRUD
router.get('/projects', (req, res) => controller.getProjects(req, res));
router.post('/projects', (req, res) => controller.createProject(req, res));
router.post('/projects/find-or-create', (req, res) => controller.findOrCreate(req, res));
router.get('/projects/mates', (req, res) => controller.getProjectMates(req, res));
router.get('/projects/:projectId', (req, res) => controller.getProject(req, res));
router.patch('/projects/:projectId', (req, res) => controller.updateProject(req, res));
router.delete('/projects/:projectId', (req, res) => controller.deleteProject(req, res));

// Project chat room (on-demand creation)
router.post('/projects/:projectId/conversation', (req, res) => controller.createConversation(req, res));

// Project member management
router.post('/projects/:projectId/members', (req, res) => controller.addMember(req, res));
router.delete('/projects/:projectId/members/:userId', (req, res) => controller.removeMember(req, res));

export { router as projectRoutes };
