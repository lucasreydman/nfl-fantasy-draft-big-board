import type { Pos, PosFilter } from '../types'

export const POSITIONS: Pos[] = ['QB', 'RB', 'WR', 'TE']

export const POS_COLOR: Record<Pos, string> = {
  QB: '#ff2a6d',
  RB: '#00ceb8',
  WR: '#58a7ff',
  TE: '#ffae58',
}

export const POS_FILTERS: PosFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'FLEX']

/** Flex has no position of its own, so it gets a colour that belongs to none of them. */
export const FLEX_COLOR = '#b48bff'

export const filterColor = (f: PosFilter) =>
  f === 'FLEX' ? FLEX_COLOR : f === 'ALL' ? undefined : POS_COLOR[f]

/** A flex spot takes everyone but the quarterback. */
export const matchesPos = (filter: PosFilter, pos: Pos) =>
  filter === 'ALL' || (filter === 'FLEX' ? pos !== 'QB' : pos === filter)

export const TIER_COLORS = [
  '#f45b69', '#ff9f1c', '#ffd166', '#06d6a0',
  '#4cc9f0', '#7b8cff', '#c77dff', '#8e9ab5',
]

export const headshot = (sleeperId: string | null, thumb = true) =>
  sleeperId
    ? `https://sleepercdn.com/content/nfl/players/${thumb ? 'thumb/' : ''}${sleeperId}.jpg`
    : null

export const teamLogo = (team: string | null) =>
  team ? `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png` : null

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()

/** 12 -> "1.02" for a league of `teams` size. */
export const pickLabel = (overall: number, teams: number) => {
  const round = Math.floor((overall - 1) / teams) + 1
  const inRound = ((overall - 1) % teams) + 1
  return `${round}.${String(inRound).padStart(2, '0')}`
}

export const fmtAdp = (n: number | null) => (n == null ? '—' : n.toFixed(1))

const INJURY_SHORT: Record<string, string> = {
  Questionable: 'Q',
  Doubtful: 'D',
  Out: 'OUT',
  IR: 'IR',
  PUP: 'PUP',
  Sus: 'SUS',
  DNR: 'DNR',
  NA: 'NA',
  COV: 'COV',
}

export const injuryTag = (status: string | null) =>
  status ? (INJURY_SHORT[status] ?? status.slice(0, 3).toUpperCase()) : null

/** 1 -> "1st", 2 -> "2nd", 13 -> "13th" */
export const ordinal = (n: number) => {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}
