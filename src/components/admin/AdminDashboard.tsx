import { useState, useEffect } from 'react';
import { Card, Heading, Badge, Button, Icon, PageHead, type Screen } from '../../App';
import { api } from '../../lib/api';
import type { StorePayment } from '../../lib/store';
import type { UserSession } from '../../types';

export default function AdminDashboard({
  go,
  currentUser,
  pendingPayments,
  onReviewPayment,
  onOpenCoverage,
}: {
  go: (s: Screen) => void;
  currentUser: UserSession;
  pendingPayments: StorePayment[];
  onReviewPayment: (p: StorePayment) => void;
  onOpenCoverage: () => void;
}) {
  const [overview, setOverview] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = async () => {
    try {
      const data = await api.getAdminOverview(currentUser.userId, currentUser.role);
      setOverview(data);
    } catch (err: any) {
      console.error('Failed to fetch admin overview:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [currentUser, pendingPayments.length]);

  const revenueDisplay = overview?.revenueEtb !== undefined ? Number(overview.revenueEtb).toLocaleString() : '—';
  const activeStudents = overview?.activeStudentsCount !== undefined ? overview.activeStudentsCount : '—';
  const pendingCount = overview?.pendingPaymentsCount !== undefined ? overview.pendingPaymentsCount : pendingPayments.length;
  const publishedPapers = overview?.publishedPapersCount !== undefined ? overview.publishedPapersCount : '—';

  const topCourses = overview?.topCourses || [];
  const recentActivity = overview?.recentActivity || [];
  const coverageSummary = overview?.coverageSummary || { percentage: 0, coveredSlots: 0, totalSlots: 33 };

  return (
    <>
      <PageHead
        eyebrow="AMBO UNIVERSITY"
        title="Admin Overview"
        text="Real-time operational metrics across payments, student access, past papers, and security events."
        action={
          currentUser.role !== 'PAYMENT_VERIFIER' && (
            <Button icon="plus" onClick={() => go('papers')}>
              Upload papers
            </Button>
          )
        }
      />

      {/* Real Metrics Grid */}
      <div className="admin-metrics">
        {[
          { label: 'Revenue', value: `${revenueDisplay} ETB`, detail: 'Verified semester unlocks', icon: 'card', colorIdx: 0 },
          { label: 'Active students', value: `${activeStudents}`, detail: 'Registered freshman accounts', icon: 'users', colorIdx: 1 },
          { label: 'Pending payments', value: `${pendingCount}`, detail: 'Awaiting receipt review', icon: 'clock', colorIdx: 2 },
          { label: 'Published papers', value: `${publishedPapers}`, detail: 'In active freshman catalog', icon: 'file', colorIdx: 3 },
        ].map(m => (
          <Card key={m.label}>
            <span className={`stat-icon color-${m.colorIdx}`}><Icon name={m.icon as any} /></span>
            <div>
              <small>{m.label}</small>
              <strong>{m.value}</strong>
              <p>{m.detail}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="admin-grid">
        {/* Top Courses by Views */}
        <Card className="chart-card">
          <div className="table-head">
            <div>
              <Heading level={2}>Top Courses by Student Views</Heading>
              <p>Ranked by verified, watermarked student viewing sessions</p>
            </div>
            <Button variant="ghost" onClick={() => go('structure')}>
              Curriculum tree <Icon name="arrow" size={14} />
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
            {topCourses.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No paper views logged yet.</p>
            ) : (
              topCourses.slice(0, 5).map((c: any) => {
                const maxViews = Math.max(...topCourses.map((x: any) => x.viewsCount || 1), 1);
                const percent = Math.round(((c.viewsCount || 0) / maxViews) * 100);

                return (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 650, color: 'var(--ink)' }}>
                        {c.code} — <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{c.title}</span>
                      </span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{c.papersCount || 0} papers</span>
                        <Badge tone="accent">{c.viewsCount || 0} views</Badge>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--canvas)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(percent, 6)}%`, height: '100%', background: 'var(--accent)', borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Real Recent Activity from Audit Logs */}
        <Card className="activity-card">
          <div className="table-head">
            <div>
              <Heading level={2}>Recent Audit Activity</Heading>
              <p>Cryptographic record of actions</p>
            </div>
            <Button variant="ghost" onClick={() => go('audit')}>
              View all
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            {recentActivity.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No recent activity records.</p>
            ) : (
              recentActivity.slice(0, 5).map((a: any) => {
                const who = a.actor?.fullName || a.actorName || 'System Automated';
                const role = a.actor?.role || a.actorRole || 'SYSTEM';
                const what = a.action || 'System Activity';

                let detailsObj: any = {};
                if (typeof a.details === 'object' && a.details !== null) {
                  detailsObj = a.details;
                } else if (typeof a.details === 'string') {
                  try { detailsObj = JSON.parse(a.details); } catch { detailsObj = {}; }
                }

                let itemLabel = '';
                if (detailsObj.referenceCode) {
                  itemLabel = `Payment #${detailsObj.referenceCode}`;
                } else if (detailsObj.courseCode || detailsObj.title) {
                  itemLabel = [detailsObj.courseCode, detailsObj.title].filter(Boolean).join(' · ');
                } else if (detailsObj.studentId || detailsObj.fullName) {
                  itemLabel = [detailsObj.fullName, detailsObj.studentId].filter(Boolean).join(' · ');
                } else if (detailsObj.code) {
                  itemLabel = `Course: ${detailsObj.code}`;
                } else if (detailsObj.key) {
                  itemLabel = `Setting: ${detailsObj.key}`;
                } else if (a.entityType) {
                  itemLabel = `${a.entityType}${a.entityId ? ` #${a.entityId.slice(0, 8)}` : ''}`;
                } else {
                  itemLabel = 'System Record';
                }

                return (
                  <div className="activity-item" key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span className="stat-icon" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                      <Icon name="activity" size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                        <strong style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>{what}</strong>
                        <time style={{ fontSize: '0.75rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        <small style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{who}</small>
                        <Badge tone={role === 'ADMIN' || role === 'SUPER_ADMIN' ? 'accent' : 'neutral'}>
                          {role}
                        </Badge>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)', background: 'var(--canvas)', border: '1px solid var(--line)', padding: '1px 8px', borderRadius: '4px' }}>
                          {itemLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <div className="admin-grid lower">
        {/* Pending Payments Queue preview */}
        <Card className="pending-list">
          <div className="table-head">
            <div>
              <Heading level={2}>Pending Payment Verifications</Heading>
              <p>{pendingCount} payments waiting for receipt review</p>
            </div>
            {currentUser.role !== 'CONTENT_MANAGER' && (
              <Button variant="ghost" onClick={() => go('admin-payments')}>
                Verification queue <Icon name="arrow" />
              </Button>
            )}
          </div>

          {pendingPayments.length === 0 ? (
            <p style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>
              No payments currently waiting for verification. All clear!
            </p>
          ) : (
            pendingPayments.slice(0, 3).map(r => (
              <div className="pending-row" key={r.id}>
                <span className="mini-avatar">{r.studentName.slice(0, 2).toUpperCase()}</span>
                <span>
                  <strong>{r.studentName}</strong>
                  <small>{r.streamName} · Y{r.academicYearNumber} S{r.semesterNumber}</small>
                </span>
                <span>
                  {r.paymentMethod.replace('_', ' ')}
                  <small>{r.submittedAt}</small>
                </span>
                <strong>{r.amountEtb} ETB</strong>
                {currentUser.role !== 'CONTENT_MANAGER' && (
                  <Button variant="secondary" onClick={() => onReviewPayment(r)}>
                    Review
                  </Button>
                )}
              </div>
            ))
          )}
        </Card>

        {/* Freshman Coverage Matrix Card */}
        <Card>
          <div className="table-head">
            <div>
              <Heading level={2}>Freshman Library Coverage</Heading>
              <p>11 courses across Mid, Final & Quiz</p>
            </div>
            <Badge tone={coverageSummary.percentage >= 70 ? 'success' : 'warning'}>
              {coverageSummary.percentage}% complete
            </Badge>
          </div>

          <div className="coverage" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                <strong>Freshman 11 Courses</strong>
                <small style={{ display: 'block', color: 'var(--muted)' }}>
                  {coverageSummary.coveredSlots} of {coverageSummary.totalSlots} exam slots covered
                </small>
              </span>
              <strong style={{ fontSize: '1.1rem', color: 'var(--accent)' }}>
                {coverageSummary.percentage}%
              </strong>
            </div>

            <div style={{ width: '100%', height: '10px', background: 'var(--canvas)', borderRadius: '6px', overflow: 'hidden', margin: '10px 0 16px' }}>
              <div style={{ width: `${coverageSummary.percentage}%`, height: '100%', background: 'var(--accent)', borderRadius: '6px' }} />
            </div>

            <Button
              className="full"
              variant="secondary"
              icon="layers"
              onClick={onOpenCoverage}
            >
              Open 11-Course Coverage Matrix
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
