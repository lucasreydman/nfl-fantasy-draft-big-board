# Big Board

A custom fantasy football big board and 10-team snake mock draft, in one app. Build your rankings by hand, cut them into tiers, then draft against them.

![views](https://img.shields.io/badge/views-big%20board%20%2B%20mock%20draft-2fe08b)

## What it does

Skill positions only — **no kickers, no team defenses**, anywhere in the app.

**Big Board** — drag players into your own order, drop in tiers, rename and recolor them.

- **Overall** mode: one ranked list read top to bottom, laid out as an aligned table — rank, headshot, name, position rank, team, bye, ADP, consensus rank, and your deviation each get their own column, with a sticky header. Tier dividers sit inline. S/M/L controls row density.
- **Positional** mode: a sortable column per position (QB/RB/WR/TE). Positional ranks (`RB1`, `WR12`) fall out of your overall order automatically, and tier colors carry across as a stripe on each row.
- **Auto-tier** cuts tiers where the ADP gap to the next player is unusually large *for that part of the board* — the threshold is a multiple of the local median gap, so it doesn't produce 14-player blocks at the top and one-man tiers at the bottom. The slider trades broad tiers for fine ones.
- Every card shows how far you've moved a player off consensus (`+12` = twelve spots higher than the consensus rank), and the side panel ranks your biggest swings. The comparison is rank-vs-rank, not rank-vs-raw-ADP — ADP is a pick number and compresses past the end of the draft, which makes deep players look wildly mis-ranked when they aren't.
- Set a player's rank directly, nudge with the arrows, or drag. Export/import the board as JSON.

**Mock Draft** — 10-team snake (8/12/14 also available, 10–18 rounds).

- Full snake grid with the live pick highlighted and your column called out.
- **Best available is your big board**, not ADP — that's the point of building one.
- CPU teams pick on ADP with roster-need weighting and a little noise, so no two mocks are identical. They fill starters first and won't stockpile early QBs.
- Sim to your pick, undo, auto-pick toggle, adjustable speed.
- Live roster with starters filled into lineup slots (QB/RB/RB/WR/WR/TE/FLEX) and the rest on the bench.

Drafted players gray out on the big board, so the two views stay in sync. Everything persists to `localStorage`.

## Data

Two public sources, merged at build time into `src/data/players.json`:

- **[FantasyFootballCalculator](https://fantasyfootballcalculator.com)** — live consensus ADP from real 10-team PPR mocks, plus half-PPR/standard ADP, draft ranges, and bye weeks.
- **[Sleeper](https://docs.sleeper.com)** — player metadata (team, age, experience, college, injury status) and the headshots/team logos served from `sleepercdn.com`.

The pool is **only players with a real consensus ADP** — around 210 for a 10-team PPR league. Kickers and team defenses are filtered out at the source, and players with no ADP row are not carried at all, so there is nothing in the board you can't meaningfully rank.

When the player file changes, a saved board reconciles itself on load: entries for players that no longer exist are dropped, newcomers are appended in ADP order, and a saved mock that references any departed player is discarded outright rather than left with ghost picks.

Refresh the data any time:

```bash
npm run fetch:players          # current season
SEASON=2027 npm run fetch:players
```

The script falls back to the previous season automatically if the current one has too few drafts logged (early offseason).

## Running it

```bash
npm install
npm run dev
```

## Stack

Vite · React · TypeScript · zustand (with `persist`) · dnd-kit. No backend — the player file ships with the bundle.
