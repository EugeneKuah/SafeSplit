const crypto = require('crypto');
const { pool } = require('../config/db');
const groupService = require('./groupService');
const { convert, round2 } = require('./currencyService');

function notFound(message = 'Expense not found') {
  const err = new Error(message);
  err.status = 404;
  throw err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  throw err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}


const EXPENSE_SELECT = `
  SELECT
    e.id, e.group_id, g.name AS group_name, g.base_currency AS group_base_currency,
    g.settle_currency AS group_settle_currency,
    e.paid_by, u.username AS payer_username,
    e.title, e.description,
    e.amount, e.currency, e.converted_amount,
    e.split_method, e.expense_date, e.created_at, e.updated_at,
    es.amount_owed AS my_share,
    (
      SELECT COALESCE(json_agg(
        json_build_object(
          'userId', es2.user_id,
          'username', u2.username,
          'amountOwed', es2.amount_owed,
          'isSettled', es2.is_settled
        ) ORDER BY u2.username
      ), '[]'::json)
      FROM expense_splits es2
      JOIN users u2 ON u2.id = es2.user_id
      WHERE es2.expense_id = e.id
    ) AS splits
  FROM expenses e
  JOIN groups g ON g.id = e.group_id
  JOIN users u ON u.id = e.paid_by
  LEFT JOIN expense_splits es ON es.expense_id = e.id AND es.user_id = $1
`;

function shapeExpenseRow(row, currentUserId) {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.group_name,
    groupBaseCurrency: row.group_base_currency,
    groupSettleCurrency: row.group_settle_currency || row.group_base_currency,
    paidBy: row.paid_by,
    payerUsername: row.payer_username,
    title: row.title,
    description: row.description,
    amount: Number(row.amount),
    currency: row.currency,
    convertedAmount: row.converted_amount === null ? null : Number(row.converted_amount),
    splitMethod: row.split_method,
    expenseDate: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    myShare: row.my_share === null ? null : Number(row.my_share),
    isMine: row.paid_by === currentUserId,
    splits: (row.splits || []).map((s) => ({ ...s, amountOwed: Number(s.amountOwed) }))
  };
}

async function listExpensesForUser(userId, { groupId, search } = {}) {
  const conditions = [
    'e.group_id IN (SELECT group_id FROM group_members WHERE user_id = $1)',
    'e.is_deleted = false'
  ];
  const params = [userId];

  if (groupId) {
    params.push(groupId);
    conditions.push(`e.group_id = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`e.title ILIKE $${params.length}`);
  }

  const result = await pool.query(
    `${EXPENSE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY e.expense_date DESC, e.created_at DESC`,
    params
  );
  return result.rows.map((r) => shapeExpenseRow(r, userId));
}

async function getExpenseForUser(expenseId, userId) {
  const result = await pool.query(`${EXPENSE_SELECT} WHERE e.id = $2 AND e.is_deleted = false`, [userId, expenseId]);
  return result.rowCount === 0 ? null : shapeExpenseRow(result.rows[0], userId);
}

// Raw row (no joins/shaping) — just enough for ownership/state checks
// before an edit or delete goes any further.
async function getExpenseRaw(expenseId) {
  const result = await pool.query('SELECT id, group_id, paid_by, is_deleted FROM expenses WHERE id = $1', [expenseId]);
  return result.rows[0] || null;
}

// Cents-based remainder distribution so the splits always sum to exactly
// the converted total — e.g. $10 / 3 people is 3.34 + 3.33 + 3.33, never
// 3.33 + 3.33 + 3.33 = 9.99 lost to float rounding.
function splitEqually(totalAmount, memberIds) {
  const totalCents = Math.round(totalAmount * 100);
  const n = memberIds.length;
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return memberIds.map((userId, i) => ({
    userId,
    amountOwed: round2((base + (i < remainder ? 1 : 0)) / 100)
  }));
}

function validateCustomSplits(splits, memberIds, convertedAmount) {
  if (!Array.isArray(splits) || splits.length === 0) {
    badRequest('Custom split requires at least one split entry');
  }
  const memberSet = new Set(memberIds);
  let sum = 0;
  for (const s of splits) {
    if (!memberSet.has(s.userId)) badRequest('A split was given for someone who is not in this group');
    if (typeof s.amount !== 'number' || s.amount < 0) badRequest('Split amounts must be non-negative numbers');
    sum += s.amount;
  }
  if (Math.abs(round2(sum) - convertedAmount) > 0.01) {
    badRequest(`Split amounts (${round2(sum)}) don't add up to the expense total (${convertedAmount})`);
  }
  return splits.map((s) => ({ userId: s.userId, amountOwed: round2(s.amount) }));
}

async function computeConvertedAmount(amount, currency, baseCurrency) {
  return currency === baseCurrency ? round2(amount) : convert(amount, currency, baseCurrency);
}

async function createExpense({ groupId, creatorId, title, description, amount, currency, paidBy, splitMethod, splits, expenseDate }) {
  // FIX: pass creatorId so the JOIN in getGroupById works correctly
  const group = await groupService.getGroupById(groupId, creatorId);
  if (!group || !group.is_active) notFound('Group not found');

  const members = await groupService.getMembers(groupId);
  const memberIds = members.map((m) => m.id);

  const payerId = paidBy || creatorId;
  if (!memberIds.includes(payerId)) badRequest('The payer must be a member of this group');

  const convertedAmount = await computeConvertedAmount(amount, currency, group.base_currency);
  const computedSplits = splitMethod === 'equal'
    ? splitEqually(convertedAmount, memberIds)
    : validateCustomSplits(splits, memberIds, convertedAmount);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const expenseId = crypto.randomUUID();
    await client.query(
      `INSERT INTO expenses (id, group_id, paid_by, title, description, amount, currency, converted_amount, split_method, expense_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10, CURRENT_DATE))`,
      [expenseId, groupId, payerId, title, description || null, round2(amount), currency, convertedAmount, splitMethod, expenseDate || null]
    );
    for (const s of computedSplits) {
      await client.query(
        'INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ($1, $2, $3)',
        [expenseId, s.userId, s.amountOwed]
      );
    }
    await client.query('COMMIT');
    return expenseId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function updateExpense({ expenseId, requesterId, title, description, amount, currency, splitMethod, splits, expenseDate }) {
  const existing = await getExpenseRaw(expenseId);
  if (!existing || existing.is_deleted) notFound();
  if (existing.paid_by !== requesterId) forbidden('Only the expense creator can edit this expense');

  const group = await groupService.getGroupById(existing.group_id, requesterId);
  const members = await groupService.getMembers(existing.group_id);
  const memberIds = members.map((m) => m.id);

  const convertedAmount = await computeConvertedAmount(amount, currency, group.base_currency);
  const computedSplits = splitMethod === 'equal'
    ? splitEqually(convertedAmount, memberIds)
    : validateCustomSplits(splits, memberIds, convertedAmount);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE expenses
       SET title=$1, description=$2, amount=$3, currency=$4, converted_amount=$5,
           split_method=$6, expense_date=COALESCE($7, expense_date), updated_at=NOW()
       WHERE id = $8`,
      [title, description || null, round2(amount), currency, convertedAmount, splitMethod, expenseDate || null, expenseId]
    );
    await client.query('DELETE FROM expense_splits WHERE expense_id = $1', [expenseId]);
    for (const s of computedSplits) {
      await client.query(
        'INSERT INTO expense_splits (expense_id, user_id, amount_owed) VALUES ($1, $2, $3)',
        [expenseId, s.userId, s.amountOwed]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteExpense({ expenseId, requesterId }) {
  const existing = await getExpenseRaw(expenseId);
  if (!existing || existing.is_deleted) notFound();
  if (existing.paid_by !== requesterId) forbidden('Only the expense creator can delete this expense');
  // Hard delete: expense_splits has ON DELETE CASCADE on expense_id, so its
  // rows are removed automatically along with the expense.
  await pool.query('DELETE FROM expenses WHERE id = $1', [expenseId]);
}

module.exports = {
  listExpensesForUser,
  getExpenseForUser,
  getExpenseRaw,
  createExpense,
  updateExpense,
  deleteExpense,
  splitEqually,
  validateCustomSplits
};