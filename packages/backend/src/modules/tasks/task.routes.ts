import { Router } from 'express';
import { TaskController } from './task.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new TaskController();

router.get('/tasks', authenticate, controller.getTasks.bind(controller));
router.post('/tasks', authenticate, controller.createTask.bind(controller));
router.patch('/tasks/:taskId', authenticate, controller.updateTask.bind(controller));
router.delete('/tasks/:taskId', authenticate, controller.deleteTask.bind(controller));

// Task reactions
router.post('/tasks/:taskId/react', authenticate, controller.reactToTask.bind(controller));

// Task comments
router.get('/tasks/:taskId/comments', authenticate, controller.getComments.bind(controller));
router.post('/tasks/:taskId/comments', authenticate, controller.addComment.bind(controller));
router.patch('/tasks/:taskId/comments/:commentId', authenticate, controller.updateComment.bind(controller));
router.delete('/tasks/:taskId/comments/:commentId', authenticate, controller.deleteComment.bind(controller));

// Task conversation
router.post('/tasks/:taskId/conversation', authenticate, controller.createConversation.bind(controller));

// Task attachments
router.get('/tasks/:taskId/attachments', authenticate, controller.getAttachments.bind(controller));
router.post('/tasks/:taskId/attachments', authenticate, controller.addAttachment.bind(controller));
router.delete('/tasks/:taskId/attachments/:attachmentId', authenticate, controller.deleteAttachment.bind(controller));

export { router as taskRoutes };
