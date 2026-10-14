function EmptyPage({ pageName }) {
  return (
    <section className="empty-page" aria-label={pageName}>
      <div className="empty-icon">▦</div>
      <h2>{pageName}</h2>
      <p>This page is intentionally left empty for now.</p>
    </section>
  )
}

export default EmptyPage
