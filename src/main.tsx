import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Installed copies should keep working on a phone with no signal at the draft table.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})

    // The build hashes its filenames, so the worker can't know them ahead of time. The page
    // does — it is running off them — so it hands the list over once the worker is live.
    navigator.serviceWorker.ready.then((reg) => {
      const urls = [...document.querySelectorAll<HTMLElement>('script[src], link[rel=stylesheet]')]
        .map((el) => (el as HTMLScriptElement).src || (el as HTMLLinkElement).href)
        .filter((url) => url.startsWith(location.origin))
      reg.active?.postMessage({ type: 'cache-assets', urls })
    }).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
