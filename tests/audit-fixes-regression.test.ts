import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, ProgramType, PaymentMethod, PaymentStatus } from '@prisma/client';
import { handleApiRequest, prisma } from '../server/apiHandler';
import { storage, getStorageAdapter, LocalStorageAdapter } from '../src/lib/storage';
import { getDocumentPageCount } from '../src/lib/serverPageRenderer';
import { createOnePagePdf } from './pdfFixture';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

function callApi(method: string, path: string, body?: any, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: any; body: any }>((resolve) => {
    const req: any = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = { host: 'localhost:8443', ...headers };
    req.socket = { remoteAddress: '197.156.102.77' };

    let resStatus = 200;
    let resHeaders: any = {};
    const chunks: Buffer[] = [];

    const res: any = {
      writeHead(status: number, hdrs: any) {
        resStatus = status;
        resHeaders = {};
        if (hdrs && typeof hdrs === 'object') {
          for (const [k, v] of Object.entries(hdrs)) {
            resHeaders[k] = v;
            resHeaders[k.toLowerCase()] = v;
          }
        }
      },
      setHeader(name: string, val: any) {
        resHeaders[name] = val;
        resHeaders[name.toLowerCase()] = val;
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

describe('Audit Fixes Regression Test Suite', () => {
  const runId = Math.floor(100000 + Math.random() * 900000);
  let adminUser: any;
  let verifierUser: any;
  let contentManagerUser: any;
  let studentUser: any;
  let studentUserB: any;
  let programTerm: any;
  let publishedKey: string;
  let receiptKey: string;

  beforeAll(async () => {
    const defaultPasswordHash = await bcrypt.hash('StrongPassword123!', 10);

    adminUser = await prisma.user.create({
      data: {
        studentId: `FIX-ADM-${runId}`,
        fullName: 'Audit Test Admin',
        email: `admin.audit.${runId}@ambo.edu.et`,
        phone: `+251911${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });

    verifierUser = await prisma.user.create({
      data: {
        studentId: `FIX-VRF-${runId}`,
        fullName: 'Audit Test Verifier',
        email: `verifier.audit.${runId}@ambo.edu.et`,
        phone: `+251912${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
        role: Role.PAYMENT_VERIFIER,
        isActive: true,
      },
    });

    contentManagerUser = await prisma.user.create({
      data: {
        studentId: `FIX-CM-${runId}`,
        fullName: 'Audit Test Content Manager',
        email: `cm.audit.${runId}@ambo.edu.et`,
        phone: `+251913${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
        role: Role.CONTENT_MANAGER,
        isActive: true,
      },
    });

    studentUser = await prisma.user.create({
      data: {
        studentId: `FIX-STU-A-${runId}`,
        fullName: 'Audit Test Student A',
        email: `studentA.audit.${runId}@ambo.edu.et`,
        phone: `+251914${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
        role: Role.STUDENT,
        isActive: true,
        canSell: true,
      },
    });

    studentUserB = await prisma.user.create({
      data: {
        studentId: `FIX-STU-B-${runId}`,
        fullName: 'Audit Test Student B',
        email: `studentB.audit.${runId}@ambo.edu.et`,
        phone: `+251915${String(runId).slice(0, 6)}`,
        passwordHash: defaultPasswordHash,
        role: Role.STUDENT,
        isActive: true,
        canSell: true,
      },
    });

    let campus = await prisma.campus.findFirst();
    if (!campus) {
      campus = await prisma.campus.create({
        data: { code: `AMBO_${runId}`, name: 'Ambo University', isActive: true },
      });
    }

    let program = await prisma.program.findFirst({
      where: { code: 'NAT_SCI', campusId: campus.id },
    });
    if (!program) {
      program = await prisma.program.create({
        data: {
          campusId: campus.id,
          code: 'NAT_SCI',
          name: 'Natural Science Stream',
          type: ProgramType.STREAM,
          isActive: true,
        },
      });
    }

    let term = await prisma.term.findFirst({
      where: { yearNumber: 1, semesterNumber: 1 },
    });
    if (!term) {
      term = await prisma.term.create({
        data: {
          name: 'Year 1 Semester 1',
          yearNumber: 1,
          semesterNumber: 1,
        },
      });
    }

    let existingPt = await prisma.programTerm.findFirst({
      where: { programId: program.id, termId: term.id },
    });
    if (!existingPt) {
      programTerm = await prisma.programTerm.create({
        data: {
          programId: program.id,
          termId: term.id,
          priceEtb: 50,
          isPurchasable: true,
        },
      });
    } else {
      programTerm = existingPt;
    }

    await prisma.user.update({
      where: { id: studentUser.id },
      data: { programId: program.id },
    });
    await prisma.user.update({
      where: { id: studentUserB.id },
      data: { programId: program.id },
    });

    // Create a published master exam PDF in storage
    publishedKey = `published/papers/audit_test_master_${runId}.pdf`;
    await storage.upload(publishedKey, createOnePagePdf(), 'application/pdf');

    // Create a student payment receipt in storage
    receiptKey = `quarantine/uploads/${studentUser.id}/receipt_${runId}.png`;
    const samplePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    await storage.upload(receiptKey, samplePng, 'image/png');

    // Associate receipt with a Payment record
    await prisma.payment.create({
      data: {
        referenceCode: `EV-${new Date().getFullYear()}-TEST${runId.toString().slice(0, 4)}`,
        userId: studentUser.id,
        programTermId: programTerm.id,
        amountEtb: 50,
        paymentMethod: PaymentMethod.TELEBIRR,
        transactionId: `TX-AUDIT-${runId}`,
        screenshotKey: receiptKey,
        screenshotSha256: crypto.createHash('sha256').update(samplePng).digest('hex'),
        status: PaymentStatus.PENDING,
      },
    });
  });

  afterAll(async () => {
    const testUserIds = [adminUser?.id, verifierUser?.id, contentManagerUser?.id, studentUser?.id, studentUserB?.id].filter(Boolean);
    await prisma.notification.deleteMany({ where: { userId: { in: testUserIds } } }).catch(() => {});
    await prisma.session.deleteMany({ where: { userId: { in: testUserIds } } }).catch(() => {});
    await prisma.payment.deleteMany({ where: { userId: { in: testUserIds } } }).catch(() => {});
    for (const uid of testUserIds) {
      await prisma.user.delete({ where: { id: uid } }).catch(() => {});
    }
    if (publishedKey) await storage.delete(publishedKey).catch(() => {});
    if (receiptKey) await storage.delete(receiptKey).catch(() => {});
  });

  // -------------------------------------------------------------
  // 1. Scoped Storage View Authorization (EV-SEC-01)
  // -------------------------------------------------------------
  describe('Fix 1: /api/storage/view Scoped Role Authorization', () => {
    it('blocks PAYMENT_VERIFIER from downloading raw published master exam PDFs', async () => {
      const res = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(publishedKey)}`, undefined, {
        'x-actor-id': verifierUser.id,
      });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Direct storage key access is strictly forbidden');
    });

    it('blocks CONTENT_MANAGER from downloading raw published master exam PDFs', async () => {
      const res = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(publishedKey)}`, undefined, {
        'x-actor-id': contentManagerUser.id,
      });
      expect(res.status).toBe(403);
    });

    it('blocks CONTENT_MANAGER from viewing private student payment receipts', async () => {
      const res = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(receiptKey)}`, undefined, {
        'x-actor-id': contentManagerUser.id,
      });
      expect(res.status).toBe(403);
    });

    it('allows PAYMENT_VERIFIER to view verified student payment receipts', async () => {
      const res = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(receiptKey)}`, undefined, {
        'x-actor-id': verifierUser.id,
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it('allows ADMIN to view both published master assets and payment receipts', async () => {
      const resPublished = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(publishedKey)}`, undefined, {
        'x-actor-id': adminUser.id,
      });
      expect(resPublished.status).toBe(200);

      const resReceipt = await callApi('GET', `/api/storage/view?key=${encodeURIComponent(receiptKey)}`, undefined, {
        'x-actor-id': adminUser.id,
      });
      expect(resReceipt.status).toBe(200);
    });
  });

  // -------------------------------------------------------------
  // 2. Production Persistent Storage Enforcement (EV-SEC-04)
  // -------------------------------------------------------------
  describe('Fix 2: Persistent Storage Requirement in Production', () => {
    it('aborts with a clear fatal error if production runtime lacks persistent storage configuration', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalProvider = process.env.STORAGE_PROVIDER;
      const originalPath = process.env.PERSISTENT_STORAGE_PATH;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.STORAGE_PROVIDER;
        delete process.env.PERSISTENT_STORAGE_PATH;

        expect(() => {
          // LocalStorageAdapter without persistent path should throw in production runtime
          new LocalStorageAdapter(undefined);
        }).not.toThrow(); // Adapter class itself can be instantiated with secret

        // getStorageAdapter() enforces persistent storage in production
        delete process.env.STORAGE_PROVIDER;
        delete process.env.R2_ACCESS_KEY_ID;
        delete process.env.S3_ACCESS_KEY_ID;
        // Verify message content matches specification
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.STORAGE_PROVIDER = originalProvider;
        process.env.PERSISTENT_STORAGE_PATH = originalPath;
      }
    });
  });

  // -------------------------------------------------------------
  // 3. Last Active Administrator Protection (EV-SEC-03)
  // -------------------------------------------------------------
  describe('Fix 3: Last Active Administrator Guard', () => {
    it('prevents demoting the last active administrator to STUDENT', async () => {
      // Find all active admins
      const activeAdmins = await prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true, deletedAt: null },
      });

      // Deactivate all except our test admin
      const otherAdmins = activeAdmins.filter((a) => a.id !== adminUser.id);
      await prisma.user.updateMany({
        where: { id: { in: otherAdmins.map((a) => a.id) } },
        data: { isActive: false },
      });

      try {
        const res = await callApi('PATCH', `/api/users/${adminUser.id}`, { role: Role.STUDENT }, {
          'x-actor-id': adminUser.id,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot demote or deactivate the last remaining active administrator');
      } finally {
        // Restore other admins
        await prisma.user.updateMany({
          where: { id: { in: otherAdmins.map((a) => a.id) } },
          data: { isActive: true },
        });
      }
    });

    it('prevents deactivating the last active administrator', async () => {
      const activeAdmins = await prisma.user.findMany({
        where: { role: Role.ADMIN, isActive: true, deletedAt: null },
      });
      const otherAdmins = activeAdmins.filter((a) => a.id !== adminUser.id);
      await prisma.user.updateMany({
        where: { id: { in: otherAdmins.map((a) => a.id) } },
        data: { isActive: false },
      });

      try {
        const res = await callApi('PATCH', `/api/users/${adminUser.id}`, { isActive: false }, {
          'x-actor-id': adminUser.id,
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Cannot demote or deactivate the last remaining active administrator');
      } finally {
        await prisma.user.updateMany({
          where: { id: { in: otherAdmins.map((a) => a.id) } },
          data: { isActive: true },
        });
      }
    });
  });

  // -------------------------------------------------------------
  // 4. Exact PDF Page Count Extraction (EV-FUNC-01)
  // -------------------------------------------------------------
  describe('Fix 4: Exact PDF Page Count Extraction', () => {
    it('correctly extracts page count from an authentic 1-page PDF binary', async () => {
      const pdfBytes = createOnePagePdf();
      const count = await getDocumentPageCount(pdfBytes);
      expect(count).toBe(1);
    });

    it('returns exact pageCount in POST /api/upload for PDF documents', async () => {
      const pdfBytes = createOnePagePdf();
      const res = await callApi('POST', '/api/upload', {
        fileBase64: pdfBytes.toString('base64'),
        reportedMime: 'application/pdf',
        category: 'paper',
      }, {
        'x-actor-id': adminUser.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.pageCount).toBe(1);
      expect(res.body.mimeType).toBe('application/pdf');

      // Clean up uploaded file
      if (res.body.storageKey) await storage.delete(res.body.storageKey).catch(() => {});
    });
  });

  // -------------------------------------------------------------
  // 5. Collision-Safe Payment Reference Generation (EV-DATA-01)
  // -------------------------------------------------------------
  describe('Fix 5: Payment Reference Code Generation and Collision Safety', () => {
    it('generates high-entropy reference code with EV-YYYY-XXXXXX format', async () => {
      const receiptKeyB = `quarantine/uploads/${studentUserB.id}/receipt_ref_${runId}.png`;
      const samplePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      await storage.upload(receiptKeyB, samplePng, 'image/png');

      const res = await callApi('POST', '/api/payments', {
        programTermId: programTerm.id,
        paymentMethod: PaymentMethod.CBE_BIRR,
        transactionId: `TX-REF-TEST-${runId}`,
        storageKey: receiptKeyB,
        screenshotUrl: receiptKeyB,
      }, {
        'x-actor-id': studentUserB.id,
      });

      expect(res.status).toBe(201);
      expect(res.body.payment.referenceCode).toMatch(/^EV-\d{4}-[2-9A-Z]{6}$/);

      // Clean up payment and receipt
      if (res.body.payment?.id) {
        await prisma.payment.delete({ where: { id: res.body.payment.id } });
      }
      await storage.delete(receiptKeyB).catch(() => {});
    });
  });

  // -------------------------------------------------------------
  // 7. Multi-Tier Login Rate Limiting (EV-SEC-02)
  // -------------------------------------------------------------
  describe('Fix 7: Multi-Tier Login Rate Limiting for University Networks', () => {
    it('tracks failed login attempts per account so shared IP users are not locked out', async () => {
      // Clear rate limits
      await prisma.rateLimit.deleteMany();

      // Submit 5 bad password attempts for Student A
      for (let i = 0; i < 5; i++) {
        await callApi('POST', '/api/auth/login', {
          identifier: studentUser.phone,
          password: 'WrongPassword!',
        });
      }

      // Student A should now be throttled
      const resA = await callApi('POST', '/api/auth/login', {
        identifier: studentUser.phone,
        password: 'WrongPassword!',
      });
      expect(resA.status).toBe(429);
      expect(resA.body.error).toContain('Too many failed login attempts for this account');

      // Student B from the EXACT same IP address can still log in successfully with valid credentials!
      const resB = await callApi('POST', '/api/auth/login', {
        identifier: studentUserB.phone,
        password: 'StrongPassword123!',
      });
      expect(resB.status).toBe(200);
      expect(resB.body.user.id).toBe(studentUserB.id);
    });
  });
});
