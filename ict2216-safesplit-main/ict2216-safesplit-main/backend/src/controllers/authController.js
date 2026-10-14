const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  registerUser,
  loginUser,
  revokeSession,
  verifyEmail,
  issueVerificationToken,
  cookieOptions
} = require('../services/authService');
const { createAuditLog } = require('../services/auditService');
const { pool } = require('../config/db');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password is too long')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number')
    .regex(/[^A-Za-z0-9]/, 'Password must include a symbol')
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128)
});

const verifyEmailSchema = z.object({
  token: z.string().trim().min(32).max(256)
});

const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase())
});

function registerAuthRoutes(app) {
  app.post('/api/auth/register', authLimiter, validate(registerSchema), async (req, res) => {
    const { username, email, password } = req.validatedBody;
    try {
      const user = await registerUser({ username, email, password, req });
      return res.status(201).json({
        message: 'Account created. Check your email for a verification link before logging in.',
        user
      });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      await createAuditLog({ req, actionType: 'REGISTER', affectedResource: 'users', outcome: 'failure' });
      return res.status(500).json({ error: 'Unable to create account' });
    }
  });

  app.post('/api/auth/verify-email', authLimiter, validate(verifyEmailSchema), async (req, res) => {
    const { token } = req.validatedBody;
    try {
      await verifyEmail({ token, req });
      return res.json({ message: 'Email verified. You can now log in.' });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: 'Unable to verify email' });
    }
  });

  // Deliberately responds the same way whether or not the email exists,
  // and whether or not that account is already verified — this endpoint
  // must not become a way to enumerate registered emails.
  app.post('/api/auth/resend-verification', authLimiter, validate(resendVerificationSchema), async (req, res) => {
    const { email } = req.validatedBody;
    try {
      const result = await pool.query(
        'SELECT id, username, email_verified_at FROM users WHERE email = $1',
        [email]
      );
      if (result.rowCount === 1 && !result.rows[0].email_verified_at) {
        const user = result.rows[0];
        await issueVerificationToken({ userId: user.id, email, username: user.username, req });
      }
    } catch (err) {
      console.error('Resend verification failed');
    }
    return res.json({ message: 'If that account exists and is unverified, a new verification email has been sent.' });
  });

  app.post('/api/auth/login', authLimiter, validate(loginSchema), async (req, res) => {
    const { email, password } = req.validatedBody;
    try {
      const { user, token } = await loginUser({ email, password, req });
      res.cookie('session', token, cookieOptions);
      return res.json({ message: 'Login successful', user });
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      await createAuditLog({ req, actionType: 'LOGIN', affectedResource: 'users', outcome: 'failure' });
      return res.status(500).json({ error: 'Unable to log in' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    await revokeSession({ sessionJti: req.sessionJti, userId: req.user.id, req });
    res.clearCookie('session', { ...cookieOptions, maxAge: undefined });
    return res.json({ message: 'Logged out successfully' });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    return res.json({ user: req.user });
  });
}

module.exports = { registerAuthRoutes, requireAuth };