/**
 * Bakes src/data/vegas.json from BettingPros' season-long player prop markets,
 * so the app has Vegas data with no network. The in-app "Refresh data" button
 * runs the same logic live through api/live.mjs. All of it lives in live-lib.mjs.
 *
 * Run AFTER fetch-players (it matches against src/data/players.json):
 *   npm run fetch:vegas
 */
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildVegasPayload, fetchVegasOffers, loadBoard } from './live-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const board = loadBoard()
console.log(`Fetching ${board.season} season-long props from BettingPros…`)
const { raw, bookTally } = await fetchVegasOffers(board.season, console.log)

const { payload, included, unmatched, posCount, replPts } = buildVegasPayload(board, raw, bookTally)
writeFileSync(resolve(__dirname, '../src/data/vegas.json'), JSON.stringify(payload))

console.log(`\nWrote ${included.length} ranked players (${JSON.stringify(posCount)})`)
console.log(`Books: ${Object.entries(bookTally).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', ')}`)
console.log(`Replacement: ${Object.entries(replPts).map(([p, v]) => `${p} ${v}`).join(', ')}`)
console.log('\nVegas top 20 (value over replacement):')
for (const { player, entry } of included.slice(0, 20))
  console.log(`  ${String(entry.rank).padStart(2)}. ${player.name.padEnd(24)} ${player.pos} ${String(entry.fpts).padStart(6)} pts  val ${String(entry.val).padStart(6)}  (ADP rank ${entry.adpRank})`)
if (unmatched.size) console.log(`\nNot in ADP pool: ${[...unmatched].slice(0, 12).join(', ')}${unmatched.size > 12 ? '…' : ''}`)
