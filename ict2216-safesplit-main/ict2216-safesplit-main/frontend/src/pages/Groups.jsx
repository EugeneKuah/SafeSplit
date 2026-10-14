import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Modal, Input, EmptyState, Spinner } from '../components/ui/index.jsx'
import { AvatarStack } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { fmt } from '../lib/utils'
import { api } from '../services/api'

// ─── Currency list ────────────────────────────────────────────────────────────
const CURRENCIES = [
  { code: 'SGD', name: 'Singapore Dollar',   flag: '🇸🇬' },
  { code: 'USD', name: 'US Dollar',           flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro',                flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',       flag: '🇬🇧' },
  { code: 'JPY', name: 'Japanese Yen',        flag: '🇯🇵' },
  { code: 'AUD', name: 'Australian Dollar',   flag: '🇦🇺' },
  { code: 'CAD', name: 'Canadian Dollar',     flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc',         flag: '🇨🇭' },
  { code: 'CNY', name: 'Chinese Yuan',        flag: '🇨🇳' },
  { code: 'HKD', name: 'Hong Kong Dollar',    flag: '🇭🇰' },
  { code: 'MYR', name: 'Malaysian Ringgit',   flag: '🇲🇾' },
  { code: 'THB', name: 'Thai Baht',           flag: '🇹🇭' },
  { code: 'IDR', name: 'Indonesian Rupiah',   flag: '🇮🇩' },
  { code: 'INR', name: 'Indian Rupee',        flag: '🇮🇳' },
  { code: 'KRW', name: 'South Korean Won',    flag: '🇰🇷' },
  { code: 'NZD', name: 'New Zealand Dollar',  flag: '🇳🇿' },
  { code: 'PHP', name: 'Philippine Peso',     flag: '🇵🇭' },
  { code: 'VND', name: 'Vietnamese Dong',     flag: '🇻🇳' },
]

// ─── CurrencySelect component ─────────────────────────────────────────────────
function CurrencySelect({ label, value, onChange, id }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        htmlFor={id}
        style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: '100%',
            height: 38,
            padding: '0 32px 0 10px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14,
            appearance: 'none',
            WebkitAppearance: 'none',
            cursor: 'pointer',
          }}
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} {c.code} — {c.name}
            </option>
          ))}
        </select>
        {/* chevron icon */}
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text3)' }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Groups() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('SGD')
  const [settleCurrency, setSettleCurrency] = useState('SGD')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [groupFilter, setGroupFilter] = useState('active')

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await api('/api/groups')
      setGroups(data.groups)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  const handleOpenModal = () => {
    setNewGroupName('')
    setBaseCurrency('SGD')
    setSettleCurrency('SGD')
    setCreateError('')
    setNewGroupOpen(true)
  }

  const handleCreate = async () => {
    if (!newGroupName.trim()) return
    setCreating(true)
    setCreateError('')
    try {
      await api('/api/groups', {
        method: 'POST',
        body: JSON.stringify({
          name: newGroupName.trim(),
          base_currency: baseCurrency,
          settle_currency: settleCurrency,
        }),
      })
      setNewGroupOpen(false)
      await loadGroups()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const activeGroups = groups.filter((g) => g.is_active !== false)
  const archivedGroups = groups.filter((g) => g.is_active === false)
  const visibleGroups = groupFilter === 'archived' ? archivedGroups : activeGroups

  return (
    <div style={{ animation: 'fadeUp 0.22s ease', maxWidth: 1100, margin: '0 auto' }}>
      <PageHeader
        title="Your Groups"
        subtitle={loading ? 'Loading…' : `${activeGroups.length} active group${activeGroups.length !== 1 ? 's' : ''}`}
        action={
          <Button onClick={handleOpenModal}>
            <PlusIcon /> New Group
          </Button>
        }
      />

      <PendingInvites />

      {!loading && !loadError && groups.length > 0 && (
        <div style={{
          display: 'flex', gap: 2, marginBottom: 18,
          borderBottom: '1px solid var(--border)', padding: '0 4px',
        }}>
          {[
            { key: 'active', label: `Active (${activeGroups.length})` },
            { key: 'archived', label: `Archived (${archivedGroups.length})` },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setGroupFilter(t.key)}
              style={{
                padding: '10px 14px', fontSize: 13, fontWeight: 500,
                background: 'none', border: 'none', cursor: 'pointer',
                color: groupFilter === t.key ? 'var(--teal)' : 'var(--text2)',
                borderBottom: `2px solid ${groupFilter === t.key ? 'var(--teal)' : 'transparent'}`,
                marginBottom: -1, transition: 'all var(--transition)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner size={28} />
        </div>
      ) : loadError ? (
        <EmptyState
          icon="⚠️"
          title="Couldn&apos;t load your groups"
          description={loadError}
          action={<Button variant="ghost" onClick={loadGroups}>Try again</Button>}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No groups yet"
          description="Create your first group to start splitting expenses."
          action={<Button onClick={handleOpenModal}>Create a group</Button>}
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState
          icon={groupFilter === 'archived' ? '🗄️' : '👥'}
          title={groupFilter === 'archived' ? 'No archived groups' : 'No active groups'}
          description={
            groupFilter === 'archived'
              ? "Groups you archive will show up here. They're never deleted, just hidden from active use."
              : 'Create your first group to start splitting expenses.'
          }
          action={groupFilter === 'active' ? <Button onClick={handleOpenModal}>Create a group</Button> : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {visibleGroups.map((g, i) => (
            <GroupCard
              key={g.id}
              group={g}
              delay={i * 40}
              onClick={() => navigate(`/groups/${g.id}`)}
            />
          ))}
        </div>
      )}

      {/* ── Create New Group Modal ── */}
      <Modal
        isOpen={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        title="Create New Group"
        width={420}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Group name"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. Bali Trip 🌴"
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            error={createError}
            autoFocus
          />

          {/* ── Currency row ── */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Currency
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'end' }}>
              <CurrencySelect
                id="base-currency"
                label="Expenses entered in"
                value={baseCurrency}
                onChange={setBaseCurrency}
              />

              {/* swap button */}
              <button
                type="button"
                title="Swap currencies"
                onClick={() => {
                  const prev = baseCurrency
                  setBaseCurrency(settleCurrency)
                  setSettleCurrency(prev)
                }}
                style={{
                  width: 34, height: 38,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'transparent',
                  color: 'var(--text2)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M7 16V4m0 0L3 8m4-4 4 4" />
                  <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
                </svg>
              </button>

              <CurrencySelect
                id="settle-currency"
                label="Settle up in"
                value={settleCurrency}
                onChange={setSettleCurrency}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5, marginTop: 8 }}>
              Members can log expenses in any currency — balances will show in your settlement currency.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setNewGroupOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newGroupName.trim() || creating}>
              {creating ? <Spinner size={14} /> : 'Create Group'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PendingInvites() {
  const navigate = useNavigate()
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null) // invite id currently being actioned

  useEffect(() => {
    api('/api/invites/pending')
      .then((d) => setInvites(d.invites))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const respond = async (inviteId, action) => {
    setActing(inviteId)
    try {
      const data = await api(`/api/invites/${inviteId}/${action}`, { method: 'POST' })
      setInvites((prev) => prev.filter((i) => i.id !== inviteId))
      if (action === 'accept' && data.groupId) {
        navigate(`/groups/${data.groupId}`)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setActing(null)
    }
  }

  if (loading || invites.length === 0) return null

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--teal-border)',
      borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24,
    }}>
      <p style={{
        fontSize: 12, fontWeight: 600, color: 'var(--teal)',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12,
      }}>
        📬 Pending Invites ({invites.length})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {invites.map((inv) => (
          <div key={inv.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
                {inv.group_name}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                Invited by {inv.inviter_username} · {inv.base_currency}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost" size="sm"
                disabled={acting === inv.id}
                onClick={() => respond(inv.id, 'decline')}
              >
                Decline
              </Button>
              <Button
                size="sm"
                disabled={acting === inv.id}
                onClick={() => respond(inv.id, 'accept')}
              >
                {acting === inv.id ? 'Joining…' : 'Accept'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── GroupCard ────────────────────────────────────────────────────────────────
function GroupCard({ group, delay, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 20,
        cursor: 'pointer', transition: 'all 0.18s ease',
        animation: `fadeUp 0.25s ease ${delay}ms both`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--teal-border)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 10px 28px rgba(37,99,235,0.10)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = ''
        e.currentTarget.style.boxShadow = ''
      }}
    >
      <h3 style={{
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16,
        color: 'var(--text)', marginBottom: 14, lineHeight: 1.2,
      }}>
        {group.name}
      </h3>

      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Base Currency
        </p>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 500, color: 'var(--teal)' }}>
          {group.base_currency}
        </p>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 14, borderTop: '1px solid var(--border)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>
          {group.member_count} member{Number(group.member_count) !== 1 ? 's' : ''}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {group.my_role}
        </span>
      </div>
    </div>
  )
}

// ─── PlusIcon ─────────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}