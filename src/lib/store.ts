import {
  Role,
  ExamType,
  ScanQuality,
  PaymentMethod,
  PaymentStatus,
  ContributionStatus,
  UserSession,
  StreamCode,
  CourseSummary,
  TermInterestRecord,
} from '../types';

export interface StorePayment {
  id: string;
  referenceCode: string;
  userId: string;
  studentName: string;
  studentId: string;
  stream: StreamCode;
  streamName: string;
  academicYearNumber: number;
  semesterNumber: number;
  programTermId: string;
  amountEtb: number;
  paymentMethod: PaymentMethod;
  transactionId: string;
  screenshotUrl?: string;
  status: PaymentStatus;
  rejectionReason?: string;
  resubmitCount?: number;
  hasDuplicateScreenshot?: boolean;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface StoreContribution {
  id: string;
  studentId: string;
  studentName: string;
  studentIdentifier: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  streamName: string;
  examType: ExamType;
  academicYear: number;
  examDate: string;
  declarationAccepted: boolean;
  declarationText?: string;
  studentNotes?: string;
  fileName: string;
  fileSizeBytes: number;
  payoutPaymentMethod: PaymentMethod;
  payoutAccount: string;
  proposedPayoutEtb: number;
  approvedPayoutEtb?: number;
  payoutTxId?: string;
  quality: ScanQuality;
  status: ContributionStatus;
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface StorePaperRequest {
  id: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  streamName: string;
  examType: ExamType;
  examYear?: number;
  notes?: string;
  demandCount: number;
  latestRequest: string;
  status: 'OPEN' | 'IN_REVIEW' | 'FULFILLED';
}

export interface StoreExamPaper {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle?: string;
  courseName: string;
  title: string;
  examType: ExamType;
  academicYear: number;
  examYearEc?: number;
  quality: ScanQuality;
  pageCount: number;
  isFreeSample: boolean;
  status: 'PUBLISHED' | 'DRAFT' | 'HIDDEN';
  addedAt: string;
  sha256?: string;
  storageKey?: string;
  fileSizeBytes?: number;
  deletedAt?: string | null;
  viewsCount?: number;
}

export interface StoreWantedPaper {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  examType: ExamType;
  offeredPriceEtb: number;
  isOpen: boolean;
  notes?: string;
  createdAt: string;
}

export const INITIAL_WANTED_PAPERS: StoreWantedPaper[] = [];

export interface StoreAuditLog {
  id: string;
  action: string;
  performedBy: string;
  role: Role;
  deviceIp: string;
  dateTime: string;
  risk: 'Low' | 'Medium' | 'High';
  details: string;
}

export interface StoreNotification {
  id: string;
  userId: string;
  icon: 'check' | 'file' | 'upload' | 'card';
  title: string;
  message: string;
  timeAgo: string;
  tone: 'success' | 'accent' | 'neutral' | 'warning';
  read: boolean;
}

export interface PlatformConfig {
  semesterPriceEtb: number;
  telebirrPhone: string;
  telebirrAccountName: string;
  cbeAccountNumber: string;
  cbeAccountName: string;
  allowNewPapersInUnlockedSemester: boolean;
  lowDataMode: boolean;
}

// -------------------------------------------------------------
// FRESHMAN CURRICULUM DEFINITIONS: AMBO UNIVERSITY - WOLISO CAMPUS
// -------------------------------------------------------------

export interface FreshmanCourseItem extends CourseSummary {
  streamScope: 'SHARED' | 'NAT_SCI' | 'SOC_SCI';
}

export const FRESHMAN_11_COURSES: FreshmanCourseItem[] = [
  // 3 SHARED COURSES (Single record each, taken by both streams)
  {
    id: 'course-flen1011',
    code: 'FLEn 1011',
    title: 'Communicative English Language Skills I',
    creditHours: 3,
    isShared: true,
    streamScope: 'SHARED',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-phil1011',
    code: 'Phil 1011',
    title: 'Introduction to Logic and Critical Thinking',
    creditHours: 3,
    isShared: true,
    streamScope: 'SHARED',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-spsc1011',
    code: 'SPSC 1011',
    title: 'Physical Fitness',
    creditHours: 2,
    isShared: true,
    streamScope: 'SHARED',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },

  // 4 NATURAL SCIENCE SPECIFIC COURSES
  {
    id: 'course-phys1011',
    code: 'Phys 1011',
    title: 'General Physics',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-gees1011',
    code: 'GeES 1011',
    title: 'Geography of Ethiopia and the Horn',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-math1011',
    code: 'MATH 1011',
    title: 'Mathematics for Natural Sciences',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-psyc1011',
    code: 'Psyc 1011',
    title: 'General Psychology',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },

  // 4 SOCIAL SCIENCE SPECIFIC COURSES
  {
    id: 'course-econ1011',
    code: 'Econ 1011',
    title: 'Economics',
    creditHours: 3,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-anth1012',
    code: 'Anth 1012',
    title: 'Social Anthropology',
    creditHours: 2,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-emte1012',
    code: 'EmTe 1012',
    title: 'Introduction to Emerging Technologies',
    creditHours: 3,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
  {
    id: 'course-mgmt1012',
    code: 'MGMT 1012',
    title: 'Entrepreneurship',
    creditHours: 3,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 0,
    breakdown: 'No papers published yet',
  },
];

export function getCoursesForStream(stream: StreamCode): FreshmanCourseItem[] {
  return FRESHMAN_11_COURSES.filter(
    (c) => c.streamScope === 'SHARED' || c.streamScope === stream
  );
}

// -------------------------------------------------------------
// PURE PRODUCTION EMPTY INITIAL STATE (Populated from real database queries)
// -------------------------------------------------------------

export const INITIAL_USERS: UserSession[] = [];
export const INITIAL_PAYMENTS: StorePayment[] = [];
export const INITIAL_CONTRIBUTIONS: StoreContribution[] = [];
export const INITIAL_PAPERS: StoreExamPaper[] = [];
export const INITIAL_REQUESTS: StorePaperRequest[] = [];
export const INITIAL_AUDIT_LOGS: StoreAuditLog[] = [];
export const INITIAL_NOTIFICATIONS: StoreNotification[] = [];

export const INITIAL_TERM_INTERESTS: TermInterestRecord[] = [];

export interface SystemSettingsState {
  semesterPriceEtb: string;
  telebirrPhone: string;
  telebirrRecipientName: string;
  cbeAccountNumber: string;
  cbeRecipientName: string;
  maxUploadSizeMb: string;
  maxScreenshotSizeMb: string;
  paymentVerificationSlaHours: string;
  announcementBanner: string;
  announcementActive: boolean;
  paymentInstructions: string;
  maxPayoutLimitEtb: string;
}

export const INITIAL_SYSTEM_SETTINGS: SystemSettingsState = {
  semesterPriceEtb: '50',
  telebirrPhone: '',
  telebirrRecipientName: '',
  cbeAccountNumber: '',
  cbeRecipientName: '',
  maxUploadSizeMb: '20',
  maxScreenshotSizeMb: '5',
  paymentVerificationSlaHours: '2',
  announcementBanner: 'Ambo University Woliso Campus past exam papers archive is active.',
  announcementActive: true,
  paymentInstructions: 'Transfer the exact semester unlock fee using Telebirr or CBE Birr. Include your Student ID in the transaction note, and upload a clear screenshot of the completed transfer.',
  maxPayoutLimitEtb: '300',
};
