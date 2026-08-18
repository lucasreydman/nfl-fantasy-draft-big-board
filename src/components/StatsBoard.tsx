import { useMemo, useState } from 'react'
import type { Player } from '../types'
import { POS_COLOR, fmtAdp, injuryTag, matchesPos } from '../lib/format'
import { DATA, PLAYERS, selectBoard, useStore } from '../store/useStore'
import { Avatar } from './Avatar'
import { PosTabs } from './PosTabs'
import { PlayerDetail } from './PlayerDetail'

/** A full season, for turning a per-game rate back into a season-shaped number. */
const SEASON_GAMES = 17

interface Row {
  player: Player
  rank: number
  posRank: number
  adp: number
  gp: number | null
  cleanGp: number | null
  dropped: number
  rawPpg: number | null
  adjPpg: number | null
  dPpg: number | null
  luckPpg: number | null
  dLuck: number | null
  rawPts: number | null
  adjPace: number | null
  dPts: number | null
}

type Key = keyof Omit<Row, 'player'>

interface Column {
  key: Key
  label: string
  title: string
  /** Columns that mean nothing without a sign are rendered with one. */
  signed?: boolean
  digits?: number
  /** Sorting a rate ascending is usually the boring direction, so headers start descending. */
  ascFirst?: boolean
}

const COLUMNS: Column[] = [
  { key: 'rank', label: '#', title: 'Your board rank', ascFirst: true },
  { key: 'adp', label: 'ADP', title: 'Consensus ADP (PPR)', digits: 1, ascFirst: true },
  { key: 'gp', label: 'G', title: 'Games played last season', ascFirst: false },
  { key: 'rawPpg', label: 'PPG', title: 'PPR points per game, every game he played', digits: 1 },
  { key: 'adjPpg', label: 'ADJ PPG', title: 'PPR points per game over his clean games — partial outings and weeks without his starting quarterback removed', digits: 1 },
  { key: 'dPpg', label: 'Δ PPG', title: 'Adjusted minus raw points per game', digits: 1, signed: true },
  { key: 'luckPpg', label: 'LUCK PPG', title: 'Adjusted points per game with touchdowns re-priced at the rate his opportunity implies', digits: 1 },
  { key: 'dLuck', label: 'Δ LUCK', title: 'What touchdown luck was worth per game — negative means he scored more than his opportunity implies, and is the regression flag', digits: 1, signed: true },
  { key: 'rawPts', label: 'PTS', title: 'Total PPR points scored last season', digits: 1 },
  { key: 'adjPace', label: 'ADJ PACE', title: `Adjusted points per game over a ${SEASON_GAMES}-game season`, digits: 0 },
  { key: 'dPts', label: 'Δ PTS', title: 'Adjusted pace minus points actually scored — counts games missed as well as context', digits: 0, signed: true },
]

const fmt = (v: number | null, digits = 1, signed = false) => {
  if (v == null) return '—'
  const s = v.toFixed(digits)
  return signed && v > 0 ? `+${s}` : s
}

/** Only call a gap meaningful once it clears the noise floor of a per-game average. */
const spreadTone = (v: number | null, floor: number) =>
  v == null || Math.abs(v) < floor ? '' : v > 0 ? 'up' : 'down'

export function StatsBoard() {
  const { items, query, posFilter, selectedId, picks, teams, mySlot, hideDrafted,
    setQuery, setPosFilter, setHideDrafted, select, movePlayerToRank, draftPlayer } = useStore()

  const [sortKey, setSortKey] = useState<Key>('adjPpg')
  const [desc, setDesc] = useState(true)
  const [adjustedOnly, setAdjustedOnly] = useState(false)

  const { ranked, posRank } = useMemo(() => selectBoard(items), [items])
  const rankById = useMemo(() => new Map(ranked.map((r) => [r.player.id, r.rank])), [ranked])

  const { draftedIds, draftedBy } = useMemo(() => {
    const ids = new Set(picks.map((p) => p.playerId))
    const by = new Map(
      picks.map((p) => [
        p.playerId,
        `${p.slot === mySlot ? 'You' : `Team ${p.slot}`} · ${p.round}.${String(((p.overall - 1) % teams) + 1).padStart(2, '0')}`,
      ]),
    )
    return { draftedIds: ids, draftedBy: by }
  }, [picks, mySlot, teams])

  const rows = useMemo<Row[]>(
    () =>
      PLAYERS.map((player) => {
        const raw = player.last
        // Anyone with no distorted games is his own adjusted line.
        const adj = player.adj ?? raw
        const rawPpg = raw?.ppg ?? null
        const adjPpg = adj?.ppg ?? null
        const rawPts = raw?.ptsPpr ?? null
        const adjPace = adjPpg == null ? null : adjPpg * SEASON_GAMES
        return {
          player,
          rank: rankById.get(player.id) ?? Number.MAX_SAFE_INTEGER,
          posRank: posRank.get(player.id) ?? 0,
          adp: player.adp,
          gp: raw?.gp ?? null,
          cleanGp: adj?.gp ?? null,
          dropped: player.adj?.dropped.length ?? 0,
          rawPpg,
          adjPpg,
          dPpg: rawPpg == null || adjPpg == null ? null : adjPpg - rawPpg,
          luckPpg: adj?.luckPpg ?? null,
          dLuck: adj?.luckPpg == null || adjPpg == null ? null : adj.luckPpg - adjPpg,
          rawPts,
          adjPace,
          dPts: rawPts == null || adjPace == null ? null : adjPace - rawPts,
        }
      }),
    [rankById, posRank],
  )

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!matchesPos(posFilter, r.player.pos)) return false
      if (hideDrafted && draftedIds.has(r.player.id)) return false
      if (adjustedOnly && !r.dropped) return false
      if (!q) return true
      const p = r.player
      return (
        p.name.toLowerCase().includes(q) ||
        (p.team ?? '').toLowerCase().includes(q) ||
        p.pos.toLowerCase().includes(q) ||
        (p.college ?? '').toLowerCase().includes(q)
      )
    })
    // Players with no last season sort to the bottom either way — a blank is not a low score.
    return filtered.sort((a, b) => {
      const x = a[sortKey]
      const y = b[sortKey]
      if (x == null && y == null) return a.rank - b.rank
      if (x == null) return 1
      if (y == null) return -1
      return desc ? y - x : x - y
    })
  }, [rows, q, posFilter, hideDrafted, draftedIds, adjustedOnly, sortKey, desc])

  const sortBy = (col: Column) => {
    if (col.key === sortKey) setDesc((d) => !d)
    else {
      setSortKey(col.key)
      setDesc(!col.ascFirst)
    }
  }

  const selected = selectedId ? PLAYERS.find((p) => p.id === selectedId) ?? null : null
  const movers = visible.filter((r) => r.dropped).length

  return (
    <div className="board-layout">
      <div className="board-main">
        <div className="toolbar">
          <input
            className="search"
            placeholder="Search players…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <PosTabs value={posFilter} onChange={setPosFilter} />

          <label className="check">
            <input type="checkbox" checked={adjustedOnly} onChange={(e) => setAdjustedOnly(e.target.checked)} />
            Adjusted only
          </label>

          <label className="check">
            <input type="checkbox" checked={hideDrafted} onChange={(e) => setHideDrafted(e.target.checked)} />
            Hide drafted
          </label>

          <span className="spacer" />
          <span className="small dim">
            {visible.length} players · {movers} with games removed
          </span>
        </div>

        <div className="stats-wrap">
          <div className="stats-head">
            <span className="sh-player">Player</span>
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                className={`sh-num ${sortKey === col.key ? 'on' : ''}`}
                title={col.title}
                onClick={() => sortBy(col)}
              >
                {col.label}
                {sortKey === col.key && <span className="sh-caret">{desc ? '▾' : '▴'}</span>}
              </button>
            ))}
          </div>

          <div className="stats-body">
            {visible.map((r) => {
              const p = r.player
              const inj = injuryTag(p.injury)
              return (
                <div
                  key={p.id}
                  className={[
                    'srow',
                    selectedId === p.id && 'srow-selected',
                    draftedIds.has(p.id) && 'srow-drafted',
                  ].filter(Boolean).join(' ')}
                  style={{ ['--pos-color' as string]: POS_COLOR[p.pos] }}
                  onClick={() => select(p.id)}
                >
                  <span className="sh-player srow-player">
                    <Avatar player={p} size={26} />
                    <span className="srow-id">
                      <span className="srow-name">
                        {p.name}
                        {inj && <span className="injury">{inj}</span>}
                      </span>
                      <span className="srow-sub">
                        <span className="pos-chip">{p.pos}{r.posRank || ''}</span>
                        {p.team ?? 'FA'}
                        {r.dropped > 0 && (
                          <span className="drop-chip" title={`${r.dropped} games removed from the adjusted line`}>
                            −{r.dropped}g
                          </span>
                        )}
                      </span>
                    </span>
                  </span>

                  <span className="sh-num">{r.rank === Number.MAX_SAFE_INTEGER ? '—' : r.rank}</span>
                  <span className="sh-num dim">{fmtAdp(r.adp)}</span>
                  <span className="sh-num dim">
                    {r.gp == null ? '—' : r.dropped ? `${r.cleanGp}/${r.gp}` : r.gp}
                  </span>
                  <span className="sh-num">{fmt(r.rawPpg)}</span>
                  <span className="sh-num strong">{fmt(r.adjPpg)}</span>
                  <span className={`sh-num spread ${spreadTone(r.dPpg, 0.5)}`}>{fmt(r.dPpg, 1, true)}</span>
                  <span className="sh-num">{fmt(r.luckPpg)}</span>
                  <span className={`sh-num spread ${spreadTone(r.dLuck, 0.5)}`}>{fmt(r.dLuck, 1, true)}</span>
                  <span className="sh-num">{fmt(r.rawPts)}</span>
                  <span className="sh-num strong">{fmt(r.adjPace, 0)}</span>
                  <span className={`sh-num spread ${spreadTone(r.dPts, 10)}`}>{fmt(r.dPts, 0, true)}</span>
                </div>
              )
            })}
            {!visible.length && <div className="empty">Nothing matches that filter.</div>}
          </div>

          <p className="stats-key">
            {DATA.usage.season} production. <b>Adjusted</b> {DATA.usage.adjRule}; <b>pace</b> puts that rate over a{' '}
            {SEASON_GAMES}-game season, so Δ PTS counts missed games as well as removed ones. <b>Luck PPG</b> re-prices
            touchdowns at the rate each player's red-zone opportunity implies, so a negative <b>Δ LUCK</b> is a regression flag. Sort any column; click a row for the card.
          </p>
        </div>
      </div>

      <PlayerDetail
        player={selected}
        rank={selected ? rankById.get(selected.id) ?? null : null}
        posRank={selected ? posRank.get(selected.id) ?? null : null}
        tierName={null}
        tierColor={null}
        drafted={selected ? draftedIds.has(selected.id) : false}
        draftedBy={selected ? draftedBy.get(selected.id) ?? null : null}
        boardSize={ranked.length}
        onMoveToRank={(r) => selected && movePlayerToRank(selected.id, r)}
        onDraft={selected && picks.length ? () => draftPlayer(selected.id) : undefined}
        fallback={
          <>
            <h3>Luck &amp; context</h3>
            <p className="detail-note">
              Every column here is last season measured two ways. Sort by <b>Δ PPG</b> to find the players whose
              averages were dragged down by games they left early or played without their quarterback, and by{' '}
              <b>Luck PPG</b> against <b>PPG</b> to find the ones whose touchdowns outran their opportunity.
            </p>
            <p className="detail-note">Pick a row to see the full card.</p>
          </>
        }
      />
    </div>
  )
}
