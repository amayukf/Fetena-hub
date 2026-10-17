import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, PaymentStatus, PaperStatus, ExamType, ProgramType, PaymentMethod } from '@prisma/client';
import { handleApiRequest, prisma } from '../server/apiHandler';
import { storage } from '../src/lib/storage';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function callApi(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: any; body: any }>((resolve) => {
    const req: any = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = { host: 'localhost:8443', ...headers };
    req.socket = { remoteAddress: '197.156.102.50' };

    let resStatus = 200;
    let resHeaders: any = {};
    let resBody = '';

    const res: any = {
      writeHead(status: number, hdrs: any) {
        resStatus = status;
        resHeaders = hdrs;
      },
      end(chunk?: any) {
        if (chunk) resBody += chunk.toString();
        try {
          resolve({ status: resStatus, headers: resHeaders, body: JSON.parse(resBody) });
        } catch {
          resolve({ status: resStatus, headers: resHeaders, body: resBody });
        }
      },
    };

    handleApiRequest(req, res).catch((err) => {
      resolve({ status: 500, headers: {}, body: { error: err.message } });
    });

    if (body) {
      req.emit('data', JSON.stringify(body));
    }
    req.emit('end');
  });
}

describe('PART 6: Real End-to-End Main Lifecycle Flow', () => {
  const runId = Math.floor(100000 + Math.random() * 900000);
  const testStudentEmail = `tadesse.alemu.${runId}@ambo.edu.et`;
  const testStudentPhone = `091${String(runId).slice(0, 7)}`;
  const testStudentId = `AMU-2026-${runId}`;
  const verifierEmail = `e2e_verifier_${runId}@woliso.edu.et`;

  let verifierUser: any;
  let natProg: any;
  let socProg: any;
  let natY1S1: any;
  let socY1S1: any;
  let coursePhys: any;
  let coursePhil: any;
  let courseEcon: any;
  let paperPhys: any;
  let paperPhil: any;
  let paperEcon: any;
  let studentUser: any;
  let studentSessionToken: string;
  let submittedPaymentId: string;

  beforeAll(async () => {
    // Reference setup
    const campus = await prisma.campus.upsert({
      where: { code: 'WOLISO' },
      update: {},
      create: { code: 'WOLISO', name: 'Ambo University - Woliso Campus' },
    });

    natProg = await prisma.program.upsert({
      where: { campusId_code: { campusId: campus.id, code: 'NAT_SCI' } },
      update: {},
      create: { campusId: campus.id, code: 'NAT_SCI', name: 'Natural Science Stream', type: ProgramType.NATURAL_SCIENCE },
    });

    socProg = await prisma.program.upsert({
      where: { campusId_code: { campusId: campus.id, code: 'SOC_SCI' } },
      update: {},
      create: { campusId: campus.id, code: 'SOC_SCI', name: 'Social Science Stream', type: ProgramType.SOCIAL_SCIENCE },
    });

    const termY1S1 = await prisma.term.upsert({
      where: { yearNumber_semesterNumber: { yearNumber: 1, semesterNumber: 1 } },
      update: {},
      create: { yearNumber: 1, semesterNumber: 1, name: 'Year 1 Semester 1' },
    });

    natY1S1 = await prisma.programTerm.findFirst({
      where: { programId: natProg.id, termId: termY1S1.id },
    });
    if (!natY1S1) {
      natY1S1 = await prisma.programTerm.create({
        data: { programId: natProg.id, termId: termY1S1.id, priceEtb: 50.00, isPurchasable: true },
      });
    }

    socY1S1 = await prisma.programTerm.findFirst({
      where: { programId: socProg.id, termId: termY1S1.id },
    });
    if (!socY1S1) {
      socY1S1 = await prisma.programTerm.create({
        data: { programId: socProg.id, termId: termY1S1.id, priceEtb: 50.00, isPurchasable: true },
      });
    }

    // Courses: Phys 1011 (Natural), Phil 1011 (Shared), Econ 1011 (Social)
    coursePhys = await prisma.course.upsert({
      where: { code: 'Phys 1011' },
      update: {},
      create: { code: 'Phys 1011', title: 'General Physics', creditHours: 3 },
    });
    coursePhil = await prisma.course.upsert({
      where: { code: 'Phil 1011' },
      update: {},
      create: { code: 'Phil 1011', title: 'Logic and Critical Thinking', creditHours: 3 },
    });
    courseEcon = await prisma.course.upsert({
      where: { code: 'Econ 1011' },
      update: {},
      create: { code: 'Econ 1011', title: 'Introduction to Economics', creditHours: 3 },
    });

    // Ensure links to ProgramTerms
    await prisma.programTermCourse.createMany({
      data: [
        { programTermId: natY1S1.id, courseId: coursePhys.id },
        { programTermId: natY1S1.id, courseId: coursePhil.id },
        { programTermId: socY1S1.id, courseId: coursePhil.id },
        { programTermId: socY1S1.id, courseId: courseEcon.id },
      ],
      skipDuplicates: true,
    });

    // Seed test files into private storage
    const physKey = `published/e2e_phys1011_${runId}.pdf`;
    const philKey = `published/e2e_phil1011_${runId}.pdf`;
    const econKey = `published/e2e_econ1011_${runId}.pdf`;
    await storage.upload(physKey, Buffer.from('REAL-TEST-PDF-PHYS-BYTES'), 'application/pdf');
    await storage.upload(philKey, Buffer.from('REAL-TEST-PDF-PHIL-BYTES'), 'application/pdf');
    await storage.upload(econKey, Buffer.from('REAL-TEST-PDF-ECON-BYTES'), 'application/pdf');

    // Papers
    paperPhys = await prisma.examPaper.create({
      data: {
        courseId: coursePhys.id,
        title: 'Phys 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: physKey,
        sha256: sha256(`e2e-phys-paper-${runId}`),
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    paperPhil = await prisma.examPaper.create({
      data: {
        courseId: coursePhil.id,
        title: 'Phil 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: philKey,
        sha256: sha256(`e2e-phil-paper-${runId}`),
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    paperEcon = await prisma.examPaper.create({
      data: {
        courseId: courseEcon.id,
        title: 'Econ 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: econKey,
        sha256: sha256(`e2e-econ-paper-${runId}`),
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    // Payment verifier staff account
    verifierUser = await prisma.user.create({
      data: {
        fullName: 'E2E Verifier',
        email: verifierEmail,
        role: Role.PAYMENT_VERIFIER,
        passwordHash: 'dummy',
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Step 1: Sign up as a real student in Natural Science stream', async () => {
    const signupRes = await callApi('POST', '/api/auth/signup', {
      fullName: 'Tadesse Alemu',
      email: testStudentEmail,
      phone: testStudentPhone,
      studentId: testStudentId,
      stream: 'NAT_SCI',
      password: 'StrongPassword123!',
    });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user.role).toBe(Role.STUDENT);
    expect(signupRes.body.user.stream).toBe('NAT_SCI');
    studentUser = signupRes.body.user;
    studentSessionToken = signupRes.body.token;
  });

  it('Step 2: Student submits a payment with receipt transaction ID and screenshot', async () => {
    const paymentRes = await callApi('POST', '/api/payments', {
      userId: studentUser.userId,
      programTermId: natY1S1.id,
      paymentMethod: 'TELEBIRR',
      transactionId: `TB_E2E_REAL_TX_${runId}`,
      receiptImageStorageKey: `quarantine/receipt_e2e_${runId}.jpg`,
      receiptImageSha256: sha256(`e2e-receipt-image-content-${runId}`),
    }, {
      authorization: `Bearer ${studentSessionToken}`,
    });

    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.payment.status).toBe(PaymentStatus.PENDING);
    expect(Number(paymentRes.body.payment.amountEtb)).toBe(50.00);
    submittedPaymentId = paymentRes.body.payment.id;
  });

  it('Step 3: Payment Verifier reviews and approves the payment', async () => {
    const approveRes = await callApi('POST', `/api/payments/${submittedPaymentId}/approve`, {
      reviewerId: verifierUser.id,
    }, {
      'x-actor-id': verifierUser.id,
      'x-actor-role': 'PAYMENT_VERIFIER',
    });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe(PaymentStatus.APPROVED);

    // Verify database entitlement was created
    const entitlement = await prisma.entitlement.findFirst({
      where: { userId: studentUser.userId, programTermId: natY1S1.id, isActive: true },
    });
    expect(entitlement).not.toBeNull();
  });

  it('Step 4: Student opens Phys 1011 (Natural Science) -> Access granted with dynamic watermark', async () => {
    const accessRes = await callApi('GET', `/api/papers/${paperPhys.id}/access`, undefined, {
      authorization: `Bearer ${studentSessionToken}`,
    });

    expect(accessRes.status).toBe(200);
    expect(accessRes.body.allowed).toBe(true);
    expect(accessRes.body.watermark.studentName).toBe('Tadesse Alemu');
    expect(accessRes.body.streamUrl).toContain('/stream?token=');
  });

  it('Step 5: Student opens Phil 1011 (Shared Course) -> Access granted', async () => {
    const accessRes = await callApi('GET', `/api/papers/${paperPhil.id}/access`, undefined, {
      authorization: `Bearer ${studentSessionToken}`,
    });

    expect(accessRes.status).toBe(200);
    expect(accessRes.body.allowed).toBe(true);
    expect(accessRes.body.watermark.studentName).toBe('Tadesse Alemu');
  });

  it('Step 6: Student attempts to open Econ 1011 (Social Science only) -> Blocked (403)', async () => {
    const accessRes = await callApi('GET', `/api/papers/${paperEcon.id}/access`, undefined, {
      authorization: `Bearer ${studentSessionToken}`,
    });

    expect(accessRes.status).toBe(403);
    expect(accessRes.body.allowed).toBe(false);
    expect(accessRes.body.reason).toBe('NO_ACTIVE_ENTITLEMENT');
  });

  it('Step 7: Direct file URL / stream access without session fails (403)', async () => {
    const directStreamRes = await callApi('GET', `/api/papers/${paperPhys.id}/stream`);
    expect(directStreamRes.status).toBe(403);
  });
});
