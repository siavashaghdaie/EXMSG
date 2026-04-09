/**
 * Promote an existing user to Panel Owner (SUPER_ADMIN).
 *
 * Also ensures a default organization exists and adds the user as OWNER,
 * so the Organization Dashboard has scope to work with.
 *
 * Usage:
 *   cd packages/backend
 *   npx tsx scripts/promote-to-panel-owner.ts <email-or-username>
 *
 * Examples:
 *   npx tsx scripts/promote-to-panel-owner.ts siavash
 *   npx tsx scripts/promote-to-panel-owner.ts siavash.aghdaie@gmail.com
 *
 * If no argument is given, it defaults to "siavash".
 */
import { prisma } from '../src/config/database';

async function main() {
  const arg = (process.argv[2] || 'siavash').toLowerCase().trim();

  console.log(`[Panel Owner] Looking up user: ${arg}`);

  // Try email first, then username, then displayName contains
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: arg, mode: 'insensitive' } },
        { username: { equals: arg, mode: 'insensitive' } },
        { displayName: { contains: arg, mode: 'insensitive' } },
      ],
    },
  });

  if (!user) {
    console.error(`[Panel Owner] ❌ No user found matching "${arg}".`);
    console.error('   Tip: pass the email, username, or display name as an argument.');
    process.exit(1);
  }

  let alreadyPromoted = false;

  if (user.role === 'SUPER_ADMIN') {
    console.log(`[Panel Owner] ✅ ${user.email} is already a Panel Owner.`);
    alreadyPromoted = true;
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: 'SUPER_ADMIN',
        emailVerified: true, // Panel owners must be verified
      },
    });
    console.log(`[Panel Owner] Promoted ${user.email} to SUPER_ADMIN.`);
  }

  // ---------------------------------------------------------------------------
  // Ensure a default organization exists, and the user is an OWNER of it.
  // Without this, the Organization Dashboard has nothing to scope queries to.
  // ---------------------------------------------------------------------------
  let defaultOrg = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!defaultOrg) {
    defaultOrg = await prisma.organization.create({
      data: {
        name: 'My Company',
        slug: 'my-company',
        description: 'Default organization created for the Panel Owner.',
      },
    });
    console.log(`[Panel Owner] Created default organization "${defaultOrg.name}".`);
  } else {
    console.log(`[Panel Owner] Using existing organization "${defaultOrg.name}".`);
  }

  const existingMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: defaultOrg.id,
        userId: user.id,
      },
    },
  });

  if (!existingMembership) {
    await prisma.organizationMember.create({
      data: {
        organizationId: defaultOrg.id,
        userId: user.id,
        role: 'OWNER',
      },
    });
    console.log(`[Panel Owner] Added ${user.email} as OWNER of "${defaultOrg.name}".`);
  } else if (existingMembership.role !== 'OWNER') {
    await prisma.organizationMember.update({
      where: { id: existingMembership.id },
      data: { role: 'OWNER' },
    });
    console.log(`[Panel Owner] Upgraded ${user.email} to OWNER of "${defaultOrg.name}".`);
  } else {
    console.log(`[Panel Owner] ${user.email} is already OWNER of "${defaultOrg.name}".`);
  }

  console.log('');
  console.log('==============================================');
  console.log(alreadyPromoted
    ? '  Panel Owner access verified!'
    : '  Panel Owner promotion complete!');
  console.log('==============================================');
  console.log(`  Name:       ${user.displayName}`);
  console.log(`  Email:      ${user.email}`);
  console.log(`  Username:   ${user.username}`);
  console.log(`  Role:       SUPER_ADMIN (Panel Owner)`);
  console.log(`  Organization: ${defaultOrg.name} (${defaultOrg.id})`);
  console.log('');
  console.log('  Sign in at:   http://localhost:5173/admin/login');
  console.log('  Use your normal account password.');
  console.log('==============================================');
}

main()
  .catch((err) => {
    console.error('[Panel Owner] Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
