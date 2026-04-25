import { Router } from 'express';
import { ChecklistController } from './checklist.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new ChecklistController();

router.use(authenticate);

// Checklist CRUD
router.get('/checklists', (req, res) => controller.getChecklists(req, res));
router.post('/checklists', (req, res) => controller.createChecklist(req, res));
router.patch('/checklists/:checklistId', (req, res) => controller.updateChecklist(req, res));
router.delete('/checklists/:checklistId', (req, res) => controller.deleteChecklist(req, res));

// Checklist item CRUD
router.post('/checklists/:checklistId/items', (req, res) => controller.addItem(req, res));
router.patch('/checklists/:checklistId/items/:itemId', (req, res) => controller.updateItem(req, res));
router.delete('/checklists/:checklistId/items/:itemId', (req, res) => controller.deleteItem(req, res));
router.post('/checklists/:checklistId/items/:itemId/toggle', (req, res) => controller.toggleItem(req, res));

export { router as checklistRoutes };
