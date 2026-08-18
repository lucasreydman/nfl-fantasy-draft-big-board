export type Pos = 'QB' | 'RB' | 'WR' | 'TE'

/** What the position tabs can be set to. FLEX is every position a flex spot accepts. */
export type PosFilter = Pos | 'ALL' | 'FLEX'

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
  /** Rank and percentile for points per game, among qualified players at the position. */
  ppgRank?: number
  ppgPctile?: number
  /** Touchdowns the player's opportunity implies, and how far actual production ran from it. */
  xTd?: number
  tdLuck?: number
  /** Points per game with touchdown production pulled back to expectation. */
  luckPpg?: number
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

/** A game left out of the adjusted line, and why. */
export interface DroppedGame {
  w: number
  /** 'partial' — he left early; 'qb' — his team's usual passer missed most of it. */
  r: 'partial' | 'qb'
  /** His share of the team's offensive snaps that week, in percent. */
  snap: number | null
}

export interface AdjustedLine extends StatLine {
  dropped: DroppedGame[]
  droppedPartial: number
  droppedQb: number
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
  /** Consensus ADP the board is ordered by — Sleeper redraft where available. */
  adp: number
  adpSource: 'sleeper' | 'ffc'
  /** FantasyFootballCalculator's PPR ADP, kept as a second opinion on the same player. */
  adpFfc: number | null
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
  /** Inches and pounds. */
  height: number | null
  weight: number | null
  depthOrder: number | null
  injury: string | null
  /** Prior season's actual production. Null for rookies. */
  last: StatLine | null
  /** Last season over the games that weren't distorted. Null when nothing needed dropping. */
  adj: AdjustedLine | null
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
  ppg: Benchmark
  snapPct: Benchmark
  rushShare: Benchmark
  tgtShare: Benchmark
  rzOpp: Benchmark
}

export type StatMode = 'raw' | 'adj'

/** Fitted touchdowns per opportunity, inside the red zone and outside it. */
export interface TdRates {
  rz: number
  other: number
}

export interface PlayerData {
  season: number
  generatedAt: string
  source: { adp: string; meta: Record<string, unknown>; players: string; stats: string }
  usage: {
    season: number
    qualifier: string
    /** How the adjusted line decides which games to leave out. */
    adjRule: string
    xTd: { rush: TdRates; qbRush: TdRates; rec: TdRates }
    byMode: Record<StatMode, Record<Pos, PosBenchmarks>>
  }
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
