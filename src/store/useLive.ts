import { create } from 'zustand'
import bundledVegas from '../data/vegas.json'
import type { Player, VegasData } from '../types'

/**
 * The data that can be fresher than the bundle: Vegas lines and Sleeper ADP.
 * It starts as whatever was baked in at build time, upgrades to a cached
 * refresh if the browser holds a newer one, and replaces itself when the
 * refresh button hits /api/live. Everything derived from it — the Vegas board,
 * the Godfather board, the player card — recomputes through the store.
 */
interface LiveState {
  vegas: VegasData
  /** playerId -> today's Sleeper PPR ADP, for players the refresh could see. */
  adp: Record<string, number>
  /** When the Vegas lines in `vegas` were pulled. */
  fetchedAt: string
  status: 'idle' | 'loading' | 'error'
  error: string | null
  refresh: () => Promise<void>
}

const BUNDLED = bundledVegas as unknown as VegasData
const CACHE_KEY = 'nfl-big-board-live-v1'

interface Cache {
  v: 1
  vegas: VegasData
  adp: Record<string, number>
  fetchedAt: string
}

/** A cached refresh only counts if it's newer than what shipped in the bundle. */
function loadCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cache
    if (c.v !== 1 || !c.vegas?.players || !c.fetchedAt) return null
    if (Date.parse(c.fetchedAt) <= Date.parse(BUNDLED.generatedAt)) return null
    return c
  } catch {
    return null
  }
}

const cached = loadCache()

export const useLive = create<LiveState>()((set) => ({
  vegas: cached?.vegas ?? BUNDLED,
  adp: cached?.adp ?? {},
  fetchedAt: cached?.fetchedAt ?? BUNDLED.generatedAt,
  status: 'idle',
  error: null,

  refresh: async () => {
    set({ status: 'loading', error: null })
    try {
      const res = await fetch('/api/live')
      const data = await res.json()
      if (!res.ok || data.error || !data.vegas?.players) {
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const next: Cache = { v: 1, vegas: data.vegas, adp: data.adp ?? {}, fetchedAt: data.fetchedAt }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      } catch {
        // A full quota just means the refresh won't survive a reload.
      }
      set({ vegas: next.vegas, adp: next.adp, fetchedAt: next.fetchedAt, status: 'idle' })
    } catch (err) {
      set({ status: 'error', error: String((err as Error)?.message ?? err) })
    }
  },
}))

/** The ADP everything downstream should use: today's if the refresh saw him, else the bundle's. */
export const liveAdp = (adp: Record<string, number>, p: Player) => adp[p.id] ?? p.adp
