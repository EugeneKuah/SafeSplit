import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

function LoginView() {
  const { login } = useAuth()

  const [_email, setEmail] = useState('')
  const [_password, setPassword] = useState('')
  const [_message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const OnSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      await login(_email, _password)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={OnSubmit} noValidate>
      <div className="card-heading">
        <span className="eyebrow">Secure Access</span>
        <h2>Welcome back</h2>
        <p className="hint">Login with your SafeSplit account.</p>
      </div>

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
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </label>

      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? 'Please wait...' : 'Login'}
      </button>

      {_message && <p className="message">{_message}</p>}
    </form>
  )
}

export default LoginView
