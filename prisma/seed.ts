/**
 * seed.ts  — Idempotent reference-data seed for ExamVault
 *
 * Safe to run at any time, on any environment, including against a database
 * that already has real student/payment data.  Uses upsert everywhere so
 * running it twice has no effect.
 *
 * DESTRUCTIVE RESET is a SEPARATE script: `npm run seed:reset`
 * That script refuses to run unless NODE_ENV !== 'production' AND the user
 * confirms interactively.
 */
import { PrismaClient, ProgramType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting idempotent reference-data seed for ExamVault …');

  // ── 1. System Settings ──────────────────────────────────────────────────────
  const settings = [
    { key: 'SEMESTER_PRICE_ETB', value: '50', description: 'Standard semester fee to unlock all courses in one ProgramTerm' },
    { key: 'TELEBIRR_RECEIVER_PHONE', value: '', description: 'Telebirr merchant / receiver phone (configurable by Admin)' },
    { key: 'TELEBIRR_RECEIVER_NAME', value: '', description: 'Account name shown to students (configurable by Admin)' },
    { key: 'CBE_ACCOUNT_NUMBER', value: '', description: 'Commercial Bank of Ethiopia account (configurable by Admin)' },
    { key: 'CBE_ACCOUNT_NAME', value: '', description: 'CBE account recipient name (configurable by Admin)' },
    { key: 'MAX_UPLOAD_SIZE_MB', value: '20', description: 'Maximum student contribution upload size in MB' },
    { key: 'MAX_SCREENSHOT_SIZE_MB', value: '5', description: 'Maximum payment screenshot upload size in MB' },
    { key: 'PAYMENT_VERIFICATION_SLA_HOURS', value: '2', description: 'Expected SLA in hours for payment verifiers' },
    { key: 'ANNOUNCEMENT_BANNER', value: 'Ambo University past exam papers archive is active.', description: 'Student portal banner text' },
    { key: 'ANNOUNCEMENT_ACTIVE', value: 'true', description: 'Whether the announcement banner is displayed' },
    { key: 'PAYMENT_INSTRUCTIONS', value: 'Transfer the exact semester unlock fee using Telebirr or CBE Birr. Include your Student ID in the transfer note and upload a clear screenshot of the receipt.', description: 'Instructions displayed to students at checkout' },
    { key: 'MAX_PAYOUT_LIMIT_ETB', value: '300', description: 'Maximum single payout approval limit for content buyback' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { description: s.description }, // never overwrite admin-set values
      create: s,
    });
  }
  console.log('✅ System Settings upserted');

  // ── 2. Campus ───────────────────────────────────────────────────────────────
  const amboCampus = await prisma.campus.upsert({
    where: { code: 'WOLISO' },
    update: {
      name: 'Ambo University',
    },
    create: {
      code: 'WOLISO',
      name: 'Ambo University',
      isActive: true,
    },
  });
  console.log('✅ Campus Ambo University upserted');

  // ── 3. Programs ─────────────────────────────────────────────────────────────
  const natSciProgram = await prisma.program.upsert({
    where: { campusId_code: { campusId: amboCampus.id, code: 'NAT_SCI' } },
    update: {},
    create: {
      campusId: amboCampus.id,
      code: 'NAT_SCI',
      name: 'Natural Science',
      type: ProgramType.STREAM,
      isActive: true,
    },
  });

  const socSciProgram = await prisma.program.upsert({
    where: { campusId_code: { campusId: amboCampus.id, code: 'SOC_SCI' } },
    update: {},
    create: {
      campusId: amboCampus.id,
      code: 'SOC_SCI',
      name: 'Social Science',
      type: ProgramType.STREAM,
      isActive: true,
    },
  });
  console.log('✅ Programs (NAT_SCI, SOC_SCI) upserted');

  // ── 4. Terms ────────────────────────────────────────────────────────────────
  const termY1S1 = await prisma.term.upsert({
    where: { yearNumber_semesterNumber: { yearNumber: 1, semesterNumber: 1 } },
    update: {},
    create: { yearNumber: 1, semesterNumber: 1, name: 'Year 1, Semester 1' },
  });

  const termY1S2 = await prisma.term.upsert({
    where: { yearNumber_semesterNumber: { yearNumber: 1, semesterNumber: 2 } },
    update: {},
    create: { yearNumber: 1, semesterNumber: 2, name: 'Year 1, Semester 2 (Coming Soon)' },
  });
  console.log('✅ Terms (Y1S1, Y1S2) upserted');

  // ── 5. ProgramTerms ─────────────────────────────────────────────────────────
  const natSciY1S1 = await prisma.programTerm.upsert({
    where: { programId_termId: { programId: natSciProgram.id, termId: termY1S1.id } },
    update: {},
    create: { programId: natSciProgram.id, termId: termY1S1.id, priceEtb: 50.00, isPurchasable: true },
  });

  const socSciY1S1 = await prisma.programTerm.upsert({
    where: { programId_termId: { programId: socSciProgram.id, termId: termY1S1.id } },
    update: {},
    create: { programId: socSciProgram.id, termId: termY1S1.id, priceEtb: 50.00, isPurchasable: true },
  });

  await prisma.programTerm.upsert({
    where: { programId_termId: { programId: natSciProgram.id, termId: termY1S2.id } },
    update: {},
    create: { programId: natSciProgram.id, termId: termY1S2.id, priceEtb: 50.00, isPurchasable: false },
  });

  await prisma.programTerm.upsert({
    where: { programId_termId: { programId: socSciProgram.id, termId: termY1S2.id } },
    update: {},
    create: { programId: socSciProgram.id, termId: termY1S2.id, priceEtb: 50.00, isPurchasable: false },
  });
  console.log('✅ ProgramTerms upserted');

  // ── 6. Courses ──────────────────────────────────────────────────────────────
  const courseData = [
    // Shared (3)
    { code: 'FLEn 1011', title: 'Communicative English Language Skills I', creditHours: 3 },
    { code: 'Phil 1011', title: 'Introduction to Logic and Critical Thinking', creditHours: 3 },
    { code: 'SPSC 1011', title: 'Physical Fitness', creditHours: 2 },
    // Natural Science specific (4)
    { code: 'Phys 1011', title: 'General Physics', creditHours: 3 },
    { code: 'GeES 1011', title: 'Geography of Ethiopia and the Horn', creditHours: 3 },
    { code: 'MATH 1011', title: 'Mathematics for Natural Sciences', creditHours: 3 },
    { code: 'Psyc 1011', title: 'General Psychology', creditHours: 3 },
    // Social Science specific (4)
    { code: 'Econ 1011', title: 'Economics', creditHours: 3 },
    { code: 'Anth 1012', title: 'Social Anthropology', creditHours: 2 },
    { code: 'EmTe 1012', title: 'Introduction to Emerging Technologies', creditHours: 3 },
    { code: 'MGMT 1012', title: 'Entrepreneurship', creditHours: 3 },
  ];

  const courses: Record<string, { id: string }> = {};
  for (const c of courseData) {
    const course = await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
    courses[c.code] = course;
  }
  console.log('✅ 11 Courses upserted');

  // ── 7. ProgramTermCourse mappings ────────────────────────────────────────────
  const natSciCodes = ['FLEn 1011', 'Phil 1011', 'SPSC 1011', 'Phys 1011', 'GeES 1011', 'MATH 1011', 'Psyc 1011'];
  const socSciCodes = ['FLEn 1011', 'Phil 1011', 'SPSC 1011', 'Econ 1011', 'Anth 1012', 'EmTe 1012', 'MGMT 1012'];

  for (const code of natSciCodes) {
    await prisma.programTermCourse.upsert({
      where: { programTermId_courseId: { programTermId: natSciY1S1.id, courseId: courses[code].id } },
      update: {},
      create: { programTermId: natSciY1S1.id, courseId: courses[code].id, isRequired: true },
    });
  }

  for (const code of socSciCodes) {
    await prisma.programTermCourse.upsert({
      where: { programTermId_courseId: { programTermId: socSciY1S1.id, courseId: courses[code].id } },
      update: {},
      create: { programTermId: socSciY1S1.id, courseId: courses[code].id, isRequired: true },
    });
  }
  console.log('✅ ProgramTermCourse mappings upserted (7 per stream)');

  console.log('\n🎉 Reference data seeded. No user accounts, payments, or papers were changed.');
  console.log('   Provision administrators with `npm run create-admin`.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
