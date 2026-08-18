import { useMemo, useState } from 'react'
import { POS_COLOR, fmtAdp, matchesPos } from '../lib/format'
import { PLAYERS, useStore } from '../store/useStore'
import { Avatar } from './Avatar'

const LIMIT = 8

/**
 * The way back on. Only players you removed can be added here — everyone else is
 * already ranked somewhere above — so an empty pool means the board is complete.
 */
export function AddPlayer() {
  const items = useStore((s) => s.items)
  const posFilter = useStore((s) => s.posFilter)
  const addPlayer = useStore((s) => s.addPlayer)
  const addAllPlayers = useStore((s) => s.addAllPlayers)
  const select = useStore((s) => s.select)

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const offBoard = useMemo(() => {
    const on = new Set(items.filter((i) => i.kind === 'player').map((i) => i.id))
    return PLAYERS.filter((p) => !on.has(p.id)).sort((a, b) => a.adp - b.adp)
  }, [items])

  const needle = q.trim().toLowerCase()
  const matches = useMemo(
    () =>
      offBoard.filter(
        (p) =>
          matchesPos(posFilter, p.pos) &&
          (!needle || `${p.name} ${p.team ?? ''} ${p.pos}`.toLowerCase().includes(needle)),
      ),
    [offBoard, needle, posFilter],
  )

  if (!offBoard.length) return null

  const add = (id: string) => {
    addPlayer(id)
    select(id)
  }

  return (
    <div className={`add-player ${open ? 'open' : ''}`}>
      <div className="add-player-bar">
        <button className="btn sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Done' : '+ Add player'}
        </button>
        <span className="dim small">
          {offBoard.length} {offBoard.length === 1 ? 'player is' : 'players are'} off your board
        </span>
        <span className="spacer" />
        {open && (
          <button className="btn sm ghost" onClick={addAllPlayers}>
            Add all back
          </button>
        )}
      </div>

      {open && (
        <>
          <input
            className="search add-player-search"
            placeholder="Search removed players…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="add-player-results">
            {matches.slice(0, LIMIT).map((p) => (
              <button
                key={p.id}
                className="add-hit"
                style={{ ['--pos-color' as string]: POS_COLOR[p.pos] }}
                onClick={() => add(p.id)}
                title={`Add ${p.name} to the bottom of the board`}
              >
                <Avatar player={p} size={28} />
                <span className="add-hit-name">{p.name}</span>
                <span className="pos-chip">{p.pos}</span>
                <span className="dim">{p.team ?? 'FA'}</span>
                <span className="dim">ADP {fmtAdp(p.adp)}</span>
                <span className="add-hit-cta">Add</span>
              </button>
            ))}
            {!matches.length && <p className="empty small">Nobody removed matches that.</p>}
            {matches.length > LIMIT && (
              <p className="dim small add-hit-more">
                +{matches.length - LIMIT} more — keep typing to narrow it down.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
