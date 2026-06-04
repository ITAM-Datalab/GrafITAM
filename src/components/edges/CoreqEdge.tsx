import { BaseEdge, getStraightPath, type EdgeProps } from '@xyflow/react'

export default function CoreqEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: '#8CA699',
        strokeWidth: 2,
        strokeDasharray: '6 3',
        opacity: 0.5,
      }}
    />
  )
}
