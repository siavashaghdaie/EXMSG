import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      orgId?: string;
    }
  }
}

/**
 * Middleware that ensures the caller can act as an org admin.
 *
 * Access rules:
 *   1. OWNER/ADMIN of an OrganizationMember row → pass through, orgId pinned to that org
 *      (if an explicit `?orgId=` is provided and the user has rights on it, use that one)
 *   2. SUPER_ADMIN (Panel Owner) → can inspect ANY organization. orgId comes from
 *      `?orgId=` query param, or falls back to the first organization in the system.
 *   3. Anyone else → 403
 */
export async function requireOrgAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const requestedOrgId = (req.query.orgId as string | undefined)?.trim() || undefined;

    // Load the caller to check for SUPER_ADMIN privilege
    const caller = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true },
    });

    if (!caller) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // --- Case 1: SUPER_ADMIN (Panel Owner) ---
    if (caller.role === 'SUPER_ADMIN') {
      let orgId = requestedOrgId;

      if (!orgId) {
        // Pick the first organization in the system as a sensible default
        const firstOrg = await prisma.organization.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        orgId = firstOrg?.id;
      }

      if (!orgId) {
        res.status(404).json({
          error: 'No organization available. Create an organization first.',
        });
        return;
      }

      req.orgId = orgId;
      next();
      return;
    }

    // --- Case 2: OWNER / ADMIN of an OrganizationMember row ---
    // If the caller provided an orgId, verify their rights on that specific org first.
    if (requestedOrgId) {
      const scopedMember = await prisma.organizationMember.findFirst({
        where: {
          userId: caller.id,
          organizationId: requestedOrgId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
        select: { organizationId: true },
      });

      if (scopedMember) {
        req.orgId = scopedMember.organizationId;
        next();
        return;
      }
    }

    // Otherwise pick the first org where they're OWNER/ADMIN
    const orgMember = await prisma.organizationMember.findFirst({
      where: {
        userId: caller.id,
        role: { in: ['OWNER', 'ADMIN'] },
      },
      select: { organizationId: true },
    });

    if (!orgMember) {
      res.status(403).json({ error: 'Forbidden: You are not an organization admin' });
      return;
    }

    req.orgId = orgMember.organizationId;
    next();
  } catch (error) {
    console.error('requireOrgAdmin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
