import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, getUserPermissions, Permission } from '../../middleware/permissions';

const prisma = new PrismaClient();

export class PermissionsController {
  /**
   * GET /api/permissions/definitions
   * Returns all available permissions and their descriptions, plus role defaults.
   */
  async getDefinitions(_req: Request, res: Response) {
    res.json({
      permissions: PERMISSIONS,
      roleDefaults: DEFAULT_ROLE_PERMISSIONS,
    });
  }

  /**
   * GET /api/permissions/me
   * Returns the current user's effective permissions in their org.
   */
  async getMyPermissions(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      const orgId = req.orgId;

      if (!userId || !orgId) {
        return res.status(400).json({ error: 'Authentication and organization required' });
      }

      const perms = await getUserPermissions(userId, orgId);
      res.json({ permissions: perms });
    } catch (error: any) {
      console.error('[Permissions] getMyPermissions error:', error);
      res.status(500).json({ error: 'Failed to fetch permissions' });
    }
  }

  /**
   * GET /api/permissions/members/:userId
   * Returns a specific member's effective permissions plus any custom overrides.
   */
  async getMemberPermissions(req: Request, res: Response) {
    try {
      const orgId = req.orgId;
      const { userId } = req.params;

      if (!orgId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        select: { role: true, permissions: true },
      });

      if (!membership) {
        return res.status(404).json({ error: 'Member not found' });
      }

      const effective = await getUserPermissions(userId, orgId);
      const isCustom = membership.permissions !== null;

      res.json({
        role: membership.role,
        isCustom,
        customPermissions: isCustom ? membership.permissions : null,
        effectivePermissions: effective,
        roleDefaults: DEFAULT_ROLE_PERMISSIONS[membership.role] || [],
      });
    } catch (error: any) {
      console.error('[Permissions] getMemberPermissions error:', error);
      res.status(500).json({ error: 'Failed to fetch member permissions' });
    }
  }

  /**
   * PUT /api/permissions/members/:userId
   * Set custom permissions for a member (overriding role defaults).
   * Body: { permissions: string[] } or { permissions: null } to reset to defaults.
   */
  async setMemberPermissions(req: Request, res: Response) {
    try {
      const orgId = req.orgId;
      const { userId } = req.params;
      const { permissions } = req.body;

      if (!orgId) {
        return res.status(400).json({ error: 'Organization required' });
      }

      // Owners cannot have their permissions restricted
      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        select: { role: true },
      });

      if (!membership) {
        return res.status(404).json({ error: 'Member not found' });
      }

      if (membership.role === 'OWNER') {
        return res.status(400).json({ error: 'Owner permissions cannot be customized' });
      }

      // Validate permission strings
      if (permissions !== null) {
        if (!Array.isArray(permissions)) {
          return res.status(400).json({ error: 'Permissions must be an array or null' });
        }

        const validPerms = Object.keys(PERMISSIONS);
        const invalid = permissions.filter((p: string) => !validPerms.includes(p));
        if (invalid.length > 0) {
          return res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
        }
      }

      await prisma.organizationMember.update({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        data: { permissions: permissions === null ? null : permissions },
      });

      const effective = await getUserPermissions(userId, orgId);

      res.json({
        message: permissions === null ? 'Permissions reset to role defaults' : 'Custom permissions set',
        effectivePermissions: effective,
      });
    } catch (error: any) {
      console.error('[Permissions] setMemberPermissions error:', error);
      res.status(500).json({ error: 'Failed to update permissions' });
    }
  }
}
