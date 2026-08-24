import { useMemo } from 'react'
import { BigBoard } from './components/BigBoard'
import { DraftView } from './components/DraftView'
import { StatsBoard } from './components/StatsBoard'
import { VegasBoard } from './components/VegasBoard'
import { GodfatherBoard } from './components/GodfatherBoard'
import { DATA, useStore, type View } from './store/useStore'

/**
 * One nav for everything. The first three are workspaces; after the divider
 * come the two data lookups. Same control, same behavior — no more side
 * buttons that toggle to "Close".
 */
const TABS: { id: View; label: string; short: string; data?: boolean }[] = [
  { id: 'board', label: 'Big Board', short: 'Board' },
  { id: 'god', label: 'Godfather', short: 'Don' },
  { id: 'draft', label: 'Mock Draft', short: 'Draft' },
  { id: 'vegas', label: 'Vegas', short: 'Vegas', data: true },
  { id: 'stats', label: 'Luck', short: 'Luck', data: true },
]

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
          {TABS.map((tab, i) => (
            <span key={tab.id} className="tab-slot">
              {i > 0 && TABS[i - 1].data !== tab.data && <span className="tab-sep" aria-hidden />}
              <button
                className={view === tab.id ? 'on' : ''}
                onClick={() => setView(tab.id)}
              >
                <span className="tab-full">{tab.label}</span>
                <span className="tab-short">{tab.short}</span>
                {tab.id === 'draft' && picks.length > 0 && <span className="badge">{picks.length}</span>}
              </button>
            </span>
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
      </header>

      <main>
        {view === 'board' ? <BigBoard />
          : view === 'god' ? <GodfatherBoard />
          : view === 'stats' ? <StatsBoard />
          : view === 'vegas' ? <VegasBoard />
          : <DraftView />}
      </main>
    </div>
  )
}
