/**
 * Quick test script to verify the invite email pipeline works end-to-end.
 *
 * Usage:
 *   npx tsx scripts/test-invite-email.ts <recipient-email>
 *
 * This will:
 *  1. Check that RESEND_API_KEY is configured
 *  2. Try to send a test invite email via Resend
 *  3. Report success or the exact error
 */

import { env } from '../src/config/env';
import { isEmailConfigured, sendInviteEmail } from '../src/services/email';

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error('Usage: npx tsx scripts/test-invite-email.ts <recipient-email>');
    process.exit(1);
  }

  console.log('--- Invite Email Test ---');
  console.log(`RESEND_API_KEY: ${env.RESEND_API_KEY ? env.RESEND_API_KEY.slice(0, 8) + '...' : '(not set)'}`);
  console.log(`EMAIL_FROM: ${env.EMAIL_FROM}`);
  console.log(`isEmailConfigured(): ${isEmailConfigured()}`);
  console.log(`Recipient: ${recipient}`);
  console.log('');

  if (!isEmailConfigured()) {
    console.error('ERROR: Email is not configured. Set RESEND_API_KEY in your .env file.');
    process.exit(1);
  }

  const testUrl = 'http://localhost:5173/invite?token=TEST_TOKEN_12345';

  console.log('Sending test invite email...');
  const result = await sendInviteEmail(
    recipient,
    'Test Admin',
    'Test Organization',
    testUrl,
    72
  );

  if (result.success) {
    console.log(`SUCCESS! Email sent. Resend ID: ${result.id}`);
    console.log('Check your inbox (and spam folder) for the invite email.');
  } else {
    console.error(`FAILED: ${result.error}`);
    console.error('Common causes:');
    console.error('  - Invalid RESEND_API_KEY');
    console.error('  - EMAIL_FROM domain not verified in Resend');
    console.error('  - Rate limiting');
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
