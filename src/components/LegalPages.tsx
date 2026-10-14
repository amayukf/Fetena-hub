import { useState } from 'react';
import { Card, Heading, Button, Icon, Input, Badge, type Screen } from '../App';
import { api } from '../lib/api';

export function TermsPage({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="legal-page-container" style={{ maxWidth: '840px', margin: '0 auto', padding: '32px 16px' }}>
      <button className="back-link" onClick={() => go('landing')} style={{ marginBottom: '16px' }}>
        ← Back to home
      </button>
      <Card style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Badge tone="accent">OFFICIAL POLICY</Badge>
          <Heading level={1} style={{ marginTop: '8px' }}>Terms of Service</Heading>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            ExamVault · Ambo University, Woliso Campus · Effective Academic Year 2026
          </p>
        </div>

        <div className="legal-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: 1.6 }}>
          <section>
            <Heading level={3}>1. Purpose of the Platform</Heading>
            <p>
              ExamVault is an educational archive operated for verified undergraduate students of Ambo University, Woliso Campus.
              The service provides curated access to past historical mid-term exams, final exams, and quizzes to assist in structured course preparation.
            </p>
          </section>

          <section>
            <Heading level={3}>2. Account Access & One-Time Semester Entitlement</Heading>
            <p>
              Access to freshman semester past examination papers is granted upon payment of the designated semester fee (50 ETB) and manual receipt verification by campus verifiers.
              Each entitlement is personal to the registered student and non-transferable.
            </p>
          </section>

          <section>
            <Heading level={3}>3. Dynamic Watermarking & Anti-Redistribution</Heading>
            <p>
              To protect academic integrity and trace unauthorized distribution, every examination page rendered in the viewer is embedded with a persistent, dynamic cryptographic watermark containing the student's legal name, university student ID, and access timestamp.
              Redistributing, screen-capturing for commercial resale, or circumventing viewer protections results in immediate account revocation without refund.
            </p>
          </section>

          <section>
            <Heading level={3}>4. Student Paper Contributions (Sell-to-Admin)</Heading>
            <p>
              Students may submit authentic past examination scripts administered in past semesters. Submissions must satisfy all three mandatory honor declarations:
              (a) the paper was administered in a past semester; (b) the uploader is authorized to contribute the physical copy; and (c) the scans are unaltered.
              Unadministered, confidential, or future examination materials are strictly prohibited.
            </p>
          </section>

          <section>
            <Heading level={3}>5. Payment Verification and Disputed Transactions</Heading>
            <p>
              All payments through Telebirr, CBE Birr, or Commercial Bank of Ethiopia (CBE) are cross-referenced with bank statement transaction IDs.
              Submitting forged receipts, reused reference numbers, or invalid screenshots will result in immediate rejection and potential campus disciplinary review.
            </p>
          </section>
        </div>

        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
          <Button onClick={() => go('landing')}>Return to Home</Button>
        </div>
      </Card>
    </div>
  );
}

export function PrivacyPage({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="legal-page-container" style={{ maxWidth: '840px', margin: '0 auto', padding: '32px 16px' }}>
      <button className="back-link" onClick={() => go('landing')} style={{ marginBottom: '16px' }}>
        ← Back to home
      </button>
      <Card style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Badge tone="success">DATA PROTECTION</Badge>
          <Heading level={1} style={{ marginTop: '8px' }}>Privacy Policy</Heading>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            How ExamVault handles student data at Ambo University Woliso Campus
          </p>
        </div>

        <div className="legal-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px', lineHeight: 1.6 }}>
          <section>
            <Heading level={3}>1. Information We Collect</Heading>
            <p>
              We collect only the minimum information necessary to authenticate students, verify payments, and log document access:
            </p>
            <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
              <li>Full legal name and University Student Identification Number (Student ID).</li>
              <li>Phone number or email address used during registration.</li>
              <li>Academic program and curriculum stream (Natural Science or Social Science).</li>
              <li>Payment proof (mobile money reference ID and transaction screenshot).</li>
              <li>Audit logs recording device IP address, browser type, and timestamps of viewed papers.</li>
            </ul>
          </section>

          <section>
            <Heading level={3}>2. How Your Data is Used</Heading>
            <p>
              Your personal data is used solely to provide educational access, render personalized security watermarks, and prevent multi-device credential abuse.
              We never sell or share student data with commercial third-party advertisers.
            </p>
          </section>

          <section>
            <Heading level={3}>3. Private Storage & Document Security</Heading>
            <p>
              All examination PDF files and contributor uploads are stored in an encrypted, private storage vault with quarantine and published tiers.
              Public static file links do not exist; files are streamed securely through single-use, time-expiring tickets (60-second validity).
            </p>
          </section>

          <section>
            <Heading level={3}>4. Data Retention</Heading>
            <p>
              Audit records and paper view logs are stored in immutable, append-only logs for the duration of the academic year.
              Payment screenshots are retained during verification and archived securely.
            </p>
          </section>
        </div>

        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
          <Button onClick={() => go('landing')}>Return to Home</Button>
        </div>
      </Card>
    </div>
  );
}

export function ContactPage({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="legal-page-container" style={{ maxWidth: '840px', margin: '0 auto', padding: '32px 16px' }}>
      <button className="back-link" onClick={() => go('landing')} style={{ marginBottom: '16px' }}>
        ← Back to home
      </button>
      <Card style={{ padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Badge tone="accent">SUPPORT & DESK</Badge>
          <Heading level={1} style={{ marginTop: '8px' }}>Contact & Help Desk</Heading>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Ambo University · Woliso Campus Examination Services
          </p>
        </div>

        <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', background: 'var(--canvas)', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--primary)', marginBottom: '8px' }}><Icon name="user" size={24}/></div>
            <strong>Woliso Campus Academic Desk</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '4px 0 0' }}>
              Faculty Building 2, Ground Floor<br/>
              Woliso, Oromia, Ethiopia
            </p>
          </div>

          <div style={{ padding: '16px', background: 'var(--canvas)', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--primary)', marginBottom: '8px' }}><Icon name="card" size={24}/></div>
            <strong>Payment & Verification Help</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '4px 0 0' }}>
              Telebirr & CBE Payment Issues<br/>
              Verification SLA: 15–30 minutes
            </p>
          </div>

          <div style={{ padding: '16px', background: 'var(--canvas)', borderRadius: '8px', border: '1px solid var(--line)' }}>
            <div style={{ color: 'var(--primary)', marginBottom: '8px' }}><Icon name="help" size={24}/></div>
            <strong>Telegram & Digital Support</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '4px 0 0' }}>
              Telegram: @ExamVaultWoliso<br/>
              Email: support@examvault.edu.et
            </p>
          </div>
        </div>

        <Heading level={3} style={{ marginBottom: '8px' }}>Frequently Asked Questions</Heading>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <details style={{ background: 'var(--canvas)', padding: '12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}>My payment is approved, but courses still look locked?</summary>
            <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
              Click your avatar in the top right to refresh your session, or log out and log back in. Your entitlement will automatically sync.
            </p>
          </details>
          <details style={{ background: 'var(--canvas)', padding: '12px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <summary style={{ fontWeight: 600, cursor: 'pointer' }}>Can I download papers as offline PDF files?</summary>
            <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
              To prevent commercial resale and uphold academic fairness, papers are viewed exclusively through the secure, dynamically watermarked reader.
            </p>
          </details>
        </div>

        <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--line)' }}>
          <Button onClick={() => go('landing')}>Return to Home</Button>
        </div>
      </Card>
    </div>
  );
}

export function ForbiddenPage({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="standalone-state" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ maxWidth: '500px', textAlign: 'center', padding: '36px' }}>
        <span className="state-icon rejected" style={{ margin: '0 auto 16px' }}>
          <Icon name="shield" size={40} />
        </span>
        <Badge tone="danger">403 · ACCESS FORBIDDEN</Badge>
        <Heading level={1} style={{ margin: '12px 0 8px' }}>Permission Denied</Heading>
        <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>
          You do not have administrative or role-based clearance to access this resource. All unauthorized access attempts are cryptographically logged to the system audit trail.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Button onClick={() => go('dashboard')}>Go to Dashboard</Button>
          <Button variant="secondary" onClick={() => go('landing')}>Return Home</Button>
        </div>
      </Card>
    </div>
  );
}

export function NotFoundPage({ go }: { go: (s: Screen) => void }) {
  return (
    <div className="standalone-state" style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ maxWidth: '500px', textAlign: 'center', padding: '36px' }}>
        <span className="state-icon muted" style={{ margin: '0 auto 16px', background: 'var(--line)' }}>
          <Icon name="search" size={40} />
        </span>
        <Badge tone="neutral">404 · NOT FOUND</Badge>
        <Heading level={1} style={{ margin: '12px 0 8px' }}>Page Not Found</Heading>
        <p style={{ color: 'var(--muted)', marginBottom: '24px' }}>
          The page or exam collection you requested does not exist or has been moved in the Ambo University library catalog.
        </p>
        <Button onClick={() => go('landing')}>Return to Home</Button>
      </Card>
    </div>
  );
}

export function ForcePasswordChangeModal({
  onPasswordChanged,
}: {
  onPasswordChanged: () => void;
}) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.changePassword({ newPassword });
      onPasswordChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <Badge tone="warning">ACTION REQUIRED</Badge>
            <Heading level={2} style={{ marginTop: '6px' }}>Change Initial Password</Heading>
          </div>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 16px' }}>
            You are logging in with an initial temporary password. For campus security, you must set a new confidential password before continuing.
          </p>

          {error && (
            <div className="alert danger" style={{ marginBottom: '14px' }}>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Input
              label="New password"
              placeholder="At least 8 characters"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
            />
            <Input
              label="Confirm new password"
              placeholder="Re-enter new password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />

            <Button type="submit" disabled={loading} className="full" style={{ marginTop: '8px' }}>
              {loading ? 'Updating password...' : 'Set new password & continue'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
