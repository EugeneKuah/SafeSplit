export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 22,
      animation: 'fadeUp 0.2s ease',
    }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22,
          color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export default PageHeader
