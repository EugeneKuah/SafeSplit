import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import {
  Card, CardBody, Tabs, Modal, ConfirmDialog, EmptyState, Input, Select, Badge, Spinner, useToast,
} from '../components/ui/index.jsx'
import { Avatar, AvatarStack } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { api } from '../services/api'
import { fmt, fmtDate, calculateNetBalances } from '../lib/utils'
import { CURRENCIES } from '../lib/currencies'

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [archiveGroupOpen, setArchiveGroupOpen] = useState(false)
  const [archivingGroup, setArchivingGroup] = useState(false)

  const [activeTab, setActiveTab] = useState('Members')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Real expenses from the DB via GET /api/expenses?groupId=
  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(true)

  const loadGroup = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await api(`/api/groups/${id}`)
      setGroup(data.group)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  const loadExpenses = useCallback(async () => {
    setExpensesLoading(true)
    try {
      const data = await api(`/api/expenses?groupId=${id}`)
      setExpenses(data.expenses || [])
    } catch (err) {
      console.error('Failed to load expenses', err)
    } finally {
      setExpensesLoading(false)
    }
  }, [id])

  useEffect(() => { loadGroup() }, [loadGroup])
  useEffect(() => { loadExpenses() }, [loadExpenses])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spinner size={28} />
      </div>
    )
  }

  if (loadError || !group) {
    return (
      <EmptyState
        icon="🔍"
        title={loadError === 'You are not a member of this group' ? 'No access to this group' : 'Group not found'}
        description={loadError}
        action={<Button onClick={() => navigate('/groups')}>Back to Groups</Button>}
      />
    )
  }

  const members = group.members
  const groupId = group.id

  const sortedExpenses = [...expenses].sort(
    (a, b) => new Date(b.expenseDate || b.createdAt) - new Date(a.expenseDate || a.createdAt)
  )

  const totalSpend = expenses.reduce((s, e) => s + (e.convertedAmount ?? e.amount), 0)
  const myShare = expenses.reduce((s, e) => s + (e.myShare ?? 0), 0)

  const handleAddExpense = async (data) => {
    try {
      const res = await api(`/api/groups/${groupId}/expenses`, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setExpenses((prev) => [res.expense, ...prev])
      setAddOpen(false)
    } catch (err) {
      console.error('Failed to add expense', err)
    }
  }

  const handleEditExpense = async (data) => {
    try {
      const res = await api(`/api/expenses/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
      setExpenses((prev) => prev.map((e) => e.id === editTarget.id ? res.expense : e))
      setEditTarget(null)
    } catch (err) {
      console.error('Failed to update expense', err)
    }
  }

  const handleDelete = async () => {
    const targetId = deleteTarget
    try {
      await api(`/api/expenses/${targetId}`, { method: 'DELETE' })
      setExpenses((prev) => prev.filter((e) => e.id !== targetId))
    } catch (err) {
      console.error('Failed to delete expense', err)
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleDeleteGroup = async () => {
    setDeletingGroup(true)
    try {
      await api(`/api/groups/${id}`, { method: 'DELETE' })
      navigate('/groups')
    } catch (err) {
      console.error('Failed to delete group', err)
      toast.error(err.message || 'Failed to delete group')
    } finally {
      setDeletingGroup(false)
      setDeleteGroupOpen(false)
    }
  }

  const handleArchiveGroup = async () => {
    setArchivingGroup(true)
    try {
      const res = await api(`/api/groups/${id}/archive`, { method: 'PATCH' })
      setGroup(res.group)
      toast.success('Group archived')
    } catch (err) {
      console.error('Failed to archive group', err)
      toast.error(err.message || 'Failed to archive group')
    } finally {
      setArchivingGroup(false)
      setArchiveGroupOpen(false)
    }
  }

  const handleUnarchiveGroup = async () => {
    try {
      const res = await api(`/api/groups/${id}/unarchive`, { method: 'PATCH' })
      setGroup(res.group)
      toast.success('Group reactivated')
    } catch (err) {
      console.error('Failed to reactivate group', err)
      toast.error(err.message || 'Failed to reactivate group')
    }
  }

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {group.name}
            {!group.is_active && <Badge variant="warning">Archived</Badge>}
          </span>
        }
        subtitle={group.description || undefined}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="ghost" size="md" onClick={() => navigate('/groups')}>
              ← Groups
            </Button>
            <Button
              variant="ghost" size="md"
              onClick={() => setInviteOpen(true)}
              disabled={!group.is_active}
              title={!group.is_active ? 'This group is archived — reactivate it to invite members' : undefined}
            >
              <PlusIcon /> Invite Member
            </Button>
            <Button
              size="md"
              onClick={() => setAddOpen(true)}
              disabled={!group.is_active}
              title={!group.is_active ? 'This group is archived — reactivate it to add expenses' : undefined}
            >
              <PlusIcon /> Add Expense
            </Button>
            {group.my_role === 'owner' && group.is_active && (
              group.has_history ? (
                <Button variant="secondary" size="md" onClick={() => setArchiveGroupOpen(true)}>
                  Archive Group
                </Button>
              ) : (
                <Button variant="danger" size="md" onClick={() => setDeleteGroupOpen(true)}>
                  Delete Group
                </Button>
              )
            )}
            {group.my_role === 'owner' && !group.is_active && (
              <Button variant="secondary" size="md" onClick={handleUnarchiveGroup}>
                Reactivate Group
              </Button>
            )}
          </div>
        }
      />

      {/* Members row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
        <AvatarStack users={members} limit={6} size="md" />
        <span style={{ fontSize: 12.5, color: 'var(--text2)', marginLeft: 6 }}>
          {members.length} member{members.length !== 1 ? 's' : ''} · base currency {group.base_currency}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
        {/* ── Main content ── */}
        <Card>
          <Tabs
            tabs={['Members', 'Expenses', 'Balances', 'Transaction History']}
            active={activeTab}
            onChange={setActiveTab}
          />
          <CardBody>
            {activeTab === 'Members' && (
              <MembersTab
                members={members}
                currentUserId={user?.id}
                currentUserRole={group.my_role}
                groupId={group.id}
                onInvite={() => setInviteOpen(true)}
                onMemberRemoved={loadGroup}
              />
            )}
            {activeTab === 'Expenses' && (
              expensesLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Spinner size={22} />
                </div>
              ) : sortedExpenses.length === 0 ? (
                <EmptyState
                  icon="💸"
                  title="No expenses yet"
                  description="Add the first expense for this group."
                  action={<Button onClick={() => setAddOpen(true)}>Add Expense</Button>}
                />
              ) : (
                <div>
                  {sortedExpenses.map((exp) => (
                    <ExpenseRow
                      key={exp.id}
                      expense={exp}
                      members={members}
                      currentUserId={user?.id}
                      onEdit={() => setEditTarget(exp)}
                      onDelete={() => setDeleteTarget(exp.id)}
                    />
                  ))}
                </div>
              )
            )}
            {activeTab === 'Balances' && (
              <BalancesTab expenses={expenses} members={members} currentUserId={user?.id} baseCurrency={group.base_currency} />
            )}
            {activeTab === 'Transaction History' && (
              <EmptyState
                icon="📜"
                title="Transaction history"
                description="Transaction history will appear here once the backend route is implemented."
              />
            )}
          </CardBody>
        </Card>

        {/* ── Sidebar summary ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card>
            <CardBody>
              <SumRow label="Your Role" value={group.my_role} />
              <SumRow
                label="Status"
                value={<Badge variant={group.is_active ? 'success' : 'warning'}>{group.is_active ? 'Active' : 'Archived'}</Badge>}
              />
              <SumRow label="Total Group Spend" value={fmt(totalSpend, group.base_currency)} large />
              <SumRow label="Your Share" value={fmt(myShare, group.base_currency)} />
              <SumRow label="Members" value={members.length} />
              <SumRow label="Expenses" value={expenses.length} last />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                Members
              </p>
              {members.map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                  <Avatar name={m.username} size="sm" />
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{m.username}</span>
                    {m.id === group.created_by && (
                      <Badge variant="teal" style={{ marginLeft: 6, fontSize: 10 }}>owner</Badge>
                    )}
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        groupId={id}
        onInvited={loadGroup}
      />

      {/* Add / Edit Expense Modal */}
      <AddExpenseModal
        isOpen={addOpen || !!editTarget}
        mode={editTarget ? 'edit' : 'add'}
        expense={editTarget}
        members={members}
        currentUserId={user?.id}
        baseCurrency={group.base_currency}
        onClose={() => { setAddOpen(false); setEditTarget(null) }}
        onSubmit={editTarget ? handleEditExpense : handleAddExpense}
      />

      {/* Delete Expense Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Expense"
        description="This will permanently delete this expense and all its splits. The action will be logged in the audit log."
        confirmText="Delete"
        variant="danger"
      />

      {/* Delete Group Confirm */}
      <ConfirmDialog
        isOpen={deleteGroupOpen}
        onClose={() => setDeleteGroupOpen(false)}
        onConfirm={handleDeleteGroup}
        title="Delete Group"
        description="This will permanently delete the group and all its expenses. This action cannot be undone."
        confirmText={deletingGroup ? 'Deleting...' : 'Delete Group'}
        variant="danger"
      />

      {/* Archive Group Confirm */}
      <ConfirmDialog
        isOpen={archiveGroupOpen}
        onClose={() => setArchiveGroupOpen(false)}
        onConfirm={handleArchiveGroup}
        title="Archive Group"
        description="This group has expense or settlement history, so it can't be permanently deleted. Archiving will hide it from active use — members won't be able to add expenses or invite new members — but its history is preserved. You can reactivate it later."
        confirmText={archivingGroup ? 'Archiving...' : 'Archive Group'}
        variant="primary"
      />
    </div>
  )
}


/* ── Members Tab ── */
function MembersTab({ members, currentUserId, currentUserRole, groupId, onInvite, onMemberRemoved }) {
  const navigate = useNavigate()
  const [confirmTarget, setConfirmTarget] = useState(null) // { id, username, isSelf }
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  const isOwner = currentUserRole === 'owner'

  const handleRemove = async () => {
    if (!confirmTarget) return
    setRemoving(true)
    setRemoveError('')
    try {
      await api(`/api/groups/${groupId}/members/${confirmTarget.id}`, { method: 'DELETE' })
      setConfirmTarget(null)
      if (confirmTarget.isSelf) {
        // Left the group — go back to the groups list
        navigate('/groups')
      } else {
        await onMemberRemoved()
      }
    } catch (err) {
      setRemoveError(err.message)
      setRemoving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>
          {members.length} member{members.length !== 1 ? 's' : ''} in this group
        </p>
        <Button variant="ghost" size="sm" onClick={onInvite}>
          <PlusIcon /> Invite
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {members.map((m) => {
          const isSelf = m.id === currentUserId
          const isTarget = m.role !== 'owner' && (isOwner || isSelf)
          return (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 4px', borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={m.username} size="md" />
                <div>
                  <p style={{ fontWeight: 500, fontSize: 13.5 }}>
                    {m.username}{' '}
                    {isSelf && <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(you)</span>}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{m.email}</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Badge variant={m.role === 'owner' ? 'teal' : 'default'}>{m.role}</Badge>
                {isTarget && (
                  <IconButton
                    title={isSelf ? 'Leave group' : `Remove ${m.username}`}
                    danger
                    onClick={() => setConfirmTarget({ id: m.id, username: m.username, isSelf })}
                  >
                    {isSelf
                      ? /* door/leave icon */
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                      : <TrashIcon />
                    }
                  </IconButton>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Confirm dialog */}
      {confirmTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
          onClick={(e) => { if (e.target === e.currentTarget && !removing) setConfirmTarget(null) }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
            padding: 28, maxWidth: 400, width: '90%',
            border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              {confirmTarget.isSelf ? 'Leave group?' : `Remove ${confirmTarget.username}?`}
            </h3>
            <p style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 6 }}>
              {confirmTarget.isSelf
                ? 'You will lose access to this group and its expenses. You can only rejoin if a member invites you again.'
                : `${confirmTarget.username} will lose access to this group immediately.`}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 20 }}>
              This will be blocked if there are unsettled balances.
            </p>
            {removeError && (
              <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 14, padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 8 }}>
                {removeError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => { setConfirmTarget(null); setRemoveError('') }} disabled={removing}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRemove} disabled={removing}>
                {removing ? 'Removing…' : confirmTarget.isSelf ? 'Leave Group' : 'Remove Member'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Expense Row ── */
function ExpenseRow({ expense, members, currentUserId, onEdit, onDelete }) {
  const isMine = expense.paidBy === currentUserId || expense.paid_by === currentUserId
  const d = new Date(expense.expenseDate || expense.createdAt)
  const payerName = expense.payerUsername || members.find((m) => m.id === (expense.paidBy || expense.paid_by))?.username || '?'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '11px 0', borderBottom: '1px solid var(--border)', position: 'relative',
      }}
      onMouseEnter={(e) => { e.currentTarget.querySelector('.exp-acts').style.opacity = 1 }}
      onMouseLeave={(e) => { e.currentTarget.querySelector('.exp-acts').style.opacity = 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
        <div>
          <p style={{ fontWeight: 500, fontSize: 13.5 }}>{expense.title || expense.description}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Avatar name={payerName} size="xs" />
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              {isMine ? 'You' : payerName} paid {fmt(expense.amount, expense.currency || expense.groupBaseCurrency)}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: 'var(--text3)' }}>Your share</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13.5 }}>
            {expense.myShare != null ? fmt(expense.myShare, expense.groupBaseCurrency) : '—'}
          </p>
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

/* ── Balances Tab ── */
function BalancesTab({ expenses, members, currentUserId, baseCurrency }) {
  if (expenses.length === 0) {
    return <EmptyState icon="⚖️" title="All balanced!" description="No outstanding balances in this group." />
  }

  const balanceMap = {}
  members.forEach((m) => { balanceMap[m.id] = 0 })

  expenses.forEach((exp) => {
    const payer = exp.paidBy || exp.paid_by
      ; (exp.splits || []).forEach((s) => {
        if (s.userId === currentUserId && payer !== currentUserId) {
          balanceMap[payer] = (balanceMap[payer] || 0) - Number(s.amountOwed)
        } else if (payer === currentUserId && s.userId !== currentUserId) {
          balanceMap[s.userId] = (balanceMap[s.userId] || 0) + Number(s.amountOwed)
        }
      })
  })

  const balances = members
    .filter((m) => m.id !== currentUserId && Math.abs(balanceMap[m.id] || 0) > 0.005)
    .map((m) => ({ user: m, amount: balanceMap[m.id] || 0 }))

  if (balances.length === 0) {
    return <EmptyState icon="⚖️" title="All balanced!" description="No outstanding balances in this group." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {balances.map((b) => {
        const isOwed = b.amount > 0
        return (
          <div key={b.user.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: 'var(--surface2)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar name={b.user.username} size="md" />
              <div>
                <p style={{ fontWeight: 500, fontSize: 13.5 }}>{b.user.username}</p>
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
                  {isOwed ? 'owes you' : 'you owe'}
                </p>
              </div>
            </div>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500,
              color: isOwed ? 'var(--green)' : 'var(--red)',
            }}>
              {fmt(Math.abs(b.amount), baseCurrency)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

/* ── Add / Edit Expense Modal ── */
function AddExpenseModal({ isOpen, mode, expense, members, currentUserId, baseCurrency, onClose, onSubmit }) {
  const isEdit = mode === 'edit'
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(baseCurrency || 'SGD')
  const [paidBy, setPaidBy] = useState(currentUserId ?? undefined)
  const [splitMethod, setSplitMethod] = useState('equal')
  const [customShares, setCustomShares] = useState({})
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (isEdit && expense) {
      setTitle(expense.title || expense.description || '')
      setDescription(expense.description || '')
      setAmount(String(expense.amount))
      setCurrency(expense.currency || baseCurrency || 'SGD')
      setSplitMethod(expense.splitMethod === 'custom' ? 'custom' : 'equal')
      setExpenseDate(expense.expenseDate ? expense.expenseDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
      const shares = {}
        ; (expense.splits || []).forEach((s) => { shares[s.userId] = String(s.amountOwed) })
      setCustomShares(shares)
      setPaidBy(currentUserId ?? undefined)
    } else {
      setTitle(''); setDescription(''); setAmount('')
      setCurrency(baseCurrency || 'SGD'); setSplitMethod('equal')
      setCustomShares({}); setPaidBy(currentUserId ?? undefined)
      setExpenseDate(new Date().toISOString().slice(0, 10))
    }
  }, [isOpen, isEdit, expense, baseCurrency, currentUserId])

  const numAmount = parseFloat(amount) || 0
  const customTotal = Object.values(customShares).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const diff = numAmount - customTotal
  const isCustomValid = Math.abs(diff) < 0.01 && numAmount > 0
  const isValid = title.trim() && numAmount > 0 && (splitMethod === 'equal' || isCustomValid)

  const handleSubmit = async () => {
    if (!isValid) return
    setSaving(true)
    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      amount: numAmount,
      currency,
      splitMethod,
      expenseDate,
    }
    if (!isEdit) body.paidBy = paidBy
    if (splitMethod === 'custom') {
      body.splits = members.map((m) => ({ userId: m.id, amount: parseFloat(customShares[m.id]) || 0 }))
    }
    try {
      await onSubmit(body)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Expense' : 'Add an Expense'} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dinner at Locavore" autoFocus />
        <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a note..." />
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
          <Input label="Amount" type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </Select>
        </div>
        {!isEdit && (
          <Select label="Paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.id === currentUserId ? `You (${m.username})` : m.username}</option>
            ))}
          </Select>
        )}
        <Input label="Date" type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />

        {/* Split method */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', marginBottom: 6 }}>Split method</p>
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 4, border: '1px solid var(--border)' }}>
            {['equal', 'custom'].map((m) => (
              <button key={m} onClick={() => setSplitMethod(m)} style={{
                flex: 1, padding: '6px 0', borderRadius: 6,
                background: splitMethod === m ? 'var(--surface)' : 'transparent',
                color: splitMethod === m ? 'var(--text)' : 'var(--text2)',
                fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 13,
                cursor: 'pointer', textTransform: 'capitalize',
                border: splitMethod === m ? '1px solid var(--border2)' : '1px solid transparent',
              }}>
                {m === 'equal' ? `Equal (${fmt(numAmount / members.length, currency)} each)` : 'Custom'}
              </button>
            ))}
          </div>
        </div>

        {splitMethod === 'custom' && (
          <div style={{ background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>Split amounts</p>
              {numAmount > 0 && (
                <span style={{ fontSize: 11.5, fontWeight: 500, color: isCustomValid ? 'var(--green)' : 'var(--red)' }}>
                  {isCustomValid ? '✓ Matches total' : `Off by ${fmt(Math.abs(diff), currency)}`}
                </span>
              )}
            </div>
            {members.map((m) => (
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

/* ── Invite Member Modal ── */
function InviteMemberModal({ isOpen, onClose, groupId, onInvited }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const handleClose = () => { setEmail(''); setError(''); setSuccessMsg(''); onClose() }

  const handleSubmit = async () => {
    if (!email.trim()) return
    setSubmitting(true); setError(''); setSuccessMsg('')
    try {
      const data = await api(`/api/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      })
      setSuccessMsg(`Invite sent to ${data.invitee.email}. They'll appear here once they accept.`)
      setEmail('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Invite Member" width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input
          label="Member's email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          error={error} autoFocus
        />
        {successMsg && <p style={{ fontSize: 12.5, color: 'var(--green)' }}>{successMsg}</p>}
        <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
          They must already have a SafeSplit account. They'll receive a pending invite
          and will need to accept before they can see the group.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={handleClose}>Close</Button>
          <Button onClick={handleSubmit} disabled={!email.trim() || submitting}>
            {submitting ? <Spinner size={14} /> : 'Send Invite'}  {/* changed from 'Add Member' */}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Shared sub-components ── */
function SumRow({ label, value, large, last }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: last ? 'none' : '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: large ? 15 : 13.5, fontWeight: large ? 600 : 500 }}>{value}</span>
    </div>
  )
}

function IconButton({ children, title, disabled, danger, onClick }) {
  return (
    <button title={title} disabled={disabled} onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)',
      background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text2)',
      opacity: disabled ? 0.3 : 1, transition: 'all var(--transition)',
    }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = danger ? 'var(--red-bg)' : 'var(--surface)'; e.currentTarget.style.color = danger ? 'var(--red)' : 'var(--text)' } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text2)' }}
    >{children}</button>
  )
}
function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> }
function EditIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> }
function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg> }