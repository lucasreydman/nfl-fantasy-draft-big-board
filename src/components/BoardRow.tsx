import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Player } from '../types'
import { POS_COLOR, fmtAdp, injuryTag } from '../lib/format'
import { Avatar } from './Avatar'

const GripIcon = () => (
  <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden>
    <circle cx="2" cy="3" r="1.4" /><circle cx="8" cy="3" r="1.4" />
    <circle cx="2" cy="8" r="1.4" /><circle cx="8" cy="8" r="1.4" />
    <circle cx="2" cy="13" r="1.4" /><circle cx="8" cy="13" r="1.4" />
  </svg>
)

/** Column headers, sharing the row track template so everything stays aligned. */
export function BoardHeader() {
  return (
    <div className="list-head" aria-hidden>
      <span />
      <span className="ta-r">#</span>
      <span />
      <span>Player</span>
      <span>Pos</span>
      <span>Team</span>
      <span className="ta-r">Bye</span>
      <span className="ta-r">ADP</span>
      <span className="ta-r">Cons</span>
      <span className="ta-r">Vs</span>
      <span />
    </div>
  )
}

interface RowProps {
  player: Player
  rank: number
  posRank: number
  tierColor: string | null
  drafted: boolean
  draftedBy: string | null
  selected: boolean
  onSelect: () => void
  onBump: (delta: number) => void
  onDraft?: () => void
  avatarSize?: number
}

export const PlayerRow = memo(function PlayerRow({
  player, rank, posRank, tierColor, drafted, draftedBy, selected, onSelect, onBump, onDraft,
  avatarSize = 44,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
  })

  // Positive = you rank them higher than consensus. Meaningless without a real ADP.
  const delta = player.estimated ? null : player.rank - rank

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ['--pos-color' as string]: POS_COLOR[player.pos],
        ['--tier-color' as string]: tierColor ?? 'transparent',
      }}
      className={[
        'row',
        drafted && 'row-drafted',
        selected && 'row-selected',
        isDragging && 'row-dragging',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
    >
      <button className="grip" {...attributes} {...listeners} aria-label={`Reorder ${player.name}`}>
        <GripIcon />
      </button>

      <div className="row-rank">{rank}</div>
      <Avatar player={player} size={avatarSize} />

      <div className="row-main">
        <div className="row-name">
          {player.name}
          {player.injury && <span className="injury">{injuryTag(player.injury)}</span>}
        </div>
        {draftedBy && <div className="row-taken">{draftedBy}</div>}
      </div>

      <div><span className="pos-chip">{player.pos}{posRank}</span></div>
      <div className="row-team">{player.team ?? 'FA'}</div>
      <div className="row-num dim">{player.bye ?? '\u2014'}</div>
      <div className="row-num">{player.estimated ? '\u2014' : fmtAdp(player.adp)}</div>
      <div className="row-num dim">{player.estimated ? '\u2014' : `#${player.rank}`}</div>
      <div className={`row-num row-delta ${!delta ? '' : delta > 0 ? 'up' : 'down'}`}>
        {delta ? `${delta > 0 ? '+' : ''}${delta}` : '\u2014'}
      </div>

      <div className="row-actions">
        <button onClick={(e) => { e.stopPropagation(); onBump(-1) }} title="Move up">▲</button>
        <button onClick={(e) => { e.stopPropagation(); onBump(1) }} title="Move down">▼</button>
        {onDraft && (
          <button
            className="draft-btn"
            disabled={drafted}
            onClick={(e) => { e.stopPropagation(); onDraft() }}
          >
            Draft
          </button>
        )}
      </div>
    </div>
  )
})

interface TierProps {
  id: string
  name: string
  color: string
  count: number
  colors: string[]
  onRename: (name: string) => void
  onRecolor: (color: string) => void
  onRemove: () => void
}

export function TierRow({ id, name, color, count, colors, onRename, onRecolor, onRemove }: TierProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ['--tier-color' as string]: color,
      }}
      className={`tier ${isDragging ? 'row-dragging' : ''}`}
    >
      <button className="grip" {...attributes} {...listeners} aria-label={`Reorder ${name}`}>
        <GripIcon />
      </button>
      <span className="tier-dot" />
      <input
        className="tier-name"
        value={name}
        onChange={(e) => onRename(e.target.value)}
        aria-label="Tier name"
      />
      <span className="tier-count">{count} {count === 1 ? 'player' : 'players'}</span>
      <div className="tier-colors">
        {colors.map((c) => (
          <button
            key={c}
            className={`swatch ${c === color ? 'on' : ''}`}
            style={{ background: c }}
            onClick={() => onRecolor(c)}
            aria-label={`Set tier color ${c}`}
          />
        ))}
      </div>
      <button className="tier-remove" onClick={onRemove} aria-label="Delete tier">✕</button>
    </div>
  )
}
