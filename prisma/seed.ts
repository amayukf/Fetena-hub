import { PrismaClient, Role, ProgramType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Pure Reference Database Seed for ExamVault (Ambo University - Woliso Campus)...');

  // 1. Clean existing records safely (Use TRUNCATE CASCADE to handle immutability triggers and foreign keys)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "PaperViewLog", "AuditLog", "Notification", "WantedPaper", 
      "TermInterest", "PaperRequest", "ContributionFile", "PaperContribution", 
      "Entitlement", "Payment", "ExamPaper", "ProgramTermCourse", 
      "Course", "ProgramTerm", "Term", "Session", 
      "PasswordResetToken", "User", "Program", "Campus", "SystemSetting", "RateLimit"
    CASCADE;
  `);

  // 2. Reference System Settings (Clean production defaults with empty placeholders for payment accounts)
  await prisma.systemSetting.createMany({
    data: [
      { key: 'SEMESTER_PRICE_ETB', value: '50', description: 'Standard semester fee to unlock all courses in one ProgramTerm' },
      { key: 'TELEBIRR_RECEIVER_PHONE', value: '', description: 'Telebirr merchant / receiver phone (Configurable by Admin)' },
      { key: 'TELEBIRR_RECEIVER_NAME', value: '', description: 'Account name shown to students (Configurable by Admin)' },
      { key: 'CBE_ACCOUNT_NUMBER', value: '', description: 'Commercial Bank of Ethiopia account (Configurable by Admin)' },
      { key: 'CBE_ACCOUNT_NAME', value: '', description: 'CBE account recipient name (Configurable by Admin)' },
      { key: 'MAX_UPLOAD_SIZE_MB', value: '20', description: 'Maximum student contribution upload size in MB' },
      { key: 'MAX_SCREENSHOT_SIZE_MB', value: '5', description: 'Maximum payment screenshot upload size in MB' },
      { key: 'PAYMENT_VERIFICATION_SLA_HOURS', value: '2', description: 'Expected SLA in hours for payment verifiers' },
      { key: 'ANNOUNCEMENT_BANNER', value: 'Ambo University Woliso Campus past exam papers archive is active.', description: 'Student portal banner text' },
      { key: 'ANNOUNCEMENT_ACTIVE', value: 'true', description: 'Whether the announcement banner is displayed' },
      { key: 'PAYMENT_INSTRUCTIONS', value: 'Transfer the exact semester unlock fee using Telebirr or CBE Birr. Include your Student ID in the transfer note and upload a clear screenshot of the receipt.', description: 'Instructions displayed to students at checkout' },
      { key: 'MAX_PAYOUT_LIMIT_ETB', value: '300', description: 'Maximum single payout approval limit for content buyback' },
    ],
  });
  console.log('✅ Created System Settings reference records');

  // 3. Campus (Ambo University - Woliso Campus)
  const wolisoCampus = await prisma.campus.create({
    data: {
      code: 'WOLISO',
      name: 'Ambo University - Woliso Campus',
      isActive: true,
    },
  });
  console.log('✅ Created Campus WOLISO');

  // 4. Programs (Freshman Streams)
  const natSciProgram = await prisma.program.create({
    data: {
      campusId: wolisoCampus.id,
      code: 'NAT_SCI',
      name: 'Natural Science',
      type: ProgramType.STREAM,
      isActive: true,
    },
  });

  const socSciProgram = await prisma.program.create({
    data: {
      campusId: wolisoCampus.id,
      code: 'SOC_SCI',
      name: 'Social Science',
      type: ProgramType.STREAM,
      isActive: true,
    },
  });
  console.log('✅ Created Freshman Streams (NAT_SCI and SOC_SCI)');

  // 5. Terms (Freshman Year 1)
  const termY1S1 = await prisma.term.create({
    data: {
      yearNumber: 1,
      semesterNumber: 1,
      name: 'Year 1, Semester 1',
    },
  });

  const termY1S2 = await prisma.term.create({
    data: {
      yearNumber: 1,
      semesterNumber: 2,
      name: 'Year 1, Semester 2 (Coming Soon)',
    },
  });

  // 6. ProgramTerms:
  // - Year 1 Semester 1: purchasable, 50 ETB
  // - Year 1 Semester 2: not purchasable (coming soon), 0 courses
  const natSciY1S1 = await prisma.programTerm.create({
    data: {
      programId: natSciProgram.id,
      termId: termY1S1.id,
      priceEtb: 50.00,
      isPurchasable: true,
    },
  });

  const socSciY1S1 = await prisma.programTerm.create({
    data: {
      programId: socSciProgram.id,
      termId: termY1S1.id,
      priceEtb: 50.00,
      isPurchasable: true,
    },
  });

  await prisma.programTerm.create({
    data: {
      programId: natSciProgram.id,
      termId: termY1S2.id,
      priceEtb: 50.00,
      isPurchasable: false, // Coming soon
    },
  });

  await prisma.programTerm.create({
    data: {
      programId: socSciProgram.id,
      termId: termY1S2.id,
      priceEtb: 50.00,
      isPurchasable: false, // Coming soon
    },
  });
  console.log('✅ Created ProgramTerms (Y1S1 purchasable at 50 ETB; Y1S2 non-purchasable coming soon)');

  // 7. Seed 11 Unique Courses (Normalized format)
  // Shared Courses (3, single record each):
  const cFLEn1011 = await prisma.course.create({
    data: { code: 'FLEn 1011', title: 'Communicative English Language Skills I', creditHours: 3 },
  });
  const cPhil1011 = await prisma.course.create({
    data: { code: 'Phil 1011', title: 'Introduction to Logic and Critical Thinking', creditHours: 3 },
  });
  const cSPSC1011 = await prisma.course.create({
    data: { code: 'SPSC 1011', title: 'Physical Fitness', creditHours: 2 },
  });

  // Natural Science Specific Courses (4):
  const cPhys1011 = await prisma.course.create({
    data: { code: 'Phys 1011', title: 'General Physics', creditHours: 3 },
  });
  const cGeES1011 = await prisma.course.create({
    data: { code: 'GeES 1011', title: 'Geography of Ethiopia and the Horn', creditHours: 3 },
  });
  const cMath1011 = await prisma.course.create({
    data: { code: 'MATH 1011', title: 'Mathematics for Natural Sciences', creditHours: 3 },
  });
  const cPsyc1011 = await prisma.course.create({
    data: { code: 'Psyc 1011', title: 'General Psychology', creditHours: 3 },
  });

  // Social Science Specific Courses (4):
  const cEcon1011 = await prisma.course.create({
    data: { code: 'Econ 1011', title: 'Economics', creditHours: 3 },
  });
  const cAnth1012 = await prisma.course.create({
    data: { code: 'Anth 1012', title: 'Social Anthropology', creditHours: 2 },
  });
  const cEmTe1012 = await prisma.course.create({
    data: { code: 'EmTe 1012', title: 'Introduction to Emerging Technologies', creditHours: 3 },
  });
  const cMgmt1012 = await prisma.course.create({
    data: { code: 'MGMT 1012', title: 'Entrepreneurship', creditHours: 3 },
  });

  console.log('✅ Created 11 Unique Courses (3 shared, 4 Natural Science, 4 Social Science)');

  // 8. ProgramTermCourse Mappings (Y1S1 only)
  // Natural Science Y1S1: 7 courses (3 shared + 4 specific)
  for (const c of [cFLEn1011, cPhil1011, cSPSC1011, cPhys1011, cGeES1011, cMath1011, cPsyc1011]) {
    await prisma.programTermCourse.create({
      data: { programTermId: natSciY1S1.id, courseId: c.id, isRequired: true },
    });
  }

  // Social Science Y1S1: 7 courses (3 shared + 4 specific)
  for (const c of [cFLEn1011, cPhil1011, cSPSC1011, cEcon1011, cAnth1012, cEmTe1012, cMgmt1012]) {
    await prisma.programTermCourse.create({
      data: { programTermId: socSciY1S1.id, courseId: c.id, isRequired: true },
    });
  }
  console.log('✅ Linked 7 courses to Natural Science Y1S1 and 7 courses to Social Science Y1S1 (Y1S2 has 0 courses)');

  // 9. FIRST ADMIN CREATION (From environment variables only)
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD?.trim();

  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.user.create({
      data: {
        studentId: 'AMU-ADMIN-01',
        fullName: 'System Administrator',
        email: adminEmail,
        passwordHash,
        role: Role.ADMIN,
        mustChangePassword: true,
        canSell: false,
      },
    });
    console.log(`✅ Created first ADMIN (${admin.email}) with forced password change on first login.`);
  } else {
    console.log(
      '⚠️ ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD environment variables are not set.\n' +
      '   No default admin account was created.\n' +
      '   Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in your .env file or run "npm run create-admin".'
    );
  }

  console.log('🎉 Pure reference data seed complete. No mock papers, payments, or students created.');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
