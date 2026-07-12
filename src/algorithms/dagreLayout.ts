import type { Node } from '@xyflow/react'

const NODE_WIDTH = 188
const NODE_HEIGHT = 112
export const COLUMN_GAP = 120
const NODE_GAP = 28

export function computeGridLayout(
  nodes: Node[],
  userSemesters: Record<string, number>,
): Node[] {
  const bySemestre: Record<number, Node[]> = {}
  for (const node of nodes) {
    const sem = userSemesters[node.id] ?? 1
    if (!bySemestre[sem]) bySemestre[sem] = []
    bySemestre[sem].push(node)
  }

  for (const group of Object.values(bySemestre)) {
    group.sort((a, b) => a.id.localeCompare(b.id))
  }

  return nodes.map((node) => {
    const sem = userSemesters[node.id] ?? 1
    const group = bySemestre[sem]
    const index = group.findIndex((n) => n.id === node.id)
    return {
      ...node,
      position: {
        x: (sem - 1) * (NODE_WIDTH + COLUMN_GAP),
        y: index * (NODE_HEIGHT + NODE_GAP),
      },
    }
  })
}
