import { useMemo } from 'react'
import type { EdgeProps } from '@xyflow/react'
import { computeCoreqRails } from './edgeGeometry'

export default function CoreqEdge({ sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const { railA, railB, sleepers } = useMemo(
    () => computeCoreqRails(sourceX, sourceY, targetX, targetY),
    [sourceX, sourceY, targetX, targetY],
  )

  const hoverOpacity = Number(style?.opacity ?? 1)
  const opacity = hoverOpacity * 0.5

  return (
    <g style={{ opacity }}>
      <path d={railA} stroke="#8CA699" strokeWidth={1.5} fill="none" />
      <path d={railB} stroke="#8CA699" strokeWidth={1.5} fill="none" />
      <path d={sleepers} stroke="#8CA699" strokeWidth={1} fill="none" />
    </g>
  )
}
