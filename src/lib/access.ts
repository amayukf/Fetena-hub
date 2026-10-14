import { Role } from '../types';

export type AccessCheckResult = {
  allowed: boolean;
  reason?: 
    | 'USER_NOT_FOUND' 
    | 'USER_INACTIVE' 
    | 'USER_DELETED' 
    | 'PAPER_NOT_FOUND' 
    | 'PAPER_DELETED' 
    | 'PAPER_NOT_PUBLISHED' 
    | 'COURSE_INACTIVE' 
    | 'COURSE_DELETED' 
    | 'NO_ACTIVE_ENTITLEMENT';
};

export interface UserAccessContext {
  id: string;
  role: Role;
  isActive: boolean;
  deletedAt: string | null;
}

export interface PaperAccessContext {
  id: string;
  courseId: string;
  status: 'PUBLISHED' | 'DRAFT' | 'HIDDEN' | 'ARCHIVED';
  isFreeSample: boolean;
  deletedAt: string | null;
  course: {
    id: string;
    isActive: boolean;
    deletedAt: string | null;
  };
}

export interface ActiveEntitlementContext {
  userId: string;
  isActive: boolean;
  validUntil: string | null;
  courseIds: string[]; // Courses in the entitled ProgramTerm
}

/**
 * Server authorization check for exam paper viewing.
 * Deny by default.
 * 
 * Rules enforced:
 * 1. User must exist, be active, and not soft-deleted.
 * 2. Paper must exist, have status === 'PUBLISHED', and not be soft-deleted.
 * 3. Course must exist, be active, and not be soft-deleted.
 * 4. Free sample papers bypass entitlement checks.
 * 5. Paid papers require an ACTIVE entitlement for ANY ProgramTerm containing the paper's course.
 * 
 * Note: Staff previewing DRAFT or HIDDEN papers must use a separate audited admin path.
 */
export function verifyPaperAccess(
  user: UserAccessContext | null | undefined,
  paper: PaperAccessContext | null | undefined,
  userEntitlements: ActiveEntitlementContext[]
): AccessCheckResult {
  // 1. Verify User status (Security Fix #1 & #3)
  if (!user) return { allowed: false, reason: 'USER_NOT_FOUND' };
  if (!user.isActive) return { allowed: false, reason: 'USER_INACTIVE' };
  if (user.deletedAt !== null) return { allowed: false, reason: 'USER_DELETED' };

  // 2. Verify Paper and Course status (Security Fix #1 & #3)
  if (!paper) return { allowed: false, reason: 'PAPER_NOT_FOUND' };
  if (paper.deletedAt !== null) return { allowed: false, reason: 'PAPER_DELETED' };

  // Non-staff students can ONLY view PUBLISHED papers
  if (paper.status !== 'PUBLISHED') {
    return { allowed: false, reason: 'PAPER_NOT_PUBLISHED' };
  }

  // Course must be active and not soft-deleted
  if (!paper.course.isActive) return { allowed: false, reason: 'COURSE_INACTIVE' };
  if (paper.course.deletedAt !== null) return { allowed: false, reason: 'COURSE_DELETED' };

  // Free samples are accessible to any verified student without entitlement
  if (paper.isFreeSample) {
    return { allowed: true };
  }

  // 3. Verify Active Entitlement across ANY ProgramTerm containing the course
  const now = new Date();
  const hasEntitlement = userEntitlements.some((e) => {
    if (!e.isActive || e.userId !== user.id) return false;
    if (e.validUntil && new Date(e.validUntil) <= now) return false;
    return e.courseIds.includes(paper.courseId);
  });

  if (!hasEntitlement) {
    return { allowed: false, reason: 'NO_ACTIVE_ENTITLEMENT' };
  }

  return { allowed: true };
}
