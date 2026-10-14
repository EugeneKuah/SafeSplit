import { useState } from 'react'
import { api } from '../services/api'

function RegisterView({ onGoToLogin }) {
  const [_username, setUsername] = useState('')
  const [_email, setEmail] = useState('')
  const [_password, setPassword] = useState('')
  const [_confirmPassword, setConfirmPassword] = useState('')
  const [_message, setMessage] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [registered, setRegistered] = useState(false)
  const [loading, setLoading] = useState(false)

  const ShowValidation = (validationMessage) => {
    setMessage(validationMessage)
  }

  const ValidateEmailFormat = () => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(_email)
  }

  const ValidatePasswordMatch = () => {
    return _password === _confirmPassword
  }

  const OnRegister = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (!ValidateEmailFormat()) {
        ShowValidation('Please enter a valid email address.')
        return
      }

      if (!ValidatePasswordMatch()) {
        ShowValidation('Passwords do not match.')
        return
      }

      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: _username,
          email: _email,
          password: _password
        })
      })

      // Stay on this tab and keep the message visible instead of jumping
      // straight to the login tab — "check your email to verify" is easy
      // to miss if it flashes by for half a second.
      setSubmittedEmail(_email)
      setMessage(data.message || `A verification link has been sent to ${_email}. Please check your inbox to activate your account.`)
      setRegistered(true)
      setUsername('')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
    } catch (error) {
      ShowValidation(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (registered) {
    return (
      <div className="auth-card">
        <div className="card-heading">
          <span className="eyebrow">Secure Access</span>
          <h2>Almost there</h2>
        </div>
        <p className="message">
          Check your email at <strong>{submittedEmail}</strong> and click the verification link to activate your account. The link expires in 24 hours.
        </p>
        <p className="message" style={{ marginTop: 8, fontSize: 13 }}>
          Didn't receive it? Check your spam folder, or go back and register again to resend.
        </p>
        <button className="primary-button" onClick={onGoToLogin}>
          Go to login
        </button>
      </div>
    )
  }

  return (
    <form className="auth-card" onSubmit={OnRegister} noValidate>
      <div className="card-heading">
        <span className="eyebrow">Secure Access</span>
        <h2>Create your account</h2>
        <p className="hint">Register using a valid email and strong password.</p>
      </div>

      <label>
        Username
        <input
          name="username"
          value={_username}
          onChange={(event) => setUsername(event.target.value)}
          minLength="3"
          maxLength="30"
          autoComplete="username"
          placeholder="e.g. testuser1"
          required
        />
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          value={_email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
      </label>

      <label>
        Password
        <input
          name="password"
          type="password"
          value={_password}
          onChange={(event) => setPassword(event.target.value)}
          minLength="12"
          maxLength="128"
          autoComplete="new-password"
          placeholder="Enter your password"
          required
        />
      </label>

      <label>
        Confirm Password
        <input
          name="confirmPassword"
          type="password"
          value={_confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          minLength="12"
          maxLength="128"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          required
        />
      </label>

      <div className="password-rules">
        <span>Strong password requirements</span>
        <ul>
          <li>Minimum 12 characters</li>
          <li>Uppercase, lowercase, number, and symbol</li>
        </ul>
      </div>

      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? 'Please wait...' : 'Create Account'}
      </button>

      {_message && <p className="message">{_message}</p>}
    </form>
  )
}

export default RegisterView
