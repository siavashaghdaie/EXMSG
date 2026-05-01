import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { env } from '../../config/env';

export class PushController {
  // GET /push/vapid-public-key — returns the public key for client subscription
  async getVapidPublicKey(_req: Request, res: Response) {
    res.json({ publicKey: env.VAPID_PUBLIC_KEY });
  }

  // POST /push/subscribe — save a push subscription for the authenticated user
  async subscribe(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription object' });
      }

      // Upsert — if same endpoint exists for this user, update keys
      await (prisma as any).pushSubscription.upsert({
        where: {
          userId_endpoint: { userId, endpoint },
        },
        update: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: req.headers['user-agent'] || null,
        },
        create: {
          userId,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: req.headers['user-agent'] || null,
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[Push] Subscribe error:', error);
      res.status(500).json({ error: 'Failed to save subscription' });
    }
  }

  // POST /push/unsubscribe — remove a push subscription
  async unsubscribe(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

      await (prisma as any).pushSubscription.deleteMany({
        where: { userId, endpoint },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('[Push] Unsubscribe error:', error);
      res.status(500).json({ error: 'Failed to remove subscription' });
    }
  }
}
