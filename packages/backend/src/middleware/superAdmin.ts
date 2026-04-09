import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

/**
 * Middleware to require Super Admin role
 * Must be used AFTER authenticate middleware
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Ensure user is authenticated first
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Query the database to get the user's role
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { role: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Insufficient permissions. Super Admin access required.' });
      return;
    }

    // User is a super admin, proceed
    next();
  } catch (error) {
    console.error('Super Admin middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
