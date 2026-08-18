import { useEffect, useState } from 'react'
import type { AdjustedLine, Benchmark, Player, Pos, StatLine } from '../types'
import { POS_COLOR, fmtAdp, ordinal, teamLogo } from '../lib/format'
import { DATA, useStore } from '../store/useStore'
import { Avatar } from './Avatar'

interface Props {
  player: Player | null
  rank: number | null
  posRank: number | null
  tierName: string | null
  tierColor: string | null
  drafted: boolean
  draftedBy: string | null
  boardSize: number
  onMoveToRank: (rank: number) => void
  onRemove: () => void
  onDraft?: () => void
  fallback: React.ReactNode
}

const n0 = (n?: number | null) => (n == null ? null : Math.round(n).toLocaleString())
const n1 = (n?: number | null) => (n == null ? null : n.toFixed(1))
const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '')
const signed = (n: number) => `${n > 0 ? '+' : ''}${trim(n)}`
const feet = (inches?: number | null) => (inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : null)

function Stat({ label, value, chip }: { label: string; value: React.ReactNode; chip?: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
      {chip}
    </div>
  )
}

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="detail-sec">
      <h3>
        <span>{title}</span>
        {note != null && <span className="sec-note">{note}</span>}
      </h3>
      {children}
    </section>
  )
}

/** One labelled row of dot-separated stats. Renders nothing when every part is missing. */
function Line({ label, parts }: { label: string; parts: (string | null)[] }) {
  const shown = parts.filter(Boolean)
  if (!shown.length) return null
  return (
    <div className="statline">
      <span className="statline-label">{label}</span>
      <span className="statline-val">{shown.join(' · ')}</span>
    </div>
  )
}

/** Green at the top of the position, orange at the bottom — the point is the reader's eye. */
const tone = (pctile?: number) =>
  pctile == null ? '' : pctile >= 90 ? 'elite' : pctile >= 70 ? 'strong' : pctile >= 40 ? 'mid' : 'low'

interface BarProps {
  label: string
  pct?: number
  rank?: number
  pctile?: number
  bench?: Benchmark
  poolSize?: number
  /** Shares read as percentages; red-zone work reads as a raw count. */
  unit?: '%' | 'count'
}

/**
 * A share on its own is unreadable — 54% of the snaps is a workhorse at running back and a
 * part-timer at receiver. The bar spans zero to whatever the position's leader did and is
 * marked at the median, so the fill itself says where the player sits.
 *
 * Categories the position barely touches are dropped rather than drawn: a receiver with ten
 * carries would otherwise post a full bar and read like a featured back.
 */
function Bar({ label, pct, rank, pctile, bench, poolSize, unit = '%' }: BarProps) {
  if (pct == null) return null
  if (bench && bench.hi < 2 && pct < 3) return null
  const ceiling = Math.max(bench?.max ?? pct, pct, 1)
  const median = bench && bench.med > 0 ? Math.min(100, (bench.med / ceiling) * 100) : null
  return (
    <div className="usage-row">
      <div className="usage-head">
        <span className="usage-label">{label}</span>
        {rank != null && poolSize != null && (
          <span className={`pctile-chip ${tone(pctile)}`}>{ordinal(rank)} of {poolSize}</span>
        )}
        <span className="usage-val">{unit === '%' ? `${pct.toFixed(1)}%` : pct}</span>
      </div>
      <div className="usage-bar">
        <span className={`usage-fill ${tone(pctile)}`} style={{ width: `${Math.min(100, (pct / ceiling) * 100)}%` }} />
        {median != null && <span className="usage-tick" style={{ left: `${median}%` }} />}
      </div>
    </div>
  )
}

const passing = (s: StatLine) => {
  const ypa = s.passYpa ?? (s.passAtt && s.passYd ? s.passYd / s.passAtt : null)
  return [
    s.passCmp != null && s.passAtt != null ? `${s.passCmp}/${s.passAtt}` : s.passAtt != null ? `${s.passAtt} att` : null,
    s.passYd != null ? `${n0(s.passYd)} yd` : null,
    s.passTd != null ? `${trim(s.passTd)} TD` : null,
    s.passInt != null ? `${trim(s.passInt)} INT` : null,
    s.cmpPct != null ? `${s.cmpPct}% cmp` : null,
    ypa != null ? `${n1(ypa)} Y/A` : null,
    s.passRtg != null ? `${s.passRtg} rtg` : null,
    s.sacks != null ? `${s.sacks} sacks` : null,
  ]
}

const rushing = (s: StatLine) => {
  const ypc = s.ypc ?? (s.rushAtt && s.rushYd ? s.rushYd / s.rushAtt : null)
  return [
    s.rushAtt != null ? `${n0(s.rushAtt)} car` : null,
    s.rushYd != null ? `${n0(s.rushYd)} yd` : null,
    s.rushTd != null ? `${trim(s.rushTd)} TD` : null,
    ypc != null ? `${n1(ypc)} Y/C` : null,
    s.brokenTkl != null ? `${s.brokenTkl} broken` : null,
  ]
}

const receiving = (s: StatLine) => {
  const ypr = s.ypr ?? (s.rec && s.recYd ? s.recYd / s.rec : null)
  return [
    s.tgt != null ? `${s.tgt} tgt` : null,
    s.rec != null ? `${n0(s.rec)} rec` : null,
    s.recYd != null ? `${n0(s.recYd)} yd` : null,
    s.recTd != null ? `${trim(s.recTd)} TD` : null,
    ypr != null ? `${n1(ypr)} Y/R` : null,
    s.catchPct != null ? `${s.catchPct}% caught` : null,
  ]
}

/** Each position leads with the line that defines it: pass for a QB, carries for a RB, targets otherwise. */
const LINE_ORDER: Record<Pos, ('pass' | 'rush' | 'rec')[]> = {
  QB: ['pass', 'rush', 'rec'],
  RB: ['rush', 'rec', 'pass'],
  WR: ['rec', 'rush', 'pass'],
  TE: ['rec', 'rush', 'pass'],
}

function StatLines({ s, pos }: { s: StatLine; pos: Pos }) {
  // A non-QB's stray attempt or two is trivia, not usage worth a row of its own.
  const trickPlay = pos !== 'QB' && !(s.passTd != null || (s.passAtt ?? 0) >= 5)
  const lines = {
    pass: trickPlay ? null : <Line key="pass" label="Pass" parts={passing(s)} />,
    rush: <Line key="rush" label="Rush" parts={rushing(s)} />,
    rec: <Line key="rec" label="Rec" parts={receiving(s)} />,
  }
  return <div className="statlines">{LINE_ORDER[pos].map((k) => lines[k])}</div>
}

const weekList = (list: { w: number }[]) => list.map((d) => `W${d.w}`).join(', ')

/** Plain English for what the adjusted line left out, so the reader can disagree with it. */
function droppedSummary(adj: AdjustedLine) {
  const partial = adj.dropped.filter((d) => d.r === 'partial')
  const qb = adj.dropped.filter((d) => d.r === 'qb')
  const bits: string[] = []
  if (partial.length) bits.push(`${partial.length} he left early (${weekList(partial)})`)
  if (qb.length) bits.push(`${qb.length} without his starting quarterback (${weekList(qb)})`)
  return bits.join(', and ')
}

export function PlayerDetail({
  player, rank, posRank, tierName, tierColor, drafted, draftedBy, boardSize,
  onMoveToRank, onRemove, onDraft, fallback,
}: Props) {
  const [rankInput, setRankInput] = useState('')
  const statMode = useStore((s) => s.statMode)
  const select = useStore((s) => s.select)
  const setStatMode = useStore((s) => s.setStatMode)

  useEffect(() => setRankInput(rank ? String(rank) : ''), [rank, player?.id])

  if (!player) return <aside className="detail detail-empty">{fallback}</aside>

  const delta = rank == null ? 0 : player.rank - rank
  const logo = teamLogo(player.team)
  const { last, adj, proj } = player

  // The adjusted view falls back to the raw line for anyone who had no distorted games.
  const adjusted = statMode === 'adj'
  const line = adjusted ? (adj ?? last) : last
  const bench = DATA.usage?.byMode?.[statMode]?.[player.pos]

  // A positive split means Sleeper leagues take him earlier than FFC's mocks do.
  const marketSplit = player.adpFfc == null ? null : player.adpFfc - player.adp

  // How the projection reads against what he actually did — the number a drafter is really weighing.
  const ppgDelta = proj?.ppg != null && line?.ppg != null ? proj.ppg - line.ppg : null

  const submitRank = () => {
    const n = Number(rankInput)
    if (Number.isFinite(n) && n >= 1 && n <= boardSize) onMoveToRank(Math.round(n))
    else setRankInput(rank ? String(rank) : '')
  }

  const modeToggle = (
    <span className="mode-toggle" role="group" aria-label="Stat basis">
      <button className={adjusted ? '' : 'on'} onClick={() => setStatMode('raw')}>Raw</button>
      <button className={adjusted ? 'on' : ''} onClick={() => setStatMode('adj')}>Adjusted</button>
    </span>
  )

  return (
    <aside className="detail" style={{ ['--pos-color' as string]: POS_COLOR[player.pos] }}>
      {/* Only reachable on a phone, where the card is a sheet over the list rather than a column beside it. */}
      <button className="detail-close" onClick={() => select(null)} aria-label="Close player card">✕</button>

      <div className="detail-hero">
        {logo && <img className="detail-logo" src={logo} alt="" aria-hidden />}
        <Avatar player={player} size={104} full />
        <div className="detail-id">
          <h2>{player.name}</h2>
          <div className="detail-meta">
            <span className="pos-chip lg">{player.pos}{posRank ?? ''}</span>
            <span>{player.team ?? 'FA'}</span>
            {player.number != null && <span className="dim">#{player.number}</span>}
            {player.bye && <span className="dim">BYE {player.bye}</span>}
          </div>
          {player.injury && <div className="detail-injury">{player.injury}</div>}
        </div>
      </div>

      {tierName && (
        <div className="detail-tier" style={{ ['--tier-color' as string]: tierColor ?? '#888' }}>
          <span className="tier-dot" /> {tierName}
        </div>
      )}

      <div className="detail-rank">
        <label htmlFor="rank-input">Your rank</label>
        <div className="rank-input-row">
          <input
            id="rank-input"
            value={rankInput}
            inputMode="numeric"
            onChange={(e) => setRankInput(e.target.value.replace(/\D/g, ''))}
            onBlur={submitRank}
            onKeyDown={(e) => e.key === 'Enter' && submitRank()}
          />
          <span className={`delta-pill ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
            {delta === 0 ? 'on consensus' : `${delta > 0 ? '+' : ''}${delta} vs consensus`}
          </span>
        </div>
      </div>

      <Section title="Draft market">
        <div className="stat-grid">
          <Stat label="ADP (PPR)" value={fmtAdp(player.adp)} />
          <Stat label="Consensus" value={`#${player.rank}`} />
          <Stat label="Half PPR" value={fmtAdp(player.adpHalf)} />
          <Stat label="Standard" value={fmtAdp(player.adpStd)} />
          <Stat label="FFC ADP" value={fmtAdp(player.adpFfc)} />
          <Stat label="Range" value={player.high ? `${player.high}–${player.low}` : '—'} />
          <Stat label="Std dev" value={player.stdev != null ? player.stdev.toFixed(1) : '—'} />
        </div>
        {/* The two markets usually agree; where they don't, the disagreement is the story. */}
        {marketSplit != null && Math.abs(marketSplit) >= 8 && (
          <div className={`trend ${marketSplit > 0 ? 'up' : 'down'}`}>
            Markets disagree — Sleeper drafts him {Math.abs(Math.round(marketSplit))} picks{' '}
            {marketSplit > 0 ? 'earlier' : 'later'} than FantasyFootballCalculator
          </div>
        )}
        <div className="statlines">
          <Line
            label="Source"
            parts={[
              player.adpSource === 'sleeper' ? 'Sleeper redraft' : 'FFC only',
              player.timesDrafted != null ? `${player.timesDrafted.toLocaleString()} FFC drafts` : null,
            ]}
          />
        </div>
      </Section>

      {proj && (
        <Section
          title={`${proj.season} projection`}
          note={proj.posRank != null && <span className="rank-chip">{player.pos}{proj.posRank}</span>}
        >
          <div className="stat-grid">
            <Stat label="Proj pts" value={n1(proj.ptsPpr)} />
            <Stat label="Proj PPG" value={n1(proj.ppg)} />
            <Stat label="Games" value={n0(proj.gp)} />
          </div>
          {ppgDelta != null && line && (
            <div className={`trend ${ppgDelta > 0 ? 'up' : ppgDelta < 0 ? 'down' : ''}`}>
              {ppgDelta > 0 ? '▲' : ppgDelta < 0 ? '▼' : '■'} {Math.abs(ppgDelta).toFixed(1)} PPG vs his{' '}
              {adjusted ? 'adjusted' : String(line.season)} rate
            </div>
          )}
          <StatLines s={proj} pos={player.pos} />
        </Section>
      )}

      {line ? (
        <>
          <Section title={adjusted ? `${line.season} adjusted` : `${line.season} season`} note={modeToggle}>
            <div className="stat-grid">
              <Stat
                label={adjusted ? 'PPG (clean)' : 'PPR PPG'}
                value={n1(line.ppg)}
                chip={line.ppgRank != null && bench
                  ? <span className={`pctile-chip ${tone(line.ppgPctile)}`}>{ordinal(line.ppgRank)} of {bench.n}</span>
                  : undefined}
              />
              <Stat label="Luck-adj PPG" value={n1(line.luckPpg)} />
              <Stat
                label="Games"
                value={adjusted && adj ? `${line.gp}/${last!.gp}` : line.gp != null ? `${line.gs ?? line.gp}/${line.gp}` : null}
              />
              {/* Over a clean-game window a total reads like a season; a pace and a rate don't. */}
              <Stat
                label={adjusted ? '17-game pace' : 'PPR pts'}
                value={adjusted ? n0(line.ppg != null ? line.ppg * 17 : null) : n1(line.ptsPpr)}
              />
              <Stat label="Finish" value={last?.posRank != null ? `${player.pos}${last.posRank}` : '—'} />
              <Stat
                label={adjusted ? 'Scrim y/g' : 'Scrim yds'}
                value={adjusted ? n0(line.scrimYd != null && line.gp ? line.scrimYd / line.gp : null) : n0(line.scrimYd)}
              />
            </div>

            {line.xTd != null && line.tdLuck != null && (
              <div className={`trend ${line.tdLuck > 1 ? 'down' : line.tdLuck < -1 ? 'up' : ''}`}>
                {trim(line.tds ?? 0)} TD vs {n1(line.xTd)} expected — {signed(line.tdLuck)} on opportunity
              </div>
            )}

            <StatLines s={line} pos={player.pos} />
            <div className="statlines">
              <Line
                label="Misc"
                parts={[
                  line.fd != null ? `${line.fd} 1st downs` : null,
                  line.fum != null ? `${line.fum} fum` : null,
                  line.drops != null ? `${line.drops} drops` : null,
                ]}
              />
            </div>

            {adjusted && adj ? (
              <p className="usage-key">
                Leaves out {adj.dropped.length} of {last!.gp} games: {droppedSummary(adj)}. Luck-adjusted PPG
                re-prices touchdowns at the rate his red-zone work implies.
              </p>
            ) : adjusted ? (
              <p className="usage-key">
                Nothing to drop — every game was a full outing with his starting quarterback.
              </p>
            ) : adj && adj.ppg != null && last?.ppg != null && Math.abs(adj.ppg - last.ppg) >= 0.5 ? (
              <button className="mode-hint" onClick={() => setStatMode('adj')}>
                {n1(adj.ppg)} PPG across his {adj.gp} clean games — see adjusted
              </button>
            ) : null}
          </Section>

          <Section title={adjusted ? `${line.season} usage (clean games)` : `${line.season} usage`}>
            <div className="usage">
              <Bar label="Snaps" pct={line.snapPct} rank={line.snapRank} pctile={line.snapPctile}
                bench={bench?.snapPct} poolSize={bench?.n} />
              <Bar label="Carries" pct={line.rushShare} rank={line.rushRank} pctile={line.rushPctile}
                bench={bench?.rushShare} poolSize={bench?.n} />
              <Bar label="Targets" pct={line.tgtShare} rank={line.tgtRank} pctile={line.tgtPctile}
                bench={bench?.tgtShare} poolSize={bench?.n} />
              <Bar label="Red zone" pct={line.rzOpp} rank={line.rzRank} pctile={line.rzPctile}
                bench={bench?.rzOpp} poolSize={bench?.n} unit="count" />
            </div>
            <div className="statlines">
              <Line
                label="RZ"
                parts={[
                  line.rzCarry != null ? `${line.rzCarry} car` : null,
                  line.rzTgt != null ? `${line.rzTgt} tgt` : null,
                ]}
              />
              <Line
                label="Eff"
                parts={[
                  line.ypt != null ? `${line.ypt} Y/tgt` : null,
                  line.airYd != null ? `${n0(line.airYd)} air yds` : null,
                  line.gp && line.tgt ? `${n1(line.tgt / line.gp)} tgt/g` : null,
                  line.gp && line.rushAtt ? `${n1(line.rushAtt / line.gp)} car/g` : null,
                ]}
              />
            </div>
            {bench && (
              <p className="usage-key">
                Ranked among {bench.n} {player.pos}s with {DATA.usage.qualifier}. Each bar spans zero to
                the position's leader; the tick marks its median.
              </p>
            )}
          </Section>
        </>
      ) : (
        <Section title="Prior season">
          <p className="detail-note">
            No {proj ? proj.season - 1 : 'prior'} season production on record
            {player.exp === 0 ? ' — rookie.' : '.'}
          </p>
        </Section>
      )}

      <Section title="Player">
        <div className="stat-grid">
          <Stat label="Age" value={player.age ?? '—'} />
          <Stat label="Exp" value={player.exp == null ? '—' : player.exp === 0 ? 'Rookie' : `${player.exp} yr`} />
          <Stat label="Depth" value={player.depthOrder != null ? `${player.pos}${player.depthOrder}` : '—'} />
          <Stat label="Height" value={feet(player.height) ?? '—'} />
          <Stat label="Weight" value={player.weight != null ? `${player.weight} lb` : '—'} />
          <Stat label="Bye" value={player.bye ?? '—'} />
          <Stat label="College" value={player.college ?? '—'} />
          <Stat label="Number" value={player.number != null ? `#${player.number}` : '—'} />
        </div>
      </Section>

      {onDraft && (
        <button className="btn primary block" disabled={drafted} onClick={onDraft}>
          {drafted ? `Drafted${draftedBy ? ` · ${draftedBy}` : ''}` : `Draft ${player.name}`}
        </button>
      )}

      <button className="btn danger block" onClick={onRemove}>
        Remove from board
      </button>
    </aside>
  )
}
