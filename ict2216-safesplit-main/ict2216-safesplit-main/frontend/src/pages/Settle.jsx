import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { Card, CardHeader, CardTitle, ConfirmDialog, EmptyState } from '../components/ui/index.jsx'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { fmt } from '../lib/utils'

export default function Settle() {
  const { user } = useAuth()

  const [balances, setBalances] = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // confirmTarget shape: { type: 'settle', debt } | { type: 'confirm', settlement }
  const [confirmTarget, setConfirmTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [dashboardRes, settlementsRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/settlements'),
      ])

      if (!dashboardRes.ok) throw new Error('Failed to load balances')
      if (!settlementsRes.ok) throw new Error('Failed to load settlements')

      const dashboardData = await dashboardRes.json()
      const settlementsData = await settlementsRes.json()

      setBalances(dashboardData.balances || [])
      setSettlements(settlementsData || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Map net balances into directional debts. amount > 0 means they owe you
  // (you are the payee); amount < 0 means you owe them (you are the payer).
  const debts = useMemo(() => {
    return balances.map((b) => ({
      otherUser: b.user,
      amount: Math.abs(b.amount),
      isPaying: b.amount < 0,
      groupId: b.groupId,
    }))
  }, [balances])

  // Settlements awaiting the OTHER party's confirmation — i.e. you are the
  // payer, status is still pending. Nothing for you to do here but wait.
  const awaitingThem = useMemo(
    () => settlements.filter((s) => s.status === 'pending' && s.payer_id === user?.id),
    [settlements, user]
  )

  const pendingSettlementMap = useMemo(() => {
    const map = new Map()

    settlements
      .filter(
        (s) =>
          s.status === 'pending' &&
          s.payer_id === user?.id
      )
      .forEach((s) => {
        map.set(`${s.group_id}-${s.payee_id}`, true)
      })

    return map
  }, [settlements, user])

  // Settlements where YOU are the payee and need to confirm receipt before
  // the underlying expense_splits get marked settled.
  const awaitingYou = useMemo(
    () => settlements.filter((s) => s.status === 'pending' && s.payee_id === user?.id),
    [settlements, user]
  )

  const totalOwed = debts.filter((d) => !d.isPaying).reduce((s, d) => s + d.amount, 0)
  const totalOwing = debts.filter((d) => d.isPaying).reduce((s, d) => s + d.amount, 0)

  const handleConfirmDialog = async () => {
    if (!confirmTarget) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      if (confirmTarget.type === 'settle') {
      const debt = confirmTarget.debt
      if (!debt.isPaying) {
        // User is the payee — directly write off the debt, no confirmation needed
        const res = await fetch('/api/settlements/writeoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: debt.groupId,
            payerId: debt.otherUser.id,
            amount: debt.amount,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Unable to write off settlement')
      } else {
        // User is the payer — normal flow, other party needs to confirm
        const res = await fetch('/api/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: debt.groupId,
            payeeId: debt.otherUser.id,
            amount: debt.amount,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Unable to record settlement')
      }
    } else if (confirmTarget.type === 'confirm') {
      const settlement = confirmTarget.settlement
      const res = await fetch(`/api/settlements/${settlement.id}/confirm`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to confirm settlement')
    }

      setConfirmTarget(null)
      await loadData() // refresh from server, don't optimistically mutate state
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 0', textAlign: 'center', color: 'var(--text2)' }}>
        Loading balances…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 0', textAlign: 'center', color: 'var(--red)' }}>
        {error}
      </div>
    )
  }

  const dialogTitle = confirmTarget?.type === 'confirm' ? 'Confirm Receipt' : 'Confirm Settlement'
  const dialogDescription = submitError
    ? submitError
    : confirmTarget?.type === 'confirm'
      ? 'Confirming marks this settlement as received and clears the underlying balance. This cannot be undone.'
      : confirmTarget?.debt?.isPaying
        ? 'The payee would have to confirm before the balance is marked as settled. Continue?'
        : 'The balance will be marked as settled. This cannot be undone. Are you sure?'

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 760, margin: '0 auto' }}>
      <PageHeader
        title="Settle Up"
        subtitle="Pay up, get paid."
      />

      {debts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
          <SummaryPill label="Owed to you" amount={totalOwed} color="var(--green)" bg="var(--green-bg)" />
          <SummaryPill label="You owe" amount={totalOwing} color="var(--red)" bg="var(--red-bg)" />
        </div>
      )}

      {/* ── Awaiting your confirmation ── */}
      {awaitingYou.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Awaiting Your Confirmation</CardTitle>
          </CardHeader>
          <div>
            {awaitingYou.map((s, i) => (
              <PendingRow
                key={s.id}
                settlement={s}
                role="confirm"
                delay={i * 40}
                onAction={() => setConfirmTarget({ type: 'confirm', settlement: s })}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ── Awaiting the other party ── */}
      {awaitingThem.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>
            <CardTitle>Awaiting Their Confirmation</CardTitle>
          </CardHeader>
          <div>
            {awaitingThem.map((s, i) => (
              <PendingRow key={s.id} settlement={s} role="waiting" delay={i * 40} />
            ))}
          </div>
        </Card>
      )}

      {/* ── Outstanding balances ── */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding Balances</CardTitle>
        </CardHeader>
        {debts.length === 0 ? (
          <EmptyState
            icon="🎉"
            title="All settled up!"
            description="You have no outstanding balances. Nice work!"
          />
        ) : (
          <div>
            {debts.map((debt, i) => (
              <DebtRow
                key={`${debt.groupId}-${debt.otherUser.id}`}
                debt={debt}
                currentUsername={user?.username}
                delay={i * 40}
                isPending={
                  debt.isPaying &&
                  pendingSettlementMap.has(
                    `${debt.groupId}-${debt.otherUser.id}`
                  )
                }
                onSettle={() => setConfirmTarget({ type: 'settle', debt })}
              />
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        isOpen={confirmTarget !== null}
        onClose={() => { setConfirmTarget(null); setSubmitError(null) }}
        onConfirm={handleConfirmDialog}
        title={dialogTitle}
        description={dialogDescription}
        confirmText={submitting ? 'Saving…' : 'Yes, Confirm'}
      />
    </div>
  )
}

function SummaryPill({ label, amount, color, bg }) {
  return (
    <div style={{
      background: bg, border: `1px solid ${color}30`,
      borderRadius: 'var(--radius-md)', padding: '12px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 500, color }}>
        {fmt(amount)}
      </p>
    </div>
  )
}

function DebtRow({ debt, currentUsername, delay, onSettle, isPending}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        animation: `fadeUp 0.22s ease ${delay}ms both`,
        transition: 'background var(--transition)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar
          name={
            debt.isPaying
              ? currentUsername ?? '?'
              : debt.otherUser?.username ?? '?'
          }
          size="md"
        />

        <ArrowRight />

        <Avatar
          name={
            debt.isPaying
              ? debt.otherUser?.username ?? '?'
              : currentUsername ?? '?'
          }
          size="md"
        />

        <div style={{ marginLeft: 8 }}>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 18,
              fontWeight: 500,
            }}
          >
            {fmt(debt.amount)}
          </p>

          <p
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              marginTop: 2,
            }}
          >
            <strong
              style={{
                color: debt.isPaying
                  ? 'var(--red)'
                  : 'var(--text)',
              }}
            >
              {debt.isPaying ? 'You' : debt.otherUser?.username}
            </strong>

            {' → '}

            <strong
              style={{
                color: !debt.isPaying
                  ? 'var(--green)'
                  : 'var(--text)',
              }}
            >
              {!debt.isPaying
                ? 'you'
                : debt.otherUser?.username}
            </strong>
          </p>
        </div>
      </div>

      <Button
        variant={
          isPending
            ? 'secondary'
            : debt.isPaying
            ? 'primary'
            : 'tealOutline'
        }
        size="md"
        onClick={onSettle}
        disabled={isPending}
      >
        {isPending ? 'Pending' : 'Mark as Settled'}
      </Button>
    </div>
  )
}

function PendingRow({ settlement, role, delay, onAction }) {
  // role === 'confirm': you are the payee, waiting on you to confirm receipt
  // role === 'waiting': you are the payer, waiting on the other party
  const otherUsername = role === 'confirm' ? settlement.payer_username : settlement.payee_username

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 18px', borderBottom: '1px solid var(--border)',
      animation: `fadeUp 0.22s ease ${delay}ms both`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={otherUsername} size="md" />
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 500 }}>
            {fmt(settlement.amount)}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
            {role === 'confirm'
              ? <><strong>{otherUsername}</strong> says they paid you · {settlement.group_name}</>
              : <>Waiting for <strong>{otherUsername}</strong> to confirm · {settlement.group_name}</>}
          </p>
        </div>
      </div>
      {role === 'confirm' ? (
        <Button variant="primary" size="md" onClick={onAction}>
          Confirm Receipt
        </Button>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}>Pending</span>
      )}
    </div>
  )
}

function ArrowRight() {
  return (
    <div style={{ color: 'var(--text3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>pays</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
      </svg>
    </div>
  )
}