import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { Card, EmptyState, Spinner } from '../components/ui/index.jsx'
import { Avatar } from '../components/ui/Avatar'
import { api } from '../services/api'
import { fmt, fmtDate } from '../lib/utils'

const CATEGORY_EMOJI = (title = '') => {
  const d = title.toLowerCase()
  if (d.includes('villa') || d.includes('util') || d.includes('rent')) return '🏠'
  if (d.includes('flight') || d.includes('plane')) return '✈️'
  if (d.includes('dinner') || d.includes('food') || d.includes('lunch') || d.includes('grocer')) return '🍽️'
  if (d.includes('lift') || d.includes('ski')) return '⛷️'
  return '📋'
}

export default function History() {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [expData, settleData] = await Promise.all([
          api('/api/expenses'),
          api('/api/settlements').catch(() => ({ settlements: [] })),
        ])
        setExpenses(expData.expenses || [])
        // settlementController returns the array directly (not wrapped)
        setSettlements(Array.isArray(settleData) ? settleData : (settleData.settlements || []))
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const timeline = [
    ...expenses.map((e) => ({ ...e, _type: 'expense', _ts: new Date(e.expenseDate || e.createdAt) })),
    ...settlements.map((s) => ({ ...s, _type: 'settlement', _ts: new Date(s.recorded_at) })),
  ].sort((a, b) => b._ts - a._ts)

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="Transaction History"
        subtitle={loading ? 'Loading…' : `${timeline.length} event${timeline.length !== 1 ? 's' : ''} across all groups`}
      />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
          <Spinner size={28} />
        </div>
      ) : error ? (
        <EmptyState icon="⚠️" title="Couldn't load history" description={error} />
      ) : timeline.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No history yet"
          description="Expenses and settlements you record will appear here."
        />
      ) : (
        <Card>
          {timeline.map((item, i) =>
            item._type === 'expense' ? (
              <ExpenseEntry key={`e-${item.id}`} expense={item} currentUserId={user?.id} delay={i * 20} />
            ) : (
              <SettlementEntry key={`s-${item.id}`} settlement={item} currentUserId={user?.id} delay={i * 20} />
            )
          )}
        </Card>
      )}
    </div>
  )
}

function ExpenseEntry({ expense, currentUserId, delay }) {
  const isMine = expense.paidBy === currentUserId || expense.paid_by === currentUserId
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '13px 18px', borderBottom: '1px solid var(--border)',
        animation: `fadeUp 0.22s ease ${delay}ms both`,
        transition: 'background var(--transition)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
    >
      <div style={{
        width: 38, height: 38, background: 'var(--surface2)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, flexShrink: 0, border: '1px solid var(--border)',
      }}>
        {CATEGORY_EMOJI(expense.title)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontWeight: 500, fontSize: 13.5 }}>{expense.title}</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13.5, flexShrink: 0 }}>
            {fmt(expense.amount, expense.currency || expense.groupBaseCurrency)}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <Avatar name={expense.payerUsername || '?'} size="xs" />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {isMine ? 'You' : expense.payerUsername} paid · {fmtDate(expense.expenseDate || expense.createdAt)}
          </span>
          {expense.myShare != null && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>
              · your share {fmt(expense.myShare, expense.groupBaseCurrency)}
            </span>
          )}
        </div>
        {expense.groupName && (
          <span style={{
            display: 'inline-block', marginTop: 5,
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 5, padding: '1px 7px', fontSize: 11, color: 'var(--text2)',
          }}>
            {expense.groupName}
          </span>
        )}
      </div>
    </div>
  )
}

function SettlementEntry({ settlement, currentUserId, delay }) {
  const iPaid = settlement.payer_id === currentUserId
  const iReceived = settlement.payee_id === currentUserId
  const fromName = settlement.payer_username || 'Someone'
  const toName = settlement.payee_username || 'Someone'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '13px 18px', borderBottom: '1px solid var(--border)',
        background: 'rgba(5,150,105,0.03)',
        animation: `fadeUp 0.22s ease ${delay}ms both`,
        transition: 'background var(--transition)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--green-bg)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(5,150,105,0.03)' }}
    >
      <div style={{
        width: 38, height: 38,
        background: 'var(--green-bg)', border: '1px solid rgba(5,150,105,0.25)',
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, flexShrink: 0,
      }}>
        ✅
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontWeight: 500, fontSize: 13.5, color: 'var(--green)' }}>Settlement Recorded</p>
          <p style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13.5, color: 'var(--green)', flexShrink: 0 }}>
            {fmt(settlement.amount, settlement.currency || 'SGD')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Avatar name={iPaid ? 'You' : fromName} size="xs" />
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {iPaid ? 'You' : fromName} → {iReceived ? 'you' : toName} · {fmtDate(settlement.recorded_at)}
          </span>
        </div>
        {(settlement.group_name) && (
          <span style={{
            display: 'inline-block', marginTop: 5,
            background: 'var(--green-bg)', border: '1px solid rgba(5,150,105,0.25)',
            borderRadius: 5, padding: '1px 7px', fontSize: 11, color: 'var(--green)',
          }}>
            {settlement.group_name}
          </span>
        )}
      </div>
    </div>
  )
}
