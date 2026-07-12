export interface RawCourse {
  semestre: number
  nombre: string
  creditos: number
  prerreqs: string[]
  /** Claves reales de la(s) materia(s) que deben cursarse simultáneamente (no una
   * bandera genérica) — asignadas por txt_json.py a partir de los marcadores
   * "(A)"/"(B)" del PDF. */
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
  /** Label en Title Case (ej. "Riesgos Financieros") si el plan tiene área de
   * concentración — solo la familia ACT/ECD/ECO/EDF la trae. */
  area?: string
}

export type ProgramIndex = Record<string, string[]>
