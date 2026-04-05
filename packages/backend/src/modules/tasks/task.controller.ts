import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export class TaskController {
  // GET /api/tasks
  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { status, assignedTo } = req.query;

      const where: any = {
        OR: [
          { assignedToId: userId },
          { createdById: userId },
        ],
      };

      if (status) {
        where.status = status as string;
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ tasks });
    } catch (error) {
      console.error('Get tasks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/tasks
  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { title, description, assignedToId, deadline, priority, labels } = req.body;

      if (!title) {
        res.status(400).json({ error: 'Task title is required' });
        return;
      }

      const task = await prisma.task.create({
        data: {
          title,
          description,
          assignedToId: assignedToId || userId,
          createdById: userId,
          deadline: deadline ? new Date(deadline) : null,
          priority: priority || 'MEDIUM',
          labels: labels || [],
          status: 'NOT_STARTED',
        },
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
      });

      res.status(201).json({ task });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/tasks/:taskId
  async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;
      const { title, description, status, priority, deadline, labels } = req.body;

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || (task.assignedToId !== userId && task.createdById !== userId)) {
        res.status(403).json({ error: 'Not authorized to update this task' });
        return;
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status }),
          ...(priority !== undefined && { priority }),
          ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
          ...(labels !== undefined && { labels }),
        },
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
      });

      res.json({ task: updated });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/tasks/:taskId
  async deleteTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || task.createdById !== userId) {
        res.status(403).json({ error: 'Not authorized to delete this task' });
        return;
      }

      await prisma.task.delete({ where: { id: taskId } });
      res.json({ message: 'Task deleted' });
    } catch (error) {
      console.error('Delete task error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
