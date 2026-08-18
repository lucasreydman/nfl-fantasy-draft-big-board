/**
 * Season stats, context-adjusted stats, and positional benchmarks from Sleeper.
 *
 * A season total answers "what did he score"; it does not answer "what is his level".
 * Two things routinely wreck the second question:
 *
 *   1. A game a player left after four snaps still counts as a game, so it drags his
 *      per-game average toward zero without telling you anything about his role.
 *   2. Weeks his quarterback missed are a different offense than the one he'll play in.
 *
 * Both are visible in weekly logs, so this module pulls all 18 weeks, marks the games
 * that were played under those conditions, and re-derives every rate over what's left.
 * Touchdowns get a third treatment: they are the noisiest thing on a stat sheet, so
 * expected touchdowns are fit from red-zone opportunity and the gap is reported as luck.
 *
 * Nothing here throws data away — the raw line ships alongside the adjusted one.
 */

export const WEEKS = 18
export const POS = ['QB', 'RB', 'WR', 'TE']
/** Fullbacks are pulled only to keep team target/carry denominators whole. */
export const STAT_POS = [...POS, 'FB']

/** A player joins the comparison pool once he has held a real role. */
const QUAL_GAMES = 6
const QUAL_SNAP_PCT = 20
/** Below this share of his own median snap count, a game is an exit, not an outing. */
const PARTIAL_FRACTION = 0.5
/** A team-week where the usual starter took under half the dropbacks is someone else's offense. */
const BACKUP_QB_FRACTION = 0.5
const TEAM_PASS_MIN = 10
/** Fewer clean games than this and the adjusted line is noise dressed as precision. */
const MIN_CLEAN_GAMES = 4

export const METRICS = ['ppg', 'snapPct', 'rushShare', 'tgtShare', 'rzOpp']

const r1 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null)
const r2 = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null)
const nz = (n) => (typeof n === 'number' && n !== 0 ? n : null)
const share = (part, whole) => (whole > 0 && part > 0 ? Math.round((part / whole) * 1000) / 10 : null)
const sum = (xs) => xs.reduce((a, b) => a + b, 0)

const median = (xs) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Value at `frac` down a descending list — 0.5 is the median, 0.1 the top decile. */
const at = (desc, frac) => desc[Math.min(desc.length - 1, Math.floor(desc.length * frac))] ?? 0

/** Drop null/undefined keys so players.json stays lean. */
export const compact = (o) => {
  if (!o) return null
  const out = {}
  for (const [k, v] of Object.entries(o)) if (v != null) out[k] = v
  return Object.keys(out).length ? out : null
}

/**
 * Split a touchdown rate into "from the red zone" and "from everywhere else".
 *
 * Plain least squares does badly here — high-volume players dominate it and it happily
 * returns a negative rate for non-red-zone work — so the fit is constrained to reproduce
 * the league's actual touchdown total. That makes the model calibrated by construction:
 * expected touchdowns sum to real ones, so one player's good luck is another's bad, and
 * the search reduces to a single free parameter that a grid handles exactly.
 */
function fitTdRates(rows) {
  const totalRz = sum(rows.map((r) => r.x1))
  const totalOther = sum(rows.map((r) => r.x2))
  const totalTd = sum(rows.map((r) => r.y))
  if (!totalRz || !totalOther || !totalTd) return { rz: 0, other: 0 }

  const maxRz = totalTd / totalRz // every touchdown credited to red-zone work
  let best = { rz: 0, other: totalTd / totalOther, err: Infinity }
  for (let i = 0; i <= 400; i++) {
    const rz = (maxRz * i) / 400
    const other = (totalTd - rz * totalRz) / totalOther
    if (other < 0) break
    let err = 0
    for (const { x1, x2, y } of rows) {
      const d = y - rz * x1 - other * x2
      err += d * d
    }
    if (err < best.err) best = { rz, other, err }
  }
  return { rz: best.rz, other: best.other }
}

/** Running totals for one window of games — a whole season, or only the clean weeks of one. */
const emptyTally = () => ({
  g: 0, pts: 0, ptsHalf: 0, ptsStd: 0, offSnp: 0, tmOffSnp: 0,
  rushAtt: 0, rushYd: 0, rushTd: 0, rzCar: 0, rushFd: 0,
  tgt: 0, rec: 0, recYd: 0, recTd: 0, rzTgt: 0, recFd: 0, airYd: 0, drops: 0,
  passAtt: 0, passCmp: 0, passYd: 0, passTd: 0, passInt: 0, sacks: 0,
  fum: 0, teamTgt: 0, teamRush: 0,
})

function addWeek(t, st, teamWeek) {
  t.g += 1
  t.pts += st.pts_ppr ?? 0
  t.ptsHalf += st.pts_half_ppr ?? 0
  t.ptsStd += st.pts_std ?? 0
  t.offSnp += st.off_snp ?? 0
  t.tmOffSnp += st.tm_off_snp ?? 0
  t.rushAtt += st.rush_att ?? 0
  t.rushYd += st.rush_yd ?? 0
  t.rushTd += st.rush_td ?? 0
  t.rzCar += st.rush_rz_att ?? 0
  t.rushFd += st.rush_fd ?? 0
  t.tgt += st.rec_tgt ?? 0
  t.rec += st.rec ?? 0
  t.recYd += st.rec_yd ?? 0
  t.recTd += st.rec_td ?? 0
  t.rzTgt += st.rec_rz_tgt ?? 0
  t.recFd += st.rec_fd ?? 0
  t.airYd += st.rec_air_yd ?? 0
  t.drops += st.rec_drop ?? 0
  t.passAtt += st.pass_att ?? 0
  t.passCmp += st.pass_cmp ?? 0
  t.passYd += st.pass_yd ?? 0
  t.passTd += st.pass_td ?? 0
  t.passInt += st.pass_int ?? 0
  t.sacks += st.pass_sack ?? 0
  t.fum += st.fum_lost ?? 0
  t.teamTgt += teamWeek?.tgt ?? 0
  t.teamRush += teamWeek?.rush ?? 0
}

/** Turn a window of games into the same shape the UI renders for a full season. */
function tallyToLine(t, { season, model, pos }) {
  if (!t.g) return null
  const xTd = expectedTds(t, model, pos)
  const td = t.rushTd + t.recTd
  const tdLuck = td - xTd
  return {
    season,
    gp: t.g,
    ptsPpr: r1(t.pts),
    ptsHalf: r1(t.ptsHalf),
    ptsStd: r1(t.ptsStd),
    ppg: r1(t.pts / t.g),
    snapPct: share(t.offSnp, t.tmOffSnp),
    scrimYd: nz(t.rushYd + t.recYd),
    tds: nz(td),
    fd: nz(t.rushFd + t.recFd),
    fum: nz(t.fum),
    // touchdown luck
    xTd: r1(xTd),
    tdLuck: r1(tdLuck),
    /** Points per game with touchdown production pulled back to what the opportunity implies. */
    luckPpg: r1((t.pts - 6 * tdLuck) / t.g),
    // receiving
    tgt: nz(t.tgt),
    tgtShare: share(t.tgt, t.teamTgt),
    rec: nz(t.rec),
    recYd: nz(t.recYd),
    recTd: nz(t.recTd),
    ypr: t.rec ? r1(t.recYd / t.rec) : null,
    ypt: t.tgt ? r1(t.recYd / t.tgt) : null,
    catchPct: share(t.rec, t.tgt),
    airYd: nz(t.airYd),
    rzTgt: nz(t.rzTgt),
    drops: nz(t.drops),
    // rushing
    rushAtt: nz(t.rushAtt),
    rushShare: share(t.rushAtt, t.teamRush),
    rushYd: nz(t.rushYd),
    rushTd: nz(t.rushTd),
    ypc: t.rushAtt ? r1(t.rushYd / t.rushAtt) : null,
    rzCarry: nz(t.rzCar),
    rzOpp: nz(t.rzCar + t.rzTgt),
    // passing
    passAtt: nz(t.passAtt),
    passCmp: nz(t.passCmp),
    passYd: nz(t.passYd),
    passTd: nz(t.passTd),
    passInt: nz(t.passInt),
    cmpPct: share(t.passCmp, t.passAtt),
    passYpa: t.passAtt ? r1(t.passYd / t.passAtt) : null,
    sacks: nz(t.sacks),
  }
}

function expectedTds(t, model, pos) {
  const rush = pos === 'QB' ? model.qbRush : model.rush
  const nonRzCar = Math.max(0, t.rushAtt - t.rzCar)
  const nonRzTgt = Math.max(0, t.tgt - t.rzTgt)
  return rush.rz * t.rzCar + rush.other * nonRzCar + model.rec.rz * t.rzTgt + model.rec.other * nonRzTgt
}

/**
 * Pull every weekly log for a season and index it by player and by team-week.
 * One request per week covers all four positions.
 */
async function loadWeeks({ json, year, team, onWeek }) {
  const games = new Map() // playerId -> [{ week, team, opp, pos, st }]
  const teamWeeks = new Map() // `${team}|${week}` -> { tgt, rush, passAtt, qbAtt: Map }

  for (let week = 1; week <= WEEKS; week++) {
    const url =
      `https://api.sleeper.app/stats/nfl/${year}/${week}?season_type=regular&order_by=pts_ppr` +
      STAT_POS.map((p) => `&position[]=${p}`).join('')
    const rows = await json(url)
    for (const row of rows) {
      const st = row.stats
      const tm = team(row.team)
      if (!st || !tm) continue
      const pos = row.player?.position ?? row.player?.fantasy_positions?.[0] ?? null

      const key = `${tm}|${week}`
      const tw = teamWeeks.get(key) ?? { tgt: 0, rush: 0, passAtt: 0, qbAtt: new Map() }
      tw.tgt += st.rec_tgt ?? 0
      tw.rush += st.rush_att ?? 0
      tw.passAtt += st.pass_att ?? 0
      if (st.pass_att) tw.qbAtt.set(row.player_id, (tw.qbAtt.get(row.player_id) ?? 0) + st.pass_att)
      teamWeeks.set(key, tw)

      if (!st.gp) continue
      const log = games.get(row.player_id) ?? []
      log.push({ week, team: tm, opp: row.opponent ?? null, pos, st })
      games.set(row.player_id, log)
    }
    onWeek?.(week, rows.length)
  }
  return { games, teamWeeks }
}

/** The passer a team actually belongs to, by season-long attempts. */
function primaryPassers(teamWeeks) {
  const byTeam = new Map()
  for (const [key, tw] of teamWeeks) {
    const tm = key.split('|')[0]
    const totals = byTeam.get(tm) ?? new Map()
    for (const [id, att] of tw.qbAtt) totals.set(id, (totals.get(id) ?? 0) + att)
    byTeam.set(tm, totals)
  }
  const primary = new Map()
  for (const [tm, totals] of byTeam) {
    let best = null
    for (const [id, att] of totals) if (!best || att > best.att) best = { id, att }
    if (best) primary.set(tm, best.id)
  }
  return primary
}

export async function loadSeasonContext({ json, year, team, log }) {
  log?.(`Fetching ${year} weekly logs (${WEEKS} weeks)…`)
  const { games, teamWeeks } = await loadWeeks({ json, year, team })
  const primary = primaryPassers(teamWeeks)

  /** Weeks where the offense was run by someone other than its usual passer. */
  const backupQbWeek = new Set()
  for (const [key, tw] of teamWeeks) {
    if (tw.passAtt < TEAM_PASS_MIN) continue
    const starter = primary.get(key.split('|')[0])
    const starterAtt = starter ? (tw.qbAtt.get(starter) ?? 0) : 0
    if (starterAtt / tw.passAtt < BACKUP_QB_FRACTION) backupQbWeek.add(key)
  }

  // Season aggregates come from the same weekly rows, so raw and adjusted are always comparable.
  const seasonTally = new Map()
  const cleanTally = new Map()
  const dropped = new Map()
  const posById = new Map()
  const teamById = new Map()

  for (const [id, logRows] of games) {
    const shares = logRows.map((g) => (g.st.tm_off_snp > 0 ? (g.st.off_snp ?? 0) / g.st.tm_off_snp : null))
    const known = shares.filter((s) => s != null)
    const med = median(known)
    const pos = logRows.at(-1)?.pos ?? null
    posById.set(id, pos)
    teamById.set(id, logRows.at(-1)?.team ?? null)

    const season = emptyTally()
    const clean = emptyTally()
    const skips = []

    logRows.forEach((g, i) => {
      const tw = teamWeeks.get(`${g.team}|${g.week}`)
      addWeek(season, g.st, tw)

      const snapShare = shares[i]
      const partial = med > 0 && snapShare != null && snapShare < med * PARTIAL_FRACTION
      const backup = pos !== 'QB' && backupQbWeek.has(`${g.team}|${g.week}`)
      if (partial || backup) {
        skips.push({ w: g.week, r: partial ? 'partial' : 'qb', snap: snapShare == null ? null : Math.round(snapShare * 100) })
        return
      }
      addWeek(clean, g.st, tw)
    })

    seasonTally.set(id, season)
    if (skips.length && clean.g >= MIN_CLEAN_GAMES) {
      cleanTally.set(id, clean)
      dropped.set(id, skips)
    }
  }

  // Fit expected touchdowns on everyone who played a real role, using season totals.
  const rushRows = []
  const qbRushRows = []
  const recRows = []
  for (const [id, t] of seasonTally) {
    if (t.g < QUAL_GAMES) continue
    const pos = posById.get(id)
    const row = { x1: t.rzCar, x2: Math.max(0, t.rushAtt - t.rzCar), y: t.rushTd }
    if (pos === 'QB') qbRushRows.push(row)
    else {
      rushRows.push(row)
      recRows.push({ x1: t.rzTgt, x2: Math.max(0, t.tgt - t.rzTgt), y: t.recTd })
    }
  }
  const model = { rush: fitTdRates(rushRows), qbRush: fitTdRates(qbRushRows), rec: fitTdRates(recRows) }
  log?.(
    `  expected TD rates — rz carry ${r2(model.rush.rz)}, carry ${r2(model.rush.other)}, ` +
    `rz target ${r2(model.rec.rz)}, target ${r2(model.rec.other)}, qb rz carry ${r2(model.qbRush.rz)}`,
  )

  // The finish a reader already knows — total points at the position, across everyone who played.
  const finish = new Map()
  const overall = [...seasonTally.entries()]
    .filter(([id]) => POS.includes(posById.get(id)))
    .sort((a, b) => b[1].pts - a[1].pts)
  overall.forEach(([id], i) => finish.set(id, { ovrRank: i + 1 }))
  for (const pos of POS) {
    overall
      .filter(([id]) => posById.get(id) === pos)
      .forEach(([id], i) => { finish.get(id).posRank = i + 1 })
  }

  const lineFor = (id, tally) => {
    const t = tally.get(id)
    return t ? tallyToLine(t, { season: year, model, pos: posById.get(id) }) : null
  }

  return {
    year,
    model,
    posById,
    teamById,
    /** Raw season line, rebuilt from weekly rows. */
    raw: (id) => {
      const line = lineFor(id, seasonTally)
      return line ? { ...line, ...finish.get(id) } : null
    },
    /** Same line over the games that weren't partial outings or backup-quarterback weeks. */
    clean: (id) => lineFor(id, cleanTally),
    droppedFor: (id) => dropped.get(id) ?? null,
    ids: () => [...seasonTally.keys()],
  }
}

/**
 * Rank every metric inside its position, once for raw lines and once for adjusted ones,
 * so a card can say "5th of 76" in whichever mode the reader is looking at.
 */
export function buildBenchmarks(ctx) {
  const pools = {}
  for (const pos of POS) pools[pos] = []

  for (const id of ctx.ids()) {
    const pos = ctx.posById.get(id)
    if (!POS.includes(pos)) continue
    const raw = ctx.raw(id)
    if (!raw || raw.gp < QUAL_GAMES || (raw.snapPct ?? 0) < QUAL_SNAP_PCT) continue
    pools[pos].push({ id, raw, adj: ctx.clean(id) ?? raw })
  }

  const ranks = { raw: new Map(), adj: new Map() }
  const benchmarks = { raw: {}, adj: {} }

  for (const pos of POS) {
    const pool = pools[pos]
    const n = pool.length
    for (const mode of ['raw', 'adj']) {
      benchmarks[mode][pos] = { n }
      for (const metric of METRICS) {
        const desc = [...pool].sort((a, b) => (b[mode][metric] ?? 0) - (a[mode][metric] ?? 0))
        desc.forEach((p, i) => {
          const entry = ranks[mode].get(p.id) ?? {}
          entry[metric] = { rank: i + 1, pctile: n > 1 ? Math.round(((n - 1 - i) / (n - 1)) * 100) : 100 }
          ranks[mode].set(p.id, entry)
        })
        const vals = desc.map((p) => p[mode][metric] ?? 0)
        benchmarks[mode][pos][metric] = { med: at(vals, 0.5), hi: at(vals, 0.1), max: vals[0] ?? 0 }
      }
    }
  }

  return { ranks, benchmarks, poolSize: Object.fromEntries(POS.map((p) => [p, pools[p].length])) }
}

/** Attach rank/percentile to a line, skipping categories the player has no share of. */
export function withRanks(line, ranks) {
  if (!line) return null
  const r = ranks ?? {}
  const of = (metric) => (line[metric] == null ? {} : (r[metric] ?? {}))
  return compact({
    ...line,
    ppgRank: of('ppg').rank ?? null,
    ppgPctile: of('ppg').pctile ?? null,
    snapRank: of('snapPct').rank ?? null,
    snapPctile: of('snapPct').pctile ?? null,
    rushRank: of('rushShare').rank ?? null,
    rushPctile: of('rushShare').pctile ?? null,
    tgtRank: of('tgtShare').rank ?? null,
    tgtPctile: of('tgtShare').pctile ?? null,
    rzRank: of('rzOpp').rank ?? null,
    rzPctile: of('rzOpp').pctile ?? null,
  })
}

export const QUALIFIER = `≥${QUAL_GAMES} games and ≥${QUAL_SNAP_PCT}% of team snaps`
export const ADJ_RULE =
  `drops games under ${Math.round(PARTIAL_FRACTION * 100)}% of a player's own median snap share, ` +
  `and games his team's usual quarterback missed most of`
