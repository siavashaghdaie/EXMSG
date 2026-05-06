/**
 * Background job that periodically deletes expired (disappearing) messages
 * and marks view-once media as expired.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CLEANUP_INTERVAL_MS = 30_000; // Run every 30 seconds
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function cleanupExpiredMessages(): Promise<void> {
  try {
    const now = new Date();

    // Soft-delete messages whose expiresAt has passed
    const result = await prisma.message.updateMany({
      where: {
        expiresAt: { lte: now },
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        content: null, // Clear content for privacy
      },
    });

    if (result.count > 0) {
      console.log(`[MessageCleanup] Soft-deleted ${result.count} expired message(s)`);
    }
  } catch (err) {
    console.error('[MessageCleanup] Error cleaning up expired messages:', err);
  }
}

export function startMessageCleanupJob(): void {
  if (intervalHandle) return;
  console.log('[MessageCleanup] Starting cleanup job (every 30s)');
  // Run once immediately
  cleanupExpiredMessages();
  intervalHandle = setInterval(cleanupExpiredMessages, CLEANUP_INTERVAL_MS);
}

export function stopMessageCleanupJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
