export type Role = 'STUDENT' | 'CONTENT_MANAGER' | 'PAYMENT_VERIFIER' | 'ADMIN';

export type ExamType = 'FINAL' | 'MID' | 'QUIZ' | 'ASSIGNMENT';

export type ScanQuality = 'EXCELLENT' | 'GOOD' | 'FAIR';

export type PaperStatus = 'PUBLISHED' | 'DRAFT' | 'HIDDEN' | 'ARCHIVED';

export type PaymentMethod = 'TELEBIRR' | 'CBE_BIRR' | 'BANK_TRANSFER';

export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type ContributionStatus =
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'OFFER_MADE'
  | 'ACCEPTED'
  | 'PUBLISHED'
  | 'PAID'
  | 'REJECTED'
  | 'PENDING'
  | 'APPROVED_PENDING_PAYOUT'
  | 'PAID_OUT';

export type PaperRequestStatus = 'OPEN' | 'IN_PROGRESS' | 'FULFILLED' | 'CLOSED';

export type AuditRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type StreamCode = 'NAT_SCI' | 'SOC_SCI';

export interface UserSession {
  userId: string;
  studentId: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: Role;
  programId: string | null;
  programName?: string | null;
  stream?: StreamCode | null;
  currentYear: number | null;
  mustChangePassword?: boolean;
}

export interface ProgramSummary {
  id: string;
  code: StreamCode | string;
  name: string;
  type: 'STREAM' | 'DEPARTMENT';
  campusName: string;
  courseCount: number;
}

export interface TermSummary {
  id: string;
  yearNumber: number;
  semesterNumber: number;
  name: string;
  isPurchasable: boolean;
  priceEtb: number;
}

export interface CourseSummary {
  id: string;
  code: string;
  title: string;
  creditHours: number;
  isShared: boolean;
  paperCount: number;
  breakdown: string;
}

export interface ExamPaperItem {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  title: string;
  examType: ExamType;
  academicYear: number;
  examYearEc?: number;
  quality: ScanQuality;
  pageCount: number;
  isFreeSample: boolean;
  status: PaperStatus;
  publishedAt: string | null;
}

export interface PaymentRecord {
  id: string;
  referenceCode: string;
  userId: string;
  studentName: string;
  programTermId: string;
  programName: string;
  termName: string;
  amountEtb: number;
  paymentMethod: PaymentMethod;
  transactionId: string;
  screenshotUrl?: string;
  status: PaymentStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface ContributionRecord {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  examType: ExamType;
  academicYear: number;
  examDate?: string;
  declarationAccepted?: boolean;
  studentNotes: string | null;
  fileName: string;
  fileSizeBytes: number;
  payoutPaymentMethod: PaymentMethod;
  payoutAccount: string;
  proposedPayoutEtb: number | null;
  approvedPayoutEtb: number | null;
  payoutTxId: string | null;
  quality: ScanQuality;
  status: ContributionStatus;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface PaperRequestItem {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  examType: ExamType;
  examYear: number | null;
  notes: string | null;
  demandCount: number;
  latestRequest: string;
  status: PaperRequestStatus;
}

export interface TermInterestRecord {
  id: string;
  userId?: string;
  termId: string;
  termName: string;
  emailOrPhone: string;
  preferredChannel: string;
  submittedAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType?: string;
  performedBy: string;
  role: Role;
  deviceIp: string;
  dateTime: string;
  risk: 'Low' | 'Medium' | 'High';
  details: string;
}
