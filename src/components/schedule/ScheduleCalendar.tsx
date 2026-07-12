import type { ScheduleGroup } from '../../types/schedule'
import { parseDias, parseHorario, groupsOverlap } from '../../algorithms/scheduleOverlap'
import { layoutDayBlocks } from '../../algorithms/calendarLayout'
import { getCourseColor } from './coursePalette'

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA']
const START_HOUR = 7
const END_HOUR = 22
const PX_PER_MIN = 1
const HOUR_LINE = 'rgba(13, 59, 46, 0.14)'

interface Props {
  groups: ScheduleGroup[]
  orderedCourseIds: string[]
  courseNames: Record<string, string>
}

export default function ScheduleCalendar({ groups, orderedCourseIds, courseNames }: Props) {
  const totalMinutes = (END_HOUR - START_HOUR) * 60

  const blocks = groups.flatMap((group) => {
    const dias = parseDias(group.dias)
    const { inicio, fin } = parseHorario(group.horario)
    const hasConflict = groups.some((other) => other !== group && groupsOverlap(other, group))
    return dias.map((dia) => ({ group, dia, inicio, fin, hasConflict }))
  })

  return (
    <div className="p-4 overflow-x-auto">
      <div
        className="grid rounded overflow-hidden bg-base-cream"
        style={{ gridTemplateColumns: `50px repeat(${DIAS.length}, 1fr)`, minWidth: 560 }}
      >
        <div className="border-b-2 border-itam-dark/25" />
        {DIAS.map((d) => (
          <div
            key={d}
            className="text-center text-xs font-bold text-itam-dark py-2 border-b-2 border-itam-dark/25 border-l border-itam-dark/25"
          >
            {d}
          </div>
        ))}

        <div style={{ position: 'relative', height: totalMinutes * PX_PER_MIN }}>
          {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i).map((hour) => (
            <div
              key={hour}
              className="text-[10px] font-semibold text-itam-dark absolute right-1"
              style={{ top: (hour - START_HOUR) * 60 * PX_PER_MIN - 6 }}
            >
              {hour}:00
            </div>
          ))}
        </div>

        {DIAS.map((dia) => {
          const dayBlocks = blocks.filter((b) => b.dia === dia)
          const layout = layoutDayBlocks(dayBlocks, (b) => ({ inicio: b.inicio, fin: b.fin }))

          return (
            <div
              key={dia}
              className="relative border-l border-itam-dark/25"
              style={{
                height: totalMinutes * PX_PER_MIN,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent ${60 * PX_PER_MIN - 1}px, ${HOUR_LINE} ${60 * PX_PER_MIN - 1}px, ${HOUR_LINE} ${60 * PX_PER_MIN}px)`,
              }}
            >
              {layout.map(({ item: b, left, width }, i) => {
                const color = getCourseColor(b.group.courseId, orderedCourseIds)
                const nombre = courseNames[b.group.courseId] ?? b.group.nombre
                const fullLabel = `${b.group.courseId} ${nombre} · ${b.group.salon} · ${b.group.profesor} · ${b.group.horario}`

                return (
                  <div
                    key={`${b.group.crn}-${dia}-${i}`}
                    title={fullLabel}
                    className="absolute rounded text-[10px] px-1 py-0.5 overflow-hidden leading-tight"
                    style={{
                      top: (b.inicio - START_HOUR * 60) * PX_PER_MIN,
                      height: Math.max((b.fin - b.inicio) * PX_PER_MIN, 26),
                      left: `calc(${left * 100}% + 1px)`,
                      width: `calc(${width * 100}% - 2px)`,
                      background: color.bg,
                      color: color.text,
                      border: b.hasConflict ? '2px dashed #8C5E58' : 'none',
                    }}
                  >
                    <div className="font-semibold leading-tight">
                      {b.group.courseId} {nombre}
                    </div>
                    <div className="opacity-80 leading-tight">{b.group.salon}</div>
                    <div className="opacity-80 leading-tight">
                      {b.group.profesor} · {b.group.horario}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
