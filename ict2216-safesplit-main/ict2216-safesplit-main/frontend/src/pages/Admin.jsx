import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader, CardTitle, Badge, EmptyState, Spinner } from '../components/ui/index.jsx'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { fmtTs } from '../lib/utils'
import { api } from '../services/api'

// Maps real audit_logs.action_type values (see authService.js, groupsService.js,
// adminService.js) to display metadata. Anything not listed here still
// renders fine via the fallback in AuditRow — this is presentation only.
const ACTION_META = {
  LOGIN:                          { color: 'var(--blue)',  label: 'Login' },
  LOGIN_LOCKED:                   { color: 'var(--red)',   label: 'Login (Account Locked)' },
  LOGIN_UNVERIFIED:               { color: 'var(--amber)', label: 'Login (Email Unverified)' },
  LOGOUT:                         { color: 'var(--text2)', label: 'Logout' },
  REGISTER:                       { color: 'var(--green)', label: 'User Registered' },
  EMAIL_VERIFICATION_TOKEN_ISSUED:{ color: 'var(--blue)',  label: 'Verification Email Sent' },
  EMAIL_VERIFY_ATTEMPT:           { color: 'var(--blue)',  label: 'Email Verify Attempt' },
  GROUP_CREATE:                   { color: 'var(--teal)',  label: 'Group Created' },
  GROUP_ADD_MEMBER:               { color: 'var(--teal)',  label: 'Member Added' },
  USER_SUSPENDED:                 { color: 'var(--red)',   label: 'User Suspended' },
  USER_REACTIVATED:               { color: 'var(--green)', label: 'User Reactivated' },
}

export default function Admin() {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [bannerVisible, setBannerVisible] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [suspendingId, setSuspendingId] = useState(null)

  // Filter state
  const [filterUserId, setFilterUserId] = useState('')
  const [filterActionType, setFilterActionType] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)

  const fetchLogs = useCallback(async ({ userId = '', actionType = '', from = '', to = '' } = {}) => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams()
      if (userId)     params.set('userId', userId)
      if (actionType) params.set('actionType', actionType)
      if (from)       params.set('from', from)
      if (to)         params.set('to', to)
      const data = await api(`/api/admin/audit-logs?${params.toString()}`)
      setLogs(data.logs)
    } catch (err) {
      console.error('Failed to reload logs:', err)
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [usersData, logsData] = await Promise.all([
        api('/api/admin/users'),
        api('/api/admin/audit-logs')
      ])
      setUsers(usersData.users)
      setLogs(logsData.logs)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleApplyFilters = () => {
    fetchLogs({
      userId:     filterUserId,
      actionType: filterActionType,
      from:       filterFrom,
      to:         filterTo,
    })
  }

  const handleClearFilters = () => {
    setFilterUserId('')
    setFilterActionType('')
    setFilterFrom('')
    setFilterTo('')
    fetchLogs()
  }

  useEffect(() => {
    if (isAdmin) loadData()
  }, [isAdmin, loadData])

  if (!isAdmin) {
    return (
      <EmptyState
        icon="🔒"
        title="Access Denied"
        description="You need admin privileges to view this page."
        action={<Button onClick={() => navigate('/')}>Go Home</Button>}
      />
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner size={28} />
      </div>
    )
  }

  if (loadError) {
    return (
      <EmptyState
        icon="⚠️"
        title="Couldn't load admin data"
        description={loadError}
        action={<Button variant="ghost" onClick={loadData}>Try again</Button>}
      />
    )
  }

  const failedLogins = logs.filter(
    (l) => (l.action_type === 'LOGIN' || l.action_type === 'LOGIN_LOCKED') && l.outcome === 'failure'
  ).length

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )

  const toggleSuspend = async (id, currentlySuspended) => {
    setSuspendingId(id)
    try {
      await api(`/api/admin/users/${id}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ is_suspended: !currentlySuspended })
      })
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, is_suspended: !currentlySuspended } : u))
      )
    } catch (err) {
      alert(err.message)
    } finally {
      setSuspendingId(null)
    }
  }

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Admin Panel"
        subtitle="User management and system audit log."
      />

      {/* Alert banner */}
      {bannerVisible && failedLogins > 0 && (
        <div style={{
          background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 18, animation: 'fadeUp 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, background: 'rgba(180,83,9,0.14)',
              borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--amber)', flexShrink: 0,
            }}>
              <WarningIcon />
            </div>
            <div>
              <p style={{ fontWeight: 600, color: 'var(--amber)', fontSize: 13 }}>
                Suspicious Activity Detected
              </p>
              <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 2, opacity: 0.8 }}>
                {failedLogins} failed login event{failedLogins !== 1 ? 's' : ''} in the audit log. Review below.
              </p>
            </div>
          </div>
          <button
            onClick={() => setBannerVisible(false)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--amber)', padding: 6,
            }}
          >
            <XIcon />
          </button>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 18 }}>
        <StatCard label="Total Users" value={users.length} color="var(--teal)" />
        <StatCard label="Active" value={users.filter((u) => !u.is_suspended).length} color="var(--green)" />
        <StatCard label="Suspended" value={users.filter((u) => u.is_suspended).length} color="var(--red)" />
        <StatCard label="Audit Events" value={logs.length} color="var(--amber)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        {/* ── User Table ── */}
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}>
                <SearchIcon />
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users…"
                style={{
                  paddingLeft: 30, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
                  background: 'var(--surface2)', border: '1px solid var(--border2)',
                  borderRadius: 8, fontSize: 12.5, color: 'var(--text)',
                  width: 190, outline: 'none', fontFamily: 'var(--font-body)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--teal-border)' }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border2)' }}
              />
            </div>
          </CardHeader>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {['User', 'Email', 'Groups', 'Role', 'Status', 'Actions'].map((h) => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontWeight: 600, fontSize: 11.5, color: 'var(--text2)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === user?.id}
                    suspending={suspendingId === u.id}
                    onToggle={() => toggleSuspend(u.id, u.is_suspended)}
                  />
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                No users match &quot;{search}&quot;
              </p>
            )}
          </div>
        </Card>

                {/* ── Audit Log ── */}
<Card style={{ height: 'fit-content' }}>
  <CardHeader>
    <CardTitle>Audit Log</CardTitle>
    <span style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
      append-only · {logs.length} events shown
    </span>
  </CardHeader>

  {/* Filter bar */}
  <div style={{
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
    background: 'var(--surface2)',
  }}>
    {/* Filter by user */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}>User</label>
      <select
        value={filterUserId}
        onChange={(e) => setFilterUserId(e.target.value)}
        style={{
          fontSize: 12.5, padding: '5px 8px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text)', fontFamily: 'var(--font-body)',
        }}
      >
        <option value="">All users</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.username}</option>
        ))}
      </select>
    </div>

    {/* Filter by action type */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}>Action Type</label>
      <select
        value={filterActionType}
        onChange={(e) => setFilterActionType(e.target.value)}
        style={{
          fontSize: 12.5, padding: '5px 8px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text)', fontFamily: 'var(--font-body)',
        }}
      >
        <option value="">All actions</option>
        {Object.entries(ACTION_META).map(([key, meta]) => (
          <option key={key} value={key}>{meta.label}</option>
        ))}
      </select>
    </div>

    {/* Filter by date from */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}>From</label>
      <input
        type="date"
        value={filterFrom}
        onChange={(e) => setFilterFrom(e.target.value)}
        style={{
          fontSize: 12.5, padding: '5px 8px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text)', fontFamily: 'var(--font-body)',
        }}
      />
    </div>

    {/* Filter by date to */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)' }}>To</label>
      <input
        type="date"
        value={filterTo}
        onChange={(e) => setFilterTo(e.target.value)}
        style={{
          fontSize: 12.5, padding: '5px 8px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text)', fontFamily: 'var(--font-body)',
        }}
      />
    </div>

    {/* Buttons */}
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingBottom: 1 }}>
      <Button size="sm" onClick={handleApplyFilters} disabled={logsLoading}>
        {logsLoading ? <Spinner size={12} /> : 'Apply'}
      </Button>
      <Button size="sm" variant="ghost" onClick={handleClearFilters} disabled={logsLoading}>
        Clear
      </Button>
    </div>
  </div>

  {/* Log list */}
  <div>
    {logsLoading ? (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
        <Spinner size={20} />
      </div>
    ) : logs.length === 0 ? (
      <p style={{ padding: '24px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
        No audit events match the selected filters
      </p>
    ) : (
      logs.map((log, i) => (
        <AuditRow key={log.id} log={log} delay={i * 15} />
      ))
    )}
  </div>
</Card>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)', padding: '14px 16px',
    }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color }}>
        {value}
      </p>
    </div>
  )
}

function UserRow({ user: u, isSelf, suspending, onToggle }) {
  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
    >
      <td style={{ padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Avatar name={u.username} size="sm" />
          <span style={{ fontWeight: 500, fontSize: 13 }}>{u.username}</span>
        </div>
      </td>
      <td style={{ padding: '10px 16px', color: 'var(--text2)', fontSize: 12.5 }}>{u.email}</td>
      <td style={{ padding: '10px 16px', color: 'var(--text2)', textAlign: 'center' }}>{u.group_count}</td>
      <td style={{ padding: '10px 16px' }}>
        <Badge variant={u.role === 'admin' ? 'admin' : 'default'}>{u.role}</Badge>
      </td>
      <td style={{ padding: '10px 16px' }}>
        <Badge variant={u.is_suspended ? 'danger' : 'success'}>
          {u.is_suspended ? 'Suspended' : 'Active'}
        </Badge>
      </td>
      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
        <Button
          variant={u.is_suspended ? 'tealOutline' : 'danger'}
          size="sm"
          disabled={isSelf || suspending}
          title={isSelf ? "Can't suspend yourself" : ''}
          onClick={onToggle}
        >
          {suspending ? <Spinner size={12} /> : u.is_suspended ? 'Reactivate' : 'Suspend'}
        </Button>
      </td>
    </tr>
  )
}

function AuditRow({ log, delay }) {
  const meta = ACTION_META[log.action_type] || { color: 'var(--blue)', label: log.action_type }
  const isFailure = log.outcome === 'failure'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        animation: `fadeUp 0.2s ease ${delay}ms both`,
        transition: 'background var(--transition)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
    >
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: isFailure ? 'var(--red)' : meta.color, marginTop: 5,
        boxShadow: `0 0 8px ${isFailure ? 'var(--red)' : meta.color}60`,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ fontSize: 12.5, fontWeight: 500, color: isFailure ? 'var(--red)' : meta.color }}>
            {meta.label}
          </p>
          {isFailure && <Badge variant="danger" style={{ fontSize: 9.5 }}>failed</Badge>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: 2 }}>
          {log.actor_username && (
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>{log.actor_username}</span>
          )}
          {log.affected_resource && (
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              {log.affected_resource}{log.resource_id ? `#${log.resource_id.slice(0, 8)}` : ''}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
          {fmtTs(log.created_at)}
        </p>
      </div>
    </div>
  )
}

function WarningIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}