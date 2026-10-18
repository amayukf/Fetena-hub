import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Provision (or promote) the primary administrator.
 *
 * SECURITY: this script must never silently escalate an existing account or
 * reset a real user's password. Previously it upserted by email, so passing a
 * student's email promoted that student to ADMIN and replaced their password.
 * It now refuses whenever the target is an existing non-admin account, unless
 * the operator explicitly passes --force.
 */
async function createAdmin() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const positional = args.filter((a) => !a.startsWith('--'));

  const email = positional[0] || process.env.ADMIN_EMAIL;
  const password = positional[1] || process.env.ADMIN_INITIAL_PASSWORD;

  if (!email || !password) {
    console.log('\n❌ Usage: npm run create-admin <email> <password> [--force]');
    console.log('   Or set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in your .env file.');
    console.log('   --force is required to promote an EXISTING non-admin account.\n');
    process.exit(1);
  }

  if (password.length < 12) {
    console.log('\n❌ Refusing to set a password shorter than 12 characters for an administrator.\n');
    process.exit(1);
  }

  if (force) {
    console.log('\n⚠️  --force supplied: an existing non-admin account may be promoted and its password replaced.\n');
  }

  const existingAdmins = await prisma.user.findMany({ where: { role: Role.ADMIN } });
  const existingByEmail = await prisma.user.findUnique({ where: { email } });

  const otherAdmin = existingAdmins.find((a) => a.email !== email);
  if (otherAdmin && !force) {
    console.log(
      `⚠️ An administrator account already exists (${otherAdmin.email}). ` +
        'System policy allows only 1 primary administrator. Re-run with --force to add another.'
    );
    process.exit(1);
  }

  if (existingByEmail && existingByEmail.role !== Role.ADMIN && !force) {
    console.log(
      `\n❌ "${email}" already belongs to a ${existingByEmail.role} account.\n` +
        '   Refusing to promote an existing user and overwrite their password.\n' +
        '   Use a different email, or re-run with --force if this is intentional.\n'
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = existingByEmail
    ? await prisma.user.update({
        where: { email },
        data: {
          passwordHash,
          role: Role.ADMIN,
          mustChangePassword: true,
          isActive: true,
          deletedAt: null,
        },
      })
    : await prisma.user.create({
        data: {
          studentId: 'AMU-ADMIN-01',
          fullName: 'System Administrator',
          email,
          passwordHash,
          role: Role.ADMIN,
          mustChangePassword: true,
          canSell: false,
        },
      });

  await prisma.auditLog.create({
    data: {
      action: existingByEmail ? 'Administrator credentials reset via CLI' : 'Administrator account provisioned via CLI',
      entityType: 'User',
      entityId: admin.id,
      riskLevel: 'HIGH',
      details: { email: admin.email, forced: force },
    },
  }).catch(() => {
    // Audit logging must not block provisioning if the table is not ready yet.
  });

  console.log(`\n✅ Administrator account provisioned:`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Role: ${admin.role}`);
  console.log(`   Forced password change on first login: ${admin.mustChangePassword ? 'YES' : 'NO'}\n`);
}

createAdmin()
  .catch((e) => {
    console.error('❌ Failed to create administrator:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
