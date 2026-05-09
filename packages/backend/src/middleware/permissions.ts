/**
 * Granular Permission System
 *
 * Permissions are defined as dot-separated strings, e.g. "members.add",
 * "messages.delete.any", "settings.edit".  Each OrgRole has a default set,
 * and individual members can have overrides stored in their membership record.
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── Permission Definitions ────────────────────────────────────────────

export const PERMISSIONS = {
  // Member management
  'members.view':       'View member list',
  'members.add':        'Add new members',
  'members.remove':     'Remove members',
  'members.edit.role':  'Change member roles',
  'members.edit.profile': 'Edit other members\' profiles',

  // Messaging
  'messages.send':      'Send messages',
  'messages.delete.own': 'Delete own messages',
  'messages.delete.any': 'Delete any message',
  'messages.pin':       'Pin/unpin messages',
  'messages.edit.own':  'Edit own messages',

  // Conversations
  'conversations.create': 'Create conversations/groups',
  'conversations.delete': 'Delete conversations',

  // Channels
  'channels.create':    'Create channels',
  'channels.manage':    'Manage channel settings',

  // Settings
  'settings.view':      'View organization settings',
  'settings.edit':      'Edit organization settings',

  // Departments
  'departments.manage': 'Create/edit/delete departments',

  // Agents
  'agents.hire':        'Hire AI agents',
  'agents.fire':        'Remove AI agents',
  'agents.configure':   'Configure agent settings',

  // Tasks
  'tasks.create':       'Create tasks',
  'tasks.assign':       'Assign tasks to others',
  'tasks.delete.any':   'Delete any task',

  // Audit
  'audit.view':         'View audit logs',
  'audit.export':       'Export audit logs',

  // Announcements
  'announcements.create': 'Create announcements',
  'announcements.delete': 'Delete announcements',
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ─── Default Role Permissions ──────────────────────────────────────────

const OWNER_PERMISSIONS: Permission[] = Object.keys(PERMISSIONS) as Permission[];

const ADMIN_PERMISSIONS: Permission[] = [
  'members.view',
  'members.add',
  'members.remove',
  'members.edit.role',
  'members.edit.profile',
  'messages.send',
  'messages.delete.own',
  'messages.delete.any',
  'messages.pin',
  'messages.edit.own',
  'conversations.create',
  'conversations.delete',
  'channels.create',
  'channels.manage',
  'settings.view',
  'departments.manage',
  'agents.hire',
  'agents.fire',
  'agents.configure',
  'tasks.create',
  'tasks.assign',
  'tasks.delete.any',
  'audit.view',
  'announcements.create',
  'announcements.delete',
];

const MEMBER_PERMISSIONS: Permission[] = [
  'members.view',
  'messages.send',
  'messages.delete.own',
  'messages.pin',
  'messages.edit.own',
  'conversations.create',
  'tasks.create',
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  OWNER: OWNER_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  MEMBER: MEMBER_PERMISSIONS,
};

// ─── Permission Checking ──────────────────────────────────────────────

/**
 * Get the effective permissions for a user in an organization.
 * Checks: custom overrides on membership → role defaults.
 */
export async function getUserPermissions(userId: string, orgId: string): Promise<Permission[]> {
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId } },
    select: { role: true, permissions: true },
  });

  if (!membership) return [];

  // If custom permissions are set on this member, use them
  if (membership.permissions && Array.isArray(membership.permissions)) {
    return membership.permissions as Permission[];
  }

  // Otherwise fall back to role defaults
  return DEFAULT_ROLE_PERMISSIONS[membership.role] || MEMBER_PERMISSIONS;
}

/**
 * Check if a user has a specific permission.
 */
export async function hasPermission(userId: string, orgId: string, permission: Permission): Promise<boolean> {
  const perms = await getUserPermissions(userId, orgId);
  return perms.includes(permission);
}

/**
 * Middleware factory: require one or more permissions.
 * Checks that the authenticated user has ALL specified permissions.
 */
export function requirePermission(...permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    const orgId = req.orgId;

    if (!userId || !orgId) {
      res.status(403).json({ error: 'Authentication and organization required' });
      return;
    }

    const userPerms = await getUserPermissions(userId, orgId);

    const missing = permissions.filter((p) => !userPerms.includes(p));
    if (missing.length > 0) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: missing,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware factory: require at least one of the given permissions.
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;
    const orgId = req.orgId;

    if (!userId || !orgId) {
      res.status(403).json({ error: 'Authentication and organization required' });
      return;
    }

    const userPerms = await getUserPermissions(userId, orgId);

    const hasAny = permissions.some((p) => userPerms.includes(p));
    if (!hasAny) {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions,
      });
      return;
    }

    next();
  };
}
