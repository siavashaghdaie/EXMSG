/**
 * Invite Token Service — generates, validates, and consumes invite tokens
 * for the org-admin member invitation flow.
 *
 * Flow:
 *  1. Admin adds member → createInviteToken() → sends invite email
 *  2. Invitee clicks link → validateInviteToken() → email verified
 *  3. Invitee sets password → consumeInviteToken() → token marked used
 */

import crypto from 'crypto';
import { prisma } from '../config/database';

const INVITE_EXPIRY_HOURS = 72;

export interface InviteTokenResult {
  success: boolean;
  token?: string;
  error?: string;
}

export interface InviteValidationResult {
  valid: boolean;
  invite?: {
    id: string;
    email: string;
    organizationId: string;
    orgName: string;
    role: string;
    displayName: string | null;
    inviterName: string;
  };
  error?: string;
}

/**
 * Generate a cryptographically secure URL-safe invite token and store it
 * in the database. Returns the raw token string for embedding in the URL.
 */
export async function createInviteToken(
  email: string,
  organizationId: string,
  invitedById: string,
  role: string = 'MEMBER',
  displayName?: string | null
): Promise<InviteTokenResult> {
  try {
    console.log(`[Invite] Creating invite token for ${email} in org ${organizationId}`);

    // Invalidate any existing unused invite for this email + org combo
    await (prisma as any).inviteToken.updateMany({
      where: {
        email: email.toLowerCase().trim(),
        organizationId,
        usedAt: null,
      },
      data: {
        // Force-expire old tokens by setting expiresAt to the past
        expiresAt: new Date(0),
      },
    });

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

    await (prisma as any).inviteToken.create({
      data: {
        token,
        email: email.toLowerCase().trim(),
        organizationId,
        invitedById,
        role,
        displayName: displayName || null,
        expiresAt,
      },
    });

    console.log(`[Invite] Token created successfully for ${email}`);

    return { success: true, token };
  } catch (err: any) {
    console.error('[Invite] Failed to create token:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Validate an invite token from a URL click. Does NOT consume it — the
 * token stays valid until the user finishes setting their password.
 */
export async function validateInviteToken(token: string): Promise<InviteValidationResult> {
  try {
    const invite = await (prisma as any).inviteToken.findUnique({
      where: { token },
      include: {
        organization: { select: { name: true } },
        invitedBy: { select: { displayName: true } },
      },
    });

    if (!invite) {
      return { valid: false, error: 'Invalid or expired invitation link.' };
    }

    if (invite.usedAt) {
      return { valid: false, error: 'This invitation has already been used. Please sign in with your password.' };
    }

    if (new Date() > invite.expiresAt) {
      return { valid: false, error: 'This invitation has expired. Please ask your administrator to send a new one.' };
    }

    return {
      valid: true,
      invite: {
        id: invite.id,
        email: invite.email,
        organizationId: invite.organizationId,
        orgName: invite.organization.name,
        role: invite.role,
        displayName: invite.displayName,
        inviterName: invite.invitedBy.displayName,
      },
    };
  } catch (err: any) {
    console.error('[Invite] Validation error:', err);
    return { valid: false, error: 'Something went wrong. Please try again.' };
  }
}

/**
 * Mark an invite token as used after the invitee has successfully set
 * their password. This makes the token one-time-use.
 */
export async function consumeInviteToken(token: string): Promise<boolean> {
  try {
    await (prisma as any).inviteToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });
    return true;
  } catch (err: any) {
    console.error('[Invite] Consume error:', err);
    return false;
  }
}

export { INVITE_EXPIRY_HOURS };
