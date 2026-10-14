/** Format a number as currency. Defaults to SGD so every existing
 *  fmt(amount) call site keeps rendering exactly as it did before. */
export function fmt(amount, currency = 'SGD') {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Math.abs(Number(amount)))
}

/** Format a date string to "Apr 28, 2026" */
export function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Format a datetime string to "Apr 28 · 14:32" */
export function fmtTs(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Get initials from a username or name */
export function getInitials(name = '') {
  const parts = name.trim().split(/[\s_-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Deterministic avatar background color from name */
const AVATAR_COLORS = [
  '#00b882', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#be185d', '#059669', '#9333ea',
]
export function avatarColor(name = '') {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = name.charCodeAt(i) + ((h << 5) - h)
  }
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

/**
 * Calculate net balances for a user given a list of expenses.
 * Matches the calculateBalances() logic in safesplit.test.js.
 * @param {number} userId
 * @param {Array} expenses  - [{id, group_id, paid_by, amount}]
 * @param {Array} members   - [{group_id, user_id}]
 * @param {Array} users     - [{id, username}]
 */
export function calculateNetBalances(userId, expenses, members, users) {
  const balMap = {}

  expenses.forEach((exp) => {
    const groupMembers = members.filter((m) => m.group_id === exp.group_id)
    const inGroup = groupMembers.some((m) => m.user_id === userId)
    if (!inGroup) return

    const share = exp.amount / groupMembers.length

    groupMembers.forEach((m) => {
      if (!balMap[m.user_id]) balMap[m.user_id] = 0
      if (m.user_id === exp.paid_by) balMap[m.user_id] += exp.amount
      balMap[m.user_id] -= share
    })
  })

  return Object.entries(balMap)
    .filter(([id]) => Number(id) !== userId)
    .map(([id, amount]) => ({
      user: users.find((u) => u.id === Number(id)),
      amount: parseFloat(amount.toFixed(2)),
    }))
    .filter((b) => b.user && Math.abs(b.amount) > 0.005)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}
