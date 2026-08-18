import { useEffect, useState } from 'react'
import type { Player, Pos, StatLine } from '../types'
import { POS_COLOR, fmtAdp, teamLogo } from '../lib/format'
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
  onDraft?: () => void
  fallback: React.ReactNode
}

const n0 = (n?: number | null) => (n == null ? null : Math.round(n).toLocaleString())
const n1 = (n?: number | null) => (n == null ? null : n.toFixed(1))

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
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

function Bar({ label, pct }: { label: string; pct?: number }) {
  if (pct == null) return null
  return (
    <div className="usage-row">
      <span className="usage-label">{label}</span>
      <span className="usage-bar">
        <span style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="usage-val">{pct.toFixed(1)}%</span>
    </div>
  )
}

const passing = (s: StatLine) => {
  const ypa = s.passYpa ?? (s.passAtt && s.passYd ? s.passYd / s.passAtt : null)
  return [
    s.passCmp != null && s.passAtt != null ? `${s.passCmp}/${s.passAtt}` : s.passAtt != null ? `${s.passAtt} att` : null,
    s.passYd != null ? `${n0(s.passYd)} yd` : null,
    s.passTd != null ? `${n1(s.passTd)!.replace('.0', '')} TD` : null,
    s.passInt != null ? `${n1(s.passInt)!.replace('.0', '')} INT` : null,
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
    s.rushTd != null ? `${n1(s.rushTd)!.replace('.0', '')} TD` : null,
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
    s.recTd != null ? `${n1(s.recTd)!.replace('.0', '')} TD` : null,
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

export function PlayerDetail({
  player, rank, posRank, tierName, tierColor, drafted, draftedBy, boardSize,
  onMoveToRank, onDraft, fallback,
}: Props) {
  const [rankInput, setRankInput] = useState('')

  useEffect(() => setRankInput(rank ? String(rank) : ''), [rank, player?.id])

  if (!player) return <aside className="detail detail-empty">{fallback}</aside>

  const delta = rank == null ? 0 : player.rank - rank
  const logo = teamLogo(player.team)
  const { last, proj } = player

  // How the projection reads against what he actually did — the number a drafter is really weighing.
  const ppgDelta = proj?.ppg != null && last?.ppg != null ? proj.ppg - last.ppg : null

  const submitRank = () => {
    const n = Number(rankInput)
    if (Number.isFinite(n) && n >= 1 && n <= boardSize) onMoveToRank(Math.round(n))
    else setRankInput(rank ? String(rank) : '')
  }

  return (
    <aside className="detail" style={{ ['--pos-color' as string]: POS_COLOR[player.pos] }}>
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
          <Stat label="Range" value={player.high ? `${player.high}–${player.low}` : '—'} />
          <Stat label="Std dev" value={player.stdev != null ? player.stdev.toFixed(1) : '—'} />
        </div>
        <div className="statlines">
          <Line label="Drafts" parts={[player.timesDrafted != null ? `${player.timesDrafted.toLocaleString()} sampled` : null]} />
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
          {ppgDelta != null && (
            <div className={`trend ${ppgDelta > 0 ? 'up' : ppgDelta < 0 ? 'down' : ''}`}>
              {ppgDelta > 0 ? '▲' : ppgDelta < 0 ? '▼' : '■'} {Math.abs(ppgDelta).toFixed(1)} PPG vs {last!.season}
            </div>
          )}
          <StatLines s={proj} pos={player.pos} />
        </Section>
      )}

      {last ? (
        <>
          <Section
            title={`${last.season} season`}
            note={
              <>
                {last.posRank != null && <span className="rank-chip">{player.pos}{last.posRank}</span>}
                {last.ovrRank != null && <span className="dim"> #{last.ovrRank} ovr</span>}
              </>
            }
          >
            <div className="stat-grid">
              <Stat label="PPR pts" value={n1(last.ptsPpr)} />
              <Stat label="PPR PPG" value={n1(last.ppg)} />
              <Stat label="Games" value={last.gp != null ? `${last.gs ?? 0}/${last.gp}` : null} />
              <Stat label="Half PPR" value={n1(last.ptsHalf)} />
              <Stat label="Standard" value={n1(last.ptsStd)} />
              <Stat label="Scrim yds" value={n0(last.scrimYd)} />
            </div>
            <StatLines s={last} pos={player.pos} />
            <div className="statlines">
              <Line
                label="Misc"
                parts={[
                  last.tds != null ? `${last.tds} TD${player.pos === 'QB' ? ' (rush/rec)' : ''}` : null,
                  last.fd != null ? `${last.fd} 1st downs` : null,
                  last.fum != null ? `${last.fum} fum` : null,
                  last.drops != null ? `${last.drops} drops` : null,
                ]}
              />
            </div>
          </Section>

          <Section title={`${last.season} usage`}>
            <div className="usage">
              <Bar label="Snaps" pct={last.snapPct} />
              <Bar label="Carries" pct={last.rushShare} />
              <Bar label="Targets" pct={last.tgtShare} />
            </div>
            <div className="statlines">
              <Line
                label="RZ"
                parts={[
                  last.rzCarry != null ? `${last.rzCarry} car` : null,
                  last.rzTgt != null ? `${last.rzTgt} tgt` : null,
                ]}
              />
              <Line
                label="Eff"
                parts={[
                  last.ypt != null ? `${last.ypt} Y/tgt` : null,
                  last.airYd != null ? `${n0(last.airYd)} air yds` : null,
                  last.gp && last.tgt ? `${n1(last.tgt / last.gp)} tgt/g` : null,
                  last.gp && last.rushAtt ? `${n1(last.rushAtt / last.gp)} car/g` : null,
                ]}
              />
            </div>
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
          <Stat label="College" value={player.college ?? '—'} />
          <Stat label="Bye" value={player.bye ?? '—'} />
          <Stat label="Number" value={player.number != null ? `#${player.number}` : '—'} />
        </div>
      </Section>

      {onDraft && (
        <button className="btn primary block" disabled={drafted} onClick={onDraft}>
          {drafted ? `Drafted${draftedBy ? ` · ${draftedBy}` : ''}` : `Draft ${player.name}`}
        </button>
      )}
    </aside>
  )
}
