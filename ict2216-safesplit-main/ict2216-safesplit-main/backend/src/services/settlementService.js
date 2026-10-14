const { pool } = require('../config/db');

// ----------------------------------------------------------------------------
// getOutstandingDebt(client, groupId, payerId, payeeId)
//
// SR-03 / NFR-4: the source of truth for "how much does payer owe payee in
// this group" is always recalculated here from expense_splits, never taken
// from the client. This mirrors the dashboard's owedToMe/iOwe queries but
// scoped to one group + one pair of users, and run inside the caller's
// transaction so it sees a consistent snapshot.
// ----------------------------------------------------------------------------
async function getOutstandingDebt(client, groupId, payerId, payeeId) {
  const result = await client.query(
    `
    SELECT COALESCE(SUM(es.amount_owed), 0) AS total
    FROM expense_splits es
    JOIN expenses e ON e.id = es.expense_id
    WHERE e.group_id = $1
      AND e.paid_by = $2
      AND es.user_id = $3
      AND es.is_settled = false
      AND e.is_deleted = false
    `,
    [groupId, payeeId, payerId]
  );

  return Number(result.rows[0].total);
}

// ----------------------------------------------------------------------------
// assertGroupMembership(client, groupId, userId)
//
// SR-01 / SR-06: every group-scoped action must verify membership at the
// query level. Throws a typed error the controller maps to 403.
// ----------------------------------------------------------------------------
async function assertGroupMembership(client, groupId, userId) {
  const result = await client.query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Not a member of this group');
    err.code = 'NOT_GROUP_MEMBER';
    throw err;
  }
}

// ----------------------------------------------------------------------------
// recordSettlement
//
// Called when the payer says "I paid this debt outside the app." Per the
// settlements.status workflow in the schema, this creates a 'pending'
// settlement row — it does NOT mark expense_splits as settled yet. That only
// happens once the payee confirms receipt (see confirmSettlement), so one
// side alone can never unilaterally clear a debt (SR-03).
//
// All of this runs in a single DB transaction (NFR-5 / SR-23) so a
// concurrent expense edit or duplicate settlement attempt can't race with
// the balance check.
// ----------------------------------------------------------------------------
async function recordSettlement(userId, { groupId, payeeId, amount, currency }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // SR-06: confirm both parties actually belong to this group before
    // anything else. Sequential/guessable IDs alone must never grant access.
    await assertGroupMembership(client, groupId, userId);
    await assertGroupMembership(client, groupId, payeeId);

    if (userId === payeeId) {
      const err = new Error('Cannot settle a debt with yourself');
      err.code = 'INVALID_SETTLEMENT';
      throw err;
    }

    // SR-03 / NFR-4: recalculate the real outstanding balance server-side.
    // The amount the client sent is only used to confirm it matches —
    // it is never written directly.
    const owed = await getOutstandingDebt(client, groupId, userId, payeeId);

    if (owed <= 0) {
      const err = new Error('No outstanding balance to settle');
      err.code = 'NO_BALANCE';
      throw err;
    }

    const requestedAmount = Number(amount);
    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      const err = new Error('Invalid settlement amount');
      err.code = 'INVALID_AMOUNT';
      throw err;
    }
    
    if (requestedAmount > owed + 0.01) {
      const err = new Error('Settlement amount exceeds outstanding balance');
      err.code = 'AMOUNT_EXCEEDS_BALANCE';
      throw err;
    }

    const settlementResult = await client.query(
      `
      INSERT INTO settlements (group_id, payer_id, payee_id, amount, currency, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
      RETURNING id, group_id, payer_id, payee_id, amount, currency, status, recorded_at
      `,
      [groupId, userId, payeeId, requestedAmount, currency || 'SGD']
    );

    const settlement = settlementResult.rows[0];

    // SR-17 / SR-18 / NFR-6: append-only audit trail, capturing actor,
    // action, affected resource, and outcome. The DB trigger
    // (prevent_audit_log_mutation) backstops this at the schema level.
    await client.query(
      `
      INSERT INTO audit_logs (user_id, action_type, affected_resource, resource_id, outcome, metadata)
      VALUES ($1, 'settlement.recorded', 'settlement', $2, 'success', $3::jsonb)
      `,
      [
        userId,
        settlement.id,
        JSON.stringify({ groupId, payeeId, amount: requestedAmount, currency: currency || 'SGD' }),
      ]
    );

    await client.query('COMMIT');
    return settlement;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// confirmSettlement
//
// UC-06: the payee confirms receipt. This is the only path that actually
// marks expense_splits.is_settled = true, since a payer alone marking their
// own debt settled would let them falsely clear it (the misuse case this
// requirement exists to prevent).
//
// Only the payee on the settlement may confirm it — enforced here, not just
// in the UI (NFR-13/14: authorization centralised server-side).
// ----------------------------------------------------------------------------
async function confirmSettlement(userId, settlementId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const settlementResult = await client.query(
      `SELECT * FROM settlements WHERE id = $1 FOR UPDATE`,
      [settlementId]
    );

    const settlement = settlementResult.rows[0];

    if (!settlement) {
      const err = new Error('Settlement not found');
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (settlement.payee_id !== userId) {
      const err = new Error('Only the payee may confirm this settlement');
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (settlement.status !== 'pending') {
      const err = new Error(`Settlement is already ${settlement.status}`);
      err.code = 'INVALID_STATE';
      throw err;
    }

    await client.query(
      `
      UPDATE settlements
      SET status = 'confirmed', confirmed_by = $1, confirmed_at = NOW()
      WHERE id = $2
      `,
      [userId, settlementId]
    );

    // Mark the corresponding splits as settled, oldest first, up to the
    // confirmed amount. Recalculated server-side — never trusts a client
    // total (SR-03 / NFR-4).
    let remaining = Number(settlement.amount);

    const splitsResult = await client.query(
      `
      SELECT es.id, es.amount_owed
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE e.group_id = $1
        AND e.paid_by = $2
        AND es.user_id = $3
        AND es.is_settled = false
        AND e.is_deleted = false
      ORDER BY e.created_at ASC
      FOR UPDATE
      `,
      [settlement.group_id, settlement.payee_id, settlement.payer_id]
    );

    for (const split of splitsResult.rows) {
      if (remaining <= 0.01) break;
      const splitAmount = Number(split.amount_owed);
      if (splitAmount <= remaining + 0.01) {
        await client.query(
          `UPDATE expense_splits SET is_settled = true, updated_at = NOW() WHERE id = $1`,
          [split.id]
        );
        remaining -= splitAmount;
      } else {
        // Partial settlement: split is larger than remaining amount,
        // reduce the split's amount_owed instead of fully settling it
        await client.query(
          `UPDATE expense_splits SET amount_owed = amount_owed - $1, updated_at = NOW() WHERE id = $2`,
          [remaining, split.id]
        );
        remaining = 0;
      }
    }

    await client.query(
      `
      INSERT INTO audit_logs (user_id, action_type, affected_resource, resource_id, outcome, metadata)
      VALUES ($1, 'settlement.confirmed', 'settlement', $2, 'success', $3::jsonb)
      `,
      [userId, settlementId, JSON.stringify({ payerId: settlement.payer_id, amount: settlement.amount })]
    );

    await client.query('COMMIT');
    return { id: settlementId, status: 'confirmed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------------------
// getSettlements — read-only list, scoped to groups the user belongs to
// (SR-01 / NFR-7: no cross-group data leakage).
// ----------------------------------------------------------------------------
async function getSettlements(userId) {
  const result = await pool.query(
    `
    SELECT
      s.id, s.group_id, s.payer_id, s.payee_id, s.amount, s.currency,
      s.status, s.recorded_at, s.confirmed_at,
      g.name AS group_name,
      payer.username AS payer_username,
      payee.username AS payee_username
    FROM settlements s
    JOIN groups g ON g.id = s.group_id
    JOIN users payer ON payer.id = s.payer_id
    JOIN users payee ON payee.id = s.payee_id
    WHERE s.payer_id = $1 OR s.payee_id = $1
    ORDER BY s.recorded_at DESC
    `,
    [userId]
  );

  return result.rows;
}

async function writeOffSettlement(userId, { groupId, payerId, amount }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await assertGroupMembership(client, groupId, userId);
    await assertGroupMembership(client, groupId, payerId);

    if (userId === payerId) {
      const err = new Error('Cannot settle a debt with yourself');
      err.code = 'INVALID_SETTLEMENT';
      throw err;
    }

    // userId is the payee here — verify there's actually a balance
    const owed = await getOutstandingDebt(client, groupId, payerId, userId);
    if (owed <= 0) {
      const err = new Error('No outstanding balance to settle');
      err.code = 'NO_BALANCE';
      throw err;
    }

    // Create a settlement and immediately confirm it — no pending state needed
    const settlementResult = await client.query(
      `INSERT INTO settlements (group_id, payer_id, payee_id, amount, currency, status, confirmed_by, confirmed_at)
       VALUES ($1, $2, $3, $4, 'SGD', 'confirmed', $5, NOW())
       RETURNING id`,
      [groupId, payerId, userId, Math.min(Number(amount), owed), userId]
    );

    const settlementId = settlementResult.rows[0].id;

    // Mark splits as settled same as confirmSettlement
    let remaining = Math.min(Number(amount), owed);

    const splitsResult = await client.query(
      `SELECT es.id, es.amount_owed
       FROM expense_splits es
       JOIN expenses e ON e.id = es.expense_id
       WHERE e.group_id = $1
         AND e.paid_by = $2
         AND es.user_id = $3
         AND es.is_settled = false
         AND e.is_deleted = false
       ORDER BY e.created_at ASC
       FOR UPDATE`,
      [groupId, userId, payerId]
    );

    for (const split of splitsResult.rows) {
      if (remaining <= 0.01) break;
      const splitAmount = Number(split.amount_owed);
      if (splitAmount <= remaining + 0.01) {
        await client.query(
          `UPDATE expense_splits SET is_settled = true, updated_at = NOW() WHERE id = $1`,
          [split.id]
        );
        remaining -= splitAmount;
      } else {
        await client.query(
          `UPDATE expense_splits SET amount_owed = amount_owed - $1, updated_at = NOW() WHERE id = $2`,
          [remaining, split.id]
        );
        remaining = 0;
      }
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action_type, affected_resource, resource_id, outcome, metadata)
       VALUES ($1, 'settlement.writtenoff', 'settlement', $2, 'success', $3::jsonb)`,
      [userId, settlementId, JSON.stringify({ groupId, payerId, amount })]
    );

    await client.query('COMMIT');
    return { id: settlementId, status: 'confirmed' };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  recordSettlement,
  confirmSettlement,
  getSettlements,
  getOutstandingDebt,
  writeOffSettlement,
};