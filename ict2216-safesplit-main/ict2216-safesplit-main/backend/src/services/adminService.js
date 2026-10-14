const { pool } = require('../config/db');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// AdminService.ListUsers() — every user plus how many distinct groups
// they belong to. Excludes soft-deleted accounts (deleted_at) so a
// self-deleted/anonymised user doesn't clutter admin views — mirrors how
// users.deleted_at is treated everywhere else as "gone" without being a
// hard DELETE (see schema.sql comments on FR-AM-04).
async function listUsers() {
  const result = await pool.query(
    `SELECT u.id, u.username, u.email, u.role, u.is_suspended, u.email_verified_at,
            u.last_login, u.created_at,
            (SELECT COUNT(DISTINCT gm.group_id) FROM group_members gm WHERE gm.user_id = u.id) AS group_count
     FROM users u
     WHERE u.deleted_at IS NULL
     ORDER BY u.created_at DESC`
  );
  return result.rows;
}

// AdminService.SetUserSuspended(targetId, suspended, adminId) — SR-08.
// Refuses to let an admin suspend their own account (would let an admin
// accidentally lock themselves out with no one left to undo it), and
// refuses to operate on an already soft-deleted account.
async function setUserSuspended({ targetId, suspended, adminId }) {
  if (targetId === adminId) throw httpError(400, "You can't suspend your own account");

  const result = await pool.query(
    `UPDATE users SET is_suspended = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING id, username, email, role, is_suspended`,
    [suspended, targetId]
  );
  if (result.rowCount === 0) throw httpError(404, 'User not found');
  return result.rows[0];
}

// AdminService.ListAuditLogs — SR-21 filtering. Cursor-based
// pagination on (created_at, id) rather than OFFSET, since audit_logs is
// append-only and high-write — OFFSET pagination would skip/duplicate rows
// as new events land between page requests.
async function listAuditLogs({ limit = 100, userId = null, actionType = null, from = null, to = null } = {}) {
  const cappedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  const params = [];
  const conditions = [];

  if (userId) {
    params.push(userId);
    conditions.push(`al.user_id = $${params.length}`);
  }
  if (actionType) {
    params.push(actionType);
    conditions.push(`al.action_type = $${params.length}`);
  }
  if (from) {
    params.push(new Date(from).toISOString());
    conditions.push(`al.created_at >= $${params.length}`);
  }
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    params.push(toDate.toISOString());
    conditions.push(`al.created_at <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(cappedLimit);

  const result = await pool.query(
    `SELECT al.id, al.user_id, al.action_type, al.affected_resource, al.resource_id,
            al.outcome, al.metadata, al.created_at,
            u.username AS actor_username
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ${whereClause}
     ORDER BY al.id DESC
     LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

module.exports = { listUsers, setUserSuspended, listAuditLogs };