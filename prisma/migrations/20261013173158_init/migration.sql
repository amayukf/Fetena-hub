-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'CONTENT_MANAGER', 'PAYMENT_VERIFIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('STREAM', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('FINAL', 'MID', 'QUIZ', 'ASSIGNMENT');

-- CreateEnum
CREATE TYPE "ScanQuality" AS ENUM ('EXCELLENT', 'GOOD', 'FAIR');

-- CreateEnum
CREATE TYPE "PaperStatus" AS ENUM ('PUBLISHED', 'DRAFT', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TELEBIRR', 'CBE_BIRR', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'OFFER_MADE', 'ACCEPTED', 'PUBLISHED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaperRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'FULFILLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AuditRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'STUDENT',
    "programId" TEXT,
    "currentYear" INTEGER DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "canSell" BOOLEAN NOT NULL DEFAULT true,
    "avatarUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProgramType" NOT NULL DEFAULT 'STREAM',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Term" (
    "id" TEXT NOT NULL,
    "yearNumber" INTEGER NOT NULL,
    "semesterNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Term_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTerm" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "priceEtb" DECIMAL(10,2) NOT NULL DEFAULT 50.00,
    "isPurchasable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "creditHours" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTermCourse" (
    "id" TEXT NOT NULL,
    "programTermId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramTermCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaper" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "campusId" TEXT,
    "title" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL DEFAULT 'FINAL',
    "examYearEc" INTEGER NOT NULL,
    "quality" "ScanQuality" NOT NULL DEFAULT 'EXCELLENT',
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "isFreeSample" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaperStatus" NOT NULL DEFAULT 'PUBLISHED',
    "deletedAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programTermId" TEXT NOT NULL,
    "paymentId" TEXT,
    "grantedById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programTermId" TEXT NOT NULL,
    "amountEtb" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'TELEBIRR',
    "transactionId" TEXT NOT NULL,
    "screenshotKey" TEXT,
    "screenshotSha256" TEXT,
    "resubmitCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperContribution" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL DEFAULT 'FINAL',
    "examDate" TIMESTAMP(3) NOT NULL,
    "academicYearEc" INTEGER NOT NULL,
    "studentNotes" TEXT,
    "declarationText" TEXT NOT NULL,
    "declarationAcceptedAt" TIMESTAMP(3) NOT NULL,
    "payoutPaymentMethod" "PaymentMethod" NOT NULL DEFAULT 'TELEBIRR',
    "payoutAccount" TEXT NOT NULL,
    "proposedPayoutEtb" DECIMAL(10,2),
    "approvedPayoutEtb" DECIMAL(10,2),
    "payoutTxId" TEXT,
    "payoutReceiptKey" TEXT,
    "status" "ContributionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "rejectionReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "examPaperId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContributionFile" (
    "id" TEXT NOT NULL,
    "contributionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageOrder" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContributionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WantedPaper" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL DEFAULT 'FINAL',
    "offeredPriceEtb" DECIMAL(10,2) NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WantedPaper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL DEFAULT 'FINAL',
    "examYear" INTEGER,
    "notes" TEXT,
    "status" "PaperRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "riskLevel" "AuditRiskLevel" NOT NULL DEFAULT 'LOW',
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaperViewLog" (
    "id" TEXT NOT NULL,
    "examPaperId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperViewLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_studentId_key" ON "User"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_programId_idx" ON "User"("programId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionTokenHash_key" ON "Session"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_sessionTokenHash_idx" ON "Session"("sessionTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Campus_code_key" ON "Campus"("code");

-- CreateIndex
CREATE INDEX "Campus_isActive_idx" ON "Campus"("isActive");

-- CreateIndex
CREATE INDEX "Program_campusId_idx" ON "Program"("campusId");

-- CreateIndex
CREATE INDEX "Program_type_idx" ON "Program"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Program_campusId_code_key" ON "Program"("campusId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Term_yearNumber_semesterNumber_key" ON "Term"("yearNumber", "semesterNumber");

-- CreateIndex
CREATE INDEX "ProgramTerm_programId_idx" ON "ProgramTerm"("programId");

-- CreateIndex
CREATE INDEX "ProgramTerm_termId_idx" ON "ProgramTerm"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTerm_programId_termId_key" ON "ProgramTerm"("programId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_code_key" ON "Course"("code");

-- CreateIndex
CREATE INDEX "Course_code_idx" ON "Course"("code");

-- CreateIndex
CREATE INDEX "Course_isActive_deletedAt_idx" ON "Course"("isActive", "deletedAt");

-- CreateIndex
CREATE INDEX "ProgramTermCourse_programTermId_idx" ON "ProgramTermCourse"("programTermId");

-- CreateIndex
CREATE INDEX "ProgramTermCourse_courseId_idx" ON "ProgramTermCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTermCourse_programTermId_courseId_key" ON "ProgramTermCourse"("programTermId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_sha256_key" ON "ExamPaper"("sha256");

-- CreateIndex
CREATE INDEX "ExamPaper_courseId_idx" ON "ExamPaper"("courseId");

-- CreateIndex
CREATE INDEX "ExamPaper_status_deletedAt_idx" ON "ExamPaper"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "ExamPaper_isFreeSample_idx" ON "ExamPaper"("isFreeSample");

-- CreateIndex
CREATE INDEX "ExamPaper_sha256_idx" ON "ExamPaper"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_paymentId_key" ON "Entitlement"("paymentId");

-- CreateIndex
CREATE INDEX "Entitlement_userId_idx" ON "Entitlement"("userId");

-- CreateIndex
CREATE INDEX "Entitlement_programTermId_idx" ON "Entitlement"("programTermId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_userId_programTermId_key" ON "Entitlement"("userId", "programTermId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_referenceCode_key" ON "Payment"("referenceCode");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_userId_idx" ON "Payment"("userId");

-- CreateIndex
CREATE INDEX "Payment_programTermId_idx" ON "Payment"("programTermId");

-- CreateIndex
CREATE INDEX "Payment_screenshotSha256_idx" ON "Payment"("screenshotSha256");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_paymentMethod_transactionId_key" ON "Payment"("paymentMethod", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperContribution_payoutTxId_key" ON "PaperContribution"("payoutTxId");

-- CreateIndex
CREATE UNIQUE INDEX "PaperContribution_examPaperId_key" ON "PaperContribution"("examPaperId");

-- CreateIndex
CREATE INDEX "PaperContribution_status_idx" ON "PaperContribution"("status");

-- CreateIndex
CREATE INDEX "PaperContribution_studentId_idx" ON "PaperContribution"("studentId");

-- CreateIndex
CREATE INDEX "PaperContribution_courseId_idx" ON "PaperContribution"("courseId");

-- CreateIndex
CREATE INDEX "PaperContribution_examDate_idx" ON "PaperContribution"("examDate");

-- CreateIndex
CREATE INDEX "ContributionFile_contributionId_idx" ON "ContributionFile"("contributionId");

-- CreateIndex
CREATE INDEX "ContributionFile_sha256_idx" ON "ContributionFile"("sha256");

-- CreateIndex
CREATE INDEX "WantedPaper_courseId_idx" ON "WantedPaper"("courseId");

-- CreateIndex
CREATE INDEX "WantedPaper_isOpen_idx" ON "WantedPaper"("isOpen");

-- CreateIndex
CREATE INDEX "TermInterest_userId_idx" ON "TermInterest"("userId");

-- CreateIndex
CREATE INDEX "TermInterest_termId_idx" ON "TermInterest"("termId");

-- CreateIndex
CREATE UNIQUE INDEX "TermInterest_userId_termId_key" ON "TermInterest"("userId", "termId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "PaperRequest_courseId_idx" ON "PaperRequest"("courseId");

-- CreateIndex
CREATE INDEX "PaperRequest_status_idx" ON "PaperRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_key_idx" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PaperViewLog_examPaperId_idx" ON "PaperViewLog"("examPaperId");

-- CreateIndex
CREATE INDEX "PaperViewLog_userId_idx" ON "PaperViewLog"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTerm" ADD CONSTRAINT "ProgramTerm_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTerm" ADD CONSTRAINT "ProgramTerm_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTermCourse" ADD CONSTRAINT "ProgramTermCourse_programTermId_fkey" FOREIGN KEY ("programTermId") REFERENCES "ProgramTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTermCourse" ADD CONSTRAINT "ProgramTermCourse_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaper" ADD CONSTRAINT "ExamPaper_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_programTermId_fkey" FOREIGN KEY ("programTermId") REFERENCES "ProgramTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_programTermId_fkey" FOREIGN KEY ("programTermId") REFERENCES "ProgramTerm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperContribution" ADD CONSTRAINT "PaperContribution_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperContribution" ADD CONSTRAINT "PaperContribution_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperContribution" ADD CONSTRAINT "PaperContribution_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperContribution" ADD CONSTRAINT "PaperContribution_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "ExamPaper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContributionFile" ADD CONSTRAINT "ContributionFile_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "PaperContribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WantedPaper" ADD CONSTRAINT "WantedPaper_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermInterest" ADD CONSTRAINT "TermInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermInterest" ADD CONSTRAINT "TermInterest_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperRequest" ADD CONSTRAINT "PaperRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperRequest" ADD CONSTRAINT "PaperRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperViewLog" ADD CONSTRAINT "PaperViewLog_examPaperId_fkey" FOREIGN KEY ("examPaperId") REFERENCES "ExamPaper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperViewLog" ADD CONSTRAINT "PaperViewLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ==============================================================================
-- RAW SQL ENHANCEMENTS: SECURITY & DOMAIN RULES
-- ==============================================================================

-- 1. Partial Unique Index: Only one PENDING payment allowed per student per programTerm
CREATE UNIQUE INDEX uq_payment_pending_user_program_term 
ON "Payment" ("userId", "programTermId") 
WHERE status = 'PENDING';

-- 2. Security: AuditLog & PaperViewLog Immutability Triggers (Append-Only)
CREATE OR REPLACE FUNCTION prevent_immutable_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Security violation: Table % is append-only. UPDATE and DELETE operations are strictly forbidden.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_log_modification();

CREATE TRIGGER trg_paper_view_log_immutable
BEFORE UPDATE OR DELETE ON "PaperViewLog"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_log_modification();

