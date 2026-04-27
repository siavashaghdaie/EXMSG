import { Request, Response } from 'express';
import { prisma } from '../../config/database';

const db = prisma as any;

export class CallController {
  // GET /api/calls — get call history for the authenticated user
  async getCallHistory(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { limit = '50', offset = '0' } = req.query;

      const calls = await db.call.findMany({
        where: {
          OR: [{ callerId: userId }, { calleeId: userId }],
        },
        include: {
          caller: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          callee: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit as string, 10) || 50, 100),
        skip: parseInt(offset as string, 10) || 0,
      });

      res.json({ calls });
    } catch (error) {
      console.error('Get call history error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/calls/:callId — get a single call
  async getCall(req: Request, res: Response): Promise<void> {
    try {
      const { callId } = req.params;
      const userId = req.user!.userId;

      const call = await db.call.findUnique({
        where: { id: callId },
        include: {
          caller: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
          callee: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
        },
      });

      if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
        res.status(404).json({ error: 'Call not found' });
        return;
      }

      res.json({ call });
    } catch (error) {
      console.error('Get call error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
