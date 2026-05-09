/**
 * Audit Log Service
 *
 * Provides a fire-and-forget `logAudit()` function that records security and
 * compliance events for an organization.  All writes are async and non-blocking
 * so they never slow down the request pipeline.
 */

import { PrismaClient } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

export interface AuditEntry {
  organizationId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorName?: string | null;
  action: string;           // e.g. "user.login", "message.delete"
  category?: string;        // "auth" | "messaging" | "admin" | "member" | "settings" | "agent"
  targetType?: string;      // e.g. "user", "message", "conversation"
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical';
}

/**
 * Record an audit log entry.  Fire-and-forget — errors are logged to console
 * but never bubble up to the caller.
 */
export function logAudit(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        organizationId: entry.organizationId,
        actorId: entry.actorId ?? null,
        actorEmail: entry.actorEmail ?? null,
        actorName: entry.actorName ?? null,
        action: entry.action,
        category: entry.category ?? 'general',
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        details: entry.details ?? undefined,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        severity: entry.severity ?? 'info',
      },
    })
    .catch((err: any) => {
      console.error('[AuditLog] Failed to write audit log:', err.message);
    });
}

/**
 * Convenience: extract IP and User-Agent from an Express request.
 */
export function requestMeta(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown',
    userAgent: (req.headers['user-agent'] as string) || undefined,
  };
}

/**
 * Convenience: build a partial AuditEntry from an authenticated request.
 */
export function actorFromReq(req: Request): Pick<AuditEntry, 'actorId' | 'actorEmail' | 'actorName' | 'organizationId' | 'ipAddress' | 'userAgent'> {
  return {
    actorId: req.user?.userId,
    actorEmail: req.user?.email,
    actorName: req.user?.username,
    organizationId: req.orgId || '',
    ...requestMeta(req),
  };
}
