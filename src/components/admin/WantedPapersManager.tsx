import { useState, useEffect } from 'react';
import { Card, Heading, Badge, Button, Icon, PageHead, Input, Select } from '../../App';
import { api } from '../../lib/api';
import type { FreshmanCourseItem, StoreWantedPaper } from '../../lib/store';
import type { UserSession, ExamType } from '../../types';

export default function WantedPapersManager({
  currentUser,
  courses,
  wantedPapers,
  onRefresh,
  prefilledWanted,
  onClearPrefill,
}: {
  currentUser: UserSession;
  courses: FreshmanCourseItem[];
  wantedPapers: StoreWantedPaper[];
  onRefresh: () => void;
  prefilledWanted?: { courseId: string; courseCode: string; examType: ExamType } | null;
  onClearPrefill?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id || '');
  const [examType, setExamType] = useState<ExamType>('MID');
  const [offeredPrice, setOfferedPrice] = useState('100');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');

  // React to prefilled request from coverage matrix
  useEffect(() => {
    if (prefilledWanted) {
      setCourseId(prefilledWanted.courseId);
      setExamType(prefilledWanted.examType);
      setOfferedPrice('120');
      setNotes(`Wanted: ${prefilledWanted.courseCode} ${prefilledWanted.examType} Exam scan from 2015-2016 E.C.`);
      setModalOpen(true);
    }
  }, [prefilledWanted]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createWantedPaper(
        {
          courseId,
          examType,
          offeredPriceEtb: Number(offeredPrice) || 100,
          notes,
        },
        currentUser.userId,
        currentUser.role
      );
      setModalOpen(false);
      setNotes('');
      if (onClearPrefill) onClearPrefill();
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to create wanted paper bounty');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (item: StoreWantedPaper) => {
    try {
      await api.updateWantedPaper(
        item.id,
        { isOpen: !item.isOpen },
        currentUser.userId,
        currentUser.role
      );
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const handleDelete = async (item: StoreWantedPaper) => {
    if (!confirm(`Delete bounty for ${item.courseCode} ${item.examType}?`)) return;
    try {
      await api.deleteWantedPaper(item.id, currentUser.userId, currentUser.role);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete wanted paper');
    }
  };

  const filtered = wantedPapers.filter(w => {
    if (statusFilter === 'OPEN') return w.isOpen;
    if (statusFilter === 'CLOSED') return !w.isOpen;
    return true;
  });

  return (
    <>
      <PageHead
        eyebrow="ACQUISITIONS & BOUNTIES"
        title="Wanted Exam Papers Manager"
        text="Publish exam paper bounties offering ETB cash rewards to students who hold and digitize missing exams."
        action={
          <Button icon="plus" onClick={() => setModalOpen(true)}>
            Create wanted paper bounty
          </Button>
        }
      />

      <Card className="table-card">
        <div className="table-tools" style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--ink-2)' }}>Filter:</span>
            {(['ALL', 'OPEN', 'CLOSED'] as const).map(s => (
              <button
                key={s}
                className={`btn btn-${statusFilter === s ? 'primary' : 'secondary'}`}
                style={{ minHeight: '34px', padding: '0 12px', fontSize: '0.8rem' }}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'ALL' ? 'All Bounties' : s === 'OPEN' ? 'Open (Active)' : 'Closed'}
              </button>
            ))}
          </div>
        </div>

        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Freshman Course</th>
                <th>Exam Type</th>
                <th>Offered Cash Bounty</th>
                <th>Status</th>
                <th>Acquisition Criteria / Notes</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No wanted paper bounties found. Click "Create wanted paper bounty" or pick a missing slot in the Coverage Matrix.
                  </td>
                </tr>
              ) : (
                filtered.map(w => (
                  <tr key={w.id}>
                    <td>
                      <div>
                        <strong>{w.courseCode}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{w.courseTitle}</div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={w.examType === 'FINAL' ? 'accent' : w.examType === 'MID' ? 'neutral' : 'warning'}>
                        {w.examType} EXAM
                      </Badge>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--accent)', fontSize: '0.95rem' }}>
                        {w.offeredPriceEtb} ETB
                      </strong>
                    </td>
                    <td>
                      <Badge tone={w.isOpen ? 'success' : 'neutral'}>
                        {w.isOpen ? 'OPEN' : 'CLOSED'}
                      </Badge>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--ink-2)' }}>
                        {w.notes || '—'}
                      </span>
                    </td>
                    <td>
                      <small style={{ color: 'var(--muted)' }}>{w.createdAt}</small>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          variant="secondary"
                          style={{ minHeight: '34px', padding: '0 10px', fontSize: '0.8rem' }}
                          onClick={() => handleToggleStatus(w)}
                        >
                          {w.isOpen ? 'Close' : 'Re-open'}
                        </Button>
                        <Button
                          variant="ghost"
                          style={{ minHeight: '34px', padding: '0 8px', color: 'var(--danger)' }}
                          onClick={() => handleDelete(w)}
                        >
                          <Icon name="close" size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Wanted Paper Modal */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => { setModalOpen(false); if (onClearPrefill) onClearPrefill(); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">EXAM ACQUISITION</span>
                <Heading level={2}>Create Wanted Paper Bounty</Heading>
              </div>
              <Button variant="ghost" onClick={() => { setModalOpen(false); if (onClearPrefill) onClearPrefill(); }}>
                <Icon name="close" />
              </Button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <Select label="Target Freshman Course" value={courseId} onChange={e => setCourseId(e.target.value)}>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title} ({c.isShared ? 'Shared' : c.streamScope === 'NAT_SCI' ? 'Nat Sci' : 'Soc Sci'})
                    </option>
                  ))}
                </Select>

                <div className="form-grid">
                  <Select label="Exam Type" value={examType} onChange={e => setExamType(e.target.value as ExamType)}>
                    <option value="MID">Mid Exam</option>
                    <option value="FINAL">Final Exam</option>
                    <option value="QUIZ">Quiz</option>
                  </Select>

                  <Input
                    label="Offered Cash Bounty (ETB)"
                    placeholder="120"
                    type="number"
                    value={offeredPrice}
                    onChange={e => setOfferedPrice(e.target.value)}
                  />
                </div>

                <label className="field">
                  <span>Acquisition Criteria / Notes</span>
                  <textarea
                    placeholder="e.g. 2015 or 2016 E.C. exam. Clear photographs or scanned PDF. Answer key preferred."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </label>

                <div className="alert info" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  <Icon name="shield" size={18} />
                  <small>
                    This bounty will be listed for students under Sell-to-Admin requests, allowing students with physical papers to submit and claim the ETB payout.
                  </small>
                </div>
              </div>

              <div className="modal-footer">
                <Button variant="secondary" onClick={() => { setModalOpen(false); if (onClearPrefill) onClearPrefill(); }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Publish Bounty'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
