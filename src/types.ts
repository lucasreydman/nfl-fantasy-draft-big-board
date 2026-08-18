export type Pos = 'QB' | 'RB' | 'WR' | 'TE'

/**
 * A season of Sleeper stats. Every counting field is optional: the fetch script strips
 * anything a player did not record, and projections carry a thinner set than actuals.
 */
export interface StatLine {
  season: number
  /** Where the player finished (or is projected to finish) at his position, league-wide. */
  posRank?: number
  ovrRank?: number
  gp?: number
  gs?: number
  ptsPpr?: number
  ptsHalf?: number
  ptsStd?: number
  ppg?: number
  snapPct?: number
  /** Rank and percentile for each share, among qualified players at the same position. */
  snapRank?: number
  snapPctile?: number
  rushRank?: number
  rushPctile?: number
  tgtRank?: number
  tgtPctile?: number
  /** Red-zone carries plus red-zone targets. */
  rzOpp?: number
  rzRank?: number
  rzPctile?: number
  scrimYd?: number
  tds?: number
  fd?: number
  fum?: number
  tgt?: number
  tgtShare?: number
  rec?: number
  recYd?: number
  recTd?: number
  ypr?: number
  ypt?: number
  catchPct?: number
  airYd?: number
  rzTgt?: number
  drops?: number
  rushAtt?: number
  rushShare?: number
  rushYd?: number
  rushTd?: number
  ypc?: number
  rzCarry?: number
  brokenTkl?: number
  passAtt?: number
  passCmp?: number
  passYd?: number
  passTd?: number
  passInt?: number
  cmpPct?: number
  passYpa?: number
  passRtg?: number
  sacks?: number
}

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
  /** Prior season's actual production. Null for rookies. */
  last: StatLine | null
  /** This season's Sleeper projection. */
  proj: StatLine | null
  /** Position in the consensus ADP order. */
  rank: number
}

/** Position-wide reference points for a usage metric: median, top decile, and the leader. */
export interface Benchmark {
  med: number
  hi: number
  max: number
}

export interface PosBenchmarks {
  /** How many players cleared the qualifier and sit in the comparison pool. */
  n: number
  snapPct: Benchmark
  rushShare: Benchmark
  tgtShare: Benchmark
  rzOpp: Benchmark
}

export interface PlayerData {
  season: number
  generatedAt: string
  source: { adp: string; meta: Record<string, unknown>; players: string; stats: string }
  usage: { season: number; qualifier: string; byPos: Record<Pos, PosBenchmarks> }
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
