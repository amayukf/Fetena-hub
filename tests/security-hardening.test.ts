import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Role, PaymentMethod, ProgramType } from '@prisma/client';
import { handleApiRequest, prisma } from '../server/apiHandler';
import { generateCompressedPageBuffer } from '../src/lib/pageCompressor';
import { estimatePageCount } from '../src/lib/pageCount';
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
    req.socket = { remoteAddress: '197.156.102.51' };

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

    if (body) req.emit('data', JSON.stringify(body));
    req.emit('end');
  });
}

/**
 * Regression suite for the security fixes applied during the hardening pass.
 * Each test pins behaviour that was previously exploitable or missing.
 */
describe('Security hardening regressions', () => {
  let admin: any;
  let verifier: any;
  let student: any;
  let student2: any;
  let forcedUser: any;
  let natProgram: any;
  let programTerm: any;
  let y1s2Term: any;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "WantedPaper", "PaperViewLog", "AuditLog", "Notification", "Entitlement",
        "Payment", "ExamPaper", "ProgramTermCourse", "Course",
        "ProgramTerm", "Term", "User", "Program", "Campus", "SystemSetting", "RateLimit", "Session"
      CASCADE;
    `);

    const campus = await prisma.campus.create({ data: { code: 'WOLISO', name: 'Ambo University - Woliso Campus' } });
    natProgram = await prisma.program.create({
      data: { campusId: campus.id, code: 'NAT_SCI', name: 'Natural Science Stream', type: ProgramType.STREAM },
    });

    const termY1S1 = await prisma.term.create({
      data: { yearNumber: 1, semesterNumber: 1, name: 'Year 1 Semester 1' },
    });
    y1s2Term = await prisma.term.create({
      data: { yearNumber: 1, semesterNumber: 2, name: 'Year 1 Semester 2' },
    });

    programTerm = await prisma.programTerm.create({
      data: { programId: natProgram.id, termId: termY1S1.id, priceEtb: 50.0, isPurchasable: true },
    });

    const pwdHash = await bcrypt.hash('TestPassword123!', 10);

    admin = await prisma.user.create({
      data: { fullName: 'Hardening Admin', email: 'hard_admin@woliso.edu.et', role: Role.ADMIN, passwordHash: pwdHash, isActive: true },
    });
    verifier = await prisma.user.create({
      data: { fullName: 'Hardening Verifier', email: 'hard_pv@woliso.edu.et', role: Role.PAYMENT_VERIFIER, passwordHash: pwdHash, isActive: true },
    });
    student = await prisma.user.create({
      data: { fullName: 'Hardening Student', email: 'hard_student@woliso.edu.et', studentId: 'AMU-HARD-01', role: Role.STUDENT, programId: natProgram.id, passwordHash: pwdHash, isActive: true },
    });
    student2 = await prisma.user.create({
      data: { fullName: 'Hardening Student Two', email: 'hard_student2@woliso.edu.et', studentId: 'AMU-HARD-02', role: Role.STUDENT, programId: natProgram.id, passwordHash: pwdHash, isActive: true },
    });
    forcedUser = await prisma.user.create({
      data: { fullName: 'Forced Password User', email: 'hard_forced@woliso.edu.et', studentId: 'AMU-HARD-03', role: Role.STUDENT, programId: natProgram.id, passwordHash: pwdHash, isActive: true, mustChangePassword: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // Paywall bypass / receipt key trust
  // -------------------------------------------------------------------------

  it('rejects a "published/" key used as a payment receipt (paywall bypass)', async () => {
    const res = await callApi(
      'POST',
      '/api/payments',
      {
        programTermId: programTerm.id,
        paymentMethod: 'TELEBIRR',
        transactionId: 'TB_HARDEN_001',
        storageKey: 'published/some-paper-file.pdf',
      },
      { 'x-actor-id': student.id }
    );

    expect(res.status).toBe(400);
    const payment = await prisma.payment.findFirst({ where: { transactionId: 'TB_HARDEN_001' } });
    expect(payment).toBeNull();
  });

  it('accepts a server-generated "quarantine/" receipt key', async () => {
    const res = await callApi(
      'POST',
      '/api/payments',
      {
        programTermId: programTerm.id,
        paymentMethod: 'TELEBIRR',
        transactionId: 'TB_HARDEN_002',
        storageKey: 'quarantine/hardening-receipt.jpg',
      },
      { 'x-actor-id': student.id }
    );

    expect(res.status).toBe(201);
  });

  it('serves no published asset to a student through /api/storage/view', async () => {
    const res = await callApi('GET', '/api/storage/view?key=published/whatever.pdf', undefined, {
      'x-actor-id': student.id,
    });
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Term interest: authentication + phone overwrite
  // -------------------------------------------------------------------------

  it('requires authentication for /api/term-interest', async () => {
    const res = await callApi('POST', '/api/term-interest', {
      userId: student.id,
      termId: y1s2Term.id,
    });
    expect(res.status).toBe(401);
  });

  it('ignores a client-supplied userId and never rewrites a phone number', async () => {
    const res = await callApi(
      'POST',
      '/api/term-interest',
      {
        userId: admin.id, // attacker claims to be the admin
        termId: y1s2Term.id,
        contact: '+251900000000',
      },
      { 'x-actor-id': student.id }
    );

    expect([200, 201]).toContain(res.status);
    const ownRecord = await prisma.termInterest.findFirst({ where: { userId: student.id, termId: y1s2Term.id } });
    const adminRecord = await prisma.termInterest.findFirst({ where: { userId: admin.id, termId: y1s2Term.id } });
    expect(ownRecord).not.toBeNull();
    expect(adminRecord).toBeNull();

    // No phone number was written from the unverified contact value.
    const adminAfter = await prisma.user.findUnique({ where: { id: admin.id } });
    const studentAfter = await prisma.user.findUnique({ where: { id: student.id } });
    expect(adminAfter?.phone).not.toBe('+251900000000');
    expect(studentAfter?.phone).not.toBe('+251900000000');
  });

  // -------------------------------------------------------------------------
  // mustChangePassword enforcement
  // -------------------------------------------------------------------------

  it('blocks a forced-password-change user from other endpoints but allows the reset flow', async () => {
    const blocked = await callApi('GET', '/api/users', undefined, { 'x-actor-id': forcedUser.id });
    expect(blocked.status).toBe(403);
    expect(String(blocked.body.error)).toContain('Password change required');

    const sessionProbe = await callApi('GET', '/api/auth/me', undefined, { 'x-actor-id': forcedUser.id });
    expect(sessionProbe.status).toBe(200);

    const changed = await callApi(
      'POST',
      '/api/auth/change-password',
      { newPassword: 'BrandNewPassword123!' },
      { 'x-actor-id': forcedUser.id }
    );
    expect(changed.status).toBe(200);

    const after = await prisma.user.findUnique({ where: { id: forcedUser.id } });
    expect(after?.mustChangePassword).toBe(false);

    // And now the previously blocked endpoint is reachable.
    const nowAllowed = await callApi('GET', '/api/papers', undefined, { 'x-actor-id': forcedUser.id });
    expect(nowAllowed.status).toBe(200);
  });

  // -------------------------------------------------------------------------
  // Rejecting a payment revokes the access it granted
  // -------------------------------------------------------------------------

  it('deactivates the granted entitlement when a payment is rejected', async () => {
    const created = await callApi(
      'POST',
      '/api/payments',
      {
        programTermId: programTerm.id,
        paymentMethod: 'TELEBIRR',
        transactionId: 'TB_HARDEN_003',
        storageKey: 'quarantine/hardening-approved.jpg',
      },
      { 'x-actor-id': student2.id }
    );
    expect(created.status).toBe(201);

    const payment = await prisma.payment.findFirst({ where: { transactionId: 'TB_HARDEN_003' } });
    expect(payment).not.toBeNull();

    const approve = await callApi('POST', `/api/payments/${payment!.id}/approve`, {}, { 'x-actor-id': verifier.id });
    expect(approve.status).toBe(200);

    let entitlement = await prisma.entitlement.findFirst({ where: { paymentId: payment!.id } });
    expect(entitlement).not.toBeNull();
    expect(entitlement?.isActive).toBe(true);

    const reject = await callApi(
      'POST',
      `/api/payments/${payment!.id}/reject`,
      { reason: 'Receipt could not be verified' },
      { 'x-actor-id': admin.id }
    );
    expect(reject.status).toBe(200);

    entitlement = await prisma.entitlement.findFirst({ where: { paymentId: payment!.id } });
    expect(entitlement?.isActive).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Reviewer identity is never taken from the request body
  // -------------------------------------------------------------------------

  it('records the authenticated actor as reviewer, not a body-supplied reviewerId', async () => {
    // Reuse the still-pending payment created earlier for `student`.
    const payment = await prisma.payment.findFirst({ where: { transactionId: 'TB_HARDEN_002' } });
    expect(payment).not.toBeNull();
    expect(payment?.status).toBe('PENDING');

    const res = await callApi(
      'POST',
      `/api/payments/${payment!.id}/approve`,
      { reviewerId: student.id }, // attacker-supplied reviewer
      { 'x-actor-id': admin.id }
    );
    expect(res.status).toBe(200);

    const after = await prisma.payment.findUnique({ where: { id: payment!.id } });
    expect(after?.reviewedById).toBe(admin.id);
    expect(after?.reviewedById).not.toBe(student.id);
  });

  // -------------------------------------------------------------------------
  // Pure helpers
  // -------------------------------------------------------------------------

  describe('estimatePageCount', () => {
    it('approximates from file size and clamps to a sane range', () => {
      expect(estimatePageCount(0)).toBe(6); // fallback for unknown sizes
      expect(estimatePageCount(90_000)).toBe(1);
      expect(estimatePageCount(540_000)).toBe(6);
      expect(estimatePageCount(90_000 * 6)).toBe(6);
      expect(estimatePageCount(90_000 * 500)).toBe(60); // clamped
    });

    it('is never the previous hard-coded constant for unusual inputs', () => {
      expect(estimatePageCount(90_000 * 12)).toBe(12);
    });
  });

  describe('compressed page SVG generation', () => {
    it('escapes markup in course and exam titles', () => {
      const svg = generateCompressedPageBuffer(
        'Phys 1011',
        '<script>alert(1)</script>',
        '<foreignObject onload="evil()">',
        1,
        6,
        2015
      ).toString('utf-8');

      expect(svg).not.toContain('<script>');
      expect(svg).not.toContain('<foreignObject');
      expect(svg).toContain('&lt;script&gt;');
      expect(svg).toContain('&lt;foreignObject');
    });

    it('escapes ampersands and quotes', () => {
      const svg = generateCompressedPageBuffer('A&B', '"quoted" & <tag>', "it's", 2, 6, 2015).toString('utf-8');
      expect(svg).toContain('A&amp;B');
      expect(svg).toContain('&quot;quoted&quot;');
      expect(svg).toContain('&apos;');
      expect(svg).not.toContain('<tag>');
    });
  });
});
