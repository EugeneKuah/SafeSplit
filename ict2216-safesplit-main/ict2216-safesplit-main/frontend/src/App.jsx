import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/ui/index.jsx'
import Expenses from './pages/Expenses'
import AppShell from './components/AppShell'
import LoginView from './pages/LoginView'
import RegisterView from './pages/RegisterView'
import VerifyEmailView from './pages/VerifyEmailView'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import GroupDetail from './pages/GroupDetail'
import Settle from './pages/Settle'
import History from './pages/History'
import Admin from './pages/Admin'
import Profile from './pages/Profile'

/* ── Shown briefly while the initial GET /api/auth/me check is in flight ── */
function SessionCheck() {
  return (
    <main className="page">
      <header className="topbar">
        <div className="brand-mark">S</div>
        <div>
          <strong>SafeSplit</strong>
          <span>Secure Expense Platform</span>
        </div>
      </header>
      <p className="message">Checking session...</p>
    </main>
  )
}

/* ── Hero panel + Login/Register tabs, both living at the same "/" URL ──
   This mirrors the original app's tab switcher: no /login or /register
   route, just local state deciding which form to show. */
function AuthScreen() {
  const [activeTab, setActiveTab] = useState('login')

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand-mark">S</div>
        <div>
          <strong>SafeSplit</strong>
          <span>Secure Expense Platform</span>
        </div>
      </header>

      <section className="auth-layout">
        <aside className="hero-panel">
          <h1>Split expenses securely and transparently.</h1>
        </aside>

        <section className="auth-panel">
          <nav className="tabs" aria-label="Authentication pages">
            <button
              type="button"
              className={activeTab === 'login' ? 'active' : ''}
              onClick={() => setActiveTab('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={activeTab === 'register' ? 'active' : ''}
              onClick={() => setActiveTab('register')}
            >
              Register
            </button>
          </nav>

          {activeTab === 'login' ? (
            <LoginView />
          ) : (
            <RegisterView onGoToLogin={() => setActiveTab('login')} />
          )}
        </section>
      </section>
    </main>
  )
}

/* ── "/" itself is dual-purpose: the auth screen when signed out, the
   dashboard when signed in — exactly like the original single-page app.
   Admins are staff-only accounts, not expense-splitting participants, so
   they're sent straight to the Admin panel instead of the personal
   Dashboard (which would otherwise show meaningless $0 balances for an
   account that was never meant to join groups). ── */
function RootRoute() {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <SessionCheck />
  if (!user) return <AuthScreen />
  if (isAdmin) return <Navigate to="/admin" replace />
  return <AppShell><Dashboard /></AppShell>
}

/* ── Personal-finance routes (Dashboard, Groups, Settle Up, History) are
   off-limits to admin accounts, mirroring the staff-only design — an
   admin typing /groups directly in the URL bar is redirected to /admin
   rather than silently rendering a page that doesn't apply to their role. ── */
function Protected({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <SessionCheck />
  if (!user) return <Navigate to="/" replace />
  if (isAdmin) return <Navigate to="/admin" replace />
  return <AppShell>{children}</AppShell>
}

/* ── Any authenticated user (including admins) can access these routes.
   Used for shared pages like Profile that apply to all roles. ── */
function AuthRequired({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <SessionCheck />
  if (!user) return <Navigate to="/" replace />
  return <AppShell>{children}</AppShell>
}

function AdminOnly({ children }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <SessionCheck />
  if (!user) return <Navigate to="/" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <AppShell>{children}</AppShell>
}

function AppRoutes() {
  return (
    <Routes>
      {/* Email verification — standalone, always public, never auto-redirected */}
      <Route path="/verify-email" element={<VerifyEmailView />} />

      {/* Dual-purpose root: auth screen or dashboard, depending on session */}
      <Route path="/" element={<RootRoute />} />

      {/* Protected app */}
      <Route path="/groups" element={<Protected><Groups /></Protected>} />
      <Route path="/groups/:id" element={<Protected><GroupDetail /></Protected>} />
      <Route path="/expenses" element={<Protected><Expenses /></Protected>} />
      <Route path="/settle" element={<Protected><Settle /></Protected>} />
      <Route path="/history" element={<Protected><History /></Protected>} />

      {/* Accessible to all authenticated users — admins and regular users alike */}
      <Route path="/profile" element={<AuthRequired><Profile /></AuthRequired>} />

      {/* Admin only */}
      <Route path="/admin" element={<AdminOnly><Admin /></AdminOnly>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App