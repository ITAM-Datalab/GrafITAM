import { useMemo } from 'react'
import { BaseEdge, type EdgeProps } from '@xyflow/react'
import { useCurriculumStore } from '../../store/curriculumStore'
import { COLUMN_GAP } from '../../algorithms/dagreLayout'
import { computeLengthOpacity, computePrereqEdgeGeometry, STATION_RADIUS } from './edgeGeometry'

export default function PrereqEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  source,
  style,
}: EdgeProps) {
  const isSourceApproved = useCurriculumStore((s) => s.userState[source]?.aprobada ?? false)
  const creditosOrigen = useCurriculumStore((s) => s.planData?.[source]?.creditos ?? 0)

  const geometry = useMemo(
    () => computePrereqEdgeGeometry(sourceX, sourceY, targetX, targetY, creditosOrigen, COLUMN_GAP),
    [sourceX, sourceY, targetX, targetY, creditosOrigen],
  )

  const color = isSourceApproved ? '#1E5E4B' : '#8CA699'
  const hoverOpacity = Number(style?.opacity ?? 1)
  const opacity = hoverOpacity * computeLengthOpacity(geometry.length)

  return (
    <>
      <BaseEdge
        path={geometry.path}
        markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: 1.5, opacity }}
      />
      <circle cx={geometry.stationX} cy={geometry.stationY} r={STATION_RADIUS} fill={color} opacity={opacity} />
      {geometry.ticks.map((tick, i) => (
        <line
          key={i}
          x1={tick.x}
          y1={tick.y1}
          x2={tick.x}
          y2={tick.y2}
          stroke={color}
          strokeWidth={1.5}
          opacity={opacity}
        />
      ))}
    </>
  )
}
