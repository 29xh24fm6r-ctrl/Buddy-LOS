export default function WorkspaceLoading() {
  return <main className="workspace-transition" aria-busy="true" aria-live="polite">
    <section className="workspace-loading-card">
      <p className="eyebrow">Buddy Loan Operations</p>
      <h1>Opening your authorized workspace…</h1>
      <p>Loading institution context, operational queues, and governed loan records.</p>
      <div className="workspace-loading-grid" aria-hidden="true">
        <span /><span /><span /><span />
      </div>
    </section>
  </main>;
}
