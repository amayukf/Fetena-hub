import { useState } from 'react';
import { Card, Heading, Button, PageHead, Input } from '../../App';
import type { SystemSettingsState } from '../../lib/store';
import type { UserSession } from '../../types';

export default function SettingsManager({
  settings,
  currentUser,
  onSaveSettings,
}: {
  settings: SystemSettingsState;
  currentUser: UserSession;
  onSaveSettings: (s: SystemSettingsState) => void;
}) {
  const [activeSection, setActiveSection] = useState<'pricing' | 'accounts' | 'instructions' | 'announcement' | 'limits'>('pricing');

  // Form states
  const [price, setPrice] = useState(settings.semesterPriceEtb);
  const [telebirrPhone, setTelebirrPhone] = useState(settings.telebirrPhone);
  const [telebirrRecipient, setTelebirrRecipient] = useState(settings.telebirrRecipientName);
  const [cbeAccount, setCbeAccount] = useState(settings.cbeAccountNumber);
  const [cbeRecipient, setCbeRecipient] = useState(settings.cbeRecipientName);
  const [instructions, setInstructions] = useState(settings.paymentInstructions);
  const [bannerText, setBannerText] = useState(settings.announcementBanner);
  const [bannerActive, setBannerActive] = useState(settings.announcementActive);
  const [maxUploadMb, setMaxUploadMb] = useState(settings.maxUploadSizeMb);
  const [maxPayoutEtb, setMaxPayoutEtb] = useState(settings.maxPayoutLimitEtb);
  const [slaHours, setSlaHours] = useState(settings.paymentVerificationSlaHours);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated: SystemSettingsState = {
        ...settings,
        semesterPriceEtb: price,
        telebirrPhone,
        telebirrRecipientName: telebirrRecipient,
        cbeAccountNumber: cbeAccount,
        cbeRecipientName: cbeRecipient,
        paymentInstructions: instructions,
        announcementBanner: bannerText,
        announcementActive: bannerActive,
        maxUploadSizeMb: maxUploadMb,
        maxPayoutLimitEtb: maxPayoutEtb,
        paymentVerificationSlaHours: slaHours,
      };
      await onSaveSettings(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="PLATFORM CONFIGURATION"
        title="Platform & Security Settings"
        text="Manage campus unlock fees, payment receiving accounts, checkout instructions, announcement banners, and security ingestion limits."
      />

      <div className="settings-grid admin-settings">
        {/* Navigation Tabs */}
        <nav className="settings-nav">
          <button
            className={activeSection === 'pricing' ? 'active' : ''}
            onClick={() => setActiveSection('pricing')}
          >
            Semester Pricing
          </button>
          <button
            className={activeSection === 'accounts' ? 'active' : ''}
            onClick={() => setActiveSection('accounts')}
          >
            Payment Accounts
          </button>
          <button
            className={activeSection === 'instructions' ? 'active' : ''}
            onClick={() => setActiveSection('instructions')}
          >
            Payment Instructions
          </button>
          <button
            className={activeSection === 'announcement' ? 'active' : ''}
            onClick={() => setActiveSection('announcement')}
          >
            Announcement Banner
          </button>
          <button
            className={activeSection === 'limits' ? 'active' : ''}
            onClick={() => setActiveSection('limits')}
          >
            Upload & Payout Limits
          </button>
        </nav>

        <div>
          {/* Pricing Section */}
          {activeSection === 'pricing' && (
            <Card className="form-card">
              <Heading level={2}>Semester Unlock Pricing</Heading>
              <p>Set the flat fee students pay to unlock all courses in their freshman stream for Year 1 Semester 1.</p>

              <div style={{ maxWidth: '320px', margin: '14px 0' }}>
                <Input
                  label="Price per Semester (ETB)"
                  placeholder="50"
                  type="number"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                />
              </div>

              <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>Standardized Campus Pricing</strong>
                  <p style={{ fontSize: '0.8rem' }}>Enforces the uniform 50 ETB fee across both Natural Science and Social Science streams at Ambo University.</p>
                </div>
                <label className="switch"><input type="checkbox" defaultChecked disabled /><span /></label>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Pricing'}
              </Button>
            </Card>
          )}

          {/* Payment Accounts Section */}
          {activeSection === 'accounts' && (
            <Card className="form-card">
              <Heading level={2}>Payment Receiver Accounts</Heading>
              <p>Official bank and mobile money accounts students send transfers to during checkout.</p>

              <div className="form-grid" style={{ margin: '16px 0' }}>
                <Input
                  label="Telebirr Phone Number"
                  placeholder="0900 000 000"
                  value={telebirrPhone}
                  onChange={e => setTelebirrPhone(e.target.value)}
                />
                <Input
                  label="Telebirr Recipient Name"
                  placeholder="Ambo University"
                  value={telebirrRecipient}
                  onChange={e => setTelebirrRecipient(e.target.value)}
                />
              </div>

              <div className="form-grid" style={{ margin: '0 0 16px 0' }}>
                <Input
                  label="Commercial Bank of Ethiopia (CBE) Account"
                  placeholder="1000 0000 0000 0"
                  value={cbeAccount}
                  onChange={e => setCbeAccount(e.target.value)}
                />
                <Input
                  label="CBE Recipient / Branch Name"
                  placeholder="Ambo University"
                  value={cbeRecipient}
                  onChange={e => setCbeRecipient(e.target.value)}
                />
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Payment Accounts'}
              </Button>
            </Card>
          )}

          {/* Payment Instructions Section */}
          {activeSection === 'instructions' && (
            <Card className="form-card">
              <Heading level={2}>Checkout Payment Instructions</Heading>
              <p>Step-by-step guidance displayed to students on the payment checkout screen.</p>

              <label className="field" style={{ margin: '14px 0' }}>
                <span>Student Instructions Text</span>
                <textarea
                  rows={4}
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="Transfer the exact semester unlock fee using Telebirr or CBE Birr..."
                />
              </label>

              <div className="alert info" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', marginBottom: '16px' }}>
                <small>
                  Tip: Remind students to include their Student ID in the transaction note or description to speed up verification.
                </small>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Instructions'}
              </Button>
            </Card>
          )}

          {/* Announcement Banner Section */}
          {activeSection === 'announcement' && (
            <Card className="form-card">
              <Heading level={2}>Platform Announcement Banner</Heading>
              <p>Top banner shown to all logged-in students across Ambo University.</p>

              <label className="field" style={{ margin: '14px 0' }}>
                <span>Announcement Text</span>
                <textarea
                  rows={3}
                  value={bannerText}
                  onChange={e => setBannerText(e.target.value)}
                  placeholder="e.g. Final Exam prep week! All freshman papers for 2015 E.C. are updated."
                />
              </label>

              <div className="setting-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', marginBottom: '16px' }}>
                <div>
                  <strong style={{ fontSize: '0.9rem' }}>Banner Active & Visible</strong>
                  <p style={{ fontSize: '0.8rem' }}>Toggle whether the announcement banner is currently displayed.</p>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={bannerActive}
                    onChange={e => setBannerActive(e.target.checked)}
                  />
                  <span />
                </label>
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Announcement'}
              </Button>
            </Card>
          )}

          {/* Limits Section */}
          {activeSection === 'limits' && (
            <Card className="form-card">
              <Heading level={2}>Security, Upload & Payout Limits</Heading>
              <p>Enforce file size boundaries, payout caps, and verifier service level agreements.</p>

              <div className="form-grid" style={{ margin: '16px 0' }}>
                <Input
                  label="Max File Upload Size (MB)"
                  placeholder="20"
                  type="number"
                  value={maxUploadMb}
                  onChange={e => setMaxUploadMb(e.target.value)}
                />
                <Input
                  label="Max Single Buyout Payout (ETB)"
                  placeholder="300"
                  type="number"
                  value={maxPayoutEtb}
                  onChange={e => setMaxPayoutEtb(e.target.value)}
                />
              </div>

              <div style={{ maxWidth: '320px', marginBottom: '16px' }}>
                <Input
                  label="Payment Verification SLA (Hours)"
                  placeholder="2"
                  type="number"
                  value={slaHours}
                  onChange={e => setSlaHours(e.target.value)}
                />
              </div>

              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Limits'}
              </Button>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
