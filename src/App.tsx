import { useMemo } from 'react'
import { BigBoard } from './components/BigBoard'
import { DraftView } from './components/DraftView'
import { StatsBoard } from './components/StatsBoard'
import { DATA, useStore } from './store/useStore'

export default function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const picks = useStore((s) => s.picks)
  const items = useStore((s) => s.items)

  const tiers = useMemo(() => items.filter((i) => i.kind === 'tier').length, [items])
  const players = items.length - tiers

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>Big Board</h1>
            <p>{DATA.season} fantasy football</p>
          </div>
        </div>

        <nav className="tabs">
          <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>
            Big Board
          </button>
          <button className={view === 'stats' ? 'on' : ''} onClick={() => setView('stats')}>
            Luck Table
          </button>
          <button className={view === 'draft' ? 'on' : ''} onClick={() => setView('draft')}>
            Mock Draft
            {picks.length > 0 && <span className="badge">{picks.length}</span>}
          </button>
        </nav>

        <div className="topbar-meta">
          <span>{players} players</span>
          <span className="dot">·</span>
          <span>{tiers} tiers</span>
          <span className="dot">·</span>
          <span title={`Updated ${new Date(DATA.generatedAt).toLocaleString()}`}>
            ADP {String(DATA.source.meta.start_date ?? '').slice(5)}–
            {String(DATA.source.meta.end_date ?? '').slice(5)}
          </span>
        </div>
      </header>

      <main>{view === 'board' ? <BigBoard /> : view === 'stats' ? <StatsBoard /> : <DraftView />}</main>
    </div>
  )
}
