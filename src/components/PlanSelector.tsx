import { useMemo, useState } from 'react'
import { programIndex, areasByPlan, parseFilename, buildPlanFilename } from '../data/planIndex'
import { useCurriculumStore } from '../store/curriculumStore'
import { trackEvent } from '../lib/analytics'
import PlanSearchBar from './PlanSearchBar'
import type { PlanMeta } from '../types/curriculum'

export default function PlanSelector() {
  const programs = useMemo(() => Object.keys(programIndex).sort(), [])

  const activePlan = useCurriculumStore((s) => s.activePlan)
  const activeMeta = useMemo(() => (activePlan ? parseFilename(activePlan) : null), [activePlan])

  const [selectedProgram, setSelectedProgram] = useState(() => activeMeta?.program ?? '')
  const [selectedLetter, setSelectedLetter] = useState(() => activeMeta?.letter ?? '')
  const [selectedArea, setSelectedArea] = useState(() => activeMeta?.area ?? '')
  const [searchMode, setSearchMode] = useState(true)

  const loadPlan = useCurriculumStore((s) => s.loadPlan)
  const resetPlan = useCurriculumStore((s) => s.resetPlan)
  const planData = useCurriculumStore((s) => s.planData)
  const userState = useCurriculumStore((s) => s.userState)
  const showAvailable = useCurriculumStore((s) => s.showAvailable)
  const toggleShowAvailable = useCurriculumStore((s) => s.toggleShowAvailable)

  const letters = selectedProgram ? programIndex[selectedProgram] : []
  const areas =
    selectedProgram && selectedLetter ? (areasByPlan[`${selectedProgram}-${selectedLetter}`] ?? []) : []

  const handleProgramChange = (program: string) => {
    setSelectedProgram(program)
    setSelectedLetter('')
    setSelectedArea('')
    trackEvent('/plan/program', program)
  }

  const handleLetterChange = (letter: string) => {
    setSelectedLetter(letter)
    setSelectedArea('')
    if (!letter || !selectedProgram) return

    const planAreas = areasByPlan[`${selectedProgram}-${letter}`] ?? []
    if (planAreas.length > 0) {
      // No dejar el plan a medio elegir: se auto-selecciona la primera área,
      // el tercer <select> queda disponible para cambiarla después.
      setSelectedArea(planAreas[0])
      const filename = buildPlanFilename(selectedProgram, letter, planAreas[0])
      loadPlan(filename)
      trackEvent('/plan/select', filename.replace('-plan-estudios.json', ''))
    } else {
      const filename = buildPlanFilename(selectedProgram, letter)
      loadPlan(filename)
      trackEvent('/plan/select', filename.replace('-plan-estudios.json', ''))
    }
  }

  const handleAreaChange = (area: string) => {
    setSelectedArea(area)
    if (!area || !selectedProgram || !selectedLetter) return
    const filename = buildPlanFilename(selectedProgram, selectedLetter, area)
    loadPlan(filename)
    trackEvent('/plan/select', filename.replace('-plan-estudios.json', ''))
  }

  const handleSearchSelect = (meta: PlanMeta) => {
    setSelectedProgram(meta.program)
    setSelectedLetter(meta.letter)
    setSelectedArea(meta.area ?? '')
    loadPlan(buildPlanFilename(meta.program, meta.letter, meta.area))
    setSearchMode(false)
  }

  const activePlanLabel = activePlan?.replace('-plan-estudios.json', '') ?? null

  const creditProgress = useMemo(() => {
    if (!planData) return null
    let total = 0, approved = 0
    for (const [id, course] of Object.entries(planData)) {
      total += course.creditos
      if (userState[id]?.aprobada) approved += course.creditos
    }
    const pct = total > 0 ? Math.round((approved / total) * 100) : 0
    return { total, approved, pct }
  }, [planData, userState])

  return (
    <div className="flex flex-col gap-2 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-3 px-4 py-2.5 bg-base-cream border-b border-itam-muted/40">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-sm" style={{ color: '#0D3B2E' }}>
          Plan de Estudios
        </span>

        {searchMode ? (
          <PlanSearchBar onSelect={handleSearchSelect} />
        ) : (
          <>
            <select
              value={selectedProgram}
              onChange={(e) => handleProgramChange(e.target.value)}
              className="border border-itam-muted/40 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-itam-core"
              style={{ color: '#0D3B2E' }}
            >
              <option value="">— Programa —</option>
              {programs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={selectedLetter}
              onChange={(e) => handleLetterChange(e.target.value)}
              disabled={!selectedProgram}
              className="border border-itam-muted/40 rounded px-2 py-1 text-sm bg-white disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-itam-core"
              style={{ color: '#0D3B2E' }}
            >
              <option value="">— Generación —</option>
              {letters.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>

            {areas.length > 0 && (
              <select
                value={selectedArea}
                onChange={(e) => handleAreaChange(e.target.value)}
                className="border border-itam-muted/40 rounded px-2 py-1 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-itam-core"
                style={{ color: '#0D3B2E' }}
              >
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
          </>
        )}

        {activePlanLabel && (
          <>
            <span
              className="text-xs font-mono bg-base-bone border border-itam-muted/40 px-2 py-0.5 rounded"
              style={{ color: '#0D3B2E' }}
            >
              {activePlanLabel}
            </span>
            <button
              onClick={resetPlan}
              className="text-xs underline opacity-60 hover:opacity-100"
              style={{ color: '#0D3B2E' }}
            >
              Reiniciar
            </button>
          </>
        )}

        <button
          onClick={() => {
            setSearchMode((v) => !v)
            if (!searchMode) trackEvent('/plan/search-open', '')
          }}
          className="text-xs px-3 py-0.5 rounded-full border transition-colors"
          style={{
            background: searchMode ? '#22C55E' : 'transparent',
            color: searchMode ? '#fff' : '#3E2723',
            borderColor: searchMode ? '#22C55E' : '#DDD4A8',
            fontWeight: searchMode ? 600 : 400,
          }}
        >
          {searchMode ? 'Código del plan' : 'Buscar plan'}
        </button>
      </div>

      {creditProgress && (
        <span
          className="text-center text-xs font-medium"
          style={{ color: '#0D3B2E' }}
        >
          {creditProgress.approved} / {creditProgress.total} cr. ({creditProgress.pct}%)
        </span>
      )}

      {creditProgress && (
        <div className="flex justify-center md:justify-end">
          <button
            onClick={toggleShowAvailable}
            className="text-xs px-3 py-0.5 rounded-full border transition-colors"
            style={{
              background: showAvailable ? '#22C55E' : 'transparent',
              color: showAvailable ? '#fff' : '#3E2723',
              borderColor: showAvailable ? '#22C55E' : '#DDD4A8',
              fontWeight: showAvailable ? 600 : 400,
            }}
          >
            Disponibles
          </button>
        </div>
      )}
    </div>
  )
}
