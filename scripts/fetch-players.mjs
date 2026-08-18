/**
 * Builds src/data/players.json from two public sources:
 *   - FantasyFootballCalculator: live consensus ADP (order + bye weeks)
 *   - Sleeper: player metadata + headshot ids
 * Run: npm run fetch:players
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SEASON = Number(process.env.SEASON ?? new Date().getFullYear())
const FORMATS = { ppr: 'ppr', half: 'half-ppr', standard: 'standard' }
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g

const norm = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'`-]/g, ' ').replace(SUFFIX, ' ').replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ').trim()

const key = (s) => norm(s).replace(/ /g, '')

const TEAM_FIX = { JAX: 'JAX', JAC: 'JAX', WAS: 'WAS', LAR: 'LAR', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' }
const team = (t) => (t ? TEAM_FIX[t.toUpperCase()] ?? t.toUpperCase() : null)

async function json(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const adpUrl = (fmt, year) =>
  `https://fantasyfootballcalculator.com/api/v1/adp/${fmt}?teams=10&year=${year}`

async function loadAdp(year) {
  const out = {}
  for (const [label, fmt] of Object.entries(FORMATS)) {
    const data = await json(adpUrl(fmt, year))
    if (data.status !== 'Success') throw new Error(`ADP ${fmt} failed`)
    out[label] = { meta: data.meta, players: data.players }
    console.log(`  adp:${label.padEnd(8)} ${data.players.length} players, ${data.meta.total_drafts} drafts (${data.meta.start_date} → ${data.meta.end_date})`)
  }
  return out
}

console.log(`Fetching ${SEASON} ADP…`)
let season = SEASON
let adp
try {
  adp = await loadAdp(season)
  if (adp.ppr.meta.total_drafts < 50) throw new Error('too few drafts')
} catch (e) {
  season = SEASON - 1
  console.log(`  ${SEASON} unusable (${e.message}); falling back to ${season}`)
  adp = await loadAdp(season)
}

console.log('Fetching Sleeper player metadata…')
const sleeper = await json('https://api.sleeper.app/v1/players/nfl')
const sleeperList = Object.values(sleeper)

// Index Sleeper players for fuzzy-ish lookup.
const byNamePos = new Map()
const byName = new Map()
for (const p of sleeperList) {
  if (!p.full_name && p.position !== 'DEF') continue
  const n = key(p.full_name ?? `${p.first_name} ${p.last_name}`)
  const rank = (p.active ? 0 : 1000) + (p.team ? 0 : 100)
  const push = (map, k) => {
    const prev = map.get(k)
    if (!prev || rank < prev._rank) map.set(k, Object.assign(p, { _rank: rank }))
  }
  push(byNamePos, `${n}|${p.position}`)
  push(byName, n)
}

const DST_NAMES = {}
for (const p of sleeperList) {
  if (p.position === 'DEF' && p.team) DST_NAMES[team(p.team)] = `${p.first_name} ${p.last_name}`
}

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const missed = []
const players = []
const seen = new Set()

for (const row of adp.ppr.players) {
  const pos = row.position === 'PK' ? 'K' : row.position === 'DST' ? 'DEF' : row.position
  if (!POS_ORDER.includes(pos)) continue
  const tm = team(row.team)
  let s = pos === 'DEF' ? null : (byNamePos.get(`${key(row.name)}|${pos}`) ?? byName.get(key(row.name)))
  if (pos !== 'DEF' && !s) missed.push(`${row.name} (${pos} ${tm})`)

  const id = pos === 'DEF' ? `DEF-${tm}` : (s?.player_id ?? `ffc-${row.player_id}`)
  if (seen.has(id)) continue
  seen.add(id)

  const half = adp.half.players.find((p) => key(p.name) === key(row.name))
  const std = adp.standard.players.find((p) => key(p.name) === key(row.name))

  players.push({
    id,
    sleeperId: pos === 'DEF' ? null : s?.player_id ?? null,
    name: pos === 'DEF' ? (DST_NAMES[tm] ?? row.name) : (s?.full_name ?? row.name),
    firstName: pos === 'DEF' ? null : s?.first_name ?? row.name.split(' ')[0],
    lastName: pos === 'DEF' ? null : s?.last_name ?? row.name.split(' ').slice(1).join(' '),
    pos,
    team: tm,
    bye: row.bye || null,
    adp: row.adp,
    adpHalf: half?.adp ?? null,
    adpStd: std?.adp ?? null,
    stdev: row.stdev ?? null,
    high: row.high ?? null,
    low: row.low ?? null,
    timesDrafted: row.times_drafted ?? null,
    age: s?.age ?? null,
    exp: s?.years_exp ?? null,
    number: s?.number ?? null,
    college: s?.college ?? null,
    depthOrder: s?.depth_chart_order ?? null,
    injury: s?.injury_status ?? null,
    estimated: false,
  })
}

players.sort((a, b) => a.adp - b.adp)

// Backfill notable Sleeper players who have no ADP row yet (deep bench / rookies).
const extras = sleeperList
  .filter((p) => p.active && p.team && POS_ORDER.includes(p.position) && p.search_rank && p.search_rank < 400)
  .filter((p) => !seen.has(p.player_id))
  .sort((a, b) => a.search_rank - b.search_rank)
  .slice(0, 120)
  .map((p, i) => ({
    id: p.player_id, sleeperId: p.player_id, name: p.full_name,
    firstName: p.first_name, lastName: p.last_name, pos: p.position, team: team(p.team),
    bye: null, adp: 400 + i, adpHalf: null, adpStd: null, stdev: null, high: null, low: null,
    timesDrafted: null, age: p.age ?? null, exp: p.years_exp ?? null, number: p.number ?? null,
    college: p.college ?? null, depthOrder: p.depth_chart_order ?? null, injury: p.injury_status ?? null,
    estimated: true,
  }))

// Every DST, so kicker/defense rounds are draftable even outside ADP coverage.
const dstExtras = Object.entries(DST_NAMES)
  .filter(([tm]) => !seen.has(`DEF-${tm}`))
  .map(([tm, name], i) => ({
    id: `DEF-${tm}`, sleeperId: null, name, firstName: null, lastName: null, pos: 'DEF',
    team: tm, bye: null, adp: 520 + i, adpHalf: null, adpStd: null, stdev: null, high: null,
    low: null, timesDrafted: null, age: null, exp: null, number: null, college: null,
    depthOrder: null, injury: null, estimated: true,
  }))

const all = [...players, ...extras, ...dstExtras]
all.forEach((p, i) => { p.rank = i + 1 })

const byPos = {}
for (const p of all) byPos[p.pos] = (byPos[p.pos] ?? 0) + 1

const payload = {
  season,
  generatedAt: new Date().toISOString(),
  source: { adp: 'fantasyfootballcalculator.com (PPR, 10-team)', meta: adp.ppr.meta, players: 'sleeper.app' },
  players: all,
}

writeFileSync(resolve(__dirname, '../src/data/players.json'), JSON.stringify(payload))
console.log(`\nWrote ${all.length} players (${JSON.stringify(byPos)}) for season ${season}`)
if (missed.length) console.log(`Unmatched vs Sleeper (${missed.length}): ${missed.slice(0, 15).join(', ')}`)
