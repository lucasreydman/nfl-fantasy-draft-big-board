# Big Board

register: product

A personal fantasy-football draft workspace for one 10-team full-PPR Sleeper league. One user (Lucas), on a desktop while preparing and on a phone at the draft table. Dark, dense, data-forward — the tool disappears into the task of building and trusting a draft board.

## Surfaces

- **Big Board** — the hand-built ranking: drag, tiers, pick lines. The visual anchor of the app; every other surface should feel like the same product.
- **Godfather** — the weighted blend of every signal (Vegas lines, own board, ADP, luck-adjusted production).
- **Mock Draft** — 10-team snake sim against the board.
- **Vegas / Luck** — data lookups: sportsbook season lines vs ADP, and last season adjusted for context and touchdown luck.

## Design system (existing, preserve)

- Dark theme, CSS custom props in `src/index.css` (`--bg`, `--panel`, `--line`, `--accent` green `#2fe08b`, position colors QB pink / RB teal / WR blue / TE orange).
- Row vocabulary: bordered 10px-radius card-rows on `--panel`, a positional color wash bleeding from the left edge, bold tabular rank numerals, Sleeper headshots, chips for position/injury/deltas.
- One sans family; density is a feature; every table sorts; every row opens the same player card.
- Mobile ≤760px: toolbars fold, tables reflow into labeled cards, player card becomes a sheet.
