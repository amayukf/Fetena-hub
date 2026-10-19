import { describe, it, expect, beforeEach } from 'vitest';
import { handleApiRequest, prisma } from '../server/apiHandler';
import { Role } from '@prisma/client';
import { EventEmitter } from 'node:events';

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
    req.socket = { remoteAddress: '197.156.102.50' };

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

describe('Google Authentication (Sign Up & Login)', () => {
  const runId = Math.floor(100000 + Math.random() * 900000);
  const studentEmail = `google.student.${runId}@ambo.edu.et`;
  const existingEmail = `google.existing.${runId}@ambo.edu.et`;
  const inactiveEmail = `google.inactive.${runId}@ambo.edu.et`;

  it('GET /api/auth/google/config returns configuration status', async () => {
    const result = await makeRequest('GET', '/api/auth/google/config');

    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('enabled');
    expect(result.body).toHaveProperty('clientId');
  });

  it('POST /api/auth/google creates a new student account with Google profile', async () => {
    const result = await makeRequest('POST', '/api/auth/google', {
      stream: 'NAT_SCI',
      devProfile: {
        sub: `google-sub-${runId}-1`,
        email: studentEmail,
        name: 'Abebe Bikila',
        picture: 'https://lh3.googleusercontent.com/test-avatar.jpg',
      },
    });

    expect(result.status).toBe(201);
    expect(result.body.user).toBeDefined();
    expect(result.body.user.email).toBe(studentEmail);
    expect(result.body.user.fullName).toBe('Abebe Bikila');
    expect(result.body.user.role).toBe(Role.STUDENT);
    expect(result.body.user.stream).toBe('NAT_SCI');
    expect(result.body.token).toBeDefined();

    // Verify session cookie was set
    const setCookie = result.headers['set-cookie'] || result.headers['Set-Cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('examvault_session=');

    // Verify user was saved in database
    const dbUser = await prisma.user.findUnique({
      where: { email: studentEmail },
    });
    expect(dbUser).toBeDefined();
    expect(dbUser?.googleId).toBe(`google-sub-${runId}-1`);
    expect(dbUser?.isVerified).toBe(true);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: dbUser?.id },
    });
    expect(audit?.action).toBe('Student registered account via Google');
  });

  it('POST /api/auth/google logs in existing user and links Google ID', async () => {
    // 1. Create existing user with email and password
    const existing = await prisma.user.create({
      data: {
        fullName: 'Existing Student',
        email: existingEmail,
        role: Role.STUDENT,
        passwordHash: 'dummy-hashed-pass',
        isActive: true,
      },
    });

    // 2. Sign in with Google with same email
    const result = await makeRequest('POST', '/api/auth/google', {
      devProfile: {
        sub: `google-sub-${runId}-2`,
        email: existingEmail,
        name: 'Existing Student Updated',
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.user.id).toBe(existing.id);

    // Verify Google ID was linked to existing user
    const updatedUser = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(updatedUser?.googleId).toBe(`google-sub-${runId}-2`);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: existing.id, action: 'Student logged in with Google' },
    });
    expect(audit).toBeDefined();
  });

  it('POST /api/auth/google rejects deactivated accounts with 403', async () => {
    await prisma.user.create({
      data: {
        fullName: 'Suspended Student',
        email: inactiveEmail,
        googleId: `google-sub-${runId}-suspended`,
        role: Role.STUDENT,
        passwordHash: 'dummy',
        isActive: false, // Deactivated
      },
    });

    const result = await makeRequest('POST', '/api/auth/google', {
      devProfile: {
        sub: `google-sub-${runId}-suspended`,
        email: inactiveEmail,
      },
    });

    expect(result.status).toBe(403);
    expect(result.body.error).toContain('deactivated');
  });
});
