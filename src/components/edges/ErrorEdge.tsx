import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'

export default function ErrorEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: '#8C5E58',
        strokeWidth: 2.5,
        strokeDasharray: '8 4',
        opacity: 0.9,
      }}
    />
  )
}
