import type { Player, Pos } from '../types'

/** Snake order: which team slot (1-indexed) is on the clock for an overall pick. */
export function slotForPick(overall: number, teams: number) {
  const round = Math.floor((overall - 1) / teams) + 1
  const inRound = ((overall - 1) % teams) + 1
  return round % 2 === 1 ? inRound : teams - inRound + 1
}

export function roundForPick(overall: number, teams: number) {
  return Math.floor((overall - 1) / teams) + 1
}

/** Every overall pick number belonging to a slot, in order. */
export function picksForSlot(slot: number, teams: number, rounds: number) {
  const out: number[] = []
  for (let r = 1; r <= rounds; r++) {
    const inRound = r % 2 === 1 ? slot : teams - slot + 1
    out.push((r - 1) * teams + inRound)
  }
  return out
}

export const ROSTER_SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'] as const
export const FLEX_POS: Pos[] = ['RB', 'WR', 'TE']

const MAX_BY_POS: Record<Pos, number> = { QB: 3, RB: 7, WR: 8, TE: 3, K: 1, DEF: 2 }
const STARTERS: Record<Pos, number> = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }

interface CpuArgs {
  available: Player[]
  roster: Player[]
  round: number
  rounds: number
  rand: () => number
}

/**
 * CPU pick: value-based off ADP with roster-need nudges, a little noise so no
 * two mocks are identical, and the usual "nobody drafts a kicker early" rules.
 */
export function cpuPick({ available, roster, round, rounds, rand }: CpuArgs): Player | undefined {
  const counts = roster.reduce<Record<string, number>>((acc, p) => {
    acc[p.pos] = (acc[p.pos] ?? 0) + 1
    return acc
  }, {})
  const lateRounds = round > rounds - 2

  const scored = available.slice(0, 40).map((p, i) => {
    const have = counts[p.pos] ?? 0
    let score = i + rand() * 6 - 3 // ADP order + noise

    if (have >= MAX_BY_POS[p.pos]) score += 500
    if ((p.pos === 'K' || p.pos === 'DEF') && !lateRounds) score += 400
    if (have < STARTERS[p.pos]) score -= 6 // fill starters first
    if (p.pos === 'QB' && have >= 1) score += 25
    if (p.pos === 'TE' && have >= 1) score += 18
    if (round <= 2 && (p.pos === 'K' || p.pos === 'DEF')) score += 1000

    return { p, score }
  })

  scored.sort((a, b) => a.score - b.score)
  return scored[0]?.p ?? available[0]
}

/** Assigns a drafted roster into starter slots, spilling the rest to the bench. */
export function fillLineup(roster: Player[]) {
  const pool = [...roster]
  const take = (pred: (p: Player) => boolean) => {
    const i = pool.findIndex(pred)
    return i === -1 ? null : pool.splice(i, 1)[0]
  }
  const lineup = ROSTER_SLOTS.map((slot) => ({
    slot,
    player:
      slot === 'FLEX'
        ? take((p) => FLEX_POS.includes(p.pos))
        : take((p) => p.pos === slot),
  }))
  return { lineup, bench: pool }
}
