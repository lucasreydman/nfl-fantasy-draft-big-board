import { useMemo } from 'react'
import { BigBoard } from './components/BigBoard'
import { DraftView } from './components/DraftView'
import { StatsBoard } from './components/StatsBoard'
import { VegasBoard } from './components/VegasBoard'
import { DATA, useStore } from './store/useStore'

/** The two things the app is for. The luck table is a lookup, not a third workspace. */
const PRIMARY = [
  { id: 'board', label: 'Big Board', short: 'Board' },
  { id: 'draft', label: 'Mock Draft', short: 'Draft' },
] as const

export default function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const picks = useStore((s) => s.picks)
  const items = useStore((s) => s.items)

  const tiers = useMemo(() => items.filter((i) => i.kind === 'tier').length, [items])
  const players = items.length - tiers
  const onStats = view === 'stats'
  const onVegas = view === 'vegas'

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
          {PRIMARY.map((tab) => (
            <button
              key={tab.id}
              className={view === tab.id ? 'on' : ''}
              onClick={() => setView(tab.id)}
            >
              <span className="tab-full">{tab.label}</span>
              <span className="tab-short">{tab.short}</span>
              {tab.id === 'draft' && picks.length > 0 && <span className="badge">{picks.length}</span>}
            </button>
          ))}
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

        <button
          className={`btn ghost sm side-link ${onVegas ? 'on' : ''}`}
          onClick={() => setView(onVegas ? 'board' : 'vegas')}
          title="What the sportsbooks' season-long lines say the rankings should be, against ADP and your board"
        >
          <VegasIcon />
          <span>{onVegas ? 'Close' : 'Vegas'}</span>
        </button>

        <button
          className={`btn ghost sm side-link ${onStats ? 'on' : ''}`}
          onClick={() => setView(onStats ? 'board' : 'stats')}
          title="Last season measured raw and adjusted, as one sortable table"
        >
          <LuckIcon />
          <span>{onStats ? 'Close' : 'Luck table'}</span>
        </button>
      </header>

      <main>
        {view === 'board' ? <BigBoard /> : onStats ? <StatsBoard /> : onVegas ? <VegasBoard /> : <DraftView />}
      </main>
    </div>
  )
}

function VegasIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5.4" cy="5.4" r="1.15" fill="currentColor" />
      <circle cx="10.6" cy="10.6" r="1.15" fill="currentColor" />
    </svg>
  )
}

function LuckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 11.5 5.5 6.5l3 2.5 5-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.5 3h3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
