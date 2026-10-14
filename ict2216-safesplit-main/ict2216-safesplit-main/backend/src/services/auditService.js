const crypto = require('crypto');
const { pool } = require('../config/db');

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || 'unknown')).digest('hex');
}

async function createAuditLog({ userId = null, req, actionType, affectedResource = null, resourceId = null, outcome }) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, ip_hash, action_type, affected_resource, resource_id, outcome) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, hashIp(req.ip), actionType, affectedResource, resourceId, outcome]
    );
  } catch (err) {
    console.error('Audit logging failed');
  }
}

module.exports = { createAuditLog };
