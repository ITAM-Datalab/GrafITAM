const GOATCOUNTER_SITE_CODE = 'grafitam'

declare global {
  interface Window {
    goatcounter?: {
      count: (opts: { path: string; title?: string; event?: boolean }) => void
    }
  }
}

/**
 * Inyecta el script de GoatCounter solo en producción (import.meta.env.PROD).
 * Llamar UNA vez, a nivel de módulo, desde main.tsx — no dentro de un componente
 * ni de un useEffect (StrictMode duplicaría la inyección en dev).
 */
export function initAnalytics(): void {
  if (!import.meta.env.PROD) return

  const script = document.createElement('script')
  script.async = true
  script.src = '//gc.zgo.at/count.js'
  script.dataset.goatcounter = `https://${GOATCOUNTER_SITE_CODE}.goatcounter.com/count`
  document.head.appendChild(script)
}

/**
 * Registra un evento custom en GoatCounter. No-op seguro si el script no cargó
 * (dev, ad-blocker, o el <script async> aún no terminó de cargar) — nunca lanza error.
 */
export function trackEvent(path: string, title: string): void {
  if (typeof window.goatcounter?.count !== 'function') return
  window.goatcounter.count({ path, title, event: true })
}
