import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui/Avatar'

const NAV = [
  { path: '/',         label: 'Dashboard', icon: <GridIcon /> },
  { path: '/groups',   label: 'Groups',    icon: <GroupIcon /> },
  { path: '/expenses', label: 'Expenses',  icon: <ReceiptIcon /> },
  { path: '/settle',   label: 'Settle Up', icon: <CoinsIcon /> },
  { path: '/history',  label: 'History',   icon: <ClockIcon /> },
]

function AppShell({ children }) {
  const [collapsed, setCollapsed] = useState(false)
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const W = collapsed ? 58 : 224
  const glass = {
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── SIDEBAR ── */}
      <aside style={{
        width: W, flexShrink: 0,
        ...glass, borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          height: 58, display: 'flex', alignItems: 'center', gap: 11,
          padding: collapsed ? '0 14px' : '0 18px',
          borderBottom: '1px solid var(--border)', flexShrink: 0,
          overflow: 'hidden',
        }}>
          <div className="brand-mark" style={{ width: 30, height: 30, borderRadius: 10, fontSize: 14, flexShrink: 0 }}>S</div>
          {!collapsed && (
            <span style={{
              fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17,
              color: 'var(--text)', letterSpacing: '-0.01em', whiteSpace: 'nowrap',
            }}>
              SafeSplit
            </span>
          )}
        </div>

        {/* Nav — hidden entirely for admin accounts, which are staff-only
            and don't participate in groups/expenses; they land on /admin
            instead (see App.jsx RootRoute/Protected). */}
        {!isAdmin && (
          <nav style={{ flex: 1, padding: '10px 7px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
            {NAV.map(({ path, label, icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                style={({ isActive }) => navItemStyle(isActive, collapsed)}
              >
                <span style={{ flexShrink: 0 }}>{icon}</span>
                {!collapsed && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
              </NavLink>
            ))}
          </nav>
        )}
        {isAdmin && <div style={{ flex: 1 }} />}

        {/* Admin + user area */}
        <div style={{ padding: '10px 7px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {isAdmin && (
            <NavLink to="/admin" style={({ isActive }) => navItemStyle(isActive, collapsed, true)}>
              <span style={{ flexShrink: 0 }}><ShieldCheckIcon /></span>
              {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>Admin</span>}
            </NavLink>
          )}
          <button
            onClick={() => navigate('/profile')}
            title="View profile"
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: collapsed ? '8px 9px' : '8px 11px', marginTop: 4,
              background: 'none', border: 'none', borderRadius: 8,
              cursor: 'pointer', textAlign: 'left', width: '100%',
              fontFamily: 'var(--font-body)', transition: 'background var(--transition)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <Avatar name={user?.username || '?'} size="sm" style={{ flexShrink: 0 }} />
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.username}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.email}
                </div>
              </div>
            )}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 9, padding: '7px 11px',
              background: 'none', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text3)', cursor: 'pointer', fontSize: 12,
              fontFamily: 'var(--font-body)', transition: 'all var(--transition)',
              marginTop: 2,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border3)'; e.currentTarget.style.color = 'var(--text2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)' }}
          >
            <CollapseIcon flipped={collapsed} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          height: 58, ...glass, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 22px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="logout-button"
              onClick={handleLogout}
              style={{ padding: '8px 16px', fontSize: 13, borderRadius: 12 }}
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}

function SearchBar() {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <div style={{ position: 'absolute', left: 10, color: 'var(--text3)', pointerEvents: 'none' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        placeholder="Search..."
        style={{
          paddingLeft: 30, paddingRight: 12, paddingTop: 6, paddingBottom: 6,
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 20, fontSize: 13, color: 'var(--text)',
          width: 190, outline: 'none', fontFamily: 'var(--font-body)',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--teal-border)'; e.target.style.width = '230px' }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.width = '190px' }}
      />
    </div>
  )
}

function navItemStyle(isActive, collapsed, isAdmin = false) {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: collapsed ? '8px 11px' : '8px 11px',
    borderRadius: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: 500,
    color: isActive ? (isAdmin ? '#fff' : 'var(--teal)') : 'var(--text2)',
    background: isActive ? (isAdmin ? 'var(--navy)' : 'var(--teal-bg)') : 'transparent',
    border: isActive ? `1px solid ${isAdmin ? 'var(--navy)' : 'var(--teal-border)'}` : '1px solid transparent',
    textDecoration: 'none', transition: 'all var(--transition)',
    justifyContent: collapsed ? 'center' : 'flex-start',
  }
}

/* ── ICONS ── */
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
function GroupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <path d="M16 3.13a4 4 0 010 7.75" /><path d="M21 21v-2a4 4 0 00-3-3.87" />
    </svg>
  )
}
function CoinsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1110.34 18" />
      <path d="M7 6h1v4" /><path d="M16.71 13.88l.7.71-2.82 2.82" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function ShieldCheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  )
}
function CollapseIcon({ flipped }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transform: flipped ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s' }}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h12v19l-3-2-2 2-2-2-2 2-3-2V2z" />
      <line x1="9" y1="7" x2="15" y2="7" /><line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  )
}

export default AppShell