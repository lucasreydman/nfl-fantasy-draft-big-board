export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF'

export interface Player {
  id: string
  sleeperId: string | null
  name: string
  firstName: string | null
  lastName: string | null
  pos: Pos
  team: string | null
  bye: number | null
  adp: number
  adpHalf: number | null
  adpStd: number | null
  stdev: number | null
  high: number | null
  low: number | null
  timesDrafted: number | null
  age: number | null
  exp: number | null
  number: number | null
  college: string | null
  depthOrder: number | null
  injury: string | null
  /** True when the player has no consensus ADP and we ordered them by Sleeper popularity. */
  estimated: boolean
  rank: number
}

export interface PlayerData {
  season: number
  generatedAt: string
  source: { adp: string; meta: Record<string, unknown>; players: string }
  players: Player[]
}

export type BoardItem =
  | { kind: 'player'; id: string }
  | { kind: 'tier'; id: string; name: string; color: string }

export interface Pick {
  overall: number
  round: number
  slot: number
  playerId: string
  auto: boolean
}
