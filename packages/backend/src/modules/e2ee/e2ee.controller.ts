import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export class E2EEController {
  // POST /api/e2ee/keys — Upload a public key for the current user
  async uploadPublicKey(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { publicKey, deviceId } = req.body;

      if (!publicKey || !deviceId) {
        res.status(400).json({ error: 'publicKey and deviceId are required' });
        return;
      }

      // Generate fingerprint from the public key (SHA-256, first 16 hex chars)
      const fingerprint = crypto
        .createHash('sha256')
        .update(publicKey)
        .digest('hex')
        .substring(0, 16)
        .toUpperCase()
        .replace(/(.{4})/g, '$1 ')
        .trim();

      const key = await prisma.userE2EEKey.upsert({
        where: { userId_deviceId: { userId, deviceId } },
        update: {
          publicKey,
          fingerprint,
          isActive: true,
          updatedAt: new Date(),
        },
        create: {
          userId,
          publicKey,
          deviceId,
          fingerprint,
        },
      });

      res.json({
        id: key.id,
        fingerprint: key.fingerprint,
        deviceId: key.deviceId,
        createdAt: key.createdAt,
      });
    } catch (error) {
      console.error('Upload public key error:', error);
      res.status(500).json({ error: 'Failed to upload public key' });
    }
  }

  // GET /api/e2ee/keys/:userId — Get active public keys for a user
  async getUserKeys(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      const keys = await prisma.userE2EEKey.findMany({
        where: { userId, isActive: true },
        select: {
          id: true,
          publicKey: true,
          deviceId: true,
          fingerprint: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ keys });
    } catch (error) {
      console.error('Get user keys error:', error);
      res.status(500).json({ error: 'Failed to get user keys' });
    }
  }

  // GET /api/e2ee/keys — Get current user's own keys
  async getMyKeys(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      const keys = await prisma.userE2EEKey.findMany({
        where: { userId },
        select: {
          id: true,
          deviceId: true,
          fingerprint: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ keys });
    } catch (error) {
      console.error('Get my keys error:', error);
      res.status(500).json({ error: 'Failed to get keys' });
    }
  }

  // DELETE /api/e2ee/keys/:deviceId — Revoke a key for a device
  async revokeKey(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { deviceId } = req.params;

      await prisma.userE2EEKey.updateMany({
        where: { userId, deviceId },
        data: { isActive: false },
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Revoke key error:', error);
      res.status(500).json({ error: 'Failed to revoke key' });
    }
  }

  // POST /api/e2ee/conversations/:conversationId/enable — Enable E2EE for a conversation
  async enableE2EE(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      // Verify membership and admin/owner role
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      // Get all members of the conversation
      const members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: { userId: true },
      });

      // Check all members have uploaded E2EE keys
      const memberIds = members.map((m) => m.userId);
      const keyCounts = await prisma.userE2EEKey.groupBy({
        by: ['userId'],
        where: { userId: { in: memberIds }, isActive: true },
        _count: true,
      });

      const membersWithKeys = new Set(keyCounts.map((k: any) => k.userId));
      const membersWithoutKeys = memberIds.filter((id) => !membersWithKeys.has(id));

      if (membersWithoutKeys.length > 0) {
        res.status(400).json({
          error: 'Not all members have uploaded E2EE keys',
          membersWithoutKeys,
        });
        return;
      }

      const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { isE2EE: true },
        select: { id: true, isE2EE: true },
      });

      res.json(conversation);
    } catch (error) {
      console.error('Enable E2EE error:', error);
      res.status(500).json({ error: 'Failed to enable E2EE' });
    }
  }

  // POST /api/e2ee/conversations/:conversationId/disable — Disable E2EE
  async disableE2EE(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      const conversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { isE2EE: false },
        select: { id: true, isE2EE: true },
      });

      res.json(conversation);
    } catch (error) {
      console.error('Disable E2EE error:', error);
      res.status(500).json({ error: 'Failed to disable E2EE' });
    }
  }

  // GET /api/e2ee/conversations/:conversationId/keys — Get all member keys for a conversation
  async getConversationKeys(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { conversationId } = req.params;

      // Verify membership
      const membership = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'Not a member of this conversation' });
        return;
      }

      const members = await prisma.conversationMember.findMany({
        where: { conversationId },
        select: {
          userId: true,
          user: {
            select: { displayName: true, username: true },
          },
        },
      });

      const memberIds = members.map((m) => m.userId);

      const keys = await prisma.userE2EEKey.findMany({
        where: { userId: { in: memberIds }, isActive: true },
        select: {
          id: true,
          userId: true,
          publicKey: true,
          deviceId: true,
          fingerprint: true,
        },
      });

      // Group by userId
      const keysByUser: Record<string, any> = {};
      for (const member of members) {
        keysByUser[member.userId] = {
          displayName: member.user.displayName,
          username: member.user.username,
          keys: keys.filter((k: any) => k.userId === member.userId),
        };
      }

      res.json({ members: keysByUser });
    } catch (error) {
      console.error('Get conversation keys error:', error);
      res.status(500).json({ error: 'Failed to get conversation keys' });
    }
  }
}
