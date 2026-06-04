import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react'
import { useCurriculumStore } from '../../store/curriculumStore'

export default function PrereqEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  source,
}: EdgeProps) {
  const isSourceApproved = useCurriculumStore((s) => s.userState[source]?.aprobada ?? false)

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
        stroke: isSourceApproved ? '#1E5E4B' : '#8CA699',
        strokeWidth: 1.5,
        opacity: 0.7,
      }}
    />
  )
}
