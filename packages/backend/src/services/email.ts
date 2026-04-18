/**
 * Email Service — Sends transactional emails via Resend.
 *
 * Used for:
 *  - OTP codes (registration & login verification)
 *  - Welcome emails
 *  - CRM / notification emails
 *  - Linda AI email features (future)
 */

import { Resend } from 'resend';
import { env } from '../config/env';

// ─── Resend Client ──────────────────────────────────────────────

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    if (!env.RESEND_API_KEY || env.RESEND_API_KEY === 're_PASTE_YOUR_KEY_HERE') {
      throw new Error('[Email] RESEND_API_KEY is not configured. Set it in .env');
    }
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

// ─── Email Templates ────────────────────────────────────────────

function otpEmailHtml(code: string, purpose: 'register' | 'login' | 'reset'): string {
  const purposeText = {
    register: 'Complete Your Registration',
    login: 'Verify Your Login',
    reset: 'Reset Your Password',
  }[purpose];

  const actionText = {
    register: 'to complete your registration',
    login: 'to verify your login',
    reset: 'to reset your password',
  }[purpose];

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a568e,#2980b9);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;letter-spacing:-0.5px;">OmniLink Messenger</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">${purposeText}</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
            Use the following verification code ${actionText}:
          </p>
          <div style="background:#f0f4f8;border:2px dashed #1a568e;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1a568e;font-family:'Courier New',monospace;">${code}</span>
          </div>
          <p style="margin:16px 0 0;color:#666;font-size:13px;line-height:1.5;">
            This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8f9fb;padding:20px 40px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            Sent by Linda &middot; OmniLink Messenger &middot; theomnilink.io
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function welcomeEmailHtml(displayName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1a568e,#2980b9);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">Welcome to OmniLink!</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
            Hi <strong>${displayName}</strong>,
          </p>
          <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
            Your account is now verified and ready to go. Here's what you can do:
          </p>
          <ul style="margin:0 0 16px;padding-left:20px;color:#555;font-size:14px;line-height:2;">
            <li>Chat with your team in real-time</li>
            <li>Talk to <strong>Linda</strong>, your AI assistant</li>
            <li>Create and manage tasks</li>
            <li>Share files and documents</li>
          </ul>
          <p style="margin:16px 0 0;color:#333;font-size:15px;line-height:1.6;">
            Linda is already waiting in your DMs. Say hi!
          </p>
        </td></tr>
        <tr><td style="background:#f8f9fb;padding:20px 40px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            OmniLink Messenger &middot; theomnilink.io
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function notificationEmailHtml(subject: string, body: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1a568e,#2980b9);padding:24px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">OmniLink Messenger</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#1a568e;font-size:18px;">${subject}</h2>
          <div style="color:#333;font-size:15px;line-height:1.6;">${body}</div>
        </td></tr>
        <tr><td style="background:#f8f9fb;padding:20px 40px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            Sent by Linda &middot; OmniLink Messenger &middot; theomnilink.io
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function inviteEmailHtml(
  inviterName: string,
  orgName: string,
  inviteUrl: string,
  expiresInHours: number
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a568e,#2980b9);padding:32px 40px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;letter-spacing:-0.5px;">OmniLink Messenger</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">You've been invited!</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;color:#333;font-size:15px;line-height:1.6;">
            <strong>${inviterName}</strong> has invited you to join
            <strong>${orgName}</strong> on OmniLink Messenger.
          </p>
          <p style="margin:0 0 24px;color:#333;font-size:15px;line-height:1.6;">
            Click the button below to accept your invitation, verify your email, and set up your password.
          </p>
          <div style="text-align:center;margin:32px 0;">
            <a href="${inviteUrl}" style="display:inline-block;background:linear-gradient(135deg,#1a568e,#2980b9);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 40px;border-radius:8px;box-shadow:0 4px 12px rgba(26,86,142,0.3);">
              Accept Invitation
            </a>
          </div>
          <p style="margin:16px 0 0;color:#666;font-size:13px;line-height:1.5;">
            This link is <strong>one-time use</strong> and expires in <strong>${expiresInHours} hours</strong>.
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
          <p style="margin:12px 0 0;color:#999;font-size:12px;line-height:1.4;word-break:break-all;">
            If the button doesn't work, copy and paste this URL into your browser:<br/>
            <a href="${inviteUrl}" style="color:#2980b9;">${inviteUrl}</a>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f8f9fb;padding:20px 40px;border-top:1px solid #eee;">
          <p style="margin:0;color:#999;font-size:12px;text-align:center;">
            Sent by Linda &middot; OmniLink Messenger &middot; theomnilink.io
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Public API ─────────────────────────────────────────────────

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an OTP verification code email.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: 'register' | 'login' | 'reset' = 'register'
): Promise<SendEmailResult> {
  const subjectMap = {
    register: 'Your OmniLink Verification Code',
    login: 'Your OmniLink Login Code',
    reset: 'Your OmniLink Password Reset Code',
  };

  try {
    const { data, error } = await getResend().emails.send({
      from: `Linda <${env.EMAIL_FROM}>`,
      to: [to],
      subject: subjectMap[purpose],
      html: otpEmailHtml(code, purpose),
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] OTP sent to ${to} (${purpose}) — id: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email] Failed to send OTP:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send a welcome email after successful registration.
 */
export async function sendWelcomeEmail(to: string, displayName: string): Promise<SendEmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: `Linda <${env.EMAIL_FROM}>`,
      to: [to],
      subject: `Welcome to OmniLink, ${displayName}!`,
      html: welcomeEmailHtml(displayName),
    });

    if (error) {
      console.error('[Email] Welcome email error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Welcome email sent to ${to} — id: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email] Failed to send welcome email:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send a generic notification / CRM email.
 */
export async function sendNotificationEmail(
  to: string,
  subject: string,
  body: string
): Promise<SendEmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: `Linda <${env.EMAIL_FROM}>`,
      to: [to],
      subject,
      html: notificationEmailHtml(subject, body),
    });

    if (error) {
      console.error('[Email] Notification email error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Notification sent to ${to} — id: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email] Failed to send notification:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send an organization invitation email with a one-time accept link.
 */
export async function sendInviteEmail(
  to: string,
  inviterName: string,
  orgName: string,
  inviteUrl: string,
  expiresInHours: number = 72
): Promise<SendEmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: `Linda <${env.EMAIL_FROM}>`,
      to: [to],
      subject: `You're invited to join ${orgName} on OmniLink`,
      html: inviteEmailHtml(inviterName, orgName, inviteUrl, expiresInHours),
    });

    if (error) {
      console.error('[Email] Invite email error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] Invite sent to ${to} for org "${orgName}" — id: ${data?.id}`);
    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[Email] Failed to send invite:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Check if the email service is configured and ready.
 */
export function isEmailConfigured(): boolean {
  return !!(env.RESEND_API_KEY && env.RESEND_API_KEY !== 're_PASTE_YOUR_KEY_HERE');
}
