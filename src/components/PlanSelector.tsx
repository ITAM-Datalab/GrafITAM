import { useMemo, useState } from 'react'
import { programIndex, areasByPlan, parseFilename, buildPlanFilename } from '../data/planIndex'
import { useCurriculumStore } from '../store/curriculumStore'

export default function PlanSelector() {
  const programs = useMemo(() => Object.keys(programIndex).sort(), [])

  const activePlan = useCurriculumStore((s) => s.activePlan)
  const activeMeta = useMemo(() => (activePlan ? parseFilename(activePlan) : null), [activePlan])

  const [selectedProgram, setSelectedProgram] = useState(() => activeMeta?.program ?? '')
  const [selectedLetter, setSelectedLetter] = useState(() => activeMeta?.letter ?? '')
  const [selectedArea, setSelectedArea] = useState(() => activeMeta?.area ?? '')

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
      loadPlan(buildPlanFilename(selectedProgram, letter, planAreas[0]))
    } else {
      loadPlan(buildPlanFilename(selectedProgram, letter))
    }
  }

  const handleAreaChange = (area: string) => {
    setSelectedArea(area)
    if (!area || !selectedProgram || !selectedLetter) return
    loadPlan(buildPlanFilename(selectedProgram, selectedLetter, area))
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
    <div className="relative flex flex-wrap items-center gap-3 px-4 py-2.5 bg-cream-50 border-b border-cream-300">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-espresso-800 font-semibold text-sm">Plan de Estudios</span>

        <select
          value={selectedProgram}
          onChange={(e) => handleProgramChange(e.target.value)}
          className="border border-cream-300 rounded px-2 py-1 text-sm bg-white text-espresso-800 focus:outline-none focus:ring-1 focus:ring-espresso-700"
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
          className="border border-cream-300 rounded px-2 py-1 text-sm bg-white text-espresso-800 disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-espresso-700"
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
            className="border border-cream-300 rounded px-2 py-1 text-sm bg-white text-espresso-800 focus:outline-none focus:ring-1 focus:ring-espresso-700"
          >
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}

        {activePlanLabel && (
          <>
            <span className="text-xs text-espresso-700 font-mono bg-cream-200 px-2 py-0.5 rounded">
              {activePlanLabel}
            </span>
            <button
              onClick={resetPlan}
              className="text-xs text-espresso-700 underline opacity-60 hover:opacity-100"
            >
              Reiniciar
            </button>
          </>
        )}
      </div>

      {creditProgress && (
        <span className="block w-full text-center md:absolute md:left-1/2 md:w-auto md:-translate-x-1/2 text-xs text-espresso-800 font-medium pointer-events-none">
          {creditProgress.approved} / {creditProgress.total} cr. ({creditProgress.pct}%)
        </span>
      )}

      {creditProgress && (
        <div className="ml-auto">
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
