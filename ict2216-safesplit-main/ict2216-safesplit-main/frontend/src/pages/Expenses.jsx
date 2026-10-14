import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import {
  Card, CardBody, Modal, ConfirmDialog, EmptyState,
  Input, Select, Badge, Spinner, useToast,
} from '../components/ui/index.jsx'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { fmt } from '../lib/utils'
import { CURRENCIES } from '../lib/currencies'
import { api } from '../services/api'

export default function Expenses() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [groups, setGroups] = useState([])
  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(true)

  const [groupFilter, setGroupFilter] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [displayCurrency, setDisplayCurrency] = useState('SGD')
  const [rates, setRates] = useState({}) // { [groupBaseCurrency]: rate -> displayCurrency }

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('/api/groups')
      .then((data) => setGroups(data.groups))
      .catch((err) => toast.error(err.message))
  }, [])

  // Debounce the search box rather than firing a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadExpenses = useCallback(() => {
    setExpensesLoading(true)
    const params = new URLSearchParams()
    if (groupFilter) params.set('groupId', groupFilter)
    if (search) params.set('search', search)
    api(`/api/expenses?${params.toString()}`)
      .then((data) => setExpenses(data.expenses))
      .catch((err) => toast.error(err.message))
      .finally(() => setExpensesLoading(false))
  }, [groupFilter, search])

  useEffect(() => { loadExpenses() }, [loadExpenses])

  useEffect(() => {
    const uniqueBases = [...new Set(expenses.map((e) => e.groupBaseCurrency))]
      .filter((c) => c && c !== displayCurrency)
    if (uniqueBases.length === 0) { setRates({}); return }

    let cancelled = false
    Promise.all(
      uniqueBases.map((c) =>
        api(`/api/currency/rate?from=${c}&to=${displayCurrency}`)
          .then((d) => [c, d.rate])
          .catch(() => [c, null]) // provider hiccup shouldn't break the whole page
      )
    ).then((pairs) => {
      if (cancelled) return
      const map = {}
      pairs.forEach(([c, rate]) => { if (rate != null) map[c] = rate })
      setRates(map)
    })
    return () => { cancelled = true }
  }, [expenses, displayCurrency])

  const { totalSpent, yourShare, convertedCount } = useMemo(() => {
    let total = 0, mine = 0, counted = 0
    for (const e of expenses) {
      const r = e.groupBaseCurrency === displayCurrency ? 1 : rates[e.groupBaseCurrency]
      if (r == null) continue // rate not in yet — skip rather than show a wrong number
      total += e.convertedAmount * r
      if (e.myShare != null) mine += e.myShare * r
      counted++
    }
    return { totalSpent: total, yourShare: mine, convertedCount: counted }
  }, [expenses, rates, displayCurrency])

  const missingRates = expenses.length > 0 && convertedCount < expenses.length

  async function handleCreate({ groupId, body }) {
    setSaving(true)
    try {
      await api(`/api/groups/${groupId}/expenses`, { method: 'POST', body: JSON.stringify(body) })
      toast.success('Expense added')
      setAddOpen(false)
      loadExpenses()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate({ body }) {
    setSaving(true)
    try {
      await api(`/api/expenses/${editTarget.id}`, { method: 'PUT', body: JSON.stringify(body) })
      toast.success('Expense updated')
      setEditTarget(null)
      loadExpenses()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const target = deleteTarget
    try {
      await api(`/api/expenses/${target.id}`, { method: 'DELETE' })
      toast.success('Expense deleted')
      setExpenses((prev) => prev.filter((e) => e.id !== target.id))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Expenses"
        subtitle={`${expenses.length} expense${expenses.length === 1 ? '' : 's'} across your groups`}
        action={
          <Button size="md" onClick={() => setAddOpen(true)} disabled={groups.length === 0}>
            <PlusIcon /> Add Expense
          </Button>
        }
      />

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 0.7fr', gap: 12, marginBottom: 18 }}>
        <Select label="Group" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
          <option value="">All groups</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <Input
          label="Search"
          placeholder="Search by title..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <Select label="Show totals in" value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </Select>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: missingRates ? 8 : 22 }}>
        <MetricCard label="Total Spent" value={fmt(totalSpent, displayCurrency)} color="var(--teal)" bg="var(--teal-bg)" icon={<WalletIcon />} />
        <MetricCard label="Your Share" value={fmt(yourShare, displayCurrency)} color="var(--blue)" bg="var(--blue-bg)" icon={<SplitIcon />} />
        <MetricCard label="Expenses" value={expenses.length} color="var(--green)" bg="var(--green-bg)" icon={<ListIcon />} />
      </div>
      {missingRates && (
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 22 }}>
          Some totals above exclude expenses whose group currency couldn't be converted to {displayCurrency} right now.
        </p>
      )}

      {/* List */}
      <Card>
        {expensesLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No expenses yet"
            description={groups.length === 0 ? "You're not in any groups yet." : 'Add your first expense to get started.'}
            action={groups.length > 0 && <Button onClick={() => setAddOpen(true)}>Add Expense</Button>}
          />
        ) : (
          <div style={{ padding: '4px 18px' }}>
            {expenses.map((e) => (
              <ExpenseListRow
                key={e.id}
                expense={e}
                currentUserId={user?.id}
                onGroupClick={() => navigate(`/groups/${e.groupId}`)}
                onEdit={() => setEditTarget(e)}
                onDelete={() => setDeleteTarget(e)}
              />
            ))}
          </div>
        )}
      </Card>

      <AddEditExpenseModal
        isOpen={addOpen || !!editTarget}
        mode={editTarget ? 'edit' : 'add'}
        expense={editTarget}
        groups={groups}
        currentUserId={user?.id}
        saving={saving}
        onClose={() => { setAddOpen(false); setEditTarget(null) }}
        onSubmitCreate={handleCreate}
        onSubmitUpdate={handleUpdate}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete expense?"
        description={`This will permanently remove "${deleteTarget?.title}" and its splits. This can't be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}

function MetricCard({ label, value, color, bg, icon }) {
  return (
    <Card>
      <CardBody>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {label}
            </p>
            <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 500, color }}>
              {value}
            </h3>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
            {icon}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function ExpenseListRow({ expense, currentUserId, onGroupClick, onEdit, onDelete }) {
  const isMine = expense.isMine
  const d = new Date(expense.expenseDate)
  const crossCurrency = expense.currency !== expense.groupBaseCurrency
  const settleCurrency = expense.groupSettleCurrency || expense.groupBaseCurrency
  const needsSettleConversion = settleCurrency !== expense.groupBaseCurrency
  const [settledShare, setSettledShare] = useState(null)
  const [settleLoading, setSettleLoading] = useState(false)

  useEffect(() => {
    if (!needsSettleConversion || expense.myShare == null) {
      setSettledShare(expense.myShare)
      return
    }
    let cancelled = false
    setSettleLoading(true)
    api(`/api/currency/rate?from=${expense.groupBaseCurrency}&to=${settleCurrency}&amount=${expense.myShare}`)
      .then((d) => { if (!cancelled) setSettledShare(d.converted) })
      .catch(() => { if (!cancelled) setSettledShare(null) })
      .finally(() => { if (!cancelled) setSettleLoading(false) })
    return () => { cancelled = true }
  }, [expense.myShare, expense.groupBaseCurrency, settleCurrency, needsSettleConversion])

  return (
    <div
      className="expense-row"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border)' }}
      onMouseEnter={(e) => { e.currentTarget.querySelector('.exp-acts').style.opacity = 1 }}
      onMouseLeave={(e) => { e.currentTarget.querySelector('.exp-acts').style.opacity = 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 42, height: 42, background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 10, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text2)', letterSpacing: 1 }}>
            {d.toLocaleString('default', { month: 'short' })}
          </span>
          <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', lineHeight: 1, fontFamily: 'var(--font-display)' }}>
            {d.getDate()}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {expense.title}
            </p>
            <span
              onClick={onGroupClick}
              style={{
                cursor: 'pointer', flexShrink: 0,
                background: 'var(--surface2)', border: '1px solid var(--border2)',
                borderRadius: 5, padding: '1px 7px', fontSize: 11, color: 'var(--text2)',
              }}
            >
              {expense.groupName}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
            <Avatar name={expense.payerUsername} size="xs" />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {expense.paidBy === currentUserId ? 'You' : expense.payerUsername} paid {fmt(expense.amount, expense.currency)}
            </span>
            {crossCurrency && (
              <Badge variant="info">≈ {fmt(expense.convertedAmount, expense.groupBaseCurrency)}</Badge>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>Your share</p>
          {settleLoading ? (
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13.5, color: 'var(--text3)' }}>…</p>
          ) : settledShare != null ? (
            <div>
              <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13.5 }}>
                {fmt(settledShare, settleCurrency)}
              </p>
              {needsSettleConversion && expense.myShare != null && (
                <p style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1 }}>
                  ≈ {fmt(expense.myShare, expense.groupBaseCurrency)}
                </p>
              )}
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13.5 }}>—</p>
          )}
        </div>
        <div className="exp-acts" style={{ display: 'flex', gap: 4, opacity: 0, transition: 'opacity var(--transition)' }}>
          <IconButton title={!isMine ? 'Only the expense creator can edit' : 'Edit'} disabled={!isMine} onClick={onEdit}>
            <EditIcon />
          </IconButton>
          <IconButton title={!isMine ? 'Only the expense creator can delete' : 'Delete'} disabled={!isMine} danger onClick={onDelete}>
            <TrashIcon />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

/* ── Add / Edit modal ──
   Add mode: pick a group first (fetches its members + defaults currency
   to the group's base currency), then everything else. 
   Edit mode: group is fixed and `paidBy` isn't shown at all — the backend enforces that
   only the original creator can edit, and never changes who paid, so
   there's nothing useful to do with that field here. */
function AddEditExpenseModal({ isOpen, mode, expense, groups, currentUserId, saving, onClose, onSubmitCreate, onSubmitUpdate }) {
  const isEdit = mode === 'edit'

  const [groupId, setGroupId] = useState('')
  const [members, setMembers] = useState([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [paidBy, setPaidBy] = useState(currentUserId ?? undefined)
  const [splitMethod, setSplitMethod] = useState('equal')
  const [customShares, setCustomShares] = useState({})
  const [expenseDate, setExpenseDate] = useState('')
  const [convertedPreview, setConvertedPreview] = useState(null)
  const [rateLoading, setRateLoading] = useState(false)

  const selectedGroup = groups.find((g) => g.id === groupId)
  const baseCurrency = selectedGroup?.base_currency

  // Reset/prefill whenever the modal opens (for either add or edit).
  useEffect(() => {
    if (!isOpen) return
    if (isEdit && expense) {
      setGroupId(expense.groupId)
      setTitle(expense.title)
      setDescription(expense.description || '')
      setAmount(String(expense.amount))
      setCurrency(expense.currency)
      setSplitMethod(expense.splitMethod === 'custom' ? 'custom' : 'equal')
      setExpenseDate(expense.expenseDate ? expense.expenseDate.slice(0, 10) : '')
      const shares = {}
      ;(expense.splits || []).forEach((s) => { shares[s.userId] = String(s.amountOwed) })
      setCustomShares(shares)
      setPaidBy(currentUserId ?? undefined)
    } else {
      const onlyGroup = groups.length === 1 ? groups[0] : null
      setGroupId(onlyGroup?.id || '')
      setTitle('')
      setDescription('')
      setAmount('')
      // Leave blank (not 'SGD') when no group is preselected — a non-empty
      // default here would block the group-currency-default effect below,
      // since it only fills in when currency is still falsy.
      setCurrency(onlyGroup?.base_currency || '')
      setSplitMethod('equal')
      setCustomShares({})
      setExpenseDate(new Date().toISOString().slice(0, 10))
      setPaidBy(currentUserId ?? undefined)
    }
  }, [isOpen, isEdit, expense, groups, currentUserId])

  // Members are needed both to populate "Paid by" (add mode) and the
  // custom-split rows (either mode).
  useEffect(() => {
    if (!groupId) { setMembers([]); return }
    setMembersLoading(true)
    api(`/api/groups/${groupId}/members`)
      .then((data) => setMembers(data.members))
      .catch(() => setMembers([]))
      .finally(() => setMembersLoading(false))
  }, [groupId])

  // Picking a group (add mode) defaults the currency to that group's base
  // currency — only if the user hasn't already typed something else in.
  useEffect(() => {
    if (!isEdit && selectedGroup) setCurrency((c) => c || selectedGroup.base_currency)
  }, [isEdit, selectedGroup])

  const numAmount = parseFloat(amount) || 0
  const sameCurrency = !baseCurrency || currency === baseCurrency

  // Debounced live conversion preview — mirrors the server's own
  // "skip the network call when currencies already match" short-circuit.
  useEffect(() => {
    if (sameCurrency) { setConvertedPreview(numAmount > 0 ? numAmount : null); return }
    if (numAmount <= 0) { setConvertedPreview(null); return }
    setRateLoading(true)
    const t = setTimeout(() => {
      api(`/api/currency/rate?from=${currency}&to=${baseCurrency}&amount=${numAmount}`)
        .then((d) => setConvertedPreview(d.converted))
        .catch(() => setConvertedPreview(null))
        .finally(() => setRateLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [currency, baseCurrency, numAmount, sameCurrency])

  const convertedTotal = convertedPreview
  const customTotal = Object.values(customShares).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const diff = (convertedTotal || 0) - customTotal
  const isCustomValid = convertedTotal != null && convertedTotal > 0 && Math.abs(diff) < 0.01
  const isValid = groupId && title.trim() && numAmount > 0 && convertedTotal != null &&
    (splitMethod === 'equal' || isCustomValid) &&
    (isEdit || (paidBy && members.some((m) => m.id === paidBy)))

  function buildBody() {
    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      amount: numAmount,
      currency,
      splitMethod,
      expenseDate: expenseDate || undefined,
    }
    if (!isEdit) body.paidBy = paidBy
    if (splitMethod === 'custom') {
      body.splits = members.map((m) => ({ userId: m.id, amount: parseFloat(customShares[m.id]) || 0 }))
    }
    return body
  }

  function handleSubmit() {
    if (!isValid) return
    if (isEdit) onSubmitUpdate({ body: buildBody() })
    else onSubmitCreate({ groupId, body: buildBody() })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Expense' : 'Add an Expense'} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isEdit ? (
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 5 }}>Group</p>
            <p style={{ fontSize: 13.5, fontWeight: 500 }}>{expense?.groupName}</p>
          </div>
        ) : (
          <Select label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)} autoFocus>
            <option value="">Choose a group...</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.base_currency})</option>)}
          </Select>
        )}

        {groupId && (
          <>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner at Locavore" />
            <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a note..." />

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
              <Input label="Amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
              </Select>
            </div>
            {!sameCurrency && numAmount > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--text2)' }}>
                {rateLoading
                  ? 'Converting…'
                  : convertedPreview != null
                    ? `≈ ${fmt(convertedPreview, baseCurrency)} — this group runs in ${baseCurrency}`
                    : "Couldn't fetch a live rate just now — try again in a moment."}
              </p>
            )}

            {!isEdit && (
              <Select label="Paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} disabled={membersLoading}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.id === currentUserId ? `You (${m.username})` : m.username}</option>
                ))}
              </Select>
            )}

            <Input label="Date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />

            {/* Split method toggle */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>Split method</p>
              <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 4, border: '1px solid var(--border)' }}>
                {['equal', 'custom'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setSplitMethod(m)}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 6,
                      background: splitMethod === m ? 'var(--surface)' : 'transparent',
                      color: splitMethod === m ? 'var(--text)' : 'var(--text2)',
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
                      cursor: 'pointer', textTransform: 'capitalize',
                      border: splitMethod === m ? '1px solid var(--border2)' : '1px solid transparent',
                    }}
                  >
                    {m === 'equal'
                      ? `Equal (${members.length > 0 && convertedTotal != null ? fmt(convertedTotal / members.length, baseCurrency) : '—'} each)`
                      : 'Custom'}
                  </button>
                ))}
              </div>
            </div>

            {splitMethod === 'custom' && (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Split amounts ({baseCurrency})</p>
                  {convertedTotal != null && convertedTotal > 0 && (
                    <span style={{ fontSize: 11.5, fontWeight: 500, color: isCustomValid ? 'var(--green)' : 'var(--red)' }}>
                      {isCustomValid ? '✓ Matches total' : `Off by ${fmt(Math.abs(diff), baseCurrency)}`}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
                  Enter each person's share in {baseCurrency} — this group's currency, not {currency}.
                </p>
                {membersLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}><Spinner size={16} /></div>
                ) : members.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Avatar name={m.username} size="sm" />
                      <span style={{ fontSize: 13 }}>{m.id === currentUserId ? 'You' : m.username}</span>
                    </div>
                    <Input
                      type="number" step="0.01" min="0" placeholder="0.00"
                      value={customShares[m.id] || ''}
                      onChange={(e) => setCustomShares((p) => ({ ...p, [m.id]: e.target.value }))}
                      style={{ width: 88, textAlign: 'right' }}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!isValid || saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Expense'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function IconButton({ children, title, disabled, danger, onClick }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)',
        background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text2)',
        opacity: disabled ? 0.3 : 1, transition: 'all var(--transition)',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger ? 'var(--red-bg)' : 'var(--surface)'
          e.currentTarget.style.color = danger ? 'var(--red)' : 'var(--text)'
          e.currentTarget.style.borderColor = danger ? 'var(--red-border)' : 'var(--border3)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--surface2)'
        e.currentTarget.style.color = 'var(--text2)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      {children}
    </button>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
    </svg>
  )
}
function WalletIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 000 4h16v3" />
      <path d="M21 12v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7" />
      <path d="M18 12a2 2 0 000 4h3v-4z" />
    </svg>
  )
}
function SplitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v20" /><path d="M5 6l-3 6a4 4 0 008 0L7 6H5z" /><path d="M19 6l-3 6a4 4 0 008 0l-3-6h-2z" />
    </svg>
  )
}
function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="9" x2="17" y2="9" /><line x1="7" y1="13" x2="17" y2="13" /><line x1="7" y1="17" x2="13" y2="17" />
    </svg>
  )
}
