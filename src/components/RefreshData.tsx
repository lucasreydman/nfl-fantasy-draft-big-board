import { useLive } from '../store/useLive'

/**
 * "Data as of …" plus the button that re-pulls Sleeper ADP and the Vegas lines
 * through /api/live. Every board derived from that data recomputes on its own
 * once the store updates.
 */
export function RefreshData() {
  const fetchedAt = useLive((s) => s.fetchedAt)
  const status = useLive((s) => s.status)
  const error = useLive((s) => s.error)
  const refresh = useLive((s) => s.refresh)

  const when = new Date(fetchedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <span className="refresh-data">
      <button
        className="btn ghost sm"
        disabled={status === 'loading'}
        onClick={refresh}
        title="Pull today's Sleeper ADP and Vegas lines — every board that uses them updates in place"
      >
        {status === 'loading' ? 'Refreshing…' : '↻ Refresh data'}
      </button>
      <span className="small dim" title={`Vegas lines and ADP as of ${when}`}>
        {status === 'error' ? <span className="refresh-err">refresh failed — {error}</span> : when}
      </span>
    </span>
  )
}
