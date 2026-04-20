import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../config/database';

const db = prisma as any;

/**
 * Middleware to authenticate and require Super Admin role.
 *
 * Super admins use a SEPARATE table (`super_admins`) and their JWT tokens
 * contain `superAdmin: true` + `superAdminId`.  This middleware does NOT
 * depend on the regular `authenticate` middleware — it reads the Bearer
 * token itself and verifies against the super_admins table.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Must be a super-admin token (contains superAdmin flag)
    if (!decoded.superAdmin || !decoded.superAdminId) {
      res.status(403).json({ error: 'Insufficient permissions. Super Admin access required.' });
      return;
    }

    // Verify the super admin still exists in the DB
    const admin = await db.superAdmin.findUnique({
      where: { id: decoded.superAdminId },
      select: { id: true },
    });

    if (!admin) {
      res.status(403).json({ error: 'Super Admin account not found' });
      return;
    }

    // Attach the super admin id to the request for downstream handlers
    (req as any).superAdminId = decoded.superAdminId;

    next();
  } catch (error) {
    console.error('Super Admin middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
