import { Request, Response } from 'express';
import { prisma } from '../../config/database';

export class InterPanelController {
  // GET /api/panels/public - list public panels (NO AUTH REQUIRED)
  async listPublicPanels(req: Request, res: Response): Promise<void> {
    try {
      const panels = await prisma.organization.findMany({
        where: { visibility: 'public' },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          description: true,
        },
        orderBy: { name: 'asc' },
      });

      res.json({ panels });
    } catch (error) {
      console.error('listPublicPanels error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/panels/search?q=query - search public panels (AUTH REQUIRED)
  async searchPanels(req: Request, res: Response): Promise<void> {
    try {
      const query = (req.query.q as string || '').trim();

      if (!query) {
        res.status(400).json({ error: 'Search query is required' });
        return;
      }

      const userOrgId = req.orgId ?? null;

      const panels = await prisma.organization.findMany({
        where: {
          visibility: 'public',
          ...(userOrgId ? { id: { not: userOrgId } } : {}),
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          description: true,
        },
        orderBy: { name: 'asc' },
      });

      res.json({ panels });
    } catch (error) {
      console.error('searchPanels error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/panels/request - send inter-panel request (panel owner only)
  async sendRequest(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const senderOrgId = req.orgId ?? null;

      if (!senderOrgId || req.orgRole !== 'OWNER') {
        res.status(403).json({ error: 'Only panel owners can send inter-panel requests' });
        return;
      }

      const { receiverOrgId, message } = req.body;

      if (!receiverOrgId) {
        res.status(400).json({ error: 'receiverOrgId is required' });
        return;
      }

      if (receiverOrgId === senderOrgId) {
        res.status(400).json({ error: 'Cannot send a request to your own panel' });
        return;
      }

      // Verify receiver org exists and is public
      const receiverOrg = await prisma.organization.findUnique({
        where: { id: receiverOrgId },
        select: { id: true, visibility: true },
      });

      if (!receiverOrg) {
        res.status(404).json({ error: 'Panel not found' });
        return;
      }

      if (receiverOrg.visibility !== 'public') {
        res.status(403).json({ error: 'Cannot send requests to private panels' });
        return;
      }

      // Check for existing request between these orgs (in either direction)
      const existingRequest = await prisma.interPanelRequest.findFirst({
        where: {
          OR: [
            { senderOrgId, receiverOrgId },
            { senderOrgId: receiverOrgId, receiverOrgId: senderOrgId },
          ],
        },
      });

      if (existingRequest) {
        if (existingRequest.status === 'ACCEPTED') {
          res.status(409).json({ error: 'A connection already exists between these panels' });
        } else if (existingRequest.status === 'PENDING') {
          res.status(409).json({ error: 'A pending request already exists between these panels' });
        } else {
          // REJECTED - allow re-sending by updating the existing record
          const updated = await prisma.interPanelRequest.update({
            where: { id: existingRequest.id },
            data: {
              senderOrgId,
              receiverOrgId,
              status: 'PENDING',
              message: message || null,
            },
            include: {
              senderOrg: { select: { id: true, name: true, avatarUrl: true } },
              receiverOrg: { select: { id: true, name: true, avatarUrl: true } },
            },
          });
          res.status(200).json({ request: updated });
        }
        return;
      }

      const newRequest = await prisma.interPanelRequest.create({
        data: {
          senderOrgId,
          receiverOrgId,
          message: message || null,
          status: 'PENDING',
        },
        include: {
          senderOrg: { select: { id: true, name: true, avatarUrl: true } },
          receiverOrg: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

      res.status(201).json({ request: newRequest });
    } catch (error) {
      console.error('sendRequest error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/panels/requests - list my panel's sent and received requests
  async listRequests(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId ?? null;

      if (!orgId || req.orgRole !== 'OWNER') {
        res.status(403).json({ error: 'Only panel owners can view inter-panel requests' });
        return;
      }

      const sent = await prisma.interPanelRequest.findMany({
        where: { senderOrgId: orgId },
        include: {
          receiverOrg: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const received = await prisma.interPanelRequest.findMany({
        where: { receiverOrgId: orgId },
        include: {
          senderOrg: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({ sent, received });
    } catch (error) {
      console.error('listRequests error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/panels/requests/:id/accept - accept a request (receiver panel owner)
  async acceptRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const orgId = req.orgId ?? null;

      if (!orgId || req.orgRole !== 'OWNER') {
        res.status(403).json({ error: 'Only panel owners can accept inter-panel requests' });
        return;
      }

      const request = await prisma.interPanelRequest.findUnique({
        where: { id },
      });

      if (!request) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }

      if (request.receiverOrgId !== orgId) {
        res.status(403).json({ error: 'Only the receiving panel owner can accept this request' });
        return;
      }

      if (request.status !== 'PENDING') {
        res.status(400).json({ error: `Request is already ${request.status.toLowerCase()}` });
        return;
      }

      // Find owners of both orgs
      const senderOwner = await prisma.organizationMember.findFirst({
        where: { organizationId: request.senderOrgId, role: 'OWNER' },
        select: { userId: true },
      });

      const receiverOwner = await prisma.organizationMember.findFirst({
        where: { organizationId: request.receiverOrgId, role: 'OWNER' },
        select: { userId: true },
      });

      if (!senderOwner || !receiverOwner) {
        res.status(500).json({ error: 'Could not find panel owners' });
        return;
      }

      // Create an inter-panel DM conversation and update the request in a transaction
      const result = await prisma.$transaction(async (tx: any) => {
        const conversation = await tx.conversation.create({
          data: {
            type: 'DIRECT',
            isInterPanel: true,
            organizationId: null,
            members: {
              create: [
                { userId: senderOwner.userId, role: 'MEMBER' },
                { userId: receiverOwner.userId, role: 'MEMBER' },
              ],
            },
          },
        });

        const updatedRequest = await tx.interPanelRequest.update({
          where: { id },
          data: {
            status: 'ACCEPTED',
            conversationId: conversation.id,
          },
          include: {
            senderOrg: { select: { id: true, name: true, avatarUrl: true } },
            receiverOrg: { select: { id: true, name: true, avatarUrl: true } },
          },
        });

        return { request: updatedRequest, conversationId: conversation.id };
      });

      res.json(result);
    } catch (error) {
      console.error('acceptRequest error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/panels/requests/:id/reject - reject a request (receiver panel owner)
  async rejectRequest(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const orgId = req.orgId ?? null;

      if (!orgId || req.orgRole !== 'OWNER') {
        res.status(403).json({ error: 'Only panel owners can reject inter-panel requests' });
        return;
      }

      const request = await prisma.interPanelRequest.findUnique({
        where: { id },
      });

      if (!request) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }

      if (request.receiverOrgId !== orgId) {
        res.status(403).json({ error: 'Only the receiving panel owner can reject this request' });
        return;
      }

      if (request.status !== 'PENDING') {
        res.status(400).json({ error: `Request is already ${request.status.toLowerCase()}` });
        return;
      }

      const updatedRequest = await prisma.interPanelRequest.update({
        where: { id },
        data: { status: 'REJECTED' },
        include: {
          senderOrg: { select: { id: true, name: true, avatarUrl: true } },
          receiverOrg: { select: { id: true, name: true, avatarUrl: true } },
        },
      });

      res.json({ request: updatedRequest });
    } catch (error) {
      console.error('rejectRequest error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
