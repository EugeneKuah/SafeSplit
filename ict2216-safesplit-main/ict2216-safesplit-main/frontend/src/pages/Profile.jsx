import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom' 
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader, CardTitle, CardBody, Badge, Input, Spinner, useToast } from '../components/ui/index.jsx'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { fmtDate, fmtTs } from '../lib/utils'

const USERNAME_RULE = /^[a-zA-Z0-9_]+$/
const EMAIL_RULE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RULES = [
  { test: (v) => v.length >= 12, label: 'At least 12 characters' },
  { test: (v) => /[a-z]/.test(v), label: 'One lowercase letter' },
  { test: (v) => /[A-Z]/.test(v), label: 'One uppercase letter' },
  { test: (v) => /[0-9]/.test(v), label: 'One number' },
  { test: (v) => /[^A-Za-z0-9]/.test(v), label: 'One symbol' },
]

export default function Profile() {
  const { updateUser, isAdmin,logout } = useAuth()
  const toast = useToast()

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    api('/api/users/me')
      .then((data) => { if (!cancelled) setProfile(data.user) })
      .catch((err) => { if (!cancelled) setLoadError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleProfileSaved = (updated) => {
    setProfile(updated)
    updateUser({ username: updated.username, email: updated.email })
  }

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 640, margin: '0 auto' }}>
      <PageHeader title="My Profile" subtitle="View and manage your account details." />

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spinner size={28} />
        </div>
      )}

      {!loading && loadError && (
        <Card>
          <CardBody>
            <p style={{ color: 'var(--red)', fontSize: 13.5 }}>
              Couldn&apos;t load your profile: {loadError}
            </p>
          </CardBody>
        </Card>
      )}

      {!loading && !loadError && profile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProfileSummary profile={profile} />
          <ProfileDetailsCard profile={profile} onSaved={handleProfileSaved} toast={toast} isAdmin={isAdmin} />
          <ChangePasswordCard toast={toast} isAdmin={isAdmin} />
          <DeleteAccountCard isAdmin={isAdmin} logout={logout} />
        </div>
      )}
    </div>
  )
}

/* ── Top summary card: avatar, name, role/verification badges, meta ── */
function ProfileSummary({ profile }) {
  return (
    <Card>
      <CardBody style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Avatar name={profile.username} size="xl" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
              {profile.username}
            </h2>
            <Badge variant={profile.role === 'admin' ? 'admin' : 'default'}>{profile.role}</Badge>
            <Badge variant={profile.email_verified ? 'success' : 'warning'}>
              {profile.email_verified ? 'Email verified' : 'Email unverified'}
            </Badge>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{profile.email}</p>
          <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 6 }}>
            Member since {fmtDate(profile.created_at)}
            {profile.last_login && <> · Last login {fmtTs(profile.last_login)}</>}
          </p>
        </div>
      </CardBody>
    </Card>
  )
}

/* ── Editable username / email card — read-only for admins ── */
function ProfileDetailsCard({ profile, onSaved, toast, isAdmin }) {
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState(profile.username)
  const [email, setEmail] = useState(profile.email)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const startEdit = () => {
    setUsername(profile.username)
    setEmail(profile.email)
    setErrors({})
    setFormError('')
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setErrors({})
    setFormError('')
  }

  const validate = () => {
    const next = {}
    const trimmedUsername = username.trim()
    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      next.username = 'Username must be 3–30 characters.'
    } else if (!USERNAME_RULE.test(trimmedUsername)) {
      next.username = 'Letters, numbers and underscores only.'
    }
    if (!EMAIL_RULE.test(email.trim())) {
      next.email = 'Enter a valid email address.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSaving(true)
    try {
      const data = await api('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ username: username.trim(), email: email.trim().toLowerCase() }),
      })
      onSaved(data.user)
      toast.success(data.message)
      setEditing(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Details</CardTitle>
        {!isAdmin && !editing && (
          <Button variant="ghost" size="sm" onClick={startEdit}>Edit</Button>
        )}
      </CardHeader>

      {!editing ? (
        <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <DetailRow label="Username" value={profile.username} />
          <DetailRow label="Email" value={profile.email} />
          {isAdmin && (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
              Admin account details are managed by your system administrator.
            </p>
          )}
        </CardBody>
      ) : (
        <form onSubmit={handleSave}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={errors.username}
              maxLength={30}
              autoComplete="username"
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              maxLength={254}
              autoComplete="email"
            />
            <p style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              Changing your email will require you to verify the new address before your next login.
            </p>
            {formError && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="md" type="button" onClick={cancelEdit} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" size="md" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </CardBody>
        </form>
      )}
    </Card>
  )
}

/* ── Change password card — read-only for admins ── */
function ChangePasswordCard({ toast, isAdmin }) {
  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setErrors({})
    setFormError('')
  }

  const cancel = () => {
    reset()
    setOpen(false)
  }

  const validate = () => {
    const next = {}
    if (!currentPassword) next.currentPassword = 'Enter your current password.'
    const failedRule = PASSWORD_RULES.find((r) => !r.test(newPassword))
    if (failedRule) next.newPassword = `Password needs: ${failedRule.label.toLowerCase()}.`
    if (newPassword && newPassword === currentPassword) next.newPassword = 'New password must differ from the current one.'
    if (confirmPassword !== newPassword) next.confirmPassword = 'Passwords do not match.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return

    setSaving(true)
    try {
      const data = await api('/api/users/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      toast.success(data.message)
      reset()
      setOpen(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        {!isAdmin && !open && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>Change Password</Button>
        )}
      </CardHeader>

      {!open ? (
        <CardBody>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>
            {isAdmin
              ? 'Admin account credentials are managed by your system administrator.'
              : "Use a strong, unique password you don't reuse on other sites."}
          </p>
        </CardBody>
      ) : (
        <form onSubmit={handleSave}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input
              label="Current Password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              error={errors.currentPassword}
              autoComplete="current-password"
            />
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={errors.newPassword}
              autoComplete="new-password"
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              autoComplete="new-password"
            />
            <ul style={{ fontSize: 11.5, color: 'var(--text3)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {PASSWORD_RULES.map((r) => (
                <li key={r.label} style={{ color: r.test(newPassword) ? 'var(--green)' : 'var(--text3)' }}>
                  {r.label}
                </li>
              ))}
            </ul>
            {formError && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{formError}</p>}
            <p style={{ fontSize: 11.5, color: 'var(--text3)' }}>
              Other devices currently signed in to your account will be signed out.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="md" type="button" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" size="md" type="submit" disabled={saving}>
                {saving ? 'Updating…' : 'Update Password'}
              </Button>
            </div>
          </CardBody>
        </form>
      )}
    </Card>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

function DeleteAccountCard({ isAdmin, logout }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState('')
  const [deleting, setDeleting] = useState(false)

  if (isAdmin) return null

  const cancel = () => {
    setOpen(false)
    setPassword('')
    setFormError('')
  }

  const handleDelete = async (e) => {
    e.preventDefault()
    if (!password) {
      setFormError('Enter your current password to confirm.')
      return
    }
    setDeleting(true)
    setFormError('')
    try {
      await api('/api/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ password }),
      })
      // Session is already revoked server-side — clear client state and redirect
      await logout()
      navigate('/login')
    } catch (err) {
      setFormError(err.message)
      setDeleting(false)
    }
  }

  return (
    <Card style={{ border: '1px solid var(--red-border, #fca5a5)' }}>
      <CardHeader>
        <CardTitle style={{ color: 'var(--red)' }}>Delete Account</CardTitle>
        {!open && (
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            Delete Account
          </Button>
        )}
      </CardHeader>

      {!open ? (
        <CardBody>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
        </CardBody>
      ) : (
        <form onSubmit={handleDelete}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              background: 'var(--red-bg)', border: '1px solid var(--red-border, #fca5a5)',
              borderRadius: 8, padding: '12px 14px',
            }}>
              <p style={{ fontSize: 13, color: 'var(--red)', fontWeight: 500, marginBottom: 4 }}>
                This will permanently delete your account.
              </p>
              <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                You will be immediately signed out and will not be able to log back in.
                Your expense history within groups will be preserved for other members,
                but your account will no longer exist.
              </p>
            </div>

            <Input
              label="Confirm your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your current password"
              autoComplete="current-password"
              autoFocus
            />

            {formError && (
              <p style={{ fontSize: 12.5, color: 'var(--red)', padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 8 }}>
                {formError}
              </p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="md" type="button" onClick={cancel} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" size="md" type="submit" disabled={deleting || !password}>
                {deleting ? 'Deleting…' : 'Delete My Account'}
              </Button>
            </div>
          </CardBody>
        </form>
      )}
    </Card>
  )
}