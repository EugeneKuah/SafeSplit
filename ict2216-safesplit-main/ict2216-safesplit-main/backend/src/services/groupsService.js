const { pool: db } = require('../config/db')

// ── Get all groups a user belongs to ─────────────────────────────────────────
const getGroupsForUser = async (userId) => {
  const result = await db.query(
    `SELECT
       g.id,
       g.name,
       g.base_currency,
       g.settle_currency,
       g.created_at,
       g.is_active,
       COUNT(gm2.user_id)::int          AS member_count,
       MAX(CASE WHEN gm.user_id = $1 THEN gm.role END) AS my_role
     FROM groups g
     JOIN group_members gm  ON gm.group_id = g.id AND gm.user_id = $1
     JOIN group_members gm2 ON gm2.group_id = g.id
     GROUP BY g.id
     ORDER BY g.is_active DESC, g.created_at DESC`,
    [userId]
  )
  return result.rows
}

// ── Create a new group ────────────────────────────────────────────────────────
const createGroup = async ({ name, base_currency, settle_currency, ownerId }) => {
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const groupRes = await client.query(
      `INSERT INTO groups (name, base_currency, settle_currency, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, base_currency, settle_currency, ownerId]
    )
    const group = groupRes.rows[0]

    await client.query(
      `INSERT INTO group_members (group_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [group.id, ownerId]
    )

    await client.query('COMMIT')
    return group
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ── Get a single group (only if user is a member) ─────────────────────────────
const getGroupById = async (groupId, userId) => {
  const result = await db.query(
    `SELECT
       g.id,
       g.name,
       g.base_currency,
       g.settle_currency,
       g.created_at,
       g.created_by,
       g.is_active,
       COUNT(gm2.user_id)::int AS member_count,
       MAX(CASE WHEN gm.user_id = $2 THEN gm.role END) AS my_role,
       -- Whether ANY expense or settlement row exists for this group, including
       -- soft-deleted expenses. expenses/settlements.group_id is ON DELETE RESTRICT,
       -- so this is the real signal for whether a hard delete is even possible —
       -- the "Expenses" count elsewhere only counts non-deleted rows and can be 0
       -- while this is still true.
       EXISTS (SELECT 1 FROM expenses e WHERE e.group_id = g.id)
         OR EXISTS (SELECT 1 FROM settlements s WHERE s.group_id = g.id) AS has_history
     FROM groups g
     LEFT JOIN group_members gm  ON gm.group_id = g.id AND gm.user_id = $2
     JOIN group_members gm2 ON gm2.group_id = g.id
     WHERE g.id = $1
     GROUP BY g.id`,
    [groupId, userId]
  )
  const group = result.rows[0]
  if (!group) return null

  // Fetch members list
  const membersResult = await db.query(
    `SELECT u.id, u.username, u.email, gm.role
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId]
  )
  group.members = membersResult.rows

  return group
}

// ── Delete a group ────────────────────────────────────────────────────────────
const deleteGroup = async (groupId) => {
  await db.query('DELETE FROM groups WHERE id = $1', [groupId])
}

// ── Archive a group (soft, reversible — used when a group has expense/settlement
//    history and therefore can't be hard-deleted because of the FK RESTRICT) ──
const archiveGroup = async (groupId) => {
  const result = await db.query(
    `UPDATE groups SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
    [groupId]
  )
  return result.rows[0]
}

// ── Unarchive (reactivate) a group ─────────────────────────────────────────────
const unarchiveGroup = async (groupId) => {
  const result = await db.query(
    `UPDATE groups SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id, is_active`,
    [groupId]
  )
  return result.rows[0]
}

// ── Check if a user is a member of a group ────────────────────────────────────
const isMember = async (groupId, userId) => {
  const result = await db.query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, userId]
  )
  return result.rowCount > 0
}

// ── Get all members of a group ────────────────────────────────────────────────
const getMembers = async (groupId) => {
  const result = await db.query(
    `SELECT u.id, u.username, u.email, gm.role
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId]
  )
  return result.rows
}

// ── Remove a member from a group ──────────────────────────────────────────────
const removeMember = async ({ groupId, requesterId, targetUserId }) => {
  // Fetch both users' membership in one query
  const membershipResult = await db.query(
    `SELECT user_id, role FROM group_members WHERE group_id = $1 AND user_id = ANY($2)`,
    [groupId, [requesterId, targetUserId]]
  )
  const rows = membershipResult.rows
  const requesterRow = rows.find(r => r.user_id === requesterId)
  const targetRow    = rows.find(r => r.user_id === targetUserId)

  if (!requesterRow) {
    const err = new Error('You are not a member of this group')
    err.status = 403
    throw err
  }
  if (!targetRow) {
    const err = new Error('That user is not a member of this group')
    err.status = 404
    throw err
  }

  // Only the owner can remove others; members can only remove themselves
  const isSelf  = requesterId === targetUserId
  const isOwner = requesterRow.role === 'owner'
  if (!isSelf && !isOwner) {
    const err = new Error('Only the group owner can remove other members')
    err.status = 403
    throw err
  }

  // The owner cannot leave or be removed — delete the group instead
  if (targetRow.role === 'owner') {
    const err = new Error('The group owner cannot be removed. Delete the group instead.')
    err.status = 409
    throw err
  }

  // Block if the target has unsettled balances (they owe or are owed)
  const balanceResult = await db.query(
    `SELECT
       (
         SELECT COUNT(*) FROM expense_splits es
         JOIN expenses e ON e.id = es.expense_id
         WHERE e.group_id = $1
           AND es.user_id = $2
           AND es.is_settled = false
           AND e.is_deleted = false
       ) AS owes,
       (
         SELECT COUNT(*) FROM expense_splits es
         JOIN expenses e ON e.id = es.expense_id
         WHERE e.group_id = $1
           AND e.paid_by = $2
           AND es.user_id != $2
           AND es.is_settled = false
           AND e.is_deleted = false
       ) AS owed`,
    [groupId, targetUserId]
  )
  const { owes, owed } = balanceResult.rows[0]
  if (Number(owes) > 0 || Number(owed) > 0) {
    const err = new Error('This member has unsettled balances in this group. Settle all debts before removing them.')
    err.status = 409
    throw err
  }

  await db.query(
    'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, targetUserId]
  )
}

module.exports = { getGroupsForUser, createGroup, getGroupById, deleteGroup, archiveGroup, unarchiveGroup, isMember, getMembers, removeMember }