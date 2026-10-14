import { getInitials, avatarColor } from '../../lib/utils'

const sizes = {
  xs: { wh: 22, fs: 8,  fw: 600 },
  sm: { wh: 28, fs: 10, fw: 600 },
  md: { wh: 34, fs: 12, fw: 600 },
  lg: { wh: 42, fs: 14, fw: 700 },
  xl: { wh: 52, fs: 17, fw: 700 },
}

export function Avatar({ name = '', size = 'md', style, className }) {
  const { wh, fs, fw } = sizes[size] || sizes.md
  return (
    <div
      className={className}
      title={name}
      style={{
        width: wh, height: wh, borderRadius: '50%',
        background: avatarColor(name),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: fs, fontWeight: fw, color: '#fff',
        flexShrink: 0, fontFamily: 'var(--font-body)',
        letterSpacing: '0.02em',
        ...style,
      }}
    >
      {getInitials(name)}
    </div>
  )
}

export function AvatarStack({ users = [], limit = 3, size = 'sm' }) {
  const visible = users.slice(0, limit)
  const extra = users.length - limit
  const { wh } = sizes[size] || sizes.sm
  return (
    <div style={{ display: 'flex', flexDirection: 'row-reverse' }}>
      {extra > 0 && (
        <div style={{
          width: wh, height: wh, borderRadius: '50%',
          background: 'var(--surface2)', border: '2px solid var(--bg3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(wh * 0.34), fontWeight: 600,
          color: 'var(--text2)', marginLeft: -6, zIndex: 0,
        }}>
          +{extra}
        </div>
      )}
      {[...visible].reverse().map((u, i) => (
        <Avatar
          key={u.id}
          name={u.username}
          size={size}
          style={{ border: '2px solid var(--bg3)', marginLeft: -6, zIndex: i + 1 }}
        />
      ))}
    </div>
  )
}
