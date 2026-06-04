import { useMemo, useState } from 'react'
import { programIndex } from '../data/planIndex'
import { useCurriculumStore } from '../store/curriculumStore'

export default function PlanSelector() {
  const programs = useMemo(() => Object.keys(programIndex).sort(), [])
  const [selectedProgram, setSelectedProgram] = useState('')

  const loadPlan = useCurriculumStore((s) => s.loadPlan)
  const activePlan = useCurriculumStore((s) => s.activePlan)
  const resetPlan = useCurriculumStore((s) => s.resetPlan)

  const letters = selectedProgram ? programIndex[selectedProgram] : []

  const handleProgramChange = (program: string) => {
    setSelectedProgram(program)
  }

  const handleLetterChange = (letter: string) => {
    if (!letter || !selectedProgram) return
    loadPlan(`${selectedProgram}-${letter}-plan-estudios.json`)
  }

  const activePlanLabel = activePlan?.replace('-plan-estudios.json', '') ?? null

  return (
    <div className="flex flex-wrap gap-3 items-center px-4 py-2.5 bg-cream-50 border-b border-cream-300">
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
        value=""
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
  )
}
