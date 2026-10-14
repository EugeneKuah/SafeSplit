const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { createAuditLog } = require('./auditService');
const { BCRYPT_COST, issueVerificationToken } = require('./authService');

function profileView(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    email_verified: !!row.email_verified_at,
    created_at: row.created_at,
    last_login: row.last_login
  };
}

async function getProfile(userId) {
  const result = await pool.query(
    `SELECT id, username, email, role, email_verified_at, created_at, last_login
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );

  if (result.rowCount !== 1) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  return profileView(result.rows[0]);
}

async function updateProfile({ userId, username, email, req }) {
  const conflict = await pool.query(
    'SELECT id FROM users WHERE (email = $1 OR username = $2) AND id != $3 AND deleted_at IS NULL',
    [email, username, userId]
  );
  if (conflict.rowCount > 0) {
    await createAuditLog({ userId, req, actionType: 'PROFILE_UPDATE', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Username or email is already in use');
    err.status = 409;
    throw err;
  }

  const current = await pool.query('SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (current.rowCount !== 1) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const emailChanged = current.rows[0].email !== email;

  const updated = await pool.query(
    `UPDATE users
     SET username = $1, email = $2, updated_at = NOW()${emailChanged ? ', email_verified_at = NULL' : ''}
     WHERE id = $3
     RETURNING id, username, email, role, email_verified_at, created_at, last_login`,
    [username, email, userId]
  );

  await createAuditLog({ userId, req, actionType: 'PROFILE_UPDATE', affectedResource: 'users', outcome: 'success' });

  if (emailChanged) {
    await issueVerificationToken({ userId, email, username, req });
  }

  return { profile: profileView(updated.rows[0]), emailChanged };
}

async function changePassword({ userId, currentPassword, newPassword, currentSessionJti, req }) {
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (result.rowCount !== 1) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const passwordOk = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!passwordOk) {
    await createAuditLog({ userId, req, actionType: 'PASSWORD_CHANGE', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);

  await pool.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND jti != $2 AND revoked_at IS NULL',
    [userId, currentSessionJti]
  );

  await createAuditLog({ userId, req, actionType: 'PASSWORD_CHANGE', affectedResource: 'users', outcome: 'success' });
}

async function deleteAccount({ userId, password, currentSessionJti, req }) {
  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
  if (result.rowCount !== 1) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const passwordOk = await bcrypt.compare(password, result.rows[0].password_hash);
  if (!passwordOk) {
    await createAuditLog({ userId, req, actionType: 'ACCOUNT_DELETE', affectedResource: 'users', outcome: 'failure' });
    const err = new Error('Incorrect password');
    err.status = 401;
    throw err;
  }

  await pool.query('UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [userId]);
  // Revoke every session, including the current one — the account is gone.
  await pool.query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);

  await createAuditLog({ userId, req, actionType: 'ACCOUNT_DELETE', affectedResource: 'users', outcome: 'success' });
}

module.exports = { getProfile, updateProfile, changePassword, deleteAccount }; 

