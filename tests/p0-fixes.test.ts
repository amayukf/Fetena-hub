import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, ProgramType, PaymentMethod } from '@prisma/client';
import { handleApiRequest, prisma } from '../server/apiHandler';
import { storage } from '../src/lib/storage';
import { createOnePagePdf } from './pdfFixture';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

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
    const chunks: Buffer[] = [];

    const res: any = {
      writeHead(status: number, hdrs: any) {
        resStatus = status;
        resHeaders = hdrs;
      },
      end(chunk?: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const resBody = Buffer.concat(chunks);
        try {
          resolve({ status: resStatus, headers: resHeaders, body: JSON.parse(resBody.toString()) });
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

describe('P0 Critical Fixes Verification', () => {
  const runId = Math.floor(100000 + Math.random() * 900000);
  let adminUser: any;
  let studentUser: any;
  let testCourse: any;

  beforeAll(async () => {
    const defaultPasswordHash = await bcrypt.hash('RealStrongPassword123!', 10);

    adminUser = await prisma.user.create({
      data: {
        studentId: `P0-ADMIN-${runId}`,
        fullName: 'P0 Test Admin',
        email: `admin.p0.${runId}@ambo.edu.et`,
        phone: `+251911${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    studentUser = await prisma.user.create({
      data: {
        studentId: `P0-STUDENT-${runId}`,
        fullName: 'P0 Test Student',
        email: `student.p0.${runId}@ambo.edu.et`,
        phone: `+251922${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
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
  });

  afterAll(async () => {
    if (adminUser) await prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    if (studentUser) await prisma.user.delete({ where: { id: studentUser.id } }).catch(() => {});
  });

  // -------------------------------------------------------------
  // Test 1: Backdoor passwords Admin2026 and Admin@Ambo2026! are blocked
  // -------------------------------------------------------------
  it('Fix 5: Rejects backdoor admin passwords (Admin2026, Admin@Ambo2026!)', async () => {
    const attempt1 = await callApi('POST', '/api/auth/login', {
      identifier: adminUser.email,
      password: 'Admin2026',
    });
    expect(attempt1.status).toBe(401);

    const attempt2 = await callApi('POST', '/api/auth/login', {
      identifier: adminUser.email,
      password: 'Admin@Ambo2026!',
    });
    expect(attempt2.status).toBe(401);

    // Legitimate password succeeds
    const legit = await callApi('POST', '/api/auth/login', {
      identifier: adminUser.email,
      password: 'RealStrongPassword123!',
    });
    expect(legit.status).toBe(200);
    expect(legit.body.token).toBeDefined();
  });

  // -------------------------------------------------------------
  // Test 2: Storage View requires authentication or signature
  // -------------------------------------------------------------
  it('Fix 4: /api/storage/view allows staff and rejects unauthenticated users', async () => {
    // Upload a test receipt
    const testKey = `quarantine/test_receipt_${runId}.jpg`;
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    await storage.upload(testKey, jpegHeader, 'image/jpeg');

    // Unauthenticated request should fail 403
    const unauthRes = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(testKey)}`);
    expect(unauthRes.status).toBe(403);

    // Admin staff authenticated request succeeds
    const adminRes = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(testKey)}`, undefined, {
      'x-actor-id': adminUser.id,
      'x-actor-role': 'ADMIN',
    });
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers['Content-Type']).toBe('image/jpeg');
  });

  // -------------------------------------------------------------
  // Test 3: Stop Stub PDFs on contribution approval
  // -------------------------------------------------------------
  it('Fix 2: Rejects contribution approval if quarantine file is missing', async () => {
    // Create contribution with non-existent quarantine file
    const fakeKey = `quarantine/missing_file_${runId}.pdf`;
    const yesterday = new Date(Date.now() - 86400000);

    const contrib = await prisma.paperContribution.create({
      data: {
        studentId: studentUser.id,
        courseId: testCourse.id,
        examType: 'FINAL',
        academicYearEc: 2015,
        examDate: yesterday,
        payoutPaymentMethod: PaymentMethod.TELEBIRR,
        payoutAccount: '0911000000',
        proposedPayoutEtb: 100,
        declarationText: 'Accepted',
        declarationAcceptedAt: new Date(),
        status: 'SUBMITTED',
        files: {
          create: {
            storageKey: fakeKey,
            sha256: sha256(`fake-sha-${runId}`),
            mimeType: 'application/pdf',
            sizeBytes: 1000,
            pageOrder: 1,
          },
        },
      },
    });

    // Attempt to approve -> MUST fail with 400 because quarantine binary is missing
    const approveRes = await callApi(
      'POST',
      `/api/contributions/${contrib.id}/approve`,
      {
        approvedPayoutEtb: 100,
        payoutTxId: 'TX_TEST_FAIL',
        reviewerId: adminUser.id,
      },
      {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      }
    );

    expect(approveRes.status).toBe(400);
    expect(approveRes.body.error).toContain('missing from quarantine storage');

    // Clean up
    await prisma.contributionFile.deleteMany({ where: { contributionId: contrib.id } });
    await prisma.paperContribution.delete({ where: { id: contrib.id } });
  });

  // -------------------------------------------------------------
  // Test 4: Contribution submission accepts course code and UUID
  // -------------------------------------------------------------
  it('Fix 3: Accepts contributions with course code or ID and validates past date', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const contributionBytes = createOnePagePdf();
    const uploadRes = await callApi('POST', '/api/upload', {
      fileBase64: contributionBytes.toString('base64'),
      reportedMime: 'application/pdf',
      category: 'contribution',
    }, {
      'x-actor-id': studentUser.id,
    });
    expect(uploadRes.status).toBe(201);

    const res = await callApi(
      'POST',
      '/api/contributions',
      {
        courseId: testCourse.id,
        courseCode: 'FLEn 1011',
        examType: 'FINAL',
        academicYear: 2015,
        examDate: yesterday,
        declarationAccepted: true,
        payoutPaymentMethod: 'TELEBIRR',
        payoutAccount: '0911223344',
        proposedPayoutEtb: 75,
        storageKey: uploadRes.body.storageKey,
      },
      {
        'x-actor-id': studentUser.id,
      }
    );

    expect(res.status).toBe(201);
    expect(res.body.courseId).toBe(testCourse.id);

    // Clean up
    await prisma.contributionFile.deleteMany({ where: { contributionId: res.body.id } });
    await prisma.paperContribution.delete({ where: { id: res.body.id } });
  });

  // -------------------------------------------------------------
  // Test 5: Reject missing binaries in dev when creating papers (No fake stubs)
  // -------------------------------------------------------------
  it('Fix 2 (Stop Stub PDFs): Rejects paper creation without binary file in dev (400 Bad Request)', async () => {
    const res = await callApi(
      'POST',
      '/api/papers',
      {
        courseId: testCourse.id,
        title: `Test Paper No Binary ${runId}`,
        examType: 'FINAL',
        examYearEc: 2016,
      },
      {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      }
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('binary PDF asset not found in storage');
  });

  // -------------------------------------------------------------
  // Test 6: Session endpoints require authentication
  // -------------------------------------------------------------
  it('Fix 5 (Auth Backdoors): Rejects unauthenticated session creation & inspection', async () => {
    // Unauthenticated POST /api/auth/session MUST fail 403
    const postSessionRes = await callApi('POST', '/api/auth/session', {
      userId: studentUser.id,
    });
    expect(postSessionRes.status).toBe(403);

    // Unauthenticated GET /api/auth/sessions MUST fail 401
    const getSessionRes = await callApi('GET', `/api/auth/sessions?userId=${studentUser.id}`);
    expect(getSessionRes.status).toBe(401);

    // Student requesting another user's sessions is scoped only to their own
    const studentScopedRes = await callApi('GET', `/api/auth/sessions?userId=${adminUser.id}`, undefined, {
      'x-actor-id': studentUser.id,
    });
    expect(studentScopedRes.status).toBe(200);
    expect(Array.isArray(studentScopedRes.body)).toBe(true);
    // Student must not see admin's sessions
    studentScopedRes.body.forEach((s: any) => {
      expect(s.userId).toBe(studentUser.id);
    });
  });

  // -------------------------------------------------------------
  // Test 7: Email alias admin@examvault.* backdoor is removed
  // -------------------------------------------------------------
  it('Fix 5 (Auth Backdoors): Rejects admin@examvault.* aliases without an exact DB match', async () => {
    const res = await callApi('POST', '/api/auth/login', {
      identifier: 'admin@examvault.fake-alias.com',
      password: 'RealStrongPassword123!',
    });
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------
  // Test 8: Forced password change succeeds without oldPassword
  // -------------------------------------------------------------
  it('Fix 7 (Forced Password Reset): Allows first-time password change without oldPassword when mustChangePassword is true', async () => {
    // Create temporary user with mustChangePassword = true
    const tempUser = await prisma.user.create({
      data: {
        studentId: `TEMP-${runId}`,
        fullName: 'Temp Reset User',
        email: `temp.${runId}@ambo.edu.et`,
        passwordHash: await bcrypt.hash('InitialTempPass123!', 10),
        role: Role.STUDENT,
        mustChangePassword: true,
      },
    });

    // Password change sending only newPassword succeeds
    const changeRes = await callApi(
      'POST',
      '/api/auth/change-password',
      { newPassword: 'BrandNewStrongPassword123!' },
      { 'x-actor-id': tempUser.id }
    );
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.success).toBe(true);

    // Verify mustChangePassword flag is now false in DB
    const updated = await prisma.user.findUnique({ where: { id: tempUser.id } });
    expect(updated?.mustChangePassword).toBe(false);

    // Clean up
    await prisma.user.update({
      where: { id: tempUser.id },
      data: { deletedAt: new Date(), isActive: false },
    }).catch(() => {});
  });

  // -------------------------------------------------------------
  // Test 9: Student viewer receives only authenticated, watermarked page images
  // -------------------------------------------------------------
  it('does not expose the source PDF and renders authorized pages as PNG', async () => {
    const storageKey = `published/FLEn1011/stream_test_${runId}.pdf`;
    const pdfBuf = createOnePagePdf();
    await storage.upload(storageKey, pdfBuf, 'application/pdf');

    const paper = await prisma.examPaper.create({
      data: {
        courseId: testCourse.id,
        title: `Stream Test Paper ${runId}`,
        examType: 'FINAL',
        examYearEc: 2016,
        quality: 'EXCELLENT',
        pageCount: 4,
        isFreeSample: true,
        storageKey,
        sha256: sha256(`stream-test-sha-${runId}`),
        mimeType: 'application/pdf',
        fileSizeBytes: pdfBuf.byteLength,
        status: 'PUBLISHED',
      },
    });

    // Request paper access as admin
    const accessRes = await callApi('GET', `/api/papers/${paper.id}/access?userId=${adminUser.id}`, undefined, {
      'x-actor-id': adminUser.id,
      'x-actor-role': 'ADMIN',
    });

    expect(accessRes.status).toBe(200);
    expect(accessRes.body.allowed).toBe(true);
    expect(accessRes.body.pageCount).toBe(1);
    expect(accessRes.body).not.toHaveProperty('streamUrl');
    expect(accessRes.body).not.toHaveProperty('paper.storageKey');

    const pageRes = await callApi('GET', `/api/papers/${paper.id}/pages/1`, undefined, {
      'x-actor-id': adminUser.id,
    });
    expect(pageRes.status).toBe(200);
    expect(pageRes.headers['Content-Type']).toBe('image/png');
    expect(pageRes.body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(pageRes.headers['Cache-Control']).toContain('no-store');

    const outOfRangeRes = await callApi('GET', `/api/papers/${paper.id}/pages/2`, undefined, {
      'x-actor-id': adminUser.id,
    });
    expect(outOfRangeRes.status).toBe(416);

    const streamRes = await callApi('GET', `/api/papers/${paper.id}/stream?token=old-ticket`);
    expect(streamRes.status).toBe(410);

    // Clean up with soft delete
    await prisma.examPaper.update({
      where: { id: paper.id },
      data: { deletedAt: new Date() },
    }).catch(() => {});
    await storage.delete(storageKey).catch(() => {});
  });
});
