/**
 * Builds src/data/vegas.json from BettingPros' season-long player prop markets —
 * the over/under lines real sportsbooks (DraftKings, Caesars, BetMGM, BetRivers,
 * Hard Rock, bet365, …) hang on passing/rushing/receiving yards, touchdowns and
 * receptions. Each player's lines are de-vigged, shaded by the juice, scored under
 * this league's rules (full PPR, 4pt pass TD, -2 INT) and ranked, so the app can
 * show where Vegas and ADP disagree.
 *
 * Run AFTER fetch-players (it matches against src/data/players.json):
 *   npm run fetch:vegas
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The public key the FantasyPros/BettingPros web apps ship in their own bundles.
const API_KEY = 'CHi8Hy5CEE4khd46XNYL23dCFX96oUdw6qOt1Dnh'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** BettingPros market ids for the season-long totals that score fantasy points. */
const MARKETS = {
  passYd: 300, rushYd: 301, recYd: 302, passInt: 303,
  passTd: 304, rushTd: 305, recTd: 306, rec: 330,
}

/**
 * Books whose lines count toward the market mean. Pick'em apps (PrizePicks,
 * Underdog, Sleeper) and prediction markets (Kalshi, Polymarket) are excluded —
 * they copy or lag the books rather than making their own market.
 */
const REAL_BOOKS = {
  12: 'DraftKings', 10: 'FanDuel', 19: 'BetMGM', 13: 'Caesars', 24: 'bet365',
  18: 'BetRivers', 49: 'Hard Rock', 33: 'theScore Bet', 14: 'Fanatics',
  15: 'SugarHouse', 27: 'PartyCasino', 32: 'Borgata', 26: 'Tipico',
}

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

async function fetchMarket(id, season) {
  const offers = []
  let page = 1
  let totalPages = 1
  while (page <= totalPages) {
    const url = `https://api.bettingpros.com/v3/offers?sport=NFL&market_id=${id}&season=${season}&limit=10&page=${page}`
    const res = await fetch(url, { headers: { 'x-api-key': API_KEY, 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${res.status} ${url}`)
    const data = await res.json()
    totalPages = data._pagination?.total_pages ?? 1
    offers.push(...(data.offers ?? []))
    page++
  }
  return offers
}

const mainLine = (selection, bookId) =>
  selection?.books?.find((b) => b.id === bookId)?.lines?.find((l) => l.main && l.active && !l.is_off) ?? null

/** One offer -> {line, mean, n, lo, hi, open} across the real books. */
function summarize(offer, cv, bookTally) {
  const over = offer.selections?.find((s) => s.selection === 'over')
  const under = offer.selections?.find((s) => s.selection === 'under')
  if (!over) return null

  const lines = []
  const means = []
  for (const id of Object.keys(REAL_BOOKS).map(Number)) {
    const o = mainLine(over, id)
    if (!o) continue
    const u = mainLine(under, id)
    // Only pair the costs when both sides quote the same number.
    const underCost = u && u.line === o.line ? u.cost : null
    lines.push(o.line)
    means.push(bookMean(o.line, o.cost, underCost, cv))
    bookTally[REAL_BOOKS[id]] = (bookTally[REAL_BOOKS[id]] ?? 0) + 1
  }

  // No real book carries it — fall back to BettingPros' own consensus line.
  if (!lines.length) {
    const c = mainLine(over, 0)
    if (!c) return null
    const cu = mainLine(under, 0)
    lines.push(c.line)
    means.push(bookMean(c.line, c.cost, cu && cu.line === c.line ? cu.cost : null, cv))
  }

  return {
    line: median(lines),
    mean: median(means),
    n: lines.length,
    lo: Math.min(...lines),
    hi: Math.max(...lines),
    open: over.opening_line?.line ?? null,
  }
}

// ---------- fetch ----------

const playersPath = resolve(__dirname, '../src/data/players.json')
const board = JSON.parse(readFileSync(playersPath, 'utf8'))
const SEASON = board.season

console.log(`Fetching ${SEASON} season-long props from BettingPros…`)
const bookTally = {}
/** market -> [{name, pos, team, sum}] */
const raw = {}
for (const [mkt, id] of Object.entries(MARKETS)) {
  const offers = await fetchMarket(id, SEASON)
  raw[mkt] = []
  for (const o of offers) {
    const part = o.participants?.[0]
    const player = part?.player
    if (!player || !o.active) continue
    const sum = summarize(o, CV[mkt], bookTally)
    if (!sum) continue
    raw[mkt].push({ name: part.name, pos: player.position, team: player.team, sum })
  }
  console.log(`  ${mkt.padEnd(8)} ${String(raw[mkt].length).padStart(3)} players`)
}

// ---------- match to the board ----------

const byNamePos = new Map()
const byName = new Map()
for (const p of board.players) {
  byNamePos.set(`${key(p.name)}|${p.pos}`, p)
  if (!byName.has(key(p.name))) byName.set(key(p.name), p)
}

/** playerId -> { player, mkts: {mkt: sum} } */
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
console.log(`Matched ${matched.size} board players; ${unmatched.size} prop players not in the ADP pool`)

// ---------- fill the gaps Vegas doesn't post ----------

/**
 * Position-level rates fitted from the players who have BOTH markets, so a
 * missing line is estimated from the market itself: a RB's receptions from his
 * receiving-yards line at the position's yards-per-catch, touchdowns from
 * yardage at the position's TD-per-yard rate.
 */
function fitRatio(numMkt, denMkt) {
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
const projField = { passYd: 'passYd', passTd: 'passTd', passInt: 'passInt', rushYd: 'rushYd', rushTd: 'rushTd', rec: 'rec', recYd: 'recYd', recTd: 'recTd' }
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

/** Which stats each position needs a value for before it can be scored. */
const NEEDS = {
  QB: ['passYd', 'passTd', 'passInt', 'rushYd', 'rushTd'],
  RB: ['rushYd', 'rushTd', 'rec', 'recYd', 'recTd'],
  WR: ['rec', 'recYd', 'recTd', 'rushYd', 'rushTd'],
  TE: ['rec', 'recYd', 'recTd', 'rushYd', 'rushTd'],
}

/** The market a player must actually have a line in to be ranked at all. */
const REQUIRED = { QB: ['passYd'], RB: ['rushYd', 'recYd'], WR: ['recYd', 'rec'], TE: ['recYd', 'rec'] }

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
      // No book posted season INT lines — scale the player's own projected rate
      // to the passing volume Vegas gives him, so a gunslinger stays one.
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

// ---------- score and rank ----------

const r1 = (n) => Math.round(n * 10) / 10
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

/**
 * Raw points can't order a draft board in a one-QB league — every starting
 * quarterback outscores every receiver, and none of them are worth the pick.
 * The overall rank is value over the replacement a 10-team, 10-starter league
 * actually leaves on waivers: roughly the QB12, RB28, WR32 and TE12.
 */
const REPLACEMENT = { QB: 12, RB: 28, WR: 32, TE: 12 }
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
;[...included].sort((a, b) => a.player.adp - b.player.adp).forEach(({ entry }, i) => { entry.adpRank = i + 1 })
const posAdp = {}
for (const { player, entry } of [...included].sort((a, b) => a.player.adp - b.player.adp)) {
  posAdp[player.pos] = (posAdp[player.pos] ?? 0) + 1
  entry.adpPosRank = posAdp[player.pos]
}

const payload = {
  season: SEASON,
  generatedAt: new Date().toISOString(),
  source: 'bettingpros.com season-long player props — median line across sportsbooks, shaded by the over/under juice',
  books: bookTally,
  scoring: 'full PPR · 4pt pass TD · -2 INT',
  replacement: { slots: REPLACEMENT, pts: replPts },
  players: out,
}

writeFileSync(resolve(__dirname, '../src/data/vegas.json'), JSON.stringify(payload))
console.log(`\nWrote ${included.length} ranked players (${JSON.stringify(posCount)})`)
console.log(`Books: ${Object.entries(bookTally).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', ')}`)
console.log(`Replacement: ${Object.entries(replPts).map(([p, v]) => `${p} ${v}`).join(', ')}`)
console.log('\nVegas top 20 (value over replacement):')
for (const { player, entry } of included.slice(0, 20))
  console.log(`  ${String(entry.rank).padStart(2)}. ${player.name.padEnd(24)} ${player.pos} ${String(entry.fpts).padStart(6)} pts  val ${String(entry.val).padStart(6)}  (ADP rank ${entry.adpRank})`)
if (unmatched.size) console.log(`\nNot in ADP pool: ${[...unmatched].slice(0, 12).join(', ')}${unmatched.size > 12 ? '…' : ''}`)
