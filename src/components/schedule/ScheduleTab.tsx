import { useMemo, useState } from 'react'
import { useCurriculumStore } from '../../store/curriculumStore'
import { useScheduleStore } from '../../store/scheduleStore'
import { groupsOverlap } from '../../algorithms/scheduleOverlap'
import { horarioPeriodos } from '../../data/horariosLoader'
import { getCourseColor } from './coursePalette'
import type { ScheduleGroup } from '../../types/schedule'
import ScheduleCalendar from './ScheduleCalendar'
import ScheduleOptionsBar from './ScheduleOptionsBar'
import MateriaSearchBar from './MateriaSearchBar'

export default function ScheduleTab() {
  const planData = useCurriculumStore((s) => s.planData)
  const userState = useCurriculumStore((s) => s.userState)

  const selectedPeriodo = useScheduleStore((s) => s.selectedPeriodo)
  const groupsByCourse = useScheduleStore((s) => s.groupsByCourse)
  const selectedGroups = useScheduleStore((s) => s.selectedGroups)
  const schedulesByPeriodo = useScheduleStore((s) => s.schedulesByPeriodo)
  const manualCourseIdsByPeriodo = useScheduleStore((s) => s.manualCourseIdsByPeriodo)
  const setPeriodo = useScheduleStore((s) => s.setPeriodo)
  const selectGroup = useScheduleStore((s) => s.selectGroup)
  const clearGroup = useScheduleStore((s) => s.clearGroup)
  const removeManualCourse = useScheduleStore((s) => s.removeManualCourse)
  const autoAssign = useScheduleStore((s) => s.autoAssign)
  const [downloading, setDownloading] = useState(false)

  const plannedCourseIds = useMemo(() => {
    if (!planData) return []
    return Object.keys(planData).filter((id) => userState[id]?.planeada)
  }, [planData, userState])

  const manualCourseIds = selectedPeriodo ? (manualCourseIdsByPeriodo[selectedPeriodo] ?? []) : []

  const allTrackedCourseIds = useMemo(
    () => [...plannedCourseIds, ...manualCourseIds],
    [plannedCourseIds, manualCourseIds],
  )

  const courseNames = useMemo(() => {
    const names: Record<string, string> = {}
    for (const id of allTrackedCourseIds) {
      names[id] = planData?.[id]?.nombre ?? groupsByCourse[id]?.[0]?.nombre ?? id
    }
    return names
  }, [planData, allTrackedCourseIds, groupsByCourse])

  const selectedGroupObjects: ScheduleGroup[] = useMemo(() => {
    return Object.entries(selectedGroups)
      .map(([courseId, crn]) => groupsByCourse[courseId]?.find((g) => g.crn === crn))
      .filter((g): g is ScheduleGroup => Boolean(g))
  }, [selectedGroups, groupsByCourse])

  const handleDownload = async () => {
    if (!selectedPeriodo) return
    const schedules = schedulesByPeriodo[selectedPeriodo] ?? []
    if (schedules.length === 0) return
    setDownloading(true)
    try {
      const { downloadScheduleWorkbook } = await import('./scheduleExport')
      await downloadScheduleWorkbook(
        schedules,
        groupsByCourse,
        courseNames,
        allTrackedCourseIds,
        selectedPeriodo,
      )
    } finally {
      setDownloading(false)
    }
  }

  if (!planData) {
    return (
      <div className="flex items-center justify-center h-full opacity-40 text-itam-dark text-sm">
        Selecciona un plan de estudios primero.
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden">
      <div className="w-full md:w-[420px] md:flex-shrink-0 overflow-visible md:overflow-y-auto border-b md:border-b-0 md:border-r border-itam-muted/40 bg-base-bone p-4">
        {horarioPeriodos.length > 1 && (
          <div className="mb-3">
            <label className="block text-xs font-semibold mb-1 text-itam-dark">Periodo</label>
            <select
              value={selectedPeriodo ?? ''}
              onChange={(e) => setPeriodo(e.target.value)}
              className="w-full text-xs border border-itam-muted/50 rounded p-2"
            >
              {horarioPeriodos.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <ScheduleOptionsBar />

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full mb-2 text-xs font-semibold rounded px-3 py-2 border disabled:opacity-50"
          style={{ borderColor: '#1E5E4B', color: '#1E5E4B' }}
        >
          {downloading ? 'Generando...' : 'Descargar horario (Excel)'}
        </button>

        <button
          onClick={() => autoAssign(allTrackedCourseIds)}
          className="w-full mb-2 text-sm font-semibold rounded px-3 py-2"
          style={{ background: '#1E5E4B', color: '#FCFAF8' }}
        >
          Auto-asignar horario sin traslapes
        </button>

        <MateriaSearchBar trackedCourseIds={allTrackedCourseIds} />

        {allTrackedCourseIds.length === 0 && (
          <p className="text-sm opacity-50 text-itam-dark">
            No tienes materias marcadas como "Planeada" ni agregadas por búsqueda. Márcalas en la pestaña de
            Plan de Estudios, o búscalas arriba (útil para optativas).
          </p>
        )}

        {allTrackedCourseIds.map((courseId) => {
          const course = planData?.[courseId]
          const groups = groupsByCourse[courseId] ?? []
          const selectedCrn = selectedGroups[courseId]
          const color = getCourseColor(courseId, allTrackedCourseIds)
          const isManual = manualCourseIds.includes(courseId)

          return (
            <div key={courseId} className="mb-4 pb-4 border-b border-itam-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: color.bg }}
                  aria-hidden
                />
                <div className="flex-1">
                  <div className="text-xs font-mono opacity-50">{courseId}</div>
                  <div className="text-sm font-semibold text-itam-dark">{courseNames[courseId]}</div>
                  {course && course.coreqGroup.length > 0 && (
                    <div className="text-[10px] mt-0.5" style={{ color: '#8C5E58' }}>
                      ⚭ Correquisito — llevar junto con{' '}
                      {course.coreqGroup.map((id) => planData?.[id]?.nombre ?? id).join(', ')}
                    </div>
                  )}
                  {isManual && (
                    <div className="text-[10px] mt-0.5 opacity-60 text-itam-dark">
                      Agregada por búsqueda (no está en el plan de estudios)
                    </div>
                  )}
                </div>
                {isManual && (
                  <button
                    onClick={() => removeManualCourse(courseId)}
                    title="Quitar"
                    className="text-xs opacity-60 hover:opacity-100 px-1"
                  >
                    ×
                  </button>
                )}
              </div>

              {groups.length === 0 ? (
                <p className="text-xs opacity-50 text-itam-dark">
                  Sin grupos programados para este periodo — usa el botón de arriba si crees que falta.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {groups.map((group) => {
                    const isSelected = selectedCrn === group.crn
                    const hasConflict = selectedGroupObjects.some(
                      (g) => g.courseId !== courseId && groupsOverlap(g, group),
                    )

                    return (
                      <label
                        key={group.crn}
                        className="flex items-start gap-2 text-xs rounded px-2 py-1.5 cursor-pointer"
                        style={{
                          border: hasConflict
                            ? '2px dashed #8C5E58'
                            : isSelected
                              ? `1px solid ${color.bg}`
                              : '1px solid #8CA699',
                          background: isSelected ? color.bg : 'transparent',
                          color: isSelected ? color.text : hasConflict ? '#8C5E58' : '#0D3B2E',
                        }}
                      >
                        <input
                          type="radio"
                          name={`group-${courseId}`}
                          checked={isSelected}
                          onClick={() =>
                            isSelected ? clearGroup(courseId) : selectGroup(courseId, group.crn)
                          }
                          onChange={() => {}}
                          className="mt-0.5"
                        />
                        <span>
                          Grupo {group.grupo} · CRN {group.crn} · {group.horario} {group.dias}
                          <br />
                          <span className="opacity-70">{group.profesor} · {group.salon}</span>
                          {hasConflict && (
                            <>
                              <br />
                              <strong>Traslapa con tu selección actual</strong>
                            </>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex-1 overflow-visible md:overflow-auto">
        <ScheduleCalendar
          groups={selectedGroupObjects}
          orderedCourseIds={allTrackedCourseIds}
          courseNames={courseNames}
        />
      </div>
    </div>
  )
}
