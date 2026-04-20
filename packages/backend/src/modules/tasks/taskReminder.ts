/**
 * Background job: checks for tasks that have been NOT_STARTED for over 24 hours
 * and sends a Linda DM reminder to the assignee.
 *
 * Runs every hour. Only reminds once per task per 24h window (uses updatedAt to avoid spam).
 */
import { prisma } from '../../config/database';
import { sendLindaDM, getLindaBotUserId } from '../../services/lindaNotify';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const IGNORE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// Track which tasks we've already reminded about (taskId -> last reminder timestamp)
const remindedTasks = new Map<string, number>();

async function checkIgnoredTasks(): Promise<void> {
  try {
    const lindaId = await getLindaBotUserId();
    const cutoff = new Date(Date.now() - IGNORE_THRESHOLD_MS);

    // Find tasks that are still NOT_STARTED and were created more than 24h ago
    const ignoredTasks = await prisma.task.findMany({
      where: {
        status: 'NOT_STARTED',
        createdAt: { lt: cutoff },
      },
      include: {
        assignedTo: { select: { id: true, displayName: true, username: true } },
        createdBy: { select: { id: true, displayName: true, username: true } },
      },
    });

    // Filter: exclude tasks assigned to Linda herself, and tasks we already reminded recently
    const now = Date.now();
    for (const task of ignoredTasks) {
      if (task.assignedToId === lindaId) continue;
      if (task.assignedToId === task.createdById) continue;

      const lastReminded = remindedTasks.get(task.id);
      if (lastReminded && now - lastReminded < IGNORE_THRESHOLD_MS) continue;

      const creatorName = task.createdBy.displayName || task.createdBy.username;
      const hoursAgo = Math.round((now - new Date(task.createdAt).getTime()) / (1000 * 60 * 60));

      const msg = `⏰ **Task Reminder**\n\n**${task.title}**\n\nThis task was assigned to you by ${creatorName} ${hoursAgo} hours ago and is still **Not Started**.\n\nPlease update the status when you begin working on it.`;

      await sendLindaDM(task.assignedToId, msg);
      remindedTasks.set(task.id, now);

      console.log(`[TaskReminder] Reminded ${task.assignedTo.displayName || task.assignedTo.username} about task "${task.title}"`);
    }

    // Clean up old entries from the map (tasks that are no longer NOT_STARTED)
    const activeTaskIds = new Set(ignoredTasks.map(t => t.id));
    for (const [taskId] of remindedTasks) {
      if (!activeTaskIds.has(taskId)) {
        remindedTasks.delete(taskId);
      }
    }
  } catch (err) {
    console.error('[TaskReminder] Error checking ignored tasks:', err);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Start the background task reminder loop.
 * Call once from index.ts after database and socket are initialized.
 */
export function startTaskReminderJob(): void {
  if (intervalHandle) return; // already running

  // Run once shortly after startup (30 seconds delay to let everything initialize)
  setTimeout(() => {
    checkIgnoredTasks();
  }, 30_000);

  // Then run every hour
  intervalHandle = setInterval(checkIgnoredTasks, CHECK_INTERVAL_MS);

  console.log('[TaskReminder] Background job started — checking every hour for ignored tasks');
}

export function stopTaskReminderJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
