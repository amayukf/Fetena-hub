import { PrismaClient, Role, PaymentMethod, PaymentStatus, ExamType, ScanQuality, PaperStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedDev() {
  if (process.env.NODE_ENV === 'production') {
    console.error('⛔ FATAL: seedDev cannot be run in production mode (NODE_ENV=production). Aborting.');
    process.exit(1);
  }

  // SECURITY: this seed creates accounts whose password is committed in source
  // and prints every credential to the console. Guard it behind an explicit
  // acknowledgement and refuse to run against a production-looking database.
  const databaseName = (() => {
    try {
      return new URL(process.env.DATABASE_URL || '').pathname.replace(/^\/+/, '');
    } catch {
      return '';
    }
  })();

  if (/prod/i.test(databaseName)) {
    console.error(
      `⛔ FATAL: DATABASE_URL points at "${databaseName}". Refusing to seed dev fixtures into a production-looking database.`
    );
    process.exit(1);
  }

  if (process.env.SEED_DEV_CONFIRM !== 'yes') {
    console.error(
      '⛔ seedDev creates test accounts with a well-known password and prints them to the console.\n' +
        '   Set SEED_DEV_CONFIRM=yes to confirm this is a local development database.'
    );
    process.exit(1);
  }

  console.log('🧪 Starting Dev Seed: Provisioning local testing accounts for each role...');

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // Find campus and programs
  const campus = (await prisma.campus.findFirst({ where: { code: { in: ['AMBO', 'WOLISO'] } } })) || (await prisma.campus.findFirst());
  const natProgram = await prisma.program.findFirst({ where: { code: 'NAT_SCI' } });
  const socProgram = await prisma.program.findFirst({ where: { code: 'SOC_SCI' } });

  if (!campus || !natProgram || !socProgram) {
    console.error('❌ Base reference seed not found. Please run "npm run seed" first.');
    process.exit(1);
  }

  // 1. Dev Admin
  await prisma.user.upsert({
    where: { email: 'admin@test.local' },
    update: {},
    create: {
      studentId: 'DEV-ADMIN-01',
      fullName: 'Dev Administrator',
      email: 'admin@test.local',
      phone: '+251911990001',
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      mustChangePassword: false,
      canSell: false,
    },
  });

  // 2. Dev Payment Verifier
  await prisma.user.upsert({
    where: { email: 'verifier@test.local' },
    update: {},
    create: {
      studentId: 'DEV-VERIFIER-01',
      fullName: 'Dev Payment Verifier',
      email: 'verifier@test.local',
      phone: '+251911990002',
      passwordHash: defaultPasswordHash,
      role: Role.PAYMENT_VERIFIER,
      mustChangePassword: false,
      canSell: false,
    },
  });

  // 3. Dev Content Manager
  await prisma.user.upsert({
    where: { email: 'content@test.local' },
    update: {},
    create: {
      studentId: 'DEV-CONTENT-01',
      fullName: 'Dev Content Manager',
      email: 'content@test.local',
      phone: '+251911990003',
      passwordHash: defaultPasswordHash,
      role: Role.CONTENT_MANAGER,
      mustChangePassword: false,
      canSell: false,
    },
  });

  // 4. Dev Natural Science Student
  await prisma.user.upsert({
    where: { email: 'student.nat@test.local' },
    update: {},
    create: {
      studentId: 'DEV-NAT-001',
      fullName: 'Dev Student Natural',
      email: 'student.nat@test.local',
      phone: '+251911990004',
      passwordHash: defaultPasswordHash,
      role: Role.STUDENT,
      programId: natProgram.id,
      currentYear: 1,
      canSell: true,
      mustChangePassword: false,
    },
  });

  // 5. Dev Social Science Student
  await prisma.user.upsert({
    where: { email: 'student.soc@test.local' },
    update: {},
    create: {
      studentId: 'DEV-SOC-001',
      fullName: 'Dev Student Social',
      email: 'student.soc@test.local',
      phone: '+251911990005',
      passwordHash: defaultPasswordHash,
      role: Role.STUDENT,
      programId: socProgram.id,
      currentYear: 1,
      canSell: true,
      mustChangePassword: false,
    },
  });

  console.log('✅ Dev test accounts created:');
  console.log('   - Admin:            admin@test.local / Password123!');
  console.log('   - Payment Verifier: verifier@test.local / Password123!');
  console.log('   - Content Manager:  content@test.local / Password123!');
  console.log('   - Student (Nat):    student.nat@test.local / Password123!');
  console.log('   - Student (Soc):    student.soc@test.local / Password123!');
}

seedDev()
  .catch((e) => {
    console.error('❌ Dev seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
