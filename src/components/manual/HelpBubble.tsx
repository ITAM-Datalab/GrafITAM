import { useEffect, useState } from 'react'
import ManualTab from './ManualTab'
import { trackEvent } from '../../lib/analytics'

// Se abre sola la primera vez que alguien entra (antes el Manual era la pestaña inicial).
const SEEN_KEY = 'grafitam-manual-visto'

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return true
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // sin storage disponible
  }
}

export default function HelpBubble() {
  const [open, setOpen] = useState(() => !alreadySeen())

  useEffect(() => {
    if (!open) return
    markSeen()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          trackEvent('/help/open', 'Ayuda: abrir manual')
        }}
        aria-label="Ayuda: cómo usar GrafItam"
        title="Ayuda"
        className="w-7 h-7 rounded-full text-sm font-bold shadow-sm border border-itam-muted/40 bg-white hover:bg-itam-muted/10 transition-colors"
        style={{ color: '#1E5E4B' }}
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            className="bg-base-cream rounded-lg shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-itam-muted/40">
              <h2 id="help-title" className="text-sm font-bold" style={{ color: '#0D3B2E' }}>
                Cómo usar GrafItam
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar ayuda"
                className="text-lg leading-none px-2 opacity-60 hover:opacity-100"
                style={{ color: '#0D3B2E' }}
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ManualTab />
            </div>
          </div>
        </div>
      )}
    </>
  )
}