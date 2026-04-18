/**
 * Reset Database Script
 * ────────────────────
 * Deletes ALL user data from the database so you can start fresh.
 * Preserves the database schema and tables.
 *
 * Usage:
 *   cd packages/backend
 *   npx tsx scripts/reset-database.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('⚠️  Resetting database — deleting all user data...\n');

  // Delete in dependency order (children first)
  const deletions = [
    { name: 'StatusLike',        fn: () => (prisma as any).statusLike?.deleteMany() },
    { name: 'StatusView',        fn: () => (prisma as any).statusView?.deleteMany() },
    { name: 'UserStatus',        fn: () => (prisma as any).userStatus?.deleteMany() },
    { name: 'AnnouncementNote',  fn: () => (prisma as any).announcementNote?.deleteMany() },
    { name: 'Announcement',      fn: () => (prisma as any).announcement?.deleteMany() },
    { name: 'Task',              fn: () => (prisma as any).task?.deleteMany() },
    { name: 'Reaction',          fn: () => prisma.reaction.deleteMany() },
    { name: 'ReadReceipt',       fn: () => prisma.readReceipt.deleteMany() },
    { name: 'Message',           fn: () => prisma.message.deleteMany() },
    { name: 'ConversationMember',fn: () => prisma.conversationMember.deleteMany() },
    { name: 'Conversation',      fn: () => prisma.conversation.deleteMany() },
    { name: 'LindaMemory',       fn: () => (prisma as any).lindaMemory?.deleteMany() },
    { name: 'LindaMessage',      fn: () => (prisma as any).lindaMessage?.deleteMany() },
    { name: 'LindaConversation', fn: () => (prisma as any).lindaConversation?.deleteMany() },
    { name: 'InviteToken',       fn: () => (prisma as any).inviteToken?.deleteMany() },
    { name: 'OtpCode',           fn: () => (prisma as any).otpCode?.deleteMany() },
    { name: 'RefreshToken',      fn: () => prisma.refreshToken.deleteMany() },
    { name: 'OrganizationMember',fn: () => prisma.organizationMember.deleteMany() },
    { name: 'Organization',      fn: () => prisma.organization.deleteMany() },
    { name: 'User',              fn: () => prisma.user.deleteMany() },
  ];

  for (const { name, fn } of deletions) {
    try {
      const result = await fn();
      const count = result?.count ?? 0;
      console.log(`  ✓ ${name}: deleted ${count} rows`);
    } catch (err: any) {
      // Table might not exist yet — that's fine
      if (err?.code === 'P2021' || err?.message?.includes('does not exist')) {
        console.log(`  ⊘ ${name}: table not found (skipped)`);
      } else {
        console.warn(`  ✗ ${name}: ${err?.message || err}`);
      }
    }
  }

  console.log('\n✅ Database reset complete. You can now register a fresh Panel Owner.\n');
}

resetDatabase()
  .catch((e) => {
    console.error('Reset failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
