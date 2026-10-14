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
  users: any[];
}

export const api = {
  async getBootstrap(): Promise<BootstrapData> {
    const res = await fetch('/api/bootstrap');
    if (!res.ok) {
      throw new Error(`Failed to bootstrap data: ${res.statusText}`);
    }
    return res.json();
  },

  async getAdminOverview(actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = {};
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch('/api/admin/overview', { headers });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to fetch admin overview');
    }
    return json;
  },

  async submitPayment(data: {
    userId: string;
    programTermId?: string;
    stream?: StreamCode;
    method: PaymentMethod;
    txId: string;
    screenshotUrl?: string;
    screenshotSha256?: string;
  }) {
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: data.userId,
        programTermId: data.programTermId,
        stream: data.stream,
        paymentMethod: data.method,
        transactionId: data.txId,
        screenshotUrl: data.screenshotUrl,
        screenshotSha256: data.screenshotSha256,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to submit payment');
    }
    return json;
  },

  async approvePayment(paymentId: string, reviewerId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reviewerId) headers['x-actor-id'] = reviewerId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/payments/${paymentId}/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reviewerId, actorRole }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to approve payment');
    }
    return json;
  },

  async rejectPayment(paymentId: string, reason: string, reviewerId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reviewerId) headers['x-actor-id'] = reviewerId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/payments/${paymentId}/reject`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason, reviewerId, actorRole }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to reject payment');
    }
    return json;
  },

  async revokePayment(paymentId: string, reason: string, reviewerId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reviewerId) headers['x-actor-id'] = reviewerId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/payments/${paymentId}/revoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason, reviewerId, actorRole }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to revoke access');
    }
    return json;
  },

  async submitContribution(data: {
    studentId: string;
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
  }) {
    const res = await fetch('/api/contributions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to submit contribution');
    }
    return json;
  },

  async approveContribution(data: {
    contributionId: string;
    approvedPayoutEtb: number;
    payoutTxId: string;
    reviewerId?: string;
  }) {
    const res = await fetch(`/api/contributions/${data.contributionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to approve contribution');
    }
    return json;
  },

  async checkPaperDuplicate(sha256: string) {
    const res = await fetch(`/api/papers/check-duplicate?sha256=${encodeURIComponent(sha256)}`);
    return res.json();
  },

  async getPapers(params?: { courseId?: string; examType?: string; status?: string; includeDeleted?: boolean; search?: string }) {
    const query = new URLSearchParams();
    if (params?.courseId) query.set('courseId', params.courseId);
    if (params?.examType) query.set('examType', params.examType);
    if (params?.status) query.set('status', params.status);
    if (params?.includeDeleted) query.set('includeDeleted', 'true');
    if (params?.search) query.set('search', params.search);

    const res = await fetch(`/api/papers?${query.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch papers');
    return json;
  },

  async createPaper(data: any, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch('/api/papers', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      const err: any = new Error(json.error || 'Failed to create paper');
      err.details = json.details;
      throw err;
    }
    return json;
  },

  async updatePaper(paperId: string, data: any, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/papers/${paperId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update paper');
    return json;
  },

  async replacePaperFile(paperId: string, data: any, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/papers/${paperId}/replace-file`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      const err: any = new Error(json.error || 'Failed to replace file');
      err.details = json.details;
      throw err;
    }
    return json;
  },

  async deletePaper(paperId: string, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = {};
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/papers/${paperId}`, {
      method: 'DELETE',
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete paper');
    return json;
  },

  async restorePaper(paperId: string, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = {};
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/papers/${paperId}/restore`, {
      method: 'POST',
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to restore paper');
    return json;
  },

  async getWantedPapers() {
    const res = await fetch('/api/wanted-papers');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch wanted papers');
    return json;
  },

  async createWantedPaper(data: any, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch('/api/wanted-papers', {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to create wanted paper');
    return json;
  },

  async updateWantedPaper(wantedId: string, data: any, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/wanted-papers/${wantedId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update wanted paper');
    return json;
  },

  async deleteWantedPaper(wantedId: string, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = {};
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/wanted-papers/${wantedId}`, {
      method: 'DELETE',
      headers,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to delete wanted paper');
    return json;
  },

  async getUsers(actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = {};
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch('/api/users', { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch users');
    return json;
  },

  async getUserAccessHistory(userId: string, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = {};
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/users/${userId}/access-history`, { headers });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch user access history');
    return json;
  },

  async updateUser(userId: string, data: any, actorId?: string, actorRole?: string) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (actorId) headers['x-actor-id'] = actorId;
    if (actorRole) headers['x-actor-role'] = actorRole;

    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to update user');
    return json;
  },

  async getAuditLogs(params?: { riskLevel?: string; entityType?: string; search?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.riskLevel) query.set('riskLevel', params.riskLevel);
    if (params?.entityType) query.set('entityType', params.entityType);
    if (params?.search) query.set('search', params.search);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const res = await fetch(`/api/audit-logs?${query.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Failed to fetch audit logs');
    return json;
  },

  async saveSettings(settings: Record<string, string>, actorId?: string) {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, actorId }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to update settings');
    }
    return json;
  },

  async registerTermInterest(userId: string, termId: string) {
    const res = await fetch('/api/term-interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, termId }),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to register interest');
    }
    return json;
  },

  async checkPaperAccess(paperId: string, userId: string) {
    const res = await fetch(`/api/papers/${paperId}/access?userId=${encodeURIComponent(userId)}`);
    return res.json();
  },

  async reportPaperProblem(paperId: string, data: { userId: string; category: string; description?: string }) {
    const res = await fetch(`/api/papers/${paperId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Failed to submit problem report');
    }
    return json;
  },
};
