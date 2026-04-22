export function EmptyState({ body, title }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  )
}

export function InlineError({ message }) {
  return <div className="inline-error">{message}</div>
}

export function ArtifactLink({ label, url }) {
  return (
    <a className="artifact-link" href={url} rel="noreferrer" target="_blank">
      <span>{label}</span>
      <strong>Open</strong>
    </a>
  )
}

export function Stat({ label, value }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export function StatusTile({ label, tone, value }) {
  return (
    <article className={`status-tile status-tile--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export function formatStamp(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function toneForStatus(status) {
  if (status === 'SUCCEEDED' || status === 'ready') return 'success'
  if (status === 'FAILED' || status === 'error') return 'danger'
  if (status === 'IN_PROGRESS' || status === 'loading') return 'warning'
  return 'neutral'
}
