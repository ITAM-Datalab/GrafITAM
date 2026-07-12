import { memo, type CSSProperties } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { Course } from '../types/curriculum'
import { useCurriculumStore } from '../store/curriculumStore'

export interface CourseNodeData extends Record<string, unknown> {
  course: Course
}

function CourseNode({ data }: NodeProps) {
  const course = (data as CourseNodeData).course
  const userState = useCurriculumStore((s) => s.userState[course.id])
  const toggleApproval = useCurriculumStore((s) => s.toggleApproval)
  const togglePlanned = useCurriculumStore((s) => s.togglePlanned)
  const hasError = useCurriculumStore((s) => s.validationErrors.some((e) => e.courseId === course.id))
  const showAvailable = useCurriculumStore((s) => s.showAvailable)
  const allPrereqsApproved = useCurriculumStore((s) =>
    course.prerreqs.every((id) => s.userState[id]?.aprobada ?? false),
  )

  const isApproved = userState?.aprobada ?? false
  const isPlanned = userState?.planeada ?? false
  const plannedSem = userState?.semestrePlaneado ?? course.semestre
  const isAvailable = showAvailable && !isApproved && !isPlanned && allPrereqsApproved

  const stateStyles: CSSProperties = hasError
    ? { background: '#FCFAF8', border: '2px dashed #8C5E58', color: '#8C5E58' }
    : isApproved
      ? { background: '#1E5E4B', border: 'none', color: '#FCFAF8' }
      : isPlanned
        ? { background: '#FCFAF8', border: '2px solid #8C5E58', color: '#8C5E58' }
        : isAvailable
          ? { background: '#FCFAF8', border: '2px solid #22C55E', color: '#15803D' }
          : { background: '#FCFAF8', border: '1px solid #8CA699', color: '#0D3B2E' }

  return (
    <div
      className="rounded-lg px-3 py-2 select-none text-xs font-medium"
      style={{ width: 188, ...stateStyles }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'transparent', border: 'none' }} />

      <div className="font-mono text-[10px] md:text-[9px] opacity-50 tracking-wide mb-0.5">{course.id}</div>
      <div className="leading-tight text-[13px] md:text-[11px] font-semibold">{course.nombre}</div>
      <div className="mt-1.5 flex justify-between opacity-50 text-[11px] md:text-[10px]">
        <span>{course.creditos} cr.</span>
        <span>Sem {plannedSem}</span>
      </div>

      <div
        className="mt-2 flex gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => toggleApproval(course.id)}
          className="flex-1 rounded text-[11px] md:text-[9px] py-1 md:py-0.5"
          style={{
            background: isApproved ? '#1E5E4B' : 'transparent',
            color: isApproved ? '#FCFAF8' : '#8CA699',
            border: `1px solid ${isApproved ? '#1E5E4B' : '#8CA699'}`,
            cursor: 'pointer',
          }}
        >
          ✓ Aprobada
        </button>
        <button
          onClick={() => togglePlanned(course.id)}
          className="flex-1 rounded text-[11px] md:text-[9px] py-1 md:py-0.5"
          style={{
            background: isPlanned ? '#8C5E58' : 'transparent',
            color: isPlanned ? '#FCFAF8' : '#8CA699',
            border: `1px solid ${isPlanned ? '#8C5E58' : '#8CA699'}`,
            cursor: 'pointer',
          }}
        >
          → Planeada
        </button>
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'transparent', border: 'none' }} />
    </div>
  )
}

export default memo(CourseNode)
