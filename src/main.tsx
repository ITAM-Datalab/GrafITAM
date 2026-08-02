import { StrictMode, Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import App from './App'
import { initAnalytics } from './lib/analytics'

initAnalytics()

// ============================================================
// DIAGNÓSTICO TEMPORAL — pantalla en blanco iOS Safari (ver index.html).
// Atrapa errores durante el render de React que window.onerror también
// debería ver, pero con un dato extra: el "component stack" (qué
// componente exacto truena). Reusa el panel de index.html vía
// window.__diagReport en vez de su propio JSX, para no arriesgar que
// el fallback mismo falle al renderizar.
// BORRAR junto con el bloque <script> de index.html.
// ============================================================
declare global {
  interface Window {
    __diagReport?: (title: string, details: string) => void
  }
}

class DiagErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    const details =
      (error && error.message ? error.message : String(error)) +
      '\n\nstack:\n' + (error && error.stack ? error.stack : '(no disponible)') +
      '\n\ncomponent stack:\n' + info.componentStack
    window.__diagReport?.('React render error (ErrorBoundary)', details)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DiagErrorBoundary>
      <App />
    </DiagErrorBoundary>
  </StrictMode>,
)
