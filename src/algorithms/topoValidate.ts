import type { PlanData } from '../types/curriculum'
import type { UserStateMap, ValidationError } from '../types/store'

export function validateTopology(
  planData: PlanData,
  userState: UserStateMap,
): ValidationError[] {
  const errors: ValidationError[] = []

  for (const [courseId, course] of Object.entries(planData)) {
    const courseSem =
      userState[courseId]?.semestrePlaneado ?? course.semestre

    for (const prereqId of course.prerreqs) {
      const prereqCourse = planData[prereqId]
      if (!prereqCourse) continue
      const prereqSem =
        userState[prereqId]?.semestrePlaneado ?? prereqCourse.semestre

      if (prereqSem >= courseSem) {
        errors.push({ courseId, prereqId })
      }
    }
  }

  return errors
}
