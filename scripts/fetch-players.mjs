/**
 * Builds src/data/players.json from two public sources:
 *   - FantasyFootballCalculator: live consensus ADP (order + bye weeks)
 *   - Sleeper: player metadata, headshot ids, prior-season stats, current-season projections
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

// Kickers and team defenses are deliberately excluded: this board is skill players only.
const POS_ORDER = ['QB', 'RB', 'WR', 'TE']

// ---------- season stats: prior-year actuals + current-year projections ----------

const PRIOR = season - 1
// FB is fetched only so team target/carry denominators are complete; it never lands on the board.
const STAT_POS = ['QB', 'RB', 'WR', 'TE', 'FB']

const byPosRows = async (kind, yr) => {
  const out = {}
  for (const p of STAT_POS) {
    out[p] = await json(
      `https://api.sleeper.app/${kind}/nfl/${yr}?season_type=regular&position[]=${p}&order_by=pts_ppr`,
    )
  }
  return out
}

console.log(`Fetching ${PRIOR} stats and ${season} projections…`)
const actualByPos = await byPosRows('stats', PRIOR)
const projByPos = await byPosRows('projections', season)

const statById = new Map()
const projById = new Map()
/** The team a player actually played for last season — the right denominator for usage share. */
const statTeamById = new Map()
/** Team-level denominators so target/carry share is measured against a player's own offense. */
const teamTotals = new Map()

for (const rows of Object.values(actualByPos)) {
  for (const row of rows) {
    const st = row.stats
    if (!st) continue
    statById.set(row.player_id, st)
    const tm = team(row.team)
    if (!tm) continue
    statTeamById.set(row.player_id, tm)
    const t = teamTotals.get(tm) ?? { tgt: 0, rush: 0, pass: 0 }
    t.tgt += st.rec_tgt ?? 0
    t.rush += st.rush_att ?? 0
    t.pass += st.pass_att ?? 0
    teamTotals.set(tm, t)
  }
}

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

console.log(`  stats: ${statById.size} players, projections: ${projById.size} players, ${teamTotals.size} teams`)

const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : null)
const r0 = (n) => (typeof n === 'number' ? Math.round(n) : null)
const share = (part, whole) => (whole > 0 && part > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const nz = (n) => (typeof n === 'number' && n !== 0 ? n : null)

/** Drop null/undefined keys so players.json stays lean. */
const compact = (o) => {
  if (!o) return null
  const out = {}
  for (const [k, v] of Object.entries(o)) if (v != null) out[k] = v
  return Object.keys(out).length ? out : null
}

// ---------- usage benchmarks: where a share sits among the position ----------

/**
 * A share is meaningless without the field it was run against. Every player who held a real
 * role last season is pooled by position, so a card can say "3rd of 61 qualified RBs" instead
 * of leaving the reader to guess whether 60% of the carries is a lot.
 */
const QUAL_GAMES = 6
const QUAL_SNAP_PCT = 20
const USAGE_METRICS = ['snapPct', 'rushShare', 'tgtShare', 'rzOpp']

const usageOf = (st, tm) => {
  const tt = teamTotals.get(tm)
  return {
    snapPct: share(st.off_snp ?? 0, st.tm_off_snp ?? 0),
    rushShare: tt ? share(st.rush_att ?? 0, tt.rush) : null,
    tgtShare: tt ? share(st.rec_tgt ?? 0, tt.tgt) : null,
    // A count, not a share: goal-line work is scarce enough that the raw number is the story.
    rzOpp: nz((st.rush_rz_att ?? 0) + (st.rec_rz_tgt ?? 0)),
  }
}

/** Value at `frac` down a descending list — 0.5 is the median, 0.1 the top decile. */
const at = (desc, frac) => desc[Math.min(desc.length - 1, Math.floor(desc.length * frac))] ?? 0

const usageRankById = new Map()
const benchmarks = {}

for (const pos of POS_ORDER) {
  const pool = []
  for (const row of actualByPos[pos] ?? []) {
    const st = row.stats
    if (!st || (st.gp ?? 0) < QUAL_GAMES) continue
    const u = usageOf(st, statTeamById.get(row.player_id))
    if ((u.snapPct ?? 0) < QUAL_SNAP_PCT) continue
    pool.push({ id: row.player_id, ...u })
  }

  const n = pool.length
  benchmarks[pos] = { n }
  for (const metric of USAGE_METRICS) {
    const desc = [...pool].sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0))
    desc.forEach((p, i) => {
      const entry = usageRankById.get(p.id) ?? {}
      entry[metric] = { rank: i + 1, pctile: n > 1 ? Math.round(((n - 1 - i) / (n - 1)) * 100) : 100 }
      usageRankById.set(p.id, entry)
    })
    const vals = desc.map((p) => p[metric] ?? 0)
    benchmarks[pos][metric] = { med: at(vals, 0.5), hi: at(vals, 0.1), max: vals[0] ?? 0 }
  }
  console.log(`  ${pos}: ${n} qualified (snap med ${benchmarks[pos].snapPct.med}%, top decile ${benchmarks[pos].snapPct.hi}%)`)
}

function lastSeason(sleeperId) {
  const st = sleeperId && statById.get(sleeperId)
  if (!st || !st.gp) return null
  const usage = usageOf(st, statTeamById.get(sleeperId))
  const ranks = usageRankById.get(sleeperId) ?? {}
  // Everyone with no share of a category ties at zero, so a rank there would be noise.
  const rankOf = (metric) => (usage[metric] == null ? {} : (ranks[metric] ?? {}))
  const tgt = st.rec_tgt ?? 0
  return compact({
    season: PRIOR,
    gp: st.gp,
    gs: nz(st.gs),
    ptsPpr: r1(st.pts_ppr),
    ptsHalf: r1(st.pts_half_ppr),
    ptsStd: r1(st.pts_std),
    ppg: st.gp ? r1((st.pts_ppr ?? 0) / st.gp) : null,
    posRank: nz(st.pos_rank_ppr),
    ovrRank: nz(st.rank_ppr),
    snapRank: rankOf('snapPct').rank ?? null,
    snapPctile: rankOf('snapPct').pctile ?? null,
    snapPct: usage.snapPct,
    scrimYd: nz(st.rush_rec_yd),
    tds: nz(st.anytime_tds),
    fd: nz((st.rush_fd ?? 0) + (st.rec_fd ?? 0)),
    fum: nz(st.fum_lost ?? st.fum),
    // receiving
    tgt: nz(tgt),
    tgtShare: usage.tgtShare,
    tgtRank: rankOf('tgtShare').rank ?? null,
    tgtPctile: rankOf('tgtShare').pctile ?? null,
    rec: nz(st.rec),
    recYd: nz(st.rec_yd),
    recTd: nz(st.rec_td),
    ypr: r1(st.rec_ypr),
    ypt: r1(st.rec_ypt),
    catchPct: share(st.rec ?? 0, tgt),
    airYd: nz(st.rec_air_yd),
    rzTgt: nz(st.rec_rz_tgt),
    drops: nz(st.rec_drop),
    // rushing
    rushAtt: nz(st.rush_att),
    rushShare: usage.rushShare,
    rushRank: rankOf('rushShare').rank ?? null,
    rushPctile: rankOf('rushShare').pctile ?? null,
    rushYd: nz(st.rush_yd),
    rushTd: nz(st.rush_td),
    ypc: r1(st.rush_ypa),
    rzCarry: nz(st.rush_rz_att),
    rzOpp: usage.rzOpp,
    rzRank: rankOf('rzOpp').rank ?? null,
    rzPctile: rankOf('rzOpp').pctile ?? null,
    brokenTkl: nz(st.rush_btkl),
    // passing
    passAtt: nz(st.pass_att),
    passCmp: nz(st.pass_cmp),
    passYd: nz(st.pass_yd),
    passTd: nz(st.pass_td),
    passInt: nz(st.pass_int),
    cmpPct: r1(st.cmp_pct),
    passYpa: r1(st.pass_ypa),
    passRtg: r1(st.pass_rtg),
    sacks: nz(st.pass_sack),
  })
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
    depthOrder: s?.depth_chart_order ?? null,
    injury: s?.injury_status ?? null,
    last: lastSeason(s?.player_id ?? null),
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
  source: { adp: 'fantasyfootballcalculator.com (PPR, 10-team)', meta: adp.ppr.meta, players: 'sleeper.app', stats: `sleeper.app (${PRIOR} actuals, ${season} projections)` },
  usage: {
    season: PRIOR,
    qualifier: `≥${QUAL_GAMES} games and ≥${QUAL_SNAP_PCT}% of team snaps`,
    byPos: benchmarks,
  },
  players: all,
}

writeFileSync(resolve(__dirname, '../src/data/players.json'), JSON.stringify(payload))
console.log(`\nWrote ${all.length} players (${JSON.stringify(byPos)}) for season ${season}`)
if (missed.length) console.log(`Unmatched vs Sleeper (${missed.length}): ${missed.slice(0, 15).join(', ')}`)
