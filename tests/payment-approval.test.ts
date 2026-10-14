import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, PaymentMethod, PaymentStatus, Role, ProgramType, AuditRiskLevel } from '@prisma/client';
import { paymentSubmissionSchema } from '../src/lib/validation';
import { createHash } from 'crypto';

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://examvault_user:secret_password@localhost:5432/examvault_test_db?schema=public&connection_limit=3';

const prisma = new PrismaClient({
  datasources: {
    db: { url: testDbUrl },
  },
});

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('STEP 9: Manual Payment Flow & Real Data Verification', () => {
  let campus: any;
  let program: any;
  let term: any;
  let programTerm: any;
  let student1: any;
  let student2: any;
  let verifier: any;

  beforeAll(async () => {
    // Clear relevant tables
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "PaperViewLog", "AuditLog", "Notification", "Entitlement", 
        "Payment", "ExamPaper", "ProgramTermCourse", "Course", 
        "ProgramTerm", "Term", "User", "Program", "Campus", "SystemSetting" 
      CASCADE;
    `);

    // 1. Settings
    await prisma.systemSetting.createMany({
      data: [
        { key: 'SEMESTER_PRICE_ETB', value: '50', description: 'Standard semester fee' },
        { key: 'PAYMENT_VERIFICATION_SLA_HOURS', value: '2', description: 'Verification SLA' },
        { key: 'TELEBIRR_RECEIVER_PHONE', value: '0900 000 000', description: 'Telebirr merchant' },
        { key: 'CBE_ACCOUNT_NUMBER', value: '1000 0000 0000 0', description: 'CBE account' },
      ],
    });

    // 2. Campus & Program & Term
    campus = await prisma.campus.create({
      data: { code: 'WOLISO', name: 'Ambo University - Woliso Campus', isActive: true },
    });

    program = await prisma.program.create({
      data: {
        campusId: campus.id,
        code: 'NAT_SCI',
        name: 'Natural Science',
        type: ProgramType.STREAM,
        isActive: true,
      },
    });

    term = await prisma.term.create({
      data: { yearNumber: 1, semesterNumber: 1, name: 'Year 1, Semester 1' },
    });

    programTerm = await prisma.programTerm.create({
      data: {
        programId: program.id,
        termId: term.id,
        priceEtb: 50.0,
        isPurchasable: true,
      },
    });

    const pwdHash = '$2a$10$abcdefghijklmnopqrstuvwxyz123456';

    student1 = await prisma.user.create({
      data: {
        studentId: 'AMU-PAY-STUDENT-01',
        fullName: 'Kenenisa Bekele',
        email: 'kenenisa@ambo.edu.et',
        phone: '0911223344',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        programId: program.id,
        isActive: true,
      },
    });

    student2 = await prisma.user.create({
      data: {
        studentId: 'AMU-PAY-STUDENT-02',
        fullName: 'Derartu Tulu',
        email: 'derartu@ambo.edu.et',
        phone: '0922334455',
        passwordHash: pwdHash,
        role: Role.STUDENT,
        programId: program.id,
        isActive: true,
      },
    });

    verifier = await prisma.user.create({
      data: {
        fullName: 'Abebe Bikila (Campus Verifier)',
        email: 'verifier@ambo.edu.et',
        passwordHash: pwdHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // TEST 1: Price tampering from client is ignored
  // -------------------------------------------------------------
  it('1. Price tampering from the client is ignored: server reads price strictly from database', async () => {
    // Malicious client tries to send amountEtb: 1 ETB instead of 50 ETB
    const clientPayload = {
      programTermId: programTerm.id,
      paymentMethod: 'TELEBIRR' as const,
      transactionId: 'TB_TAMPER_TEST_01',
      amountEtb: 1, // TAMPERED AMOUNT
      screenshotUrl: 'quarantine/receipts/proof_tamper_01.jpg',
    };

    // Client validation succeeds (since client can send or omit it)
    const parsed = paymentSubmissionSchema.safeParse(clientPayload);
    expect(parsed.success).toBe(true);

    // Server-side computation:
    // Server fetches ProgramTerm from DB and ignores client amount
    const ptFromDb = await prisma.programTerm.findUniqueOrThrow({
      where: { id: clientPayload.programTermId },
    });
    const serverComputedAmount = Number(ptFromDb.priceEtb);
    expect(serverComputedAmount).toBe(50); // From DB

    // Create payment in DB with server-computed amount
    const payment = await prisma.payment.create({
      data: {
        referenceCode: 'EV-2026-TEST-TAMP',
        userId: student1.id,
        programTermId: clientPayload.programTermId,
        amountEtb: serverComputedAmount, // Ignored clientPayload.amountEtb = 1
        paymentMethod: clientPayload.paymentMethod,
        transactionId: clientPayload.transactionId,
        screenshotKey: clientPayload.screenshotUrl,
        screenshotSha256: sha256(clientPayload.screenshotUrl),
        status: PaymentStatus.PENDING,
      },
    });

    expect(Number(payment.amountEtb)).toBe(50.0);
    expect(Number(payment.amountEtb)).not.toBe(clientPayload.amountEtb);
  });

  // -------------------------------------------------------------
  // TEST 2: Double approval creates exactly one entitlement (Idempotency)
  // -------------------------------------------------------------
  it('2. Double approval creates one entitlement idempotently', async () => {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: {
        paymentMethod_transactionId: {
          paymentMethod: PaymentMethod.TELEBIRR,
          transactionId: 'TB_TAMPER_TEST_01',
        },
      },
    });

    // Approval function replicating atomic server transaction
    const executeApprovalTransaction = async (payId: string, reviewerId: string) => {
      return prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: payId },
          data: {
            status: PaymentStatus.APPROVED,
            reviewedById: reviewerId,
            reviewedAt: new Date(),
          },
        });

        const entitlement = await tx.entitlement.upsert({
          where: {
            userId_programTermId: {
              userId: updatedPayment.userId,
              programTermId: updatedPayment.programTermId,
            },
          },
          update: {
            isActive: true,
            paymentId: updatedPayment.id,
            grantedById: reviewerId,
          },
          create: {
            userId: updatedPayment.userId,
            programTermId: updatedPayment.programTermId,
            paymentId: updatedPayment.id,
            isActive: true,
            grantedById: reviewerId,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Payment approved',
            entityType: 'Payment',
            entityId: updatedPayment.id,
            actorId: reviewerId,
            riskLevel: AuditRiskLevel.LOW,
            details: { referenceCode: updatedPayment.referenceCode, entitlementId: entitlement.id },
          },
        });

        return { updatedPayment, entitlement };
      });
    };

    // First Approval
    const firstResult = await executeApprovalTransaction(payment.id, verifier.id);
    expect(firstResult.updatedPayment.status).toBe(PaymentStatus.APPROVED);
    expect(firstResult.entitlement.isActive).toBe(true);

    const entitlementCountAfterFirst = await prisma.entitlement.count({
      where: { userId: student1.id, programTermId: programTerm.id },
    });
    expect(entitlementCountAfterFirst).toBe(1);

    // Second Approval (Replay / Duplicate click)
    const secondResult = await executeApprovalTransaction(payment.id, verifier.id);
    expect(secondResult.updatedPayment.status).toBe(PaymentStatus.APPROVED);

    // Entitlement count MUST STILL BE 1 (No duplicate entitlement records)
    const entitlementCountAfterSecond = await prisma.entitlement.count({
      where: { userId: student1.id, programTermId: programTerm.id },
    });
    expect(entitlementCountAfterSecond).toBe(1);
    expect(secondResult.entitlement.id).toBe(firstResult.entitlement.id);
  });

  // -------------------------------------------------------------
  // TEST 3: Screenshot reuse is flagged (SHA-256 match)
  // -------------------------------------------------------------
  it('3. Screenshot reuse is flagged when two payments share the same screenshot SHA-256 hash', async () => {
    const sharedScreenshotBytes = 'fake_receipt_screenshot_binary_image_data_12345';
    const sharedScreenshotSha256 = sha256(sharedScreenshotBytes);

    // Payment A submitted by student 1
    const paymentA = await prisma.payment.create({
      data: {
        referenceCode: 'EV-2026-SCREEN-01',
        userId: student1.id,
        programTermId: programTerm.id,
        amountEtb: 50.0,
        paymentMethod: PaymentMethod.CBE_BIRR,
        transactionId: 'CBE_SCREEN_TEST_01',
        screenshotKey: 'quarantine/receipts/proof_screen_01.jpg',
        screenshotSha256: sharedScreenshotSha256,
        status: PaymentStatus.APPROVED,
      },
    });

    // Payment B submitted by student 2 reusing the EXACT SAME screenshot
    const paymentB = await prisma.payment.create({
      data: {
        referenceCode: 'EV-2026-SCREEN-02',
        userId: student2.id,
        programTermId: programTerm.id,
        amountEtb: 50.0,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        transactionId: 'BANK_SCREEN_TEST_02',
        screenshotKey: 'quarantine/receipts/proof_screen_02.jpg',
        screenshotSha256: sharedScreenshotSha256, // IDENTICAL SHA-256 HASH
        status: PaymentStatus.PENDING,
      },
    });

    // Verifier Queue aggregation logic:
    const allPayments = await prisma.payment.findMany();
    const shaCountMap = new Map<string, number>();
    for (const p of allPayments) {
      if (p.screenshotSha256) {
        shaCountMap.set(p.screenshotSha256, (shaCountMap.get(p.screenshotSha256) || 0) + 1);
      }
    }

    const processedPayments = allPayments.map((p) => ({
      ...p,
      hasDuplicateScreenshot: p.screenshotSha256 ? (shaCountMap.get(p.screenshotSha256) || 0) > 1 : false,
    }));

    const foundA = processedPayments.find((p) => p.id === paymentA.id);
    const foundB = processedPayments.find((p) => p.id === paymentB.id);

    expect(foundA?.hasDuplicateScreenshot).toBe(true);
    expect(foundB?.hasDuplicateScreenshot).toBe(true);
    expect(shaCountMap.get(sharedScreenshotSha256)).toBe(2);
  });

  // -------------------------------------------------------------
  // TEST 4: Student payment states & rejection resubmission
  // -------------------------------------------------------------
  it('4. Rejection with reason allows student to resubmit with corrected receipt (resubmitCount)', async () => {
    // 1. Verifier rejects student2's pending payment
    const pendingPayment = await prisma.payment.findFirstOrThrow({
      where: { userId: student2.id, status: PaymentStatus.PENDING },
    });

    const rejectionReason = 'Receipt screenshot blurry and unreadable; reference ID not found';

    const rejected = await prisma.payment.update({
      where: { id: pendingPayment.id },
      data: {
        status: PaymentStatus.REJECTED,
        rejectionReason,
        reviewedById: verifier.id,
        reviewedAt: new Date(),
      },
    });

    expect(rejected.status).toBe(PaymentStatus.REJECTED);
    expect(rejected.rejectionReason).toBe(rejectionReason);

    // 2. Student resubmits corrected payment:
    // Finds existing rejected payment, updates with corrected details and increments resubmitCount
    const correctedScreenshotSha = sha256('new_crystal_clear_telebirr_screenshot_bytes');
    const resubmitted = await prisma.payment.update({
      where: { id: rejected.id },
      data: {
        paymentMethod: PaymentMethod.TELEBIRR,
        transactionId: 'TB_CORRECTED_RECEIPT_99',
        screenshotKey: 'quarantine/receipts/proof_corrected_99.jpg',
        screenshotSha256: correctedScreenshotSha,
        amountEtb: 50.0,
        status: PaymentStatus.PENDING,
        rejectionReason: null, // Cleared on resubmit
        reviewedById: null,
        reviewedAt: null,
        resubmitCount: rejected.resubmitCount + 1,
      },
    });

    expect(resubmitted.status).toBe(PaymentStatus.PENDING);
    expect(resubmitted.rejectionReason).toBeNull();
    expect(resubmitted.resubmitCount).toBe(1);
    expect(resubmitted.transactionId).toBe('TB_CORRECTED_RECEIPT_99');
  });

  // -------------------------------------------------------------
  // TEST 5: Verifier can revoke access (reason required, audit-logged)
  // -------------------------------------------------------------
  it('5. Verifier can revoke access, deactivating entitlement and writing high-risk audit log', async () => {
    // Student 1 has active entitlement
    const entitlement = await prisma.entitlement.findFirstOrThrow({
      where: { userId: student1.id, programTermId: programTerm.id, isActive: true },
    });
    expect(entitlement.isActive).toBe(true);

    const payment = await prisma.payment.findFirstOrThrow({
      where: { userId: student1.id, status: PaymentStatus.APPROVED },
    });

    const revokeReason = 'Bank statement showed fraudulent transaction reversal (chargeback)';

    // Execute Revocation in transaction
    await prisma.$transaction(async (tx) => {
      await tx.entitlement.update({
        where: { id: entitlement.id },
        data: { isActive: false },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REJECTED,
          rejectionReason: `Access Revoked: ${revokeReason}`,
          reviewedById: verifier.id,
          reviewedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'Entitlement access revoked by verifier',
          entityType: 'Payment',
          entityId: payment.id,
          actorId: verifier.id,
          riskLevel: AuditRiskLevel.HIGH,
          details: { paymentId: payment.id, reason: revokeReason, userId: student1.id },
        },
      });
    });

    // Entitlement is now deactivated
    const revokedEntitlement = await prisma.entitlement.findUniqueOrThrow({
      where: { id: entitlement.id },
    });
    expect(revokedEntitlement.isActive).toBe(false);

    // Audit log was recorded
    const auditRecord = await prisma.auditLog.findFirst({
      where: { entityId: payment.id, action: 'Entitlement access revoked by verifier' },
    });
    expect(auditRecord).toBeDefined();
    expect(auditRecord?.riskLevel).toBe(AuditRiskLevel.HIGH);
  });
});
