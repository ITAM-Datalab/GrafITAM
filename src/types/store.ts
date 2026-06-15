import type { PlanData, ProgramIndex } from './curriculum'

export interface CourseUserState {
  aprobada: boolean
  planeada: boolean
  semestrePlaneado: number
}

export type UserStateMap = Record<string, CourseUserState>

export interface ValidationError {
  courseId: string
  prereqId: string
}

export interface CurriculumState {
  activePlan: string | null
  planData: PlanData | null
  programIndex: ProgramIndex
  userState: UserStateMap
  validationErrors: ValidationError[]

  showAvailable: boolean

  loadPlan: (filename: string, existingUserState?: UserStateMap) => void
  toggleApproval: (courseId: string) => void
  togglePlanned: (courseId: string) => void
  setPlannedSemester: (courseId: string, sem: number) => void
  resetPlan: () => void
  toggleShowAvailable: () => void
}
