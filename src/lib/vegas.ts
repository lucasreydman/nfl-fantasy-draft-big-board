import raw from '../data/vegas.json'
import type { VegasData, VegasMarket, VegasPlayer } from '../types'

export const VEGAS = raw as unknown as VegasData

export const vegasFor = (playerId: string): VegasPlayer | null => VEGAS.players[playerId] ?? null

/** How many players the books actually posted lines for. */
export const VEGAS_POOL = Object.keys(VEGAS.players).length

/** The number to show for a market: the posted line, or the estimate that stands in for one. */
export const mktValue = (m: VegasMarket | undefined): number | null =>
  m == null ? null : m.line ?? m.est ?? null

export const isEst = (m: VegasMarket | undefined): boolean => m != null && m.est != null

/**
 * Blend of the two ranks. `w` is the weight on Vegas, 0..1 — 0 is your board
 * untouched, 1 is the books' board untouched.
 */
export const blendRankScore = (myRank: number, vegasRank: number, w: number) =>
  w * vegasRank + (1 - w) * myRank
