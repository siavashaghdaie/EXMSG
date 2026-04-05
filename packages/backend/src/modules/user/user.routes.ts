import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../../config/database';
import { authenticate } from '../../middleware/auth';
import { UserController } from './user.controller';

const router = Router();
const controller = new UserController();

// Configure multer for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/avatars/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    // Only allow image files
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are allowed'));
    }
  },
});

// All user routes require authentication
router.use(authenticate);

// POST /api/users/avatar
router.post('/avatar', avatarUpload.single('avatar'), controller.uploadAvatar.bind(controller));

// GET /api/users/search?query=...&limit=20
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = '20' } = req.query;
    const userId = req.user!.userId;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } }, // Exclude current user
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { displayName: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isOnline: true,
      },
      take: parseInt(limit as string),
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/profile
router.patch('/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { displayName, bio, status } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(bio !== undefined && { bio }),
        ...(status !== undefined && { status }),
      },
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

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { router as userRoutes };
