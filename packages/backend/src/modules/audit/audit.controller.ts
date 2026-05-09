import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AuditController {
  /**
   * GET /api/audit/logs
   * Query audit logs for the caller's organization.
   *
   * Query params:
   *   page       – page number (default 1)
   *   limit      – items per page (default 50, max 200)
   *   category   – filter by category
   *   action     – filter by exact action string
   *   actorId    – filter by actor userId
   *   severity   – filter by severity level
   *   targetType – filter by target type
   *   from       – ISO date, logs created on or after
   *   to         – ISO date, logs created on or before
   *   search     – search in action, actorEmail, actorName
   */
  async getLogs(req: Request, res: Response) {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        return res.status(403).json({ error: 'Organization required' });
      }

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
      const skip = (page - 1) * limit;

      // Build filters
      const where: any = { organizationId: orgId };

      if (req.query.category) where.category = req.query.category;
      if (req.query.action) where.action = req.query.action;
      if (req.query.actorId) where.actorId = req.query.actorId;
      if (req.query.severity) where.severity = req.query.severity;
      if (req.query.targetType) where.targetType = req.query.targetType;

      if (req.query.from || req.query.to) {
        where.createdAt = {};
        if (req.query.from) where.createdAt.gte = new Date(req.query.from as string);
        if (req.query.to) where.createdAt.lte = new Date(req.query.to as string);
      }

      if (req.query.search) {
        const search = req.query.search as string;
        where.OR = [
          { action: { contains: search, mode: 'insensitive' } },
          { actorEmail: { contains: search, mode: 'insensitive' } },
          { actorName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error('[AuditController] getLogs error:', error);
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  }

  /**
   * GET /api/audit/logs/summary
   * Aggregated summary for the org's audit logs — counts by category, severity, and recent activity.
   */
  async getSummary(req: Request, res: Response) {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        return res.status(403).json({ error: 'Organization required' });
      }

      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [totalCount, last24hCount, last7dCount, criticalCount, byCategory, bySeverity] = await Promise.all([
        prisma.auditLog.count({ where: { organizationId: orgId } }),
        prisma.auditLog.count({ where: { organizationId: orgId, createdAt: { gte: last24h } } }),
        prisma.auditLog.count({ where: { organizationId: orgId, createdAt: { gte: last7d } } }),
        prisma.auditLog.count({ where: { organizationId: orgId, severity: 'critical' } }),
        prisma.auditLog.groupBy({
          by: ['category'],
          where: { organizationId: orgId },
          _count: true,
        }),
        prisma.auditLog.groupBy({
          by: ['severity'],
          where: { organizationId: orgId },
          _count: true,
        }),
      ]);

      res.json({
        total: totalCount,
        last24h: last24hCount,
        last7d: last7dCount,
        critical: criticalCount,
        byCategory: byCategory.map((c: any) => ({ category: c.category, count: c._count })),
        bySeverity: bySeverity.map((s: any) => ({ severity: s.severity, count: s._count })),
      });
    } catch (error: any) {
      console.error('[AuditController] getSummary error:', error);
      res.status(500).json({ error: 'Failed to fetch audit summary' });
    }
  }

  /**
   * GET /api/audit/logs/export
   * Export audit logs as CSV for the given date range.
   */
  async exportLogs(req: Request, res: Response) {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        return res.status(403).json({ error: 'Organization required' });
      }

      const where: any = { organizationId: orgId };
      if (req.query.from || req.query.to) {
        where.createdAt = {};
        if (req.query.from) where.createdAt.gte = new Date(req.query.from as string);
        if (req.query.to) where.createdAt.lte = new Date(req.query.to as string);
      }

      const logs = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000, // cap at 10k rows for safety
      });

      // Build CSV
      const headers = ['Timestamp', 'Actor', 'Email', 'Action', 'Category', 'Severity', 'Target Type', 'Target ID', 'IP Address', 'Details'];
      const rows = logs.map((log: any) => [
        log.createdAt.toISOString(),
        log.actorName || '',
        log.actorEmail || '',
        log.action,
        log.category,
        log.severity,
        log.targetType || '',
        log.targetId || '',
        log.ipAddress || '',
        log.details ? JSON.stringify(log.details) : '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row: string[]) => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csvContent);
    } catch (error: any) {
      console.error('[AuditController] exportLogs error:', error);
      res.status(500).json({ error: 'Failed to export audit logs' });
    }
  }
}
