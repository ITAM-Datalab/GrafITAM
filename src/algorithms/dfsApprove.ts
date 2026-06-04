import type { PlanData } from '../types/curriculum'
import type { UserStateMap } from '../types/store'

export function approveWithAncestors(
  startId: string,
  planData: PlanData,
  userState: UserStateMap,
): UserStateMap {
  const next = { ...userState }
  const stack: string[] = [startId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)

    next[id] = { ...(next[id] ?? { semestrePlaneado: planData[id]?.semestre ?? 1 }), aprobada: true }

    const course = planData[id]
    if (!course) continue

    for (const prereqId of course.prerreqs) {
      if (!next[prereqId]?.aprobada) {
        stack.push(prereqId)
      }
    }
  }

  return next
}
