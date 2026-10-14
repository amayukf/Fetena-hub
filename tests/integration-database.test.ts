import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, ProgramType, ExamType, PaperStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { verifyPaperAccess } from '../src/lib/access';
import { paperContributionSchema, paymentSubmissionSchema } from '../src/lib/validation';

// Use the isolated test database URL
const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://examvault_user:secret_password@localhost:5432/examvault_test_db?schema=public&connection_limit=3';

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
  },
});

describe('ExamVault Database Integration & Security Test Suite', () => {
  let campus: any;
  let natSciProgram: any;
  let socSciProgram: any;
  let natSciY1S1: any;
  let socSciY1S1: any;
  
  let cFLEn1011: any;
  let cMath1011: any;
  let cGeES1011: any;

  let paperFLEnShared: any;
  let paperMathNat: any;
  let paperGeESSoc: any;
  let paperFLEnDraft: any;

  let unpaidStudent: any;
  let natStudent: any;
  let socStudent: any;
  let suspendedStudent: any;
  let deletedStudent: any;

  beforeAll(async () => {
    // Clean all tables safely using TRUNCATE CASCADE
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "PaperViewLog", "AuditLog", "Notification", "WantedPaper", 
        "TermInterest", "PaperRequest", "ContributionFile", "PaperContribution", 
        "Entitlement", "Payment", "ExamPaper", "ProgramTermCourse", 
        "Course", "ProgramTerm", "Term", "Session", 
        "PasswordResetToken", "User", "Program", "Campus", "SystemSetting" 
      CASCADE;
    `);

    // 1. Campus
    campus = await prisma.campus.create({
      data: {
        code: 'WOLISO',
        name: 'Ambo University - Woliso Campus',
        isActive: true,
      },
    });

    // 2. Programs (Freshman Streams)
    natSciProgram = await prisma.program.create({
      data: {
        campusId: campus.id,
        code: 'NAT_SCI',
        name: 'Natural Science',
        type: ProgramType.STREAM,
        isActive: true,
      },
    });

    socSciProgram = await prisma.program.create({
      data: {
        campusId: campus.id,
        code: 'SOC_SCI',
        name: 'Social Science',
        type: ProgramType.STREAM,
        isActive: true,
      },
    });

    // 3. Term (Year 1, Semester 1)
    const term = await prisma.term.create({
      data: {
        yearNumber: 1,
        semesterNumber: 1,
        name: 'Year 1, Semester 1',
      },
    });

    // 4. ProgramTerms
    natSciY1S1 = await prisma.programTerm.create({
      data: {
        programId: natSciProgram.id,
        termId: term.id,
        priceEtb: 50.00,
        isPurchasable: true,
      },
    });

    socSciY1S1 = await prisma.programTerm.create({
      data: {
        programId: socSciProgram.id,
        termId: term.id,
        priceEtb: 50.00,
        isPurchasable: true,
      },
    });

    // 5. Courses:
    // - FLEn 1011: Shared across both streams
    // - Math 1011: Natural Science core only
    // - GeES 1011: Social Science core only
    cFLEn1011 = await prisma.course.create({
      data: {
        code: 'FLEn 1011',
        title: 'Communicative English Language Skills I',
        creditHours: 3,
        isActive: true,
      },
    });

    cMath1011 = await prisma.course.create({
      data: {
        code: 'Math 1011',
        title: 'Mathematics for Natural Sciences',
        creditHours: 3,
        isActive: true,
      },
    });

    cGeES1011 = await prisma.course.create({
      data: {
        code: 'GeES 1011',
        title: 'Geography of Ethiopia and the Horn',
        creditHours: 3,
        isActive: true,
      },
    });

    // Link FLEn 1011 to BOTH streams
    await prisma.programTermCourse.createMany({
      data: [
        { programTermId: natSciY1S1.id, courseId: cFLEn1011.id },
        { programTermId: socSciY1S1.id, courseId: cFLEn1011.id },
        // Link Math 1011 to Natural Science ONLY
        { programTermId: natSciY1S1.id, courseId: cMath1011.id },
        // Link GeES 1011 to Social Science ONLY
        { programTermId: socSciY1S1.id, courseId: cGeES1011.id },
      ],
    });

    // 6. Exam Papers
    paperFLEnShared = await prisma.examPaper.create({
      data: {
        courseId: cFLEn1011.id,
        campusId: campus.id,
        title: 'FLEn 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: 'published/flen1011_final_2015.pdf',
        sha256: 'sha256_flen1011_final_pub_001',
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    paperMathNat = await prisma.examPaper.create({
      data: {
        courseId: cMath1011.id,
        campusId: campus.id,
        title: 'Math 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: 'published/math1011_final_2015.pdf',
        sha256: 'sha256_math1011_final_pub_002',
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    paperGeESSoc = await prisma.examPaper.create({
      data: {
        courseId: cGeES1011.id,
        campusId: campus.id,
        title: 'GeES 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: 'published/gees1011_final_2015.pdf',
        sha256: 'sha256_gees1011_final_pub_003',
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    paperFLEnDraft = await prisma.examPaper.create({
      data: {
        courseId: cFLEn1011.id,
        campusId: campus.id,
        title: 'FLEn 1011 · Mid Exam 2016 E.C. (Draft In Review)',
        examType: ExamType.MID,
        examYearEc: 2016,
        storageKey: 'quarantine/flen1011_draft_2016.pdf',
        sha256: 'sha256_flen1011_draft_004',
        status: PaperStatus.DRAFT,
        isFreeSample: false,
      },
    });

    // 7. Users
    const pwdHash = '$2a$10$abcdefghijklmnopqrstuvwxyz123456';

    unpaidStudent = await prisma.user.create({
      data: {
        studentId: 'AMU-UNPAID-01',
        fullName: 'Unpaid Student User',
        email: 'unpaid@ambo.edu.et',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        isActive: true,
      },
    });

    natStudent = await prisma.user.create({
      data: {
        studentId: 'AMU-NAT-01',
        fullName: 'Abenezer Bekele (Natural Science)',
        email: 'abenezer@ambo.edu.et',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        programId: natSciProgram.id,
        isActive: true,
      },
    });

    socStudent = await prisma.user.create({
      data: {
        studentId: 'AMU-SOC-01',
        fullName: 'Mekdes Tadesse (Social Science)',
        email: 'mekdes@ambo.edu.et',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        programId: socSciProgram.id,
        isActive: true,
      },
    });

    suspendedStudent = await prisma.user.create({
      data: {
        studentId: 'AMU-SUSPEND-01',
        fullName: 'Suspended Student',
        email: 'suspended@ambo.edu.et',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        programId: natSciProgram.id,
        isActive: false, // Inactive / suspended
      },
    });

    deletedStudent = await prisma.user.create({
      data: {
        studentId: 'AMU-DELETED-01',
        fullName: 'Deleted Student',
        email: 'deleted@ambo.edu.et',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        programId: natSciProgram.id,
        isActive: true,
        deletedAt: new Date(), // Soft deleted
      },
    });

    // 8. Grant Entitlements
    // Natural Science student buys natSciY1S1
    await prisma.entitlement.create({
      data: {
        userId: natStudent.id,
        programTermId: natSciY1S1.id,
        isActive: true,
      },
    });

    // Social Science student buys socSciY1S1
    await prisma.entitlement.create({
      data: {
        userId: socStudent.id,
        programTermId: socSciY1S1.id,
        isActive: true,
      },
    });

    // Suspended and deleted students also held entitlements prior to suspension/deletion
    await prisma.entitlement.createMany({
      data: [
        { userId: suspendedStudent.id, programTermId: natSciY1S1.id, isActive: true },
        { userId: deletedStudent.id, programTermId: natSciY1S1.id, isActive: true },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to test paper access via server function with real DB entities
  async function checkUserPaperAccess(userId: string, paperId: string) {
    const [user, paper, entitlements] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true, deletedAt: true },
      }),
      prisma.examPaper.findUnique({
        where: { id: paperId },
        include: { course: true },
      }),
      prisma.entitlement.findMany({
        where: { userId, isActive: true },
        include: { programTerm: { include: { courses: true } } },
      }),
    ]);

    const entitlementContexts = entitlements.map((e) => ({
      userId: e.userId,
      isActive: e.isActive,
      validUntil: e.validUntil ? e.validUntil.toISOString() : null,
      courseIds: e.programTerm.courses.map((c) => c.courseId),
    }));

    return verifyPaperAccess(
      user ? { ...user, deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null } : null,
      paper
        ? {
            id: paper.id,
            courseId: paper.courseId,
            status: paper.status,
            isFreeSample: paper.isFreeSample,
            deletedAt: paper.deletedAt ? paper.deletedAt.toISOString() : null,
            course: {
              id: paper.course.id,
              isActive: paper.course.isActive,
              deletedAt: paper.course.deletedAt ? paper.course.deletedAt.toISOString() : null,
            },
          }
        : null,
      entitlementContexts
    );
  }

  // -------------------------------------------------------------
  // TEST 1: Unpaid student cannot open any paper
  // -------------------------------------------------------------
  it('1. Unpaid student cannot open any paper', async () => {
    const resFLEn = await checkUserPaperAccess(unpaidStudent.id, paperFLEnShared.id);
    expect(resFLEn.allowed).toBe(false);
    expect(resFLEn.reason).toBe('NO_ACTIVE_ENTITLEMENT');

    const resMath = await checkUserPaperAccess(unpaidStudent.id, paperMathNat.id);
    expect(resMath.allowed).toBe(false);
    expect(resMath.reason).toBe('NO_ACTIVE_ENTITLEMENT');

    const resGeES = await checkUserPaperAccess(unpaidStudent.id, paperGeESSoc.id);
    expect(resGeES.allowed).toBe(false);
    expect(resGeES.reason).toBe('NO_ACTIVE_ENTITLEMENT');
  });

  // -------------------------------------------------------------
  // TEST 2: Paid Natural Science student permissions
  // Can open FLEn 1011 (shared) and Math 1011 (Natural), but CANNOT open GeES 1011 (Social)
  // -------------------------------------------------------------
  it('2. Paid Natural Science student can open FLEn 1011 (shared) and Math 1011 (Natural), but cannot open GeES 1011 (Social)', async () => {
    // Shared course access
    const resFLEn = await checkUserPaperAccess(natStudent.id, paperFLEnShared.id);
    expect(resFLEn.allowed).toBe(true);

    // Natural Science core course access
    const resMath = await checkUserPaperAccess(natStudent.id, paperMathNat.id);
    expect(resMath.allowed).toBe(true);

    // Social Science core course access => MUST BE DENIED
    const resGeES = await checkUserPaperAccess(natStudent.id, paperGeESSoc.id);
    expect(resGeES.allowed).toBe(false);
    expect(resGeES.reason).toBe('NO_ACTIVE_ENTITLEMENT');
  });

  // -------------------------------------------------------------
  // TEST 3: Paid Social Science student permissions
  // Can open FLEn 1011 (shared) and GeES 1011 (Social), but CANNOT open Math 1011 (Natural)
  // -------------------------------------------------------------
  it('3. Paid Social Science student can open FLEn 1011 (shared) and GeES 1011 (Social), but cannot open Math 1011 (Natural)', async () => {
    // Shared course access
    const resFLEn = await checkUserPaperAccess(socStudent.id, paperFLEnShared.id);
    expect(resFLEn.allowed).toBe(true);

    // Social Science core course access
    const resGeES = await checkUserPaperAccess(socStudent.id, paperGeESSoc.id);
    expect(resGeES.allowed).toBe(true);

    // Natural Science core course access => MUST BE DENIED
    const resMath = await checkUserPaperAccess(socStudent.id, paperMathNat.id);
    expect(resMath.allowed).toBe(false);
    expect(resMath.reason).toBe('NO_ACTIVE_ENTITLEMENT');
  });

  // -------------------------------------------------------------
  // TEST 4: Unpublished paper (draft or quarantined) cannot be opened even by a paid student
  // -------------------------------------------------------------
  it('4. Unpublished paper (draft or quarantined) cannot be opened even by a paid student', async () => {
    // Even though natStudent has paid for FLEn 1011's semester, the DRAFT paper is denied
    const resDraft = await checkUserPaperAccess(natStudent.id, paperFLEnDraft.id);
    expect(resDraft.allowed).toBe(false);
    expect(resDraft.reason).toBe('PAPER_NOT_PUBLISHED');
  });

  // -------------------------------------------------------------
  // TEST 5: Suspended or soft-deleted student cannot open any paper, even with an active entitlement
  // -------------------------------------------------------------
  it('5. Suspended or soft-deleted student cannot open any paper, even with an active entitlement', async () => {
    // Suspended student (isActive = false)
    const resSuspended = await checkUserPaperAccess(suspendedStudent.id, paperMathNat.id);
    expect(resSuspended.allowed).toBe(false);
    expect(resSuspended.reason).toBe('USER_INACTIVE');

    // Soft-deleted student (deletedAt != null)
    const resDeleted = await checkUserPaperAccess(deletedStudent.id, paperMathNat.id);
    expect(resDeleted.allowed).toBe(false);
    expect(resDeleted.reason).toBe('USER_DELETED');
  });

  // -------------------------------------------------------------
  // TEST 6: Replaying a transaction reference fails (unique constraint)
  // -------------------------------------------------------------
  it('6. Replaying a transaction reference fails due to database unique constraint', async () => {
    const replayTxId = 'TB_TEST_REPLAY_TX_001';

    // 1. Initial payment creation succeeds
    await prisma.payment.create({
      data: {
        referenceCode: 'EV-2026-TEST-01',
        userId: natStudent.id,
        programTermId: natSciY1S1.id,
        amountEtb: 50.00,
        paymentMethod: PaymentMethod.TELEBIRR,
        transactionId: replayTxId,
        status: PaymentStatus.APPROVED,
      },
    });

    // 2. Replay attempt with same (paymentMethod, transactionId) MUST FAIL at database level
    await expect(
      prisma.payment.create({
        data: {
          referenceCode: 'EV-2026-TEST-02',
          userId: socStudent.id,
          programTermId: socSciY1S1.id,
          amountEtb: 50.00,
          paymentMethod: PaymentMethod.TELEBIRR,
          transactionId: replayTxId, // Duplicate transaction reference
          status: PaymentStatus.PENDING,
        },
      })
    ).rejects.toThrow();

    // 3. Partial unique index test: user cannot have multiple PENDING payments for the same term
    await prisma.payment.create({
      data: {
        referenceCode: 'EV-2026-TEST-03',
        userId: unpaidStudent.id,
        programTermId: natSciY1S1.id,
        amountEtb: 50.00,
        paymentMethod: PaymentMethod.CBE_BIRR,
        transactionId: 'CBE_PENDING_01',
        status: PaymentStatus.PENDING,
      },
    });

    // Attempting a second PENDING payment for unpaidStudent on natSciY1S1 fails via partial unique index
    await expect(
      prisma.payment.create({
        data: {
          referenceCode: 'EV-2026-TEST-04',
          userId: unpaidStudent.id,
          programTermId: natSciY1S1.id,
          amountEtb: 50.00,
          paymentMethod: PaymentMethod.BANK_TRANSFER,
          transactionId: 'BANK_PENDING_02',
          status: PaymentStatus.PENDING,
        },
      })
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------
  // TEST 7: Paper contribution with future exam date is rejected
  // -------------------------------------------------------------
  it('7. Paper contribution with future exam date is rejected', () => {
    // 1. Future date payload
    const futureDate = '2030-06-15';
    const futurePayload = {
      courseId: cFLEn1011.id,
      examType: 'FINAL' as const,
      academicYear: 2026,
      examDate: futureDate,
      declarationAccepted: true,
      payoutPaymentMethod: 'TELEBIRR' as const,
      payoutAccount: '0900 000 042',
      proposedPayoutEtb: 100,
    };

    const futureResult = paperContributionSchema.safeParse(futurePayload);
    expect(futureResult.success).toBe(false);
    if (!futureResult.success) {
      expect(futureResult.error.issues[0].message).toContain('strictly in the past (< today)');
    }

    // 2. Unaccepted declaration payload
    const unacceptedDeclPayload = {
      ...futurePayload,
      examDate: '2023-06-15', // Past date
      declarationAccepted: false, // Refused declaration
    };

    const declResult = paperContributionSchema.safeParse(unacceptedDeclPayload);
    expect(declResult.success).toBe(false);
    if (!declResult.success) {
      expect(declResult.error.issues[0].message).toContain('Honor declaration must be accepted');
    }

    // 3. Valid historical payload
    const validPayload = {
      ...futurePayload,
      examDate: '2023-06-15',
      declarationAccepted: true,
    };
    const validResult = paperContributionSchema.safeParse(validPayload);
    expect(validResult.success).toBe(true);
  });

  // -------------------------------------------------------------
  // TEST 8: Any attempt to UPDATE or DELETE an AuditLog row throws an error at the database level
  // -------------------------------------------------------------
  it('8. Any attempt to UPDATE or DELETE an AuditLog row throws an error at the database level (PostgreSQL Trigger)', async () => {
    // 1. Insert an audit log row
    const auditRow = await prisma.auditLog.create({
      data: {
        action: 'System Security Initialization',
        entityType: 'System',
        actorId: null,
        riskLevel: 'LOW',
        details: { description: 'Audit log integrity benchmark' },
      },
    });

    expect(auditRow.id).toBeDefined();

    // 2. Attempt to UPDATE the AuditLog row => Trigger MUST throw exception
    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE "AuditLog" SET "action" = $1 WHERE "id" = $2',
        'Tampered Action By Intruder',
        auditRow.id
      )
    ).rejects.toThrow(/UPDATE and DELETE operations are strictly forbidden/);

    // 3. Attempt to DELETE the AuditLog row => Trigger MUST throw exception
    await expect(
      prisma.$executeRawUnsafe(
        'DELETE FROM "AuditLog" WHERE "id" = $1',
        auditRow.id
      )
    ).rejects.toThrow(/UPDATE and DELETE operations are strictly forbidden/);

    // 4. Verify identical immutability trigger protects PaperViewLog
    const viewRow = await prisma.paperViewLog.create({
      data: {
        examPaperId: paperFLEnShared.id,
        userId: natStudent.id,
        ipAddress: '197.156.102.10',
        userAgent: 'Mozilla/5.0 Integration Test',
      },
    });

    await expect(
      prisma.$executeRawUnsafe(
        'UPDATE "PaperViewLog" SET "ipAddress" = $1 WHERE "id" = $2',
        '10.0.0.1',
        viewRow.id
      )
    ).rejects.toThrow(/UPDATE and DELETE operations are strictly forbidden/);

    await expect(
      prisma.$executeRawUnsafe(
        'DELETE FROM "PaperViewLog" WHERE "id" = $1',
        viewRow.id
      )
    ).rejects.toThrow(/UPDATE and DELETE operations are strictly forbidden/);
  });
});
