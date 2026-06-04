import type { RawPlan } from '../types/curriculum'

export function detectCoreqGroups(raw: RawPlan): Record<string, string[]> {
  const bySemestre: Record<number, string[]> = {}

  for (const [id, course] of Object.entries(raw)) {
    if (course.coreqs.includes('CORREQ')) {
      const sem = course.semestre
      if (!bySemestre[sem]) bySemestre[sem] = []
      bySemestre[sem].push(id)
    }
  }

  const result: Record<string, string[]> = {}
  for (const group of Object.values(bySemestre)) {
    for (const id of group) {
      result[id] = group.filter((other) => other !== id)
    }
  }

  return result
}
