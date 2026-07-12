import type { RawPlan, PlanData, PlanMeta, ProgramIndex } from '../types/curriculum'
import { resolveCoreqGroup } from '../algorithms/coreqs'

// Vite glob path is relative to project root (starts with /)
const rawModules = import.meta.glob(
  '/jsonPEs/2025_01/*.json',
  { eager: true, import: 'default' },
) as Record<string, RawPlan>

// "CDA-A" o "ACT-D-RIESGOS-FINANCIEROS" (después de quitar "-plan-estudios.json"):
// programa (2-4 letras) + guión + letra (1 char) + opcionalmente guión + slug de
// área (puede traer más guiones, ej. "RIESGOS-FINANCIEROS"). Reemplaza el
// `lastIndexOf('-')` anterior — ese approach era ambiguo en cuanto el nombre podía
// traer un tercer segmento con sus propios guiones.
const FILENAME_RE = /^([A-Z]{2,4})-([A-Z])(?:-(.+))?$/

function toTitleCase(slug: string): string {
  return slug
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function parseFilename(path: string): PlanMeta {
  // path looks like "/jsonPEs/2025_01/CDA-A-plan-estudios.json" o
  // "/jsonPEs/2025_01/ACT-D-RIESGOS-FINANCIEROS-plan-estudios.json"
  const filename = path.split('/').pop()!
  const stem = filename.replace('-plan-estudios.json', '')
  const match = FILENAME_RE.exec(stem)
  if (!match) throw new Error(`No se pudo interpretar el nombre de archivo: ${filename}`)
  const [, program, letter, areaSlug] = match
  const area = areaSlug ? toTitleCase(areaSlug.replace(/-/g, ' ')) : undefined
  return { filename, program, letter, area }
}

/** Inversa de `parseFilename`: arma el nombre de archivo completo a partir de la
 * selección del usuario (programa + letra + label de área en Title Case, si aplica). */
export function buildPlanFilename(program: string, letter: string, area?: string): string {
  const areaPart = area ? `-${area.toUpperCase().replace(/\s+/g, '-')}` : ''
  return `${program}-${letter}${areaPart}-plan-estudios.json`
}

export const allPlanMetas: PlanMeta[] = Object.keys(rawModules)
  .map(parseFilename)
  .sort(
    (a, b) =>
      a.program.localeCompare(b.program) ||
      a.letter.localeCompare(b.letter) ||
      (a.area ?? '').localeCompare(b.area ?? ''),
  )

export const programIndex: ProgramIndex = {}
// Lista de labels de área (Title Case) por combinación "{programa}-{letra}" — vacío
// o ausente si ese plan no tiene variantes. Usado por PlanSelector para saber
// cuándo mostrar el tercer <select>.
export const areasByPlan: Record<string, string[]> = {}

for (const { program, letter, area } of allPlanMetas) {
  if (!programIndex[program]) programIndex[program] = []
  if (!programIndex[program].includes(letter)) programIndex[program].push(letter)

  if (area) {
    const key = `${program}-${letter}`
    if (!areasByPlan[key]) areasByPlan[key] = []
    areasByPlan[key].push(area)
  }
}

export function loadPlanData(filename: string): PlanData {
  const key = `/jsonPEs/2025_01/${filename}`
  const raw = rawModules[key]
  if (!raw) throw new Error(`Plan no encontrado: ${filename}`)

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
      coreqGroup: resolveCoreqGroup(course.coreqs, allIds),
    }
  }

  return planData
}
