import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { sendLindaDM, sendLindaToConversation, getAllTaskRelatedUserIds } from '../../services/lindaNotify';

/** Helper: get the parent task with its conversationId and title */
async function getParentTask(checklistId: string) {
  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { taskId: true },
  });
  if (!checklist?.taskId) return null;
  return prisma.task.findUnique({
    where: { id: checklist.taskId },
    include: {
      checklists: { include: { items: true } },
      assignedTo: { select: { id: true, displayName: true, username: true } },
      createdBy: { select: { id: true, displayName: true, username: true } },
    },
  });
}

/** Helper: resolve user IDs to display names */
async function resolveUserNames(userIds: string[]): Promise<string> {
  if (!userIds.length) return 'no one';
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { displayName: true, username: true },
  });
  return users.map((u: any) => u.displayName || u.username).join(', ') || 'someone';
}

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

      // Linda notification: DM assigned users about new checklist item
      if (resolvedAssigneeIds.length > 0) {
        const userId = req.user?.userId;
        const task = await getParentTask(checklistId);
        if (task) {
          const changer = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, username: true } }) : null;
          const changerName = changer?.displayName || changer?.username || 'Someone';
          for (const assigneeId of resolvedAssigneeIds) {
            if (assigneeId !== userId) {
              const dmMsg = `⚠️ **Checklist Item Assigned**\n\n**${task.title}** → "${title.trim()}"\n\n${changerName} assigned you to this checklist item.${dueDate ? `\nDue: ${new Date(dueDate).toLocaleDateString()}` : ''}`;
              sendLindaDM(assigneeId, dmMsg).catch(err => console.error('[Checklist] Linda DM error:', err));
            }
          }
          // Post in task chat room
          if (task.conversationId) {
            const assigneeNames = await resolveUserNames(resolvedAssigneeIds);
            const roomMsg = `📋 **Checklist Updated**\n\n${changerName} added item "${title.trim()}" and assigned it to ${assigneeNames} on task **${task.title}**.`;
            sendLindaToConversation(task.conversationId, roomMsg).catch(err => console.error('[Checklist] Linda room error:', err));
          }
        }
      }

      res.status(201).json({ item });
    } catch (error) {
      console.error('Add checklist item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/checklists/:checklistId/items/:itemId — update item
  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const { checklistId, itemId } = req.params;
      const { title, completed, assigneeId, assigneeIds, dueDate, position } = req.body;
      const userId = req.user?.userId;

      // Fetch old item state for change detection
      const oldItem = await prisma.checklistItem.findUnique({ where: { id: itemId } });

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

      // Linda notifications for checklist item changes
      const task = await getParentTask(checklistId);
      if (task && oldItem) {
        const changer = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, username: true } }) : null;
        const changerName = changer?.displayName || changer?.username || 'Someone';
        const itemTitle = item.title || oldItem.title;

        // Detect new assignees (users who weren't assigned before)
        const oldAssignees = (oldItem.assigneeIds as string[]) || [];
        const newAssignees = (item.assigneeIds as string[]) || [];
        const addedAssignees = newAssignees.filter(id => !oldAssignees.includes(id));
        const removedAssignees = oldAssignees.filter(id => !newAssignees.includes(id));

        // DM newly assigned users
        for (const aid of addedAssignees) {
          if (aid !== userId) {
            const dmMsg = `⚠️ **Checklist Item Assigned**\n\n**${task.title}** → "${itemTitle}"\n\n${changerName} assigned you to this checklist item.${item.dueDate ? `\nDue: ${new Date(item.dueDate).toLocaleDateString()}` : ''}`;
            sendLindaDM(aid, dmMsg).catch(err => console.error('[Checklist] Linda DM error:', err));
          }
        }

        // DM removed users
        for (const rid of removedAssignees) {
          if (rid !== userId) {
            const dmMsg = `⚠️ **Checklist Item Unassigned**\n\n**${task.title}** → "${itemTitle}"\n\n${changerName} removed you from this checklist item.`;
            sendLindaDM(rid, dmMsg).catch(err => console.error('[Checklist] Linda DM error:', err));
          }
        }

        // Detect completion change — notify all task-related users
        if (completed !== undefined && oldItem.completed !== Boolean(completed)) {
          const status = Boolean(completed) ? '✅ completed' : '🔄 reopened';
          const relatedUserIds = getAllTaskRelatedUserIds(task, userId);
          for (const uid of relatedUserIds) {
            const dmMsg = `⚠️ **Checklist Item ${Boolean(completed) ? 'Completed' : 'Reopened'}**\n\n**${task.title}** → "${itemTitle}"\n\n${changerName} ${status} this checklist item.`;
            sendLindaDM(uid, dmMsg).catch(err => console.error('[Checklist] Linda DM error:', err));
          }
          // Post in task chat room
          if (task.conversationId) {
            const roomMsg = `📋 **Checklist Item ${Boolean(completed) ? 'Completed' : 'Reopened'}**\n\n${changerName} ${status} "${itemTitle}" on task **${task.title}**.`;
            sendLindaToConversation(task.conversationId, roomMsg).catch(err => console.error('[Checklist] Linda room error:', err));
          }
        }

        // Post assignment changes in task chat room
        if ((addedAssignees.length > 0 || removedAssignees.length > 0) && task.conversationId) {
          const parts: string[] = [];
          if (addedAssignees.length > 0) {
            const names = await resolveUserNames(addedAssignees);
            parts.push(`assigned ${names} to`);
          }
          if (removedAssignees.length > 0) {
            const names = await resolveUserNames(removedAssignees);
            parts.push(`removed ${names} from`);
          }
          const roomMsg = `📋 **Checklist Updated**\n\n${changerName} ${parts.join(' and ')} "${itemTitle}" on task **${task.title}**.`;
          sendLindaToConversation(task.conversationId, roomMsg).catch(err => console.error('[Checklist] Linda room error:', err));
        }
      }

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
      const { checklistId, itemId } = req.params;
      const userId = req.user?.userId;

      const existing = await prisma.checklistItem.findUnique({ where: { id: itemId } });
      if (!existing) {
        res.status(404).json({ error: 'Item not found' });
        return;
      }

      const newCompleted = !existing.completed;
      const item = await prisma.checklistItem.update({
        where: { id: itemId },
        data: { completed: newCompleted },
      });

      // Linda notification for toggle
      const task = await getParentTask(checklistId);
      if (task) {
        const changer = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, username: true } }) : null;
        const changerName = changer?.displayName || changer?.username || 'Someone';
        const status = newCompleted ? '✅ completed' : '🔄 reopened';

        // DM all task-related users except the toggler
        const relatedUserIds = getAllTaskRelatedUserIds(task, userId);
        for (const uid of relatedUserIds) {
          const dmMsg = `⚠️ **Checklist Item ${newCompleted ? 'Completed' : 'Reopened'}**\n\n**${task.title}** → "${existing.title}"\n\n${changerName} ${status} this checklist item.`;
          sendLindaDM(uid, dmMsg).catch(err => console.error('[Checklist] Linda DM error:', err));
        }

        // Post in task chat room
        if (task.conversationId) {
          const roomMsg = `📋 **Checklist Item ${newCompleted ? 'Completed' : 'Reopened'}**\n\n${changerName} ${status} "${existing.title}" on task **${task.title}**.`;
          sendLindaToConversation(task.conversationId, roomMsg).catch(err => console.error('[Checklist] Linda room error:', err));
        }
      }

      res.json({ item });
    } catch (error) {
      console.error('Toggle checklist item error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
