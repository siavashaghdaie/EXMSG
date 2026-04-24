import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { prisma } from '../../config/database';
import { createInviteToken, INVITE_EXPIRY_HOURS } from '../../services/invite';
import { sendInviteEmail, isEmailConfigured } from '../../services/email';
import { env } from '../../config/env';

// Reserved role names accepted from the client
type IncomingOrgRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export class OrgAdminController {
  // GET /api/org-admin/dashboard — Org-scoped dashboard
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get org members
      const orgMembers = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });

      const memberIds = orgMembers.map((m) => m.userId);

      // Parallel queries
      const [
        totalMembers,
        activeToday,
        totalMessages,
        totalTasks,
        messagesPerDay,
        mostActiveMembers,
        activeConversations,
      ] = await Promise.all([
        prisma.organizationMember.count({ where: { organizationId: orgId } }),
        prisma.user.count({
          where: {
            id: { in: memberIds },
            lastSeenAt: { gte: today },
          },
        }),
        prisma.message.count({
          where: { senderId: { in: memberIds } },
        }),
        prisma.task.count({
          where: {
            assignedToId: { in: memberIds },
          },
        }),
        this.getMessagesPerDay(memberIds, weekAgo),
        this.getMostActiveMembers(memberIds),
        this.getActiveConversations(memberIds),
      ]);

      res.json({
        totalMembers,
        activeToday,
        totalMessages,
        totalTasks,
        messagesPerDay,
        mostActiveMembers,
        activeConversations,
      });
    } catch (error) {
      console.error('Org dashboard error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/members
  async getMembers(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const { search, page = '1', limit = '20' } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Get org members with filters
      const where: any = { organizationId: orgId };
      const userWhere: any = {};

      if (search) {
        userWhere.OR = [
          { username: { contains: search as string, mode: 'insensitive' } },
          { displayName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [members, total] = await Promise.all([
        prisma.organizationMember.findMany({
          where: {
            ...where,
            user: userWhere,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                displayName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeenAt: true,
                emailVerified: true,
                passwordHash: true,
              },
            },
          },
          skip,
          take: parseInt(limit as string),
          orderBy: { joinedAt: 'desc' },
        }),
        prisma.organizationMember.count({
          where: {
            ...where,
            user: userWhere,
          },
        }),
      ]);

      // Get message and task counts for each member
      const enrichedMembers = await Promise.all(
        members.map(async (member) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const [messagesToday, taskCount] = await Promise.all([
            prisma.message.count({
              where: {
                senderId: member.userId,
                createdAt: { gte: today },
              },
            }),
            prisma.task.count({
              where: { assignedToId: member.userId },
            }),
          ]);

          // Derive invite status from emailVerified + passwordHash
          const invitePending = !member.user.emailVerified ||
            member.user.passwordHash.startsWith('INVITE_PENDING_');

          return {
            id: member.user.id,
            email: member.user.email,
            username: member.user.username,
            displayName: member.user.displayName,
            avatarUrl: member.user.avatarUrl,
            role: member.role,
            isOnline: member.user.isOnline,
            lastSeenAt: member.user.lastSeenAt,
            emailVerified: member.user.emailVerified,
            invitePending,
            messagesToday,
            taskCount,
          };
        })
      );

      res.json({
        members: enrichedMembers,
        total,
        page: parseInt(page as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      });
    } catch (error) {
      console.error('Get members error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/member/:userId/activity
  async getMemberActivity(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const orgId = req.orgId;

      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      // Verify user is in the organization
      const orgMember = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });

      if (!orgMember) {
        res.status(404).json({ error: 'Member not found in organization' });
        return;
      }

      // Get 30-day message activity
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Message counts by day
      const messages = await prisma.message.findMany({
        where: {
          senderId: userId,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { createdAt: true },
      });

      const messagesByDay = this.groupByDay(messages);

      // Online time estimate (based on lastSeenAt)
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isOnline: true, lastSeenAt: true, createdAt: true },
      });

      // Get conversations for this member
      const conversations = await prisma.conversationMember.findMany({
        where: { userId },
        include: {
          conversation: {
            select: {
              id: true,
              name: true,
              type: true,
              _count: { select: { messages: true } },
            },
          },
        },
      });

      // Get message counts per conversation
      const conversationDetails = await Promise.all(
        conversations.map(async (cm) => {
          const count = await prisma.message.count({
            where: {
              conversationId: cm.conversationId,
              senderId: userId,
            },
          });
          return {
            id: cm.conversation.id,
            name: cm.conversation.name || 'Unnamed',
            type: cm.conversation.type,
            messageCount: count,
          };
        })
      );

      // Get tasks assigned to this member
      const tasks = await prisma.task.findMany({
        where: { assignedToId: userId },
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          deadline: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Get recent messages
      const recentMessages = await prisma.message.findMany({
        where: { senderId: userId },
        include: {
          conversation: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      res.json({
        messagesByDay,
        onlineTime: user,
        conversations: conversationDetails,
        tasks,
        recentMessages: recentMessages.map((m) => ({
          id: m.id,
          content: m.content,
          conversationName: m.conversation.name || 'Unnamed',
          conversationId: m.conversation.id,
          conversationType: m.conversation.type,
          createdAt: m.createdAt,
          type: m.type,
        })),
      });
    } catch (error) {
      console.error('Get member activity error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/messages
  async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const {
        page = '1',
        limit = '20',
        memberId,
        search,
      } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      // Get org member IDs
      const orgMembers = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });

      const memberIds = orgMembers.map((m) => m.userId);

      // Build where clause
      const where: any = {
        sender: { id: { in: memberIds } },
      };

      if (memberId) {
        where.senderId = memberId as string;
      }

      if (search) {
        where.content = { contains: search as string, mode: 'insensitive' };
      }

      const [messages, total] = await Promise.all([
        prisma.message.findMany({
          where,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            conversation: { select: { id: true, name: true, type: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.message.count({ where }),
      ]);

      const enrichedMessages = messages.map((m) => ({
        id: m.id,
        senderName: m.sender.displayName || m.sender.username,
        conversationName: m.conversation.name || 'Unnamed',
        content: m.content,
        timestamp: m.createdAt,
        type: m.type,
        characterCount: m.content?.length || 0,
      }));

      res.json({
        messages: enrichedMessages,
        total,
        page: parseInt(page as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      });
    } catch (error) {
      console.error('Get messages error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/reports/daily
  async getDailyReport(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const { date } = req.query;
      let reportDate = new Date();

      if (date) {
        reportDate = new Date(date as string);
      }

      reportDate.setHours(0, 0, 0, 0);
      const endDate = new Date(reportDate);
      endDate.setDate(endDate.getDate() + 1);

      // Get org members
      const orgMembers = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      });

      // Get daily stats for each member
      const report = await Promise.all(
        orgMembers.map(async (member) => {
          const messageCount = await prisma.message.count({
            where: {
              senderId: member.userId,
              createdAt: { gte: reportDate, lt: endDate },
            },
          });

          const taskCount = await prisma.task.count({
            where: {
              assignedToId: member.userId,
              status: 'COMPLETED',
              updatedAt: { gte: reportDate, lt: endDate },
            },
          });

          return {
            userId: member.userId,
            name: member.user.displayName || member.user.username,
            messagesSent: messageCount,
            timeOnline: Math.floor(Math.random() * 480) + 30, // Mock: 30-510 minutes
            tasksCompleted: taskCount,
          };
        })
      );

      res.json({ date: reportDate, report });
    } catch (error) {
      console.error('Daily report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/reports/tasks
  async getTaskReport(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      // Get org member IDs
      const orgMembers = await prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        select: { userId: true },
      });

      const memberIds = orgMembers.map((m) => m.userId);

      // Get all tasks for org members
      const tasks = await prisma.task.findMany({
        where: { assignedToId: { in: memberIds } },
        include: {
          assignedTo: { select: { displayName: true, username: true } },
          createdBy: { select: { displayName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Count by status
      const statusCounts = {
        'NOT_STARTED': 0,
        'IN_PROGRESS': 0,
        'COMPLETED': 0,
        'BLOCKED': 0,
      };

      tasks.forEach((task) => {
        if (statusCounts.hasOwnProperty(task.status)) {
          statusCounts[task.status as keyof typeof statusCounts]++;
        }
      });

      const enrichedTasks = tasks.map((task) => ({
        id: task.id,
        title: task.title,
        assignee: task.assignedTo.displayName || task.assignedTo.username,
        status: task.status,
        priority: task.priority,
        dueDate: task.deadline,
        creator: task.createdBy.displayName || task.createdBy.username,
      }));

      res.json({
        tasks: enrichedTasks,
        statusCounts,
      });
    } catch (error) {
      console.error('Task report error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/org-admin/members — add an existing user by email, or create a brand new user
  // Body: { email: string, displayName?: string, username?: string, role?: 'OWNER'|'ADMIN'|'MEMBER' }
  //
  // When a new user is created, an invitation email is sent with a one-time
  // link. The invitee clicks the link to verify their email and set a password.
  // No temporary password is generated.
  async addMember(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const { email, displayName, username, role } = req.body || {};

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'A valid email is required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const requestedRole: IncomingOrgRole = (role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER')
        ? role
        : 'MEMBER';

      // Does this email already have an account?
      let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      let createdNewUser = false;

      if (!user) {
        // Create a brand new user with a placeholder password hash. The
        // invitee will set their real password via the invite link.
        const finalDisplayName = (displayName && String(displayName).trim()) || normalizedEmail.split('@')[0];
        const baseUsername = (username && String(username).trim()) || normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
        let finalUsername = baseUsername || `user${Date.now()}`;

        // Ensure username uniqueness
        let attempt = 0;
        while (await prisma.user.findUnique({ where: { username: finalUsername } })) {
          attempt += 1;
          finalUsername = `${baseUsername || 'user'}${attempt}`;
          if (attempt > 50) {
            res.status(500).json({ error: 'Could not generate a unique username' });
            return;
          }
        }

        // Placeholder hash — the user cannot log in until they set a
        // password via the invite link.
        const placeholderHash = `INVITE_PENDING_${crypto.randomBytes(16).toString('hex')}`;

        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            username: finalUsername,
            displayName: finalDisplayName,
            passwordHash: placeholderHash,
            emailVerified: false, // Will be verified when they click the invite link
          },
        });
        createdNewUser = true;
      }

      // Is the user already in this org?
      const existing = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      });

      if (existing) {
        res.status(409).json({
          error: 'User is already a member of this organization',
          member: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: existing.role,
          },
        });
        return;
      }

      const member = await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: user.id,
          role: requestedRole,
        },
      });

      // ── Send invitation email ─────────────────────────────────
      // Send the invite for new users, and also for existing users who
      // haven't set a password yet (placeholder hash starts with INVITE_PENDING_).
      // Always send an invite email when a member is added to the org.
      // For brand-new users this is their activation link (set password).
      // For existing users this serves as a welcome/notification that
      // they've been added to a new organization.
      let inviteSent = false;
      const emailConfigured = isEmailConfigured();
      console.log(`[OrgAdmin] addMember: email=${normalizedEmail} createdNewUser=${createdNewUser} emailVerified=${user.emailVerified} emailConfigured=${emailConfigured}`);
      if (emailConfigured) {
        const inviteResult = await createInviteToken(
          normalizedEmail,
          orgId,
          req.user!.userId,
          requestedRole,
          (displayName && String(displayName).trim()) || null
        );

        if (inviteResult.success && inviteResult.token) {
          const inviteUrl = `${env.FRONTEND_URL}/invite?token=${inviteResult.token}`;

          // Look up org name + inviter name for the email
          const org = await prisma.organization.findUnique({
            where: { id: orgId },
            select: { name: true },
          });
          const inviter = await prisma.user.findUnique({
            where: { id: req.user!.userId },
            select: { displayName: true },
          });

          const emailResult = await sendInviteEmail(
            normalizedEmail,
            inviter?.displayName || 'Your administrator',
            org?.name || 'your organization',
            inviteUrl,
            INVITE_EXPIRY_HOURS
          );
          inviteSent = emailResult.success;
          if (!emailResult.success) {
            console.error('[OrgAdmin] Invite email failed:', emailResult.error);
          }
        }
      }

      console.log(`[OrgAdmin] addMember result: email=${normalizedEmail} createdNewUser=${createdNewUser} inviteSent=${inviteSent}`);

      res.status(201).json({
        member: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: member.role,
          isOnline: user.isOnline,
          lastSeenAt: user.lastSeenAt,
          messagesToday: 0,
          taskCount: 0,
        },
        createdNewUser,
        inviteSent,
      });
    } catch (error) {
      console.error('Add member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/org-admin/members/:userId/resend-invite — resend the invitation email
  async resendInvite(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { userId } = req.params;

      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      if (!isEmailConfigured()) {
        res.status(503).json({ error: 'Email service is not configured. Set RESEND_API_KEY in your .env file.' });
        return;
      }

      // Find the member in this org
      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        include: {
          user: { select: { email: true, displayName: true, emailVerified: true, passwordHash: true } },
        },
      });

      if (!membership) {
        res.status(404).json({ error: 'Member not found in this organization' });
        return;
      }

      // Only resend for users who haven't set up yet
      const needsInvite = !membership.user.emailVerified ||
        membership.user.passwordHash.startsWith('INVITE_PENDING_');

      if (!needsInvite) {
        res.status(400).json({ error: 'This member has already accepted their invitation.' });
        return;
      }

      // Create a fresh invite token (invalidates old ones)
      const inviteResult = await createInviteToken(
        membership.user.email,
        orgId,
        req.user!.userId,
        membership.role,
        membership.user.displayName || null
      );

      if (!inviteResult.success || !inviteResult.token) {
        console.error('[OrgAdmin] Resend invite token failed:', inviteResult.error);
        res.status(500).json({ error: 'Failed to generate invite link. Please try again.' });
        return;
      }

      const inviteUrl = `${env.FRONTEND_URL}/invite?token=${inviteResult.token}`;

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      });
      const inviter = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { displayName: true },
      });

      const emailResult = await sendInviteEmail(
        membership.user.email,
        inviter?.displayName || 'Your administrator',
        org?.name || 'your organization',
        inviteUrl,
        INVITE_EXPIRY_HOURS
      );

      if (!emailResult.success) {
        console.error('[OrgAdmin] Resend invite email failed:', emailResult.error);
        res.status(500).json({ error: `Failed to send email: ${emailResult.error}` });
        return;
      }

      res.json({
        success: true,
        message: `Invitation resent to ${membership.user.email}`,
        email: membership.user.email,
      });
    } catch (error) {
      console.error('Resend invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/org-admin/members/:userId — change a member's org role
  async updateMemberRole(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { userId } = req.params;
      const { role } = req.body || {};

      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MEMBER') {
        res.status(400).json({ error: 'role must be OWNER, ADMIN, or MEMBER' });
        return;
      }

      const existing = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });

      if (!existing) {
        res.status(404).json({ error: 'Member not found in organization' });
        return;
      }

      const updated = await prisma.organizationMember.update({
        where: { id: existing.id },
        data: { role: role as IncomingOrgRole },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              isOnline: true,
              lastSeenAt: true,
            },
          },
        },
      });

      res.json({
        member: {
          id: updated.user.id,
          email: updated.user.email,
          username: updated.user.username,
          displayName: updated.user.displayName,
          avatarUrl: updated.user.avatarUrl,
          role: updated.role,
          isOnline: updated.user.isOnline,
          lastSeenAt: updated.user.lastSeenAt,
        },
      });
    } catch (error) {
      console.error('Update member role error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/org-admin/members/:userId — remove a member from the organization
  async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { userId } = req.params;

      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      // Prevent the last OWNER from being removed — an org must always have an owner
      const target = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });

      if (!target) {
        res.status(404).json({ error: 'Member not found in organization' });
        return;
      }

      if (target.role === 'OWNER') {
        const otherOwners = await prisma.organizationMember.count({
          where: {
            organizationId: orgId,
            role: 'OWNER',
            NOT: { userId },
          },
        });
        if (otherOwners === 0) {
          res.status(400).json({
            error: 'Cannot remove the last OWNER. Promote another member to OWNER first.',
          });
          return;
        }
      }

      await prisma.organizationMember.delete({ where: { id: target.id } });
      res.status(204).send();
    } catch (error) {
      console.error('Remove member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/organization — details about the currently-scoped org
  async getOrganization(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          description: true,
          createdAt: true,
          _count: { select: { members: true } },
        },
      });

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      res.json({ organization: org });
    } catch (error) {
      console.error('Get organization error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/organizations — list all organizations the caller can administer
  async listOrganizations(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const caller = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true },
      });

      if (!caller) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // SUPER_ADMIN sees everything; regular org admins see just the orgs they belong to
      let orgs;
      if (caller.role === 'SUPER_ADMIN') {
        orgs = await prisma.organization.findMany({
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            slug: true,
            avatarUrl: true,
            description: true,
            createdAt: true,
            _count: { select: { members: true } },
          },
        });
      } else {
        const memberships = await prisma.organizationMember.findMany({
          where: {
            userId: caller.id,
            role: { in: ['OWNER', 'ADMIN'] },
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                avatarUrl: true,
                description: true,
                createdAt: true,
                _count: { select: { members: true } },
              },
            },
          },
        });
        orgs = memberships.map((m) => m.organization);
      }

      res.json({ organizations: orgs });
    } catch (error) {
      console.error('List organizations error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/org-admin/organizations — create a new organization (any authenticated user)
  async createOrganization(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const caller = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, role: true },
      });

      if (!caller) {
        res.status(401).json({ error: 'User not found' });
        return;
      }

      const { name, slug: providedSlug, description } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Organization name is required' });
        return;
      }

      // Generate a URL-friendly slug if one wasn't provided
      let slug = (providedSlug && String(providedSlug).trim())
        || name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!slug) slug = `org-${Date.now()}`;

      // Ensure slug uniqueness
      let attempt = 0;
      const baseSlug = slug;
      while (await prisma.organization.findUnique({ where: { slug } })) {
        attempt += 1;
        slug = `${baseSlug}-${attempt}`;
        if (attempt > 50) break;
      }

      const org = await prisma.organization.create({
        data: {
          name: name.trim(),
          slug,
          description: description ? String(description).trim() : undefined,
        },
      });

      // Add the creator as OWNER of the new org so they can immediately manage it
      await prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: caller.id,
          role: 'OWNER',
        },
      });

      res.status(201).json({ organization: org });
    } catch (error) {
      console.error('Create organization error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/org-admin/profile — get the organization profile
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          description: true,
          visibility: true,
          plan: true,
          planStatus: true,
        },
      });

      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      res.json(org);
    } catch (error) {
      console.error('Get org profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/org-admin/profile — update org profile (OWNER only)
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      if (req.orgRole !== 'OWNER') {
        res.status(403).json({ error: 'Only organization owners can update the profile' });
        return;
      }

      const { name, description, visibility } = req.body || {};

      // Validate visibility if provided
      if (visibility !== undefined && visibility !== 'public' && visibility !== 'private') {
        res.status(400).json({ error: 'visibility must be "public" or "private"' });
        return;
      }

      const data: Record<string, any> = {};
      if (name !== undefined) data.name = String(name).trim();
      if (description !== undefined) data.description = String(description).trim();
      if (visibility !== undefined) data.visibility = visibility;

      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      const org = await prisma.organization.update({
        where: { id: orgId },
        data,
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          description: true,
          visibility: true,
          plan: true,
          planStatus: true,
        },
      });

      res.json(org);
    } catch (error) {
      console.error('Update org profile error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/org-admin/profile/logo — upload org logo (OWNER only)
  async uploadLogo(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      if (req.orgRole !== 'OWNER') {
        res.status(403).json({ error: 'Only organization owners can upload a logo' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const logoUrl = `/uploads/logos/${req.file.filename}`;

      const org = await prisma.organization.update({
        where: { id: orgId },
        data: { avatarUrl: logoUrl },
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          description: true,
          visibility: true,
          plan: true,
          planStatus: true,
        },
      });

      res.json(org);
    } catch (error) {
      console.error('Upload org logo error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Helper methods
  private async getMessagesPerDay(memberIds: string[], weekAgo: Date): Promise<any[]> {
    const messages = await prisma.message.findMany({
      where: {
        senderId: { in: memberIds },
        createdAt: { gte: weekAgo },
      },
      select: { createdAt: true },
    });

    const result: Record<string, number> = {};

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekAgo);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      result[dateStr] = 0;
    }

    messages.forEach((msg) => {
      const dateStr = msg.createdAt.toISOString().split('T')[0];
      if (result.hasOwnProperty(dateStr)) {
        result[dateStr]++;
      }
    });

    return Object.entries(result).map(([date, count]) => ({ date, count }));
  }

  private async getMostActiveMembers(memberIds: string[]): Promise<any[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const members = await prisma.organizationMember.findMany({
      where: { userId: { in: memberIds } },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    const result = await Promise.all(
      members.map(async (member) => {
        const messageCount = await prisma.message.count({
          where: {
            senderId: member.userId,
            createdAt: { gte: weekAgo },
          },
        });

        return {
          userId: member.userId,
          name: member.user.displayName || member.user.username,
          avatarUrl: member.user.avatarUrl,
          messageCount,
        };
      })
    );

    return result.sort((a, b) => b.messageCount - a.messageCount).slice(0, 10);
  }

  private async getActiveConversations(memberIds: string[]): Promise<any[]> {
    const conversations = await prisma.conversationMember.findMany({
      where: { userId: { in: memberIds } },
      include: {
        conversation: {
          select: {
            id: true,
            name: true,
            type: true,
            updatedAt: true,
            _count: { select: { messages: true } },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
      take: 50,
    });

    const convMap = new Map();
    conversations.forEach((cm) => {
      if (!convMap.has(cm.conversation.id)) {
        convMap.set(cm.conversation.id, cm.conversation);
      }
    });

    return Array.from(convMap.values()).slice(0, 5);
  }

  private groupByDay(messages: Array<{ createdAt: Date }>): Record<string, number> {
    const result: Record<string, number> = {};

    messages.forEach((msg) => {
      const dateStr = msg.createdAt.toISOString().split('T')[0];
      result[dateStr] = (result[dateStr] || 0) + 1;
    });

    return result;
  }

  // ─── Department Management ──────────────────────────────────────────────

  async getDepartments(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) { res.status(400).json({ error: 'Organization ID required' }); return; }

      const departments = await prisma.department.findMany({
        where: { organizationId: orgId },
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
            },
          },
          _count: { select: { members: true, visibleTasks: true } },
        },
        orderBy: { name: 'asc' },
      });

      res.json({ departments });
    } catch (error) {
      console.error('Get departments error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async createDepartment(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      if (!orgId) { res.status(400).json({ error: 'Organization ID required' }); return; }

      const { name, description } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Department name is required' });
        return;
      }

      const existing = await prisma.department.findUnique({
        where: { organizationId_name: { organizationId: orgId, name: name.trim() } },
      });
      if (existing) {
        res.status(409).json({ error: 'A department with this name already exists' });
        return;
      }

      const department = await prisma.department.create({
        data: {
          organizationId: orgId,
          name: name.trim(),
          description: description ? String(description).trim() : undefined,
        },
        include: { _count: { select: { members: true } } },
      });

      res.status(201).json({ department });
    } catch (error) {
      console.error('Create department error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async updateDepartment(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { departmentId } = req.params;
      if (!orgId) { res.status(400).json({ error: 'Organization ID required' }); return; }

      const { name, description } = req.body || {};

      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
      });
      if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }

      const data: any = {};
      if (name && typeof name === 'string' && name.trim()) data.name = name.trim();
      if (description !== undefined) data.description = description ? String(description).trim() : null;

      const updated = await prisma.department.update({
        where: { id: departmentId },
        data,
        include: { _count: { select: { members: true } } },
      });

      res.json({ department: updated });
    } catch (error) {
      console.error('Update department error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async deleteDepartment(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { departmentId } = req.params;
      if (!orgId) { res.status(400).json({ error: 'Organization ID required' }); return; }

      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
      });
      if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }

      await prisma.department.delete({ where: { id: departmentId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete department error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async addDepartmentMember(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { departmentId } = req.params;
      const { userId } = req.body || {};
      if (!orgId) { res.status(400).json({ error: 'Organization ID required' }); return; }
      if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }

      // Verify department belongs to org
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
      });
      if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }

      // Verify user is an org member
      const orgMember = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
      if (!orgMember) { res.status(400).json({ error: 'User is not a member of this organization' }); return; }

      // Check for existing membership
      const existing = await prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
      });
      if (existing) { res.status(409).json({ error: 'User is already in this department' }); return; }

      const member = await prisma.departmentMember.create({
        data: { departmentId, userId },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
        },
      });

      res.status(201).json({ member });
    } catch (error) {
      console.error('Add department member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async removeDepartmentMember(req: Request, res: Response): Promise<void> {
    try {
      const orgId = req.orgId;
      const { departmentId, userId } = req.params;
      if (!orgId) { res.status(400).json({ error: 'Organization ID required' }); return; }

      const dept = await prisma.department.findFirst({
        where: { id: departmentId, organizationId: orgId },
      });
      if (!dept) { res.status(404).json({ error: 'Department not found' }); return; }

      const membership = await prisma.departmentMember.findUnique({
        where: { departmentId_userId: { departmentId, userId } },
      });
      if (!membership) { res.status(404).json({ error: 'User is not in this department' }); return; }

      await prisma.departmentMember.delete({ where: { id: membership.id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Remove department member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
