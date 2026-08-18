import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Player, Pos } from '../types'
import { POSITIONS, POS_COLOR, fmtAdp } from '../lib/format'
import { Avatar } from './Avatar'

export interface RankedPlayer {
  player: Player
  rank: number
  tierId: string | null
}

interface Props {
  ranked: RankedPlayer[]
  tierColors: Map<string, string>
  tierNames: Map<string, string>
  draftedIds: Set<string>
  hideDrafted: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
}

function PosRow({
  entry, posRank, tierColor, tierName, drafted, selected, onSelect,
}: {
  entry: RankedPlayer
  posRank: number
  tierColor: string | null
  tierName: string | null
  drafted: boolean
  selected: boolean
  onSelect: () => void
}) {
  const { player, rank } = entry
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: player.id,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ['--pos-color' as string]: POS_COLOR[player.pos],
        ['--tier-color' as string]: tierColor ?? 'transparent',
      }}
      className={[
        'prow',
        drafted && 'row-drafted',
        selected && 'row-selected',
        isDragging && 'row-dragging',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      title={tierName ? `${tierName} · overall #${rank}` : `Overall #${rank}`}
    >
      <span className="prow-rank">{player.pos}{posRank}</span>
      <Avatar player={player} size={26} />
      <span className="prow-name">{player.name}</span>
      <span className="prow-team">{player.team ?? 'FA'}</span>
      <span className="prow-adp">{fmtAdp(player.adp)}</span>
    </div>
  )
}

/** One sortable column per position; dragging reorders the global board too. */
export function PositionalBoard({
  ranked, tierColors, tierNames, draftedIds, hideDrafted, selectedId, onSelect, onReorder,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const byPos = new Map<Pos, RankedPlayer[]>(POSITIONS.map((p) => [p, []]))
  for (const entry of ranked) byPos.get(entry.player.pos)?.push(entry)

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
  }

  return (
    <div className="pos-columns">
      {POSITIONS.map((pos) => {
        const all = byPos.get(pos) ?? []
        // Positional rank comes from the full column so drafted players don't renumber it.
        const posRanks = new Map(all.map((e, i) => [e.player.id, i + 1]))
        const visible = hideDrafted ? all.filter((e) => !draftedIds.has(e.player.id)) : all
        return (
          <section className="pos-column" key={pos} style={{ ['--pos-color' as string]: POS_COLOR[pos] }}>
            <header className="pos-column-head">
              <span className="pos-column-title">{pos}</span>
              <span className="pos-column-count">{visible.length}</span>
            </header>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext
                items={visible.map((e) => e.player.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="pos-column-body">
                  {visible.map((entry) => (
                    <PosRow
                      key={entry.player.id}
                      entry={entry}
                      posRank={posRanks.get(entry.player.id) ?? 0}
                      tierColor={entry.tierId ? tierColors.get(entry.tierId) ?? null : null}
                      tierName={entry.tierId ? tierNames.get(entry.tierId) ?? null : null}
                      drafted={draftedIds.has(entry.player.id)}
                      selected={selectedId === entry.player.id}
                      onSelect={() => onSelect(entry.player.id)}
                    />
                  ))}
                  {!visible.length && <p className="empty">No players left.</p>}
                </div>
              </SortableContext>
            </DndContext>
          </section>
        )
      })}
    </div>
  )
}
