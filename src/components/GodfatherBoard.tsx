import { useMemo, useState } from 'react'
import type { Player } from '../types'
import { POS_COLOR, fmtAdp, injuryTag, matchesPos } from '../lib/format'
import { liveAdp, useLive } from '../store/useLive'
import { GOD_DEFAULTS, PLAYERS, selectBoard, useStore, type GodWeights } from '../store/useStore'
import { Avatar } from './Avatar'
import { PosTabs } from './PosTabs'
import { PlayerDetail } from './PlayerDetail'
import { RefreshData } from './RefreshData'

interface Row {
  player: Player
  boardPosRank: number
  /** The four input ranks. Vegas and luck are null where the signal doesn't exist. */
  you: number
  adp: number
  vgs: number | null
  lck: number | null
  gf: number
  val: number
  score: number
  missing: number
  /** ADP rank over the pool — VAL's other half; the column shows the raw ADP. */
  adpR: number
  /** Each signal's percentile, for the dots on the row's track. Null = signal is blind. */
  sig: { you: number; adp: number; vgs: number | null; lck: number | null }
}

type Key = keyof Omit<Row, 'player' | 'score' | 'missing' | 'sig' | 'adpR'>

interface Column {
  key: Key
  label: string
  title: string
  signed?: boolean
  digits?: number
  ascFirst?: boolean
}

const COLUMNS: Column[] = [
  { key: 'you', label: 'YOU', title: 'Your board rank', ascFirst: true },
  { key: 'adp', label: 'ADP', title: 'Sleeper ADP (PPR) — today’s if the data has been refreshed', digits: 1, ascFirst: true },
  { key: 'vgs', label: 'VGS', title: 'Vegas rank — the books’ season lines scored under this league’s rules, over replacement', ascFirst: true },
  { key: 'lck', label: 'LCK', title: 'Luck rank — last season’s luck-adjusted pace over replacement: what he does, not what happened to him', ascFirst: true },
  { key: 'gf', label: 'GF', title: 'The Godfather rank — every signal, weighted by the sliders', ascFirst: true },
  { key: 'val', label: 'VAL', title: 'ADP rank minus Godfather rank — positive means the room lets you draft him later than the board says he should go', signed: true },
]

const GROUPS = [
  { label: 'Inputs', from: 3, to: 6 },
  { label: 'Verdict', from: 7, to: 8 },
]

const W_LABELS: Record<keyof GodWeights, string> = { vegas: 'Vegas', you: 'You', adp: 'ADP', luck: 'Luck' }
const W_KEYS = ['vegas', 'you', 'adp', 'luck'] as const
/** The weight sliders and the row dots speak the same color. */
const W_DOT: Record<keyof GodWeights, string> = { vegas: 'c-vgs', you: 'c-you', adp: 'c-adp', luck: 'c-lck' }

const fmt = (v: number | null, digits = 0, signed = false) => {
  if (v == null) return '—'
  const s = v.toFixed(digits)
  return signed && v > 0 ? `+${s}` : s
}

const tone = (v: number | null, floor: number) =>
  v == null || Math.abs(v) < floor ? '' : v > 0 ? 'up' : 'down'

/** Rank -> percentile inside its own pool, so signals of different sizes can mix. */
const pct = (rank: number, n: number) => (rank - 0.5) / n

export function GodfatherBoard() {
  const { items, query, posFilter, selectedId, picks, teams, mySlot, hideDrafted, godW,
    setQuery, setPosFilter, setHideDrafted, setGodW, select, movePlayerToRank, removePlayer,
    insertTierAbove, movePlayerToNextTier, movePlayerToBottom, draftPlayer, applyOrder } = useStore()

  const [sortKey, setSortKey] = useState<Key>('gf')
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

  // Sliders all at zero means "rank by nothing"; fall back to the defaults instead.
  const weights = W_KEYS.some((k) => godW[k] > 0) ? godW : GOD_DEFAULTS
  const wTotal = W_KEYS.reduce((a, k) => a + weights[k], 0)

  const rows = useMemo<Row[]>(() => {
    // The pool is your board — everyone you haven't cut — so all four signals
    // rank the same set of players before they're mixed.
    const pool = ranked.map((r) => r.player)
    const n = pool.length

    const adpOrder = [...pool].sort((a, b) => liveAdp(adpMap, a) - liveAdp(adpMap, b))
    const adpRank = new Map(adpOrder.map((p, i) => [p.id, i + 1]))

    const vegasPool = Object.keys(vegas.players).length
    const repl = vegas.replacement?.pts ?? { QB: 0, RB: 0, WR: 0, TE: 0 }

    // Luck signal: last season's luck-adjusted 17-game pace over replacement —
    // the Luck Table's verdict on what a player is, folded in as one number.
    const luckVal = (p: Player): number | null => {
      const line = p.adj ?? p.last
      const ppg = line?.luckPpg ?? line?.ppg
      if (ppg == null) return null
      return ppg * 17 - (repl[p.pos] ?? 0)
    }
    const luckOrder = pool
      .map((p) => ({ p, v: luckVal(p) }))
      .filter((x): x is { p: Player; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v)
    const luckRank = new Map(luckOrder.map(({ p }, i) => [p.id, i + 1]))
    const luckPool = luckOrder.length

    const base = pool.map((player) => {
      const you = rankById.get(player.id) ?? n
      const adpR = adpRank.get(player.id) ?? n
      const v = vegas.players[player.id]
      const lck = luckRank.get(player.id) ?? null

      const sig = {
        you: pct(you, n),
        adp: pct(adpR, n),
        vgs: v ? pct(v.rank, vegasPool) : null,
        lck: lck != null ? pct(lck, luckPool) : null,
      }

      // Weighted mean of the percentiles each signal puts the player at; a
      // signal that doesn't exist for him hands its weight to the others.
      let num = 0
      let den = 0
      const add = (w: number, p: number | null) => {
        if (p == null || w <= 0) return
        num += w * p
        den += w
      }
      add(weights.you, sig.you)
      add(weights.adp, sig.adp)
      add(weights.vegas, sig.vgs)
      add(weights.luck, sig.lck)

      return {
        player,
        boardPosRank: posRank.get(player.id) ?? 0,
        you,
        adp: liveAdp(adpMap, player),
        vgs: v?.rank ?? null,
        lck,
        gf: 0,
        val: 0,
        score: den > 0 ? num / den : 1,
        missing: (v ? 0 : 1) + (lck == null ? 1 : 0),
        adpR,
        sig,
      }
    })

    ;[...base].sort((a, b) => a.score - b.score).forEach((r, i) => { r.gf = i + 1 })
    for (const r of base) r.val = r.adpR - r.gf
    return base
  }, [ranked, rankById, posRank, adpMap, vegas, weights])

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
      if (x == null && y == null) return a.gf - b.gf
      if (x == null) return 1
      if (y == null) return -1
      if (x === y) return a.gf - b.gf
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

  const applyGodfather = () => {
    const order = [...rows].sort((a, b) => a.gf - b.gf).map((r) => r.player.id)
    if (
      window.confirm(
        `Reorder all ${order.length} players on your big board into the Godfather order? Your tiers stay where they are.`,
      )
    )
      applyOrder(order)
  }

  const selected = selectedId ? PLAYERS.find((p) => p.id === selectedId) ?? null : null

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

          <button className="btn ghost sm" onClick={applyGodfather} title="Reorder your big board into the Godfather order — tiers stay put">
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
        </div>

        <div className="toolbar god-weights">
          <span className="gw-title">Weights</span>
          {W_KEYS.map((k) => (
            <label key={k} className="gw" title={`How much ${W_LABELS[k]} counts in the mix`}>
              <i className={`gw-dot ${W_DOT[k]}`} aria-hidden />
              <span className="gw-label">{W_LABELS[k]}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={godW[k]}
                onChange={(e) => setGodW({ [k]: Number(e.target.value) })}
              />
              <span className="gw-pct">{wTotal > 0 ? Math.round((100 * weights[k]) / wTotal) : 0}%</span>
            </label>
          ))}
          <button className="btn ghost sm" onClick={() => setGodW(GOD_DEFAULTS)}>
            Reset
          </button>
        </div>

        <div className="stats-wrap god-wrap">
          <div className="stats-head">
            <span className="sh-player">Player</span>
            <span className="sh-sig-head" style={{ gridRow: 2 }}>Signals</span>
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
                        {r.missing > 0 && (
                          <span className="drop-chip" title={`${r.missing === 2 ? 'No Vegas lines and no last season' : r.vgs == null ? 'No Vegas lines on him' : 'No last season'} — the other signals carry his rank`}>
                            {r.missing === 2 ? '2 blind' : r.vgs == null ? 'no vgs' : 'no lck'}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>

                  <span
                    className="sh-track"
                    aria-hidden
                    title={[
                      `You #${r.you}`,
                      `ADP #${r.adpR}`,
                      r.vgs != null ? `Vegas #${r.vgs}` : 'Vegas — no lines',
                      r.lck != null ? `Luck #${r.lck}` : 'Luck — no last season',
                    ].join(' · ')}
                  >
                    {([['you', r.sig.you], ['adp', r.sig.adp], ['vgs', r.sig.vgs], ['lck', r.sig.lck]] as const).map(
                      ([k, v]) =>
                        v != null && (
                          <i
                            key={k}
                            className={`sig c-${k}`}
                            style={{ left: `${Math.max(3, Math.min(97, v * 100))}%` }}
                          />
                        ),
                    )}
                  </span>

                  <span className="sh-num dim" data-label="You">{fmt(r.you)}</span>
                  <span className="sh-num dim" data-label="ADP">{fmtAdp(r.adp)}</span>
                  <span className="sh-num" data-label="Vegas">{fmt(r.vgs)}</span>
                  <span className="sh-num" data-label="Luck">{fmt(r.lck)}</span>
                  <span className="sh-num strong rank-cell" data-label="Godfather">{fmt(r.gf)}</span>
                  <span className={`sh-num spread ${tone(r.val, 8)}`} data-label="Value">
                    {fmt(r.val, 0, true)}
                  </span>
                </div>
              )
            })}
            {!visible.length && <div className="empty">Nothing matches that filter.</div>}
          </div>

          <p className="stats-key">
            One board from four signals — the books' season lines (<b>VGS</b>), your rankings (<b>YOU</b>),
            Sleeper ADP, and last season's luck-adjusted pace (<b>LCK</b>) — each turned into a rank over the
            same pool and mixed at the sliders' weights. A player a signal can't see hands that weight to the
            others. <b>GF</b> is the verdict; <b>VAL</b> is what the room charges for it — positive means ADP
            hands him to you later than the board says he should go. It recomputes the moment your rankings
            change, and <b>Refresh data</b> pulls today's ADP and lines into it.
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
            <h3>The Godfather board</h3>
            <p className="detail-note">
              Everything the app knows about a player — what the books bet, what you believe, what the market
              pays, what his opportunity said last season — weighed into one ranking. Move the sliders to
              change how much each voice counts; it updates as you re-rank players and whenever the data
              refreshes.
            </p>
            <p className="detail-note">
              Sort by <b>VAL</b> to see whose price is wrong, and <b>Apply to board</b> to make the big board
              an offer it can't refuse.
            </p>
          </>
        }
      />
    </div>
  )
}
