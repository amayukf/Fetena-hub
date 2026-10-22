import type {
  PaymentMethod,
  StreamCode,
  Role,
} from '../types';
import type {
  FreshmanCourseItem,
  StorePayment,
  StoreContribution,
  StorePaperRequest,
  StoreExamPaper,
  StoreAuditLog,
  StoreNotification,
  SystemSettingsState,
} from './store';

export interface BootstrapData {
  settings: Array<{ key: string; value: string }>;
  campus: any;
  programs: any[];
  courses: any[];
  papers: any[];
  payments: any[];
  contributions: any[];
  requests: any[];
  wantedPapers?: any[];
  auditLogs: any[];
  notifications: any[];
  entitlements: any[];
  termInterests: any[];
  terms?: any[];
  users: any[];
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** The server rejected the request because there is no valid session. */
export class AuthExpiredError extends Error {
  constructor(message = 'Your session has expired. Please sign in again.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/** The request never completed: offline, DNS failure, timeout, or a dead server. */
export class NetworkError extends Error {
  constructor(message = 'Could not reach the server. Check your connection and try again.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Single place to react to an expired session. Without this, every screen just
 * showed a raw error string and the user was never sent back to sign in.
 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

// ---------------------------------------------------------------------------
// Request core
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 120_000;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Do not invoke the global unauthorized handler (used for session probing). */
  silentAuth?: boolean;
  /** Resolve with whatever body was returned instead of throwing on !ok. */
  lenient?: boolean;
  /** Max retries for idempotent requests on transient failure (defaults to 2 for GET, 0 for mutating operations). */
  retries?: number;
}

let currentSessionToken: string | null = null;
try {
  const storage = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
  currentSessionToken = storage ? storage.getItem('ev_session_token') : null;
} catch {}

export function setSessionToken(token: string | null): void {
  currentSessionToken = token;
  try {
    const storage = typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null;
    if (storage) {
      if (token) storage.setItem('ev_session_token', token);
      else storage.removeItem('ev_session_token');
    }
  } catch {}
}

export function getSessionToken(): string | null {
  return currentSessionToken;
}

function buildHeaders(actorId?: string, actorRole?: string, asJson = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (asJson) headers['Content-Type'] = 'application/json';
  if (actorId) headers['x-actor-id'] = actorId;
  if (actorRole) headers['x-actor-role'] = actorRole;
  if (currentSessionToken) {
    headers['Authorization'] = `Bearer ${currentSessionToken}`;
    headers['x-session-token'] = currentSessionToken;
  }
  return headers;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    silentAuth = false,
    lenient = false,
    retries = method === 'GET' ? 2 : 0,
  } = options;

  let lastError: any = null;
  const maxAttempts = Math.max(1, retries + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // A hung request must not block the UI forever — this app targets 2G/3G.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        credentials: 'same-origin',
      });
    } catch (err: any) {
      clearTimeout(timer);
      const isAbort = err?.name === 'AbortError';
      lastError = isAbort
        ? new NetworkError('The request took too long and was cancelled. Please try again.')
        : new NetworkError();

      if (attempt < maxAttempts) {
        // Linear backoff: 250ms, 500ms
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    // On transient gateway/proxy errors (502, 503, 504), retry idempotent GET requests
    if (
      method === 'GET' &&
      (res.status === 502 || res.status === 503 || res.status === 504) &&
      attempt < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      continue;
    }

    // Parse defensively. An empty body, an HTML error page, or a 204 previously
    // surfaced as "Unexpected end of JSON input" instead of a readable message.
    const text = await res.text().catch(() => '');
    let json: any = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (res.status === 401) {
      if (!silentAuth) unauthorizedHandler?.();
      if (lenient) return (json ?? { error: 'Authentication required' }) as T;
      throw new AuthExpiredError(json?.error);
    }

    if (!res.ok) {
      if (lenient) return (json ?? {}) as T;
      const error: any = new Error(
        json?.error || `Request failed (HTTP ${res.status} ${res.statusText || ''})`.trim()
      );
      error.status = res.status;
      error.details = json?.details;
      throw error;
    }

    if (json === null) {
      if (lenient) return {} as T;
      throw new NetworkError('The server returned an unexpected, non-JSON response.');
    }

    return json as T;
  }

  throw lastError || new NetworkError();
}

export const api = {
  async getBootstrap(): Promise<BootstrapData> {
    return request<BootstrapData>('/api/bootstrap', { silentAuth: true });
  },

  async getAdminOverview(actorId?: string, actorRole?: string) {
    return request<any>('/api/admin/overview', {
      headers: buildHeaders(actorId, actorRole),
    });
  },

  async uploadFile(fileBase64: string, reportedMime: string, category: 'paper' | 'screenshot' | 'contribution' = 'paper') {
    return request<{ storageKey: string; sha256: string; mimeType: string; sizeBytes: number }>(
      '/api/upload',
      {
        method: 'POST',
        headers: buildHeaders(undefined, undefined, true),
        body: { fileBase64, reportedMime, category },
        timeoutMs: UPLOAD_TIMEOUT_MS,
      }
    );
  },

  async submitPayment(data: {
    userId?: string;
    programTermId?: string;
    stream?: StreamCode;
    method: PaymentMethod;
    txId: string;
    screenshotUrl?: string;
    screenshotSha256?: string;
    storageKey?: string;
    receiptImageStorageKey?: string;
    receiptImageSha256?: string;
  }) {
    const receiptKey = data.storageKey || data.receiptImageStorageKey || data.screenshotUrl;
    return request<any>('/api/payments', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: {
        programTermId: data.programTermId,
        stream: data.stream,
        paymentMethod: data.method,
        transactionId: data.txId,
        storageKey: receiptKey,
        screenshotUrl: receiptKey,
        screenshotSha256: data.screenshotSha256 || data.receiptImageSha256,
      },
    });
  },

  async approvePayment(paymentId: string, reviewerId?: string, actorRole?: string) {
    return request<any>(`/api/payments/${paymentId}/approve`, {
      method: 'POST',
      headers: buildHeaders(reviewerId, actorRole, true),
      body: { reviewerId, actorRole },
    });
  },

  async rejectPayment(paymentId: string, reason: string, reviewerId?: string, actorRole?: string) {
    return request<any>(`/api/payments/${paymentId}/reject`, {
      method: 'POST',
      headers: buildHeaders(reviewerId, actorRole, true),
      body: { reason, reviewerId, actorRole },
    });
  },

  async revokePayment(paymentId: string, reason: string, reviewerId?: string, actorRole?: string) {
    return request<any>(`/api/payments/${paymentId}/revoke`, {
      method: 'POST',
      headers: buildHeaders(reviewerId, actorRole, true),
      body: { reason, reviewerId, actorRole },
    });
  },

  async submitContribution(data: {
    studentId?: string;
    courseId: string;
    examType: any;
    academicYear: number;
    examDate: string;
    declarationAccepted: boolean;
    payoutPaymentMethod: PaymentMethod;
    payoutAccount: string;
    proposedPayoutEtb?: number;
    studentNotes?: string;
    fileName?: string;
    fileSizeBytes?: number;
    storageKey?: string;
    sha256?: string;
    fileBase64?: string;
  }) {
    return request<any>('/api/contributions', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },

  async approveContribution(data: {
    contributionId: string;
    approvedPayoutEtb: number;
    reviewerId?: string;
  }) {
    return request<any>(`/api/contributions/${data.contributionId}/approve`, {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
    });
  },

  async checkPaperDuplicate(sha256: string) {
    return request<any>(`/api/papers/check-duplicate?sha256=${encodeURIComponent(sha256)}`, {
      silentAuth: true,
      lenient: true,
    });
  },

  async getPapers(params?: { courseId?: string; examType?: string; status?: string; includeDeleted?: boolean; search?: string }) {
    const query = new URLSearchParams();
    if (params?.courseId) query.set('courseId', params.courseId);
    if (params?.examType) query.set('examType', params.examType);
    if (params?.status) query.set('status', params.status);
    if (params?.includeDeleted) query.set('includeDeleted', 'true');
    if (params?.search) query.set('search', params.search);

    return request<any>(`/api/papers?${query.toString()}`);
  },

  async createPaper(data: any, actorId?: string, actorRole?: string) {
    return request<any>('/api/papers', {
      method: 'POST',
      headers: buildHeaders(actorId, actorRole, true),
      body: data,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },

  async updatePaper(paperId: string, data: any, actorId?: string, actorRole?: string) {
    return request<any>(`/api/papers/${paperId}`, {
      method: 'PUT',
      headers: buildHeaders(actorId, actorRole, true),
      body: data,
    });
  },

  async replacePaperFile(paperId: string, data: any, actorId?: string, actorRole?: string) {
    return request<any>(`/api/papers/${paperId}/replace-file`, {
      method: 'POST',
      headers: buildHeaders(actorId, actorRole, true),
      body: data,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },

  async deletePaper(paperId: string, actorId?: string, actorRole?: string) {
    return request<any>(`/api/papers/${paperId}`, {
      method: 'DELETE',
      headers: buildHeaders(actorId, actorRole),
    });
  },

  async restorePaper(paperId: string, actorId?: string, actorRole?: string) {
    return request<any>(`/api/papers/${paperId}/restore`, {
      method: 'POST',
      headers: buildHeaders(actorId, actorRole),
    });
  },

  async getPaperSolution(paperId: string) {
    return request<any>(`/api/papers/${encodeURIComponent(paperId)}/solution`);
  },

  async updatePaperSolution(paperId: string, solutionData: any, actorId?: string, actorRole?: string) {
    return request<any>(`/api/papers/${encodeURIComponent(paperId)}/solution`, {
      method: 'PUT',
      headers: buildHeaders(actorId, actorRole, true),
      body: solutionData,
    });
  },

  async getWantedPapers() {
    return request<any>('/api/wanted-papers');
  },

  async createWantedPaper(data: any, actorId?: string, actorRole?: string) {
    return request<any>('/api/wanted-papers', {
      method: 'POST',
      headers: buildHeaders(actorId, actorRole, true),
      body: data,
    });
  },

  async updateWantedPaper(wantedId: string, data: any, actorId?: string, actorRole?: string) {
    return request<any>(`/api/wanted-papers/${wantedId}`, {
      method: 'PATCH',
      headers: buildHeaders(actorId, actorRole, true),
      body: data,
    });
  },

  async deleteWantedPaper(wantedId: string, actorId?: string, actorRole?: string) {
    return request<any>(`/api/wanted-papers/${wantedId}`, {
      method: 'DELETE',
      headers: buildHeaders(actorId, actorRole),
    });
  },

  async getUsers(actorId?: string, actorRole?: string) {
    return request<any>('/api/users', { headers: buildHeaders(actorId, actorRole) });
  },

  async getUserAccessHistory(userId: string, actorId?: string, actorRole?: string) {
    return request<any>(`/api/users/${userId}/access-history`, {
      headers: buildHeaders(actorId, actorRole),
    });
  },

  async updateUser(userId: string, data: any, actorId?: string, actorRole?: string) {
    return request<any>(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: buildHeaders(actorId, actorRole, true),
      body: data,
    });
  },

  async getAuditLogs(params?: { riskLevel?: string; entityType?: string; search?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.riskLevel) query.set('riskLevel', params.riskLevel);
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    return request<any>(`/api/audit-logs?${query.toString()}`);
  },

  async saveSettings(settings: Record<string, string>, actorId?: string) {
    return request<any>('/api/settings', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: { settings, actorId },
    });
  },

  async registerTermInterest(userId: string, termId: string, channel?: string, contactValue?: string) {
    return request<any>('/api/term-interest', {
      method: 'POST',
      headers: buildHeaders(userId && userId !== 'anon' ? userId : undefined, undefined, true),
      body: { userId, termId, channel, contactValue },
    });
  },

  async submitPaperRequest(
    data: { courseId: string; examType: string; examYear?: number; notes?: string },
    actorId?: string
  ) {
    return request<any>('/api/requests', {
      method: 'POST',
      headers: buildHeaders(actorId, undefined, true),
      body: data,
    });
  },

  async getPaperRequests(actorId?: string) {
    return request<any>('/api/requests', { headers: buildHeaders(actorId) });
  },

  async checkPaperAccess(paperId: string, userId: string) {
    // Callers treat the payload as an access decision, so never let a failed
    // request masquerade as one — resolve with the error body and let the
    // caller inspect it.
    return request<any>(`/api/papers/${paperId}/access?userId=${encodeURIComponent(userId)}`, {
      headers: buildHeaders(userId),
      silentAuth: true,
      lenient: true,
    });
  },

  async reportPaperProblem(paperId: string, data: { userId: string; category: string; description?: string }) {
    return request<any>(`/api/papers/${paperId}/report`, {
      method: 'POST',
      headers: buildHeaders(data.userId, undefined, true),
      body: data,
    });
  },

  async signup(data: {
    fullName: string;
    email?: string;
    phone?: string;
    studentId?: string;
    stream?: StreamCode;
    password: string;
  }) {
    const res = await request<any>('/api/auth/signup', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
    });
    if (res?.token) {
      setSessionToken(res.token);
    }
    return res;
  },

  async login(data: { identifier: string; password: string }) {
    const res = await request<any>('/api/auth/login', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
    });
    if (res?.token) {
      setSessionToken(res.token);
    }
    return res;
  },

  async googleAuth(data: { credential?: string; stream?: StreamCode; devProfile?: any }) {
    const res = await request<any>('/api/auth/google', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
    });
    if (res?.token) {
      setSessionToken(res.token);
    }
    return res;
  },

  async getGoogleConfig() {
    return request<{ clientId: string | null; enabled: boolean }>('/api/auth/google/config', {
      headers: buildHeaders(),
      silentAuth: true,
      lenient: true,
    });
  },

  async getMe() {
    try {
      return await request<any>('/api/auth/me', { headers: buildHeaders(), silentAuth: true });
    } catch (err) {
      // Only a genuine 401 means "no session". A 5xx or a network outage is an
      // error the caller must see, not a silent logout.
      if (err instanceof AuthExpiredError) {
        return { authenticated: false, user: null, unlockedProgramTermIds: [] };
      }
      throw err;
    }
  },

  async logout() {
    setSessionToken(null);
    return request<any>('/api/auth/logout', { method: 'POST', headers: buildHeaders(), silentAuth: true, lenient: true });
  },

  async changePassword(data: { oldPassword?: string; newPassword: string; userId?: string }) {
    return request<any>('/api/auth/change-password', {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
    });
  },

  async getMyContributions() {
    return request<any>('/api/contributions/my');
  },

  async reviewContribution(contributionId: string, data: { action: string; approvedPayoutEtb?: number; counterOfferEtb?: number; reason?: string }) {
    return request<any>(`/api/contributions/${contributionId}/review`, {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: data,
    });
  },

  async publishContribution(contributionId: string) {
    return request<any>(`/api/contributions/${contributionId}/publish`, { method: 'POST' });
  },

  async payoutContribution(contributionId: string, payoutTxId: string) {
    return request<any>(`/api/contributions/${contributionId}/payout`, {
      method: 'POST',
      headers: buildHeaders(undefined, undefined, true),
      body: { payoutTxId },
    });
  },

  async runHousekeeping(actorId?: string, actorRole?: string) {
    return request<{ success: boolean; expiredSessions: number; expiredRateLimits: number; expiredResetTokens: number }>(
      '/api/admin/housekeeping',
      {
        method: 'POST',
        headers: buildHeaders(actorId, actorRole, true),
      }
    );
  },
};

