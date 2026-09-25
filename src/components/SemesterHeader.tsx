import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { NODE_WIDTH } from '../algorithms/dagreLayout'

export const SEMESTER_HEADER_PREFIX = 'sem-header-'

export interface SemesterHeaderData extends Record<string, unknown> {
  semestre: number
  materias: number
  creditos: number
}

function SemesterHeader({ data }: NodeProps) {
  const { semestre, materias, creditos } = data as SemesterHeaderData

  return (
    <div
      className="rounded-lg px-3 py-1.5 text-center shadow-sm select-none pointer-events-none"
      style={{ width: NODE_WIDTH, background: '#0D3B2E', color: '#FCFAF8' }}
    >
      <div className="text-[13px] font-bold tracking-wide">Semestre {semestre}</div>
      <div className="text-[10px] opacity-75">
        {materias} {materias === 1 ? 'materia' : 'materias'} · {creditos} cr.
      </div>
    </div>
  )
}

export default memo(SemesterHeader)