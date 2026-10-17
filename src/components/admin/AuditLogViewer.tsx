import { useState, useEffect } from 'react';
import { Card, Heading, Badge, Button, Icon, PageHead } from '../../App';
import { api } from '../../lib/api';

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [riskLevel, setRiskLevel] = useState('ALL');
  const [entityType, setEntityType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLogs({
        search: search.trim() || undefined,
        riskLevel: riskLevel !== 'ALL' ? riskLevel : undefined,
        entityType: entityType !== 'ALL' ? entityType : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setLogs(data.logs || []);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [riskLevel, entityType, page]);

  // Handle search submit or debounce
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <>
      <PageHead
        eyebrow="SECURITY & COMPLIANCE"
        title="Activity & Audit Log"
        text="Cryptographic, tamper-evident record of all administrative actions, approvals, payouts, access grants, and security events."
      />

      <Card className="table-card">
        {/* Search & Filter Toolbar */}
        <div className="table-tools" style={{ padding: '16px 20px', gap: '12px', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1 1 280px' }}>
            <label style={{ flex: 1, margin: 0 }}>
              <Icon name="search" />
              <input
                placeholder="Search action or details (press Enter)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary" style={{ minHeight: '40px' }}>
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Risk filter buttons */}
            <span style={{ fontSize: '0.8rem', fontWeight: 650, color: 'var(--ink-2)' }}>Risk:</span>
            {(['ALL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(r => (
              <button
                key={r}
                type="button"
                className={`btn btn-${riskLevel === r ? 'primary' : 'secondary'}`}
                style={{ minHeight: '32px', padding: '0 10px', fontSize: '0.75rem' }}
                onClick={() => { setRiskLevel(r); setPage(1); }}
              >
                {r}
              </button>
            ))}

            {/* Entity Type Select */}
            <select
              style={{ minHeight: '34px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--line)', background: 'white', fontSize: '0.8rem' }}
              value={entityType}
              onChange={e => { setEntityType(e.target.value); setPage(1); }}
            >
              <option value="ALL">All Entities</option>
              <option value="PAYMENT">Payments</option>
              <option value="EXAM_PAPER">Exam Papers</option>
              <option value="USER">Users</option>
              <option value="SETTING">Settings</option>
              <option value="WANTED_PAPER">Wanted Papers</option>
            </select>
          </div>
        </div>

        {/* Read-Only Audit Table */}
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Activity / Event</th>
                <th>Performed By</th>
                <th>Entity Affected</th>
                <th>Device / IP Address</th>
                <th>Timestamp</th>
                <th>Risk Level</th>
                <th>Details Payload</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    Loading cryptographic audit records...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No audit log records found matching the filters.
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const who = log.actor?.fullName || 'System Automated';
                  const role = log.actor?.role || 'SYSTEM';
                  const what = log.action || 'System Event';

                  let d: any = {};
                  if (typeof log.details === 'object' && log.details !== null) {
                    d = log.details;
                  } else if (typeof log.details === 'string') {
                    try { d = JSON.parse(log.details); } catch { d = {}; }
                  }

                  let item = '';
                  if (d.referenceCode) {
                    item = `Payment #${d.referenceCode}`;
                  } else if (d.title || d.courseCode) {
                    item = [d.courseCode, d.title].filter(Boolean).join(' · ');
                  } else if (d.studentId || d.fullName) {
                    item = [d.fullName, d.studentId].filter(Boolean).join(' · ');
                  } else if (d.code) {
                    item = `Course: ${d.code}`;
                  } else if (d.key) {
                    item = `Setting: ${d.key}`;
                  } else if (log.entityType) {
                    item = `${log.entityType}${log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}`;
                  } else {
                    item = 'System Record';
                  }

                  const safeEntries = Object.entries(d).filter(
                    ([k]) => !['password', 'passwordhash', 'token', 'sessiontoken', 'salt', 'sessiontokenhash'].includes(k.toLowerCase())
                  );

                  return (
                    <tr key={log.id}>
                      <td>
                        <strong style={{ color: 'var(--ink)' }}>{what}</strong>
                      </td>
                      <td>
                        <div>
                          <strong>{who}</strong>
                          <div style={{ marginTop: '3px' }}>
                            <Badge tone={role === 'ADMIN' || role === 'SUPER_ADMIN' ? 'accent' : 'neutral'}>
                              {role}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--canvas)',
                            border: '1px solid var(--line)',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: 'var(--ink)',
                          }}
                        >
                          {item}
                        </span>
                      </td>
                      <td>
                        <code>{log.ipAddress || '127.0.0.1'}</code>
                      </td>
                      <td>
                        <small style={{ color: 'var(--muted)' }}>
                          {new Date(log.createdAt).toLocaleString([], {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </small>
                      </td>
                      <td>
                        <Badge
                          tone={
                            log.riskLevel === 'CRITICAL' || log.riskLevel === 'HIGH'
                              ? 'danger'
                              : log.riskLevel === 'MEDIUM'
                              ? 'warning'
                              : 'success'
                          }
                        >
                          {log.riskLevel}
                        </Badge>
                      </td>
                      <td style={{ maxWidth: '300px' }}>
                        {safeEntries.length > 0 ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {safeEntries.slice(0, 3).map(([k, v]) => (
                              <span
                                key={k}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  padding: '2px 6px',
                                  background: 'var(--canvas)',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  border: '1px solid var(--line)',
                                  color: 'var(--ink-2)',
                                }}
                              >
                                <strong>{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Standard event</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} log entries
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ minHeight: '32px', padding: '0 12px', fontSize: '0.8rem' }}
              >
                Previous
              </Button>
              <span style={{ display: 'grid', placeItems: 'center', padding: '0 8px', fontSize: '0.8rem', fontWeight: 650 }}>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ minHeight: '32px', padding: '0 12px', fontSize: '0.8rem' }}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
