import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, PaymentStatus, PaperStatus, ExamType, ProgramType, PaymentMethod } from '@prisma/client';
import { handleApiRequest, prisma } from '../server/apiHandler';
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
      where: { code: 'Y1S1' },
      update: {},
      create: { code: 'Y1S1', academicYear: 2016, semesterNumber: 1, name: 'Year 1 Semester 1' },
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
      create: { code: 'Phys 1011', title: 'General Physics', streamCode: 'NAT_SCI', isActive: true },
    });
    coursePhil = await prisma.course.upsert({
      where: { code: 'Phil 1011' },
      update: {},
      create: { code: 'Phil 1011', title: 'Logic and Critical Thinking', streamCode: null, isActive: true },
    });
    courseEcon = await prisma.course.upsert({
      where: { code: 'Econ 1011' },
      update: {},
      create: { code: 'Econ 1011', title: 'Introduction to Economics', streamCode: 'SOC_SCI', isActive: true },
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

    // Papers
    paperPhys = await prisma.examPaper.create({
      data: {
        courseId: coursePhys.id,
        title: 'Phys 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: 'published/e2e_phys1011.pdf',
        sha256: sha256('e2e-phys-paper'),
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
        storageKey: 'published/e2e_phil1011.pdf',
        sha256: sha256('e2e-phil-paper'),
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
        storageKey: 'published/e2e_econ1011.pdf',
        sha256: sha256('e2e-econ-paper'),
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    // Payment verifier staff account
    verifierUser = await prisma.user.create({
      data: {
        fullName: 'E2E Verifier',
        email: 'e2e_verifier@woliso.edu.et',
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
      email: 'tadesse.alemu@ambo.edu.et',
      phone: '0912349999',
      studentId: 'AMU-2026-9999',
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
      transactionId: 'TB_E2E_REAL_TX_001',
      receiptImageStorageKey: 'quarantine/receipt_e2e.jpg',
      receiptImageSha256: sha256('e2e-receipt-image-content'),
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
