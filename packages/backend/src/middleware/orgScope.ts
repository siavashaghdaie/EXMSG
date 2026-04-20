/**
 * Organization-scoping middleware.
 *
 * Resolves the authenticated user's organization and attaches it to the
 * request object so every downstream handler can filter data by org.
 *
 * Adds:  req.orgId        – the organization UUID (or null if no org)
 *        req.orgRole       – the user's role in the org (OWNER | ADMIN | MEMBER)
 *        req.orgMemberIds  – lazy getter: all user IDs in the same org
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cache org membership lookups per request
declare global {
  namespace Express {
    interface Request {
      orgId?: string | null;
      orgRole?: string | null;
      _orgMemberIds?: string[];
    }
  }
}

/**
 * Middleware: resolves the user's primary organization (first membership).
 * Must run AFTER the `authenticate` middleware.
 */
export async function resolveOrganization(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      req.orgId = null;
      req.orgRole = null;
      return next();
    }

    const membership = await prisma.organizationMember.findFirst({
      where: { userId },
      select: { organizationId: true, role: true },
      orderBy: { joinedAt: 'asc' }, // primary org = earliest joined
    });

    req.orgId = membership?.organizationId || null;
    req.orgRole = membership?.role || null;

    next();
  } catch (error) {
    console.error('[OrgScope] Error resolving organization:', error);
    req.orgId = null;
    req.orgRole = null;
    next();
  }
}

/**
 * Helper: get all user IDs in the same organization as the requesting user.
 * Results are cached per request to avoid repeated DB hits within a single
 * request lifecycle.
 */
export async function getOrgMemberIds(req: Request): Promise<string[]> {
  if (req._orgMemberIds) return req._orgMemberIds;

  if (!req.orgId) {
    req._orgMemberIds = req.user?.userId ? [req.user.userId] : [];
    return req._orgMemberIds;
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: req.orgId },
    select: { userId: true },
  });

  req._orgMemberIds = members.map((m) => m.userId);
  return req._orgMemberIds;
}

/**
 * Middleware: require that the user belongs to an organization.
 * Returns 403 if the user has no org membership.
 */
export function requireOrganization(req: Request, res: Response, next: NextFunction): void {
  if (!req.orgId) {
    res.status(403).json({ error: 'You must belong to an organization to access this resource.' });
    return;
  }
  next();
}

/**
 * Middleware: require that the user is the OWNER of their organization.
 */
export function requireOrgOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.orgId || req.orgRole !== 'OWNER') {
    res.status(403).json({ error: 'Only panel owners can perform this action.' });
    return;
  }
  next();
}
