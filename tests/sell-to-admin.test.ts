import { describe, it, expect } from 'vitest';
import { paperContributionSchema, contributionReviewSchema } from '../src/lib/validation';
import { validateUploadFile } from '../src/lib/storage';

describe('ExamVault Sell-to-Admin Paper Buyback Flow', () => {
  it('validates paper contribution payload from student', () => {
    const validContribution = {
      courseId: '22222222-2222-2222-2222-222222222222',
      examType: 'FINAL',
      academicYear: 2023,
      examDate: '2023-06-15',
      declarationAccepted: true,
      payoutPaymentMethod: 'TELEBIRR',
      payoutAccount: '0900 000 042',
      proposedPayoutEtb: 100,
      studentNotes: 'Complete final exam questions with clear legible handwriting.',
    };

    const result = paperContributionSchema.safeParse(validContribution);
    expect(result.success).toBe(true);
  });

  it('rejects uploads with forbidden MIME types (e.g. executables or zip archives)', () => {
    const exeCheck = validateUploadFile('application/x-msdownload', 1024 * 1024);
    expect(exeCheck.valid).toBe(false);
    expect(exeCheck.error).toContain('Only PDF, JPG, and PNG');

    const zipCheck = validateUploadFile('application/zip', 1024 * 1024);
    expect(zipCheck.valid).toBe(false);
  });

  it('rejects files exceeding the maximum configured size limit', () => {
    // 25 MB exceeds the 20 MB limit
    const oversizeCheck = validateUploadFile('application/pdf', 25 * 1024 * 1024, 20);
    expect(oversizeCheck.valid).toBe(false);
    expect(oversizeCheck.error).toContain('exceeds the maximum');

    // 5 MB is accepted
    const validCheck = validateUploadFile('application/pdf', 5 * 1024 * 1024, 20);
    expect(validCheck.valid).toBe(true);
  });

  it('validates admin buyout approval and payout settlement', () => {
    const adminReviewPayload = {
      contributionId: '33333333-3333-3333-3333-333333333333',
      decision: 'APPROVE',
      approvedPayoutEtb: 80,
      payoutTxId: 'TB_PAYOUT_9182',
      publishDirectly: true,
      scanQuality: 'EXCELLENT',
    };

    const result = contributionReviewSchema.safeParse(adminReviewPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.approvedPayoutEtb).toBe(80);
      expect(result.data.payoutTxId).toBe('TB_PAYOUT_9182');
    }
  });
});
