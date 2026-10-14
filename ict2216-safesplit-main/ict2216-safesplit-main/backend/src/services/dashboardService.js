const { pool } = require('../config/db');

async function getDashboardData(userId) {
  // Active groups
  const groupsResult = await pool.query(
    `
    SELECT COUNT(DISTINCT group_id) AS active_groups
    FROM group_members
    WHERE user_id = $1
    `,
    [userId]
  );

  const activeGroups = Number(groupsResult.rows[0]?.active_groups || 0);

  // Recent expenses
  const expensesResult = await pool.query(
    `
    SELECT
      e.id,
      e.group_id,
      e.paid_by,
      e.title,
      e.description,
      e.amount,
      e.created_at,
      g.name AS group_name,
      u.username AS paid_by_username
    FROM expenses e
    JOIN groups g ON g.id = e.group_id
    JOIN users u  ON u.id = e.paid_by
    WHERE e.is_deleted = false
    AND EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = e.group_id
      AND gm.user_id = $1
    )
    ORDER BY e.created_at DESC
    LIMIT 6
    `,
    [userId]
  );

  // Owed to you: you paid, others haven't settled their split
  const owedToMeResult = await pool.query(
    `
    SELECT COALESCE(SUM(es.amount_owed), 0) AS total
    FROM expense_splits es
    JOIN expenses e ON e.id = es.expense_id
    WHERE e.paid_by = $1
      AND es.user_id <> $1
      AND es.is_settled = false
      AND e.is_deleted = false
    `,
    [userId]
  );

  // You owe: someone else paid, your split isn't settled
  const iOweResult = await pool.query(
    `
    SELECT COALESCE(SUM(es.amount_owed), 0) AS total
    FROM expense_splits es
    JOIN expenses e ON e.id = es.expense_id
    WHERE es.user_id = $1
      AND e.paid_by <> $1
      AND es.is_settled = false
      AND e.is_deleted = false
    `,
    [userId]
  );

  // Per-person, per-group balances: net of what they owe you minus what
  // you owe them, scoped to each group so Settle.jsx knows which group a
  // settlement belongs to.
  const balancesResult = await pool.query(
    `
    SELECT
      ledger.group_id,
      ledger.other_user_id,
      u.username,
      ledger.direction,
      SUM(ledger.net_amount) AS net
    FROM (
      -- Positive: others owe you
      SELECT e.group_id, es.user_id AS other_user_id, es.amount_owed AS net_amount, 'owed_to_me' AS direction
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE e.paid_by = $1
        AND es.user_id <> $1
        AND es.is_settled = false
        AND e.is_deleted = false

      UNION ALL

      -- Negative: you owe others
      SELECT e.group_id, e.paid_by AS other_user_id, -es.amount_owed AS net_amount, 'i_owe' AS direction
      FROM expense_splits es
      JOIN expenses e ON e.id = es.expense_id
      WHERE es.user_id = $1
        AND e.paid_by <> $1
        AND es.is_settled = false
        AND e.is_deleted = false
    ) ledger
    JOIN users u ON u.id = ledger.other_user_id
    GROUP BY ledger.group_id, ledger.other_user_id, u.username, ledger.direction
    HAVING SUM(ledger.net_amount) <> 0
    ORDER BY ABS(SUM(ledger.net_amount)) DESC
    `,
    [userId]
  );

  const balances = balancesResult.rows.map((row) => ({
    user: { id: row.other_user_id, username: row.username },
    groupId: row.group_id,
    amount: Number(row.net),
    direction: row.direction,
  }));

  return {
    owedToMe: Number(owedToMeResult.rows[0].total),
    iOwe: Number(iOweResult.rows[0].total),
    activeGroups,
    balances,
    recentExpenses: expensesResult.rows,
  };
}

module.exports = {
  getDashboardData
};