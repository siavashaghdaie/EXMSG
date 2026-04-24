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
      const { status, assignedTo, departmentId, projectId, view } = req.query;

      // Find departments and projects the user belongs to
      const userDeptMemberships = await prisma.departmentMember.findMany({
        where: { userId },
        select: { departmentId: true },
      });
      const userDeptIds = userDeptMemberships.map((m) => m.departmentId);

      const userProjectMemberships = await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const userProjectIds = userProjectMemberships.map((m) => m.projectId);

      const where: any = { AND: [] };

      // View modes: 'my' (default), 'department', 'project', 'all'
      const viewMode = (view as string) || 'my';

      if (viewMode === 'department') {
        // Show all tasks tagged with user's departments
        if (userDeptIds.length > 0) {
          where.AND.push({ departmentId: { in: userDeptIds } });
        } else {
          // User has no departments — return empty
          res.json({ tasks: [] });
          return;
        }
      } else if (viewMode === 'project') {
        // Show all tasks from user's projects
        if (userProjectIds.length > 0) {
          where.AND.push({ projectId: { in: userProjectIds } });
        } else {
          res.json({ tasks: [] });
          return;
        }
      } else {
        // Default 'my' or 'all': tasks assigned to me, created by me, or visible via department/project
        where.AND.push({
          OR: [
            { assignedToId: userId },
            { createdById: userId },
            // Tasks in the same department
            ...(userDeptIds.length > 0
              ? [{ departmentId: { in: userDeptIds } }]
              : []),
            // Tasks in the same project
            ...(userProjectIds.length > 0
              ? [{ projectId: { in: userProjectIds } }]
              : []),
            // Tasks with explicit department visibility
            ...(userDeptIds.length > 0
              ? [{ visibleToDepartments: { some: { id: { in: userDeptIds } } } }]
              : []),
          ],
        });
      }

      // Filter by specific department
      if (departmentId && typeof departmentId === 'string') {
        where.AND.push({ departmentId });
      }

      // Filter by specific project
      if (projectId && typeof projectId === 'string') {
        where.AND.push({ projectId });
      }

      // Scope to organization
      if (req.orgId) {
        where.AND.push({
          OR: [
            { organizationId: req.orgId },
            { organizationId: null },
          ],
        });
      }

      if (status) {
        where.AND.push({ status: status as string });
      }

      const tasks = await prisma.task.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          orderedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          department: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          visibleToDepartments: { select: { id: true, name: true } },
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
      const { title, description, assignedToId, deadline, priority, labels, lindaFollowing, lindaFollowInterval, orderedById, visibleToDepartmentIds, departmentId, projectId, projectName } = req.body;

      if (!title) {
        res.status(400).json({ error: 'Task title is required' });
        return;
      }

      // Auto-create project if projectName is given but no projectId
      let resolvedProjectId = projectId || null;
      if (!resolvedProjectId && projectName && typeof projectName === 'string' && projectName.trim()) {
        const orgId = req.orgId;
        // Find or create the project
        let project = orgId
          ? await prisma.project.findUnique({
              where: { organizationId_name: { organizationId: orgId, name: projectName.trim() } },
            })
          : await prisma.project.findFirst({ where: { name: projectName.trim(), createdById: userId } });

        if (!project) {
          project = await prisma.project.create({
            data: {
              name: projectName.trim(),
              createdById: userId,
              ...(orgId && { organizationId: orgId }),
            },
          });
          // Add creator as member
          await prisma.projectMember.create({
            data: { projectId: project.id, userId, role: 'LEAD' },
          });
        }
        resolvedProjectId = project.id;

        // Auto-add the assignee to the project if not already a member
        const targetUserId = assignedToId || userId;
        if (targetUserId !== userId) {
          await prisma.projectMember.upsert({
            where: { projectId_userId: { projectId: project.id, userId: targetUserId } },
            create: { projectId: project.id, userId: targetUserId },
            update: {},
          });
        }
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
          ...(departmentId && { departmentId }),
          ...(resolvedProjectId && { projectId: resolvedProjectId }),
          // Connect department visibility (optional)
          ...(Array.isArray(visibleToDepartmentIds) && visibleToDepartmentIds.length > 0 && {
            visibleToDepartments: {
              connect: visibleToDepartmentIds.map((id: string) => ({ id })),
            },
          }),
        },
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          orderedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          visibleToDepartments: { select: { id: true, name: true } },
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
