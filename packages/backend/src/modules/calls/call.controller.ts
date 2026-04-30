import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';

const db = prisma as any;

export class CallController {
  // GET /api/calls/turn-credentials — generate short-lived TURN credentials
  // Uses the TURN REST API (RFC draft) with HMAC-SHA1 for Coturn
  async getTurnCredentials(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const turnSecret = (env as any).TURN_SECRET || '';
      const turnServer = (env as any).TURN_SERVER || '';

      // If no TURN server is configured, return Google STUN only
      if (!turnSecret || !turnServer) {
        res.json({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
        });
        return;
      }

      // Generate time-limited credentials (valid for 24 hours)
      const ttl = 86400;
      const timestamp = Math.floor(Date.now() / 1000) + ttl;
      const username = `${timestamp}:${userId}`;
      const hmac = crypto.createHmac('sha1', turnSecret);
      hmac.update(username);
      const credential = hmac.digest('base64');

      res.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          {
            urls: [
              `turn:${turnServer}:3478`,
              `turn:${turnServer}:3478?transport=tcp`,
              `turns:${turnServer}:5349`,
            ],
            username,
            credential,
          },
        ],
        ttl,
      });
    } catch (error) {
      console.error('Get TURN credentials error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

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
