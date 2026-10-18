import { useState, useEffect, useMemo } from 'react';
import { Card, Heading, Badge, Button, Icon, PageHead } from '../../App';
import { api } from '../../lib/api';
import type { UserSession, Role } from '../../types';

export default function UsersManager({
  currentUser,
}: {
  currentUser: UserSession;
}) {
  const isAdmin = currentUser.role === 'ADMIN';

  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Access history modal
  const [historyModalUser, setHistoryModalUser] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.getUsers(currentUser.userId, currentUser.role);
      setUsers(data || []);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [currentUser]);

  const handleToggleActive = async (u: any) => {
    try {
      await api.updateUser(u.id, { isActive: !u.isActive }, currentUser.userId, currentUser.role);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleToggleCanSell = async (u: any) => {
    try {
      await api.updateUser(u.id, { canSell: !u.canSell }, currentUser.userId, currentUser.role);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update selling permission');
    }
  };

  const handleChangeRole = async (u: any, newRole: Role) => {
    if (!isAdmin) {
      alert('Only administrators can change user roles.');
      return;
    }
    try {
      await api.updateUser(u.id, { role: newRole }, currentUser.userId, currentUser.role);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to change role');
    }
  };

  const handleOpenHistory = async (u: any) => {
    setHistoryModalUser(u);
    setLoadingHistory(true);
    try {
      const data = await api.getUserAccessHistory(u.id, currentUser.userId, currentUser.role);
      setHistoryData(data);
    } catch (err: any) {
      alert(err.message || 'Failed to load user access history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = (u.fullName || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchStudentId = (u.studentId || '').toLowerCase().includes(q);
        const matchPhone = (u.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchStudentId && !matchPhone) return false;
      }

      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'SUSPENDED' && u.isActive) return false;

      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  return (
    <>
      <PageHead
        eyebrow="USER MANAGEMENT & ROLES"
        title="Users & Access History"
        text="Manage student and staff roles across Ambo University, inspect student access and viewing history, and enforce security policies."
      />

      <Card className="table-card">
        {/* Search & Filters */}
        <div className="table-tools" style={{ padding: '16px 20px', gap: '12px', flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 260px' }}>
            <Icon name="search" />
            <input
              placeholder="Search by student ID, name, email, or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'white' }}
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
            >
              <option value="ALL">All Roles</option>
              <option value="STUDENT">Student</option>
              <option value="PAYMENT_VERIFIER">Payment Verifier</option>
              <option value="CONTENT_MANAGER">Content Manager</option>
              <option value="ADMIN">Administrator</option>
            </select>

            <select
              style={{ minHeight: '40px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--line)', background: 'white' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        {/* Users Table */}
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>User Details</th>
                <th>Role</th>
                <th>Program / Stream</th>
                <th>Account Status</th>
                <th>Selling Status</th>
                <th>Role Assignment</th>
                <th>History & Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                    No users found matching the search criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="mini-avatar">
                          {(u.fullName || 'User').slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>{u.fullName}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                            {u.studentId ? `ID: ${u.studentId}` : u.email || u.phone || 'Campus Staff'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge
                        tone={
                          u.role === 'ADMIN'
                            ? 'accent'
                            : u.role === 'CONTENT_MANAGER'
                            ? 'neutral'
                            : u.role === 'PAYMENT_VERIFIER'
                            ? 'warning'
                            : 'success'
                        }
                      >
                        {u.role.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem' }}>
                        {u.program?.name || (u.role === 'STUDENT' ? 'Freshman' : 'Campus Staff')}
                      </span>
                    </td>
                    <td>
                      <Badge tone={u.isActive ? 'success' : 'danger'}>
                        {u.isActive ? 'ACTIVE' : 'SUSPENDED'}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={u.canSell !== false ? 'success' : 'warning'}>
                        {u.canSell !== false ? 'Can Sell' : 'Selling Blocked'}
                      </Badge>
                    </td>
                    <td>
                      {isAdmin ? (
                        <select
                          value={u.role}
                          onChange={e => handleChangeRole(u, e.target.value as Role)}
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 650,
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--line)',
                            background: 'white',
                          }}
                        >
                          <option value="STUDENT">STUDENT</option>
                          <option value="PAYMENT_VERIFIER">PAYMENT_VERIFIER</option>
                          <option value="CONTENT_MANAGER">CONTENT_MANAGER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      ) : (
                        <small style={{ color: 'var(--muted)' }}>{u.role} (Admin only)</small>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Button
                          variant="secondary"
                          style={{ minHeight: '32px', padding: '0 8px', fontSize: '0.78rem' }}
                          onClick={() => handleOpenHistory(u)}
                        >
                          <Icon name="activity" size={13} /> Access History
                        </Button>

                        <Button
                          variant={u.isActive ? 'danger' : 'secondary'}
                          style={{ minHeight: '32px', padding: '0 8px', fontSize: '0.78rem' }}
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.isActive ? 'Suspend' : 'Reactivate'}
                        </Button>

                        <Button
                          variant="ghost"
                          style={{
                            minHeight: '32px',
                            padding: '0 6px',
                            fontSize: '0.75rem',
                            color: u.canSell !== false ? 'var(--warning)' : 'var(--success)',
                          }}
                          onClick={() => handleToggleCanSell(u)}
                          title={u.canSell !== false ? 'Block selling' : 'Allow selling'}
                        >
                          {u.canSell !== false ? 'Block selling' : 'Allow selling'}
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

      {/* User Access History Modal */}
      {historyModalUser && (
        <div className="modal-backdrop" onClick={() => setHistoryModalUser(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">AUDIT & ACCESS RECORD</span>
                <Heading level={2}>Access History: {historyModalUser.fullName}</Heading>
              </div>
              <Button variant="ghost" onClick={() => setHistoryModalUser(null)}>
                <Icon name="close" />
              </Button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingHistory ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--muted)' }}>
                  Loading access records...
                </div>
              ) : historyData ? (
                <>
                  {/* Profile Summary */}
                  <div className="instruction-box" style={{ margin: 0 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <span>Student ID: <b>{historyData.user?.studentId || 'N/A'}</b></span>
                      <span>Role: <b>{historyData.user?.role}</b></span>
                      <span>Stream: <b>{historyData.user?.program?.name || 'Freshman General'}</b></span>
                      <span>Account Status: <b>{historyData.user?.isActive ? 'Active' : 'Suspended'}</b></span>
                      <span>Selling Rights: <b>{historyData.user?.canSell !== false ? 'Allowed' : 'Blocked'}</b></span>
                      <span>Joined: <b>{new Date(historyData.user?.createdAt).toLocaleDateString()}</b></span>
                    </div>
                  </div>

                  {/* Active Entitlements */}
                  <div>
                    <Heading level={3} style={{ marginBottom: '8px' }}>Active Unlocked Entitlements</Heading>
                    {historyData.entitlements && historyData.entitlements.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {historyData.entitlements.map((e: any) => (
                          <div
                            key={e.id}
                            style={{
                              padding: '10px 14px',
                              background: 'var(--accent-soft)',
                              borderRadius: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div>
                              <strong>{e.programTerm?.program?.name || 'Freshman'} · Year {e.programTerm?.term?.yearNumber}, Semester {e.programTerm?.term?.semesterNumber}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>
                                Full semester courses unlocked
                              </div>
                            </div>
                            <small style={{ color: 'var(--accent)' }}>
                              Granted {new Date(e.createdAt).toLocaleDateString()}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem' }}>No unlocked term entitlements on record.</p>
                    )}
                  </div>

                  {/* Payment Transactions */}
                  <div>
                    <Heading level={3} style={{ marginBottom: '8px' }}>Payment Transactions</Heading>
                    {historyData.payments && historyData.payments.length > 0 ? (
                      <div className="responsive-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Ref Code</th>
                              <th>Method</th>
                              <th>Amount</th>
                              <th>Status</th>
                              <th>Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.payments.map((p: any) => (
                              <tr key={p.id}>
                                <td><code>{p.referenceCode}</code></td>
                                <td>{p.paymentMethod}</td>
                                <td><strong>{Number(p.amountEtb)} ETB</strong></td>
                                <td>
                                  <Badge tone={p.status === 'APPROVED' ? 'success' : p.status === 'PENDING' ? 'warning' : 'danger'}>
                                    {p.status}
                                  </Badge>
                                </td>
                                <td><small>{new Date(p.createdAt).toLocaleDateString()}</small></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem' }}>No payment submissions on record.</p>
                    )}
                  </div>

                  {/* Paper View Logs */}
                  <div>
                    <Heading level={3} style={{ marginBottom: '8px' }}>Paper View Logs (Device & IP Audit)</Heading>
                    {historyData.viewLogs && historyData.viewLogs.length > 0 ? (
                      <div className="responsive-table">
                        <table>
                          <thead>
                            <tr>
                              <th>Exam Paper</th>
                              <th>Timestamp</th>
                              <th>Client IP Address</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyData.viewLogs.map((v: any) => (
                              <tr key={v.id}>
                                <td>
                                  <strong>{v.paper?.title || 'Exam Paper'}</strong>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                                    {v.paper?.course?.code} · {v.paper?.examType}
                                  </div>
                                </td>
                                <td><small>{new Date(v.viewedAt).toLocaleString()}</small></td>
                                <td><code>{v.ipAddress || '197.156.102.10'}</code></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p style={{ fontSize: '0.85rem' }}>No watermarked paper views logged yet.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="modal-footer">
              <Button variant="secondary" onClick={() => setHistoryModalUser(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
