/**
 * The live-data core, shared by three callers: scripts/fetch-vegas.mjs (bakes
 * vegas.json into the bundle), api/live.mjs (the deployed refresh endpoint),
 * and the vite dev middleware (so refresh works on localhost too).
 *
 * It fetches season-long player props from BettingPros and fresh ADP from
 * Sleeper, converts the lines to fantasy points under this league's scoring,
 * and ranks by value over a 10-team replacement level.
 */
import { readFileSync } from 'node:fs'

// The public key the FantasyPros/BettingPros web apps ship in their own bundles.
const API_KEY = 'CHi8Hy5CEE4khd46XNYL23dCFX96oUdw6qOt1Dnh'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** BettingPros market ids for the season-long totals that score fantasy points. */
export const MARKETS = {
  passYd: 300, rushYd: 301, recYd: 302, passInt: 303,
  passTd: 304, rushTd: 305, recTd: 306, rec: 330,
}

/** Books whose lines count toward the market mean. */
export const REAL_BOOKS = {
  12: 'DraftKings', 10: 'FanDuel', 19: 'BetMGM', 13: 'Caesars', 24: 'bet365',
  18: 'BetRivers', 49: 'Hard Rock', 33: 'theScore Bet', 14: 'Fanatics',
  15: 'SugarHouse', 27: 'PartyCasino', 32: 'Borgata', 26: 'Tipico',
}

/**
 * Second tier, used only when no sportsbook quotes the market: licensed pick'em
 * apps. Their lines are real current markets — they pull injured players like a
 * book does — just softer ones. Prediction markets (Kalshi, Polymarket) are
 * never used: a threshold contract at +1900 is a longshot bet, not a median,
 * and BettingPros' own "consensus" will happily echo one — which is why the
 * consensus row isn't trusted at all.
 */
export const PICKEM_BOOKS = {
  37: 'PrizePicks', 36: 'Underdog', 55: 'Underdog Sportsbook', 63: 'Sleeper',
  53: 'Dabble', 45: 'Betr', 39: 'Fliff',
}

/** A line nobody has touched in this long is frozen data, not a market. */
const MAX_AGE_DAYS = 10

/**
 * How spread out a season outcome is around its line, as a fraction of the line.
 * Only used to turn over/under juice into a shift of the mean — a market at
 * -130/over is telling you the true number sits above the posted line.
 */
const CV = {
  passYd: 0.15, rushYd: 0.28, recYd: 0.28, rec: 0.25,
  passTd: 0.22, rushTd: 0.5, recTd: 0.5, passInt: 0.45,
}

/** League scoring: Sleeper defaults, full PPR, -2 per interception. */
const PTS = { passYd: 0.04, passTd: 4, passInt: -2, rushYd: 0.1, rushTd: 6, rec: 1, recYd: 0.1, recTd: 6 }

const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g
const norm = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[.'`-]/g, ' ').replace(SUFFIX, ' ').replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ').trim()
const key = (s) => norm(s).replace(/ /g, '')

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** American odds -> implied probability, vig included. */
const implied = (cost) => (cost < 0 ? -cost / (-cost + 100) : 100 / (cost + 100))

/**
 * A book's posted line is its median; the juice says which side of it the mean
 * sits. De-vig the two costs, read the over probability, and shift by the
 * matching z under a normal spread. Linear z is fine for the 30–70% band juice
 * ever reaches.
 */
function bookMean(line, overCost, underCost, cv) {
  if (overCost == null || underCost == null) return line
  const pOver = implied(overCost) / (implied(overCost) + implied(underCost))
  const p = Math.max(0.3, Math.min(0.7, pOver))
  const z = (p - 0.5) * 2.5066
  return line + z * cv * Math.max(line, 3)
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'x-api-key': API_KEY, 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const offersUrl = (id, season, page) =>
  `https://api.bettingpros.com/v3/offers?sport=NFL&market_id=${id}&season=${season}&limit=10&page=${page}`

async function fetchMarket(id, season) {
  const first = await fetchJson(offersUrl(id, season, 1))
  const totalPages = first._pagination?.total_pages ?? 1
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchJson(offersUrl(id, season, i + 2))),
  )
  return [first, ...rest].flatMap((d) => d.offers ?? [])
}

const fresh = (l, now) => now - Date.parse(`${l.updated?.replace(' ', 'T')}Z`) < MAX_AGE_DAYS * 86400e3

/** A book's current line: on the board, marked main, and touched recently. */
const mainLine = (selection, bookId, now) =>
  selection?.books?.find((b) => b.id === bookId)?.lines
    ?.find((l) => l.main && l.active && !l.is_off && fresh(l, now)) ?? null

/** Two-way juice lives around even money; a price far outside it isn't an O/U. */
const saneCost = (cost) => cost == null || (cost >= -250 && cost <= 250)

function collect(over, under, bookIds, cv, now, tally) {
  const lines = []
  const means = []
  for (const [id, name] of Object.entries(bookIds)) {
    const o = mainLine(over, Number(id), now)
    if (!o || !saneCost(o.cost)) continue
    const u = mainLine(under, Number(id), now)
    // Only pair the costs when both sides quote the same number.
    const underCost = u && u.line === o.line ? u.cost : null
    lines.push(o.line)
    means.push(bookMean(o.line, o.cost, underCost, cv))
    if (tally) tally[name] = (tally[name] ?? 0) + 1
  }
  return { lines, means }
}

/** One offer -> {line, mean, n, lo, hi, open} across the books still quoting it. */
function summarize(offer, cv, now, bookTally) {
  const over = offer.selections?.find((s) => s.selection === 'over')
  const under = offer.selections?.find((s) => s.selection === 'under')
  if (!over) return null

  let { lines, means } = collect(over, under, REAL_BOOKS, cv, now, bookTally)
  let pickem = false

  // Every sportsbook has taken it off the board. A pick'em app still quoting it
  // is a live market worth keeping; nothing quoting it means the number is gone
  // — an injured player's stale line must read as no line, not as the old one.
  if (!lines.length) {
    ;({ lines, means } = collect(over, under, PICKEM_BOOKS, cv, now, null))
    if (!lines.length) return null
    pickem = true
  }

  return {
    line: median(lines),
    mean: median(means),
    n: pickem ? 0 : lines.length,
    ...(pickem ? { pk: true } : {}),
    lo: Math.min(...lines),
    hi: Math.max(...lines),
    open: over.opening_line?.line ?? null,
  }
}

/** All eight markets, raw: {mkt: [{name, pos, team, sum}]} plus the book tally. */
export async function fetchVegasOffers(season, log = () => {}) {
  const bookTally = {}
  const now = Date.now()
  const raw = {}
  const entries = await Promise.all(
    Object.entries(MARKETS).map(async ([mkt, id]) => [mkt, await fetchMarket(id, season)]),
  )
  for (const [mkt, offers] of entries) {
    raw[mkt] = []
    for (const o of offers) {
      const part = o.participants?.[0]
      const player = part?.player
      if (!player || !o.active) continue
      const sum = summarize(o, CV[mkt], now, bookTally)
      if (!sum) continue
      raw[mkt].push({ name: part.name, pos: player.position, team: player.team, sum })
    }
    log(`  ${mkt.padEnd(8)} ${String(raw[mkt].length).padStart(3)} players`)
  }
  return { raw, bookTally }
}

/** Which stats each position needs a value for before it can be scored. */
const NEEDS = {
  QB: ['passYd', 'passTd', 'passInt', 'rushYd', 'rushTd'],
  RB: ['rushYd', 'rushTd', 'rec', 'recYd', 'recTd'],
  WR: ['rec', 'recYd', 'recTd', 'rushYd', 'rushTd'],
  TE: ['rec', 'recYd', 'recTd', 'rushYd', 'rushTd'],
}

/** The market a player must actually have a line in to be ranked at all. */
const REQUIRED = { QB: ['passYd'], RB: ['rushYd', 'recYd'], WR: ['recYd', 'rec'], TE: ['recYd', 'rec'] }

/**
 * Raw points can't order a draft board in a one-QB league — every starting
 * quarterback outscores every receiver, and none of them are worth the pick.
 * The overall rank is value over the replacement a 10-team, 10-starter league
 * actually leaves on waivers: roughly the QB12, RB28, WR32 and TE12.
 */
const REPLACEMENT = { QB: 12, RB: 28, WR: 32, TE: 12 }

const projField = { passYd: 'passYd', passTd: 'passTd', passInt: 'passInt', rushYd: 'rushYd', rushTd: 'rushTd', rec: 'rec', recYd: 'recYd', recTd: 'recTd' }

const r1 = (n) => Math.round(n * 10) / 10

/**
 * Match the offers to the board, fill the markets Vegas didn't post, score and
 * rank. `adpOf(player)` supplies the ADP the pool ranks against — the baked
 * file uses the bundled ADP, the live endpoint passes today's.
 */
export function buildVegasPayload(board, raw, bookTally, adpOf = (p) => p.adp) {
  const byNamePos = new Map()
  const byName = new Map()
  for (const p of board.players) {
    byNamePos.set(`${key(p.name)}|${p.pos}`, p)
    if (!byName.has(key(p.name))) byName.set(key(p.name), p)
  }

  const matched = new Map()
  const unmatched = new Set()
  for (const [mkt, rows] of Object.entries(raw)) {
    for (const row of rows) {
      const p = byNamePos.get(`${key(row.name)}|${row.pos}`) ?? byName.get(key(row.name))
      if (!p) {
        unmatched.add(`${row.name} (${row.pos} ${row.team})`)
        continue
      }
      const entry = matched.get(p.id) ?? { player: p, mkts: {} }
      entry.mkts[mkt] = row.sum
      matched.set(p.id, entry)
    }
  }

  /**
   * Position-level rates fitted from the players who have BOTH markets, so a
   * missing line is estimated from the market itself: a RB's receptions from
   * his receiving-yards line at the position's yards-per-catch, touchdowns
   * from yardage at the position's TD-per-yard rate.
   */
  const fitRatio = (numMkt, denMkt) => {
    const byPos = {}
    for (const { player, mkts } of matched.values()) {
      const a = mkts[numMkt]?.mean
      const b = mkts[denMkt]?.mean
      if (a > 0 && b > 0) (byPos[player.pos] ??= []).push(a / b)
    }
    return Object.fromEntries(Object.entries(byPos).map(([pos, xs]) => [pos, median(xs)]))
  }

  const yprInv = fitRatio('rec', 'recYd') // catches per receiving yard
  const recTdRate = fitRatio('recTd', 'recYd')
  const rushTdRate = fitRatio('rushTd', 'rushYd')
  const passTdRate = fitRatio('passTd', 'passYd')

  /** How the market runs relative to Sleeper's projections, per position and market. */
  const projRatio = {}
  for (const mkt of Object.keys(MARKETS)) {
    const byPos = {}
    for (const { player, mkts } of matched.values()) {
      const v = mkts[mkt]?.mean
      const pj = player.proj?.[projField[mkt]]
      if (v > 0 && pj > 0) (byPos[player.pos] ??= []).push(v / pj)
    }
    projRatio[mkt] = Object.fromEntries(Object.entries(byPos).map(([pos, xs]) => [pos, median(xs)]))
  }

  /** Sleeper's projection scaled to how the market prices that stat at the position. */
  const projScaled = (player, mkt) => {
    const pj = player.proj?.[projField[mkt]]
    if (!(pj > 0)) return null
    return pj * (projRatio[mkt]?.[player.pos] ?? 1)
  }

  function estimate(player, mkt, vals) {
    const pos = player.pos
    switch (mkt) {
      case 'rec': {
        if (vals.recYd != null && yprInv[pos]) return vals.recYd * yprInv[pos]
        return projScaled(player, mkt)
      }
      case 'recYd': {
        if (vals.rec != null && yprInv[pos]) return vals.rec / yprInv[pos]
        return projScaled(player, mkt)
      }
      case 'recTd': {
        const v = projScaled(player, mkt)
        if (v != null) return v
        if (vals.recYd != null && recTdRate[pos]) return vals.recYd * recTdRate[pos]
        return null
      }
      case 'rushTd': {
        const v = projScaled(player, mkt)
        if (v != null) return v
        if (vals.rushYd != null && rushTdRate[pos]) return vals.rushYd * rushTdRate[pos]
        return null
      }
      case 'passTd': {
        if (vals.passYd != null && passTdRate[pos]) return vals.passYd * passTdRate[pos]
        return projScaled(player, mkt)
      }
      case 'passInt': {
        // No book posted season INT lines — scale the player's own projected
        // rate to the passing volume Vegas gives him, so a gunslinger stays one.
        const pj = player.proj
        if (pj?.passInt > 0 && pj?.passYd > 0 && vals.passYd != null)
          return pj.passInt * Math.max(0.6, Math.min(1.4, vals.passYd / pj.passYd))
        if (vals.passYd != null) return vals.passYd * 0.00275
        return null
      }
      default:
        return projScaled(player, mkt)
    }
  }

  const out = {}
  const included = []

  for (const { player, mkts } of matched.values()) {
    if (!REQUIRED[player.pos]?.some((m) => mkts[m])) continue

    const vals = {}
    const entry = { mkts: {} }
    for (const mkt of Object.keys(mkts)) {
      const s = mkts[mkt]
      vals[mkt] = s.mean
      entry.mkts[mkt] = {
        line: s.line,
        mean: r1(s.mean),
        n: s.n,
        ...(s.pk ? { pk: true } : {}),
        ...(s.lo !== s.hi ? { lo: s.lo, hi: s.hi } : {}),
        ...(s.open != null && s.open !== s.line ? { open: s.open } : {}),
      }
    }

    let fpts = 0
    let estPts = 0
    for (const mkt of NEEDS[player.pos]) {
      let v = vals[mkt]
      let est = false
      if (v == null) {
        // A receiver with no rushing line genuinely has ~no rushing value; only
        // estimate the ground game when the projection says it exists.
        if ((mkt === 'rushYd' || mkt === 'rushTd') && player.pos !== 'QB' && player.pos !== 'RB') {
          const pj = player.proj?.rushYd ?? 0
          if (pj < 40) continue
        }
        v = estimate(player, mkt, vals)
        est = true
        if (v == null) continue
        vals[mkt] = v
        entry.mkts[mkt] = { est: r1(v) }
      }
      const pts = v * PTS[mkt]
      fpts += pts
      if (est) estPts += Math.abs(pts)
    }

    entry.fpts = r1(fpts)
    entry.ppg = r1(fpts / 17)
    entry.estPts = r1(estPts)
    included.push({ player, entry })
    out[player.id] = entry
  }

  included.sort((a, b) => b.entry.fpts - a.entry.fpts)

  const posCount = {}
  for (const { player, entry } of included) {
    posCount[player.pos] = (posCount[player.pos] ?? 0) + 1
    entry.posRank = posCount[player.pos]
  }

  const replPts = {}
  for (const [pos, n] of Object.entries(REPLACEMENT)) {
    const atPos = included.filter(({ player }) => player.pos === pos)
    const around = atPos.slice(Math.max(0, n - 1), n + 2).map(({ entry }) => entry.fpts)
    replPts[pos] = around.length ? r1(around.reduce((a, b) => a + b, 0) / around.length) : 0
  }

  for (const { player, entry } of included) entry.val = r1(entry.fpts - replPts[player.pos])
  included.sort((a, b) => b.entry.val - a.entry.val)
  included.forEach(({ entry }, i) => { entry.rank = i + 1 })

  // ADP rank *within the covered pool*, so the two ranks compare like for like.
  const byAdp = [...included].sort((a, b) => adpOf(a.player) - adpOf(b.player))
  byAdp.forEach(({ entry }, i) => { entry.adpRank = i + 1 })
  const posAdp = {}
  for (const { player, entry } of byAdp) {
    posAdp[player.pos] = (posAdp[player.pos] ?? 0) + 1
    entry.adpPosRank = posAdp[player.pos]
  }

  const payload = {
    season: board.season,
    generatedAt: new Date().toISOString(),
    source: 'bettingpros.com season-long player props — median line across sportsbooks, shaded by the over/under juice',
    books: bookTally,
    scoring: 'full PPR · 4pt pass TD · -2 INT',
    replacement: { slots: REPLACEMENT, pts: replPts },
    players: out,
  }

  return { payload, included, unmatched, posCount, replPts }
}

const STAT_POS = ['QB', 'RB', 'WR', 'TE']
const liveNum = (v) => (typeof v === 'number' && v > 0 && v < 400 ? v : null)

/** Today's Sleeper redraft ADP, keyed by Sleeper player id. */
export async function fetchSleeperAdp(season) {
  const rows = await Promise.all(
    STAT_POS.map((p) =>
      fetchJson(`https://api.sleeper.app/projections/nfl/${season}?season_type=regular&position[]=${p}&order_by=adp_ppr`),
    ),
  )
  const out = {}
  for (const r of rows.flat()) {
    const st = r.stats
    if (!st) continue
    const ppr = liveNum(st.adp_ppr)
    if (ppr == null) continue
    out[r.player_id] = { ppr, half: liveNum(st.adp_half_ppr), std: liveNum(st.adp_std) }
  }
  return out
}

export function loadBoard() {
  return JSON.parse(readFileSync(new URL('../src/data/players.json', import.meta.url), 'utf8'))
}

/**
 * Everything the refresh button needs in one call: today's ADP for every board
 * player, and the Vegas payload ranked against that same fresh ADP.
 */
export async function buildLiveData() {
  const board = loadBoard()
  const [{ raw, bookTally }, sleeperAdp] = await Promise.all([
    fetchVegasOffers(board.season),
    fetchSleeperAdp(board.season),
  ])

  const adp = {}
  for (const p of board.players) {
    const row = p.sleeperId ? sleeperAdp[p.sleeperId] : null
    if (row) adp[p.id] = row.ppr
  }

  const adpOf = (p) => adp[p.id] ?? p.adp
  const { payload } = buildVegasPayload(board, raw, bookTally, adpOf)

  return { vegas: payload, adp, fetchedAt: payload.generatedAt }
}
