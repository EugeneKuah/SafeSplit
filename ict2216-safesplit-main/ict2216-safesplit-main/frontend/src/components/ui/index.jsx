import { useState, useEffect } from 'react'
import { Button } from './Button'

/* ── CARD ── */
export function Card({ children, style, className, onClick }) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, style }) {
  return (
    <div style={{
      padding: '14px 18px',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      ...style,
    }}>
      {children}
    </div>
  )
}

export function CardTitle({ children, style }) {
  return (
    <h3 style={{
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
      color: 'var(--text)', letterSpacing: '0.01em', ...style,
    }}>
      {children}
    </h3>
  )
}

export function CardBody({ children, style }) {
  return <div style={{ padding: '16px 18px', ...style }}>{children}</div>
}

/* ── BADGE ── */
const badgeVariants = {
  default:  { bg: 'var(--surface2)',  color: 'var(--text2)',  border: 'var(--border2)' },
  success:  { bg: 'var(--green-bg)',  color: 'var(--green)',  border: 'rgba(5,150,105,0.3)' },
  danger:   { bg: 'var(--red-bg)',    color: 'var(--red)',    border: 'var(--red-border)' },
  warning:  { bg: 'var(--amber-bg)', color: 'var(--amber)', border: 'var(--amber-border)' },
  info:     { bg: 'var(--blue-bg)',   color: 'var(--blue)',   border: 'rgba(13,148,136,0.3)' },
  teal:     { bg: 'var(--teal-bg)',   color: 'var(--teal)',   border: 'var(--teal-border)' },
  admin:    { bg: 'rgba(124,58,237,0.1)', color: '#7c3aed', border: 'rgba(124,58,237,0.3)' },
}

export function Badge({ variant = 'default', children, style }) {
  const v = badgeVariants[variant] || badgeVariants.default
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
      background: v.bg, color: v.color, border: `1px solid ${v.border}`,
      ...style,
    }}>
      {children}
    </span>
  )
}

/* ── TABS ── */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', borderBottom: '1px solid var(--border)',
      padding: '0 4px', gap: 2,
    }}>
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '10px 14px', fontSize: 13, fontWeight: 500,
            background: 'none', border: 'none', cursor: 'pointer',
            color: active === tab ? 'var(--teal)' : 'var(--text2)',
            borderBottom: `2px solid ${active === tab ? 'var(--teal)' : 'transparent'}`,
            marginBottom: -1, transition: 'all var(--transition)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {tab}
        </button>
      ))}
    </div>
  )
}

/* ── MODAL ── */
export function Modal({ isOpen, onClose, title, children, width = 440 }) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg3)', border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-xl)', width, maxWidth: '100%',
          maxHeight: '90vh', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideIn 0.18s ease',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
            color: 'var(--text)',
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--text2)',
              transition: 'all var(--transition)',
            }}
          >
            <XIcon />
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  )
}

/* ── CONFIRM DIALOG ── */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, description, confirmText = 'Confirm', variant = 'primary' }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} width={360}>
      <p style={{ color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 20 }}>
        {description}
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
        <Button
          variant={variant === 'danger' ? 'danger' : 'primary'}
          size="md"
          onClick={() => { onConfirm(); onClose() }}
        >
          {confirmText}
        </Button>
      </div>
    </Modal>
  )
}

/* ── SPINNER ── */
export function Spinner({ size = 20 }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: 'spin 0.8s linear infinite' }}
    >
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="10" stroke="var(--teal)" strokeWidth="2"
        strokeDasharray="40" strokeDashoffset="20" strokeLinecap="round" />
    </svg>
  )
}

/* ── EMPTY STATE ── */
export function EmptyState({ icon, title, description, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '48px 24px', textAlign: 'center', gap: 10,
    }}>
      {icon && <div style={{ fontSize: 40, marginBottom: 4 }}>{icon}</div>}
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{title}</p>
      {description && <p style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 300 }}>{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

/* ── INPUT ── */
export function Input({ label, error, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{label}</label>}
      <input
        style={{
          background: 'var(--surface2)', border: `1px solid ${error ? 'var(--red-border)' : 'var(--border2)'}`,
          borderRadius: 'var(--radius-sm)', padding: '8px 11px',
          fontSize: 13.5, color: 'var(--text)', outline: 'none',
          fontFamily: 'var(--font-body)', transition: 'border-color var(--transition)',
          ...style,
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--teal)' }}
        onBlur={(e) => { e.target.style.borderColor = error ? 'var(--red-border)' : 'var(--border2)' }}
        {...props}
      />
      {error && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}

/* ── SELECT ── */
export function Select({ label, error, children, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{label}</label>}
      <select
        style={{
          background: 'var(--surface2)', border: `1px solid ${error ? 'var(--red-border)' : 'var(--border2)'}`,
          borderRadius: 'var(--radius-sm)', padding: '8px 11px',
          fontSize: 13.5, color: 'var(--text)', outline: 'none',
          fontFamily: 'var(--font-body)', cursor: 'pointer',
          ...style,
        }}
        {...props}
      >
        {children}
      </select>
      {error && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}

/* ── TOAST ── */
let _setToast = null
export function useToast() {
  const show = (msg, type = 'success') => {
    if (_setToast) _setToast({ msg, type, id: Date.now() })
  }
  return { success: (m) => show(m, 'success'), error: (m) => show(m, 'error') }
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  _setToast = setToast

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <>
      {children}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? 'var(--red-bg)' : 'var(--surface)',
          border: `1px solid ${toast.type === 'error' ? 'var(--red-border)' : 'var(--teal-border)'}`,
          color: toast.type === 'error' ? 'var(--red)' : 'var(--teal)',
          padding: '10px 20px', borderRadius: 'var(--radius-md)',
          fontSize: 13.5, fontWeight: 500, zIndex: 9999,
          boxShadow: 'var(--shadow-md)', animation: 'fadeUp 0.2s ease',
        }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

/* ── X ICON (internal) ── */
function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
