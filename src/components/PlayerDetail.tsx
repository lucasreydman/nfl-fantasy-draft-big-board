import { useEffect, useState } from 'react'
import type { Player } from '../types'
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value ?? '—'}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function PlayerDetail({
  player, rank, posRank, tierName, tierColor, drafted, draftedBy, boardSize,
  onMoveToRank, onDraft, fallback,
}: Props) {
  const [rankInput, setRankInput] = useState('')

  useEffect(() => setRankInput(rank ? String(rank) : ''), [rank, player?.id])

  if (!player) return <aside className="detail detail-empty">{fallback}</aside>

  const delta = rank == null || player.estimated ? 0 : Math.round(player.adp - rank)
  const logo = teamLogo(player.team)

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
            {player.estimated ? 'no ADP' : delta === 0 ? 'on ADP' : `${delta > 0 ? '+' : ''}${delta} vs ADP`}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="ADP (PPR)" value={player.estimated ? '—' : fmtAdp(player.adp)} />
        <Stat label="Half PPR" value={fmtAdp(player.adpHalf)} />
        <Stat label="Standard" value={fmtAdp(player.adpStd)} />
        <Stat label="Range" value={player.high ? `${player.high}–${player.low}` : '—'} />
        <Stat label="Std dev" value={player.stdev != null ? player.stdev.toFixed(1) : '—'} />
        <Stat label="Drafts" value={player.timesDrafted?.toLocaleString() ?? '—'} />
        <Stat label="Age" value={player.age ?? '—'} />
        <Stat label="Exp" value={player.exp == null ? '—' : player.exp === 0 ? 'Rookie' : `${player.exp} yr`} />
        <Stat label="College" value={player.college ?? '—'} />
      </div>

      {onDraft && (
        <button className="btn primary block" disabled={drafted} onClick={onDraft}>
          {drafted ? `Drafted${draftedBy ? ` · ${draftedBy}` : ''}` : `Draft ${player.name}`}
        </button>
      )}
    </aside>
  )
}
