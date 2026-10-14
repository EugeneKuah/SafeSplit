const { pool } = require('../config/db');
const { createAuditLog } = require('./auditService');

// Send an invite — replaces the old direct-add behaviour.
// Checks: inviter must be a member, invitee must exist and not already be a member,
// no duplicate pending invite.
async function createInvite({ groupId, inviterId, inviteeEmail, req }) {
  // Verify inviter is a group member
  const memberCheck = await pool.query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, inviterId]
  );
  if (memberCheck.rowCount === 0) {
    const err = new Error('You are not a member of this group');
    err.status = 403;
    throw err;
  }

  // Look up invitee
  const userResult = await pool.query(
    'SELECT id, username, email FROM users WHERE email = $1 AND deleted_at IS NULL',
    [inviteeEmail.toLowerCase()]
  );
  if (userResult.rowCount === 0) {
    const err = new Error('No SafeSplit account found with that email');
    err.status = 404;
    throw err;
  }
  const invitee = userResult.rows[0];

  // Must not already be a member
  const alreadyMember = await pool.query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, invitee.id]
  );
  if (alreadyMember.rowCount > 0) {
    const err = new Error(`${invitee.username} is already in this group`);
    err.status = 409;
    throw err;
  }

  // Must not already have a pending invite
  const existing = await pool.query(
    `SELECT id, status FROM group_invites WHERE group_id = $1 AND invitee_id = $2`,
    [groupId, invitee.id]
  );
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    if (row.status === 'pending') {
      const err = new Error(`${invitee.username} already has a pending invite to this group`);
      err.status = 409;
      throw err;
    }
    // If they previously declined, allow re-invite by updating the existing row
    await pool.query(
      `UPDATE group_invites
       SET status = 'pending', inviter_id = $1, created_at = NOW(), responded_at = NULL
       WHERE id = $2`,
      [inviterId, row.id]
    );
    await createAuditLog({
      userId: inviterId, req, actionType: 'GROUP_INVITE_SENT',
      affectedResource: 'group_invites', resourceId: groupId, outcome: 'success',
    });
    return { invitee: { id: invitee.id, username: invitee.username, email: invitee.email } };
  }

  await pool.query(
    `INSERT INTO group_invites (group_id, inviter_id, invitee_id)
     VALUES ($1, $2, $3)`,
    [groupId, inviterId, invitee.id]
  );

  await createAuditLog({
    userId: inviterId, req, actionType: 'GROUP_INVITE_SENT',
    affectedResource: 'group_invites', resourceId: groupId, outcome: 'success',
  });

  return { invitee: { id: invitee.id, username: invitee.username, email: invitee.email } };
}

// Return all pending invites for a user, with group + inviter info
async function getPendingInvites(userId) {
  const result = await pool.query(
    `SELECT
       gi.id, gi.group_id, gi.created_at,
       g.name  AS group_name,
       g.base_currency,
       g.settle_currency,
       u.username AS inviter_username
     FROM group_invites gi
     JOIN groups g ON g.id = gi.group_id
     JOIN users  u ON u.id = gi.inviter_id
     WHERE gi.invitee_id = $1
       AND gi.status = 'pending'
     ORDER BY gi.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// Accept — adds to group_members and marks the invite accepted
async function acceptInvite({ inviteId, userId, req }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inv = await client.query(
      `SELECT * FROM group_invites WHERE id = $1 FOR UPDATE`,
      [inviteId]
    );
    if (inv.rowCount === 0) {
      const err = new Error('Invite not found'); err.status = 404; throw err;
    }
    const invite = inv.rows[0];
    if (invite.invitee_id !== userId) {
      const err = new Error('This invite is not for you'); err.status = 403; throw err;
    }
    if (invite.status !== 'pending') {
      const err = new Error(`Invite already ${invite.status}`); err.status = 409; throw err;
    }

    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [invite.group_id, userId]
    );

    await client.query(
      `UPDATE group_invites SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [inviteId]
    );

    await client.query(
      `INSERT INTO audit_logs (user_id, action_type, affected_resource, resource_id, outcome)
       VALUES ($1, 'GROUP_INVITE_ACCEPTED', 'group_invites', $2, 'success')`,
      [userId, invite.group_id]
    );

    await client.query('COMMIT');
    return { groupId: invite.group_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Decline — just marks the invite declined, no group_members change
async function declineInvite({ inviteId, userId, req }) {
  const inv = await pool.query(
    `SELECT * FROM group_invites WHERE id = $1`,
    [inviteId]
  );
  if (inv.rowCount === 0) {
    const err = new Error('Invite not found'); err.status = 404; throw err;
  }
  const invite = inv.rows[0];
  if (invite.invitee_id !== userId) {
    const err = new Error('This invite is not for you'); err.status = 403; throw err;
  }
  if (invite.status !== 'pending') {
    const err = new Error(`Invite already ${invite.status}`); err.status = 409; throw err;
  }

  await pool.query(
    `UPDATE group_invites SET status = 'declined', responded_at = NOW() WHERE id = $1`,
    [inviteId]
  );

  await createAuditLog({
    userId, req, actionType: 'GROUP_INVITE_DECLINED',
    affectedResource: 'group_invites', resourceId: invite.group_id, outcome: 'success',
  });
}

module.exports = { createInvite, getPendingInvites, acceptInvite, declineInvite };