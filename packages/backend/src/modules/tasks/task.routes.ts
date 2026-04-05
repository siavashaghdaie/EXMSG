import { Router } from 'express';
import { TaskController } from './task.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new TaskController();

router.get('/tasks', authenticate, controller.getTasks.bind(controller));
router.post('/tasks', authenticate, controller.createTask.bind(controller));
router.patch('/tasks/:taskId', authenticate, controller.updateTask.bind(controller));
router.delete('/tasks/:taskId', authenticate, controller.deleteTask.bind(controller));

export { router as taskRoutes };
