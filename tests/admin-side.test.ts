import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, PaymentStatus, PaperStatus, ExamType, AuditRiskLevel, ProgramType, PaymentMethod } from '@prisma/client';
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

describe('STEP 10: Complete Admin Side Backend & Role Separation', () => {
  let adminUser: any;
  let contentManagerUser: any;
  let paymentVerifierUser: any;
  let studentUser: any;
  let testCourse: any;
  let testPaper: any;
  let testPayment: any;

  beforeAll(async () => {
    // Clean database
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "WantedPaper", "PaperViewLog", "AuditLog", "Notification", "Entitlement", 
        "Payment", "ExamPaper", "ProgramTermCourse", "Course", 
        "ProgramTerm", "Term", "User", "Program", "Campus", "SystemSetting" 
      CASCADE;
    `);

    // Setup Campus & Stream
    const campus = await prisma.campus.create({
      data: { code: 'WOLISO', name: 'Ambo University' },
    });

    const program = await prisma.program.create({
      data: { campusId: campus.id, code: 'NAT_SCI', name: 'Natural Science', type: ProgramType.STREAM },
    });

    const term = await prisma.term.create({
      data: { yearNumber: 1, semesterNumber: 1, name: 'Year 1, Semester 1' },
    });

    const programTerm = await prisma.programTerm.create({
      data: { programId: program.id, termId: term.id, priceEtb: 50.0 },
    });

    // 11 Freshman Courses
    testCourse = await prisma.course.create({
      data: { code: 'FLEn 1011', title: 'Communicative English Language Skills I', creditHours: 3 },
    });

    await prisma.course.create({
      data: { code: 'MATH 1011', title: 'Mathematics for Natural Sciences', creditHours: 3 },
    });

    await prisma.programTermCourse.create({
      data: { programTermId: programTerm.id, courseId: testCourse.id },
    });

    // Users with separated roles
    adminUser = await prisma.user.create({
      data: {
        fullName: 'Campus Administrator',
        email: 'admin.unit@amu.edu.et',
        passwordHash: 'hashed',
        role: Role.ADMIN,
      },
    });

    contentManagerUser = await prisma.user.create({
      data: {
        fullName: 'Dawit Content Lead',
        email: 'content.unit@amu.edu.et',
        passwordHash: 'hashed',
        role: Role.CONTENT_MANAGER,
      },
    });

    paymentVerifierUser = await prisma.user.create({
      data: {
        fullName: 'Hana Payment Verifier',
        email: 'verifier.unit@amu.edu.et',
        passwordHash: 'hashed',
        role: Role.PAYMENT_VERIFIER,
      },
    });

    studentUser = await prisma.user.create({
      data: {
        fullName: 'Abenezer Student',
        studentId: 'AMU-2026-0042',
        email: 'abenezer.test@amu.edu.et',
        passwordHash: 'hashed',
        role: Role.STUDENT,
        programId: program.id,
        canSell: true,
      },
    });

    // Create an initial approved payment
    testPayment = await prisma.payment.create({
      data: {
        referenceCode: 'EV-2026-7777',
        userId: studentUser.id,
        programTermId: programTerm.id,
        amountEtb: 50.0,
        paymentMethod: PaymentMethod.TELEBIRR,
        transactionId: 'TB_ADM_TEST_01',
        status: PaymentStatus.APPROVED,
        reviewedById: paymentVerifierUser.id,
      },
    });

    // Create an initial published paper
    testPaper = await prisma.examPaper.create({
      data: {
        courseId: testCourse.id,
        title: 'FLEn 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: 'published/f公共/test_paper.pdf',
        sha256: sha256('sample-initial-pdf-content'),
        mimeType: 'application/pdf',
        fileSizeBytes: 1200000,
        status: PaperStatus.PUBLISHED,
      },
    });

    // Log a paper view
    await prisma.paperViewLog.create({
      data: {
        examPaperId: testPaper.id,
        userId: studentUser.id,
        ipAddress: '197.156.102.50',
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // 1. Overview with Real Numbers
  // -------------------------------------------------------------
  it('1. GET /api/admin/overview returns real aggregations from PostgreSQL', async () => {
    const res = await callApi('GET', '/api/admin/overview', undefined, {
      'x-actor-id': adminUser.id,
      'x-actor-role': 'ADMIN',
    });

    expect(res.status).toBe(200);
    expect(res.body.revenueEtb).toBe(50); // From the approved payment
    expect(res.body.activeStudentsCount).toBe(1); // studentUser
    expect(res.body.publishedPapersCount).toBe(1); // testPaper
    expect(Array.isArray(res.body.topCourses)).toBe(true);
    expect(res.body.topCourses[0].code).toBe('FLEn 1011');
    expect(res.body.topCourses[0].viewsCount).toBe(1);
    expect(Array.isArray(res.body.coverageMatrix)).toBe(true);

    // Verify student cannot view overview
    const studentRes = await callApi('GET', '/api/admin/overview', undefined, {
      'x-actor-id': studentUser.id,
      'x-actor-role': 'STUDENT',
    });
    expect(studentRes.status).toBe(403);
  });

  // -------------------------------------------------------------
  // 2. Role Separation Enforcement
  // -------------------------------------------------------------
  describe('2. Role Separation Enforcement', () => {
    it('CONTENT_MANAGER cannot view or approve payments (403)', async () => {
      // Trying to list payments
      const listRes = await callApi('GET', '/api/payments', undefined, {
        'x-actor-id': contentManagerUser.id,
        'x-actor-role': 'CONTENT_MANAGER',
      });
      expect(listRes.status).toBe(403);
      expect(listRes.body.error).toContain('Content managers');

      // Trying to approve payment
      const approveRes = await callApi('POST', `/api/payments/${testPayment.id}/approve`, {}, {
        'x-actor-id': contentManagerUser.id,
        'x-actor-role': 'CONTENT_MANAGER',
      });
      expect(approveRes.status).toBe(403);
    });

    it('CONTENT_MANAGER cannot view users or roles (403)', async () => {
      const usersRes = await callApi('GET', '/api/users', undefined, {
        'x-actor-id': contentManagerUser.id,
        'x-actor-role': 'CONTENT_MANAGER',
      });
      expect(usersRes.status).toBe(403);
      expect(usersRes.body.error).toContain('Content managers');
    });

    it('PAYMENT_VERIFIER cannot create, edit, or delete papers (403)', async () => {
      // Trying to upload paper
      const createRes = await callApi(
        'POST',
        '/api/papers',
        {
          courseId: testCourse.id,
          title: 'Unauthorized Verifier Paper',
          examType: 'MID',
          examYearEc: 2016,
        },
        {
          'x-actor-id': paymentVerifierUser.id,
          'x-actor-role': 'PAYMENT_VERIFIER',
        }
      );
      expect(createRes.status).toBe(403);
      expect(createRes.body.error).toContain('Payment verifiers are not authorized');

      // Trying to delete paper
      const deleteRes = await callApi('DELETE', `/api/papers/${testPaper.id}`, undefined, {
        'x-actor-id': paymentVerifierUser.id,
        'x-actor-role': 'PAYMENT_VERIFIER',
      });
      expect(deleteRes.status).toBe(403);
    });

    it('Admin can attach, view, and remove verified solutions on exam papers', async () => {
      // 1. Attach solution
      const putRes = await callApi(
        'PUT',
        `/api/papers/${testPaper.id}/solution`,
        {
          solutionText: '1. B - Verified reason\n2. C - Step by step proof',
          solutionVerified: true,
        },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(putRes.status).toBe(200);
      expect(putRes.body.hasSolution).toBe(true);
      expect(putRes.body.solutionText).toContain('1. B - Verified reason');

      // 2. Fetch paper solution
      const getRes = await callApi(
        'GET',
        `/api/papers/${testPaper.id}/solution`,
        undefined,
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.hasSolution).toBe(true);
      expect(getRes.body.solutionText).toContain('2. C - Step by step proof');

      // 3. Papers listing includes hasSolution: true
      const listRes = await callApi('GET', '/api/papers', undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });
      expect(listRes.status).toBe(200);
      const paperInList = listRes.body.find((p: any) => p.id === testPaper.id);
      expect(paperInList?.hasSolution).toBe(true);

      // 4. Unauthorized payment verifier cannot manage solutions
      const unauthRes = await callApi(
        'PUT',
        `/api/papers/${testPaper.id}/solution`,
        { solutionText: 'hacked' },
        {
          'x-actor-id': paymentVerifierUser.id,
          'x-actor-role': 'PAYMENT_VERIFIER',
        }
      );
      expect(unauthRes.status).toBe(403);

      // 5. Clean up / remove solution
      const removeRes = await callApi(
        'PUT',
        `/api/papers/${testPaper.id}/solution`,
        { remove: true },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.hasSolution).toBe(false);
    });

    it('Non-admin cannot change user roles (403), strictly ADMIN only', async () => {
      // Content Manager trying to change a student to ADMIN
      const cmRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { role: 'ADMIN' },
        {
          'x-actor-id': contentManagerUser.id,
          'x-actor-role': 'CONTENT_MANAGER',
        }
      );
      expect(cmRes.status).toBe(403);

      // Payment Verifier trying to change role
      const pvRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { role: 'CONTENT_MANAGER' },
        {
          'x-actor-id': paymentVerifierUser.id,
          'x-actor-role': 'PAYMENT_VERIFIER',
        }
      );
      expect(pvRes.status).toBe(403);

      // ADMIN succeeds in modifying role
      const adminRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { role: 'CONTENT_MANAGER' },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.role).toBe('CONTENT_MANAGER');

      // Restore role back to STUDENT
      await prisma.user.update({ where: { id: studentUser.id }, data: { role: Role.STUDENT } });
    });
  });

  // -------------------------------------------------------------
  // 3. Papers Manager & Duplicate Detection
  // -------------------------------------------------------------
  describe('3. Papers Manager & Duplicate Detection', () => {
    let createdPaperId: string;
    const uniquePaperSha = sha256('new-unique-pdf-binary-2026');

    it('Detects duplicate SHA-256 and rejects with 409 and warning details unless force=true', async () => {
      // Attempting to upload a paper with the exact same sha256 as testPaper
      const dupRes = await callApi(
        'POST',
        '/api/papers',
        {
          courseId: testCourse.id,
          title: 'Duplicate Upload Attempt',
          sha256: testPaper.sha256,
          force: false,
        },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toContain('Duplicate detected');
      expect(dupRes.body.details.isDuplicate).toBe(true);
      expect(dupRes.body.details.existingPaper.title).toBe(testPaper.title);

      // Pre-check endpoint rejects unauthenticated requests
      const unauthPrecheck = await callApi('GET', `/api/papers/check-duplicate?sha256=${testPaper.sha256}`);
      expect(unauthPrecheck.status).toBe(401);

      // Authenticated admin pre-check endpoint succeeds
      const precheck = await callApi('GET', `/api/papers/check-duplicate?sha256=${testPaper.sha256}`, undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });
      expect(precheck.status).toBe(200);
      expect(precheck.body.isDuplicate).toBe(true);
      expect(precheck.body.paper.title).toBe(testPaper.title);
    });

    it('Creates paper with status DRAFT / PUBLISHED / HIDDEN', async () => {
      const res = await callApi(
        'POST',
        '/api/papers',
        {
          courseId: testCourse.id,
          title: 'FLEn 1011 · Mid Exam 2016 E.C. (Draft)',
          examType: 'MID',
          examYearEc: 2016,
          quality: 'EXCELLENT',
          status: 'DRAFT',
          isFreeSample: false,
          sha256: uniquePaperSha,
          fileBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64'),
        },
        {
          'x-actor-id': contentManagerUser.id,
          'x-actor-role': 'CONTENT_MANAGER',
        }
      );

      expect(res.status).toBe(201);
      expect(res.body.title).toContain('Mid Exam 2016 E.C. (Draft)');
      expect(res.body.status).toBe('DRAFT');
      createdPaperId = res.body.id;

      // Verify Audit Log was recorded
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: createdPaperId, action: 'Exam paper uploaded/created' },
      });
      expect(audit).toBeDefined();
    });

    it('Replaces paper file and updates SHA-256 and storageKey', async () => {
      const replacementSha = sha256('replaced-better-quality-scan-content');
      const res = await callApi(
        'POST',
        `/api/papers/${createdPaperId}/replace-file`,
        {
          sha256: replacementSha,
          storageKey: 'published/flen1011/replaced_scan.pdf',
          mimeType: 'application/pdf',
          fileSizeBytes: 2100000,
        },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.sha256).toBe(replacementSha);
      expect(res.body.storageKey).toBe('published/flen1011/replaced_scan.pdf');
    });

    it('Soft deletes paper (deletedAt set) and restores it (deletedAt null)', async () => {
      // Soft Delete
      const delRes = await callApi('DELETE', `/api/papers/${createdPaperId}`, undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });
      expect(delRes.status).toBe(200);

      const paperInDb = await prisma.examPaper.findUnique({ where: { id: createdPaperId } });
      expect(paperInDb?.deletedAt).not.toBeNull();

      // Restore
      const restoreRes = await callApi('POST', `/api/papers/${createdPaperId}/restore`, undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });
      expect(restoreRes.status).toBe(200);

      const restoredInDb = await prisma.examPaper.findUnique({ where: { id: createdPaperId } });
      expect(restoredInDb?.deletedAt).toBeNull();
    });

    it('Bulk upload creates multiple papers', async () => {
      const bulkRes = await callApi(
        'POST',
        '/api/papers',
        {
          bulk: [
            {
              courseId: testCourse.id,
              title: 'FLEn 1011 · Quiz 1 2016 E.C.',
              examType: 'QUIZ',
              examYearEc: 2016,
              status: 'PUBLISHED',
              sha256: sha256('bulk-quiz-1-content'),
              fileBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64'),
            },
            {
              courseId: testCourse.id,
              title: 'FLEn 1011 · Quiz 2 2016 E.C.',
              examType: 'QUIZ',
              examYearEc: 2016,
              status: 'PUBLISHED',
              sha256: sha256('bulk-quiz-2-content'),
              fileBase64: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF').toString('base64'),
            },
          ],
        },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );

      expect(bulkRes.status).toBe(201);
      expect(bulkRes.body.count).toBe(2);
      expect(bulkRes.body.papers.length).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 4. Wanted Papers Manager
  // -------------------------------------------------------------
  describe('4. Wanted-Papers Manager', () => {
    let wantedId: string;

    it('Creates, updates, and deletes wanted papers', async () => {
      // Create Wanted Paper
      const createRes = await callApi(
        'POST',
        '/api/wanted-papers',
        {
          courseId: testCourse.id,
          examType: 'MID',
          offeredPriceEtb: 150,
          notes: 'Clear scan of 2016 E.C. mid examination wanted.',
        },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );

      expect(createRes.status).toBe(201);
      expect(Number(createRes.body.offeredPriceEtb)).toBe(150);
      expect(createRes.body.isOpen).toBe(true);
      wantedId = createRes.body.id;

      // Update (Toggle closed)
      const patchRes = await callApi(
        'PATCH',
        `/api/wanted-papers/${wantedId}`,
        { isOpen: false, offeredPriceEtb: 175 },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.isOpen).toBe(false);
      expect(Number(patchRes.body.offeredPriceEtb)).toBe(175);

      // Delete
      const delRes = await callApi('DELETE', `/api/wanted-papers/${wantedId}`, undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });
      expect(delRes.status).toBe(200);

      const check = await prisma.wantedPaper.findUnique({ where: { id: wantedId } });
      expect(check).toBeNull();
    });
  });

  // -------------------------------------------------------------
  // 5. Users Manager: Access History & Suspension
  // -------------------------------------------------------------
  describe('5. Users Manager: Access History & Controls', () => {
    it('GET /api/users/:id/access-history returns entitlements, payments, and view logs', async () => {
      const res = await callApi('GET', `/api/users/${studentUser.id}/access-history`, undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });

      expect(res.status).toBe(200);
      expect(res.body.user.studentId).toBe('AMU-2026-0042');
      expect(Array.isArray(res.body.payments)).toBe(true);
      expect(res.body.payments.length).toBeGreaterThan(0);
      expect(Array.isArray(res.body.views)).toBe(true);
      expect(res.body.views[0].courseCode).toBe('FLEn 1011');
    });

    it('Suspends and reactivates user account', async () => {
      // Suspend
      const suspendRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { isActive: false },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.isActive).toBe(false);

      // Reactivate
      const reactivateRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { isActive: true },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(reactivateRes.status).toBe(200);
      expect(reactivateRes.body.isActive).toBe(true);
    });

    it('Blocks and restores paper selling permissions (canSell)', async () => {
      // Block selling
      const blockRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { canSell: false },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(blockRes.status).toBe(200);
      expect(blockRes.body.canSell).toBe(false);

      // Unblock selling
      const unblockRes = await callApi(
        'PATCH',
        `/api/users/${studentUser.id}`,
        { canSell: true },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );
      expect(unblockRes.status).toBe(200);
      expect(unblockRes.body.canSell).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 6. Settings & Audit Log Viewer
  // -------------------------------------------------------------
  describe('6. Platform Settings & Audit Log Viewer', () => {
    it('Saves platform settings (banner, instructions, limits, pricing)', async () => {
      const res = await callApi(
        'POST',
        '/api/settings',
        {
          actorId: adminUser.id,
          settings: {
            ANNOUNCEMENT_BANNER: 'Final Exam Preparation Week is Live!',
            ANNOUNCEMENT_ACTIVE: 'true',
            MAX_PAYOUT_LIMIT_ETB: '250',
            PAYMENT_INSTRUCTIONS: 'Always include student ID in receipt remarks.',
          },
        },
        {
          'x-actor-id': adminUser.id,
          'x-actor-role': 'ADMIN',
        }
      );

      expect(res.status).toBe(200);

      const bannerSetting = await prisma.systemSetting.findUnique({
        where: { key: 'ANNOUNCEMENT_BANNER' },
      });
      expect(bannerSetting?.value).toBe('Final Exam Preparation Week is Live!');
    });

    it('GET /api/audit-logs returns filtered cryptographic log entries', async () => {
      const res = await callApi('GET', '/api/audit-logs?riskLevel=LOW&limit=10', undefined, {
        'x-actor-id': adminUser.id,
        'x-actor-role': 'ADMIN',
      });

      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(Array.isArray(res.body.logs)).toBe(true);
      expect(res.body.logs[0].riskLevel).toBe(AuditRiskLevel.LOW);
    });
  });
});
