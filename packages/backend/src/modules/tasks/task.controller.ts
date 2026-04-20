import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendLindaDM } from '../../services/lindaNotify';

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
};

export class TaskController {
  // GET /api/tasks
  async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { status, assignedTo } = req.query;

      const where: any = {
        AND: [
          {
            OR: [
              { assignedToId: userId },
              { createdById: userId },
            ],
          },
        ],
      };

      // Scope to organization (include tasks with null orgId for legacy/bot-created tasks)
      if (req.orgId) {
        where.AND.push({
          OR: [
            { organizationId: req.orgId },
            { organizationId: null },
          ],
        });
      }

      if (status) {
        where.status = status as string;
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          orderedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
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
      const { title, description, assignedToId, deadline, priority, labels, lindaFollowing, lindaFollowInterval, orderedById } = req.body;

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
          orderedById: orderedById || null,
          deadline: deadline ? new Date(deadline) : null,
          priority: priority || 'MEDIUM',
          labels: labels || [],
          status: 'NOT_STARTED',
          lindaFollowing: lindaFollowing || false,
          lindaFollowInterval: lindaFollowInterval || null,
          ...(req.orgId && { organizationId: req.orgId }),
        },
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          orderedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
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
      const { title, description, status, priority, deadline, labels, lindaFollowing, lindaFollowInterval } = req.body;

      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task || (task.assignedToId !== userId && task.createdById !== userId)) {
        res.status(403).json({ error: 'Not authorized to update this task' });
        return;
      }

      // Verify task belongs to user's organization (allow null orgId for legacy tasks)
      if (req.orgId && (task as any).organizationId && (task as any).organizationId !== req.orgId) {
        res.status(403).json({ error: 'Not authorized to update this task' });
        return;
      }

      // Capture old values before update for change detection
      const oldStatus = task.status;
      const oldPriority = task.priority;

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status }),
          ...(priority !== undefined && { priority }),
          ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
          ...(labels !== undefined && { labels }),
          ...(lindaFollowing !== undefined && { lindaFollowing }),
          ...(lindaFollowInterval !== undefined && { lindaFollowInterval }),
        },
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          orderedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
      });

      // Linda notification: notify task creator when assignee changes status or priority
      // Only notify if the person making the change is the assignee (not the creator themselves)
      if (task.assignedToId === userId && task.createdById !== userId) {
        const changes: string[] = [];
        if (status !== undefined && status !== oldStatus) {
          changes.push(`status from **${STATUS_LABELS[oldStatus] || oldStatus}** to **${STATUS_LABELS[status] || status}**`);
        }
        if (priority !== undefined && priority !== oldPriority) {
          changes.push(`priority from **${oldPriority}** to **${priority}**`);
        }
        if (changes.length > 0) {
          const assigneeName = updated.assignedTo.displayName || updated.assignedTo.username;
          const msg = `📋 **Task Update**\n\n**${updated.title}**\n\n${assigneeName} changed ${changes.join(' and ')}.\n\nCheck the Task Wall for details.`;
          sendLindaDM(task.createdById, msg).catch(err => {
            console.error('[Tasks] Linda notification error:', err);
          });
        }
      }

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
