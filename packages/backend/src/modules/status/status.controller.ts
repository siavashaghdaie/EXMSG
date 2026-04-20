import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { getOrgMemberIds } from '../../middleware/orgScope';

// Type-safe accessors for new Prisma models (available after running `npx prisma generate`)
const db = prisma as any;

// In-memory DB availability check — retries every 30 seconds if previously unavailable
let dbAvailable: boolean | null = null;
let dbCheckTimestamp = 0;
const DB_RETRY_INTERVAL_MS = 30_000; // Re-check every 30s after a failure

// Cache whether StatusLike table is available (retries periodically)
let likesTableAvailable: boolean | null = null;
let likesCheckTimestamp = 0;

async function isDbAvailable(): Promise<boolean> {
  // If previously available, trust the cache
  if (dbAvailable === true) return true;
  // If previously unavailable, retry after interval
  if (dbAvailable === false && Date.now() - dbCheckTimestamp < DB_RETRY_INTERVAL_MS) {
    return false;
  }
  try {
    await db.userStatus.findFirst({ take: 1 });
    dbAvailable = true;
    console.log('[Status] Status DB tables available ✓');
  } catch (err: any) {
    console.warn('[Status] Status DB tables not available — using fallback. Run: npx prisma migrate dev --name add-user-statuses');
    console.warn('[Status] Error:', err?.message || err);
    dbAvailable = false;
    dbCheckTimestamp = Date.now();
  }
  return dbAvailable;
}

function shouldRetryLikesTable(): boolean {
  if (likesTableAvailable === true) return false;
  if (likesTableAvailable === false && Date.now() - likesCheckTimestamp < DB_RETRY_INTERVAL_MS) {
    return false; // still in cooldown
  }
  return true; // null (never checked) or cooldown expired
}

export class StatusController {
  // POST /api/status/text
  async createTextStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { content, bgColor } = req.body;
      console.log(`[Status] createTextStatus called by userId=${userId}`);

      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'Content is required' });
        return;
      }

      const useDb = await isDbAvailable();
      if (!useDb) {
        console.warn(`[Status] createTextStatus: DB unavailable for userId=${userId}`);
        res.status(503).json({ error: 'Status service is temporarily unavailable. Please ask your admin to run database migrations.' });
        return;
      }

      // Calculate 24h expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const status = await db.userStatus.create({
        data: {
          userId,
          type: 'text',
          content,
          bgColor: bgColor || '#007AFF',
          expiresAt,
        },
      });

      res.status(201).json({
        id: status.id,
        userId: status.userId,
        type: status.type,
        content: status.content,
        bgColor: status.bgColor,
        expiresAt: status.expiresAt,
        createdAt: status.createdAt,
        viewCount: 0,
        hasViewed: false,
      });
    } catch (error: any) {
      console.error('Error creating text status:', error);
      res.status(500).json({ error: 'Failed to create status' });
    }
  }

  // POST /api/status/media
  async createMediaStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const file = req.file;
      const { caption } = req.body;
      console.log(`[Status] createMediaStatus called by userId=${userId}, file=${file?.filename || 'none'}`);

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const useDb = await isDbAvailable();
      if (!useDb) {
        console.warn(`[Status] createMediaStatus: DB unavailable for userId=${userId}`);
        res.status(503).json({ error: 'Status service is temporarily unavailable. Please ask your admin to run database migrations.' });
        return;
      }

      // Determine file type based on MIME type
      let type = 'image';
      if (file.mimetype.startsWith('video/')) {
        type = 'video';
      }

      // File URL will be served from /uploads
      const fileUrl = `/uploads/${file.filename}`;

      // Calculate 24h expiration
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const status = await db.userStatus.create({
        data: {
          userId,
          type,
          content: fileUrl,
          caption: caption || null,
          expiresAt,
        },
      });

      res.status(201).json({
        id: status.id,
        userId: status.userId,
        type: status.type,
        content: status.content,
        caption: status.caption,
        expiresAt: status.expiresAt,
        createdAt: status.createdAt,
        viewCount: 0,
        hasViewed: false,
      });
    } catch (error: any) {
      console.error('Error creating media status:', error);
      res.status(500).json({ error: 'Failed to create status' });
    }
  }

  // GET /api/status/mine
  async getMyStatuses(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      console.log(`[Status] getMyStatuses called by userId=${userId}`);

      const useDb = await isDbAvailable();
      if (!useDb) {
        console.warn(`[Status] getMyStatuses: DB unavailable for userId=${userId}`);
        res.json({ statuses: [] });
        return;
      }

      const now = new Date();

      // Try with likes, fallback without if table doesn't exist yet
      let statuses: any[];
      const tryLikes = shouldRetryLikesTable() || likesTableAvailable === true;
      if (tryLikes) {
        try {
          statuses = await db.userStatus.findMany({
            where: { userId, expiresAt: { gt: now } },
            include: {
              views: { select: { viewerId: true } },
              likes: { select: { userId: true } },
            },
            orderBy: { createdAt: 'desc' },
          });
          likesTableAvailable = true;
        } catch {
          likesTableAvailable = false;
          likesCheckTimestamp = Date.now();
          statuses = await db.userStatus.findMany({
            where: { userId, expiresAt: { gt: now } },
            include: { views: { select: { viewerId: true } } },
            orderBy: { createdAt: 'desc' },
          });
        }
      } else {
        statuses = await db.userStatus.findMany({
          where: { userId, expiresAt: { gt: now } },
          include: { views: { select: { viewerId: true } } },
          orderBy: { createdAt: 'desc' },
        });
      }

      console.log(`[Status] getMyStatuses: found ${statuses.length} active statuses for userId=${userId}`);

      const result = statuses.map((status: any) => ({
        id: status.id,
        userId: status.userId,
        type: status.type,
        content: status.content,
        caption: status.caption,
        bgColor: status.bgColor,
        expiresAt: status.expiresAt,
        createdAt: status.createdAt,
        viewCount: status.views.length,
        likeCount: likesTableAvailable ? (status.likes?.length || 0) : 0,
        likedByMe: likesTableAvailable ? (status.likes?.some((l: any) => l.userId === userId) || false) : false,
        viewers: status.views.map((v: any) => v.viewerId),
      }));

      res.json({ statuses: result });
    } catch (error: any) {
      console.error('Error fetching my statuses:', error);
      res.status(500).json({ error: 'Failed to fetch statuses' });
    }
  }

  // GET /api/status/contacts
  async getContactStatuses(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      console.log(`[Status] getContactStatuses called by userId=${userId}`);

      const useDb = await isDbAvailable();
      if (!useDb) {
        console.warn(`[Status] getContactStatuses: DB unavailable for userId=${userId}`);
        res.json({ users: [] });
        return;
      }

      const now = new Date();

      // ── Resolve visible users (org-scoped) ────────────────────
      // Only show stories from users in the same organization.
      const orgMemberIds = await getOrgMemberIds(req);
      console.log(`[Status] getContactStatuses: userId=${userId} org has ${orgMemberIds.length} member(s)`);

      // Get active statuses from org members only (excluding self)
      let statuses: any[];
      const statusWhere = {
        userId: { in: orgMemberIds, not: userId },
        expiresAt: { gt: now },
      };
      const tryLikes = shouldRetryLikesTable() || likesTableAvailable === true;
      if (tryLikes) {
        try {
          statuses = await db.userStatus.findMany({
            where: statusWhere,
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              views: { where: { viewerId: userId }, select: { viewedAt: true } },
              likes: { select: { userId: true } },
            },
            orderBy: { createdAt: 'desc' },
          });
          likesTableAvailable = true;
        } catch {
          likesTableAvailable = false;
          likesCheckTimestamp = Date.now();
          statuses = await db.userStatus.findMany({
            where: statusWhere,
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              views: { where: { viewerId: userId }, select: { viewedAt: true } },
            },
            orderBy: { createdAt: 'desc' },
          });
        }
      } else {
        statuses = await db.userStatus.findMany({
          where: statusWhere,
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            views: { where: { viewerId: userId }, select: { viewedAt: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      console.log(`[Status] getContactStatuses: found ${statuses.length} active stories for userId=${userId}`);

      // Group statuses by user
      const groupedByUser = new Map<
        string,
        {
          user: any;
          statuses: any[];
          hasUnviewedStatus: boolean;
        }
      >();

      for (const status of statuses) {
        const key = status.userId;
        if (!groupedByUser.has(key)) {
          groupedByUser.set(key, {
            user: status.user,
            statuses: [],
            hasUnviewedStatus: false,
          });
        }

        const group = groupedByUser.get(key)!;
        const hasViewed = status.views.length > 0;

        group.statuses.push({
          id: status.id,
          type: status.type,
          content: status.content,
          caption: status.caption,
          bgColor: status.bgColor,
          expiresAt: status.expiresAt,
          createdAt: status.createdAt,
          viewCount: 0, // Will be calculated per-status
          likeCount: likesTableAvailable ? (status.likes?.length || 0) : 0,
          likedByMe: likesTableAvailable ? (status.likes?.some((l: any) => l.userId === userId) || false) : false,
          hasViewed,
          viewedAt: hasViewed ? status.views[0].viewedAt : null,
        });

        if (!hasViewed) {
          group.hasUnviewedStatus = true;
        }
      }

      // Convert to array and sort by latest status
      const statusesByUser = Array.from(groupedByUser.values())
        .sort((a, b) => {
          const latestA = a.statuses[0]?.createdAt || new Date(0);
          const latestB = b.statuses[0]?.createdAt || new Date(0);
          return new Date(latestB).getTime() - new Date(latestA).getTime();
        });

      res.json({ users: statusesByUser });
    } catch (error: any) {
      console.error('Error fetching contact statuses:', error);
      res.status(500).json({ error: 'Failed to fetch contact statuses' });
    }
  }

  // POST /api/status/:id/view
  async viewStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Status service is temporarily unavailable' });
        return;
      }

      // Verify the status exists and hasn't expired
      const status = await db.userStatus.findUnique({
        where: { id },
      });

      if (!status) {
        res.status(404).json({ error: 'Status not found' });
        return;
      }

      if (status.userId === userId) {
        res.status(400).json({ error: 'Cannot view your own status' });
        return;
      }

      if (new Date() > status.expiresAt) {
        res.status(410).json({ error: 'Status has expired' });
        return;
      }

      // Create or update view record
      const view = await db.statusView.upsert({
        where: {
          statusId_viewerId: { statusId: id, viewerId: userId },
        },
        create: {
          statusId: id,
          viewerId: userId,
        },
        update: {
          viewedAt: new Date(),
        },
      });

      res.json({
        message: 'Status viewed',
        viewedAt: view.viewedAt,
      });
    } catch (error: any) {
      console.error('Error marking status as viewed:', error);
      res.status(500).json({ error: 'Failed to record view' });
    }
  }

  // DELETE /api/status/:id
  async deleteStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Status service is temporarily unavailable' });
        return;
      }

      // Verify the status belongs to the current user
      const status = await db.userStatus.findUnique({
        where: { id },
      });

      if (!status) {
        res.status(404).json({ error: 'Status not found' });
        return;
      }

      if (status.userId !== userId) {
        res.status(403).json({ error: 'You can only delete your own statuses' });
        return;
      }

      // Delete the status (cascade will delete views)
      await db.userStatus.delete({
        where: { id },
      });

      res.json({ message: 'Status deleted' });
    } catch (error: any) {
      console.error('Error deleting status:', error);
      res.status(500).json({ error: 'Failed to delete status' });
    }
  }

  // POST /api/status/:id/like
  async likeStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const statusId = req.params.id;

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Status service is temporarily unavailable' });
        return;
      }

      // Check if already liked (graceful if table doesn't exist)
      try {
        const existing = await db.statusLike.findUnique({
          where: { statusId_userId: { statusId, userId } }
        });

        if (existing) {
          await db.statusLike.delete({ where: { id: existing.id } });
          res.json({ liked: false });
          return;
        }

        await db.statusLike.create({ data: { statusId, userId } });
        res.json({ liked: true });
      } catch {
        // Table may not exist yet — return success without persisting
        res.json({ liked: true });
      }
    } catch (error) {
      console.error('Error toggling status like:', error);
      res.status(500).json({ error: 'Failed to toggle like' });
    }
  }

  // GET /api/status/:id/likes
  async getStatusLikes(req: Request, res: Response): Promise<void> {
    try {
      const statusId = req.params.id;

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Status service is temporarily unavailable' });
        return;
      }

      try {
        const likes = await db.statusLike.findMany({
          where: { statusId },
          include: {
            user: { select: { id: true, username: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'desc' }
        });
        res.json({ likes: likes.map((l: any) => l.user) });
      } catch {
        // Table may not exist yet
        res.json({ likes: [] });
      }
    } catch (error) {
      console.error('Error fetching status likes:', error);
      res.status(500).json({ error: 'Failed to fetch likes' });
    }
  }
}
