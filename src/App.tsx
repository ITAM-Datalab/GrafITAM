import { useEffect, useState } from 'react'
import PlanSelector from './components/PlanSelector'
import FlowCanvas from './components/FlowCanvas'
import ScheduleTab from './components/schedule/ScheduleTab'
import ReportIssueModal from './components/schedule/ReportIssueModal'
//import ManualTab from './components/manual/ManualTab'
import HelpBubble from './components/manual/HelpBubble'
import { useCurriculumStore } from './store/curriculumStore'
import { trackEvent } from './lib/analytics'
import bgDesktop from './assets/bg-desktop.png'
import bgMobile from './assets/bg-mobile.png'
import datalabLogo from './assets/datalab-logo.png'

export default function App() {
  const activePlan = useCurriculumStore((s) => s.activePlan)
  const planData = useCurriculumStore((s) => s.planData)
  const loadPlan = useCurriculumStore((s) => s.loadPlan)
  const [tab, setTab] = useState<'plan' | 'horario'>('plan')
  //useState<'plan' | 'horario' | 'manual'>('manual')

  useEffect(() => {
    if (activePlan && !planData) {
      loadPlan(activePlan)
    }
  }, [activePlan, planData, loadPlan])

  return (
    <div className="flex flex-col h-screen">
      {/* Background fijo — desktop. object-top: en vez de recortar parejo
          arriba/abajo (default center), sacrifica el margen vacío de abajo
          para no cortar las orejas del lobo/gato, pegadas al borde superior. */}
      <img
        src={bgDesktop}
        aria-hidden
        className="fixed inset-0 w-full h-full object-cover object-top -z-10 hidden md:block"
      />
      {/* Background fijo — móvil */}
      <img
        src={bgMobile}
        aria-hidden
        className="fixed inset-0 w-full h-full object-cover object-top -z-10 block md:hidden"
      />

      {/* Velo sobre la ilustración para bajar el contraste del fondo (hallazgo V3). */}
      <div aria-hidden className="fixed inset-0 -z-10 bg-base-cream/80 backdrop-blur-[2px]" />

      <header className="flex-shrink-0">
        <div
          className="px-4 py-2 flex items-center justify-between gap-3"
          style={{ background: '#0D3B2E', color: '#FCFAF8' }}
        >
          <div>
            <h1 className="text-base font-bold tracking-widest">GrafItam</h1>
            <p className="text-[10px] tracking-wide" style={{ opacity: 0.65 }}>
              Visualizador de Plan de Estudios · ITAM
            </p>
          </div>
          <a       
            href="https://github.com/ITAM-Datalab"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-white/30 pl-1 pr-2.5 py-0.5 text-[10px] font-semibold tracking-wide hover:bg-white/10 transition-colors"
            title="Proyecto del DataLab del ITAM"
          >
            <img src={datalabLogo} alt="" aria-hidden className="h-4 w-4 rounded-full bg-white p-[1px]" />
            Made in DataLab
          </a>
        </div>

        <PlanSelector />
        <div className="flex flex-wrap gap-1 px-4 bg-base-cream border-b border-itam-muted/40">
          <button
            onClick={() => {
              setTab('plan')
              trackEvent('/tab/plan', 'Tab: Plan de Estudios')
            }}
            className="text-sm px-3 py-2 font-semibold border-b-2 transition-colors"
            style={{
              borderColor: tab === 'plan' ? '#1E5E4B' : 'transparent',
              color: tab === 'plan' ? '#1E5E4B' : 'rgba(13, 59, 46, 0.65)',
            }}
          >
            Plan de Estudios
          </button>
          <button
            onClick={() => {
              setTab('horario')
              trackEvent('/tab/horario', 'Tab: Planear Horario')
            }}
            className="text-sm px-3 py-2 font-semibold border-b-2 transition-colors"
            style={{
              borderColor: tab === 'horario' ? '#1E5E4B' : 'transparent',
              color: tab === 'horario' ? '#1E5E4B' : 'rgba(13, 59, 46, 0.65)',
            }}
          >
            Planear Horario
          </button>
          <div className="ml-auto flex items-center gap-2 py-1">
            <ReportIssueModal />
            <HelpBubble />
          </div>
        </div>
      </header>


      <main className="flex-1 overflow-hidden">
        {tab === 'horario' ? (
          <ScheduleTab />
        ) : planData ? (
          <FlowCanvas />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 opacity-40" style={{ color: '#0D3B2E' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <p className="text-sm">Selecciona un programa y generación para comenzar.</p>
          </div>
        )}
      </main>
    </div>
  )
}
