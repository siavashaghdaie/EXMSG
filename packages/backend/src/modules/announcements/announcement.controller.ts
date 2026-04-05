import { Request, Response } from 'express';
import { prisma } from '../../config/database';

// Type-safe accessors for Announcement model
const db = prisma as any;

// Check if Announcement table is available
let dbAvailable: boolean | null = null;

async function isDbAvailable(): Promise<boolean> {
  if (dbAvailable !== null) return dbAvailable;
  try {
    await db.announcement.findFirst({ take: 1 });
    dbAvailable = true;
  } catch {
    console.warn('[Announcements] Announcement DB table not available. Run: npx prisma migrate dev');
    dbAvailable = false;
  }
  return dbAvailable;
}

export class AnnouncementController {
  // POST /api/announcements - Create announcement
  async create(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { title, content, priority = 'NORMAL', pinned = false, expiresAt } = req.body;

      // Validate required fields
      if (!title || !content) {
        res.status(400).json({ error: 'Title and content are required' });
        return;
      }

      // Check if user is OWNER or ADMIN
      const orgMember = await prisma.organizationMember.findFirst({
        where: {
          userId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      });

      if (!orgMember) {
        res.status(403).json({ error: 'Only OWNER or ADMIN can create announcements' });
        return;
      }

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Announcement service not available' });
        return;
      }

      // Create announcement
      const announcement = await db.announcement.create({
        data: {
          authorId: userId,
          title: title.trim(),
          content: content.trim(),
          priority: priority.toUpperCase(),
          pinned: !!pinned,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      res.status(201).json({
        id: announcement.id,
        title: announcement.title,
        content: announcement.content,
        priority: announcement.priority,
        pinned: announcement.pinned,
        expiresAt: announcement.expiresAt,
        author: announcement.author,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
      });
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ error: 'Failed to create announcement' });
    }
  }

  // GET /api/announcements - Get all non-expired announcements
  async getAll(req: Request, res: Response): Promise<void> {
    try {
      const useDb = await isDbAvailable();
      if (!useDb) {
        res.json({ announcements: [] });
        return;
      }

      const now = new Date();

      const announcements = await db.announcement.findMany({
        where: {
          OR: [
            { expiresAt: null }, // No expiration
            { expiresAt: { gt: now } }, // Not yet expired
          ],
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: [
          { pinned: 'desc' }, // Pinned first
          { createdAt: 'desc' }, // Then newest first
        ],
      });

      res.json({
        announcements: announcements.map((a: any) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          priority: a.priority,
          pinned: a.pinned,
          expiresAt: a.expiresAt,
          author: a.author,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        })),
      });
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ error: 'Failed to fetch announcements' });
    }
  }

  // PUT /api/announcements/:id - Update announcement
  async update(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;
      const { title, content, priority, pinned, expiresAt } = req.body;

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Announcement service not available' });
        return;
      }

      // Find the announcement
      const announcement = await db.announcement.findUnique({
        where: { id },
      });

      if (!announcement) {
        res.status(404).json({ error: 'Announcement not found' });
        return;
      }

      // Check authorization: only author or OWNER can update
      if (announcement.authorId !== userId) {
        const isOwner = await prisma.organizationMember.findFirst({
          where: {
            userId,
            role: 'OWNER',
          },
        });

        if (!isOwner) {
          res.status(403).json({ error: 'Only author or OWNER can update this announcement' });
          return;
        }
      }

      // Update announcement
      const updated = await db.announcement.update({
        where: { id },
        data: {
          ...(title && { title: title.trim() }),
          ...(content && { content: content.trim() }),
          ...(priority && { priority: priority.toUpperCase() }),
          ...(pinned !== undefined && { pinned: !!pinned }),
          ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      res.json({
        id: updated.id,
        title: updated.title,
        content: updated.content,
        priority: updated.priority,
        pinned: updated.pinned,
        expiresAt: updated.expiresAt,
        author: updated.author,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('Error updating announcement:', error);
      res.status(500).json({ error: 'Failed to update announcement' });
    }
  }

  // DELETE /api/announcements/:id - Delete announcement
  async delete(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { id } = req.params;

      const useDb = await isDbAvailable();
      if (!useDb) {
        res.status(503).json({ error: 'Announcement service not available' });
        return;
      }

      // Find the announcement
      const announcement = await db.announcement.findUnique({
        where: { id },
      });

      if (!announcement) {
        res.status(404).json({ error: 'Announcement not found' });
        return;
      }

      // Check authorization: only author or OWNER can delete
      if (announcement.authorId !== userId) {
        const isOwner = await prisma.organizationMember.findFirst({
          where: {
            userId,
            role: 'OWNER',
          },
        });

        if (!isOwner) {
          res.status(403).json({ error: 'Only author or OWNER can delete this announcement' });
          return;
        }
      }

      // Delete announcement
      await db.announcement.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      res.status(500).json({ error: 'Failed to delete announcement' });
    }
  }

  // GET /api/announcements/can-announce - Check if user can announce
  async canAnnounce(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const isManager = await prisma.organizationMember.findFirst({
        where: {
          userId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      });

      res.json({
        canAnnounce: !!isManager,
      });
    } catch (error) {
      console.error('Error checking announcement permission:', error);
      res.json({ canAnnounce: false });
    }
  }
}
