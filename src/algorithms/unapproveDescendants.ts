import type { PlanData } from '../types/curriculum'
import type { UserStateMap } from '../types/store'

export function unapproveDescendants(
  startId: string,
  planData: PlanData,
  userState: UserStateMap,
): UserStateMap {
  const dependents: Record<string, string[]> = {}
  for (const [id, course] of Object.entries(planData)) {
    for (const prereqId of course.prerreqs) {
      if (!dependents[prereqId]) dependents[prereqId] = []
      dependents[prereqId].push(id)
    }
  }

  const next = { ...userState }
  const stack = [startId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const id = stack.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    next[id] = { ...next[id], aprobada: false }
    for (const depId of dependents[id] ?? []) {
      if (next[depId]?.aprobada) stack.push(depId)
    }
  }

  return next
}
