import { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader, CardTitle, CardBody, EmptyState } from '../components/ui/index.jsx'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { fmt, fmtDate } from '../lib/utils'

const CATEGORY_EMOJI = {
  villa: '🏠', flights: '✈️', dinner: '🍽️', utilities: '💡',
  lift: '⛷️', groceries: '🛒', default: '📋',
}
function expenseEmoji(desc = '') {
  const d = (desc || '').toLowerCase()
  if (d.includes('villa') || d.includes('utili')) return CATEGORY_EMOJI.villa
  if (d.includes('flight') || d.includes('plane')) return CATEGORY_EMOJI.flights
  if (d.includes('dinner') || d.includes('food') || d.includes('lunch')) return CATEGORY_EMOJI.dinner
  if (d.includes('lift') || d.includes('ski')) return CATEGORY_EMOJI.lift
  if (d.includes('grocer') || d.includes('market')) return CATEGORY_EMOJI.groceries
  return CATEGORY_EMOJI.default
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true)
        const res = await fetch('/api/dashboard')
        if (!res.ok) throw new Error('Failed to load dashboard')
        const data = await res.json()
        setDashboardData(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  if (loading) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 0', textAlign: 'center', color: 'var(--text2)' }}>
        Loading dashboard…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 0', textAlign: 'center', color: 'var(--red)' }}>
        {error}
      </div>
    )
  }

  const { owedToMe, iOwe, activeGroups, balances, recentExpenses } = dashboardData

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title={`Welcome back, ${user?.username ?? 'there'} 👋`}
        subtitle="Here's a summary of your expenses and balances."
      />

      {/* ── Metric Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 22 }}>
        <MetricCard
          label="Owed to You"
          value={fmt(owedToMe)}
          color="var(--green)"
          bg="var(--green-bg)"
          icon={<ArrowInIcon />}
        />
        <MetricCard
          label="You Owe"
          value={fmt(iOwe)}
          color="var(--red)"
          bg="var(--red-bg)"
          icon={<ArrowOutIcon />}
        />
        <MetricCard
          label="Active Groups"
          value={activeGroups}
          color="var(--teal)"
          bg="var(--teal-bg)"
          icon={<GroupIcon />}
        />
      </div>

      {/* ── Two column ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Balances */}
        <Card>
          <CardHeader>
            <CardTitle>Your Balances</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/settle')}>Settle Up →</Button>
          </CardHeader>
          {balances.length === 0 ? (
            <EmptyState icon="✅" title="All settled up!" description="No outstanding balances with anyone." />
          ) : (
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {balances.map((b) => (
                <BalanceRow key={`${b.groupId}-${b.user.id}`} balance={b} />
              ))}
            </div>
          )}
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/history')}>See all →</Button>
          </CardHeader>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {recentExpenses.map((exp) => {
              const label = exp.title || exp.description
              return (
                <ActivityRow
                  key={exp.id}
                  emoji={expenseEmoji(label)}
                  description={label}
                  meta={`Paid by ${exp.paid_by_username} · ${fmtDate(exp.created_at)}`}
                  tag={exp.group_name}
                  amount={fmt(exp.amount)}
                />
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}

/* ── Sub-components ── */
function MetricCard({ label, value, trend, trendUp, color, bg, icon }) {
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
            {trend && (
              <p style={{ fontSize: 11.5, color: trendUp ? 'var(--green)' : 'var(--red)', marginTop: 5, fontWeight: 500 }}>
                {trend}
              </p>
            )}
          </div>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color,
          }}>
            {icon}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function BalanceRow({ balance }) {
  const isOwed = balance.amount > 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 18px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar name={balance.user.username} size="md" />
        <div>
          <p style={{ fontWeight: 500, fontSize: 13.5 }}>{balance.user.username}</p>
          <p style={{ fontSize: 12, fontWeight: 500, color: isOwed ? 'var(--green)' : 'var(--red)', marginTop: 1 }}>
            {isOwed ? 'owes you' : 'you owe'} {fmt(Math.abs(balance.amount))}
          </p>
        </div>
      </div>
    </div>
  )
}

function ActivityRow({ emoji, description, meta, tag, amount }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '10px 18px', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: 34, height: 34, background: 'var(--surface2)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0,
      }}>
        {emoji}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {description}
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{meta}</p>
        {tag && (
          <span style={{
            display: 'inline-block', marginTop: 4,
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 5, padding: '1px 7px', fontSize: 11, color: 'var(--text2)',
          }}>
            {tag}
          </span>
        )}
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 13, flexShrink: 0 }}>
        {amount}
      </span>
    </div>
  )
}

function ArrowInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="7 17 17 7" /><polyline points="7 7 17 7 17 17" />
    </svg>
  )
}
function ArrowOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="17 17 7 7" /><polyline points="17 17 7 17 7 7" />
    </svg>
  )
}
function GroupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}