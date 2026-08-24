import { useMemo, useState } from 'react'
import type { Player } from '../types'
import { POS_COLOR, fmtAdp, injuryTag, matchesPos } from '../lib/format'
import { blendRankScore } from '../lib/vegas'
import { liveAdp, useLive } from '../store/useLive'
import { PLAYERS, selectBoard, useStore } from '../store/useStore'
import { Avatar } from './Avatar'
import { PosTabs } from './PosTabs'
import { PlayerDetail } from './PlayerDetail'
import { RefreshData } from './RefreshData'

interface Row {
  player: Player
  /** Your overall board rank, for the card and the # column. */
  boardRank: number
  boardPosRank: number
  adp: number
  fpts: number
  /** Points over replacement — what the bar draws. */
  vval: number
  estPts: number
  vRank: number
  vPosRank: number
  /** All three boards ranked over the same covered pool, so the deltas are honest. */
  myPoolRank: number
  adpPoolRank: number
  dAdp: number
  dYou: number
  blend: number
  value: number
}

type Key = keyof Omit<Row, 'player' | 'vval'>

interface Column {
  key: Key
  label: string
  title: string
  signed?: boolean
  digits?: number
  ascFirst?: boolean
}

const COLUMNS: Column[] = [
  { key: 'boardRank', label: '#', title: 'Your board rank', ascFirst: true },
  { key: 'adp', label: 'ADP', title: 'Consensus ADP (PPR)', digits: 1, ascFirst: true },
  { key: 'fpts', label: 'PTS', title: 'Fantasy points the season-long lines imply, under this league’s scoring', digits: 1 },
  { key: 'vRank', label: 'VGS', title: 'Vegas rank — points over replacement, among the players the books posted lines for', ascFirst: true },
  { key: 'dAdp', label: 'Δ ADP', title: 'ADP rank minus Vegas rank, over the covered pool — positive means the books are higher on him than the drafters are', signed: true },
  { key: 'dYou', label: 'Δ YOU', title: 'Your rank minus Vegas rank, over the covered pool — positive means the books are higher on him than you are', signed: true },
  { key: 'blend', label: 'BLND', title: 'Blended rank — your board and the Vegas board mixed at the slider’s weight', ascFirst: true },
  { key: 'value', label: 'VAL', title: 'ADP rank minus blended rank — positive means the room lets you draft him later than the blend says he should go', signed: true },
]

const GROUPS = [
  { label: 'Market', from: 3, to: 4 },
  { label: 'Vegas', from: 5, to: 8 },
  { label: 'Blend', from: 9, to: 10 },
]

const fmt = (v: number | null, digits = 0, signed = false) => {
  if (v == null) return '—'
  const s = v.toFixed(digits)
  return signed && v > 0 ? `+${s}` : s
}

const tone = (v: number | null, floor: number) =>
  v == null || Math.abs(v) < floor ? '' : v > 0 ? 'up' : 'down'

export function VegasBoard() {
  const { items, query, posFilter, selectedId, picks, teams, mySlot, hideDrafted, vegasBlend,
    setQuery, setPosFilter, setHideDrafted, setVegasBlend, select, movePlayerToRank, removePlayer,
    insertTierAbove, movePlayerToNextTier, movePlayerToBottom, draftPlayer, applyOrder } = useStore()

  const [sortKey, setSortKey] = useState<Key>('blend')
  const [desc, setDesc] = useState(false)

  const vegas = useLive((s) => s.vegas)
  const adpMap = useLive((s) => s.adp)

  const { ranked, posRank } = useMemo(() => selectBoard(items), [items])
  const rankById = useMemo(() => new Map(ranked.map((r) => [r.player.id, r.rank])), [ranked])

  const tiers = useMemo(() => {
    const meta = new Map<string, { name: string; color: string; num: number }>()
    for (const item of items) {
      if (item.kind === 'tier') meta.set(item.id, { name: item.name, color: item.color, num: meta.size + 1 })
    }
    return new Map(ranked.map((r) => [r.player.id, r.tierId ? meta.get(r.tierId) ?? null : null]))
  }, [items, ranked])

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

  const w = vegasBlend / 100

  const rows = useMemo<Row[]>(() => {
    // Your board and ADP re-ranked over just the covered pool, so a player's
    // three ranks count the same set of rivals. Rank 40 on a 210-man board and
    // rank 40 among 163 with lines are different claims.
    const pool = PLAYERS.filter((p) => vegas.players[p.id])
    const myPool = new Map(
      [...pool]
        .sort((a, b) => (rankById.get(a.id) ?? 1e9) - (rankById.get(b.id) ?? 1e9))
        .map((p, i) => [p.id, i + 1]),
    )

    const base = pool.map((player) => {
      const v = vegas.players[player.id]
      const myPoolRank = myPool.get(player.id) ?? v.rank
      return {
        player,
        boardRank: rankById.get(player.id) ?? Number.MAX_SAFE_INTEGER,
        boardPosRank: posRank.get(player.id) ?? 0,
        adp: liveAdp(adpMap, player),
        fpts: v.fpts,
        vval: v.val,
        estPts: v.estPts,
        vRank: v.rank,
        vPosRank: v.posRank,
        myPoolRank,
        adpPoolRank: v.adpRank,
        dAdp: v.adpRank - v.rank,
        dYou: myPoolRank - v.rank,
        blend: blendRankScore(myPoolRank, v.rank, w),
        value: 0,
      }
    })

    // The blend is a score until it's a rank; VAL compares it back to ADP.
    ;[...base].sort((a, b) => a.blend - b.blend).forEach((r, i) => { r.blend = i + 1 })
    for (const r of base) r.value = r.adpPoolRank - r.blend
    return base
  }, [rankById, posRank, w, vegas, adpMap])

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!matchesPos(posFilter, r.player.pos)) return false
      if (hideDrafted && draftedIds.has(r.player.id)) return false
      if (!q) return true
      const p = r.player
      return (
        p.name.toLowerCase().includes(q) ||
        (p.team ?? '').toLowerCase().includes(q) ||
        p.pos.toLowerCase().includes(q)
      )
    })
    return filtered.sort((a, b) => {
      const x = a[sortKey]
      const y = b[sortKey]
      if (x === y) return a.vRank - b.vRank
      return desc ? y - x : x - y
    })
  }, [rows, q, posFilter, hideDrafted, draftedIds, sortKey, desc])

  const sortBy = (col: Column) => {
    if (col.key === sortKey) setDesc((d) => !d)
    else {
      setSortKey(col.key)
      setDesc(!col.ascFirst)
    }
  }

  const applyBlend = () => {
    const order = [...rows].sort((a, b) => a.blend - b.blend).map((r) => r.player.id)
    if (
      window.confirm(
        `Reorder the ${order.length} players with Vegas lines on your big board into the blended order (${100 - vegasBlend}% you / ${vegasBlend}% Vegas)? Tiers and everyone else stay where they are.`,
      )
    )
      applyOrder(order)
  }

  const selected = selectedId ? PLAYERS.find((p) => p.id === selectedId) ?? null : null
  const books = Object.entries(vegas.books).sort((a, b) => b[1] - a[1]).map(([n]) => n)
  const maxVval = useMemo(() => Math.max(1, ...rows.map((r) => r.vval)), [rows])

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
            <input type="checkbox" checked={hideDrafted} onChange={(e) => setHideDrafted(e.target.checked)} />
            Hide drafted
          </label>

          <label className="check blend-slider" title="How much of the blended board is the books' opinion rather than yours">
            You
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={vegasBlend}
              onChange={(e) => setVegasBlend(Number(e.target.value))}
            />
            Vegas
            <span className="blend-pct">{vegasBlend}%</span>
          </label>

          <button className="btn ghost sm" onClick={applyBlend} title="Reorder these players on your big board into the blended order — tiers and uncovered players stay put">
            Apply to board
          </button>

          <label className="check sort-picker">
            Sort
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as Key)}>
              {COLUMNS.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            <button className="btn ghost sm" onClick={() => setDesc((d) => !d)} aria-label="Reverse sort">
              {desc ? '▾' : '▴'}
            </button>
          </label>

          <span className="spacer" />
          <RefreshData />
          <span className="small dim">{visible.length} players with lines</span>
        </div>

        <div className="stats-wrap vegas-wrap">
          <div className="stats-head">
            <span className="sh-player">Player</span>
            <span style={{ gridRow: 2 }} aria-hidden />
            {GROUPS.map((g) => (
              <span key={g.label} className="sh-group" style={{ gridColumn: `${g.from} / ${g.to + 1}` }}>
                {g.label}
              </span>
            ))}
            {COLUMNS.map((col) => (
              <button
                key={col.key}
                className={`sh-num ${sortKey === col.key ? 'on' : ''} ${col.signed ? 'is-spread' : ''}`}
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
              const estShare = r.fpts > 0 ? r.estPts / r.fpts : 0
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
                    <Avatar player={p} size={36} />
                    <span className="srow-id">
                      <span className="srow-name">
                        {p.name}
                        {inj && <span className="injury">{inj}</span>}
                      </span>
                      <span className="srow-sub">
                        <span className="pos-chip">{p.pos}{r.boardPosRank || ''}</span>
                        {p.team ?? 'FA'}
                        {estShare >= 0.2 && (
                          <span className="drop-chip" title={`${Math.round(estShare * 100)}% of his implied points come from markets no book posted — estimated, not bet on`}>
                            ~est
                          </span>
                        )}
                      </span>
                    </span>
                  </span>

                  <span className="sh-bar" aria-hidden title={`${r.vval > 0 ? '+' : ''}${r.vval.toFixed(0)} points over a replacement ${p.pos}`}>
                    <span className="bar-track">
                      <span
                        className="bar-fill"
                        style={{ width: `${Math.max(0, Math.min(100, (r.vval / maxVval) * 100))}%` }}
                      />
                    </span>
                  </span>

                  <span className="sh-num rank-cell" data-label="Rank">
                    {r.boardRank === Number.MAX_SAFE_INTEGER ? '—' : r.boardRank}
                  </span>
                  <span className="sh-num dim" data-label="ADP">{fmtAdp(r.adp)}</span>
                  <span className="sh-num" data-label="Vegas pts">{fmt(r.fpts, 1)}</span>
                  <span className="sh-num strong" data-label="Vegas rank" title={`${p.pos}${r.vPosRank} by the books`}>
                    {r.vRank}
                  </span>
                  <span className={`sh-num spread ${tone(r.dAdp, 5)}`} data-label="Δ ADP">
                    {fmt(r.dAdp, 0, true)}
                  </span>
                  <span className={`sh-num spread ${tone(r.dYou, 5)}`} data-label="Δ You">
                    {fmt(r.dYou, 0, true)}
                  </span>
                  <span className="sh-num strong" data-label="Blend">{fmt(r.blend)}</span>
                  <span className={`sh-num spread ${tone(r.value, 5)}`} data-label="Value">
                    {fmt(r.value, 0, true)}
                  </span>
                </div>
              )
            })}
            {!visible.length && <div className="empty">Nothing matches that filter.</div>}
          </div>

          <p className="stats-key">
            Season-long over/unders as of {new Date(vegas.generatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })},
            from {books.slice(0, 5).join(', ')} and {books.length - 5} more — only lines still on the board count,
            so a player the books pulled after an injury drops out rather than keeping his old number. Scored as{' '}
            {vegas.scoring}. <b>VGS</b> ranks by points over a 10-team replacement level, so quarterbacks slot
            where a one-QB league actually drafts them. <b>Δ ADP</b> and <b>Δ YOU</b> are rank-vs-rank over the
            same {Object.keys(vegas.players).length}-player pool — positive means the books are higher on him.{' '}
            <b>VAL</b> is where ADP lets you draft the blend: positive is a discount, negative is a reach.
          </p>
        </div>
      </div>

      <PlayerDetail
        player={selected}
        rank={selected ? rankById.get(selected.id) ?? null : null}
        posRank={selected ? posRank.get(selected.id) ?? null : null}
        tierName={selected ? tiers.get(selected.id)?.name ?? null : null}
        tierColor={selected ? tiers.get(selected.id)?.color ?? null : null}
        tierNum={selected ? tiers.get(selected.id)?.num ?? null : null}
        drafted={selected ? draftedIds.has(selected.id) : false}
        draftedBy={selected ? draftedBy.get(selected.id) ?? null : null}
        boardSize={ranked.length}
        onRemove={() => selected && removePlayer(selected.id)}
        onMoveToRank={(r) => selected && movePlayerToRank(selected.id, r)}
        onInsertTier={() => selected && insertTierAbove(selected.id)}
        onDropTier={() => selected && movePlayerToNextTier(selected.id)}
        onDropToBottom={() => selected && movePlayerToBottom(selected.id)}
        onDraft={selected && picks.length ? () => draftPlayer(selected.id) : undefined}
        fallback={
          <>
            <h3>What Vegas thinks</h3>
            <p className="detail-note">
              Every player the books hung season-long lines on — yards, touchdowns, receptions — scored under
              this league's rules and ranked. Sort by <b>Δ ADP</b> for the players the market drafts below what
              the books expect of them, and by <b>Δ YOU</b> for the ones your board and the books disagree on.
            </p>
            <p className="detail-note">
              The slider mixes your board into the Vegas one; <b>Apply to board</b> writes that order back onto
              the big board without touching your tiers.
            </p>
          </>
        }
      />
    </div>
  )
}
