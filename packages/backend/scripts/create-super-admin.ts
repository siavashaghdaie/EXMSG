/**
 * Create a Super Admin user for the OmniLink back office.
 *
 * Usage:
 *   cd packages/backend
 *   npx tsx scripts/create-super-admin.ts
 *
 * Reads credentials from env vars, or falls back to defaults:
 *   SUPER_ADMIN_EMAIL      (default: admin@omnilink.system)
 *   SUPER_ADMIN_USERNAME   (default: omniadmin)
 *   SUPER_ADMIN_PASSWORD   (default: ChangeMe!2026)
 *   SUPER_ADMIN_NAME       (default: OmniLink Admin)
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/config/database';

async function main() {
  const email = (process.env.SUPER_ADMIN_EMAIL || 'admin@omnilink.system').toLowerCase();
  const username = (process.env.SUPER_ADMIN_USERNAME || 'omniadmin').toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || 'ChangeMe!2026';
  const displayName = process.env.SUPER_ADMIN_NAME || 'OmniLink Admin';

  console.log('[Super Admin] Checking for existing user...');
  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { username }],
    },
  });

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    console.log(`[Super Admin] Updating existing user ${existing.email} → role=SUPER_ADMIN`);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'SUPER_ADMIN',
        emailVerified: true,
        passwordHash,
        displayName,
      },
    });
  } else {
    console.log(`[Super Admin] Creating new user: ${email}`);
    await prisma.user.create({
      data: {
        email,
        username,
        displayName,
        passwordHash,
        role: 'SUPER_ADMIN',
        emailVerified: true,
      },
    });
  }

  console.log('');
  console.log('==============================================');
  console.log('  Super Admin account ready!');
  console.log('==============================================');
  console.log(`  Login URL:  http://localhost:5173/admin/login`);
  console.log(`  Email:      ${email}`);
  console.log(`  Username:   ${username}`);
  console.log(`  Password:   ${password}`);
  console.log('==============================================');
  console.log('  ⚠️  Change the password after first login!');
  console.log('');
}

main()
  .catch((err) => {
    console.error('[Super Admin] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
