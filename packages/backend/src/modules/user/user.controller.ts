import { Request, Response } from 'express';
import path from 'path';
import { prisma } from '../../config/database';

export class UserController {
  // POST /api/users/avatar
  async uploadAvatar(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const file = req.file;
      const avatarUrl = `/uploads/avatars/${file.filename}`;

      // Update user's avatar URL in database
      const user = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          status: true,
          createdAt: true,
        },
      });

      res.json({ user, avatarUrl });
    } catch (error) {
      console.error('Upload avatar error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
