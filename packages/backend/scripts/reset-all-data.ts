/**
 * reset-all-data.ts
 *
 * Deletes ALL user-generated data from the database while preserving the
 * schema. Run from packages/backend with:
 *
 *   npx tsx scripts/reset-all-data.ts
 *
 * Or use the nuclear option instead (drops + recreates all tables):
 *
 *   npx prisma migrate reset
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('⚠️  Deleting ALL data from the database...\n');

  // Delete in reverse-dependency order to satisfy foreign key constraints.
  // Children first, parents last.

  const tables = [
    // Announcement children
    'AnnouncementComment',
    'AnnouncementReaction',
    'AnnouncementRead',
    'Announcement',

    // Status children
    'StatusLike',
    'StatusView',
    'UserStatus',

    // Linda children
    'LindaActivity',
    'LindaMemory',
    'LindaConversationRelatedUser',
    'LindaMessage',
    'LindaConversation',

    // Task
    'Task',

    // Messaging children
    'PinnedMessage',
    'ReadReceipt',
    'MessageReaction',
    'MessageAttachment',
    'Message',
    'ConversationMember',
    'Channel',
    'Conversation',

    // Auth children
    'OtpCode',
    'RefreshToken',
    'OrganizationMember',

    // Top-level entities (order matters: users reference orgs)
    'User',
    'Organization',
  ] as const;

  for (const table of tables) {
    try {
      const result = await (prisma as any)[
        table.charAt(0).toLowerCase() + table.slice(1)
      ].deleteMany({});
      console.log(`  ✓ ${table}: deleted ${result.count} rows`);
    } catch (err: any) {
      console.error(`  ✗ ${table}: ${err.message}`);
    }
  }

  console.log('\n✅ Database cleared. All accounts removed.');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
