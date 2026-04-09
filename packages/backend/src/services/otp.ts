/**
 * OTP Service — Generates, stores, and verifies one-time passcodes.
 *
 * - 6-digit numeric codes
 * - 10-minute expiry
 * - Max 5 verification attempts per code (brute-force protection)
 * - Rate limiting: max 5 codes per email per hour
 */

import crypto from 'crypto';
import { prisma } from '../config/database';
import { sendOtpEmail } from './email';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

/**
 * Generate a cryptographically random 6-digit OTP code.
 */
function generateCode(): string {
  // Generate a number between 100000 and 999999
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0) % 900000 + 100000;
  return num.toString();
}

/**
 * Create a new OTP, store it in the database, and send it via email.
 */
export async function createAndSendOtp(
  email: string,
  purpose: 'register' | 'login' | 'reset',
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limiting: check how many codes were sent to this email in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: {
      email: normalizedEmail,
      purpose,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentCount >= MAX_CODES_PER_HOUR) {
    return { success: false, error: 'Too many verification codes requested. Please try again later.' };
  }

  // Invalidate any existing unused codes for this email + purpose
  await prisma.otpCode.deleteMany({
    where: {
      email: normalizedEmail,
      purpose,
      verified: false,
    },
  });

  // Generate and store the new code
  const code = generateCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      email: normalizedEmail,
      code,
      purpose,
      userId: userId || null,
      expiresAt,
    },
  });

  // Send the code via email
  const result = await sendOtpEmail(normalizedEmail, code, purpose);
  if (!result.success) {
    return { success: false, error: 'Failed to send verification email. Please try again.' };
  }

  return { success: true };
}

/**
 * Verify an OTP code. Returns the OTP record if valid.
 */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: 'register' | 'login' | 'reset'
): Promise<{ valid: boolean; error?: string; otpId?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Find the most recent unverified code for this email + purpose
  const otp = await prisma.otpCode.findFirst({
    where: {
      email: normalizedEmail,
      purpose,
      verified: false,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }

  // Check expiry
  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.delete({ where: { id: otp.id } });
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }

  // Check attempts
  if (otp.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.delete({ where: { id: otp.id } });
    return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  // Check code
  if (otp.code !== code) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    return { valid: false, error: 'Invalid verification code. Please try again.' };
  }

  // Mark as verified
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { verified: true },
  });

  return { valid: true, otpId: otp.id };
}

/**
 * Clean up expired OTP codes (call periodically).
 */
export async function cleanupExpiredOtps(): Promise<number> {
  const result = await prisma.otpCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { verified: true, createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return result.count;
}
