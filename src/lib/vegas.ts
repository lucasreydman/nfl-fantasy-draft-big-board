import type { VegasMarket } from '../types'

/**
 * Helpers over the Vegas data. The data itself lives in the useLive store —
 * bundled at build time, replaceable by the in-app refresh — so components
 * read it from there rather than from a static import.
 */

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
