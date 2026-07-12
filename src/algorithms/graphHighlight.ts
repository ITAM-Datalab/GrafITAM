import type { PlanData } from '../types/curriculum'

export function prereqEdgeId(prereqId: string, courseId: string): string {
  return `${prereqId}__${courseId}`
}

export function coreqEdgeId(a: string, b: string): string {
  return a < b ? `coreq__${a}__${b}` : `coreq__${b}__${a}`
}

export function buildDependentsIndex(planData: PlanData): Record<string, string[]> {
  const index: Record<string, string[]> = {}
  for (const [id, course] of Object.entries(planData)) {
    for (const prereqId of course.prerreqs) {
      if (!index[prereqId]) index[prereqId] = []
      index[prereqId].push(id)
    }
  }
  return index
}

export interface HoverHighlight {
  nodeIds: Set<string>
  edgeIds: Set<string>
}

/** Cadena transitiva completa en ambas direcciones a partir de `hoveredId`: todos los
 * ancestros (prerreqs de prerreqs...) y todos los descendientes (todo lo que esa materia
 * eventualmente desbloquea), más sus coreqs directos. Las aristas se marcan durante el
 * mismo recorrido (no por chequeo posterior de "¿ambos extremos están en el set?"), para
 * no marcar una arista coincidental entre dos nodos que están en el set por razones
 * distintas (uno ancestro, otro descendiente). */
export function computeHoverHighlight(
  hoveredId: string,
  planData: PlanData,
  dependentsIndex: Record<string, string[]>,
): HoverHighlight {
  const nodeIds = new Set<string>([hoveredId])
  const edgeIds = new Set<string>()

  const hovered = planData[hoveredId]
  if (hovered) {
    for (const partnerId of hovered.coreqGroup) {
      nodeIds.add(partnerId)
      edgeIds.add(coreqEdgeId(hoveredId, partnerId))
    }
  }

  const backStack = [hoveredId]
  const backVisited = new Set<string>([hoveredId])
  while (backStack.length > 0) {
    const id = backStack.pop()!
    const course = planData[id]
    if (!course) continue
    for (const prereqId of course.prerreqs) {
      nodeIds.add(prereqId)
      edgeIds.add(prereqEdgeId(prereqId, id))
      if (!backVisited.has(prereqId)) {
        backVisited.add(prereqId)
        backStack.push(prereqId)
      }
    }
  }

  const fwdStack = [hoveredId]
  const fwdVisited = new Set<string>([hoveredId])
  while (fwdStack.length > 0) {
    const id = fwdStack.pop()!
    for (const depId of dependentsIndex[id] ?? []) {
      nodeIds.add(depId)
      edgeIds.add(prereqEdgeId(id, depId))
      if (!fwdVisited.has(depId)) {
        fwdVisited.add(depId)
        fwdStack.push(depId)
      }
    }
  }

  return { nodeIds, edgeIds }
}
