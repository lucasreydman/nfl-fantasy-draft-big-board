/**
 * Builds src/data/players.json from two public sources:
 *   - FantasyFootballCalculator: live consensus ADP (order + bye weeks)
 *   - Sleeper: player metadata, headshot ids, prior-season stats, current-season projections
 * Run: npm run fetch:players
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADJ_RULE, POS as POS_ORDER, QUALIFIER, STAT_POS, buildBenchmarks, compact, loadSeasonContext, withRanks } from './stats.mjs'

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
  if (!p.full_name) continue
  const n = key(p.full_name ?? `${p.first_name} ${p.last_name}`)
  const rank = (p.active ? 0 : 1000) + (p.team ? 0 : 100)
  const push = (map, k) => {
    const prev = map.get(k)
    if (!prev || rank < prev._rank) map.set(k, Object.assign(p, { _rank: rank }))
  }
  push(byNamePos, `${n}|${p.position}`)
  push(byName, n)
}

// Kickers and team defenses are deliberately excluded: this board is skill players only,
// so POS_ORDER stops at the four positions the module ranks.

// ---------- season stats: prior-year actuals, weekly context, current-year projections ----------

const PRIOR = season - 1

console.log(`Fetching ${season} projections…`)
const projByPos = {}
for (const p of STAT_POS) {
  projByPos[p] = await json(
    `https://api.sleeper.app/projections/nfl/${season}?season_type=regular&position[]=${p}&order_by=pts_ppr`,
  )
}

const projById = new Map()
/** Projected finish at the position across the whole league, not just the board. */
const projPosRank = new Map()
for (const rows of Object.values(projByPos)) {
  const scored = rows.filter((r) => r.stats?.pts_ppr > 0).sort((a, b) => b.stats.pts_ppr - a.stats.pts_ppr)
  scored.forEach((r, i) => {
    projById.set(r.player_id, r.stats)
    projPosRank.set(r.player_id, i + 1)
  })
  for (const r of rows) if (r.stats && !projById.has(r.player_id)) projById.set(r.player_id, r.stats)
}

const ctx = await loadSeasonContext({ json, year: PRIOR, team, log: (m) => console.log(m) })
const { ranks, benchmarks, poolSize } = buildBenchmarks(ctx)
console.log(`  qualified pool: ${JSON.stringify(poolSize)}`)

const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : null)
const r0 = (n) => (typeof n === 'number' ? Math.round(n) : null)
const nz = (n) => (typeof n === 'number' && n !== 0 ? n : null)

/** Last season as it happened. */
const lastSeason = (sleeperId) =>
  sleeperId ? withRanks(ctx.raw(sleeperId), ranks.raw.get(sleeperId)) : null

/** Last season with the distorted games removed and touchdown luck priced in. */
function adjusted(sleeperId) {
  if (!sleeperId) return null
  const line = withRanks(ctx.clean(sleeperId), ranks.adj.get(sleeperId))
  if (!line) return null
  const skips = ctx.droppedFor(sleeperId) ?? []
  return {
    ...line,
    dropped: skips,
    droppedPartial: skips.filter((s) => s.r === 'partial').length,
    droppedQb: skips.filter((s) => s.r === 'qb').length,
  }
}


function projection(sleeperId) {
  const st = sleeperId && projById.get(sleeperId)
  if (!st || !(st.pts_ppr > 0)) return null
  return compact({
    season,
    posRank: projPosRank.get(sleeperId) ?? null,
    gp: r0(st.gp),
    ptsPpr: r1(st.pts_ppr),
    ptsHalf: r1(st.pts_half_ppr),
    ptsStd: r1(st.pts_std),
    ppg: st.gp ? r1(st.pts_ppr / st.gp) : null,
    rec: r0(nz(st.rec)),
    recYd: r0(nz(st.rec_yd)),
    recTd: r1(nz(st.rec_td)),
    rushAtt: r0(nz(st.rush_att)),
    rushYd: r0(nz(st.rush_yd)),
    rushTd: r1(nz(st.rush_td)),
    passAtt: r0(nz(st.pass_att)),
    passCmp: r0(nz(st.pass_cmp)),
    passYd: r0(nz(st.pass_yd)),
    passTd: r1(nz(st.pass_td)),
    passInt: r1(nz(st.pass_int)),
    cmpPct: r1(st.cmp_pct),
  })
}

const missed = []
const players = []
const seen = new Set()

for (const row of adp.ppr.players) {
  const pos = row.position
  if (!POS_ORDER.includes(pos)) continue
  const tm = team(row.team)
  const s = byNamePos.get(`${key(row.name)}|${pos}`) ?? byName.get(key(row.name))
  if (!s) missed.push(`${row.name} (${pos} ${tm})`)

  const id = s?.player_id ?? `ffc-${row.player_id}`
  if (seen.has(id)) continue
  seen.add(id)

  const half = adp.half.players.find((p) => key(p.name) === key(row.name))
  const std = adp.standard.players.find((p) => key(p.name) === key(row.name))

  players.push({
    id,
    sleeperId: s?.player_id ?? null,
    name: s?.full_name ?? row.name,
    firstName: s?.first_name ?? row.name.split(' ')[0],
    lastName: s?.last_name ?? row.name.split(' ').slice(1).join(' '),
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
    height: s?.height ? Number(s.height) || null : null,
    weight: s?.weight ? Number(s.weight) || null : null,
    depthOrder: s?.depth_chart_order ?? null,
    injury: s?.injury_status ?? null,
    last: lastSeason(s?.player_id ?? null),
    adj: adjusted(s?.player_id ?? null),
    proj: projection(s?.player_id ?? null),
  })
}

players.sort((a, b) => a.adp - b.adp)

const all = players
all.forEach((p, i) => { p.rank = i + 1 })

const byPos = {}
for (const p of all) byPos[p.pos] = (byPos[p.pos] ?? 0) + 1

const payload = {
  season,
  generatedAt: new Date().toISOString(),
  source: { adp: 'fantasyfootballcalculator.com (PPR, 10-team)', meta: adp.ppr.meta, players: 'sleeper.app', stats: `sleeper.app (${PRIOR} weekly logs, ${season} projections)` },
  usage: {
    season: PRIOR,
    qualifier: QUALIFIER,
    adjRule: ADJ_RULE,
    xTd: ctx.model,
    byMode: benchmarks,
  },
  players: all,
}

writeFileSync(resolve(__dirname, '../src/data/players.json'), JSON.stringify(payload))
console.log(`\nWrote ${all.length} players (${JSON.stringify(byPos)}) for season ${season}`)
if (missed.length) console.log(`Unmatched vs Sleeper (${missed.length}): ${missed.slice(0, 15).join(', ')}`)
