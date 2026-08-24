/**
 * The refresh endpoint behind the app's "Refresh data" button: today's Sleeper
 * ADP plus today's Vegas lines, computed by the same code that bakes the
 * bundled files. Lives on the server because BettingPros doesn't answer
 * browsers from other origins.
 */
import { buildLiveData } from '../scripts/live-lib.mjs'

export default async function handler(req, res) {
  try {
    const data = await buildLiveData()
    // Let Vercel's edge absorb repeat clicks; five minutes is fresher than any draft needs.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ error: String(err?.message ?? err) })
  }
}
