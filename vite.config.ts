import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serves /api/live in dev with the same code the Vercel function runs, so the
 * refresh button works on localhost without `vercel dev`.
 */
function liveApi(): Plugin {
  return {
    name: 'live-api',
    configureServer(server) {
      server.middlewares.use('/api/live', async (_req, res) => {
        try {
          const { buildLiveData } = await import('./scripts/live-lib.mjs')
          const data = await buildLiveData()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (err) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: String((err as Error)?.message ?? err) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), liveApi()],
})
