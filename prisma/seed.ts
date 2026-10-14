import { PrismaClient, Role, ProgramType, ExamType, ScanQuality, PaperStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting ExamVault Database Seed for Ambo University - Woliso Campus...');

  // 1. Clean existing records safely (Use TRUNCATE CASCADE to handle immutability triggers and foreign keys)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "PaperViewLog", "AuditLog", "Notification", "WantedPaper", 
      "TermInterest", "PaperRequest", "ContributionFile", "PaperContribution", 
      "Entitlement", "Payment", "ExamPaper", "ProgramTermCourse", 
      "Course", "ProgramTerm", "Term", "Session", 
      "PasswordResetToken", "User", "Program", "Campus", "SystemSetting" 
    CASCADE;
  `);

  // 2. System Settings (Using clearly fake placeholder values as required)
  await prisma.systemSetting.createMany({
    data: [
      { key: 'SEMESTER_PRICE_ETB', value: '50', description: 'Standard semester fee to unlock all courses in one ProgramTerm' },
      { key: 'TELEBIRR_RECEIVER_PHONE', value: '0900 000 000', description: 'Telebirr merchant / receiver phone (Placeholder)' },
      { key: 'TELEBIRR_RECEIVER_NAME', value: 'Ambo University Woliso Campus (Placeholder)', description: 'Account name shown to students' },
      { key: 'CBE_ACCOUNT_NUMBER', value: '1000 0000 0000 0', description: 'Commercial Bank of Ethiopia account (Placeholder)' },
      { key: 'CBE_ACCOUNT_NAME', value: 'Ambo University Woliso Campus (Placeholder)', description: 'CBE account recipient name' },
      { key: 'MAX_UPLOAD_SIZE_MB', value: '20', description: 'Maximum student contribution upload size in MB' },
    ],
  });

  // 3. Campus (Ambo University - Woliso Campus)
  const wolisoCampus = await prisma.campus.create({
    data: {
      code: 'WOLISO',
      name: 'Ambo University - Woliso Campus',
      isActive: true,
    },
  });

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

  console.log('✅ Created Campus WOLISO and Freshman Streams (Natural Science & Social Science)');

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

  console.log('✅ Linked 7 courses to Natural Science Y1S1 and 7 courses to Social Science Y1S1');

  // 9. CONDITIONAL USER SEEDING: ONLY in development environment
  const isDev = (process.env.NODE_ENV || 'development') === 'development';
  if (!isDev) {
    console.log('🔒 Production mode: Skipping test users and default credentials. Seed complete.');
    return;
  }

  console.log('🧪 Development mode: Seeding test users, sample papers, and sample entitlement...');

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  const adminUser = await prisma.user.create({
    data: {
      studentId: 'AMU-ADMIN-01',
      fullName: 'Ambo University Admin',
      email: 'admin@examvault.edu.et',
      phone: '+251911000001',
      passwordHash: defaultPasswordHash,
      role: Role.ADMIN,
      canSell: false,
    },
  });

  const verifierUser = await prisma.user.create({
    data: {
      studentId: 'AMU-VERIFY-01',
      fullName: 'Hana K. Verifier',
      email: 'verifier@examvault.edu.et',
      phone: '+251911000002',
      passwordHash: defaultPasswordHash,
      role: Role.PAYMENT_VERIFIER,
      canSell: false,
    },
  });

  const contentManagerUser = await prisma.user.create({
    data: {
      studentId: 'AMU-CONTENT-01',
      fullName: 'Dawit M. Content Lead',
      email: 'content@examvault.edu.et',
      phone: '+251911000003',
      passwordHash: defaultPasswordHash,
      role: Role.CONTENT_MANAGER,
      canSell: false,
    },
  });

  const natStudent = await prisma.user.create({
    data: {
      studentId: 'AMU-2026-0042',
      fullName: 'Abenezer Bekele',
      email: 'abenezer@example.com',
      phone: '+251911234821',
      passwordHash: defaultPasswordHash,
      role: Role.STUDENT,
      programId: natSciProgram.id,
      currentYear: 1,
      canSell: true,
    },
  });

  const socStudent = await prisma.user.create({
    data: {
      studentId: 'AMU-2026-0099',
      fullName: 'Mekdes Tadesse',
      email: 'mekdes@example.com',
      phone: '+251922112233',
      passwordHash: defaultPasswordHash,
      role: Role.STUDENT,
      programId: socSciProgram.id,
      currentYear: 1,
      canSell: true,
    },
  });

  // 10. Sample Exam Papers
  // Shared Course: FLEn 1011 (Accessible by both streams)
  await prisma.examPaper.create({
    data: {
      courseId: cFLEn1011.id,
      campusId: wolisoCampus.id,
      title: 'FLEn 1011 · Final Exam 2015 E.C.',
      examType: ExamType.FINAL,
      examYearEc: 2015,
      quality: ScanQuality.EXCELLENT,
      pageCount: 6,
      storageKey: 'published/flen1011/final-2015-ec.pdf',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      fileSizeBytes: 1850000,
      isFreeSample: false,
      status: PaperStatus.PUBLISHED,
      uploadedById: contentManagerUser.id,
    },
  });

  await prisma.examPaper.create({
    data: {
      courseId: cFLEn1011.id,
      campusId: wolisoCampus.id,
      title: 'FLEn 1011 · Mid Exam 2015 E.C. (Free Sample)',
      examType: ExamType.MID,
      examYearEc: 2015,
      quality: ScanQuality.GOOD,
      pageCount: 4,
      storageKey: 'published/flen1011/mid-2015-ec-sample.pdf',
      sha256: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
      fileSizeBytes: 1200000,
      isFreeSample: true, // Free sample
      status: PaperStatus.PUBLISHED,
      uploadedById: contentManagerUser.id,
    },
  });

  // Natural Science Specific: Phys 1011
  await prisma.examPaper.create({
    data: {
      courseId: cPhys1011.id,
      campusId: wolisoCampus.id,
      title: 'Phys 1011 · Final Exam 2015 E.C.',
      examType: ExamType.FINAL,
      examYearEc: 2015,
      quality: ScanQuality.EXCELLENT,
      pageCount: 8,
      storageKey: 'published/phys1011/final-2015-ec.pdf',
      sha256: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
      fileSizeBytes: 2450000,
      isFreeSample: false,
      status: PaperStatus.PUBLISHED,
      uploadedById: contentManagerUser.id,
    },
  });

  // Social Science Specific: Econ 1011
  await prisma.examPaper.create({
    data: {
      courseId: cEcon1011.id,
      campusId: wolisoCampus.id,
      title: 'Econ 1011 · Final Exam 2015 E.C.',
      examType: ExamType.FINAL,
      examYearEc: 2015,
      quality: ScanQuality.EXCELLENT,
      pageCount: 7,
      storageKey: 'published/econ1011/final-2015-ec.pdf',
      sha256: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      fileSizeBytes: 2100000,
      isFreeSample: false,
      status: PaperStatus.PUBLISHED,
      uploadedById: contentManagerUser.id,
    },
  });

  // 11. Entitlement & Payment for Abenezer Bekele (Natural Science Student)
  const approvedPayment = await prisma.payment.create({
    data: {
      referenceCode: 'EV-2026-0842',
      userId: natStudent.id,
      programTermId: natSciY1S1.id,
      amountEtb: 50.00,
      paymentMethod: PaymentMethod.TELEBIRR,
      transactionId: 'TB9X2P44',
      screenshotKey: 'payments/proof-tb9x2p44.jpg',
      screenshotSha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      status: PaymentStatus.APPROVED,
      reviewedById: verifierUser.id,
      reviewedAt: new Date(),
    },
  });

  await prisma.entitlement.create({
    data: {
      userId: natStudent.id,
      programTermId: natSciY1S1.id,
      paymentId: approvedPayment.id,
      grantedById: verifierUser.id,
      isActive: true,
    },
  });

  console.log('🎉 Development seed completed with test users, sample papers, and active entitlement!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
