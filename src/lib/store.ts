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

export const INITIAL_WANTED_PAPERS: StoreWantedPaper[] = [
  {
    id: 'wanted-001',
    courseId: 'course-math1011',
    courseCode: 'MATH 1011',
    courseTitle: 'Mathematics for Natural Sciences',
    examType: 'MID',
    offeredPriceEtb: 120,
    isOpen: true,
    notes: '2016 E.C. Mid Exam paper with legible handwriting or printed scan.',
    createdAt: '12 May 2026',
  },
  {
    id: 'wanted-002',
    courseId: 'course-phys1011',
    courseCode: 'Phys 1011',
    courseTitle: 'General Physics',
    examType: 'QUIZ',
    offeredPriceEtb: 80,
    isOpen: true,
    notes: 'Any quiz from 2015-2016 E.C.',
    createdAt: '10 May 2026',
  },
];

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
    paperCount: 2,
    breakdown: '1 final · 1 mid (sample)',
  },
  {
    id: 'course-phil1011',
    code: 'Phil 1011',
    title: 'Introduction to Logic and Critical Thinking',
    creditHours: 3,
    isShared: true,
    streamScope: 'SHARED',
    paperCount: 1,
    breakdown: '1 final exam',
  },
  {
    id: 'course-spsc1011',
    code: 'SPSC 1011',
    title: 'Physical Fitness',
    creditHours: 2,
    isShared: true,
    streamScope: 'SHARED',
    paperCount: 1,
    breakdown: '1 final exam',
  },

  // 4 NATURAL SCIENCE SPECIFIC COURSES
  {
    id: 'course-phys1011',
    code: 'Phys 1011',
    title: 'General Physics',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 2,
    breakdown: '1 final · 1 mid',
  },
  {
    id: 'course-gees1011',
    code: 'GeES 1011',
    title: 'Geography of Ethiopia and the Horn',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 1,
    breakdown: '1 final exam',
  },
  {
    id: 'course-math1011',
    code: 'MATH 1011',
    title: 'Mathematics for Natural Sciences',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 2,
    breakdown: '1 final · 1 mid',
  },
  {
    id: 'course-psyc1011',
    code: 'Psyc 1011',
    title: 'General Psychology',
    creditHours: 3,
    isShared: false,
    streamScope: 'NAT_SCI',
    paperCount: 1,
    breakdown: '1 final exam',
  },

  // 4 SOCIAL SCIENCE SPECIFIC COURSES
  {
    id: 'course-econ1011',
    code: 'Econ 1011',
    title: 'Economics',
    creditHours: 3,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 2,
    breakdown: '1 final · 1 mid',
  },
  {
    id: 'course-anth1012',
    code: 'Anth 1012',
    title: 'Social Anthropology',
    creditHours: 2,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 1,
    breakdown: '1 final exam',
  },
  {
    id: 'course-emte1012',
    code: 'EmTe 1012',
    title: 'Introduction to Emerging Technologies',
    creditHours: 3,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 1,
    breakdown: '1 final exam',
  },
  {
    id: 'course-mgmt1012',
    code: 'MGMT 1012',
    title: 'Entrepreneurship',
    creditHours: 3,
    isShared: false,
    streamScope: 'SOC_SCI',
    paperCount: 1,
    breakdown: '1 final exam',
  },
];

export function getCoursesForStream(stream: StreamCode): FreshmanCourseItem[] {
  return FRESHMAN_11_COURSES.filter(
    (c) => c.streamScope === 'SHARED' || c.streamScope === stream
  );
}

// -------------------------------------------------------------
// INITIAL AMBO UNIVERSITY WOLISO CAMPUS SEED DATA
// -------------------------------------------------------------

export const INITIAL_USERS: UserSession[] = [
  {
    userId: 'user-abenezer',
    studentId: 'AMU-2026-0042',
    fullName: 'Abenezer Bekele',
    email: 'abenezer@example.com',
    phone: '+251 911 234 821',
    role: 'STUDENT',
    programId: 'prog-nat-sci',
    programName: 'Natural Science',
    stream: 'NAT_SCI',
    currentYear: 1,
  },
  {
    userId: 'user-mekdes',
    studentId: 'AMU-2026-0099',
    fullName: 'Mekdes Tadesse',
    email: 'mekdes@example.com',
    phone: '+251 922 112 233',
    role: 'STUDENT',
    programId: 'prog-soc-sci',
    programName: 'Social Science',
    stream: 'SOC_SCI',
    currentYear: 1,
  },
  {
    userId: 'staff-hana',
    studentId: 'STAFF-V01',
    fullName: 'Hana K. Verifier',
    email: 'verifier@examvault.edu.et',
    phone: '+251 911 000 002',
    role: 'PAYMENT_VERIFIER',
    programId: null,
    stream: null,
    currentYear: null,
  },
  {
    userId: 'staff-dawit',
    studentId: 'STAFF-C01',
    fullName: 'Dawit M. Content Lead',
    email: 'content@examvault.edu.et',
    phone: '+251 911 000 003',
    role: 'CONTENT_MANAGER',
    programId: null,
    stream: null,
    currentYear: null,
  },
  {
    userId: 'staff-admin',
    studentId: 'STAFF-A01',
    fullName: 'Ambo University Admin',
    email: 'admin@examvault.edu.et',
    phone: '+251 911 000 001',
    role: 'ADMIN',
    programId: null,
    stream: null,
    currentYear: null,
  },
];

export const INITIAL_PAYMENTS: StorePayment[] = [
  {
    id: 'pay-001',
    referenceCode: 'EV-2026-0842',
    userId: 'user-abenezer',
    studentName: 'Abenezer Bekele',
    studentId: 'AMU-2026-0042',
    stream: 'NAT_SCI',
    streamName: 'Natural Science',
    academicYearNumber: 1,
    semesterNumber: 1,
    programTermId: 'pt-nat-sci-y1s1',
    amountEtb: 50,
    paymentMethod: 'TELEBIRR',
    transactionId: 'TB9X2P44',
    screenshotUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=400&q=80',
    status: 'APPROVED',
    submittedAt: '12 May 2026, 09:14 AM',
    reviewedAt: '12 May 2026, 09:22 AM',
    reviewedBy: 'Hana K. Verifier',
  },
  {
    id: 'pay-002',
    referenceCode: 'EV-2026-0915',
    userId: 'user-mekdes',
    studentName: 'Mekdes Tadesse',
    studentId: 'AMU-2026-0099',
    stream: 'SOC_SCI',
    streamName: 'Social Science',
    academicYearNumber: 1,
    semesterNumber: 1,
    programTermId: 'pt-soc-sci-y1s1',
    amountEtb: 50,
    paymentMethod: 'CBE_BIRR',
    transactionId: 'CBE4F8K92',
    screenshotUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
    status: 'PENDING',
    submittedAt: '15 min ago',
  },
];

export const INITIAL_CONTRIBUTIONS: StoreContribution[] = [
  {
    id: 'contrib-001',
    studentId: 'user-abenezer',
    studentName: 'Abenezer Bekele',
    studentIdentifier: 'AMU-2026-0042',
    courseId: 'course-phys1011',
    courseCode: 'Phys 1011',
    courseName: 'General Physics',
    streamName: 'Natural Science',
    examType: 'FINAL',
    academicYear: 2023,
    examDate: '2023-06-15',
    declarationAccepted: true,
    studentNotes: 'Clear handwritten scanned questions from 2015 E.C. final exam.',
    fileName: 'Phys1011_Final_2015EC.pdf',
    fileSizeBytes: 2450000,
    payoutPaymentMethod: 'TELEBIRR',
    payoutAccount: '0900 000 042',
    proposedPayoutEtb: 100,
    quality: 'EXCELLENT',
    status: 'PENDING',
    submittedAt: '12 May 2026',
  },
  {
    id: 'contrib-002',
    studentId: 'user-mekdes',
    studentName: 'Mekdes Tadesse',
    studentIdentifier: 'AMU-2026-0099',
    courseId: 'course-econ1011',
    courseCode: 'Econ 1011',
    courseName: 'Economics',
    streamName: 'Social Science',
    examType: 'MID',
    academicYear: 2023,
    examDate: '2023-04-10',
    declarationAccepted: true,
    studentNotes: 'Mid exam covering supply, demand, elasticity, and macro principles.',
    fileName: 'Econ1011_Mid_2015EC.pdf',
    fileSizeBytes: 1800000,
    payoutPaymentMethod: 'CBE_BIRR',
    payoutAccount: '1000987654321',
    proposedPayoutEtb: 60,
    approvedPayoutEtb: 60,
    payoutTxId: 'CBE_PAYOUT_4412',
    quality: 'EXCELLENT',
    status: 'PAID_OUT',
    submittedAt: '02 Apr 2026',
    reviewedAt: '03 Apr 2026',
  },
];

export const INITIAL_PAPERS: StoreExamPaper[] = [
  // FLEn 1011 (Shared)
  {
    id: 'paper-flen1011-final-2015',
    courseId: 'course-flen1011',
    courseCode: 'FLEn 1011',
    courseName: 'Communicative English Language Skills I',
    title: 'FLEn 1011 · Final Exam 2015 E.C.',
    examType: 'FINAL',
    academicYear: 2023,
    examYearEc: 2015,
    quality: 'EXCELLENT',
    pageCount: 6,
    isFreeSample: false,
    status: 'PUBLISHED',
    addedAt: 'recently',
  },
  {
    id: 'paper-flen1011-mid-2015-sample',
    courseId: 'course-flen1011',
    courseCode: 'FLEn 1011',
    courseName: 'Communicative English Language Skills I',
    title: 'FLEn 1011 · Mid Exam 2015 E.C. (Free Sample)',
    examType: 'MID',
    academicYear: 2023,
    examYearEc: 2015,
    quality: 'GOOD',
    pageCount: 4,
    isFreeSample: true,
    status: 'PUBLISHED',
    addedAt: 'recently',
  },
  // Phys 1011 (Natural Science)
  {
    id: 'paper-phys1011-final-2015',
    courseId: 'course-phys1011',
    courseCode: 'Phys 1011',
    courseName: 'General Physics',
    title: 'Phys 1011 · Final Exam 2015 E.C.',
    examType: 'FINAL',
    academicYear: 2023,
    examYearEc: 2015,
    quality: 'EXCELLENT',
    pageCount: 8,
    isFreeSample: false,
    status: 'PUBLISHED',
    addedAt: 'recently',
  },
  // MATH 1011 (Natural Science)
  {
    id: 'paper-math1011-final-2015',
    courseId: 'course-math1011',
    courseCode: 'MATH 1011',
    courseName: 'Mathematics for Natural Sciences',
    title: 'MATH 1011 · Final Exam 2015 E.C.',
    examType: 'FINAL',
    academicYear: 2023,
    examYearEc: 2015,
    quality: 'EXCELLENT',
    pageCount: 8,
    isFreeSample: false,
    status: 'PUBLISHED',
    addedAt: 'recently',
  },
  // Econ 1011 (Social Science)
  {
    id: 'paper-econ1011-final-2015',
    courseId: 'course-econ1011',
    courseCode: 'Econ 1011',
    courseName: 'Economics',
    title: 'Econ 1011 · Final Exam 2015 E.C.',
    examType: 'FINAL',
    academicYear: 2023,
    examYearEc: 2015,
    quality: 'EXCELLENT',
    pageCount: 7,
    isFreeSample: false,
    status: 'PUBLISHED',
    addedAt: 'recently',
  },
];

export const INITIAL_REQUESTS: StorePaperRequest[] = [
  {
    id: 'req-001',
    studentId: 'user-abenezer',
    studentName: 'Abenezer Bekele',
    courseId: 'course-gees1011',
    courseCode: 'GeES 1011',
    courseName: 'Geography of Ethiopia and the Horn',
    streamName: 'Natural Science',
    examType: 'FINAL',
    examYear: 2022,
    notes: 'Urgent for upcoming midterm review on Horn hydrology and relief maps.',
    demandCount: 18,
    latestRequest: '12 May 2026',
    status: 'OPEN',
  },
  {
    id: 'req-002',
    studentId: 'user-mekdes',
    studentName: 'Mekdes Tadesse',
    courseId: 'course-anth1012',
    courseCode: 'Anth 1012',
    courseName: 'Social Anthropology',
    streamName: 'Social Science',
    examType: 'MID',
    examYear: 2023,
    notes: 'Need past exam questions on cultural relativism and Ethiopian ethnography.',
    demandCount: 11,
    latestRequest: '11 May 2026',
    status: 'IN_REVIEW',
  },
];

export const INITIAL_AUDIT_LOGS: StoreAuditLog[] = [
  {
    id: 'audit-001',
    action: 'Payment approved',
    performedBy: 'Hana K. Verifier',
    role: 'PAYMENT_VERIFIER',
    deviceIp: '197.156.102.10',
    dateTime: '12 May 2026, 09:22 AM',
    risk: 'Low',
    details: 'Verified Telebirr receipt TB9X2P44 for Abenezer Bekele (Natural Science Y1S1)',
  },
  {
    id: 'audit-002',
    action: 'Exam paper published',
    performedBy: 'Dawit M. Content Lead',
    role: 'CONTENT_MANAGER',
    deviceIp: '197.156.102.14',
    dateTime: '11 May 2026, 04:15 PM',
    risk: 'Low',
    details: 'Published FLEn 1011 Final Exam 2015 E.C. (Sha256 verified)',
  },
];

export const INITIAL_NOTIFICATIONS: StoreNotification[] = [
  {
    id: 'notif-001',
    userId: 'user-abenezer',
    icon: 'check',
    title: 'Semester access unlocked',
    message: 'Your payment for Natural Science, Year 1, Semester 1 was approved (50 ETB).',
    timeAgo: '12 May 2026',
    tone: 'success',
    read: false,
  },
  {
    id: 'notif-002',
    userId: 'user-abenezer',
    icon: 'file',
    title: 'New exam paper added',
    message: 'MATH 1011 Final Exam 2015 E.C. has been uploaded to your unlocked semester.',
    timeAgo: '10 May 2026',
    tone: 'accent',
    read: true,
  },
];

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
  telebirrPhone: '0900 000 000',
  telebirrRecipientName: 'Ambo University Woliso Campus (Placeholder)',
  cbeAccountNumber: '1000 0000 0000 0',
  cbeRecipientName: 'Ambo University Woliso Campus (Placeholder)',
  maxUploadSizeMb: '20',
  maxScreenshotSizeMb: '5',
  paymentVerificationSlaHours: '2',
  announcementBanner: 'Freshman Year 1 Semester 1 exams now digitized and verified for Woliso Campus.',
  announcementActive: true,
  paymentInstructions: 'Transfer the exact semester unlock fee using Telebirr or CBE Birr. Include your Student ID in the transaction note, and upload a clear screenshot of the completed transfer.',
  maxPayoutLimitEtb: '300',
};
