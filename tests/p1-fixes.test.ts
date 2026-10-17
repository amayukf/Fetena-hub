import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, ExamType, ContributionStatus, PaymentMethod } from '@prisma/client';
import { handleApiRequest, prisma, normalizeEthiopianPhone, getPhoneVariants } from '../server/apiHandler';
import { EventEmitter } from 'node:events';
import bcrypt from 'bcryptjs';

function callApi(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: any; body: any }>((resolve) => {
    const req: any = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = { host: 'localhost:8443', ...headers };
    req.socket = { remoteAddress: '197.156.102.60' };

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

describe('P1 Fixes Verification', () => {
  const runId = Math.floor(100000 + Math.random() * 900000);
  let adminUser: any;
  let studentUser: any;
  let testCourse: any;
  let createdRequestId: string | null = null;
  let createdContribId: string | null = null;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('SecretPass123!', 10);

    adminUser = await prisma.user.create({
      data: {
        studentId: `P1-ADMIN-${runId}`,
        fullName: 'P1 Test Admin',
        email: `admin.p1.${runId}@ambo.edu.et`,
        phone: `+251911${String(runId).slice(0, 6)}`,
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    studentUser = await prisma.user.create({
      data: {
        studentId: `P1-STUDENT-${runId}`,
        fullName: 'P1 Test Student',
        email: `student.p1.${runId}@ambo.edu.et`,
        phone: `+251933${String(runId).slice(0, 6)}`,
        passwordHash,
        role: Role.STUDENT,
        isActive: true,
        canSell: true,
      },
    });

    testCourse = await prisma.course.upsert({
      where: { code: 'FLEn 1011' },
      update: { isActive: true, deletedAt: null },
      create: {
        code: 'FLEn 1011',
        title: 'Communicative English Language Skills I',
        creditHours: 3,
        isActive: true,
      },
    });

    await prisma.term.upsert({
      where: { yearNumber_semesterNumber: { yearNumber: 1, semesterNumber: 2 } },
      update: {},
      create: { yearNumber: 1, semesterNumber: 2, name: 'Year 1, Semester 2' },
    });
  });

  afterAll(async () => {
    if (createdRequestId) {
      await prisma.paperRequest.delete({ where: { id: createdRequestId } }).catch(() => {});
    }
    if (createdContribId) {
      await prisma.contributionFile.deleteMany({ where: { contributionId: createdContribId } }).catch(() => {});
      await prisma.paperContribution.delete({ where: { id: createdContribId } }).catch(() => {});
    }
    if (adminUser) await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    if (studentUser) await prisma.user.delete({ where: { id: studentUser.id } }).catch(() => {});
  });

  // -------------------------------------------------------------
  // Ticket 9: Admin overview returns real coverageSummary
  // -------------------------------------------------------------
  it('Ticket 9: GET /api/admin/overview calculates and returns coverageSummary', async () => {
    const res = await callApi('GET', '/api/admin/overview', undefined, {
      'x-actor-id': adminUser.id,
      'x-actor-role': 'ADMIN',
    });

    expect(res.status).toBe(200);
    expect(res.body.coverageSummary).toBeDefined();
    expect(typeof res.body.coverageSummary.percentage).toBe('number');
    expect(typeof res.body.coverageSummary.coveredSlots).toBe('number');
    expect(typeof res.body.coverageSummary.totalSlots).toBe('number');
    expect(res.body.coverageSummary.totalSlots).toBe(res.body.coverageMatrix.length * 3);
  });

  // -------------------------------------------------------------
  // Ticket 7: Real Term ID for Semester 2 notification & Bootstrap terms
  // -------------------------------------------------------------
  it('Ticket 7: Bootstrap returns terms and POST /api/term-interest resolves mock term-y1s2 to PostgreSQL Term', async () => {
    // 1. Verify bootstrap returns terms array
    const bootRes = await callApi('GET', '/api/bootstrap');
    expect(bootRes.status).toBe(200);
    expect(Array.isArray(bootRes.body.terms)).toBe(true);
    expect(bootRes.body.terms.length).toBeGreaterThanOrEqual(2);

    // 2. Submit notification interest with mock ID 'term-y1s2'
    const notifyRes = await callApi(
      'POST',
      '/api/term-interest',
      { termId: 'term-y1s2', userId: studentUser.id },
      { 'x-actor-id': studentUser.id }
    );

    expect(notifyRes.status).toBe(201);
    expect(notifyRes.body.userId).toBe(studentUser.id);
    expect(notifyRes.body.termId).not.toBe('term-y1s2'); // Resolved to real database UUID
    expect(notifyRes.body.term).toBeDefined();
    expect(notifyRes.body.term.yearNumber).toBe(1);
    expect(notifyRes.body.term.semesterNumber).toBe(2);

    // Clean up
    await prisma.termInterest.deleteMany({
      where: { userId: studentUser.id },
    }).catch(() => {});
  });

  // -------------------------------------------------------------
  // Ticket 8: Paper Request API
  // -------------------------------------------------------------
  it('Ticket 8: POST /api/requests creates PaperRequest and GET /api/requests retrieves it', async () => {
    const postRes = await callApi(
      'POST',
      '/api/requests',
      {
        courseId: testCourse.id,
        examType: 'FINAL',
        examYear: 2023,
        notes: 'Need 2023 final exam with answer key',
      },
      { 'x-actor-id': studentUser.id }
    );

    expect(postRes.status).toBe(201);
    expect(postRes.body.id).toBeDefined();
    expect(postRes.body.courseId).toBe(testCourse.id);
    expect(postRes.body.studentId).toBe(studentUser.id);
    createdRequestId = postRes.body.id;

    // Student GET /api/requests sees their own request
    const getResStudent = await callApi('GET', '/api/requests', undefined, {
      'x-actor-id': studentUser.id,
    });
    expect(getResStudent.status).toBe(200);
    expect(Array.isArray(getResStudent.body)).toBe(true);
    expect(getResStudent.body.some((r: any) => r.id === createdRequestId)).toBe(true);

    // Admin GET /api/requests sees all requests
    const getResAdmin = await callApi('GET', '/api/requests', undefined, {
      'x-actor-id': adminUser.id,
    });
    expect(getResAdmin.status).toBe(200);
    expect(getResAdmin.body.some((r: any) => r.id === createdRequestId)).toBe(true);
  });

  // -------------------------------------------------------------
  // Ticket 10: Contribution Review Actions (REJECT & REQUEST_BETTER_SCAN)
  // -------------------------------------------------------------
  it('Ticket 10: POST /api/contributions/:id/review enforces reasons for REJECT and supports REQUEST_BETTER_SCAN', async () => {
    // Create a mock contribution
    const contrib = await prisma.paperContribution.create({
      data: {
        studentId: studentUser.id,
        courseId: testCourse.id,
        examType: ExamType.FINAL,
        examDate: new Date('2023-06-15'),
        academicYearEc: 2015,
        declarationText: 'I confirm this paper is authentic',
        declarationAcceptedAt: new Date(),
        payoutPaymentMethod: PaymentMethod.TELEBIRR,
        payoutAccount: '0911223344',
        proposedPayoutEtb: 100,
        status: ContributionStatus.SUBMITTED,
      },
    });
    createdContribId = contrib.id;

    // Reject without reason fails with 400
    const failReject = await callApi(
      'POST',
      `/api/contributions/${contrib.id}/review`,
      { action: 'REJECT' },
      { 'x-actor-id': adminUser.id }
    );
    expect(failReject.status).toBe(400);

    // Request better scan sets CHANGES_REQUESTED
    const scanReq = await callApi(
      'POST',
      `/api/contributions/${contrib.id}/review`,
      { action: 'REQUEST_BETTER_SCAN' },
      { 'x-actor-id': adminUser.id }
    );
    expect(scanReq.status).toBe(200);
    expect(scanReq.body.status).toBe(ContributionStatus.CHANGES_REQUESTED);

    // Reject with reason sets REJECTED
    const successReject = await callApi(
      'POST',
      `/api/contributions/${contrib.id}/review`,
      { action: 'REJECT', reason: 'Unreadable blurry scan on page 3' },
      { 'x-actor-id': adminUser.id }
    );
    expect(successReject.status).toBe(200);
    expect(successReject.body.status).toBe(ContributionStatus.REJECTED);
    expect(successReject.body.rejectionReason).toBe('Unreadable blurry scan on page 3');
  });

  // -------------------------------------------------------------
  // Ticket 13: Ethiopian Phone Normalization
  // -------------------------------------------------------------
  it('Ticket 13: Normalizes 09... and +2519... Ethiopian phone numbers and allows login across variants', async () => {
    expect(normalizeEthiopianPhone('0911223344')).toBe('+251911223344');
    expect(normalizeEthiopianPhone('+251 91 122 3344')).toBe('+251911223344');
    expect(normalizeEthiopianPhone('0712345678')).toBe('+251712345678');
    expect(normalizeEthiopianPhone('251911223344')).toBe('+251911223344');

    const testPhone = `0987${String(runId).slice(0, 6)}`;
    const signupRes = await callApi('POST', '/api/auth/signup', {
      fullName: 'Phone Norm Student',
      phone: testPhone,
      password: 'StrongPassword123!',
      stream: 'NAT_SCI',
    });

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user.phone).toBe(`+251${testPhone.slice(1)}`);
    const createdUserId = signupRes.body.user.id;

    // Login using international format with spaces
    const loginRes1 = await callApi('POST', '/api/auth/login', {
      identifier: `+251 ${testPhone.slice(1, 3)} ${testPhone.slice(3)}`,
      password: 'StrongPassword123!',
    });
    expect(loginRes1.status).toBe(200);
    expect(loginRes1.body.user.id).toBe(createdUserId);

    // Login using original local format
    const loginRes2 = await callApi('POST', '/api/auth/login', {
      identifier: testPhone,
      password: 'StrongPassword123!',
    });
    expect(loginRes2.status).toBe(200);
    expect(loginRes2.body.user.id).toBe(createdUserId);

    // Clean up created user
    await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
  });
});
