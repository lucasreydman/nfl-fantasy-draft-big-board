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
- **Pick lines** mark where your picks land. Enter your draft slot (league size follows the mock draft setting, 10 by default) and the board draws a static dashed marker at each of your snake picks — `1.05 · Your 1st pick · round 1 · #5 overall` — so you can see at a glance which players should still be on the table when you're up. They're derived from slot and league size, never stored in the ranking, and toggle off in one click. Hidden while the list is filtered, since they only mean something against the full board.
- **The player card** carries the whole case for a player, not just his ADP: the draft market (PPR/half/standard ADP, draft range, standard deviation), this season's projection with its projected positional finish, last season's actuals broken out by passing/rushing/receiving, and a usage block — snap share, carry share, target share, red-zone touches — measured against his own offense's totals and then **ranked against the position**: `5th of 76` carry share tells you Henry is a workhorse, `44th of 76` target share tells you he leaves the field on passing downs. Each bar spans zero to whatever the position's leader managed, with a tick at the median, and categories a position barely touches (a receiver's carries, a quarterback's targets) are dropped rather than drawn. Rookies fall back to projections alone.
- **Tiering by hand, one row at a time.** Every player row carries three controls beside the nudge arrows: **start a tier here** cuts a new divider immediately above him, **drop a tier** sends him past the next divider to the top of the tier below, and **drop to the bottom** sends him to the foot of the board. So you can read down the list and cut it into tiers without dragging anything. Tiers are **numbered** — a badge on each divider and a small `T3` under each player's rank — and the numbers resequence whenever you insert, delete or drag one, so *Tier 7* can never end up sitting above *Tier 3*. A tier you renamed keeps its name; only the untouched `Tier <n>` labels get rewritten. The same three controls are on the player card, which is how they work on a phone, where the row's hover actions aren't there to hover over.
- Set a player's rank directly, nudge with the arrows, or drag. Export/import the board as JSON.
- **Cut and add players.** The `✕` on a row (or the button on the player card) takes a player off the board entirely — handy for the handcuffs and kickers you'll never draft. Everyone you've cut collects behind the **+ Add player** search under the list; adding one puts him back at the bottom, ready to be dragged wherever he belongs. Cuts survive a data refresh, so a Sleeper update never quietly puts them back.

**Vegas Board** — what the sportsbooks' season-long lines say the rankings should be, held up against ADP and against you.

Sportsbooks hang over/under lines on every stat this league pays for — passing/rushing/receiving yards, touchdowns, receptions — and those lines are real money, not content. The board pulls the season-long markets from [BettingPros](https://www.bettingpros.com) (DraftKings, Caesars, BetMGM, BetRivers, Hard Rock, bet365 and more), takes the **median line across books**, shades each one by its juice (a -130 over means the true number sits above the posted line — de-vig the two prices and shift by the implied z under the market's spread), and scores the result under this league's exact rules: full PPR, 4-point passing TDs, **-2 per interception**.

- **Raw points can't rank a one-QB league**, so the Vegas rank is **points over replacement** — what a 10-team, 10-starter league leaves on waivers (roughly the QB12, RB28, WR32, TE12, measured from the props pool itself). That's why Josh Allen's league-best 337 implied points rank him 18th overall instead of 1st.
- **Δ ADP** and **Δ YOU** are rank-vs-rank over the same covered pool (~160 players with lines), so the deltas are honest: +12 on Δ ADP means the books rank him twelve spots above where drafters take him.
- **The blend slider** mixes your board into the Vegas board at any weight, ranks the mix, and **VAL** compares that back to ADP — positive means the room lets you draft him later than the blend says he should go, negative means he'd be a reach. **Apply to board** writes the blended order onto the big board by permuting only the covered players among the slots they already occupy: your tiers and everyone without a line stay exactly where they were.
- Markets the books didn't post are filled honestly and marked: a `~est` chip on the row, a `~` on the number. Receptions missing but receiving yards posted → the position's yards-per-catch, fitted from players with both lines. No interception market exists at all, so INTs scale the player's projected rate to the passing volume Vegas gives him. A player with no line in his position's core market isn't ranked at all.
- The player card carries the full set: every posted line (median, book count), the implied points, and how far the books sit from the drafting public on him.

```bash
npm run fetch:vegas   # refresh the lines (run fetch:players first — it matches against players.json)
```

**Luck Table** — the whole pool as one sortable table, last season measured two ways.

Twelve columns: your rank, ADP, games (clean/played), raw PPG, adjusted PPG, **Δ PPG**, luck-adjusted PPG, **Δ LUCK**, raw points, adjusted 17-game pace, and **Δ PTS**. Every header sorts; the position tabs, search box, *Adjusted only*, and *Hide drafted* filter the whole thing; clicking a row opens the same player card the big board uses. The position tabs carry a **FLEX** option — every flex-eligible player, which is everyone but the quarterbacks — and they are one shared control, so a filter set here is still set on the big board and in the mock draft.

The three spread columns are the point of it. Sort by **Δ PPG** and the top of the table is players whose averages were held down by circumstance rather than ability — Chase Brown at +4.4 (seven games with Cincinnati's starting quarterback), Jonathan Taylor +3.5, Drake London +2.9. Sort by **Δ LUCK** and you get touchdown regression in both directions: CeeDee Lamb and Justin Jefferson at +1.7 scored well under what their opportunity implied, and flipping the sort surfaces the players who scored well over it. **Δ PTS** is the season-level version and deliberately counts games missed as well as games removed, so a healthy pace stands out against a truncated season.

**Install it.** The app ships a web manifest, generated PNG icons and a service worker, so *Add to Home Screen* gives you a standalone app with no browser chrome — and one that still opens with the server unreachable, which is the state a phone is usually in at a draft table. The layout is built for that: below 760px the columns that don't earn their space drop out, the secondary toolbar folds behind **Tools**, the player card becomes a sheet you pull up over the list, and the luck table's rows reflow into cards using the labels each cell already carries.

**Mock Draft** — 10-team snake (8/12/14 also available, 10–18 rounds).

- Full snake grid with the live pick highlighted and your column called out.
- **Best available is your big board**, not ADP — that's the point of building one.
- CPU teams pick on ADP with roster-need weighting and a little noise, so no two mocks are identical. They fill starters first and won't stockpile early QBs.
- **CPUs value: Consensus / My board.** Switch them to your board and the whole room shares your rankings — every player you like is gone by the pick you'd have taken him, which is the worst case a board can face. The jitter comes off in this mode too, since the point is that nobody misvalues your guys. Roster needs still apply, because ten teams drafting one list with no needs would just take ten running backs. Promote a 150th-ranked player to the top of your board and watch him go 1.01.
- Sim to your pick, undo, auto-pick toggle, adjustable speed.
- Live roster with starters filled into lineup slots — **QB/RB/RB/WR/WR/TE/FLEX/FLEX**, then a **six-seat bench**, empties shown as empties. Kickers and defenses aren't on this board, so a 15-round draft fills one more skill player than the 14 seats hold; the extra sits under *Over roster limit* rather than disappearing. The CPUs know about the second flex — their starter targets run to three backs and three receivers, so a third good runner reads as a starter rather than a luxury.

Drafted players gray out on the big board, so the two views stay in sync. Everything persists to `localStorage`.

## Data

Two public sources, merged at build time into `src/data/players.json`:

- **[Sleeper](https://docs.sleeper.com) ADP** — the consensus the board is ordered by, taken from real Sleeper redraft leagues in PPR, half-PPR and standard.
- **[FantasyFootballCalculator](https://fantasyfootballcalculator.com)** — a second opinion on the same players, plus the draft range, standard deviation and sample size Sleeper doesn't publish, and bye weeks.

FFC was the sole source until its `teams` parameter turned out to be decorative: 8-, 10-, 12- and 14-team requests return byte-identical numbers while echoing your value back in `meta`, so no request to it is league-size-specific no matter what it claims. It also runs its own mocks rather than real leagues, and the two markets can disagree sharply — FFC had Brock Bowers at 38.0 while Sleeper drafts him at 22.6. The card shows both and calls out any split of eight picks or more, because a disagreement that size is information, not noise.
- **[Sleeper](https://docs.sleeper.com)** — player metadata (team, age, size, experience, college, injury status), **all 18 weekly stat logs** from last season, this season's projections, and the headshots/team logos served from `sleepercdn.com`. Season lines are rebuilt from the weekly rows rather than taken as totals, which is what makes the adjusted view below possible. Usage shares are computed against each team's own totals for targets and carries, over the same weeks the player is being measured on. The comparison pool is every player at the position who cleared 6 games and 20% of his team's snaps — 71 running backs, 159 receivers — so a share is ranked against real roles, not against backups who played two snaps.

### Adjusted stats

A season average answers "what did he score." It does not answer "what is he," and two things routinely wreck the difference. A game a player left after four snaps still counts as a game, so it drags his per-game average toward zero while telling you nothing about his role. And weeks his quarterback missed are a different offense than the one he'll play in next year.

Both are visible in weekly logs, so the card carries a second line beside the raw one. Toggle **Raw / Adjusted** on any player:

- **Partial games are dropped** — any week under half of a player's *own* median snap share. The rule is self-referencing on purpose: half of 90% catches a workhorse who left in the first quarter, half of 30% catches a committee back who did, and neither is penalized for the role he normally plays.
- **Backup-quarterback weeks are dropped** — any week where the team's usual passer (by season attempts) took under half its dropbacks. Chase Brown's raw 16.6 PPG is 21.0 over the seven games Cincinnati's starter actually played; Ja'Marr Chase's 19.6 falls to 17.8.
- **Touchdowns are re-priced.** Touchdowns are the noisiest thing on a stat sheet, so expected touchdowns are fit from red-zone and non-red-zone opportunity, constrained so the league's expected total equals its actual one — which makes luck zero-sum, one player's good fortune another's bad. **Luck-adjusted PPG** pays touchdowns at the rate the opportunity implies. Puka Nacua scored 11 on 6.8 expected; that +4.2 is the gap between his 23.4 PPG and a 21.9 that repeats.

Every adjusted card names the games it left out and how many are left, because a seven-game sample is a real caveat and hiding it would be worse than not adjusting at all. Nothing is thrown away — the raw line is one click away, and players who had no distorted games say so.

Overtime snaps can't be separated out: Sleeper publishes per-week totals, not play-by-play, so there is no way to tell which touches came after regulation. The partial-game and backup-quarterback filters cover the same intent — removing games played under conditions that won't repeat.

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
