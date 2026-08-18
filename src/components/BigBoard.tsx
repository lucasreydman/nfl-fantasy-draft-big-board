import { useMemo, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { BoardItem, Pos } from '../types'
import { POSITIONS, POS_COLOR, TIER_COLORS } from '../lib/format'
import { PLAYER_BY_ID, selectBoard, useStore } from '../store/useStore'
import { BoardHeader, PlayerRow, TierRow } from './BoardRow'
import { PositionalBoard } from './PositionalBoard'
import { PlayerDetail } from './PlayerDetail'

export function BigBoard() {
  const {
    items, boardMode, cardSize, posFilter, query, hideDrafted, selectedId, picks, teams, mySlot,
    setBoardMode, setCardSize, setPosFilter, setQuery, setHideDrafted, select, reorder, movePlayerBy,
    movePlayerToRank, addTier, updateTier, removeTier, autoTier, clearTiers, resetBoard,
    importBoard, draftPlayer,
  } = useStore()

  const [sensitivity, setSensitivity] = useState(4)
  const fileRef = useRef<HTMLInputElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const { ranked, posRank } = useMemo(() => selectBoard(items), [items])
  const rankById = useMemo(() => new Map(ranked.map((r) => [r.player.id, r.rank])), [ranked])
  const tierOf = useMemo(() => new Map(ranked.map((r) => [r.player.id, r.tierId])), [ranked])

  const { tierColors, tierNames, tierCounts } = useMemo(() => {
    const colors = new Map<string, string>()
    const names = new Map<string, string>()
    const counts = new Map<string, number>()
    let current: string | null = null
    for (const item of items) {
      if (item.kind === 'tier') {
        current = item.id
        colors.set(item.id, item.color)
        names.set(item.id, item.name)
        counts.set(item.id, 0)
      } else if (current) {
        counts.set(current, (counts.get(current) ?? 0) + 1)
      }
    }
    return { tierColors: colors, tierNames: names, tierCounts: counts }
  }, [items])

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

  const q = query.trim().toLowerCase()
  const visible: BoardItem[] = useMemo(
    () =>
      items.filter((item) => {
        if (item.kind === 'tier') return !q
        const p = PLAYER_BY_ID.get(item.id)
        if (!p) return false
        if (hideDrafted && draftedIds.has(p.id)) return false
        if (posFilter !== 'ALL' && p.pos !== posFilter) return false
        if (q && !`${p.name} ${p.team ?? ''} ${p.pos}`.toLowerCase().includes(q)) return false
        return true
      }),
    [items, q, posFilter, hideDrafted, draftedIds],
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) reorder(String(active.id), String(over.id))
  }

  const exportBoard = () => {
    const payload = {
      format: 'nfl-big-board',
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `big-board-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const next = Array.isArray(parsed) ? parsed : parsed.items
      if (!Array.isArray(next) || !next.every((i) => i?.kind && i?.id)) {
        throw new Error('Not a big board export')
      }
      importBoard(next as BoardItem[])
    } catch (err) {
      alert(`Could not import that file: ${(err as Error).message}`)
    }
  }

  const selected = selectedId ? PLAYER_BY_ID.get(selectedId) ?? null : null
  const selectedTier = selected ? tierOf.get(selected.id) ?? null : null

  const deviations = useMemo(
    () =>
      ranked
        .map((r) => ({ ...r, delta: r.player.rank - r.rank }))
        .filter((r) => Math.abs(r.delta) >= 5)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 8),
    [ranked],
  )

  const posTally = useMemo(() => {
    const top = ranked.slice(0, 50)
    return POSITIONS.map((p) => ({ pos: p, n: top.filter((r) => r.player.pos === p).length }))
  }, [ranked])

  return (
    <div className="board-layout">
      <div className="board-main">
        <div className="toolbar">
          <div className="segmented">
            <button className={boardMode === 'overall' ? 'on' : ''} onClick={() => setBoardMode('overall')}>
              Overall
            </button>
            <button className={boardMode === 'positional' ? 'on' : ''} onClick={() => setBoardMode('positional')}>
              Positional
            </button>
          </div>

          <input
            className="search"
            placeholder="Search players…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="pos-tabs">
            {(['ALL', ...POSITIONS] as (Pos | 'ALL')[]).map((p) => (
              <button
                key={p}
                className={posFilter === p ? 'on' : ''}
                style={p === 'ALL' ? undefined : { ['--pos-color' as string]: POS_COLOR[p as Pos] }}
                onClick={() => setPosFilter(p)}
                disabled={boardMode === 'positional' && p !== 'ALL'}
              >
                {p}
              </button>
            ))}
          </div>

          <label className="check">
            <input
              type="checkbox"
              checked={hideDrafted}
              onChange={(e) => setHideDrafted(e.target.checked)}
            />
            Hide drafted
          </label>

          {boardMode === 'overall' && (
            <div className="segmented size-picker" title="Row density">
              {(['sm', 'md', 'lg'] as const).map((s) => (
                <button key={s} className={cardSize === s ? 'on' : ''} onClick={() => setCardSize(s)}>
                  {s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="toolbar toolbar-sub">
          <button className="btn" onClick={() => addTier(visible[0]?.id)}>+ Tier at top</button>
          <div className="auto-tier">
            <button className="btn" onClick={() => autoTier(sensitivity)}>Auto-tier</button>
            <input
              type="range"
              min={1}
              max={10}
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              aria-label="Auto-tier sensitivity"
              title="Higher = more, smaller tiers"
            />
            <span className="dim">{sensitivity <= 3 ? 'broad' : sensitivity >= 8 ? 'fine' : 'balanced'} tiers</span>
          </div>
          <button className="btn" onClick={clearTiers}>Clear tiers</button>
          <span className="spacer" />
          <button className="btn" onClick={exportBoard}>Export</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
          <button
            className="btn danger"
            onClick={() => confirm('Reset board to consensus ADP? Tiers and custom order are lost.') && resetBoard()}
          >
            Reset to ADP
          </button>
        </div>

        {boardMode === 'positional' ? (
          <PositionalBoard
            ranked={ranked}
            tierColors={tierColors}
            tierNames={tierNames}
            draftedIds={draftedIds}
            hideDrafted={hideDrafted}
            selectedId={selectedId}
            onSelect={select}
            onReorder={reorder}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <div className={`list-wrap size-${cardSize}`}>
              <BoardHeader />
              <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="list">
                {visible.map((item) =>
                  item.kind === 'tier' ? (
                    <TierRow
                      key={item.id}
                      id={item.id}
                      name={item.name}
                      color={item.color}
                      count={tierCounts.get(item.id) ?? 0}
                      colors={TIER_COLORS}
                      onRename={(name) => updateTier(item.id, { name })}
                      onRecolor={(color) => updateTier(item.id, { color })}
                      onRemove={() => removeTier(item.id)}
                    />
                  ) : (
                    (() => {
                      const p = PLAYER_BY_ID.get(item.id)
                      if (!p) return null
                      const tierId = tierOf.get(p.id)
                      return (
                        <PlayerRow
                          key={p.id}
                          player={p}
                          rank={rankById.get(p.id) ?? 0}
                          posRank={posRank.get(p.id) ?? 0}
                          tierColor={tierId ? tierColors.get(tierId) ?? null : null}
                          drafted={draftedIds.has(p.id)}
                          draftedBy={draftedBy.get(p.id) ?? null}
                          selected={selectedId === p.id}
                          onSelect={() => select(p.id)}
                          onBump={(d) => movePlayerBy(p.id, d)}
                          onDraft={picks.length ? () => draftPlayer(p.id) : undefined}
                          avatarSize={cardSize === 'sm' ? 32 : cardSize === 'lg' ? 60 : 44}
                        />
                      )
                    })()
                  ),
                )}
                  {!visible.length && <p className="empty">No players match that filter.</p>}
                </div>
              </SortableContext>
            </div>
          </DndContext>
        )}
      </div>

      <PlayerDetail
        player={selected}
        rank={selected ? rankById.get(selected.id) ?? null : null}
        posRank={selected ? posRank.get(selected.id) ?? null : null}
        tierName={selectedTier ? tierNames.get(selectedTier) ?? null : null}
        tierColor={selectedTier ? tierColors.get(selectedTier) ?? null : null}
        drafted={selected ? draftedIds.has(selected.id) : false}
        draftedBy={selected ? draftedBy.get(selected.id) ?? null : null}
        boardSize={ranked.length}
        onMoveToRank={(r) => selected && movePlayerToRank(selected.id, r)}
        onDraft={selected && picks.length ? () => draftPlayer(selected.id) : undefined}
        fallback={
          <>
            <h3>Your board at a glance</h3>
            <div className="tally">
              {posTally.map(({ pos, n }) => (
                <div key={pos} className="tally-row" style={{ ['--pos-color' as string]: POS_COLOR[pos] }}>
                  <span className="tally-pos">{pos}</span>
                  <div className="tally-bar"><span style={{ width: `${(n / 50) * 100}%` }} /></div>
                  <span className="tally-n">{n}</span>
                </div>
              ))}
            </div>
            <p className="dim small">Positions inside your top 50.</p>

            <h3>Biggest swings vs ADP</h3>
            {deviations.length ? (
              <ul className="dev-list">
                {deviations.map((d) => (
                  <li key={d.player.id} onClick={() => select(d.player.id)}>
                    <span className="dev-rank">#{d.rank}</span>
                    <span className="dev-name">{d.player.name}</span>
                    <span className={`delta-pill ${d.delta > 0 ? 'up' : 'down'}`}>
                      {d.delta > 0 ? '+' : ''}{d.delta}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dim small">
                Drag players to move them off consensus — the biggest gaps show up here.
              </p>
            )}
          </>
        }
      />
    </div>
  )
}
