/**
 * Offline shell for the installed app.
 *
 * The build emits content-hashed assets, so those can be cached forever and served from
 * cache first. Navigations are the opposite case — index.html is the one file whose name
 * never changes — so those go to the network first and only fall back to the cache when
 * the phone is offline. That way an install picks up a deploy on the next launch instead
 * of pinning itself to whatever it saw first.
 */
const CACHE = 'big-board-v1'
/*
 * ignoreVary matters more than it looks. Vite marks its module script and stylesheet
 * `crossorigin`, so the browser sends an Origin header on those two requests and the
 * server answers with `Vary: Origin`. The copies in the cache were fetched without one,
 * so a strict match misses exactly the two files the app cannot start without.
 */
const MATCH = { ignoreVary: true }
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/**
 * The page reports the hashed asset URLs it actually loaded, which is the only way this
 * worker can precache a build whose filenames it cannot predict.
 */
self.addEventListener('message', (event) => {
  const { type, urls } = event.data ?? {}
  if (type !== 'cache-assets' || !Array.isArray(urls)) return
  const own = urls.filter((u) => {
    try { return new URL(u).origin === self.location.origin } catch { return false }
  })
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(own)).catch(() => {}))
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // headshots and fonts keep their own rules

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/', MATCH).then((hit) => hit ?? Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(request, MATCH).then((hit) => {
      if (hit) return hit
      return fetch(request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return res
      })
    }),
  )
})
