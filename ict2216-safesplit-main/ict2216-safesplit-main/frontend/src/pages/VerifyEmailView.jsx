import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../services/api'

function VerifyEmailView() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [status, setStatus] = useState('idle') // idle | loading | success | error
  const [message, setMessage] = useState('')

  // Verification only fires on an explicit click, never automatically on
  // page load. Some corporate email gateways "click" links in incoming
  // mail to scan them for phishing — if this ran on mount, that scan
  // would silently burn the single-use token before the real user opens
  // the email.
  const onConfirm = async () => {
    setStatus('loading')
    setMessage('')
    try {
      const data = await api('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token })
      })
      setStatus('success')
      setMessage(data.message)
    } catch (error) {
      setStatus('error')
      setMessage(error.message)
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand-mark">S</div>
        <div>
          <strong>SafeSplit</strong>
          <span>Secure Expense Platform</span>
        </div>
      </header>

      <div className="auth-card">
        <div className="card-heading">
          <span className="eyebrow">Secure Access</span>
          <h2>Verify your email</h2>
          {!token && <p className="hint">This link is missing a verification token.</p>}
          {token && status !== 'success' && (
            <p className="hint">Click below to confirm this email address belongs to you.</p>
          )}
        </div>

        {token && status !== 'success' && (
          <button className="primary-button" onClick={onConfirm} disabled={status === 'loading'}>
            {status === 'loading' ? 'Verifying...' : 'Verify email address'}
          </button>
        )}

        {status === 'success' && (
          <button className="primary-button" onClick={() => navigate('/')}>
            Go to login
          </button>
        )}

        {message && <p className="message">{message}</p>}
      </div>
    </main>
  )
}

export default VerifyEmailView