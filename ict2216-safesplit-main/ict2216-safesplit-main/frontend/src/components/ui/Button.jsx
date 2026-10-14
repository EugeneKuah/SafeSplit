import { forwardRef } from 'react'

const base = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 6, border: 'none', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-body)', fontWeight: 500, cursor: 'pointer',
  transition: 'all var(--transition)', whiteSpace: 'nowrap',
  outline: 'none',
}

const variants = {
  primary: {
    background: 'var(--teal)', color: '#fff',
    ':hover': { background: 'var(--teal-dim)' },
  },
  secondary: {
    background: 'var(--surface2)', color: 'var(--text)',
    border: '1px solid var(--border2)',
  },
  ghost: {
    background: 'transparent', color: 'var(--text2)',
    border: '1px solid var(--border)',
  },
  danger: {
    background: 'var(--red-bg)', color: 'var(--red)',
    border: '1px solid var(--red-border)',
  },
  tealOutline: {
    background: 'var(--teal-bg)', color: 'var(--teal)',
    border: '1px solid var(--teal-border)',
  },
}

const sizeStyles = {
  sm: { padding: '4px 10px', fontSize: 12 },
  md: { padding: '7px 14px', fontSize: 13.5 },
  lg: { padding: '10px 20px', fontSize: 15 },
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', children, style, disabled, ...props },
  ref
) {
  const v = variants[variant] || variants.primary
  const s = sizeStyles[size] || sizeStyles.md
  return (
    <button
      ref={ref}
      disabled={disabled}
      style={{
        ...base, ...v, ...s,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  )
})
