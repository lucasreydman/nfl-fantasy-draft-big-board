import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import raw from '../data/players.json'
import type { BoardItem, Pick, Player, PlayerData, PosFilter, StatMode } from '../types'
import { TIER_COLORS } from '../lib/format'
import { cpuPick, roundForPick, slotForPick } from '../lib/draft'

export const DATA = raw as unknown as PlayerData
export const PLAYERS: Player[] = DATA.players
export const PLAYER_BY_ID = new Map(PLAYERS.map((p) => [p.id, p]))

const defaultItems = (): BoardItem[] =>
  [...PLAYERS].sort((a, b) => a.adp - b.adp).map((p) => ({ kind: 'player', id: p.id }) as BoardItem)

let tierSeq = 0
const newTierId = () => `tier-${Date.now().toString(36)}-${tierSeq++}`

export type View = 'board' | 'stats' | 'draft'
export type BoardMode = 'overall' | 'positional'
export type CardSize = 'sm' | 'md' | 'lg'
/** What the CPU teams value: the public market, or your own rankings. */
export type CpuSource = 'adp' | 'board'

interface State {
  view: View
  boardMode: BoardMode
  cardSize: CardSize
  showPickLines: boolean
  /** Whether player cards read last season raw or with distorted games dropped. */
  statMode: StatMode
  items: BoardItem[]
  selectedId: string | null
  posFilter: PosFilter
  query: string
  hideDrafted: boolean

  teams: number
  rounds: number
  mySlot: number
  picks: Pick[]
  autoPick: boolean
  speed: number
  cpuSource: CpuSource

  setView: (v: View) => void
  setBoardMode: (m: BoardMode) => void
  setCardSize: (s: CardSize) => void
  setShowPickLines: (v: boolean) => void
  setStatMode: (m: StatMode) => void
  setPosFilter: (p: PosFilter) => void
  setQuery: (q: string) => void
  setHideDrafted: (v: boolean) => void
  select: (id: string | null) => void

  reorder: (activeId: string, overId: string) => void
  movePlayerBy: (playerId: string, delta: number) => void
  movePlayerToRank: (playerId: string, rank: number) => void
  addTier: (afterId?: string) => void
  updateTier: (id: string, patch: { name?: string; color?: string }) => void
  removeTier: (id: string) => void
  autoTier: (sensitivity: number) => void
  clearTiers: () => void
  resetBoard: () => void
  importBoard: (items: BoardItem[]) => void

  setTeams: (n: number) => void
  setRounds: (n: number) => void
  setMySlot: (n: number) => void
  setAutoPick: (v: boolean) => void
  setCpuSource: (v: CpuSource) => void
  setSpeed: (n: number) => void
  draftPlayer: (playerId: string, auto?: boolean) => void
  runCpuPick: () => void
  undoPick: () => void
  resetDraft: () => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      view: 'board',
      boardMode: 'overall',
      cardSize: 'md',
      showPickLines: true,
      statMode: 'raw',
      items: defaultItems(),
      selectedId: null,
      posFilter: 'ALL',
      query: '',
      hideDrafted: true,

      teams: 10,
      rounds: 15,
      mySlot: 5,
      picks: [],
      autoPick: true,
      speed: 550,
      cpuSource: 'adp',

      setView: (view) => set({ view }),
      setBoardMode: (boardMode) => set({ boardMode }),
      setCardSize: (cardSize) => set({ cardSize }),
      setShowPickLines: (showPickLines) => set({ showPickLines }),
      setStatMode: (statMode) => set({ statMode }),
      setPosFilter: (posFilter) => set({ posFilter }),
      setQuery: (query) => set({ query }),
      setHideDrafted: (hideDrafted) => set({ hideDrafted }),
      select: (selectedId) => set({ selectedId }),

      reorder: (activeId, overId) =>
        set((s) => {
          if (activeId === overId) return s
          const items = [...s.items]
          const from = items.findIndex((i) => i.id === activeId)
          const to = items.findIndex((i) => i.id === overId)
          if (from === -1 || to === -1) return s
          const [moved] = items.splice(from, 1)
          items.splice(to, 0, moved)
          return { items }
        }),

      movePlayerBy: (playerId, delta) =>
        set((s) => {
          const items = [...s.items]
          const from = items.findIndex((i) => i.id === playerId)
          if (from === -1) return s
          const to = Math.max(0, Math.min(items.length - 1, from + delta))
          const [moved] = items.splice(from, 1)
          items.splice(to, 0, moved)
          return { items }
        }),

      movePlayerToRank: (playerId, rank) =>
        set((s) => {
          const items = [...s.items]
          const from = items.findIndex((i) => i.id === playerId)
          if (from === -1) return s
          const [moved] = items.splice(from, 1)
          // Walk to the index that leaves rank-1 players ahead of this one.
          let seen = 0
          let to = items.length
          for (let i = 0; i < items.length; i++) {
            if (seen >= rank - 1) {
              to = i
              break
            }
            if (items[i].kind === 'player') seen++
          }
          items.splice(to, 0, moved)
          return { items }
        }),

      addTier: (afterId) =>
        set((s) => {
          const items = [...s.items]
          const tierCount = items.filter((i) => i.kind === 'tier').length
          const at = afterId ? items.findIndex((i) => i.id === afterId) : -1
          const tier: BoardItem = {
            kind: 'tier',
            id: newTierId(),
            name: `Tier ${tierCount + 1}`,
            color: TIER_COLORS[tierCount % TIER_COLORS.length],
          }
          items.splice(at === -1 ? 0 : at, 0, tier)
          return { items }
        }),

      updateTier: (id, patch) =>
        set((s) => ({
          items: s.items.map((i) => (i.id === id && i.kind === 'tier' ? { ...i, ...patch } : i)),
        })),

      removeTier: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

      clearTiers: () => set((s) => ({ items: s.items.filter((i) => i.kind === 'player') })),

      /**
       * Cuts tiers where the ADP gap to the next player is unusually large for
       * that part of the board. Gaps are tiny at the top and wide in the late
       * rounds, so the threshold is a multiple of the local median gap rather
       * than a fixed number of picks. `sensitivity` is 1 (few tiers) to 10 (many).
       */
      autoTier: (sensitivity) =>
        set((s) => {
          const players = s.items.filter((i) => i.kind === 'player')
          const adps = players.map((i) => PLAYER_BY_ID.get(i.id)?.adp ?? 999)
          const gaps = adps.slice(1).map((a, i) => Math.max(0, a - adps[i]))
          const k = 4.0 - 0.3 * Math.min(10, Math.max(1, sensitivity))
          const WINDOW = 12

          const localMedian = (i: number) => {
            const slice = gaps
              .slice(Math.max(0, i - WINDOW), i + WINDOW)
              .slice()
              .sort((a, b) => a - b)
            return slice.length ? slice[Math.floor(slice.length / 2)] : 1
          }

          const out: BoardItem[] = []
          let tierNo = 0
          let sinceBreak = 0

          const cut = () => {
            tierNo++
            out.push({
              kind: 'tier',
              id: newTierId(),
              name: `Tier ${tierNo}`,
              color: TIER_COLORS[(tierNo - 1) % TIER_COLORS.length],
            })
            sinceBreak = 0
          }

          players.forEach((item, i) => {
            if (i === 0) cut()
            out.push(item)
            sinceBreak++
            const gap = gaps[i] // gap between this player and the next
            if (gap == null) return
            const threshold = Math.max(k * localMedian(i), 0.4)
            if ((gap >= threshold && sinceBreak >= 2) || sinceBreak >= 16) cut()
          })

          // A trailing cut can land after the last player; drop the empty tier.
          if (out.at(-1)?.kind === 'tier') out.pop()
          return { items: out }
        }),

      resetBoard: () => set({ items: defaultItems(), selectedId: null }),
      importBoard: (items) => set({ items }),

      setTeams: (teams) => set({ teams, picks: [], mySlot: Math.min(get().mySlot, teams) }),
      setRounds: (rounds) => set({ rounds, picks: [] }),
      setMySlot: (mySlot) => set({ mySlot }),
      setAutoPick: (autoPick) => set({ autoPick }),
      setCpuSource: (cpuSource) => set({ cpuSource }),
      setSpeed: (speed) => set({ speed }),

      draftPlayer: (playerId, auto = false) =>
        set((s) => {
          if (s.picks.length >= s.teams * s.rounds) return s
          if (s.picks.some((p) => p.playerId === playerId)) return s
          const overall = s.picks.length + 1
          return {
            picks: [
              ...s.picks,
              {
                overall,
                round: roundForPick(overall, s.teams),
                slot: slotForPick(overall, s.teams),
                playerId,
                auto,
              },
            ],
            selectedId: null,
          }
        }),

      runCpuPick: () => {
        const s = get()
        const overall = s.picks.length + 1
        if (overall > s.teams * s.rounds) return
        const slot = slotForPick(overall, s.teams)
        if (slot === s.mySlot) return

        const taken = new Set(s.picks.map((p) => p.playerId))

        // Worst case: the whole room shares your rankings, so every player you like is gone
        // by the time you would have taken him. Ordering by the board is the entire trick.
        const byBoard = new Map<string, number>()
        if (s.cpuSource === 'board') {
          let n = 0
          for (const item of s.items) if (item.kind === 'player') byBoard.set(item.id, ++n)
        }
        const order = (p: Player) =>
          s.cpuSource === 'board' ? byBoard.get(p.id) ?? Number.MAX_SAFE_INTEGER : p.adp
        const available = [...PLAYERS].filter((p) => !taken.has(p.id)).sort((a, b) => order(a) - order(b))
        const roster = s.picks
          .filter((p) => p.slot === slot)
          .map((p) => PLAYER_BY_ID.get(p.playerId))
          .filter((p): p is Player => Boolean(p))

        const choice = cpuPick({
          available,
          roster,
          round: roundForPick(overall, s.teams),
          rand: Math.random,
          // No jitter in worst-case mode — the point is that nobody misvalues your guys.
          noise: s.cpuSource === 'board' ? 0 : 6,
        })
        if (choice) get().draftPlayer(choice.id, true)
      },

      undoPick: () => set((s) => ({ picks: s.picks.slice(0, -1) })),
      resetDraft: () => set({ picks: [] }),
    }),
    {
      name: 'nfl-big-board-v1',
      version: 1,
      partialize: (s) => ({
        items: s.items,
        teams: s.teams,
        rounds: s.rounds,
        mySlot: s.mySlot,
        picks: s.picks,
        autoPick: s.autoPick,
        cpuSource: s.cpuSource,
        speed: s.speed,
        boardMode: s.boardMode,
        cardSize: s.cardSize,
        showPickLines: s.showPickLines,
        statMode: s.statMode,
        hideDrafted: s.hideDrafted,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        const known = new Set(PLAYERS.map((x) => x.id))

        // Reconcile a saved board against the current player pool: drop players
        // that vanished, append newcomers so a data refresh never loses work.
        let items = p.items
        if (items?.length) {
          const kept = items.filter((i) => i.kind === 'tier' || known.has(i.id))
          const present = new Set(kept.filter((i) => i.kind === 'player').map((i) => i.id))
          const missing = PLAYERS.filter((x) => !present.has(x.id)).sort((a, b) => a.adp - b.adp)
          items = [...kept, ...missing.map((x) => ({ kind: 'player', id: x.id }) as BoardItem)]
        } else {
          items = current.items
        }

        // A saved mock that references players no longer in the pool is stale.
        // Keeping it would leave ghost picks on the board and in rosters, so the
        // whole draft goes rather than half of it.
        const picks =
          p.picks?.length && p.picks.some((pick) => !known.has(pick.playerId)) ? [] : p.picks

        return { ...current, ...p, items, picks: picks ?? current.picks }
      },
    },
  ),
)

/** Ranked players (tier markers stripped) plus each player's positional rank. */
export function selectBoard(items: BoardItem[]) {
  const ranked: { player: Player; rank: number; tierId: string | null }[] = []
  const posCount: Record<string, number> = {}
  const posRank = new Map<string, number>()
  let tierId: string | null = null

  for (const item of items) {
    if (item.kind === 'tier') {
      tierId = item.id
      continue
    }
    const player = PLAYER_BY_ID.get(item.id)
    if (!player) continue
    posCount[player.pos] = (posCount[player.pos] ?? 0) + 1
    posRank.set(player.id, posCount[player.pos])
    ranked.push({ player, rank: ranked.length + 1, tierId })
  }
  return { ranked, posRank }
}
