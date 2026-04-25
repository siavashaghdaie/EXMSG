import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export class ChecklistController {
  // POST /api/checklists — create a checklist on a task or project
  async createChecklist(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, projectId, title } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Checklist title is required' });
        return;
      }

      if (!taskId && !projectId) {
        res.status(400).json({ error: 'Either taskId or projectId is required' });
        return;
      }

      // Get max position
      const existing = await prisma.checklist.findMany({
        where: taskId ? { taskId } : { projectId },
        select: { position: true },
        orderBy: { position: 'desc' },
        take: 1,
      });
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;

      const checklist = await prisma.checklist.create({
        data: {
          title: title.trim(),
          position: nextPos,
          ...(taskId && { taskId }),
          ...(projectId && { projectId }),
        },
        include: {
          items: {
            orderBy: { position: 'asc' },
          },
        },
      });

      res.status(201).json({ checklist });
    } catch (error) {
      console.error('Create checklist error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/checklists?taskId=...&projectId=...
  async getChecklists(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, projectId } = req.query;

      if (!taskId && !projectId) {
        res.status(400).json({ error: 'taskId or projectId is required' });
        return;
      }

      const where: any = {};
      if (taskId) where.taskId = taskId as string;
      if (projectId) where.projectId = projectId as string;

      const checklists = await prisma.checklist.findMany({
        where,
        include: {
          items: {
            orderBy: { position: 'asc' },
          },
        },
        orderBy: { position: 'asc' },
      });

      res.json({ checklists });
    } catch (error) {
      console.error('Get checklists error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/checklists/:checklistId — update checklist title
  async updateChecklist(req: Request, res: Response): Promise<void> {
    try {
      const { checklistId } = req.params;
      const { title } = req.body;

      const checklist = await prisma.checklist.update({
        where: { id: checklistId },
        data: {
          ...(title !== undefined && { title: String(title).trim() }),
        },
        include: {
          items: {
            orderBy: { position: 'asc' },
          },
        },
      });

      res.json({ checklist });
    } catch (error) {
      console.error('Update checklist error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/checklists/:checklistId
  async deleteChecklist(req: Request, res: Response): Promise<void> {
    try {
      const { checklistId } = req.params;
      await prisma.checklist.delete({ where: { id: checklistId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete checklist error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/checklists/:checklistId/items — add item
  async addItem(req: Request, res: Response): Promise<void> {
    try {
      const { checklistId } = req.params;
      const { title, assigneeId, assigneeIds, dueDate } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Item title is required' });
        return;
      }

      // Get max position
      const existing = await prisma.checklistItem.findMany({
        where: { checklistId },
        select: { position: true },
        orderBy: { position: 'desc' },
        take: 1,
      });
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;

      // Support both legacy assigneeId and new assigneeIds array
      let resolvedAssigneeIds: string[] = [];
      if (Array.isArray(assigneeIds) && assigneeIds.length > 0) {
        resolvedAssigneeIds = assigneeIds;
      } else if (assigneeId) {
        resolvedAssigneeIds = [assigneeId];
      }

      const item = await prisma.checklistItem.create({
        data: {
          checklistId,
          title: title.trim(),
          position: nextPos,
          assigneeIds: resolvedAssigneeIds,
          dueDate: dueDate ? new Date(dueDate) : null,
        },
      });

      res.status(201).json({ item });
    } catch (error) {
      console.error('Add checklist item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/checklists/:checklistId/items/:itemId — update item
  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const { itemId } = req.params;
      const { title, completed, assigneeId, assigneeIds, dueDate, position } = req.body;

      const data: any = {};
      if (title !== undefined) data.title = String(title).trim();
      if (completed !== undefined) data.completed = Boolean(completed);
      // Support both legacy assigneeId and new assigneeIds array
      if (assigneeIds !== undefined) {
        data.assigneeIds = Array.isArray(assigneeIds) ? assigneeIds : [];
      } else if (assigneeId !== undefined) {
        data.assigneeIds = assigneeId ? [assigneeId] : [];
      }
      if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
      if (position !== undefined) data.position = Number(position);

      const item = await prisma.checklistItem.update({
        where: { id: itemId },
        data,
      });

      res.json({ item });
    } catch (error) {
      console.error('Update checklist item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/checklists/:checklistId/items/:itemId — delete item
  async deleteItem(req: Request, res: Response): Promise<void> {
    try {
      const { itemId } = req.params;
      await prisma.checklistItem.delete({ where: { id: itemId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete checklist item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/checklists/:checklistId/items/:itemId/toggle — toggle item completed
  async toggleItem(req: Request, res: Response): Promise<void> {
    try {
      const { itemId } = req.params;

      const existing = await prisma.checklistItem.findUnique({ where: { id: itemId } });
      if (!existing) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      const item = await prisma.checklistItem.update({
        where: { id: itemId },
        data: { completed: !existing.completed },
      });

      res.json({ item });
    } catch (error) {
      console.error('Toggle checklist item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
