import type { ScheduleData, ScheduleGroup, SelectedGroups } from '../types/schedule'
import { groupByCrn, groupsOverlap } from './scheduleOverlap'

export function autoAssignSchedule(groupsByCourse: ScheduleData): SelectedGroups {
  const courseIds = Object.keys(groupsByCourse)
  let best: SelectedGroups = {}
  let bestCount = 0

  function backtrack(index: number, current: SelectedGroups, currentCount: number, selected: ScheduleGroup[]) {
    if (currentCount > bestCount) {
      best = { ...current }
      bestCount = currentCount
    }
    if (index >= courseIds.length) return
    if (currentCount + (courseIds.length - index) <= bestCount) return

    const courseId = courseIds[index]
    const groups = groupsByCourse[courseId] ?? []

    // Un CRN puede traer varias sesiones (ej. LU MI + JU): se revisan todas.
    for (const [crn, rows] of groupByCrn(groups)) {
      const fits = rows.every((row) => selected.every((g) => !groupsOverlap(g, row)))
      if (fits) {
        current[courseId] = crn
        selected.push(...rows)
        backtrack(index + 1, current, currentCount + 1, selected)
        selected.splice(selected.length - rows.length, rows.length)
        delete current[courseId]
      }
    }

    backtrack(index + 1, current, currentCount, selected)
  }

  backtrack(0, {}, 0, [])
  return best
}
