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
  } catch {
    return { allowed: true, remaining: 1, resetAt: expireAt };
  }
}

async function parseBody(req: IncomingMessage): Promise<any> {
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
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    ...(headers || {}),
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, status: number, message: string, details?: any, headers?: Record<string, string | string[]>) {
  sendJson(res, status, { error: message, details }, headers);
}

export async function resolveActor(
  req: IncomingMessage,
  body?: any,
  query?: URLSearchParams
): Promise<{ id: string; role: Role; user: any } | null> {
  // 1. Session token from Cookie or Bearer header
  const cookies = parseCookies(req);
  const authHeader = req.headers['authorization'];
  const rawToken =
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null) ||
    cookies['examvault_session'] ||
    (req.headers['x-session-token'] as string);

  if (rawToken) {
    const tokenHash = sha256(rawToken);
    const session = await prisma.session.findUnique({
      where: { sessionTokenHash: tokenHash },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date() && session.user && session.user.deletedAt === null) {
      return { id: session.user.id, role: session.user.role, user: session.user };
    }
  }

  // 2. Explicit actor ID from header or body (Only allowed in non-production environments for automated testing)
  if (process.env.NODE_ENV !== 'production') {
    const actorId =
      (req.headers['x-actor-id'] as string) ||
      body?.actorId ||
      body?.reviewerId ||
      query?.get('actorId');

    if (actorId) {
      const user = await prisma.user.findUnique({ where: { id: actorId } });
      if (user && user.deletedAt === null) {
        return { id: user.id, role: user.role, user };
      }
    }

    // 3. Explicit role fallback (Development & internal test harness only)
    const explicitRole =
      (req.headers['x-actor-role'] as string) ||
      body?.actorRole ||
      query?.get('actorRole');

    if (explicitRole && Object.values(Role).includes(explicitRole as Role)) {
      const roleUser = await prisma.user.findFirst({
        where: { role: explicitRole as Role, deletedAt: null },
      });
      if (roleUser) {
        return { id: roleUser.id, role: roleUser.role, user: roleUser };
      }
      return { id: `actor-${explicitRole}`, role: explicitRole as Role, user: null };
    }
  }

  return null;
}

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method?.toUpperCase();

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
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
      const rl = await checkRateLimit(`signup:${ip}`, 10, 3600);
      if (!rl.allowed) {
        return sendError(res, 429, 'Too many signup attempts. Please try again later.');
      }

      const body = await parseBody(req);
      const fullName = body.fullName?.trim();
      const email = body.email?.trim().toLowerCase() || null;
      const phone = body.phone?.trim() || null;
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
        const existingPhone = await prisma.user.findUnique({ where: { phone } });
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

      const cookieHeader = `examvault_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`;
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
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
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

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: identifier.toLowerCase() },
            { studentId: identifier },
            { phone: identifier },
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

      const cookieHeader = `examvault_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`;
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
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor || !actor.user) {
        return sendJson(res, 200, { authenticated: false, user: null, unlockedProgramTermIds: [] });
      }

      const user = await prisma.user.findUnique({
        where: { id: actor.id },
        include: {
          program: true,
          entitlements: {
            where: { isActive: true },
            select: { programTermId: true },
          },
        },
      });

      if (!user || !user.isActive || user.deletedAt !== null) {
        return sendJson(res, 200, { authenticated: false, user: null, unlockedProgramTermIds: [] });
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

      const clearCookie = `examvault_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return sendJson(res, 200, { success: true, message: 'Logged out successfully' }, { 'Set-Cookie': clearCookie });
    }

    // -------------------------------------------------------------
    // POST /api/auth/change-password - Change Password & Clear Forced Flag
    // -------------------------------------------------------------
    if (pathname === '/api/auth/change-password' && method === 'POST') {
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);
      const targetUserId = actor?.id || body.userId;
      const newPassword = body.newPassword;

      if (!targetUserId) {
        return sendError(res, 401, 'Authentication required to change password.');
      }

      if (!newPassword || newPassword.length < 8) {
        return sendError(res, 400, 'New password must be at least 8 characters long.');
      }

      const user = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        return sendError(res, 404, 'User not found.');
      }

      if (body.oldPassword) {
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

      await prisma.auditLog.create({
        data: {
          action: 'User password changed',
          entityType: 'User',
          entityId: targetUserId,
          actorId: targetUserId,
          riskLevel: AuditRiskLevel.MEDIUM,
          details: {
            userId: targetUserId,
            forcedChangeCompleted: user.mustChangePassword,
          },
        },
      });

      return sendJson(res, 200, { success: true, message: 'Password updated successfully.' });
    }

    // -------------------------------------------------------------
    // GET /api/bootstrap - Complete verified state from PostgreSQL
    // -------------------------------------------------------------
    if (pathname === '/api/bootstrap' && method === 'GET') {
      const [
        settings,
        campus,
        programs,
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
        prisma.examPaper.findMany({
          where: { deletedAt: null },
          include: {
            course: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.payment.findMany({
          include: {
            user: true,
            programTerm: {
              include: {
                program: true,
                term: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.paperContribution.findMany({
          include: {
            student: true,
            course: true,
            files: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.paperRequest.findMany({
          include: {
            student: true,
            course: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.auditLog.findMany({
          include: { actor: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        prisma.notification.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
        prisma.entitlement.findMany({
          where: { isActive: true },
          include: {
            programTerm: {
              include: {
                courses: true,
              },
            },
          },
        }),
        prisma.termInterest.findMany({
          include: {
            term: true,
            user: true,
          },
        }),
        prisma.user.findMany({
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
        }),
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

      return sendJson(res, 200, {
        revenueEtb: Number(revenueAgg._sum.amountEtb || 0),
        activeStudentsCount,
        pendingPaymentsCount,
        publishedPapersCount,
        topCourses,
        coverageMatrix,
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
      const actor = await resolveActor(req, rawBody, url.searchParams);
      const userId = actor?.id || rawBody.userId;

      if (!userId) {
        return sendError(res, 400, 'User ID is required. Please ensure you are logged in.');
      }

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

      const randomScreenshotKey = screenshotUrl && screenshotUrl.startsWith('quarantine/')
        ? screenshotUrl
        : generateRandomStorageKey('quarantine', 'jpg', 'receipts');
      const screenshotSha256 =
        rawBody.screenshotSha256 ||
        (rawBody.screenshotBase64
          ? sha256(rawBody.screenshotBase64)
          : screenshotUrl
          ? sha256(screenshotUrl)
          : sha256(`screenshot-${transactionId}`));

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

        return sendJson(res, 200, resubmittedPayment);
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

      return sendJson(res, 201, payment);
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
      const reviewerId = body.reviewerId;
      const actor = await resolveActor(req, body, url.searchParams);

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

      return sendJson(res, 200, result);
    }

    // -------------------------------------------------------------
    // POST /api/payments/:id/reject - Verifier/Admin rejection with mandatory reason
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/payments/') && pathname.endsWith('/reject') && method === 'POST') {
      const parts = pathname.split('/');
      const paymentId = parts[3];
      const body = await parseBody(req);
      const reason = body.reason?.trim();
      const reviewerId = body.reviewerId;
      const actor = await resolveActor(req, body, url.searchParams);

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
      const reviewerId = body.reviewerId;
      const actor = await resolveActor(req, body, url.searchParams);

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

      const actor = await resolveActor(req, rawBody, url.searchParams);
      const studentId = actor?.id || rawBody.studentId;
      if (!studentId) {
        return sendError(res, 401, 'Student authentication required to submit exam papers');
      }

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
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !course.isActive || course.deletedAt !== null) {
        return sendError(res, 400, 'Invalid course selected. Only the 11 approved freshman courses are accepted.');
      }

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

      const randomQuarantineKey = rawBody.storageKey && rawBody.storageKey.startsWith('quarantine/')
        ? rawBody.storageKey
        : generateRandomStorageKey('quarantine', 'pdf');

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
            courseId,
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
      if (quarantineData) {
        await storage.upload(publishedKey, quarantineData, file.mimeType);
      } else {
        const placeholderPdf = Buffer.from(
          `%PDF-1.4\n%ExamVault Published Paper: ${contrib.course.code}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF`
        );
        await storage.upload(publishedKey, placeholderPdf, file.mimeType);
      }

      const result = await prisma.$transaction(async (tx) => {
        // Create published ExamPaper with unique link to contribution
        const examPaper = await tx.examPaper.create({
          data: {
            courseId: contrib.courseId,
            title: `${contrib.course.code} · ${contrib.examType} Exam ${contrib.academicYearEc} E.C.`,
            examType: contrib.examType,
            examYearEc: contrib.academicYearEc,
            quality: ScanQuality.EXCELLENT,
            pageCount: 6,
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
      const reviewerId = body.reviewerId;
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

      const file = contrib.files[0] || {
        storageKey: `papers/${contrib.course.code.replace(' ', '')}_Exam.pdf`,
        sha256: sha256(`paper-${contrib.id}`),
        mimeType: 'application/pdf',
        sizeBytes: 2500000,
      };

      const result = await prisma.$transaction(async (tx) => {
        // Create Published ExamPaper
        const examPaper = await tx.examPaper.create({
          data: {
            courseId: contrib.courseId,
            title: `${contrib.course.code} · ${contrib.examType} Exam ${contrib.academicYearEc} E.C.`,
            examType: contrib.examType,
            examYearEc: contrib.academicYearEc,
            quality: ScanQuality.EXCELLENT,
            pageCount: 6,
            storageKey: file.storageKey.replace('quarantine/', 'published/'),
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
      const userId = body.userId;
      const termId = body.termId;

      if (!userId || !termId) {
        return sendError(res, 400, 'userId and termId required');
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
      });

      return sendJson(res, 201, rec);
    }

    // -------------------------------------------------------------
    // POST /api/upload - Secure File Upload with Magic Bytes Verification
    // -------------------------------------------------------------
    if (pathname === '/api/upload' && method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
      const rl = await checkRateLimit(`upload:${ip}`, 30, 600);
      if (!rl.allowed) {
        return sendError(res, 429, 'Upload rate limit exceeded. Please wait a few minutes before trying again.');
      }

      const body = await parseBody(req);
      const { fileBase64, reportedMime, category, userId } = body;

      if (!fileBase64) {
        return sendError(res, 400, 'File content (fileBase64) is required.');
      }

      const buf = Buffer.from(fileBase64, 'base64');
      const signature = detectFileSignature(buf);
      if (!signature.valid || !signature.detectedMime) {
        return sendError(res, 400, signature.error || 'Invalid file format. Only authentic PDF, JPG, and PNG files are accepted.');
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
      const userId = url.searchParams.get('userId');
      if (!userId) return sendError(res, 400, 'userId required');

      const sessions = await prisma.session.findMany({
        where: { userId, expiresAt: { gt: new Date() } },
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
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '197.156.102.10';
      const userAgent = req.headers['user-agent'] || 'Mozilla/5.0';

      await prisma.paperViewLog.create({
        data: {
          examPaperId: paperId,
          userId,
          ipAddress: ip,
          userAgent,
        },
      });

      // Ensure paper binary exists in storage
      const existsInStorage = await storage.exists(paper!.storageKey);
      if (!existsInStorage) {
        const samplePdf = Buffer.from(
          `%PDF-1.4\n%ExamVault Secure Asset: ${paper!.title}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF`,
          'utf-8'
        );
        await storage.upload(paper!.storageKey, samplePdf, paper!.mimeType);
      }

      // Issue signed URL expiring strictly in 60 seconds or less
      const secret = process.env.SESSION_SECRET || 'examvault-secure-local-storage-secret';
      const expiresInSeconds = 60;
      const expiresAtMs = Date.now() + expiresInSeconds * 1000;
      const streamToken = signStreamTicket(paper!.storageKey, expiresAtMs, secret);
      const streamUrl = `/api/papers/${paper!.id}/stream?token=${streamToken}&expires=${expiresAtMs}`;

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
        return sendError(res, 403, 'Signed URL has expired (limit 60 seconds). Please refresh the viewer.');
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

      const secret = process.env.SESSION_SECRET || 'examvault-secure-local-storage-secret';
      const isValidSig = verifyStreamTicket(paper.storageKey, expiresNum, token, secret);
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
    // GET /api/storage/view - Direct Private Storage View via Signed URL
    // -------------------------------------------------------------
    if (pathname === '/api/storage/view' && method === 'GET') {
      const key = url.searchParams.get('key');
      const expires = url.searchParams.get('expires');
      const sig = url.searchParams.get('sig');

      if (!key || !expires || !sig) {
        return sendError(res, 403, 'Direct storage key access is strictly forbidden without a signed URL.');
      }

      if (!key.startsWith('quarantine/') && !key.startsWith('published/')) {
        return sendError(res, 403, 'Access denied. Storage prefix must be "quarantine/" or "published/".');
      }

      const expiresNum = Number(expires);
      if (isNaN(expiresNum) || Date.now() > expiresNum) {
        return sendError(res, 403, 'Signed URL has expired. Access denied.');
      }

      const secret = process.env.SESSION_SECRET || 'examvault-secure-local-storage-secret';
      const isValidSig = verifyStreamTicket(key, expiresNum, sig, secret);
      if (!isValidSig) {
        return sendError(res, 403, 'Invalid signature for requested storage key. Access denied.');
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
    // GET /api/papers/:id/pages/:pageNum - Compressed Page Image for Slow Connections
    // -------------------------------------------------------------
    if (pathname.startsWith('/api/papers/') && pathname.includes('/pages/') && method === 'GET') {
      const parts = pathname.split('/');
      const paperId = parts[3];
      const pageNum = parseInt(parts[5], 10) || 1;

      const paper = await prisma.examPaper.findUnique({
        where: { id: paperId },
        include: { course: true },
      });

      if (!paper || paper.deletedAt !== null) {
        return sendError(res, 404, 'Exam paper not found.');
      }

      const pageKey = `published/${paper.id}/pages/page_${pageNum}.svg`;
      let pageData = await storage.download(pageKey);

      if (!pageData) {
        const buf = generateCompressedPageBuffer(
          paper.course.code,
          paper.course.title,
          paper.title,
          pageNum,
          paper.pageCount || 6,
          paper.examYearEc || 2015
        );
        await storage.upload(pageKey, buf, 'image/svg+xml');
        pageData = buf;
      }

      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
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
      const body = await parseBody(req);
      const { userId, category, description } = body;

      if (!userId || !category) {
        return sendError(res, 400, 'userId and problem category are required');
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
      const courseId = url.searchParams.get('courseId');
      const examType = url.searchParams.get('examType') as ExamType | null;
      const status = url.searchParams.get('status') as PaperStatus | null;
      const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
      const search = url.searchParams.get('search')?.toLowerCase();

      const whereClause: any = {};
      if (!includeDeleted) whereClause.deletedAt = null;
      if (courseId) whereClause.courseId = courseId;
      if (examType) whereClause.examType = examType;
      if (status) whereClause.status = status;

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
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to create or upload exam papers.');
      }

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
          pageCount = 6,
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

        const hasBin = await storage.exists(finalStorageKey);
        if (!hasBin) {
          const samplePdf = Buffer.from(
            `%PDF-1.4\n%ExamVault Asset: ${paperTitle}\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF`
          );
          await storage.upload(finalStorageKey, samplePdf, mimeType);
        }

        const paper = await prisma.examPaper.create({
          data: {
            courseId,
            title: paperTitle,
            examType: examType as ExamType,
            examYearEc: Number(examYearEc),
            quality: quality as ScanQuality,
            pageCount: Number(pageCount) || 6,
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
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to replace paper files.');
      }

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
      const actor = await resolveActor(req, undefined, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to delete exam papers.');
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
      const actor = await resolveActor(req, undefined, url.searchParams);

      if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.CONTENT_MANAGER)) {
        return sendError(res, 403, 'Payment verifiers and unauthorized users are not authorized to restore exam papers.');
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
      const actor = await resolveActor(req, undefined, url.searchParams);
      if (!actor || actor.role === Role.CONTENT_MANAGER || actor.role === Role.STUDENT) {
        return sendError(res, 403, 'Content managers and students are not authorized to view users or roles.');
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
      const actor = await resolveActor(req, undefined, url.searchParams);

      if (!actor || actor.role === Role.CONTENT_MANAGER || (actor.role === Role.STUDENT && actor.id !== targetUserId)) {
        return sendError(res, 403, 'Content managers and unauthorized users are not authorized to view user access history.');
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
      const body = await parseBody(req);
      const actor = await resolveActor(req, body, url.searchParams);

      if (!actor || actor.role === Role.CONTENT_MANAGER || actor.role === Role.STUDENT) {
        return sendError(res, 403, 'Content managers and students are not authorized to modify users.');
      }

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
