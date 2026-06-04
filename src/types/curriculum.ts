export interface RawCourse {
  semestre: number
  nombre: string
  creditos: number
  prerreqs: string[]
  coreqs: string[]
  estado: 0 | 1
}

export type RawPlan = Record<string, RawCourse>

export interface Course {
  id: string
  nombre: string
  creditos: number
  semestre: number
  prerreqs: string[]
  danglingPrerreqs: string[]
  coreqGroup: string[]
}

export type PlanData = Record<string, Course>

export interface PlanMeta {
  filename: string
  program: string
  letter: string
}

export type ProgramIndex = Record<string, string[]>
