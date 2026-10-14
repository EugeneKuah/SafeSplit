const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { JWT_SECRET, publicUser } = require('../services/authService');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });

    const payload = jwt.verify(token, JWT_SECRET, { issuer: 'safesplit', audience: 'safesplit-web' });
    const sessionResult = await pool.query(
      `SELECT s.jti, s.revoked_at, s.expires_at, u.id, u.username, u.email, u.role, u.is_suspended
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.jti = $1 AND u.deleted_at IS NULL`,
      [payload.jti]
    );

    if (sessionResult.rowCount !== 1) return res.status(401).json({ error: 'Invalid session' });
    const row = sessionResult.rows[0];
    if (row.revoked_at || new Date(row.expires_at) <= new Date()) return res.status(401).json({ error: 'Session expired' });
    if (row.is_suspended) return res.status(403).json({ error: 'Account suspended' });

    req.user = publicUser(row);
    req.sessionJti = payload.jti;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin privileges required' });
  return next();
}

module.exports = { requireAuth, requireAdmin };
