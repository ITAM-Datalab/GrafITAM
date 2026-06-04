import type { RawPlan, PlanData, PlanMeta, ProgramIndex } from '../types/curriculum'
import { detectCoreqGroups } from '../algorithms/coreqs'

// Vite glob path is relative to project root (starts with /)
const rawModules = import.meta.glob(
  '/jsonPEs/jsonPEs/*.json',
  { eager: true, import: 'default' },
) as Record<string, RawPlan>

function parseFilename(path: string): PlanMeta {
  // path looks like "/jsonPEs/jsonPEs/CDA-A-plan-estudios.json"
  const filename = path.split('/').pop()!
  const base = filename.replace('-plan-estudios.json', '')
  const lastDash = base.lastIndexOf('-')
  const program = base.slice(0, lastDash)
  const letter = base.slice(lastDash + 1)
  return { filename, program, letter }
}

export const allPlanMetas: PlanMeta[] = Object.keys(rawModules)
  .map(parseFilename)
  .sort((a, b) => a.program.localeCompare(b.program) || a.letter.localeCompare(b.letter))

export const programIndex: ProgramIndex = {}
for (const { program, letter } of allPlanMetas) {
  if (!programIndex[program]) programIndex[program] = []
  programIndex[program].push(letter)
}

export function loadPlanData(filename: string): PlanData {
  const key = `/jsonPEs/jsonPEs/${filename}`
  const raw = rawModules[key]
  if (!raw) throw new Error(`Plan no encontrado: ${filename}`)

  const coreqMap = detectCoreqGroups(raw)
  const allIds = new Set(Object.keys(raw))
  const planData: PlanData = {}

  for (const [id, course] of Object.entries(raw)) {
    const presentPrerreqs: string[] = []
    const danglingPrerreqs: string[] = []

    for (const prereqId of course.prerreqs) {
      if (allIds.has(prereqId)) {
        presentPrerreqs.push(prereqId)
      } else {
        danglingPrerreqs.push(prereqId)
      }
    }

    planData[id] = {
      id,
      nombre: course.nombre,
      creditos: course.creditos,
      semestre: course.semestre,
      prerreqs: presentPrerreqs,
      danglingPrerreqs,
      coreqGroup: coreqMap[id] ?? [],
    }
  }

  return planData
}
