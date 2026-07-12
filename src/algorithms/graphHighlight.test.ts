import { describe, expect, it } from 'vitest'
import { buildDependentsIndex, computeHoverHighlight, coreqEdgeId, prereqEdgeId } from './graphHighlight'
import type { PlanData } from '../types/curriculum'

function course(id: string, prerreqs: string[] = [], coreqGroup: string[] = []): PlanData[string] {
  return { id, nombre: id, creditos: 8, semestre: 1, prerreqs, danglingPrerreqs: [], coreqGroup }
}

// Cadena: A -> B -> C -> D  (D depende transitivamente de A)
// Coreq:  C <-> E
const planData: PlanData = {
  A: course('A'),
  B: course('B', ['A']),
  C: course('C', ['B'], ['E']),
  D: course('D', ['C']),
  E: course('E', [], ['C']),
  // Rama sin relación con la cadena anterior, salvo un coreq coincidental entre dos
  // materias que sí pertenecen al set por razones distintas.
  X: course('X'),
  Y: course('Y', ['X']),
}

describe('graphHighlight', () => {
  it('resalta toda la cadena de ancestros transitivos, no solo el directo', () => {
    const index = buildDependentsIndex(planData)
    const { nodeIds, edgeIds } = computeHoverHighlight('C', planData, index)

    expect(nodeIds.has('B')).toBe(true)
    expect(nodeIds.has('A')).toBe(true) // ancestro a 2 niveles
    expect(edgeIds.has(prereqEdgeId('B', 'C'))).toBe(true)
    expect(edgeIds.has(prereqEdgeId('A', 'B'))).toBe(true)
  })

  it('resalta toda la cadena de descendientes transitivos, no solo el directo', () => {
    const index = buildDependentsIndex(planData)
    const { nodeIds, edgeIds } = computeHoverHighlight('B', planData, index)

    expect(nodeIds.has('C')).toBe(true)
    expect(nodeIds.has('D')).toBe(true) // descendiente a 2 niveles
    expect(edgeIds.has(prereqEdgeId('B', 'C'))).toBe(true)
    expect(edgeIds.has(prereqEdgeId('C', 'D'))).toBe(true)
  })

  it('resalta el coreq directo del nodo hovered', () => {
    const index = buildDependentsIndex(planData)
    const { nodeIds, edgeIds } = computeHoverHighlight('C', planData, index)

    expect(nodeIds.has('E')).toBe(true)
    expect(edgeIds.has(coreqEdgeId('C', 'E'))).toBe(true)
  })

  it('no marca un edge coincidental entre dos nodos que están en el set por razones distintas', () => {
    const index = buildDependentsIndex(planData)
    // X y B no tienen ninguna relación directa entre sí; ambos podrían terminar en
    // nodeIds del hover de otro nodo por caminos separados, pero eso no debe generar
    // una arista falsa entre ellos si no existe en el grafo real.
    const { edgeIds } = computeHoverHighlight('B', planData, index)
    expect(edgeIds.has(prereqEdgeId('X', 'B'))).toBe(false)
    expect(edgeIds.has(prereqEdgeId('B', 'X'))).toBe(false)
  })

  it('prereqEdgeId y coreqEdgeId producen ids estables', () => {
    expect(prereqEdgeId('A', 'B')).toBe('A__B')
    expect(coreqEdgeId('C', 'E')).toBe(coreqEdgeId('E', 'C'))
  })
})
