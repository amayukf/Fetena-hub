import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, PaymentStatus, PaperStatus, ExamType, AuditRiskLevel, ProgramType, PaymentMethod } from '@prisma/client';
import { handleApiRequest, prisma, checkRateLimit } from '../server/apiHandler';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { detectFileSignature, validateStorageKey, storage } from '../src/lib/storage';

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

/**
 * HTTP header names are case-insensitive, so look a header up without caring
 * how the server happened to capitalise it.
 */
function header(res: { headers: any }, name: string): string | undefined {
  const target = name.toLowerCase();
  const key = Object.keys(res.headers || {}).find((k) => k.toLowerCase() === target);
  return key ? res.headers[key] : undefined;
}

describe('PART 4: Security Review & Adversarial Attack Regression Suite', () => {
  let adminUser: any;
  let contentManagerUser: any;
  let paymentVerifierUser: any;
  let studentA: any; // Natural Science, paid Y1S1
  let studentB: any; // Social Science, unpaid
  let coursePhysNat: any;
  let coursePhilShared: any;
  let courseEconSoc: any;
  let paperPhysPublished: any;
  let paperDraft: any;
  let paperHidden: any;
  let natProgramTerm: any;
  let socProgramTerm: any;
  let studentAPayment: any;
  let studentASessionToken: string;

  beforeAll(async () => {
    // Clean tables for isolated run
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "WantedPaper", "PaperViewLog", "AuditLog", "Notification", "Entitlement", 
        "Payment", "ExamPaper", "ProgramTermCourse", "Course", 
        "ProgramTerm", "Term", "User", "Program", "Campus", "SystemSetting", "RateLimit", "Session" 
      CASCADE;
    `);

    // Reference campus & programs
    const campus = await prisma.campus.create({
      data: { code: 'WOLISO', name: 'Ambo University' },
    });

    const natProg = await prisma.program.create({
      data: { campusId: campus.id, code: 'NAT_SCI', name: 'Natural Science Stream', type: ProgramType.STREAM },
    });
    const socProg = await prisma.program.create({
      data: { campusId: campus.id, code: 'SOC_SCI', name: 'Social Science Stream', type: ProgramType.STREAM },
    });

    const termY1S1 = await prisma.term.create({
      data: { yearNumber: 1, semesterNumber: 1, name: 'Year 1 Semester 1' },
    });

    natProgramTerm = await prisma.programTerm.create({
      data: { programId: natProg.id, termId: termY1S1.id, priceEtb: 50.00, isPurchasable: true },
    });
    socProgramTerm = await prisma.programTerm.create({
      data: { programId: socProg.id, termId: termY1S1.id, priceEtb: 50.00, isPurchasable: true },
    });

    // Courses
    coursePhysNat = await prisma.course.create({
      data: { code: 'Phys 1011', title: 'General Physics', creditHours: 3 },
    });
    coursePhilShared = await prisma.course.create({
      data: { code: 'Phil 1011', title: 'Introduction to Logic and Critical Thinking', creditHours: 3 },
    });
    courseEconSoc = await prisma.course.create({
      data: { code: 'Econ 1011', title: 'Introduction to Economics', creditHours: 3 },
    });

    await prisma.programTermCourse.createMany({
      data: [
        { programTermId: natProgramTerm.id, courseId: coursePhysNat.id },
        { programTermId: natProgramTerm.id, courseId: coursePhilShared.id },
        { programTermId: socProgramTerm.id, courseId: coursePhilShared.id },
        { programTermId: socProgramTerm.id, courseId: courseEconSoc.id },
      ],
    });

    // Users
    const pwdHash = await bcrypt.hash('TestPassword123!', 10);
    adminUser = await prisma.user.create({
      data: { fullName: 'Security Admin', email: 'sec_admin@ambo.edu.et', role: Role.ADMIN, passwordHash: pwdHash, isActive: true },
    });
    contentManagerUser = await prisma.user.create({
      data: { fullName: 'Content Reviewer', email: 'sec_cm@ambo.edu.et', role: Role.CONTENT_MANAGER, passwordHash: pwdHash, isActive: true },
    });
    paymentVerifierUser = await prisma.user.create({
      data: { fullName: 'Payment Auditor', email: 'sec_pv@ambo.edu.et', role: Role.PAYMENT_VERIFIER, passwordHash: pwdHash, isActive: true },
    });

    studentA = await prisma.user.create({
      data: { fullName: 'Student NatSci', email: 'nat_student@ambo.edu.et', studentId: 'AMU-NAT-SEC-01', role: Role.STUDENT, programId: natProg.id, passwordHash: pwdHash, isActive: true },
    });
    studentB = await prisma.user.create({
      data: { fullName: 'Student SocSci', email: 'soc_student@ambo.edu.et', studentId: 'AMU-SOC-SEC-02', role: Role.STUDENT, programId: socProg.id, passwordHash: pwdHash, isActive: true },
    });

    // Student A Entitlement (Natural Science)
    await prisma.entitlement.create({
      data: { userId: studentA.id, programTermId: natProgramTerm.id, isActive: true },
    });

    // Student A Payment
    studentAPayment = await prisma.payment.create({
      data: {
        referenceCode: 'EV-SEC-2026-001',
        userId: studentA.id,
        programTermId: natProgramTerm.id,
        amountEtb: 50.00,
        paymentMethod: PaymentMethod.TELEBIRR,
        transactionId: 'TB_SEC_ORIGINAL_001',
        status: PaymentStatus.APPROVED,
      },
    });

    // Create session for Student A
    studentASessionToken = crypto.randomUUID();
    await prisma.session.create({
      data: {
        userId: studentA.id,
        sessionTokenHash: sha256(studentASessionToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Upload files to storage for testing
    await storage.upload('published/phys1011_final_2015.pdf', Buffer.from('REAL-TEST-PDF-PHYS-FINAL'), 'application/pdf');
    await storage.upload('published/phys1011_draft_2016.pdf', Buffer.from('REAL-TEST-PDF-PHYS-DRAFT'), 'application/pdf');
    await storage.upload('published/phys1011_hidden_2016.pdf', Buffer.from('REAL-TEST-PDF-PHYS-HIDDEN'), 'application/pdf');

    // Papers
    paperPhysPublished = await prisma.examPaper.create({
      data: {
        courseId: coursePhysNat.id,
        title: 'Phys 1011 · Final Exam 2015 E.C.',
        examType: ExamType.FINAL,
        examYearEc: 2015,
        storageKey: 'published/phys1011_final_2015.pdf',
        sha256: sha256('phys-final-2015-content'),
        status: PaperStatus.PUBLISHED,
        isFreeSample: false,
      },
    });

    paperDraft = await prisma.examPaper.create({
      data: {
        courseId: coursePhysNat.id,
        title: 'Phys 1011 · Mid Exam Draft',
        examType: ExamType.MID,
        examYearEc: 2016,
        storageKey: 'published/phys1011_draft_2016.pdf',
        sha256: sha256('phys-draft-2016-content'),
        status: PaperStatus.DRAFT,
        isFreeSample: false,
      },
    });

    paperHidden = await prisma.examPaper.create({
      data: {
        courseId: coursePhysNat.id,
        title: 'Phys 1011 · Hidden Exam',
        examType: ExamType.MID,
        examYearEc: 2016,
        storageKey: 'published/phys1011_hidden_2016.pdf',
        sha256: sha256('phys-hidden-2016-content'),
        status: PaperStatus.HIDDEN,
        isFreeSample: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 1: Paper Access & Storage Tampering
  // -------------------------------------------------------------
  describe('Attack 1: Unauthorized Paper Access & Storage Bypass', () => {
    it('1.1: Requesting paper access without login returns 401', async () => {
      const res = await callApi('GET', `/api/papers/${paperPhysPublished.id}/access`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('1.2: Unpaid student B cannot access paperPhysPublished (403)', async () => {
      const res = await callApi('GET', `/api/papers/${paperPhysPublished.id}/access`, undefined, {
        'x-actor-id': studentB.id,
      });
      expect(res.status).toBe(403);
      expect(res.body.allowed).toBe(false);
    });

    it('1.3: Legacy direct streaming endpoint never returns a paper file', async () => {
      const noTokenRes = await callApi('GET', `/api/papers/${paperPhysPublished.id}/stream`);
      expect(noTokenRes.status).toBe(410);
      expect(noTokenRes.body.error).toContain('Direct paper streaming is disabled');

      const legacyTicketRes = await callApi('GET', `/api/papers/${paperPhysPublished.id}/stream?token=legacy&expires=${Date.now() + 60000}`);
      expect(legacyTicketRes.status).toBe(410);
    });

    it('1.4: Published and draft papers cannot be obtained through the legacy stream route', async () => {
      const publishedRes = await callApi('GET', `/api/papers/${paperPhysPublished.id}/stream`);
      const draftRes = await callApi('GET', `/api/papers/${paperDraft.id}/stream?token=legacy`);
      expect(publishedRes.status).toBe(410);
      expect(draftRes.status).toBe(410);
    });

    it('1.5: Direct storage key access without signed URL is rejected (403)', async () => {
      const res = await callApi('GET', '/api/storage/view?key=quarantine/secret.pdf');
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Direct storage key access is strictly forbidden');
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 2: IDOR (Insecure Direct Object Reference)
  // -------------------------------------------------------------
  describe('Attack 2: IDOR Prevention across Users & Payments', () => {
    it('2.1: Student B cannot view Student A access history or payments (403)', async () => {
      const res = await callApi('GET', `/api/users/${studentA.id}/access-history`, undefined, {
        'x-actor-id': studentB.id,
        'x-actor-role': 'STUDENT',
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Access denied');
    });

    it('2.2: Unauthenticated user cannot view access history (401)', async () => {
      const res = await callApi('GET', `/api/users/${studentA.id}/access-history`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Authentication required');
    });

    it('2.3: Student cannot pass arbitrary userId query to spoof paper authorization', async () => {
      // Student B logged in, attempts to pass Student A ID in query
      const res = await callApi('GET', `/api/papers/${paperPhysPublished.id}/access?userId=${studentA.id}`, undefined, {
        'x-actor-id': studentB.id,
      });
      // Must be evaluated using studentB identity -> denied because Student B has no entitlement!
      expect(res.status).toBe(403);
      expect(res.body.allowed).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 3: Role Separation & Privilege Escalation
  // -------------------------------------------------------------
  describe('Attack 3: Server-Enforced Role Separation', () => {
    it('3.1: Student calling admin overview returns 403', async () => {
      const res = await callApi('GET', '/api/admin/overview', undefined, {
        'x-actor-id': studentA.id,
      });
      expect(res.status).toBe(403);
    });

    it('3.2: CONTENT_MANAGER calling payments list returns 403', async () => {
      const res = await callApi('GET', '/api/payments', undefined, {
        'x-actor-id': contentManagerUser.id,
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Content managers');
    });

    it('3.3: PAYMENT_VERIFIER attempting to upload paper returns 403', async () => {
      const res = await callApi('POST', '/api/papers', {
        courseId: coursePhysNat.id,
        title: 'Hacked Paper by Verifier',
      }, {
        'x-actor-id': paymentVerifierUser.id,
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Payment verifiers');
    });

    it('3.4: Only ADMIN can change user roles (CONTENT_MANAGER cannot)', async () => {
      const res = await callApi('PATCH', `/api/users/${studentB.id}`, { role: 'ADMIN' }, {
        'x-actor-id': contentManagerUser.id,
      });
      expect(res.status).toBe(403);
    });

    it('3.5: Non-admin cannot update system settings (403)', async () => {
      const res = await callApi('POST', '/api/settings', {
        settings: { ANNOUNCEMENT_BANNER: 'Hacked Banner' },
      }, {
        'x-actor-id': studentA.id,
      });
      expect(res.status).toBe(403);
    });

    it('3.6: Non-admin cannot view cryptographic audit logs (403)', async () => {
      const res = await callApi('GET', '/api/audit-logs', undefined, {
        'x-actor-id': paymentVerifierUser.id,
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('administrators');
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 4: Mass Assignment on Registration
  // -------------------------------------------------------------
  describe('Attack 4: Registration Mass Assignment & Privilege Escalation', () => {
    it('4.1: Signup payload with role=ADMIN is strictly forced to STUDENT', async () => {
      const res = await callApi('POST', '/api/auth/signup', {
        fullName: 'Hacker Wannabe',
        email: 'hacker@ambo.edu.et',
        password: 'SecurePassword123!',
        role: 'ADMIN', // Injection attempt
        canSell: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe(Role.STUDENT);

      const dbUser = await prisma.user.findUnique({ where: { email: 'hacker@ambo.edu.et' } });
      expect(dbUser?.role).toBe(Role.STUDENT);
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 5: Financial Replays & Tampering
  // -------------------------------------------------------------
  describe('Attack 5: Financial Idempotency & Tampering Protection', () => {
    it('5.1: Reusing an existing transactionId fails with 409', async () => {
      const res = await callApi('POST', '/api/payments', {
        userId: studentB.id,
        programTermId: socProgramTerm.id,
        paymentMethod: 'TELEBIRR',
        transactionId: 'TB_SEC_ORIGINAL_001', // Already used by studentA
        receiptImageStorageKey: 'quarantine/receipt_duplicate.jpg',
        receiptImageSha256: sha256('new-receipt-image'),
        amountEtb: 1.00, // Tampered client price
      }, {
        'x-actor-id': studentB.id,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already been submitted');
    });

    it('5.2: Server derives payment amount strictly from ProgramTerm (client price ignored)', async () => {
      const receiptBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const uploadRes = await callApi('POST', '/api/upload', {
        fileBase64: receiptBytes.toString('base64'),
        reportedMime: 'image/jpeg',
        category: 'screenshot',
      }, { 'x-actor-id': studentB.id });
      expect(uploadRes.status).toBe(201);
      const res = await callApi('POST', '/api/payments', {
        userId: studentB.id,
        programTermId: socProgramTerm.id,
        paymentMethod: 'TELEBIRR',
        transactionId: 'TB_SEC_UNIQUE_002',
        receiptImageStorageKey: uploadRes.body.storageKey,
        amountEtb: 5.00, // Client tries to pay only 5 ETB instead of 50 ETB
      }, {
        'x-actor-id': studentB.id,
      });

      expect(res.status).toBe(201);
      // Database record must have 50 ETB from database!
      const payment = await prisma.payment.findUnique({
        where: { paymentMethod_transactionId: { paymentMethod: PaymentMethod.TELEBIRR, transactionId: 'TB_SEC_UNIQUE_002' } },
      });
      expect(Number(payment?.amountEtb)).toBe(50.00);
    });

    it('5.3: Duplicate pending payment for same student and semester is rejected (409)', async () => {
      const receiptBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const uploadRes = await callApi('POST', '/api/upload', {
        fileBase64: receiptBytes.toString('base64'),
        reportedMime: 'image/jpeg',
        category: 'screenshot',
      }, { 'x-actor-id': studentB.id });
      expect(uploadRes.status).toBe(201);
      const res = await callApi('POST', '/api/payments', {
        userId: studentB.id,
        programTermId: socProgramTerm.id,
        paymentMethod: 'TELEBIRR',
        transactionId: 'TB_SEC_UNIQUE_003',
        receiptImageStorageKey: uploadRes.body.storageKey,
      }, {
        'x-actor-id': studentB.id,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already have a pending payment');
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 6: Upload Validation & Path Traversal
  // -------------------------------------------------------------
  describe('Attack 6: Upload Payload Inspection & Path Traversal', () => {
    it('6.1: Disguised executable renamed to PDF is rejected by magic bytes', async () => {
      const fakeExePdf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff');
      const sig = detectFileSignature(fakeExePdf);
      expect(sig.valid).toBe(false);

      const res = await callApi('POST', '/api/upload', {
        fileBase64: fakeExePdf.toString('base64'),
        reportedMime: 'application/pdf',
        category: 'paper',
      }, {
        'x-actor-id': contentManagerUser.id,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid file format');
    });

    it('6.2: Path traversal characters in storage keys throw an error', () => {
      expect(() => validateStorageKey('quarantine/../../etc/passwd')).toThrow('Path traversal characters');
      expect(() => validateStorageKey('published/..\\windows\\system32')).toThrow('Path traversal characters');
      expect(() => validateStorageKey('public/malicious.pdf')).toThrow('Invalid storage prefix');
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 7: Brute Force & Session Invalidation
  // -------------------------------------------------------------
  describe('Attack 7: Session Destruction & Invalidation', () => {
    it('7.1: Session token is invalidated after logout and cannot be reused', async () => {
      // 1. Student A checks /api/auth/me using active session
      const meResBefore = await callApi('GET', '/api/auth/me', undefined, {
        authorization: `Bearer ${studentASessionToken}`,
      });
      expect(meResBefore.status).toBe(200);
      expect(meResBefore.body.authenticated).toBe(true);

      // 2. Student A logs out
      const logoutRes = await callApi('POST', '/api/auth/logout', undefined, {
        authorization: `Bearer ${studentASessionToken}`,
      });
      expect(logoutRes.status).toBe(200);

      // 3. Re-using the token now fails to authenticate
      const meResAfter = await callApi('GET', '/api/auth/me', undefined, {
        authorization: `Bearer ${studentASessionToken}`,
      });
      expect(meResAfter.status).toBe(200);
      expect(meResAfter.body.authenticated).toBe(false);
    });

    it('7.2: Database-backed rate limiter blocks excessive requests', async () => {
      const testKey = 'test-attack-rate-limiter-ip';
      // Limit 3 within 60 seconds
      const r1 = await checkRateLimit(testKey, 3, 60);
      expect(r1.allowed).toBe(true);
      const r2 = await checkRateLimit(testKey, 3, 60);
      expect(r2.allowed).toBe(true);
      const r3 = await checkRateLimit(testKey, 3, 60);
      expect(r3.allowed).toBe(true);
      const r4 = await checkRateLimit(testKey, 3, 60);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
    });
  });

  // -------------------------------------------------------------
  // ATTACK VECTOR 8: Security Headers Verification
  // -------------------------------------------------------------
  describe('Attack 8: Security Headers and Information Disclosure', () => {
    it('8.1: API responses include HSTS, CSP, and X-Content-Type-Options: nosniff', async () => {
      const res = await callApi('GET', '/health');
      expect(res.status).toBe(200);
      expect(header(res, 'x-content-type-options')).toBe('nosniff');
      expect(header(res, 'x-frame-options')).toBe('DENY');
      expect(header(res, 'referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(header(res, 'strict-transport-security')).toContain('max-age=31536000');
      expect(header(res, 'content-security-policy')).toContain("default-src 'self'");
    });
  });
});
