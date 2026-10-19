import { describe, it, expect } from 'vitest';
import { handleApiRequest, prisma, runAutomatedHousekeeping } from '../server/apiHandler';
import { Role } from '@prisma/client';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

function makeRequest(
  method: string,
  path: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: any; body: any }> {
  return new Promise<{ status: number; headers: any; body: any }>((resolve) => {
    const req: any = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = { host: 'localhost:8443', ...headers };
    req.socket = { remoteAddress: '127.0.0.1' };

    let resStatus = 200;
    let resHeaders: any = {};
    const chunks: Buffer[] = [];

    const res: any = {
      writeHead(status: number, hdrs: any) {
        resStatus = status;
        resHeaders = hdrs || {};
      },
      setHeader(k: string, v: string) {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader(k: string) {
        return resHeaders[k.toLowerCase()];
      },
      end(chunk?: any) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const resBody = Buffer.concat(chunks);
        try {
          resolve({ status: resStatus, headers: resHeaders, body: JSON.parse(resBody.toString()) });
        } catch {
          resolve({ status: resStatus, headers: resHeaders, body: resBody.toString() });
        }
      },
    };

    handleApiRequest(req, res).catch((err) => {
      resolve({ status: 500, headers: {}, body: { error: err.message } });
    });

    if (body !== undefined) {
      req.emit('data', JSON.stringify(body));
    }
    req.emit('end');
  });
}

describe('Automated Database Housekeeping & Resilience', () => {
  const runId = Math.floor(100000 + Math.random() * 900000);

  it('prunes expired sessions, rate limits, and reset tokens while preserving active records', async () => {
    // 1. Create a test user
    const user = await prisma.user.create({
      data: {
        email: `housekeep.${runId}@ambo.edu.et`,
        fullName: 'Housekeeping Test User',
        passwordHash: 'dummy',
        role: Role.STUDENT,
      },
    });

    // 2. Create expired and valid sessions
    const expiredSessionToken = `expired-${crypto.randomUUID()}`;
    const validSessionToken = `valid-${crypto.randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash: crypto.createHash('sha256').update(expiredSessionToken).digest('hex'),
        expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      },
    });
    const validSession = await prisma.session.create({
      data: {
        userId: user.id,
        sessionTokenHash: crypto.createHash('sha256').update(validSessionToken).digest('hex'),
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours in the future
      },
    });

    // 3. Create expired and valid rate limits
    const expiredRateLimitKey = `rate-expired-${runId}`;
    const validRateLimitKey = `rate-valid-${runId}`;
    await prisma.rateLimit.create({
      data: {
        key: expiredRateLimitKey,
        points: 5,
        expireAt: new Date(Date.now() - 60 * 1000), // 1 min ago
      },
    });
    await prisma.rateLimit.create({
      data: {
        key: validRateLimitKey,
        points: 2,
        expireAt: new Date(Date.now() + 60 * 1000), // 1 min future
      },
    });

    // 4. Create expired and valid password reset tokens
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() - 3600 * 1000), // expired
      },
    });
    const validResetToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 3600 * 1000), // valid
      },
    });

    // 5. Run housekeeping
    const result = await runAutomatedHousekeeping();
    expect(result.expiredSessions).toBeGreaterThanOrEqual(1);
    expect(result.expiredRateLimits).toBeGreaterThanOrEqual(1);
    expect(result.expiredResetTokens).toBeGreaterThanOrEqual(1);

    // 6. Verify valid session still exists
    const preservedSession = await prisma.session.findUnique({
      where: { id: validSession.id },
    });
    expect(preservedSession).not.toBeNull();

    // 7. Verify valid rate limit still exists
    const preservedRateLimit = await prisma.rateLimit.findUnique({
      where: { key: validRateLimitKey },
    });
    expect(preservedRateLimit).not.toBeNull();

    // 8. Verify valid reset token still exists
    const preservedResetToken = await prisma.passwordResetToken.findUnique({
      where: { id: validResetToken.id },
    });
    expect(preservedResetToken).not.toBeNull();
  });

  it('rejects POST /api/admin/housekeeping from non-admin users and allows admin users', async () => {
    // Non-admin user
    const student = await prisma.user.create({
      data: {
        email: `student.housekeep.${runId}@ambo.edu.et`,
        fullName: 'Student Housekeep User',
        passwordHash: 'dummy',
        role: Role.STUDENT,
      },
    });

    const forbiddenRes = await makeRequest('POST', '/api/admin/housekeeping', {}, {
      'x-actor-id': student.id,
    });
    expect(forbiddenRes.status).toBe(403);

    // Admin user
    const admin = await prisma.user.create({
      data: {
        email: `admin.housekeep.${runId}@ambo.edu.et`,
        fullName: 'Admin Housekeep User',
        passwordHash: 'dummy',
        role: Role.ADMIN,
      },
    });

    const allowedRes = await makeRequest('POST', '/api/admin/housekeeping', {}, {
      'x-actor-id': admin.id,
    });
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.body.success).toBe(true);
    expect(typeof allowedRes.body.expiredSessions).toBe('number');
  });
});
