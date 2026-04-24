import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const projectInclude = {
  teamLead: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
  createdBy: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  members: {
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
    },
  },
  _count: { select: { tasks: true, members: true } },
};

export class ProjectController {

  // GET /api/projects — list all projects the user can see
  async getProjects(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const orgId = req.orgId;
      const { status, search } = req.query;

      const where: any = {};

      if (orgId) {
        where.organizationId = orgId;
      }

      // User can see projects they're a member of, or they created, or they lead
      where.OR = [
        { members: { some: { userId } } },
        { createdById: userId },
        { teamLeadId: userId },
      ];

      if (status && typeof status === 'string') {
        where.status = status;
      }

      if (search && typeof search === 'string' && search.trim()) {
        where.name = { contains: search.trim(), mode: 'insensitive' };
      }

      const projects = await prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: { updatedAt: 'desc' },
      });

      res.json({ projects });
    } catch (error) {
      console.error('Get projects error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/projects/:projectId
  async getProject(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          ...projectInclude,
          tasks: {
            include: {
              assignedTo: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
              createdBy: { select: { id: true, displayName: true, username: true, avatarUrl: true } },
              department: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      res.json({ project });
    } catch (error) {
      console.error('Get project error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/projects — create a project
  async createProject(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const orgId = req.orgId;
      const { name, description, specsAndGoals, gitUrl, storageUrl, teamLeadId, memberIds } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Project name is required' });
        return;
      }

      if (!orgId) {
        res.status(400).json({ error: 'You must belong to a workspace before creating projects. Please create or join a workspace first.' });
        return;
      }

      // Create project
      const project = await prisma.project.create({
        data: {
          name: name.trim(),
          description: description ? String(description).trim() : undefined,
          specsAndGoals: specsAndGoals ? String(specsAndGoals).trim() : undefined,
          gitUrl: gitUrl ? String(gitUrl).trim() : undefined,
          storageUrl: storageUrl ? String(storageUrl).trim() : undefined,
          teamLeadId: teamLeadId || null,
          createdById: userId,
          organizationId: orgId,
        },
      });

      // Add creator as a member
      await prisma.projectMember.create({
        data: { projectId: project.id, userId, role: 'LEAD' },
      });

      // Add team lead as member if different from creator
      if (teamLeadId && teamLeadId !== userId) {
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId: project.id, userId: teamLeadId } },
          create: { projectId: project.id, userId: teamLeadId, role: 'LEAD' },
          update: { role: 'LEAD' },
        });
      }

      // Add additional members
      if (Array.isArray(memberIds)) {
        for (const memberId of memberIds) {
          if (memberId !== userId && memberId !== teamLeadId) {
            await prisma.projectMember.upsert({
              where: { projectId_userId: { projectId: project.id, userId: memberId } },
              create: { projectId: project.id, userId: memberId },
              update: {},
            });
          }
        }
      }

      // Fetch the full project with relations
      const full = await prisma.project.findUnique({
        where: { id: project.id },
        include: projectInclude,
      });

      res.status(201).json({ project: full });
    } catch (error: any) {
      if (error.code === 'P2002') {
        res.status(409).json({ error: 'A project with this name already exists in the workspace' });
        return;
      }
      console.error('Create project error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PATCH /api/projects/:projectId — update project profile
  async updateProject(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { name, description, specsAndGoals, gitUrl, storageUrl, teamLeadId, status } = req.body || {};

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const data: any = {};
      if (name !== undefined) data.name = String(name).trim();
      if (description !== undefined) data.description = description ? String(description).trim() : null;
      if (specsAndGoals !== undefined) data.specsAndGoals = specsAndGoals ? String(specsAndGoals).trim() : null;
      if (gitUrl !== undefined) data.gitUrl = gitUrl ? String(gitUrl).trim() : null;
      if (storageUrl !== undefined) data.storageUrl = storageUrl ? String(storageUrl).trim() : null;
      if (teamLeadId !== undefined) data.teamLeadId = teamLeadId || null;
      if (status !== undefined) data.status = status;

      // If team lead changed, ensure they're a project member
      if (teamLeadId && teamLeadId !== project.teamLeadId) {
        await prisma.projectMember.upsert({
          where: { projectId_userId: { projectId, userId: teamLeadId } },
          create: { projectId, userId: teamLeadId, role: 'LEAD' },
          update: { role: 'LEAD' },
        });
      }

      const updated = await prisma.project.update({
        where: { id: projectId },
        data,
        include: projectInclude,
      });

      res.json({ project: updated });
    } catch (error) {
      console.error('Update project error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/projects/:projectId
  async deleteProject(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const userId = req.user!.userId;

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Only creator, team lead, or org admin can delete
      if (project.createdById !== userId && project.teamLeadId !== userId) {
        res.status(403).json({ error: 'Only project creator or team lead can delete' });
        return;
      }

      // Unlink tasks (don't delete them)
      await prisma.task.updateMany({
        where: { projectId },
        data: { projectId: null },
      });

      await prisma.project.delete({ where: { id: projectId } });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete project error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/projects/:projectId/members — add member
  async addMember(req: Request, res: Response): Promise<void> {
    try {
      const { projectId } = req.params;
      const { userId, role } = req.body || {};

      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const member = await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: { projectId, userId, role: role || 'MEMBER' },
        update: { role: role || undefined },
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, email: true } },
        },
      });

      res.status(201).json({ member });
    } catch (error) {
      console.error('Add project member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE /api/projects/:projectId/members/:userId — remove member
  async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const { projectId, userId } = req.params;

      const membership = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (!membership) {
        res.status(404).json({ error: 'User is not in this project' });
        return;
      }

      await prisma.projectMember.delete({ where: { id: membership.id } });
      res.json({ success: true });
    } catch (error) {
      console.error('Remove project member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST /api/projects/find-or-create — auto-create from task assignment
  async findOrCreate(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;
      const orgId = req.orgId;
      const { name } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Project name is required' });
        return;
      }

      // Try to find existing project
      const existing = orgId
        ? await prisma.project.findUnique({
            where: { organizationId_name: { organizationId: orgId, name: name.trim() } },
            include: projectInclude,
          })
        : await prisma.project.findFirst({
            where: { name: name.trim(), createdById: userId },
            include: projectInclude,
          });

      if (existing) {
        res.json({ project: existing, created: false });
        return;
      }

      if (!orgId) {
        res.status(400).json({ error: 'Workspace required to create projects' });
        return;
      }

      // Create new project
      const project = await prisma.project.create({
        data: {
          name: name.trim(),
          createdById: userId,
          organizationId: orgId,
        },
      });

      // Add creator as member
      await prisma.projectMember.create({
        data: { projectId: project.id, userId, role: 'LEAD' },
      });

      const full = await prisma.project.findUnique({
        where: { id: project.id },
        include: projectInclude,
      });

      res.status(201).json({ project: full, created: true });
    } catch (error) {
      console.error('Find or create project error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // GET /api/projects/:projectId/mates — get project mates for a user
  async getProjectMates(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.userId;

      // Find all projects the user is in
      const memberships = await prisma.projectMember.findMany({
        where: { userId },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              members: {
                where: { userId: { not: userId } },
                include: {
                  user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
                },
              },
            },
          },
        },
      });

      // Build project mates list
      const mates: Array<{
        userId: string;
        displayName: string;
        username: string;
        avatarUrl?: string;
        projects: Array<{ id: string; name: string }>;
      }> = [];

      const mateMap = new Map<string, { userId: string; displayName: string; username: string; avatarUrl?: string; projects: Array<{ id: string; name: string }> }>();

      for (const m of memberships) {
        for (const pm of m.project.members) {
          const existing = mateMap.get(pm.user.id);
          if (existing) {
            existing.projects.push({ id: m.project.id, name: m.project.name });
          } else {
            mateMap.set(pm.user.id, {
              userId: pm.user.id,
              displayName: pm.user.displayName,
              username: pm.user.username,
              avatarUrl: pm.user.avatarUrl || undefined,
              projects: [{ id: m.project.id, name: m.project.name }],
            });
          }
        }
      }

      res.json({ mates: Array.from(mateMap.values()) });
    } catch (error) {
      console.error('Get project mates error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
