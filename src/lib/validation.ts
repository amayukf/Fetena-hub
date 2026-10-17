import { z } from 'zod';

// ==============================================================================
// AUTHENTICATION SCHEMAS
// ==============================================================================

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'Full name must be at least 3 characters')
    .max(100, 'Full name cannot exceed 100 characters'),
  identifier: z
    .string()
    .trim()
    .min(4, 'Enter a valid email address or Ethiopian phone number (+251 9... or 09...)')
    .refine((val) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneRegex = /^(\+251|0)?[97]\d{8}$/;
      return emailRegex.test(val) || phoneRegex.test(val);
    }, 'Must be a valid email or Ethiopian phone number'),
  departmentId: z.string().min(1, 'Please select a valid department'),
  currentYear: z.coerce
    .number()
    .int()
    .min(1, 'Year must be between 1 and 5')
    .max(5, 'Year must be between 1 and 5'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password is too long'),
});

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(3, 'Please enter your phone number or email'),
  password: z
    .string()
    .min(1, 'Please enter your password'),
  rememberMe: z.boolean().optional().default(false),
});

export const verifyOtpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Verification code must be 6 digits'),
});

// ==============================================================================
// PAYMENT SUBMISSION (MANUAL APPROVAL WITH SCREENSHOT & TX ID)
// ==============================================================================

export const paymentSubmissionSchema = z.object({
  programTermId: z.string().min(1, 'ProgramTerm ID required').optional(),
  departmentId: z.string().optional(),
  academicYearNumber: z.coerce.number().int().min(1).max(5).default(1),
  semesterNumber: z.coerce.number().int().min(1).max(2).default(1),
  amountEtb: z.coerce.number().positive('Amount must be positive').optional(),
  paymentMethod: z.enum(['TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER'], {
    message: 'Choose Telebirr, CBE Birr, or Bank transfer',
  }),
  transactionId: z
    .string()
    .trim()
    .min(4, 'Transaction reference ID must be at least 4 characters')
    .max(50, 'Transaction reference ID is too long')
    .regex(/^[A-Za-z0-9_-]+$/, 'Transaction reference contains invalid characters'),
  screenshotBase64: z
    .string()
    .optional(), // Uploaded image data or file reference
  screenshotUrl: z.string().optional(),
  screenshotSha256: z.string().optional(),
  storageKey: z.string().optional(),
  receiptImageStorageKey: z.string().optional(),
  receiptImageSha256: z.string().optional(),
});

export const paymentApprovalSchema = z.object({
  paymentId: z.string().min(1, 'Valid payment ID required'),
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().trim().max(500).optional(),
});

// ==============================================================================
// SELL-TO-ADMIN: CONTRIBUTIONS & BUYBACK
// ==============================================================================

export const paperContributionSchema = z.object({
  courseId: z.string().min(1, 'Please select a valid course'),
  examType: z.enum(['FINAL', 'MID', 'QUIZ', 'ASSIGNMENT']),
  academicYear: z.coerce
    .number()
    .int()
    .min(2010, 'Exam year must be 2010 or later')
    .max(new Date().getFullYear() + 1),
  examDate: z
    .string()
    .min(1, 'Exam date is required')
    .refine((val) => {
      const d = new Date(val);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      return !isNaN(d.getTime()) && d.getTime() < today.getTime();
    }, 'Exam administration date must be strictly in the past (< today)'),
  declarationAccepted: z
    .boolean()
    .refine((val) => val === true, 'Honor declaration must be accepted to sell paper'),
  declarationText: z.string().optional(),
  studentNotes: z.string().trim().max(1000).optional(),
  payoutPaymentMethod: z.enum(['TELEBIRR', 'CBE_BIRR']),
  payoutAccount: z
    .string()
    .trim()
    .min(9, 'Enter valid phone number or CBE account for payout')
    .max(30),
  proposedPayoutEtb: z.coerce.number().positive().max(1000).optional(),
});

export const contributionReviewSchema = z.object({
  contributionId: z.string().min(1, 'Valid contribution ID required'),
  decision: z.enum(['APPROVE', 'REJECT']),
  approvedPayoutEtb: z.coerce.number().positive().optional(),
  payoutTxId: z.string().trim().optional(),
  rejectionReason: z.string().trim().optional(),
  publishDirectly: z.boolean().default(false),
  examTitle: z.string().trim().optional(),
  scanQuality: z.enum(['EXCELLENT', 'GOOD', 'FAIR']).default('GOOD'),
});

// ==============================================================================
// PAPER REQUEST SCHEMA
// ==============================================================================

export const paperRequestSchema = z.object({
  courseId: z.string().min(1, 'Please select a course'),
  examType: z.enum(['FINAL', 'MID', 'QUIZ', 'ASSIGNMENT']),
  examYear: z.coerce.number().int().min(2010).max(new Date().getFullYear() + 1).optional(),
  notes: z.string().trim().max(500).optional(),
});

// ==============================================================================
// SYSTEM SETTINGS SCHEMA
// ==============================================================================

export const platformSettingsSchema = z.object({
  semesterPriceEtb: z.coerce.number().positive().min(1).max(500),
  telebirrReceiverPhone: z.string().trim().min(9).max(20),
  telebirrReceiverName: z.string().trim().min(3).max(100),
  cbeAccountNumber: z.string().trim().min(10).max(30),
  cbeAccountName: z.string().trim().min(3).max(100),
  maxUploadSizeMb: z.coerce.number().int().positive().max(100),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PaymentSubmissionInput = z.infer<typeof paymentSubmissionSchema>;
export type PaymentApprovalInput = z.infer<typeof paymentApprovalSchema>;
export type PaperContributionInput = z.infer<typeof paperContributionSchema>;
export type ContributionReviewInput = z.infer<typeof contributionReviewSchema>;
export type PaperRequestInput = z.infer<typeof paperRequestSchema>;
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;
