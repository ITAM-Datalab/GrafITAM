import { useEffect, useState } from 'react'
import PlanSelector from './components/PlanSelector'
import FlowCanvas from './components/FlowCanvas'
import ScheduleTab from './components/schedule/ScheduleTab'
import ReportIssueModal from './components/schedule/ReportIssueModal'
import { useCurriculumStore } from './store/curriculumStore'
import bgDesktop from './assets/bg-desktop.png'
import bgMobile from './assets/bg-mobile.png'

export default function App() {
  const activePlan = useCurriculumStore((s) => s.activePlan)
  const planData = useCurriculumStore((s) => s.planData)
  const loadPlan = useCurriculumStore((s) => s.loadPlan)
  const [tab, setTab] = useState<'plan' | 'horario'>('plan')

  useEffect(() => {
    if (activePlan && !planData) {
      loadPlan(activePlan)
    }
  }, [activePlan, planData, loadPlan])

  return (
    <div className="flex flex-col h-screen">
      {/* Background fijo — desktop */}
      <img
        src={bgDesktop}
        aria-hidden
        className="fixed inset-0 w-full h-full object-cover -z-10 hidden md:block"
      />
      {/* Background fijo — móvil */}
      <img
        src={bgMobile}
        aria-hidden
        className="fixed inset-0 w-full h-full object-cover -z-10 block md:hidden"
      />

      <header className="flex-shrink-0">
        <div className="px-4 py-2" style={{ background: '#0D3B2E', color: '#FCFAF8' }}>
          <h1 className="text-base font-bold tracking-widest">GrafItam</h1>
          <p className="text-[10px] tracking-wide" style={{ opacity: 0.65 }}>
            Visualizador de Plan de Estudios · ITAM
          </p>
        </div>
        <PlanSelector />
        <div className="flex flex-wrap gap-1 px-4 bg-cream-50 border-b border-cream-300">
          <button
            onClick={() => setTab('plan')}
            className="text-xs px-3 py-1.5 font-semibold border-b-2"
            style={{
              borderColor: tab === 'plan' ? '#1E5E4B' : 'transparent',
              color: tab === 'plan' ? '#1E5E4B' : '#8CA699',
            }}
          >
            Plan de Estudios
          </button>
          <button
            onClick={() => setTab('horario')}
            className="text-xs px-3 py-1.5 font-semibold border-b-2"
            style={{
              borderColor: tab === 'horario' ? '#1E5E4B' : 'transparent',
              color: tab === 'horario' ? '#1E5E4B' : '#8CA699',
            }}
          >
            Planear Horario
          </button>
          <div className="ml-auto flex items-center py-1">
            <ReportIssueModal />
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
