const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { createAuditLog } = require('./auditService');
const { sendVerificationEmail } = require('./notificationService');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set through the environment and be at least 32 characters long.');
}
const JWT_EXPIRES_IN_SECONDS = 60 * 60;
const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === 'production';
const useSecureCookies = isProduction || process.env.COOKIE_SECURE === 'true';

const cookieOptions = {
  httpOnly: true,
  secure: useSecureCookies,
  sameSite: 'strict',
  path: '/',
  maxAge: JWT_EXPIRES_IN_SECONDS * 1000
};

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  };
}

function signSessionToken(user, jti) {
  return jwt.sign(
    { sub: user.id, role: user.role, jti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN_SECONDS, issuer: 'safesplit', audience: 'safesplit-web' }
  );
}

function generateRawToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Issues a fresh verification token for a user, replacing any unused oneZ
// they already had (so hitting "resend" twice can't leave two valid links
// outstanding), and emails the raw token via NotificationService.
async function issueVerificationToken({ userId, email, username, req }) {
  await pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await pool.query(
    'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );

  await createAuditLog({
    userId,
    req,
    actionType: 'EMAIL_VERIFICATION_TOKEN_ISSUED',
    affectedResource: 'users',
    outcome: 'success'
  });

  await sendVerificationEmail({ email, username, rawToken });
}

async function registerUser({ username, email, password, req }) {
  // Block if an active verified account already exists
  const existingUser = await pool.query(
    'SELECT id FROM users WHERE (email = $1 OR username = $2) AND deleted_at IS NULL',
    [email, username]
  );
  if (existingUser.rowCount > 0) {
    await createAuditLog({ req, actionType: 'REGISTER', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Username or email is already registered');
    err.status = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  // Upsert into pending_registrations — if they registered before but
  // never verified, refresh the token and resend rather than blocking them
  await pool.query(
    `INSERT INTO pending_registrations (username, email, password_hash, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET username      = EXCLUDED.username,
           password_hash = EXCLUDED.password_hash,
           token_hash    = EXCLUDED.token_hash,
           expires_at    = EXCLUDED.expires_at,
           created_at    = NOW()`,
    [username, email, passwordHash, tokenHash, expiresAt]
  );

  await createAuditLog({ req, actionType: 'REGISTER', affectedResource: 'pending_registrations', outcome: 'success' });

  await sendVerificationEmail({ email, username, rawToken });

  // Return minimal info — no user ID yet since the account doesn't exist
  return { username, email };
}

// AuthService.VerifyEmail(token) — hashes the incoming token, looks it up
// by hash only, and rejects (same generic error either way) if it's
// missing, already used, or expired. On success, marks the token used
// and stamps users.email_verified_at in the same flow.
async function verifyEmail({ token, req }) {
  const tokenHash = hashToken(token);

  const reject = async () => {
    await createAuditLog({
      req,
      actionType: 'EMAIL_VERIFY_ATTEMPT',
      affectedResource: 'pending_registrations',
      outcome: 'failure'
    });
    const err = new Error('This verification link is invalid or has expired.');
    err.status = 400;
    throw err;
  };

  // Look up the pending registration by token hash
  const result = await pool.query(
    'SELECT * FROM pending_registrations WHERE token_hash = $1',
    [tokenHash]
  );

  if (result.rowCount !== 1) return reject();

  const pending = result.rows[0];
  if (new Date(pending.expires_at) < new Date()) return reject();

  // Token is valid — create the actual user account now
  const userId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO users (id, username, email, password_hash, email_verified_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, pending.username, pending.email, pending.password_hash]
  );

  // Clean up the pending row
  await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pending.id]);

  await createAuditLog({
    userId,
    req,
    actionType: 'EMAIL_VERIFY_ATTEMPT',
    affectedResource: 'users',
    outcome: 'success'
  });
}

async function loginUser({ email, password, req }) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL', [email]);
  if (result.rowCount !== 1) {
    await createAuditLog({ req, actionType: 'LOGIN', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  const user = result.rows[0];
  if (user.is_suspended) {
    await createAuditLog({ userId: user.id, req, actionType: 'LOGIN', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Account suspended');
    err.status = 403;
    throw err;
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await createAuditLog({ userId: user.id, req, actionType: 'LOGIN_LOCKED', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Account temporarily locked. Please try again later.');
    err.status = 423;
    throw err;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const failedAttempts = user.failed_login_attempts + 1;
    const lockedUntil = failedAttempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
    await pool.query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3',
      [failedAttempts, lockedUntil, user.id]
    );
    await createAuditLog({ userId: user.id, req, actionType: 'LOGIN', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  // FR-AM-01: email verification is required before an account can log in.
  // Checked after the password is confirmed correct, so this never leaks
  // verification status to someone who doesn't already know the password.
  if (!user.email_verified_at) {
    await createAuditLog({ userId: user.id, req, actionType: 'LOGIN_UNVERIFIED', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Please verify your email address before logging in.');
    err.status = 403;
    throw err;
  }

  await pool.query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW(), updated_at = NOW() WHERE id = $1',
    [user.id]
  );

  // Keep one active session per account. This limits the impact of a stolen
  // cookie and makes a fresh login invalidate older sessions immediately.
  await pool.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [user.id]
  );

  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + JWT_EXPIRES_IN_SECONDS * 1000);
  const ipAddress = req.ip || null;
  const userAgent = String(req.get('user-agent') || '').slice(0, 512) || null;
  await pool.query(
    'INSERT INTO sessions (jti, user_id, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [jti, user.id, ipAddress, userAgent, expiresAt]
  );

  const token = signSessionToken(user, jti);
  await createAuditLog({ userId: user.id, req, actionType: 'LOGIN', affectedResource: 'users', outcome: 'success' });

  return { user: publicUser(user), token };
}

async function revokeSession({ sessionJti, userId, req }) {
  await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE jti = $1', [sessionJti]);
  await createAuditLog({ userId, req, actionType: 'LOGOUT', affectedResource: 'sessions', outcome: 'success' });
}

module.exports = {
  JWT_SECRET,
  BCRYPT_COST,
  cookieOptions,
  publicUser,
  registerUser,
  loginUser,
  revokeSession,
  verifyEmail,
  issueVerificationToken
};