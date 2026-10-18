import { Prisma, PrismaClient, PaymentMethod, PaymentStatus, ContributionStatus, ExamType, AuditRiskLevel, PaperStatus, Role, ScanQuality } from '@prisma/client';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { paymentSubmissionSchema, paperContributionSchema } from '../src/lib/validation';
import { verifyPaperAccess } from '../src/lib/access';
import {
  storage,
  validateStorageKey,
  detectFileSignature,
  validateUploadFile,
  generateRandomStorageKey,
  signStreamTicket,
  verifyStreamTicket,
} from '../src/lib/storage';
import {
  generateCompressedPageBuffer,
  convertAndStoreCompressedPages,
} from '../src/lib/pageCompressor';
import { dispatchNotification } from '../src/lib/notifications';
import type { StreamCode } from '../src/types';

// -------------------------------------------------------------
// SECURITY: SESSION_SECRET is mandatory in EVERY environment.
// It signs stream tickets and signed storage-view URLs, so a missing,
// short, or well-known placeholder value must abort startup rather than
// silently fall back to a hard-coded secret that is published in source.
// -------------------------------------------------------------
const INSECURE_SECRETS = new Set([
  'examvault-secure-local-storage-secret',
  'your-32-byte-base64-session-encryption-secret-here',
]);

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || INSECURE_SECRETS.has(secret)) {
    throw new Error(
      'FATAL: SESSION_SECRET must be set to a cryptographically strong value of at least 32 characters. Server startup aborted.'
    );
  }
  return secret;
}

// Validate eagerly so a misconfigured deployment never reaches a running server.
getSessionSecret();

/**
 * Best-effort page count for an uploaded exam paper.
 *
 * We cannot parse PDFs in this process, and the previous implementation simply
 * persisted a hard-coded `6` as if it were real metadata. Estimate from the
 * byte size instead (scanned A4 pages average roughly 90 KB in this pipeline)
 * and clamp to a believable range.
 */
export function estimatePageCount(fileSizeBytes: unknown, fallback = 6): number {
  const size = Number(fileSizeBytes);
  if (!Number.isFinite(size) || size <= 0) return fallback;
  return Math.min(60, Math.max(1, Math.round(size / 90_000)));
}

export const prisma = new PrismaClient();

function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const key = parts.shift()?.trim();
      const value = decodeURIComponent(parts.join('=').trim());
      if (key) list[key] = value;
    });
  }
  return list;
}

/**
 * Derives client IP safely.
 * Only trusts X-Forwarded-For if TRUST_PROXY is explicitly enabled.
 */
export function getClientIp(req: IncomingMessage): string {
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (trustProxy) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
      return xff.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const now = new Date();
  const expireAt = new Date(now.getTime() + windowSeconds * 1000);

  try {
    const record = await prisma.rateLimit.findUnique({ where: { key } });

    if (!record || record.expireAt < now) {
      await prisma.rateLimit.upsert({
        where: { key },
        update: { points: 1, expireAt },
        create: { key, points: 1, expireAt },
      });
      return { allowed: true, remaining: limit - 1, resetAt: expireAt };
    }

    if (record.points >= limit) {
      return { allowed: false, remaining: 0, resetAt: record.expireAt };
    }

    const updated = await prisma.rateLimit.update({
      where: { key },
      data: { points: { increment: 1 } },
    });

    return { allowed: true, remaining: Math.max(0, limit - updated.points), resetAt: record.expireAt };
  } catch (err) {
    // SECURITY: Fail closed on database errors to prevent rate-limit bypass during DB degradation
    console.error('[RateLimit DB Error]:', err);
    return { allowed: false, remaining: 0, resetAt: expireAt };
  }
}

async function parseBody(req: IncomingMessage): Promise<any> {
  const reqAny = req as any;
  if (reqAny.__bodyPromise) {
    return reqAny.__bodyPromise;
  }
  if (reqAny.body !== undefined && typeof reqAny.body === 'object') {
    return reqAny.body;
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any, headers?: Record<string, string | string[]>) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'content-type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    'X-Content-Type-Options': 'nosniff',
    'x-content-type-options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'x-frame-options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';",
    'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    ...(headers || {}),
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string, details?: any, headers?: Record<string, string | string[]>) {
  sendJson(res, status, { error: message, details }, headers);
}

export function normalizeEthiopianPhone(phone: string): string {
  if (!phone) return phone;
  const cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');
  if (/^(\+251|00251|251)?0?[79]\d{8}$/.test(cleaned)) {
    const match = cleaned.match(/[79]\d{8}$/);
    if (match) {
      return `+251${match[0]}`;
    }
  }
  return cleaned;
}

export function getPhoneVariants(phone: string): string[] {
  if (!phone) return [];
  const trimmed = phone.trim();
  const normalized = normalizeEthiopianPhone(trimmed);
  const variants = new Set<string>([trimmed, normalized]);
  if (normalized.startsWith('+251') && normalized.length === 13) {
    const last9 = normalized.slice(4);
    variants.add(`0${last9}`);
    variants.add(`251${last9}`);
    variants.add(last9);
  }
  return Array.from(variants);
}

export async function resolveActor(
  req: IncomingMessage,
  _body?: any,
  searchParams?: URLSearchParams
): Promise<{ id: string; role: Role; user: any } | null> {
  // 1. Session token from Cookie, Bearer header, x-session-token header, or query param
  const cookies = parseCookies(req);
  const authHeader = req.headers['authorization'];
  let queryToken: string | null = null;
  if (searchParams) {
    queryToken = searchParams.get('token') || searchParams.get('sessionToken');
  } else if (req.url) {
    try {
      const u = new URL(req.url, 'http://localhost');
      queryToken = u.searchParams.get('token') || u.searchParams.get('sessionToken');
    } catch {}
  }

  const rawToken =
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null) ||
    cookies['examvault_session'] ||
    (req.headers['x-session-token'] as string) ||
    queryToken;

  if (rawToken) {
    const tokenHash = sha256(rawToken);
    const session = await prisma.session.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: { user: true },
    });

    if (
      session &&
      session.expiresAt > new Date() &&
      session.user &&
      session.user.deletedAt === null &&
      session.user.isActive // Suspended users lose access immediately
    ) {
      return { id: session.user.id, role: session.user.role, user: session.user };
    }
  }

  // 2. Explicit actor impersonation — DEV/TEST ONLY.
  // SECURITY: this is a full authentication bypass, so it must never be
  // reachable in production. It requires BOTH a non-production environment
  // and an explicit opt-in via ALLOW_ACTOR_IMPERSONATION, and can be hard
  // disabled with ALLOW_ACTOR_IMPERSONATION="false".
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_ACTOR_IMPERSONATION !== 'false'
  ) {
    const actorId = req.headers['x-actor-id'] as string;
    if (actorId) {
      const user = await prisma.user.findUnique({ where: { id: actorId } });
      if (user && user.deletedAt === null && user.isActive) {
        return { id: user.id, role: user.role, user };
      }
    }
  }

  return null;
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reqAny = req as any;
  if (!reqAny.__bodyPromise) {
    if (reqAny.body !== undefined && typeof reqAny.body === 'object') {
      reqAny.__bodyPromise = Promise.resolve(reqAny.body);
    } else {
      reqAny.__bodyPromise = new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 25 * 1024 * 1024) {
            req.destroy();
            reject(new Error('Payload too large'));
          }
        });
        req.on('end', () => {
          if (!body) return resolve({});
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            resolve({});
          }
        });
        req.on('error', reject);
      });
    }
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

  // SECURITY: a user (e.g. a freshly provisioned admin) holding a temporary
  // password must rotate it before any other authenticated action. Without
  // this, the temporary credential grants full access to payments, papers,
  // users, and the audit log.
  const PASSWORD_CHANGE_ALLOWED_PATHS = new Set([
    '/health',
    '/api/health',
    '/api/auth/me',
    '/api/auth/logout',
    '/api/auth/change-password',
    '/api/bootstrap',
  ]);
  if (!PASSWORD_CHANGE_ALLOWED_PATHS.has(pathname)) {
    const preActor = await resolveActor(req, undefined, url.searchParams);
    if (preActor?.user?.mustChangePassword) {
      return sendError(res, 403, 'Password change required before accessing this resource.');
    }
  }

  try {
    // -------------------------------------------------------------
    // GET /health and GET /api/health - System Health Check
    // -------------------------------------------------------------
    if ((pathname === '/health' || pathname === '/api/health') && method === 'GET') {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return sendJson(res, 200, {
          status: 'ok',
          database: 'connected',
          storage: 'ready',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      } catch (err: any) {
        return sendJson(res, 503, {
          status: 'error',
          database: 'disconnected',
          error: err.message,
        });
      }
    }

    // -------------------------------------------------------------
    // POST /api/auth/signup - Real Student Registration
    // -------------------------------------------------------------
    if (pathname === '/api/auth/signup' && method === 'POST') {
      const ip = getClientIp(req);
      const rl = await checkRateLimit(`signup:${ip}`, 10, 3600);
      if (!rl.allowed) {
        return sendError(res, 429, 'Too many signup attempts. Please try again later.');
      }

      const body = await parseBody(req);
      const fullName = body.fullName?.trim();
      const email = body.email?.trim().toLowerCase() || null;
      const rawPhone = body.phone?.trim() || null;
      const phone = rawPhone ? normalizeEthiopianPhone(rawPhone) : null;
      const studentId = body.studentId?.trim() || null;
      const streamCode = (body.stream as StreamCode) || 'NAT_SCI';
      const password = body.password;

      if (!fullName || fullName.length < 2) {
        return sendError(res, 400, 'Full name must be at least 2 characters.');
      }
      if (!email && !phone) {
        return sendError(res, 400, 'Either email or phone number is required for signup.');
      }
      if (!password || password.length < 8) {
        return sendError(res, 400, 'Password must be at least 8 characters long.');
      }

      // Check duplicate accounts
      if (email) {
        const existingEmail = await prisma.user.findUnique({ where: { email } });
        if (existingEmail) {
          return sendError(res, 409, 'An account with this email address already exists.');
        }
      }
      if (phone) {
        const phoneVariants = getPhoneVariants(phone);
        const existingPhone = await prisma.user.findFirst({
          where: {
            phone: { in: phoneVariants },
          },
        });
        if (existingPhone) {
          return sendError(res, 409, 'An account with this phone number already exists.');
        }
      }
      if (studentId) {
        const existingStudentId = await prisma.user.findUnique({ where: { studentId } });
        if (existingStudentId) {
          return sendError(res, 409, 'An account with this Student ID already exists.');
        }
      }

      // Link stream program
      const program = await prisma.program.findFirst({
        where: { code: streamCode, campus: { code: 'WOLISO' } },
      });

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          fullName,
          email,
          phone,
          studentId,
          programId: program?.id || null,
          currentYear: 1,
          role: Role.STUDENT, // Strictly enforce STUDENT; ignore any injected role
          passwordHash,
          canSell: true,
          isActive: true,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          studentId: true,
          role: true,
          programId: true,
          currentYear: true,
          mustChangePassword: true,
          canSell: true,
          createdAt: true,
        },
      });

      // Create session
      const rawToken = crypto.randomUUID();
      const sessionTokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await prisma.session.create({
        data: {
          userId: user.id,
          sessionTokenHash,
          ipAddress: ip,
          userAgent: (req.headers['user-agent'] as string) || 'Browser',
          expiresAt,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          action: 'Student registered account',
          entityType: 'User',
          entityId: user.id,
          actorId: user.id,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            fullName: user.fullName,
            stream: streamCode,
            studentId: user.studentId,
          },
        },
      });

      const isSecure = process.env.NODE_ENV === 'production';
      const cookieHeader = `examvault_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${isSecure ? '; Secure' : ''}`;
      return sendJson(res, 201, {
        token: rawToken,
        user: {
          id: user.id,
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          studentId: user.studentId,
          role: user.role,
          stream: streamCode,
          programId: user.programId,
          currentYear: user.currentYear,
          mustChangePassword: user.mustChangePassword,
          canSell: user.canSell,
        },
        unlockedProgramTermIds: [],
      }, { 'Set-Cookie': cookieHeader });
    }

    // -------------------------------------------------------------
    // POST /api/auth/login - Real User & Admin Authentication
    // -------------------------------------------------------------
    if (pathname === '/api/auth/login' && method === 'POST') {
      const ip = getClientIp(req);
      const isProd = process.env.NODE_ENV === 'production';
      const maxLoginAttempts = isProd ? 5 : 50;
      const rl = await checkRateLimit(`login:${ip}`, maxLoginAttempts, 900);
      if (!rl.allowed) {
        return sendError(res, 429, 'Too many login attempts. Please try again in 15 minutes.');
      }

      const body = await parseBody(req);
      const identifier = body.identifier?.trim();
      const password = body.password;

      if (!identifier || !password) {
        return sendError(res, 400, 'Identifier (email, student ID, or phone) and password are required.');
      }

      const phoneVariants = getPhoneVariants(identifier);
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier.toLowerCase() },
            { studentId: identifier },
            { phone: identifier },
            ...phoneVariants.map(p => ({ phone: p })),
          ],
          deletedAt: null,
        },
        include: {
          program: true,
          entitlements: {
            where: { isActive: true },
            select: { programTermId: true },
          },
        },
      });

      if (!user) {
        return sendError(res, 401, 'Invalid credentials.');
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) {
        return sendError(res, 401, 'Invalid credentials.');
      }

      if (!user.isActive) {
        return sendError(res, 403, 'Account has been deactivated. Please contact campus administration.');
      }

      // Max 2 concurrent sessions
      const activeSessions = await prisma.session.findMany({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
      });

      if (activeSessions.length >= 2) {
        await prisma.session.delete({ where: { id: activeSessions[0].id } });
      }

      const rawToken = crypto.randomUUID();
      const sessionTokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await prisma.session.create({
        data: {
          userId: user.id,
          sessionTokenHash,
          ipAddress: ip,
          userAgent: (req.headers['user-agent'] as string) || 'Browser',
          expiresAt,
        },
      });

      // Clear any failed login attempt counters for this IP upon successful authentication
      await prisma.rateLimit.deleteMany({ where: { key: `login:${ip}` } });

      const isSecure = process.env.NODE_ENV === 'production';
      const cookieHeader = `examvault_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${isSecure ? '; Secure' : ''}`;
      const streamCode = (user.program?.code as StreamCode) || (user.role === Role.STUDENT ? 'NAT_SCI' : null);

      return sendJson(res, 200, {
        token: rawToken,
        user: {
          id: user.id,
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          studentId: user.studentId,
          role: user.role,
          stream: streamCode,
          programId: user.programId,
          currentYear: user.currentYear,
          mustChangePassword: user.mustChangePassword,
          canSell: user.canSell,
        },
        unlockedProgramTermIds: user.entitlements.map(e => e.programTermId),
      }, { 'Set-Cookie': cookieHeader });
    }

    // -------------------------------------------------------------
    // GET /api/auth/me - Current User Session
    // -------------------------------------------------------------
    if (pathname === '/api/auth/me' && method === 'GET') {
      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendJson(res, 200, { authenticated: false, user: null, unlockedProgramTermIds: [] });
      }

      const user = await prisma.user.findUnique({
        where: { id: actor.id },
        include: {
          program: true,
          entitlements: {
            where: { isActive: true },
            include: {
              programTerm: {
                include: { program: true, term: true },
              },
            },
          },
        },
      });

      if (!user || !user.isActive || user.deletedAt !== null) {
        return sendJson(res, 200, { authenticated: false, user: null, unlockedProgramTermIds: [], unlockedStreamCodes: [] });
      }

      const streamCode = (user.program?.code as StreamCode) || (user.role === Role.STUDENT ? 'NAT_SCI' : null);

      return sendJson(res, 200, {
        authenticated: true,
        user: {
          id: user.id,
          userId: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          studentId: user.studentId,
          role: user.role,
          stream: streamCode,
          programId: user.programId,
          currentYear: user.currentYear,
          mustChangePassword: user.mustChangePassword,
          canSell: user.canSell,
        },
        unlockedProgramTermIds: user.entitlements.map(e => e.programTermId),
        unlockedStreamCodes: user.entitlements.map(e => e.programTerm?.program?.code).filter(Boolean),
      });
    }

    // -------------------------------------------------------------
    // POST /api/auth/logout - Session Termination
    // -------------------------------------------------------------
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const cookies = parseCookies(req);
      const authHeader = req.headers['authorization'];
      const rawToken =
        (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null) ||
        cookies['examvault_session'] ||
        (req.headers['x-session-token'] as string);

      if (rawToken) {
        const tokenHash = sha256(rawToken);
        await prisma.session.deleteMany({ where: { sessionTokenHash: tokenHash } });
      }

      const isSecure = process.env.NODE_ENV === 'production';
      const clearCookie = `examvault_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${isSecure ? '; Secure' : ''}`;
      return sendJson(res, 200, { success: true, message: 'Logged out successfully' }, { 'Set-Cookie': clearCookie });
    }

    // -------------------------------------------------------------
    // POST /api/auth/change-password - Change Password & Clear Forced Flag
    // -------------------------------------------------------------
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required to change password.');
      }

      const body = await parseBody(req);
      const isSuperAdmin = actor.role === Role.ADMIN;
      const targetUserId = (isSuperAdmin && body.userId) ? body.userId : actor.id;
      const newPassword = body.newPassword;

      if (!newPassword || newPassword.length < 8) {
        return sendError(res, 400, 'New password must be at least 8 characters long.');
      }

      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        return sendError(res, 404, 'User not found.');
      }

      // Non-admins must provide and verify their current password unless they are completing an initial forced password reset
      if ((!isSuperAdmin || targetUserId === actor.id) && !user.mustChangePassword) {
        if (!body.oldPassword) {
          return sendError(res, 400, 'Current password is required.');
        }
        const matches = await bcrypt.compare(body.oldPassword, user.passwordHash);
        if (!matches) {
          return sendError(res, 401, 'Current password is incorrect.');
        }
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await prisma.user.update({
        where: { id: targetUserId },
        data: {
          passwordHash: newHash,
          mustChangePassword: false, // Flag cleared upon changing password!
        },
      });

      // SECURITY: revoke every other active session for this account so a
      // leaked/stolen session cannot survive a password change. The session
      // performing this change is kept so the user is not logged out mid-flow.
      const actorCookies = parseCookies(req);
      const currentRawToken =
        actorCookies['examvault_session'] || (req.headers['x-session-token'] as string) || null;
      const currentTokenHash = currentRawToken ? sha256(currentRawToken) : null;

      const revokedSessions = await prisma.session.deleteMany({
        where: {
          userId: targetUserId,
          ...(currentTokenHash ? { sessionTokenHash: { not: currentTokenHash } } : {}),
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'User password changed',
          entityType: 'User',
          entityId: targetUserId,
          actorId: actor.id,
          riskLevel: AuditRiskLevel.MEDIUM,
          details: {
            userId: targetUserId,
            forcedChangeCompleted: user.mustChangePassword,
            sessionsRevoked: revokedSessions.count,
          },
        },
      });

      return sendJson(res, 200, { success: true, message: 'Password updated successfully.' });
    }

    // -------------------------------------------------------------
    // GET /api/bootstrap - Complete verified state from PostgreSQL
    // -------------------------------------------------------------
    if (pathname === '/api/bootstrap' && method === 'GET') {
      // Resolve actor for scoped data access
      const bootstrapActor = await resolveActor(req);
      const isSuperAdmin = bootstrapActor?.role === Role.ADMIN;
      const isContentManager = bootstrapActor?.role === Role.CONTENT_MANAGER;
      const isPaymentVerifier = bootstrapActor?.role === Role.PAYMENT_VERIFIER;
      const isStudent = bootstrapActor?.role === Role.STUDENT;
      const canManageContent = isSuperAdmin || isContentManager;
      const canVerifyPayments = isSuperAdmin || isPaymentVerifier;
      const actorUserId = bootstrapActor?.id || null;

      const [
        settings,
        campus,
        programs,
        terms,
        courses,
        papers,
        payments,
        contributions,
        requests,
        auditLogs,
        notifications,
        entitlements,
        termInterests,
        users,
        wantedPapers,
      ] = await Promise.all([
        prisma.systemSetting.findMany({ orderBy: { key: 'asc' } }),
        prisma.campus.findFirst({ where: { code: 'WOLISO' } }),
        prisma.program.findMany({
          where: { campus: { code: 'WOLISO' } },
          include: {
            programTerms: {
              include: { term: true },
            },
          },
        }),
        prisma.term.findMany({
          orderBy: [{ yearNumber: 'asc' }, { semesterNumber: 'asc' }],
        }),
        prisma.course.findMany({
          where: { isActive: true, deletedAt: null },
          include: {
            programTerms: {
              include: {
                programTerm: {
                  include: {
                    program: true,
                    term: true,
                  },
                },
              },
            },
          },
          orderBy: { code: 'asc' },
        }),
        // SECURITY: Only content managers & admins can see draft/hidden papers; guests & students only see PUBLISHED
        prisma.examPaper.findMany({
          where: {
            deletedAt: null,
            ...(canManageContent ? {} : { status: PaperStatus.PUBLISHED }),
          },
          include: {
            course: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        // SECURITY: Only payment verifiers & admins get all payments; students only see their own
        canVerifyPayments
          ? prisma.payment.findMany({
              include: {
                user: true,
                programTerm: { include: { program: true, term: true } },
              },
              orderBy: { createdAt: 'desc' },
            })
          : isStudent && actorUserId
          ? prisma.payment.findMany({
              where: { userId: actorUserId },
              include: {
                user: true,
                programTerm: { include: { program: true, term: true } },
              },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        // Contributions: content managers & admins see all, students see their own, guests see none
        canManageContent
          ? prisma.paperContribution.findMany({
              include: { student: true, course: true, files: true },
              orderBy: { createdAt: 'desc' },
            })
          : isStudent && actorUserId
          ? prisma.paperContribution.findMany({
              where: { studentId: actorUserId },
              include: { student: true, course: true, files: true },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        // Paper requests: content managers & admins see all, students see their own
        canManageContent
          ? prisma.paperRequest.findMany({
              include: { student: true, course: true },
              orderBy: { createdAt: 'desc' },
            })
          : isStudent && actorUserId
          ? prisma.paperRequest.findMany({
              where: { studentId: actorUserId },
              include: { student: true, course: true },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        // Audit logs: superadmin only
        isSuperAdmin
          ? prisma.auditLog.findMany({
              include: { actor: true },
              orderBy: { createdAt: 'desc' },
              take: 100,
            })
          : Promise.resolve([]),
        // Notifications: user sees own only
        actorUserId
          ? prisma.notification.findMany({
              where: { userId: actorUserId },
              orderBy: { createdAt: 'desc' },
              take: 50,
            })
          : Promise.resolve([]),
        // SECURITY: Only payment verifiers & admins get all entitlements; students only get their own active
        canVerifyPayments
          ? prisma.entitlement.findMany({
              where: { isActive: true },
              include: {
                programTerm: { include: { program: true, term: true, courses: true } },
              },
            })
          : isStudent && actorUserId
          ? prisma.entitlement.findMany({
              where: { userId: actorUserId, isActive: true },
              include: {
                programTerm: { include: { program: true, term: true, courses: true } },
              },
            })
          : Promise.resolve([]),
        // Term interests: superadmin sees all, students see their own
        isSuperAdmin
          ? prisma.termInterest.findMany({ include: { term: true, user: true } })
          : isStudent && actorUserId
          ? prisma.termInterest.findMany({ where: { userId: actorUserId }, include: { term: true, user: true } })
          : Promise.resolve([]),
        // Users list: superadmin only
        isSuperAdmin
          ? prisma.user.findMany({
              where: { deletedAt: null },
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                studentId: true,
                role: true,
                programId: true,
                currentYear: true,
                isActive: true,
                canSell: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        prisma.wantedPaper.findMany({
          include: { course: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      // Calculate duplicate screenshot occurrences across all payments
      const shaCountMap = new Map<string, number>();
      for (const p of payments) {
        if (p.screenshotSha256) {
          shaCountMap.set(p.screenshotSha256, (shaCountMap.get(p.screenshotSha256) || 0) + 1);
        }
      }
      const processedPayments = payments.map((p) => ({
        ...p,
        hasDuplicateScreenshot: p.screenshotSha256 ? (shaCountMap.get(p.screenshotSha256) || 0) > 1 : false,
      }));

      // Ensure PAYMENT_VERIFICATION_SLA_HOURS exists in settings
      const hasSla = settings.some((s) => s.key === 'PAYMENT_VERIFICATION_SLA_HOURS');
      const processedSettings = hasSla
        ? settings
        : [
            ...settings,
            {
              id: 'setting-sla',
              key: 'PAYMENT_VERIFICATION_SLA_HOURS',
              value: '2',
              description: 'Verification SLA in hours',
              updatedAt: new Date(),
            },
          ];

      return sendJson(res, 200, {
        settings: processedSettings,
        campus,
        programs,
        terms,
        courses,
        papers,
        payments: processedPayments,
        contributions,
        requests,
        wantedPapers,
        auditLogs,
        notifications,
        entitlements,
        termInterests,
        users,
      });
    }

    // -------------------------------------------------------------
    // GET /api/admin/overview - Real Aggregated Overview Metrics
    // -------------------------------------------------------------
    if (pathname === '/api/admin/overview' && method === 'GET') {
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor || actor.role === Role.STUDENT) {
        return sendError(res, 403, 'Students and unauthenticated users are not authorized to view admin overview.');
      }

      const [revenueAgg, activeStudentsCount, pendingPaymentsCount, publishedPapersCount, courses, recentLogs] = await Promise.all([
        prisma.payment.aggregate({
          _sum: { amountEtb: true },
          where: { status: PaymentStatus.APPROVED },
        }),
        prisma.user.count({
          where: { role: Role.STUDENT, isActive: true, deletedAt: null },
        }),
        prisma.payment.count({
          where: { status: PaymentStatus.PENDING },
        }),
        prisma.examPaper.count({
          where: { status: PaperStatus.PUBLISHED, deletedAt: null },
        }),
        prisma.course.findMany({
          where: { isActive: true, deletedAt: null },
          include: {
            examPapers: {
              where: { deletedAt: null },
              include: {
                _count: { select: { views: true } },
              },
            },
          },
          orderBy: { code: 'asc' },
        }),
        prisma.auditLog.findMany({
          include: { actor: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const topCourses = courses
        .map((c) => {
          const viewsCount = c.examPapers.reduce((sum, p) => sum + (p._count?.views || 0), 0);
          return {
            id: c.id,
            code: c.code,
            title: c.title,
            viewsCount,
            papersCount: c.examPapers.length,
          };
        })
        .sort((a, b) => b.viewsCount - a.viewsCount);

      const coverageMatrix = courses.map((c) => {
        const mid = c.examPapers.filter((p) => p.examType === ExamType.MID);
        const final = c.examPapers.filter((p) => p.examType === ExamType.FINAL);
        const quiz = c.examPapers.filter((p) => p.examType === ExamType.QUIZ);
        return {
          courseId: c.id,
          code: c.code,
          title: c.title,
          mid: { count: mid.length, hasPaper: mid.length > 0 },
          final: { count: final.length, hasPaper: final.length > 0 },
          quiz: { count: quiz.length, hasPaper: quiz.length > 0 },
        };
      });

      let coveredSlots = 0;
      for (const item of coverageMatrix) {
        if (item.mid.hasPaper) coveredSlots++;
        if (item.final.hasPaper) coveredSlots++;
        if (item.quiz.hasPaper) coveredSlots++;
      }
      const totalSlots = courses.length * 3;
      const percentage = totalSlots > 0 ? Math.round((coveredSlots / totalSlots) * 100) : 0;
      const coverageSummary = {
        percentage,
        coveredSlots,
        totalSlots,
      };

      return sendJson(res, 200, {
        revenueEtb: Number(revenueAgg._sum.amountEtb || 0),
        activeStudentsCount,
        pendingPaymentsCount,
        publishedPapersCount,
        topCourses,
        coverageMatrix,
        coverageSummary,
        recentActivity: recentLogs,
      });
    }

    // -------------------------------------------------------------
    // POST /api/payments - Submit student payment (or resubmit rejected receipt)
    // -------------------------------------------------------------
    if (pathname === '/api/payments' && method === 'POST') {
      const rawBody = await parseBody(req);
      const parsed = paymentSubmissionSchema.safeParse(rawBody);

      if (!parsed.success) {
        return sendError(res, 400, 'Invalid payment submission parameters', parsed.error.format());
      }

      const { programTermId, paymentMethod, transactionId, screenshotUrl } = parsed.data;
      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required to submit payments.');
      }
      const userId = actor.id;

      // Resolve programTermId
      let targetProgramTermId = programTermId;
      if (!targetProgramTermId) {
        const streamCode = rawBody.stream || 'NAT_SCI';
        const pt = await prisma.programTerm.findFirst({
          where: {
            program: { code: streamCode },
            term: { yearNumber: 1, semesterNumber: 1 },
          },
        });
        if (!pt) {
          return sendError(res, 404, 'ProgramTerm not found for freshman semester 1');
        }
        targetProgramTermId = pt.id;
      }

      // Fetch ProgramTerm to read price from database (ignoring client amount)
      const pt = await prisma.programTerm.findUnique({
        where: { id: targetProgramTermId },
        include: { program: true, term: true },
      });
      if (!pt) {
        return sendError(res, 404, 'ProgramTerm not found');
      }

      // Server computes amount strictly from the database!
      const serverAmountEtb = Number(pt.priceEtb);

      // Check for partial unique constraint: only ONE PENDING payment per (userId, programTermId)
      const existingPending = await prisma.payment.findFirst({
        where: {
          userId,
          programTermId: targetProgramTermId,
          status: PaymentStatus.PENDING,
        },
      });

      if (existingPending) {
        return sendError(
          res,
          409,
          'You already have a pending payment for this semester awaiting review. Please wait for verification or contact staff.'
        );
      }

      // Check unique transaction reference per method (prevent cross-user reuse)
      const existingTx = await prisma.payment.findUnique({
        where: {
          paymentMethod_transactionId: {
            paymentMethod,
            transactionId,
          },
        },
      });

      if (existingTx && existingTx.userId !== userId && existingTx.status !== PaymentStatus.REJECTED) {
        return sendError(
          res,
          409,
          `Transaction ID ${transactionId} has already been submitted for ${paymentMethod}. Duplicate references are rejected.`
        );
      }

      // SECURITY: never trust a client-supplied storage key verbatim. A student
      // may only reference a file the server itself wrote into the private
      // quarantine namespace (the key returned by POST /api/upload). Anything
      // else — notably "published/<paperKey>" handed out by /api/papers — is
      // rejected, which closes the paywall-bypass / cross-object read.
      const providedReceiptKey =
        rawBody.storageKey ||
        rawBody.receiptImageStorageKey ||
        parsed.data.storageKey ||
        parsed.data.receiptImageStorageKey ||
        screenshotUrl;

      let randomScreenshotKey = generateRandomStorageKey('quarantine', 'jpg', 'receipts');
      let screenshotSha256 = sha256(`receipt:${userId}:${paymentMethod}:${transactionId}`);

      if (providedReceiptKey) {
        // Only keys inside the server-managed quarantine namespace are accepted;
        // a client can never point a payment at an arbitrary stored object.
        if (!providedReceiptKey.startsWith('quarantine/')) {
          return sendError(res, 400, 'Invalid receipt reference. Upload the receipt through the platform before submitting.');
        }
        randomScreenshotKey = providedReceiptKey;

        // Prefer hashing the stored bytes so duplicate-receipt detection cannot
        // be poisoned with a client-supplied hash. If the object is not readable
        // from this process, fall back to a deterministic hash of the key.
        const receiptBytes = await storage.download(providedReceiptKey).catch(() => null);
        screenshotSha256 = receiptBytes
          ? sha256(Buffer.from(receiptBytes))
          : sha256(`receipt-key:${providedReceiptKey}`);
      }

      // Check if student is resubmitting for an existing REJECTED payment
      const existingRejected = await prisma.payment.findFirst({
        where: {
          userId,
          programTermId: targetProgramTermId,
          status: PaymentStatus.REJECTED,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingRejected) {
        // Resubmit rejected payment with corrected receipt & increment resubmitCount
        const resubmittedPayment = await prisma.payment.update({
          where: { id: existingRejected.id },
          data: {
            paymentMethod,
            transactionId,
            screenshotKey: randomScreenshotKey,
            screenshotSha256,
            amountEtb: serverAmountEtb, // Server calculated
            status: PaymentStatus.PENDING,
            rejectionReason: null,
            reviewedById: null,
            reviewedAt: null,
            resubmitCount: existingRejected.resubmitCount + 1,
          },
          include: {
            user: true,
            programTerm: {
              include: { program: true, term: true },
            },
          },
        });

        // Trigger Notification Hook
        await dispatchNotification(
          {
            userId,
            phone: resubmittedPayment.user.phone,
            title: 'Payment Resubmitted',
            message: `Your corrected payment receipt for ${pt.program.name} (Ref: ${resubmittedPayment.referenceCode}) was received and is under review.`,
            type: 'PAYMENT_SUBMITTED',
            metadata: { referenceCode: resubmittedPayment.referenceCode, resubmitCount: resubmittedPayment.resubmitCount },
          },
          prisma
        );

        // Immutable Audit Log
        await prisma.auditLog.create({
          data: {
            action: 'Payment resubmitted with corrected screenshot',
            entityType: 'Payment',
            entityId: resubmittedPayment.id,
            actorId: userId,
            riskLevel: AuditRiskLevel.LOW,
            details: {
              referenceCode: resubmittedPayment.referenceCode,
              transactionId,
              paymentMethod,
              amountEtb: serverAmountEtb.toString(),
              resubmitCount: resubmittedPayment.resubmitCount,
            },
          },
        });

        return sendJson(res, 200, { ...resubmittedPayment, payment: resubmittedPayment });
      }

      // Fresh payment submission
      const referenceCode = `EV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const payment = await prisma.payment.create({
        data: {
          referenceCode,
          userId,
          programTermId: targetProgramTermId,
          amountEtb: serverAmountEtb, // Server computed from database
          paymentMethod,
          transactionId,
          screenshotKey: randomScreenshotKey,
          screenshotSha256,
          resubmitCount: 0,
          status: PaymentStatus.PENDING,
        },
        include: {
          user: true,
          programTerm: {
            include: {
              program: true,
              term: true,
            },
          },
        },
      });

      // Trigger Notification Hook
      await dispatchNotification(
        {
          userId,
          phone: payment.user.phone,
          title: 'Payment Submitted',
          message: `Your payment (Ref: ${payment.referenceCode}) has been received for ${pt.program.name}. Verification SLA: within 2 hours.`,
          type: 'PAYMENT_SUBMITTED',
          metadata: { referenceCode: payment.referenceCode, amountEtb: serverAmountEtb },
        },
        prisma
      );

      // Immutable Audit Log
      await prisma.auditLog.create({
        data: {
          action: 'Payment submitted',
          entityType: 'Payment',
          entityId: payment.id,
          actorId: userId,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            referenceCode: payment.referenceCode,
            transactionId: payment.transactionId,
            paymentMethod: payment.paymentMethod,
            amountEtb: serverAmountEtb.toString(),
            programTermId: payment.programTermId,
          },
        },
      });

      return sendJson(res, 201, { ...payment, payment });
    }

    // -------------------------------------------------------------
    // GET /api/payments - Verifier/Admin list (CONTENT_MANAGER Forbidden)
    // -------------------------------------------------------------
    if (pathname === '/api/payments' && method === 'GET') {
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor || actor.role === Role.CONTENT_MANAGER || actor.role === Role.STUDENT) {
        return sendError(res, 403, 'Content managers and students are not authorized to view payments.');
      }

      const payments = await prisma.payment.findMany({
        include: {
          user: true,
          programTerm: {
            include: { program: true, term: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, payments);
    }

    // -------------------------------------------------------------
    // POST /api/payments/:id/approve - Verifier/Admin Idempotent Approval
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/payments/') && pathname.endsWith('/approve') && method === 'POST') {
      const parts = pathname.split('/');
      const paymentId = parts[3];
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);
      // SECURITY: reviewer identity is derived from the authenticated session,
      // never from a client-supplied body field.
      const reviewerId = actor?.id;

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.PAYMENT_VERIFIER)) {
        return sendError(res, 403, 'Content managers and unauthorized users are not authorized to approve payments.');
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: true,
          programTerm: {
            include: { program: true, term: true },
          },
        },
      });

      if (!payment) {
        return sendError(res, 404, 'Payment not found');
      }

      // Atomic Transaction: Idempotently update payment and upsert entitlement
      const result = await prisma.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.APPROVED,
            reviewedById: reviewerId || null,
            reviewedAt: new Date(),
          },
          include: {
            user: true,
            programTerm: {
              include: {
                program: true,
                term: true,
              },
            },
          },
        });

        // Grant Entitlement idempotently
        const entitlement = await tx.entitlement.upsert({
          where: {
            userId_programTermId: {
              userId: payment.userId,
              programTermId: payment.programTermId,
            },
          },
          update: {
            isActive: true,
            paymentId: payment.id,
            grantedById: reviewerId || null,
          },
          create: {
            userId: payment.userId,
            programTermId: payment.programTermId,
            paymentId: payment.id,
            isActive: true,
            grantedById: reviewerId || null,
          },
        });

        // Immutable Audit Log
        await tx.auditLog.create({
          data: {
            action: 'Payment approved',
            entityType: 'Payment',
            entityId: payment.id,
            actorId: reviewerId || null,
            riskLevel: AuditRiskLevel.LOW,
            details: {
              referenceCode: payment.referenceCode,
              amountEtb: payment.amountEtb.toString(),
              unlockedStream: payment.programTerm.program.name,
              unlockedTerm: payment.programTerm.term.name,
              entitlementId: entitlement.id,
            },
          },
        });

        return { payment: updatedPayment, entitlement };
      });

      // Notification Hook
      await dispatchNotification(
        {
          userId: payment.userId,
          phone: payment.user.phone,
          title: 'Payment Approved',
          message: `Your payment for ${payment.programTerm.program.name}, ${payment.programTerm.term.name} is approved! All past papers are unlocked.`,
          type: 'PAYMENT_APPROVED',
          metadata: { referenceCode: payment.referenceCode, entitlementId: result.entitlement.id },
        },
        prisma
      );

      return sendJson(res, 200, { ...result.payment, ...result });
    }

    // -------------------------------------------------------------
    // POST /api/payments/:id/reject - Verifier/Admin rejection with mandatory reason
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/payments/') && pathname.endsWith('/reject') && method === 'POST') {
      const parts = pathname.split('/');
      const paymentId = parts[3];
      const body = await parseBody(req);
      const reason = body.reason?.trim();
      const actor = await resolveActor(req, body, url.searchParams);
      // SECURITY: reviewer identity is derived from the authenticated session,
      // never from a client-supplied body field.
      const reviewerId = actor?.id;

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.PAYMENT_VERIFIER)) {
        return sendError(res, 403, 'Content managers and unauthorized users are not authorized to reject payments.');
      }

      if (!reason) {
        return sendError(res, 400, 'Rejection reason is required.');
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: true,
          programTerm: {
            include: { program: true, term: true },
          },
        },
      });

      if (!payment) {
        return sendError(res, 404, 'Payment not found');
      }

      const updated = await prisma.$transaction(async (tx) => {
        const p = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.REJECTED,
            rejectionReason: reason,
            reviewedById: reviewerId || null,
            reviewedAt: new Date(),
          },
          include: {
            user: true,
            programTerm: {
              include: { program: true, term: true },
            },
          },
        });

        // SECURITY: rejecting a payment must also remove any access it granted,
        // otherwise a rejected/fraudulent payment keeps the paid entitlement.
        const deactivatedEntitlements = await tx.entitlement.updateMany({
          where: { paymentId: payment.id, isActive: true },
          data: { isActive: false },
        });

        await tx.auditLog.create({
          data: {
            action: 'Payment rejected',
            entityType: 'Payment',
            entityId: payment.id,
            actorId: reviewerId || null,
            riskLevel: AuditRiskLevel.MEDIUM,
            details: {
              referenceCode: payment.referenceCode,
              transactionId: payment.transactionId,
              reason,
              deactivatedEntitlements: deactivatedEntitlements.count,
            },
          },
        });

        return p;
      });

      // Notification Hook
      await dispatchNotification(
        {
          userId: payment.userId,
          phone: payment.user.phone,
          title: 'Payment Rejected',
          message: `Your payment reference ${payment.transactionId} could not be verified: ${reason}. You can resubmit with a corrected receipt.`,
          type: 'PAYMENT_REJECTED',
          metadata: { referenceCode: payment.referenceCode, reason },
        },
        prisma
      );

      return sendJson(res, 200, updated);
    }

    // -------------------------------------------------------------
    // POST /api/payments/:id/revoke - Verifier revokes granted entitlement
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/payments/') && pathname.endsWith('/revoke') && method === 'POST') {
      const parts = pathname.split('/');
      const paymentId = parts[3];
      const body = await parseBody(req);
      const reason = body.reason?.trim();
      const actor = await resolveActor(req, body, url.searchParams);
      // SECURITY: reviewer identity is derived from the authenticated session,
      // never from a client-supplied body field.
      const reviewerId = actor?.id;

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.PAYMENT_VERIFIER)) {
        return sendError(res, 403, 'Content managers and unauthorized users are not authorized to revoke payments.');
      }

      if (!reason) {
        return sendError(res, 400, 'Revocation reason is required.');
      }

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          user: true,
          programTerm: {
            include: { program: true, term: true },
          },
          entitlement: true,
        },
      });

      if (!payment) {
        return sendError(res, 404, 'Payment not found');
      }

      const result = await prisma.$transaction(async (tx) => {
        // Deactivate Entitlement
        if (payment.entitlement) {
          await tx.entitlement.update({
            where: { id: payment.entitlement.id },
            data: { isActive: false },
          });
        } else {
          await tx.entitlement.updateMany({
            where: {
              userId: payment.userId,
              programTermId: payment.programTermId,
            },
            data: { isActive: false },
          });
        }

        const updatedP = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.REJECTED,
            rejectionReason: `Access Revoked: ${reason}`,
            reviewedById: reviewerId || null,
            reviewedAt: new Date(),
          },
          include: {
            user: true,
            programTerm: {
              include: { program: true, term: true },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Entitlement access revoked by verifier',
            entityType: 'Payment',
            entityId: payment.id,
            actorId: reviewerId || null,
            riskLevel: AuditRiskLevel.HIGH,
            details: {
              paymentId: payment.id,
              referenceCode: payment.referenceCode,
              reason,
              userId: payment.userId,
              programTermId: payment.programTermId,
            },
          },
        });

        return updatedP;
      });

      // Notification Hook
      await dispatchNotification(
        {
          userId: payment.userId,
          phone: payment.user.phone,
          title: 'Access Revoked',
          message: `Your access to ${payment.programTerm.program.name} has been revoked: ${reason}. Please contact campus administration.`,
          type: 'ACCESS_REVOKED',
          metadata: { referenceCode: payment.referenceCode, reason },
        },
        prisma
      );

      return sendJson(res, 200, { success: true, message: 'Access revoked successfully', payment: result });
    }

    // -------------------------------------------------------------
    // POST /api/contributions - Student Sell-to-Admin Paper Submission
    // -------------------------------------------------------------
    if (pathname === '/api/contributions' && method === 'POST') {
      const rawBody = await parseBody(req);
      const parsed = paperContributionSchema.safeParse(rawBody);

      if (!parsed.success) {
        return sendError(res, 400, 'Invalid contribution parameters', parsed.error.format());
      }

      const {
        courseId,
        examType,
        academicYear,
        examDate,
        declarationAccepted,
        declarationText,
        payoutPaymentMethod,
        payoutAccount,
        proposedPayoutEtb,
        studentNotes,
      } = parsed.data;

      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Student authentication required to submit exam papers');
      }
      const studentId = actor.id;

      // Check student permission & canSell status
      const student = await prisma.user.findUnique({
        where: { id: studentId },
      });

      if (!student || !student.isActive || student.deletedAt !== null) {
        return sendError(res, 403, 'Student is inactive, deleted, or does not exist');
      }

      if (!student.canSell) {
        return sendError(res, 403, 'User paper contribution permissions have been revoked by campus admin.');
      }

      // SERVER VALIDATION 1: Exam date must be strictly in the past (reject today or future dates)
      const examDateObj = new Date(examDate);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (isNaN(examDateObj.getTime()) || examDateObj >= todayStart) {
        return sendError(
          res,
          400,
          'Exam date must be in the past. Exams from today or future dates cannot be accepted for archival.'
        );
      }

      // SERVER VALIDATION 2: Only the 11 courses approved for Woliso Campus
      let course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        const cleanCode = (rawBody.courseCode || courseId.replace(/^course-/, ''))
          .replace(/-/g, ' ')
          .trim();
        course = await prisma.course.findFirst({
          where: {
            OR: [
              { code: { equals: cleanCode, mode: 'insensitive' } },
              { code: { equals: rawBody.courseCode || '', mode: 'insensitive' } },
            ],
          },
        });
      }
      if (!course || !course.isActive || course.deletedAt !== null) {
        return sendError(res, 400, 'Invalid course selected. Only the 11 approved freshman courses are accepted.');
      }
      const realCourseId = course.id;

      // SERVER VALIDATION 3: Three mandatory declarations with text and student timestamp
      const declaration1 = rawBody.declarationAuthentic === true || declarationAccepted;
      const declaration2 = rawBody.declarationUnreleased === true || declarationAccepted;
      const declaration3 = rawBody.declarationRightsTransfer === true || declarationAccepted;
      if (!declaration1 || !declaration2 || !declaration3) {
        return sendError(res, 400, 'All three mandatory student declarations must be explicitly accepted.');
      }

      const verifiedDeclarationText =
        declarationText ||
        '1. I affirm under academic honor code that I personally sat for or received this original exam paper at Ambo University Woliso Campus.\n' +
        '2. I certify that this exam paper has already been administered and does not contain confidential or unreleased upcoming exam material.\n' +
        '3. I transfer non-exclusive archival publication rights to ExamVault Woliso archive in exchange for the agreed buyout payout.';

      // SERVER VALIDATION 4: Daily limit (5/day) and Weekly limit (15/week)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dailyCount = await prisma.paperContribution.count({
        where: { studentId, createdAt: { gte: oneDayAgo } },
      });
      if (dailyCount >= 5) {
        return sendError(res, 429, 'Daily submission limit reached (maximum 5 contributions per 24 hours).');
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklyCount = await prisma.paperContribution.count({
        where: { studentId, createdAt: { gte: sevenDaysAgo } },
      });
      if (weeklyCount >= 15) {
        return sendError(res, 429, 'Weekly submission limit reached (maximum 15 contributions per 7 days).');
      }

      // Compute sha256 and enforce duplicate check
      const fileName = rawBody.fileName || `${examType}_${academicYear}_paper.pdf`;
      const fileSha256 = rawBody.sha256 || sha256(`file-${courseId}-${examDate}-${academicYear}-${fileName}`);

      // Auto-reject exact duplicates already in published library
      const existingPaper = await prisma.examPaper.findFirst({
        where: { sha256: fileSha256, deletedAt: null },
      });
      if (existingPaper) {
        return sendError(res, 409, 'This exact exam paper has already been digitized and published in ExamVault.');
      }

      const existingFile = await prisma.contributionFile.findFirst({
        where: { sha256: fileSha256 },
        include: { contribution: true },
      });
      if (existingFile && existingFile.contribution.status !== ContributionStatus.REJECTED) {
        return sendError(res, 409, 'This exact paper file is already undergoing review in the admin verification queue.');
      }

      // SECURITY: a client may only reference a file the server itself wrote
      // into the private quarantine namespace. Any other key (e.g. a
      // "published/..." paper key) is ignored and a fresh server-generated key
      // is used, preventing cross-object references and paywall bypass.
      let randomQuarantineKey = generateRandomStorageKey('quarantine', 'pdf');
      if (rawBody.storageKey && rawBody.storageKey.startsWith('quarantine/')) {
        const keyExists = await storage.exists(rawBody.storageKey).catch(() => false);
        if (keyExists) randomQuarantineKey = rawBody.storageKey;
      }

      // If file binary provided in base64, save to quarantine storage
      if (rawBody.fileBase64) {
        const buf = Buffer.from(rawBody.fileBase64, 'base64');
        const sig = detectFileSignature(buf);
        if (!sig.valid || !sig.detectedMime) {
          return sendError(res, 400, sig.error || 'Invalid file format. Authentic PDF, JPG, or PNG required.');
        }
        await storage.upload(randomQuarantineKey, buf, sig.detectedMime);
      }

      const contribution = await prisma.$transaction(async (tx) => {
        const c = await tx.paperContribution.create({
          data: {
            studentId,
            courseId: realCourseId,
            examType,
            examDate: examDateObj,
            academicYearEc: academicYear,
            studentNotes: studentNotes || null,
            declarationText: verifiedDeclarationText,
            declarationAcceptedAt: new Date(),
            payoutPaymentMethod,
            payoutAccount,
            proposedPayoutEtb: proposedPayoutEtb || 100,
            status: ContributionStatus.SUBMITTED,
          },
          include: {
            course: true,
            student: { select: { id: true, fullName: true, studentId: true } },
          },
        });

        await tx.contributionFile.create({
          data: {
            contributionId: c.id,
            storageKey: randomQuarantineKey,
            sha256: fileSha256,
            mimeType: 'application/pdf',
            sizeBytes: rawBody.fileSizeBytes || 2400000,
            pageOrder: 1,
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Paper contribution submitted by student',
            entityType: 'PaperContribution',
            entityId: c.id,
            actorId: studentId,
            riskLevel: AuditRiskLevel.LOW,
            details: {
              courseId: c.courseId,
              courseCode: course.code,
              examType: c.examType,
              examDate: examDate,
              payoutAccount: c.payoutAccount,
              proposedPayoutEtb: c.proposedPayoutEtb?.toString(),
            },
          },
        });

        return c;
      });

      return sendJson(res, 201, contribution);
    }

    // -------------------------------------------------------------
    // GET /api/contributions/my - Student Contributions & Earnings Dashboard
    // -------------------------------------------------------------
    if (pathname === '/api/contributions/my' && method === 'GET') {
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor) {
        return sendError(res, 401, 'Authentication required to view your contributions.');
      }

      const myContribs = await prisma.paperContribution.findMany({
        where: { studentId: actor.id },
        include: {
          course: true,
          files: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalEarnedEtb = myContribs
        .filter((c) => c.status === ContributionStatus.PAID)
        .reduce((sum, c) => sum + Number(c.approvedPayoutEtb || 0), 0);

      const pendingPayoutEtb = myContribs
        .filter((c) => c.status === ContributionStatus.PUBLISHED || c.status === ContributionStatus.ACCEPTED)
        .reduce((sum, c) => sum + Number(c.approvedPayoutEtb || c.proposedPayoutEtb || 0), 0);

      return sendJson(res, 200, {
        contributions: myContribs,
        totalEarnedEtb,
        pendingPayoutEtb,
        count: myContribs.length,
      });
    }

    // -------------------------------------------------------------
    // POST /api/contributions/:id/review - Admin Review (Approve, Counter-offer, Request scan, Reject)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/contributions/') && pathname.endsWith('/review') && method === 'POST') {
      const parts = pathname.split('/');
      const contribId = parts[3];
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to review content submissions.');
      }

      const { action, approvedPayoutEtb, counterOfferEtb, reason } = body;
      const contrib = await prisma.paperContribution.findUnique({
        where: { id: contribId },
        include: { course: true, student: true, files: true },
      });

      if (!contrib) {
        return sendError(res, 404, 'Contribution not found');
      }

      let newStatus: ContributionStatus = contrib.status;
      let finalApprovedAmount = contrib.approvedPayoutEtb;

      if (action === 'APPROVE') {
        newStatus = ContributionStatus.ACCEPTED;
        finalApprovedAmount = new Prisma.Decimal(Number(approvedPayoutEtb || contrib.proposedPayoutEtb || 100));
      } else if (action === 'COUNTER_OFFER') {
        newStatus = ContributionStatus.OFFER_MADE;
        finalApprovedAmount = new Prisma.Decimal(Number(counterOfferEtb || 80));
      } else if (action === 'REQUEST_BETTER_SCAN') {
        newStatus = ContributionStatus.CHANGES_REQUESTED;
      } else if (action === 'REJECT') {
        newStatus = ContributionStatus.REJECTED;
        if (!reason) return sendError(res, 400, 'Rejection reason is required.');
      } else if (action === 'START_REVIEW') {
        newStatus = ContributionStatus.IN_REVIEW;
      } else {
        return sendError(res, 400, 'Invalid review action. Allowed: APPROVE, COUNTER_OFFER, REQUEST_BETTER_SCAN, REJECT, START_REVIEW');
      }

      const updated = await prisma.paperContribution.update({
        where: { id: contribId },
        data: {
          status: newStatus,
          approvedPayoutEtb: finalApprovedAmount,
          rejectionReason: reason || null,
          reviewedById: actor?.id || null,
          reviewedAt: new Date(),
        },
        include: { course: true },
      });

      // Notification
      let notifTitle = 'Contribution Update';
      let notifMsg = `Your contribution for ${contrib.course.code} has been updated.`;
      if (newStatus === ContributionStatus.ACCEPTED) {
        notifTitle = 'Contribution Accepted!';
        notifMsg = `Your ${contrib.course.code} paper was accepted at ${finalApprovedAmount} ETB. Payout will be issued soon.`;
      } else if (newStatus === ContributionStatus.OFFER_MADE) {
        notifTitle = 'Counter-Offer Received';
        notifMsg = `Admin made an offer of ${finalApprovedAmount} ETB for your ${contrib.course.code} submission.`;
      } else if (newStatus === ContributionStatus.CHANGES_REQUESTED) {
        notifTitle = 'Clearer Scan Requested';
        notifMsg = `Please upload a clearer scan for ${contrib.course.code}: ${reason || 'Pages are blurry or poorly aligned.'}`;
      } else if (newStatus === ContributionStatus.REJECTED) {
        notifTitle = 'Contribution Rejected';
        notifMsg = `Your ${contrib.course.code} submission was declined: ${reason}`;
      }

      await prisma.notification.create({
        data: {
          userId: contrib.studentId,
          title: notifTitle,
          message: notifMsg,
          type: newStatus === ContributionStatus.REJECTED ? 'WARNING' : 'INFO',
        },
      });

      await prisma.auditLog.create({
        data: {
          action: `Contribution review: ${action}`,
          entityType: 'PaperContribution',
          entityId: contrib.id,
          actorId: actor?.id || null,
          riskLevel: AuditRiskLevel.LOW,
          details: { action, newStatus, approvedPayoutEtb: finalApprovedAmount?.toString(), reason },
        },
      });

      return sendJson(res, 200, updated);
    }

    // -------------------------------------------------------------
    // POST /api/contributions/:id/publish - Publish Contribution to ExamPaper Archive
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/contributions/') && pathname.endsWith('/publish') && method === 'POST') {
      const parts = pathname.split('/');
      const contribId = parts[3];
      const actor = await resolveActor(req, undefined, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to publish exam papers.');
      }

      const contrib = await prisma.paperContribution.findUnique({
        where: { id: contribId },
        include: { course: true, files: true, student: true },
      });

      if (!contrib) {
        return sendError(res, 404, 'Contribution not found');
      }

      const file = contrib.files[0] || {
        storageKey: `quarantine/${contrib.id}.pdf`,
        sha256: sha256(`contrib-${contrib.id}`),
        mimeType: 'application/pdf',
        sizeBytes: 2500000,
      };

      // Real storage promotion: copy from quarantine/ to published/
      const publishedKey = generateRandomStorageKey(
        'published',
        'pdf',
        contrib.course.code.replace(/\s+/g, '')
      );

      const quarantineData = await storage.download(file.storageKey);
      if (!quarantineData) {
        return sendError(
          res,
          400,
          'Cannot approve contribution: the uploaded exam paper file is missing from quarantine storage.'
        );
      }
      await storage.upload(publishedKey, quarantineData, file.mimeType);

      const result = await prisma.$transaction(async (tx) => {
        // Create published ExamPaper with unique link to contribution
        const examPaper = await tx.examPaper.create({
          data: {
            courseId: contrib.courseId,
            title: `${contrib.course.code} · ${contrib.examType} Exam ${contrib.academicYearEc} E.C.`,
            examType: contrib.examType,
            examYearEc: contrib.academicYearEc,
            quality: ScanQuality.EXCELLENT,
            pageCount: estimatePageCount(file.sizeBytes),
            storageKey: publishedKey,
            sha256: file.sha256,
            mimeType: file.mimeType,
            fileSizeBytes: file.sizeBytes,
            isFreeSample: false,
            status: PaperStatus.PUBLISHED,
            uploadedById: contrib.studentId,
            publishedAt: new Date(),
          },
        });

        // Set contribution status to PUBLISHED
        const updatedContrib = await tx.paperContribution.update({
          where: { id: contribId },
          data: {
            status: ContributionStatus.PUBLISHED,
            examPaperId: examPaper.id,
            reviewedById: actor?.id || null,
            reviewedAt: new Date(),
          },
          include: { course: true },
        });

        // Notification
        await tx.notification.create({
          data: {
            userId: contrib.studentId,
            title: 'Exam Paper Published!',
            message: `Your ${contrib.course.code} exam paper has been officially published to the Woliso Campus archive! Your payout is in the payout queue.`,
            type: 'SUCCESS',
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Contribution promoted and published to ExamPaper',
            entityType: 'PaperContribution',
            entityId: contrib.id,
            actorId: actor?.id || null,
            riskLevel: AuditRiskLevel.LOW,
            details: {
              contributionId: contrib.id,
              examPaperId: examPaper.id,
              publishedKey,
              courseCode: contrib.course.code,
            },
          },
        });

        return { contribution: updatedContrib, examPaper };
      });

      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // POST /api/contributions/:id/payout - Record Transfer Reference & Settle Payout
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/contributions/') && pathname.endsWith('/payout') && method === 'POST') {
      const parts = pathname.split('/');
      const contribId = parts[3];
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.PAYMENT_VERIFIER)) {
        return sendError(res, 403, 'Content managers and unauthorized users are not authorized to disburse payouts.');
      }

      const payoutTxId = body.payoutTxId?.trim();
      if (!payoutTxId) {
        return sendError(res, 400, 'Unique payout transfer reference (payoutTxId) is required.');
      }

      // Check unique transfer reference
      const existingTx = await prisma.paperContribution.findUnique({
        where: { payoutTxId },
      });
      if (existingTx && existingTx.id !== contribId) {
        return sendError(res, 409, `Transfer reference ${payoutTxId} has already been recorded for another payout.`);
      }

      const contrib = await prisma.paperContribution.findUnique({
        where: { id: contribId },
        include: { course: true, student: true },
      });

      if (!contrib) {
        return sendError(res, 404, 'Contribution not found');
      }

      if (contrib.status === ContributionStatus.PAID) {
        return sendError(res, 409, 'This contribution has already been paid out.');
      }

      // Sole amount used for payout is approvedPayoutEtb! Client cannot change it.
      const settleAmount = Number(contrib.approvedPayoutEtb || contrib.proposedPayoutEtb || 100);

      const paidContrib = await prisma.$transaction(async (tx) => {
        const updated = await tx.paperContribution.update({
          where: { id: contribId },
          data: {
            status: ContributionStatus.PAID,
            payoutTxId,
            approvedPayoutEtb: settleAmount,
          },
          include: { course: true },
        });

        await tx.notification.create({
          data: {
            userId: contrib.studentId,
            title: 'Payout Disbursed!',
            message: `Payment of ${settleAmount} ETB was transferred to your ${contrib.payoutPaymentMethod} account (${contrib.payoutAccount}). Reference: ${payoutTxId}.`,
            type: 'SUCCESS',
          },
        });

        await tx.auditLog.create({
          data: {
            action: 'Contribution payout settled and marked PAID',
            entityType: 'PaperContribution',
            entityId: contrib.id,
            actorId: actor?.id || null,
            riskLevel: AuditRiskLevel.MEDIUM,
            details: {
              contributionId: contrib.id,
              payoutTxId,
              payoutAccount: contrib.payoutAccount,
              amountEtb: settleAmount.toString(),
            },
          },
        });

        return updated;
      });

      return sendJson(res, 200, paidContrib);
    }

    // -------------------------------------------------------------
    // POST /api/contributions/:id/approve - Legacy/Direct Buyout Approval (Sets ACCEPTED & links paper)
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/contributions/') && pathname.endsWith('/approve') && method === 'POST') {
      const parts = pathname.split('/');
      const contribId = parts[3];
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);
      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Permission denied: Only administrators and content managers can approve contributions.');
      }
      const reviewerId = actor.id;
      const approvedPayoutEtb = Number(body.approvedPayoutEtb) || 100.00;
      const payoutTxId = body.payoutTxId || `TB_PAYOUT_${Math.floor(1000 + Math.random() * 9000)}`;

      const contrib = await prisma.paperContribution.findUnique({
        where: { id: contribId },
        include: {
          course: true,
          student: true,
          files: true,
        },
      });

      if (!contrib) {
        return sendError(res, 404, 'Contribution not found');
      }

      if (!contrib.files || contrib.files.length === 0) {
        return sendError(res, 400, 'Cannot approve contribution: no uploaded paper files associated with this submission.');
      }

      const file = contrib.files[0];
      const quarantineData = await storage.download(file.storageKey);
      if (!quarantineData) {
        return sendError(res, 400, 'Cannot approve contribution: the uploaded exam paper file is missing from quarantine storage.');
      }

      const publishedKey = file.storageKey.startsWith('quarantine/')
        ? file.storageKey.replace('quarantine/', 'published/')
        : `published/${file.storageKey}`;

      await storage.upload(publishedKey, quarantineData, file.mimeType);

      const result = await prisma.$transaction(async (tx) => {
        // Create Published ExamPaper
        const examPaper = await tx.examPaper.create({
          data: {
            courseId: contrib.courseId,
            title: `${contrib.course.code} · ${contrib.examType} Exam ${contrib.academicYearEc} E.C.`,
            examType: contrib.examType,
            examYearEc: contrib.academicYearEc,
            quality: ScanQuality.EXCELLENT,
            pageCount: estimatePageCount(file.sizeBytes),
            storageKey: publishedKey,
            sha256: file.sha256,
            mimeType: file.mimeType,
            fileSizeBytes: file.sizeBytes,
            isFreeSample: false,
            status: PaperStatus.PUBLISHED,
            uploadedById: contrib.studentId,
            publishedAt: new Date(),
          },
        });

        // Update Contribution to ACCEPTED and link paper
        const updatedContrib = await tx.paperContribution.update({
          where: { id: contribId },
          data: {
            status: ContributionStatus.ACCEPTED,
            approvedPayoutEtb,
            payoutTxId,
            reviewedById: reviewerId || null,
            reviewedAt: new Date(),
            examPaperId: examPaper.id,
          },
          include: {
            course: true,
            student: true,
          },
        });

        // Student Notification
        await tx.notification.create({
          data: {
            userId: contrib.studentId,
            title: 'Exam paper payout approved!',
            message: `Your ${contrib.course.code} exam submission was accepted. Payout of ${approvedPayoutEtb} ETB was issued to your account (Ref: ${payoutTxId}).`,
            type: 'SUCCESS',
          },
        });

        // Audit Log
        await tx.auditLog.create({
          data: {
            action: 'Student paper buyout settled & published',
            entityType: 'PaperContribution',
            entityId: contrib.id,
            actorId: reviewerId || null,
            riskLevel: AuditRiskLevel.MEDIUM,
            details: {
              approvedPayoutEtb,
              payoutTxId,
              publishedPaperId: examPaper.id,
              courseCode: contrib.course.code,
            },
          },
        });

        return { contribution: updatedContrib, examPaper };
      });

      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // POST /api/settings - Update System Settings
    // -------------------------------------------------------------
    if (pathname === '/api/settings' && method === 'POST') {
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);
      if (!actor || actor.role !== Role.ADMIN) {
        return sendError(res, 403, 'Permission denied: Only administrators can update platform settings.');
      }
      const actorId = actor.id;
      const updates = body.settings as Record<string, string>;

      if (!updates || typeof updates !== 'object') {
        return sendError(res, 400, 'Settings dictionary required');
      }

      for (const [key, val] of Object.entries(updates)) {
        await prisma.systemSetting.upsert({
          where: { key },
          update: { value: String(val) },
          create: { key, value: String(val) },
        });
      }

      await prisma.auditLog.create({
        data: {
          action: 'Platform settings updated',
          entityType: 'SystemSetting',
          actorId: actorId || null,
          riskLevel: AuditRiskLevel.MEDIUM,
          details: updates,
        },
      });

      const all = await prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
      return sendJson(res, 200, all);
    }

    // -------------------------------------------------------------
    // POST /api/term-interest - Notification signup for Y1S2
    // -------------------------------------------------------------
    if (pathname === '/api/term-interest' && method === 'POST') {
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      // SECURITY: a term-interest record belongs to the authenticated account
      // only. Never trust a client-supplied userId — doing so allowed anyone to
      // write rows against arbitrary users and to overwrite a victim's phone
      // number (an account-takeover primitive, since login accepts phone).
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required to register for term interest.');
      }
      const userId = actor.id;

      const userExists = await prisma.user.findUnique({ where: { id: userId } });
      if (!userExists) {
        return sendError(res, 404, 'User account not found');
      }

      let termId = body.termId;
      if (!termId || termId === 'term-y1s2' || termId === 'y1s2' || termId.length < 30) {
        const y1s2Term = await prisma.term.findFirst({
          where: { yearNumber: 1, semesterNumber: 2 },
        });
        if (y1s2Term) {
          termId = y1s2Term.id;
        }
      } else {
        const termExists = await prisma.term.findUnique({ where: { id: termId } });
        if (!termExists) {
          const y1s2Term = await prisma.term.findFirst({
            where: { yearNumber: 1, semesterNumber: 2 },
          });
          if (y1s2Term) termId = y1s2Term.id;
        }
      }

      if (!termId) {
        return sendError(res, 400, 'Valid termId required');
      }

      const rec = await prisma.termInterest.upsert({
        where: {
          userId_termId: {
            userId,
            termId,
          },
        },
        update: {},
        create: {
          userId,
          termId,
        },
        include: {
          term: true,
          user: true,
        },
      });

      const channel = typeof body.channel === 'string' ? body.channel.trim() : 'sms';
      const contact = typeof body.contact === 'string' ? body.contact.trim() : (userExists.phone || userExists.email || '');

      // SECURITY: never write a user's phone number from an unverified contact
      // value. A profile phone change must go through a verified flow (OTP),
      // which does not exist yet, so we only record the preference here.
      void contact;

      // Record in AuditLog with channel and contact details
      await prisma.auditLog.create({
        data: {
          action: 'Semester 2 Interest Notification Registered',
          entityType: 'TermInterest',
          entityId: rec.id,
          actorId: userId,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            userId,
            termId,
            channel,
            contact,
            academicYear: 1,
            semester: 2,
          },
        },
      });

      // Dispatch confirmation notification to student
      await prisma.notification.create({
        data: {
          userId,
          title: 'Semester 2 Alert Confirmed',
          message: `You will be alerted via ${channel.toUpperCase()} (${contact}) when Year 1 Semester 2 exam papers are published.`,
          type: 'INFO',
        },
      });

      return sendJson(res, 201, {
        ...rec,
        channel,
        contact,
      });
    }

    // -------------------------------------------------------------
    // GET /api/requests - Paper Requests
    // -------------------------------------------------------------
    if (pathname === '/api/requests' && method === 'GET') {
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor) {
        return sendError(res, 401, 'Authentication required');
      }

      if (actor.role === Role.ADMIN || actor.role === Role.CONTENT_MANAGER) {
        const requests = await prisma.paperRequest.findMany({
          include: { student: true, course: true },
          orderBy: { createdAt: 'desc' },
        });
        return sendJson(res, 200, requests);
      }

      const requests = await prisma.paperRequest.findMany({
        where: { studentId: actor.id },
        include: { student: true, course: true },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, requests);
    }

    // -------------------------------------------------------------
    // POST /api/requests - Submit a paper request
    // -------------------------------------------------------------
    if (pathname === '/api/requests' && method === 'POST') {
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);
      if (!actor) {
        return sendError(res, 401, 'Authentication required to submit paper requests');
      }

      const { courseId, examType, examYear, notes } = body;
      if (!courseId) {
        return sendError(res, 400, 'Course ID is required');
      }

      // Resolve course by ID or code
      let course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        const codeQuery = courseId.replace(/^course-/, '').replace(/-/g, ' ').toUpperCase();
        course = await prisma.course.findFirst({
          where: {
            OR: [
              { code: { equals: codeQuery, mode: 'insensitive' } },
              { code: { contains: codeQuery.replace(/\s+/g, ''), mode: 'insensitive' } },
            ],
          },
        });
      }

      if (!course) {
        return sendError(res, 404, 'Course not found');
      }

      // Validate exam type
      const normalizedType = String(examType || 'FINAL').toUpperCase();
      let validExamType: ExamType = ExamType.FINAL;
      if (normalizedType.includes('MID')) validExamType = ExamType.MID;
      else if (normalizedType.includes('QUIZ')) validExamType = ExamType.QUIZ;
      else if (normalizedType.includes('FINAL')) validExamType = ExamType.FINAL;

      const paperRequest = await prisma.paperRequest.create({
        data: {
          studentId: actor.id,
          courseId: course.id,
          examType: validExamType,
          examYear: examYear ? parseInt(String(examYear), 10) : null,
          notes: notes ? String(notes).trim() : null,
        },
        include: {
          course: true,
          student: true,
        },
      });

      return sendJson(res, 201, paperRequest);
    }

    // -------------------------------------------------------------
    // POST /api/upload - Secure File Upload with Magic Bytes Verification
    // -------------------------------------------------------------
    if (pathname === '/api/upload' && method === 'POST') {
      const body = await parseBody(req);
      const { fileBase64, reportedMime, category } = body;

      if (!fileBase64) {
        return sendError(res, 400, 'File content (fileBase64) is required.');
      }

      const buf = Buffer.from(fileBase64, 'base64');
      const signature = detectFileSignature(buf);
      if (!signature.valid || !signature.detectedMime) {
        return sendError(res, 400, signature.error || 'Invalid file format. Only authentic PDF, JPG, and PNG files are accepted.');
      }

      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required to upload files.');
      }

      const ip = getClientIp(req);
      const rl = await checkRateLimit(`upload:${ip}`, 30, 600);
      if (!rl.allowed) {
        return sendError(res, 429, 'Upload rate limit exceeded. Please wait a few minutes before trying again.');
      }

      // Check configured size limit from system settings
      const settingKey = category === 'screenshot' ? 'MAX_SCREENSHOT_SIZE_MB' : 'MAX_UPLOAD_SIZE_MB';
      const defaultMb = category === 'screenshot' ? 5 : 20;
      const setting = await prisma.systemSetting.findUnique({ where: { key: settingKey } });
      const maxMb = setting ? Number(setting.value) || defaultMb : defaultMb;

      if (buf.byteLength > maxMb * 1024 * 1024) {
        return sendError(res, 400, `File size exceeds the maximum allowed limit of ${maxMb} MB.`);
      }

      // Generate randomized storage key (never includes user filename)
      const storageKey = generateRandomStorageKey('quarantine', signature.detectedExt || 'pdf');
      await storage.upload(storageKey, buf, signature.detectedMime);
      const fileSha256 = sha256(buf);

      return sendJson(res, 201, {
        storageKey,
        sha256: fileSha256,
        mimeType: signature.detectedMime,
        sizeBytes: buf.byteLength,
      });
    }

    // -------------------------------------------------------------
    // AUTH & SESSION MANAGEMENT (Max 2 Concurrent Sessions)
    // -------------------------------------------------------------
    if (pathname === '/api/auth/session' && method === 'POST') {
      const actor = await resolveActor(req);
      if (!actor || actor.role !== Role.ADMIN) {
        return sendError(res, 403, 'Unauthorized: Only administrators can provision arbitrary sessions.');
      }

      const body = await parseBody(req);
      const { userId, userAgent, evictOldest } = body;

      if (!userId) {
        return sendError(res, 400, 'User ID is required');
      }

      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';

      // Count active unexpired sessions for user
      const activeSessions = await prisma.session.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
      });

      if (activeSessions.length >= 2) {
        if (!evictOldest) {
          return sendError(res, 403, 'Maximum 2 concurrent active sessions reached. Please log out from another device.');
        }
        // Evict oldest session to maintain <= 2 concurrent active sessions
        await prisma.session.delete({ where: { id: activeSessions[0].id } });
      }

      const rawToken = crypto.randomUUID();
      const sessionTokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const session = await prisma.session.create({
        data: {
          userId,
          sessionTokenHash,
          ipAddress: ip,
          userAgent: userAgent || (req.headers['user-agent'] as string) || 'Browser',
          expiresAt,
        },
      });

      return sendJson(res, 201, { session, rawToken });
    }

    if (pathname === '/api/auth/sessions' && method === 'GET') {
      const actor = await resolveActor(req);
      if (!actor) {
        return sendError(res, 401, 'Unauthorized: Authentication required.');
      }
      const requestedUserId = url.searchParams.get('userId');
      // Non-admins can strictly only inspect their own sessions
      const targetUserId = (actor.role === Role.ADMIN && requestedUserId) ? requestedUserId : actor.id;

      const sessions = await prisma.session.findMany({
        where: { userId: targetUserId, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });

      return sendJson(res, 200, sessions);
    }

    // -------------------------------------------------------------
    // GET /api/papers/:id/access - Server-side Paper Authorization & Signed Stream
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.endsWith('/access') && method === 'GET') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const actor = await resolveActor(req, undefined, url.searchParams);

      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required');
      }
      const userId = actor.id;

      const [user, paper, entitlements, activeSessionsCount] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            fullName: true,
            studentId: true,
            role: true,
            isActive: true,
            deletedAt: true,
          },
        }),
        prisma.examPaper.findUnique({
          where: { id: paperId },
          include: {
            course: true,
          },
        }),
        prisma.entitlement.findMany({
          where: { userId, isActive: true },
          include: {
            programTerm: {
              include: {
                courses: true,
              },
            },
          },
        }),
        prisma.session.count({
          where: { userId, expiresAt: { gt: new Date() } },
        }),
      ]);

      // Enforce max 2 concurrent sessions per account
      if (activeSessionsCount > 2) {
        return sendJson(res, 403, {
          allowed: false,
          reason: 'MAX_CONCURRENT_SESSIONS',
          message: 'Maximum 2 concurrent sessions reached. Please log out from another device.',
        });
      }

      const entitlementContexts = entitlements.map((e) => ({
        userId: e.userId,
        isActive: e.isActive,
        validUntil: e.validUntil ? e.validUntil.toISOString() : null,
        courseIds: e.programTerm.courses.map((c) => c.courseId),
      }));

      const check = verifyPaperAccess(
        user ? { ...user, deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null } : null,
        paper ? {
          id: paper.id,
          courseId: paper.courseId,
          status: paper.status,
          isFreeSample: paper.isFreeSample,
          deletedAt: paper.deletedAt ? paper.deletedAt.toISOString() : null,
          course: {
            id: paper.course.id,
            isActive: paper.course.isActive,
            deletedAt: paper.course.deletedAt ? paper.course.deletedAt.toISOString() : null,
          },
        } : null,
        entitlementContexts
      );

      if (!check.allowed) {
        return sendJson(res, 403, {
          allowed: false,
          reason: check.reason,
          message: 'Access denied to exam paper',
        });
      }

      // Log authorized view to PaperViewLog
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

      await prisma.paperViewLog.create({
        data: {
          examPaperId: paperId,
          userId,
          ipAddress: ip,
          userAgent,
        },
      });

      // Ensure paper binary exists in storage - fail with clear error if missing (Hard Rule 2)
      const existsInStorage = await storage.exists(paper!.storageKey);
      if (!existsInStorage) {
        return sendError(res, 404, 'Exam paper document file is missing from secure storage.');
      }

      // Issue signed URL expiring in 2 hours (allows complete study sessions without mid-reading cutoffs)
      const secret = getSessionSecret();
      const expiresInSeconds = 7200;
      const expiresAtMs = Date.now() + expiresInSeconds * 1000;
      const streamToken = signStreamTicket(paper!.storageKey, expiresAtMs, secret, userId);
      const streamUrl = `/api/papers/${paper!.id}/stream?token=${streamToken}&expires=${expiresAtMs}&u=${encodeURIComponent(userId)}`;

      return sendJson(res, 200, {
        allowed: true,
        streamUrl,
        expiresAt: expiresAtMs,
        watermark: {
          studentName: user?.fullName || 'ExamVault Student',
          studentId: user?.studentId || 'AMU-2026-0042',
          ipAddress: ip,
          timestamp: new Date().toISOString(),
        },
        paper,
      });
    }

    // -------------------------------------------------------------
    // GET /api/papers/:id/stream - Server-side Paper Stream with Cache-Control: no-store
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.endsWith('/stream') && method === 'GET') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const token = url.searchParams.get('token');
      const expires = url.searchParams.get('expires');

      if (!token || !expires) {
        return sendError(res, 403, 'Missing required stream security token or expiration timestamp');
      }

      const expiresNum = Number(expires);
      if (isNaN(expiresNum) || Date.now() > expiresNum) {
        return sendError(res, 403, 'Signed URL has expired. Please refresh the viewer.');
      }

      const paper = await prisma.examPaper.findUnique({
        where: { id: paperId },
      });

      if (!paper || paper.deletedAt !== null) {
        return sendError(res, 404, 'Exam paper not found or has been removed.');
      }

      if (paper.status !== PaperStatus.PUBLISHED) {
        return sendError(res, 403, 'Exam paper is not available for streaming.');
      }

      const actor = await resolveActor(req);
      const userBinding = url.searchParams.get('u') || actor?.id || undefined;
      const secret = getSessionSecret();
      const isValidSig = verifyStreamTicket(paper.storageKey, expiresNum, token, secret, userBinding);
      if (!isValidSig) {
        return sendError(res, 403, 'Invalid or forged stream signature. Access denied.');
      }

      const data = await storage.download(paper.storageKey);
      if (!data) {
        return sendError(res, 404, 'Paper asset not found in private storage');
      }

      res.writeHead(200, {
        'Content-Type': paper.mimeType || 'application/pdf',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline', // NEVER attachment! No direct download!
      });
      res.end(Buffer.from(data));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/storage/view - Direct Private Storage View via Signed URL or Staff Session
    // -------------------------------------------------------------
    if (pathname === '/api/storage/view' && method === 'GET') {
      const key = url.searchParams.get('key');
      const expires = url.searchParams.get('expires');
      const sig = url.searchParams.get('sig');

      if (!key) {
        return sendError(res, 400, 'Missing storage key parameter');
      }

      if (!key.startsWith('quarantine/') && !key.startsWith('published/')) {
        return sendError(res, 403, 'Access denied. Storage prefix must be "quarantine/" or "published/".');
      }

      let authorized = false;

      // Check if signed URL with valid signature and unexpired timestamp
      if (sig && expires) {
        const expiresNum = Number(expires);
        if (!isNaN(expiresNum) && Date.now() <= expiresNum) {
          const secret = getSessionSecret();
          if (verifyStreamTicket(key, expiresNum, sig, secret)) {
            authorized = true;
          }
        }
      }

      // Check if authenticated user/staff session
      if (!authorized) {
        const actor = await resolveActor(req);
        if (actor) {
          if (
            actor.role === Role.ADMIN ||
            actor.role === Role.PAYMENT_VERIFIER ||
            actor.role === Role.CONTENT_MANAGER
          ) {
            authorized = true;
          } else if (actor.role === Role.STUDENT) {
            // SECURITY: students may only read their own uploaded receipts and
            // submissions. Published paper assets are never served here — they
            // are streamed through signed, entitlement-checked tickets.
            if (key.startsWith('quarantine/')) {
              const ownPayment = await prisma.payment.findFirst({
                where: { screenshotKey: key, userId: actor.id },
              });
              const ownContrib = !ownPayment
                ? await prisma.paperContribution.findFirst({
                    where: {
                      studentId: actor.id,
                      files: { some: { storageKey: key } },
                    },
                  })
                : null;
              if (ownPayment || ownContrib) {
                authorized = true;
              }
            }
          }
        }
      }

      if (!authorized) {
        return sendError(res, 403, 'Direct storage key access is strictly forbidden without a signed URL or authorized session.');
      }

      const data = await storage.download(key);
      if (!data) {
        return sendError(res, 404, 'Asset not found in private storage.');
      }

      const sigCheck = detectFileSignature(data);
      const mime = sigCheck.detectedMime || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      });
      res.end(Buffer.from(data));
      return;
    }

    // -------------------------------------------------------------
    // GET /api/papers/:id/pages/:pageNum - Authenticated Compressed Page Image
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.includes('/pages/') && method === 'GET') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const pageNum = parseInt(parts[5], 10) || 1;

      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required to view exam pages.');
      }

      const paper = await prisma.examPaper.findUnique({
        where: { id: paperId },
        include: { course: true },
      });

      if (!paper || paper.deletedAt !== null) {
        return sendError(res, 404, 'Exam paper not found.');
      }

      // Verify access permission
      const canManage = actor.role === Role.ADMIN || actor.role === Role.CONTENT_MANAGER;
      if (!canManage) {
        const entitlements = await prisma.entitlement.findMany({
          where: { userId: actor.id, isActive: true },
          include: { programTerm: { include: { courses: true } } },
        });
        const entitlementContexts = entitlements.map((e) => ({
          userId: e.userId,
          isActive: e.isActive,
          validUntil: e.validUntil ? e.validUntil.toISOString() : null,
          courseIds: e.programTerm.courses.map((c) => c.courseId),
        }));

        const check = verifyPaperAccess(
          actor.user ? { ...actor.user, deletedAt: actor.user.deletedAt ? actor.user.deletedAt.toISOString() : null } : null,
          {
            id: paper.id,
            courseId: paper.courseId,
            status: paper.status,
            isFreeSample: paper.isFreeSample,
            deletedAt: null,
            course: {
              id: paper.course.id,
              isActive: paper.course.isActive,
              deletedAt: paper.course.deletedAt ? paper.course.deletedAt.toISOString() : null,
            },
          },
          entitlementContexts
        );

        if (!check.allowed) {
          return sendError(res, 403, 'Access denied to this exam paper.');
        }
      }

      const pageKey = `published/${paper.id}/pages/page_${pageNum}.svg`;
      const pageData = await storage.download(pageKey);

      if (!pageData) {
        return sendError(res, 404, 'Paper page asset not found in storage.');
      }

      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        // SECURITY: SVG is served inline from the app origin. A restrictive CSP
        // neutralises any script/foreignObject payload that ever reaches this
        // asset, even if generation-side escaping is bypassed.
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      res.end(Buffer.from(pageData));
      return;
    }

    // -------------------------------------------------------------
    // POST /api/papers/:id/report - "Report a Problem" Action
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.endsWith('/report') && method === 'POST') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const actor = await resolveActor(req);
      if (!actor || !actor.user) {
        return sendError(res, 401, 'Authentication required to report issues.');
      }
      const userId = actor.id;

      const body = await parseBody(req);
      const { category, description } = body;

      if (!category) {
        return sendError(res, 400, 'Problem category is required');
      }

      const paper = await prisma.examPaper.findUnique({
        where: { id: paperId },
        include: { course: true },
      });

      if (!paper) {
        return sendError(res, 404, 'Exam paper not found');
      }

      await prisma.auditLog.create({
        data: {
          action: 'Student reported issue on exam paper',
          entityType: 'ExamPaper',
          entityId: paperId,
          actorId: userId,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            category,
            description: description || '',
            paperTitle: paper.title,
            courseCode: paper.course.code,
          },
        },
      });

      await prisma.notification.create({
        data: {
          userId,
          title: 'Problem Report Received',
          message: `Your report regarding "${paper.title}" (${category}) has been logged. Woliso Campus staff will review the quality.`,
          type: 'INFO',
        },
      });

      return sendJson(res, 201, {
        success: true,
        message: 'Problem report recorded successfully. Woliso Campus team notified.',
      });
    }

    // -------------------------------------------------------------
    // GET /api/papers/check-duplicate - SHA-256 Duplicate Pre-check
    // -------------------------------------------------------------
    if (pathname === '/api/papers/check-duplicate' && method === 'GET') {
      const actor = await resolveActor(req);
      if (!actor) {
        return sendError(res, 401, 'Authentication required to check paper duplicates.');
      }

      const fileSha256 = url.searchParams.get('sha256');
      if (!fileSha256) {
        return sendError(res, 400, 'sha256 query parameter is required.');
      }

      const existingPaper = await prisma.examPaper.findFirst({
        where: { sha256: fileSha256, deletedAt: null },
        include: { course: true },
      });

      if (existingPaper) {
        return sendJson(res, 200, {
          isDuplicate: true,
          paper: {
            id: existingPaper.id,
            title: existingPaper.title,
            courseCode: existingPaper.course.code,
            courseTitle: existingPaper.course.title,
            examType: existingPaper.examType,
            examYearEc: existingPaper.examYearEc,
            status: existingPaper.status,
          },
          message: `Exact duplicate match found: "${existingPaper.title}" (${existingPaper.course.code}) has an identical SHA-256 hash.`,
        });
      }

      return sendJson(res, 200, { isDuplicate: false });
    }

    // -------------------------------------------------------------
    // GET /api/papers - Search, Filter, Sort Papers Library
    // -------------------------------------------------------------
    if (pathname === '/api/papers' && method === 'GET') {
      const actor = await resolveActor(req);
      const canManageContent = actor && (actor.role === Role.ADMIN || actor.role === Role.CONTENT_MANAGER);
      const courseId = url.searchParams.get('courseId');
      const examType = url.searchParams.get('examType') as ExamType | null;
      const status = url.searchParams.get('status') as PaperStatus | null;
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
      const search = url.searchParams.get('search')?.toLowerCase();

      const whereClause: any = {};
      // SECURITY: Non-managers (guests, students, payment verifiers) strictly only see PUBLISHED and active papers
      if (canManageContent) {
        if (!includeDeleted) whereClause.deletedAt = null;
        if (status) whereClause.status = status;
      } else {
        whereClause.deletedAt = null;
        whereClause.status = PaperStatus.PUBLISHED;
      }
      if (courseId) whereClause.courseId = courseId;
      if (examType) whereClause.examType = examType;

      let papers = await prisma.examPaper.findMany({
        where: whereClause,
        include: {
          course: true,
          uploadedBy: { select: { id: true, fullName: true, role: true } },
          _count: { select: { views: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (search) {
        papers = papers.filter(
          (p) =>
            p.title.toLowerCase().includes(search) ||
            p.course.code.toLowerCase().includes(search) ||
            p.course.title.toLowerCase().includes(search)
        );
      }

      return sendJson(res, 200, papers);
    }

    // -------------------------------------------------------------
    // POST /api/papers - Single and Bulk Paper Drag-and-Drop Upload
    // -------------------------------------------------------------
    if (pathname === '/api/papers' && method === 'POST') {
      const actor = await resolveActor(req);
      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers are not authorized to create or upload exam papers.');
      }

      const body = await parseBody(req);

      const rawList: any[] = Array.isArray(body.bulk) ? body.bulk : [body];
      const results: any[] = [];

      for (const item of rawList) {
        const {
          courseId,
          examType = 'FINAL',
          examYearEc = 2015,
          quality = 'EXCELLENT',
          status = 'PUBLISHED',
          isFreeSample = false,
          title,
          sha256: itemSha,
          storageKey: itemKey,
          mimeType = 'application/pdf',
          fileSizeBytes = 2500000,
          pageCount: pageCountInput = null,
          force = false,
        } = item;

        if (!courseId) {
          return sendError(res, 400, 'courseId is required for each paper');
        }

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) {
          return sendError(res, 404, `Course not found for ID: ${courseId}`);
        }

        const paperSha =
          itemSha ||
          sha256(`paper-${courseId}-${examType}-${examYearEc}-${Date.now()}-${Math.random()}`);

        // Duplicate detection by SHA-256 with clear warning
        const existing = await prisma.examPaper.findFirst({
          where: { sha256: paperSha, deletedAt: null },
          include: { course: true },
        });

        if (existing && !force) {
          return sendError(
            res,
            409,
            `Duplicate detected: A paper with identical SHA-256 hash already exists: "${existing.title}" (${existing.course.code}). Set force=true if you intend to upload regardless.`,
            {
              isDuplicate: true,
              existingPaper: {
                id: existing.id,
                title: existing.title,
                courseCode: existing.course.code,
                examType: existing.examType,
                sha256: existing.sha256,
              },
            }
          );
        }

        const paperTitle = title || `${course.code} · ${examType} Exam ${examYearEc} E.C.`;
        const finalStorageKey =
          itemKey ||
          generateRandomStorageKey('published', 'pdf', course.code.replace(/\s+/g, ''));

        let hasBin = await storage.exists(finalStorageKey);
        if (!hasBin) {
          if (itemKey && (await storage.exists(itemKey))) {
            const data = await storage.download(itemKey);
            if (data) {
              await storage.upload(finalStorageKey, data, mimeType);
              hasBin = true;
            }
          } else if (item.fileBase64) {
            const buf = Buffer.from(item.fileBase64, 'base64');
            await storage.upload(finalStorageKey, buf, mimeType);
            hasBin = true;
          } else {
            return sendError(
              res,
              400,
              'Cannot create exam paper: binary PDF asset not found in storage. Upload a valid PDF file first via /api/upload.'
            );
          }
        }

        const paper = await prisma.examPaper.create({
          data: {
            courseId,
            title: paperTitle,
            examType: examType as ExamType,
            examYearEc: Number(examYearEc),
            quality: quality as ScanQuality,
            pageCount: Number(pageCountInput) || estimatePageCount(fileSizeBytes),
            storageKey: finalStorageKey,
            sha256: paperSha,
            mimeType,
            fileSizeBytes: Number(fileSizeBytes) || 2500000,
            isFreeSample: Boolean(isFreeSample),
            status: (status as PaperStatus) || PaperStatus.PUBLISHED,
            uploadedById: actor?.id || null,
            publishedAt: status === PaperStatus.PUBLISHED ? new Date() : null,
          },
          include: { course: true },
        });

        await prisma.auditLog.create({
          data: {
            action: 'Exam paper uploaded/created',
            entityType: 'ExamPaper',
            entityId: paper.id,
            actorId: actor?.id || null,
            riskLevel: AuditRiskLevel.LOW,
            details: {
              title: paper.title,
              courseCode: course.code,
              examType: paper.examType,
              status: paper.status,
              sha256: paper.sha256,
            },
          },
        });

        results.push(paper);
      }

      if (Array.isArray(body.bulk)) {
        return sendJson(res, 201, { count: results.length, papers: results });
      }
      return sendJson(res, 201, results[0]);
    }

    // -------------------------------------------------------------
    // PUT /api/papers/:id - Update Paper Metadata & Status
    // -------------------------------------------------------------
    if (
      pathname.startsWith('/api/papers/') &&
      !pathname.includes('/replace-file') &&
      !pathname.includes('/restore') &&
      !pathname.includes('/access') &&
      !pathname.includes('/stream') &&
      !pathname.includes('/pages') &&
      !pathname.includes('/report') &&
      method === 'PUT'
    ) {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to edit exam papers.');
      }

      const existing = await prisma.examPaper.findUnique({ where: { id: paperId } });
      if (!existing) {
        return sendError(res, 404, 'Exam paper not found.');
      }

      const updated = await prisma.examPaper.update({
        where: { id: paperId },
        data: {
          courseId: body.courseId !== undefined ? body.courseId : existing.courseId,
          title: body.title !== undefined ? body.title : existing.title,
          examType: body.examType !== undefined ? (body.examType as ExamType) : existing.examType,
          examYearEc: body.examYearEc !== undefined ? Number(body.examYearEc) : existing.examYearEc,
          quality: body.quality !== undefined ? (body.quality as ScanQuality) : existing.quality,
          status: body.status !== undefined ? (body.status as PaperStatus) : existing.status,
          isFreeSample: body.isFreeSample !== undefined ? Boolean(body.isFreeSample) : existing.isFreeSample,
          publishedAt:
            body.status === PaperStatus.PUBLISHED && !existing.publishedAt ? new Date() : existing.publishedAt,
        },
        include: { course: true },
      });

      await prisma.auditLog.create({
        data: {
          action: 'Exam paper metadata updated',
          entityType: 'ExamPaper',
          entityId: paperId,
          actorId: actor?.id || null,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            paperId,
            title: updated.title,
            status: updated.status,
            changes: body,
          },
        },
      });

      return sendJson(res, 200, updated);
    }

    // -------------------------------------------------------------
    // POST /api/papers/:id/replace-file - Replace Paper Asset & Check SHA-256
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.endsWith('/replace-file') && method === 'POST') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const actor = await resolveActor(req);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers are not authorized to replace paper files.');
      }

      const body = await parseBody(req);

      const existing = await prisma.examPaper.findUnique({
        where: { id: paperId },
        include: { course: true },
      });
      if (!existing) {
        return sendError(res, 404, 'Exam paper not found.');
      }

      let finalStorageKey = existing.storageKey;
      let finalSha256 = existing.sha256;
      let finalMime = existing.mimeType;
      let finalSize = existing.fileSizeBytes;

      if (body.fileBase64) {
        const buf = Buffer.from(body.fileBase64, 'base64');
        const sig = detectFileSignature(buf);
        if (!sig.valid || !sig.detectedMime) {
          return sendError(res, 400, sig.error || 'Invalid file format. Authentic PDF, JPG, or PNG required.');
        }
        finalSha256 = sha256(buf);
        finalMime = sig.detectedMime;
        finalSize = buf.byteLength;
        finalStorageKey = generateRandomStorageKey(
          'published',
          sig.detectedExt || 'pdf',
          existing.course.code.replace(/\s+/g, '')
        );
        await storage.upload(finalStorageKey, buf, finalMime);
      } else if (body.sha256 && body.storageKey) {
        finalSha256 = body.sha256;
        finalStorageKey = body.storageKey;
        if (body.mimeType) finalMime = body.mimeType;
        if (body.fileSizeBytes) finalSize = body.fileSizeBytes;
      } else {
        return sendError(res, 400, 'Either fileBase64 or (sha256 and storageKey) are required.');
      }

      // Check for duplicate with other papers
      const duplicate = await prisma.examPaper.findFirst({
        where: { sha256: finalSha256, id: { not: paperId }, deletedAt: null },
      });
      if (duplicate && !body.force) {
        return sendError(
          res,
          409,
          `SHA-256 conflict: Another paper ("${duplicate.title}") already has this exact content hash. Set force=true to proceed.`,
          {
            isDuplicate: true,
            duplicateId: duplicate.id,
          }
        );
      }

      const updated = await prisma.examPaper.update({
        where: { id: paperId },
        data: {
          storageKey: finalStorageKey,
          sha256: finalSha256,
          mimeType: finalMime,
          fileSizeBytes: finalSize,
        },
        include: { course: true },
      });

      await prisma.auditLog.create({
        data: {
          action: 'Exam paper file replaced',
          entityType: 'ExamPaper',
          entityId: paperId,
          actorId: actor?.id || null,
          riskLevel: AuditRiskLevel.MEDIUM,
          details: {
            paperId,
            title: updated.title,
            oldSha256: existing.sha256,
            newSha256: finalSha256,
            newSize: finalSize,
          },
        },
      });

      return sendJson(res, 200, updated);
    }

    // -------------------------------------------------------------
    // DELETE /api/papers/:id - Soft-Delete Paper
    // -------------------------------------------------------------
    if (
      pathname.startsWith('/api/papers/') &&
      !pathname.includes('/replace-file') &&
      !pathname.includes('/restore') &&
      method === 'DELETE'
    ) {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const actor = await resolveActor(req);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers are not authorized to delete exam papers.');
      }

      const existing = await prisma.examPaper.findUnique({ where: { id: paperId } });
      if (!existing) {
        return sendError(res, 404, 'Exam paper not found.');
      }

      const deleted = await prisma.examPaper.update({
        where: { id: paperId },
        data: { deletedAt: new Date() },
      });

      await prisma.auditLog.create({
        data: {
          action: 'Exam paper soft-deleted',
          entityType: 'ExamPaper',
          entityId: paperId,
          actorId: actor?.id || null,
          riskLevel: AuditRiskLevel.MEDIUM,
          details: {
            paperId,
            title: deleted.title,
          },
        },
      });

      return sendJson(res, 200, { success: true, message: 'Exam paper soft-deleted', paper: deleted });
    }

    // -------------------------------------------------------------
    // POST /api/papers/:id/restore - Restore Soft-Deleted Paper
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.endsWith('/restore') && method === 'POST') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const actor = await resolveActor(req);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers are not authorized to restore exam papers.');
      }

      const existing = await prisma.examPaper.findUnique({ where: { id: paperId } });
      if (!existing) {
        return sendError(res, 404, 'Exam paper not found.');
      }

      const restored = await prisma.examPaper.update({
        where: { id: paperId },
        data: { deletedAt: null },
      });

      await prisma.auditLog.create({
        data: {
          action: 'Exam paper restored',
          entityType: 'ExamPaper',
          entityId: paperId,
          actorId: actor?.id || null,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            paperId,
            title: restored.title,
          },
        },
      });

      return sendJson(res, 200, { success: true, message: 'Exam paper restored', paper: restored });
    }

    // -------------------------------------------------------------
    // WANTED PAPERS CRUD
    // -------------------------------------------------------------
    if (pathname === '/api/wanted-papers' && method === 'GET') {
      const list = await prisma.wantedPaper.findMany({
        include: { course: true },
        orderBy: { createdAt: 'desc' },
      });
      return sendJson(res, 200, list);
    }

    if (pathname === '/api/wanted-papers' && method === 'POST') {
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to manage wanted papers.');
      }

      const { courseId, examType = 'FINAL', offeredPriceEtb = 100, notes } = body;
      if (!courseId) {
        return sendError(res, 400, 'courseId is required.');
      }

      const wanted = await prisma.wantedPaper.create({
        data: {
          courseId,
          examType: examType as ExamType,
          offeredPriceEtb: Number(offeredPriceEtb) || 100,
          isOpen: true,
          notes: notes || null,
        },
        include: { course: true },
      });

      await prisma.auditLog.create({
        data: {
          action: 'Wanted paper created',
          entityType: 'WantedPaper',
          entityId: wanted.id,
          actorId: actor?.id || null,
          riskLevel: AuditRiskLevel.LOW,
          details: {
            wantedId: wanted.id,
            courseCode: wanted.course.code,
            examType: wanted.examType,
            offeredPriceEtb: wanted.offeredPriceEtb.toString(),
          },
        },
      });

      return sendJson(res, 201, wanted);
    }

    if (pathname.startsWith('/api/wanted-papers/') && method === 'PATCH') {
      const parts = pathname.split('/');
      const wantedId = parts[3];
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to manage wanted papers.');
      }

      const updated = await prisma.wantedPaper.update({
        where: { id: wantedId },
        data: {
          isOpen: body.isOpen !== undefined ? Boolean(body.isOpen) : undefined,
          offeredPriceEtb: body.offeredPriceEtb !== undefined ? Number(body.offeredPriceEtb) : undefined,
          notes: body.notes !== undefined ? body.notes : undefined,
        },
        include: { course: true },
      });

      return sendJson(res, 200, updated);
    }

    if (pathname.startsWith('/api/wanted-papers/') && method === 'DELETE') {
      const parts = pathname.split('/');
      const wantedId = parts[3];
      const actor = await resolveActor(req, undefined, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to manage wanted papers.');
      }

      await prisma.wantedPaper.delete({ where: { id: wantedId } });
      return sendJson(res, 200, { success: true, message: 'Wanted paper deleted' });
    }

    // -------------------------------------------------------------
    // USERS MANAGEMENT & ROLE SEPARATION
    // -------------------------------------------------------------
    if (pathname === '/api/users' && method === 'GET') {
      const actor = await resolveActor(req);
      if (!actor || actor.role !== Role.ADMIN) {
        if (actor?.role === Role.CONTENT_MANAGER) {
          return sendError(res, 403, 'Content managers are not authorized to view users or roles.');
        }
        return sendError(res, 403, 'Only administrators are authorized to view users or roles.');
      }

      const users = await prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          studentId: true,
          role: true,
          programId: true,
          currentYear: true,
          isActive: true,
          canSell: true,
          createdAt: true,
          program: { select: { id: true, code: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return sendJson(res, 200, users);
    }

    if (pathname.startsWith('/api/users/') && pathname.endsWith('/access-history') && method === 'GET') {
      const parts = pathname.split('/');
      const targetUserId = parts[3];
      const actor = await resolveActor(req);

      if (!actor) {
        return sendError(res, 401, 'Authentication required to view access history.');
      }
      if (actor.role !== Role.ADMIN && actor.id !== targetUserId) {
        return sendError(res, 403, 'Access denied: Permission denied to view user access history.');
      }

      const [user, entitlements, payments, views] = await Promise.all([
        prisma.user.findUnique({
          where: { id: targetUserId },
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            studentId: true,
            role: true,
            isActive: true,
            canSell: true,
            createdAt: true,
          },
        }),
        prisma.entitlement.findMany({
          where: { userId: targetUserId },
          include: {
            programTerm: {
              include: { program: true, term: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.payment.findMany({
          where: { userId: targetUserId },
          include: {
            programTerm: {
              include: { program: true, term: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.paperViewLog.findMany({
          where: { userId: targetUserId },
          include: {
            examPaper: {
              include: { course: true },
            },
          },
          orderBy: { viewedAt: 'desc' },
          take: 50,
        }),
      ]);

      if (!user) {
        return sendError(res, 404, 'User not found.');
      }

      return sendJson(res, 200, {
        user,
        entitlements,
        payments,
        views: views.map((v) => ({
          id: v.id,
          paperId: v.examPaperId,
          paperTitle: v.examPaper.title,
          courseCode: v.examPaper.course.code,
          courseTitle: v.examPaper.course.title,
          ipAddress: v.ipAddress,
          viewedAt: v.viewedAt,
        })),
      });
    }

    if (pathname.startsWith('/api/users/') && method === 'PATCH') {
      const parts = pathname.split('/');
      const targetUserId = parts[3];
      const actor = await resolveActor(req);

      if (!actor || actor.role !== Role.ADMIN) {
        return sendError(res, 403, 'Only administrators are authorized to modify users.');
      }

      const body = await parseBody(req);
      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        return sendError(res, 404, 'User not found.');
      }

      // Strictly enforce role changes: ONLY ADMIN can change user roles
      if (body.role !== undefined && body.role !== user.role) {
        if (!actor || actor.role !== Role.ADMIN) {
          return sendError(res, 403, 'Permission denied: Only administrators can modify user roles.');
        }
      }

      const updated = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          role: body.role !== undefined ? (body.role as Role) : undefined,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
          canSell: body.canSell !== undefined ? Boolean(body.canSell) : undefined,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          studentId: true,
          role: true,
          isActive: true,
          canSell: true,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: 'User profile/access status updated',
          entityType: 'User',
          entityId: targetUserId,
          actorId: actor?.id || null,
          riskLevel: body.role !== undefined ? AuditRiskLevel.HIGH : AuditRiskLevel.MEDIUM,
          details: {
            targetUserId,
            updatedFields: body,
          },
        },
      });

      return sendJson(res, 200, updated);
    }

    // -------------------------------------------------------------
    // GET /api/audit-logs - Read-Only Cryptographic Audit Log Viewer
    // -------------------------------------------------------------
    if (pathname === '/api/audit-logs' && method === 'GET') {
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor || actor.role !== Role.ADMIN) {
        return sendError(res, 403, 'Permission denied: Only administrators can view audit logs.');
      }
      const risk = url.searchParams.get('riskLevel') as AuditRiskLevel | null;
      const entityType = url.searchParams.get('entityType');
      const search = url.searchParams.get('search')?.toLowerCase();
      const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
      const offset = Number(url.searchParams.get('offset')) || 0;

      const whereClause: any = {};
      if (risk) whereClause.riskLevel = risk;
      if (entityType) whereClause.entityType = entityType;

      const [total, logs] = await Promise.all([
        prisma.auditLog.count({ where: whereClause }),
        prisma.auditLog.findMany({
          where: whereClause,
          include: { actor: { select: { id: true, fullName: true, role: true } } },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
      ]);

      const filteredLogs = search
        ? logs.filter(
            (l) =>
              l.action.toLowerCase().includes(search) ||
              (l.actor?.fullName && l.actor.fullName.toLowerCase().includes(search)) ||
              (l.entityType && l.entityType.toLowerCase().includes(search))
          )
        : logs;

      return sendJson(res, 200, { total, logs: filteredLogs });
    }

    return sendError(res, 404, `Endpoint ${pathname} not found`);
  } catch (error: any) {
    console.error(`[API ERROR] ${method} ${pathname}:`, error);
    return sendError(res, 500, error.message || 'Internal server error');
  }
}
