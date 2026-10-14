import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL || process.argv[2];
  const password = process.env.ADMIN_INITIAL_PASSWORD || process.argv[3];

  if (!email || !password) {
    console.log('\n❌ Usage: npm run create-admin <email> <password>');
    console.log('   Or set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in your .env file.\n');
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { role: Role.ADMIN }] },
  });

  if (existing && existing.role === Role.ADMIN && existing.email !== email) {
    console.log(`⚠️ An administrator account already exists (${existing.email}). System policy allows only 1 primary administrator.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: Role.ADMIN,
      mustChangePassword: true,
      isActive: true,
    },
    create: {
      studentId: 'AMU-ADMIN-01',
      fullName: 'System Administrator',
      email,
      passwordHash,
      role: Role.ADMIN,
      mustChangePassword: true,
      canSell: false,
    },
  });

  console.log(`\n✅ Administrator account successfully provisioned:`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Role: ${admin.role}`);
  console.log(`   Forced Password Change on first login: ${admin.mustChangePassword ? 'YES' : 'NO'}\n`);
}

createAdmin()
  .catch((e) => {
    console.error('❌ Failed to create administrator:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
