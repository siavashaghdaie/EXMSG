import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendLindaDM, sendLindaToConversation, getLindaBotUserId, ensureLindaInConversation, getAllTaskRelatedUserIds } from '../../services/lindaNotify';

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
};

// Helper: resolve coAssigneeIds and checklist item assigneeIds to user details
async function resolveTaskUserIds(task: any): Promise<any> {
  if (!task) return task;

  // Collect all user IDs that need resolving
  const userIds = new Set<string>();
  if (Array.isArray(task.coAssigneeIds)) {
    task.coAssigneeIds.forEach((id: string) => userIds.add(id));
  }
  if (Array.isArray(task.checklists)) {
    for (const cl of task.checklists) {
      if (Array.isArray(cl.items)) {
        for (const item of cl.items) {
          if (Array.isArray(item.assigneeIds)) {
            item.assigneeIds.forEach((id: string) => userIds.add(id));
          }
        }
      }
    }
  }

  if (userIds.size === 0) return task;

  // Batch fetch user details
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
  });
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  // Attach resolved co-assignees
  if (Array.isArray(task.coAssigneeIds) && task.coAssigneeIds.length > 0) {
    task.coAssignees = task.coAssigneeIds.map((id: string) => userMap.get(id)).filter(Boolean);
  } else {
    task.coAssignees = [];
  }

  // Attach resolved assignee names to checklist items
  if (Array.isArray(task.checklists)) {
    for (const cl of task.checklists) {
      if (Array.isArray(cl.items)) {
        for (const item of cl.items) {
          if (Array.isArray(item.assigneeIds) && item.assigneeIds.length > 0) {
            item.assignees = item.assigneeIds.map((id: string) => userMap.get(id)).filter(Boolean);
            item.assigneeNames = item.assignees.map((u: any) => u.displayName || u.username);
          } else {
            item.assignees = [];
            item.assigneeNames = [];
          }
        }
      }
    }
  }

  return task;
}

async function resolveTasksUserIds(tasks: any[]): Promise<any[]> {
  // Collect ALL user IDs across all tasks in one pass
  const userIds = new Set<string>();
  for (const task of tasks) {
    if (Array.isArray(task.coAssigneeIds)) {
      task.coAssigneeIds.forEach((id: string) => userIds.add(id));
    }
    if (Array.isArray(task.checklists)) {
      for (const cl of task.checklists) {
        if (Array.isArray(cl.items)) {
          for (const item of cl.items) {
            if (Array.isArray(item.assigneeIds)) {
              item.assigneeIds.forEach((id: string) => userIds.add(id));
            }
          }
        }
      }
    }
  }

  if (userIds.size === 0) return tasks;

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, username: true, displayName: true, avatarUrl: true, email: true },
  });
  const userMap = new Map(users.map((u: any) => [u.id, u]));

  for (const task of tasks) {
    if (Array.isArray(task.coAssigneeIds) && task.coAssigneeIds.length > 0) {
      task.coAssignees = task.coAssigneeIds.map((id: string) => userMap.get(id)).filter(Boolean);
    } else {
      task.coAssignees = [];
    }
    if (Array.isArray(task.checklists)) {
      for (const cl of task.checklists) {
        if (Array.isArray(cl.items)) {
          for (const item of cl.items) {
            if (Array.isArray(item.assigneeIds) && item.assigneeIds.length > 0) {
              item.assignees = item.assigneeIds.map((id: string) => userMap.get(id)).filter(Boolean);
              item.assigneeNames = item.assignees.map((u: any) => u.displayName || u.username);
            } else {
              item.assignees = [];
              item.assigneeNames = [];
            }
          }
        }
      }
    }
  }

  return tasks;
}

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
      const userDeptIds = userDeptMemberships.map((m: any) => m.departmentId);

      const userProjectMemberships = await prisma.projectMember.findMany({
        where: { userId },
        select: { projectId: true },
      });
      const userProjectIds = userProjectMemberships.map((m: any) => m.projectId);

      const showArchived = req.query.archived === 'true';
      const where: any = { AND: [{ archived: showArchived }] };

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
          checklists: {
            include: { items: { orderBy: { position: 'asc' } } },
            orderBy: { position: 'asc' },
          },
          reactions: true,
          attachments: {
            include: { uploadedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
            orderBy: { createdAt: 'desc' },
          },
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const resolved = await resolveTasksUserIds(tasks);
      res.json({ tasks: resolved });
    } catch (error) {
      console.error('Get tasks error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/tasks
  async createTask(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { title, description, assignedToId, deadline, priority, labels, lindaFollowing, lindaFollowInterval, orderedById, visibleToDepartmentIds, departmentId, projectId, projectName, coAssigneeIds } = req.body;

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
          coAssigneeIds: Array.isArray(coAssigneeIds) ? coAssigneeIds : [],
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

      // Auto-create linked group conversation for this task (non-blocking)
      // Includes: creator, assignee, co-assignees, checklist item assignees, Linda bot
      let conversationId: string | null = null;
      try {
        const memberIds = new Set<string>([userId]); // creator
        if (assignedToId && assignedToId !== userId) memberIds.add(assignedToId);
        if (orderedById && orderedById !== userId) memberIds.add(orderedById);
        if (Array.isArray(coAssigneeIds)) {
          coAssigneeIds.forEach((id: string) => memberIds.add(id));
        }

        // Include checklist item assignees (fetch checklists for the newly created task)
        const taskWithChecklists = await prisma.task.findUnique({
          where: { id: task.id },
          include: { checklists: { include: { items: true } } },
        });
        if (taskWithChecklists?.checklists) {
          for (const cl of taskWithChecklists.checklists) {
            for (const item of cl.items) {
              if (Array.isArray((item as any).assigneeIds)) {
                (item as any).assigneeIds.forEach((id: string) => memberIds.add(id));
              }
            }
          }
        }

        // Add Linda bot to the conversation
        const lindaBotId = await getLindaBotUserId();
        memberIds.add(lindaBotId);

        const conversation = await prisma.conversation.create({
          data: {
            type: 'GROUP',
            name: `Task: ${title}`,
            ...(req.orgId && { organizationId: req.orgId }),
            members: {
              create: Array.from(memberIds).map(uid => ({
                userId: uid,
                role: uid === userId ? 'ADMIN' : 'MEMBER',
              })),
            },
          },
        });

        conversationId = conversation.id;

        // Link conversation to task — separate try so task still returns on failure
        try {
          await prisma.task.update({
            where: { id: task.id },
            data: { conversationId: conversation.id },
          });
        } catch (linkErr) {
          console.error('Link task conversation error:', linkErr);
        }

        // Send Linda announcement in the new chat room
        const creatorName = task.createdBy?.displayName || task.createdBy?.username || 'Someone';
        const assigneeName = task.assignedTo?.displayName || task.assignedTo?.username || '';
        const roomMsg = `📋 **New Task Created**\n\n**${title}**\n\nCreated by ${creatorName}${assigneeName ? ` and assigned to ${assigneeName}` : ''}.\n\nI'll keep everyone updated on changes to this task.`;
        sendLindaToConversation(conversation.id, roomMsg).catch(err => {
          console.error('[Tasks] Linda room announcement error:', err);
        });

        // Send Linda DM to all related users (except creator) about the new task assignment
        const allRelated = getAllTaskRelatedUserIds({ ...task, coAssigneeIds: coAssigneeIds || [], checklists: taskWithChecklists?.checklists || [] }, userId);
        const dmMsg = `⚠️ **New Task Assignment**\n\n**${title}**\n\nYou have been added to this task by ${creatorName}.\n\nCheck the Task Wall for details.`;
        for (const uid of allRelated) {
          sendLindaDM(uid, dmMsg).catch(err => {
            console.error(`[Tasks] Linda DM assignment error for user ${uid}:`, err);
          });
        }
      } catch (convErr) {
        console.error('Auto-create task conversation error:', convErr);
      }

      res.status(201).json({ task: { ...task, conversationId } });
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
      const { title, description, status, priority, deadline, labels, lindaFollowing, lindaFollowInterval, archived, coAssigneeIds, assignedToId, projectId, departmentId } = req.body;

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
          ...(archived !== undefined && { archived: Boolean(archived) }),
          ...(assignedToId !== undefined && { assignedToId }),
          ...(projectId !== undefined && { projectId: projectId || null }),
          ...(departmentId !== undefined && { departmentId: departmentId || null }),
          ...(coAssigneeIds !== undefined && { coAssigneeIds: Array.isArray(coAssigneeIds) ? coAssigneeIds : [] }),
        },
        include: {
          assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          orderedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          checklists: {
            include: { items: { orderBy: { position: 'asc' } } },
            orderBy: { position: 'asc' },
          },
          attachments: {
            include: { uploadedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      // Linda notification: notify ALL task-related users about ANY change
      // Build change description
      {
        const changes: string[] = [];
        if (status !== undefined && status !== oldStatus) {
          changes.push(`status from **${STATUS_LABELS[oldStatus] || oldStatus}** to **${STATUS_LABELS[status] || status}**`);
        }
        if (priority !== undefined && priority !== oldPriority) {
          changes.push(`priority from **${oldPriority}** to **${priority}**`);
        }
        if (title !== undefined && title !== task.title) {
          changes.push(`title to **${title}**`);
        }
        if (description !== undefined && description !== task.description) {
          changes.push(`description was updated`);
        }
        if (assignedToId !== undefined && assignedToId !== task.assignedToId) {
          const newAssigneeName = updated.assignedTo?.displayName || updated.assignedTo?.username || 'someone';
          changes.push(`assignee changed to **${newAssigneeName}**`);
        }
        if (projectId !== undefined && projectId !== task.projectId) {
          changes.push(`project was changed`);
        }
        if (departmentId !== undefined && departmentId !== task.departmentId) {
          changes.push(`department was changed`);
        }
        if (archived !== undefined && Boolean(archived) !== task.archived) {
          changes.push(archived ? `task was **archived**` : `task was **unarchived**`);
        }
        if (coAssigneeIds !== undefined) {
          const oldCoIds = Array.isArray(task.coAssigneeIds) ? (task.coAssigneeIds as string[]).sort().join(',') : '';
          const newCoIds = Array.isArray(coAssigneeIds) ? [...coAssigneeIds].sort().join(',') : '';
          if (oldCoIds !== newCoIds) {
            changes.push(`co-assignees were updated`);
          }
        }
        if (deadline !== undefined) {
          const oldDl = task.deadline ? new Date(task.deadline).toISOString() : null;
          const newDl = deadline ? new Date(deadline).toISOString() : null;
          if (oldDl !== newDl) {
            changes.push(`deadline was ${deadline ? 'changed to **' + new Date(deadline).toLocaleDateString() + '**' : '**removed**'}`);
          }
        }

        if (changes.length > 0) {
          // Fetch the user who made the change
          const changer = await prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true, username: true },
          });
          const changerName = changer?.displayName || changer?.username || 'Someone';

          // Get the updated task WITH checklists to find all related users
          const taskWithChecklists = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
              checklists: { include: { items: true } },
            },
          });

          const relatedUserIds = getAllTaskRelatedUserIds(taskWithChecklists || updated, userId);

          // DM each related user with ⚠️
          const dmMsg = `⚠️ **Task Update**\n\n**${updated.title}**\n\n${changerName} changed: ${changes.join(', ')}.\n\nCheck the Task Wall for details.`;
          for (const uid of relatedUserIds) {
            sendLindaDM(uid, dmMsg).catch(err => {
              console.error(`[Tasks] Linda DM notification error for user ${uid}:`, err);
            });
          }

          // Post in the task chat room
          if (updated.conversationId) {
            const roomMsg = `⚠️ **Task Changed**\n\n${changerName} updated **${updated.title}**:\n${changes.map(c => `• ${c}`).join('\n')}`;
            sendLindaToConversation(updated.conversationId, roomMsg).catch(err => {
              console.error('[Tasks] Linda room notification error:', err);
            });
          }
        }
      }

      const resolved = await resolveTaskUserIds(updated);
      res.json({ task: resolved });
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
      if (!task || (task.createdById !== userId && task.assignedToId !== userId)) {
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

  // POST /api/tasks/:taskId/react
  async reactToTask(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;
      const { type } = req.body;

      if (!type || !['like', 'dislike'].includes(type)) {
        res.status(400).json({ error: 'Invalid reaction type' });
        return;
      }

      const existing = await prisma.taskReaction.findUnique({
        where: { taskId_userId: { taskId, userId } },
      });

      if (existing) {
        if (existing.type === type) {
          // Toggle off
          await prisma.taskReaction.delete({ where: { id: existing.id } });
          res.json({ reaction: null });
          return;
        } else {
          // Switch type
          const updated = await prisma.taskReaction.update({
            where: { id: existing.id },
            data: { type },
          });
          res.json({ reaction: updated });
          return;
        }
      }

      const reaction = await prisma.taskReaction.create({
        data: { taskId, userId, type },
      });
      res.json({ reaction });
    } catch (error) {
      console.error('React to task error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/tasks/:taskId/comments
  async getComments(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;

      const comments = await prisma.taskComment.findMany({
        where: { taskId },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });

      res.json({ comments });
    } catch (error) {
      console.error('Get task comments error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/tasks/:taskId/comments
  async addComment(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;
      const { content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({ error: 'Comment content is required' });
        return;
      }

      const comment = await prisma.taskComment.create({
        data: { taskId, userId, content: content.trim() },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });

      res.status(201).json({ comment });
    } catch (error) {
      console.error('Add task comment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/tasks/:taskId/comments/:commentId
  async updateComment(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, commentId } = req.params;
      const userId = req.user!.userId;
      const { content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({ error: 'Comment content is required' });
        return;
      }

      const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, taskId, userId },
      });

      if (!comment) {
        res.status(403).json({ error: 'Not authorized to update this comment' });
        return;
      }

      const updated = await prisma.taskComment.update({
        where: { id: commentId },
        data: { content: content.trim() },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      });

      res.json({ comment: updated });
    } catch (error) {
      console.error('Update task comment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/tasks/:taskId/comments/:commentId
  async deleteComment(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, commentId } = req.params;
      const userId = req.user!.userId;

      await prisma.taskComment.deleteMany({
        where: { id: commentId, taskId, userId },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Delete task comment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/tasks/:taskId/attachments
  async getAttachments(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;

      const attachments = await prisma.taskAttachment.findMany({
        where: { taskId },
        include: {
          uploadedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ attachments });
    } catch (error) {
      console.error('Get task attachments error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/tasks/:taskId/attachments
  async addAttachment(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;
      const { type, name, url, size, mimeType } = req.body;

      if (!type || !name || !url) {
        res.status(400).json({ error: 'type, name, and url are required' });
        return;
      }

      if (!['link', 'file'].includes(type)) {
        res.status(400).json({ error: 'type must be "link" or "file"' });
        return;
      }

      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId,
          type,
          name,
          url,
          size: size || null,
          mimeType: mimeType || null,
          uploadedById: userId,
        },
        include: {
          uploadedBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
      });

      res.status(201).json({ attachment });
    } catch (error) {
      console.error('Add task attachment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/tasks/:taskId/conversation — create chat room on demand
  // Includes: creator, assignee, co-assignees, checklist item assignees, Linda bot
  async createConversation(req: Request, res: Response): Promise<void> {
    try {
      const { taskId } = req.params;
      const userId = req.user!.userId;

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { checklists: { include: { items: true } } },
      });
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      // Already has a conversation — ensure Linda is in it and return
      if (task.conversationId) {
        ensureLindaInConversation(task.conversationId).catch(err => {
          console.error('[Tasks] ensureLindaInConversation error:', err);
        });
        res.json({ conversationId: task.conversationId });
        return;
      }

      const memberIds = new Set<string>([task.createdById]);
      if (task.assignedToId && task.assignedToId !== task.createdById) memberIds.add(task.assignedToId);
      if (userId !== task.createdById) memberIds.add(userId);
      // Include co-assignees
      if (Array.isArray((task as any).coAssigneeIds)) {
        (task as any).coAssigneeIds.forEach((id: string) => memberIds.add(id));
      }
      // Include checklist item assignees
      if (Array.isArray(task.checklists)) {
        for (const cl of task.checklists) {
          if (Array.isArray(cl.items)) {
            for (const item of cl.items) {
              if (Array.isArray((item as any).assigneeIds)) {
                (item as any).assigneeIds.forEach((id: string) => memberIds.add(id));
              }
            }
          }
        }
      }
      // Add Linda bot
      const lindaBotId = await getLindaBotUserId();
      memberIds.add(lindaBotId);

      const conversation = await prisma.conversation.create({
        data: {
          type: 'GROUP',
          name: `Task: ${task.title}`,
          ...(task.organizationId && { organizationId: task.organizationId }),
          members: {
            create: Array.from(memberIds).map(uid => ({
              userId: uid,
              role: uid === task.createdById ? 'ADMIN' : 'MEMBER',
            })),
          },
        },
      });

      await prisma.task.update({
        where: { id: taskId },
        data: { conversationId: conversation.id },
      });

      // Linda announcement
      const roomMsg = `📋 **Task Chat Room Created**\n\n**${task.title}**\n\nI'll keep everyone updated on changes to this task.`;
      sendLindaToConversation(conversation.id, roomMsg).catch(err => {
        console.error('[Tasks] Linda room announcement error:', err);
      });

      res.json({ conversationId: conversation.id });
    } catch (error) {
      console.error('Create task conversation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/tasks/:taskId/attachments/:attachmentId
  async deleteAttachment(req: Request, res: Response): Promise<void> {
    try {
      const { taskId, attachmentId } = req.params;
      const userId = req.user!.userId;

      const attachment = await prisma.taskAttachment.findFirst({
        where: { id: attachmentId, taskId },
      });

      if (!attachment) {
        res.status(404).json({ error: 'Attachment not found' });
        return;
      }

      if (attachment.uploadedById !== userId) {
        res.status(403).json({ error: 'Only the uploader can delete this attachment' });
        return;
      }

      await prisma.taskAttachment.delete({ where: { id: attachmentId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete task attachment error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
