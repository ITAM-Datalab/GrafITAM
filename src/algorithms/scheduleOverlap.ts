import type { ScheduleGroup } from '../types/schedule'

export function parseHorario(horario: string): { inicio: number; fin: number } {
  const match = horario.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  if (!match) return { inicio: 0, fin: 0 }
  const [, h1, m1, h2, m2] = match
  return {
    inicio: Number(h1) * 60 + Number(m1),
    fin: Number(h2) * 60 + Number(m2),
  }
}

export function parseDias(dias: string): string[] {
  return dias.trim().split(/\s+/).filter(Boolean)
}

export function groupsOverlap(a: ScheduleGroup, b: ScheduleGroup): boolean {
  const diasA = parseDias(a.dias)
  const diasB = parseDias(b.dias)
  if (!diasA.some((d) => diasB.includes(d))) return false

  const rangoA = parseHorario(a.horario)
  const rangoB = parseHorario(b.horario)
  return rangoA.inicio < rangoB.fin && rangoB.inicio < rangoA.fin
}

// Un mismo CRN puede traer varias filas (ej. teoría + laboratorio, mismo grupo,
// distinto día/horario) -- agrupar por CRN para tratarlas como una sola unidad.
// Usa Map en vez de un objeto plano: los CRN son strings numéricos, y las claves
// integer-like de un objeto JS se reordenan ascendente al iterar, alterando en
// silencio tanto el orden de las opciones en el sidebar como el orden de
// candidatos que prueba el backtracking de autoAssignSchedule.
export function groupByCrn(groups: ScheduleGroup[]): Map<string, ScheduleGroup[]> {
  const map = new Map<string, ScheduleGroup[]>()
  for (const g of groups) {
    const list = map.get(g.crn)
    if (list) list.push(g)
    else map.set(g.crn, [g])
  }
  return map
}

export interface CrnSession {
  horario: string
  dias: string
  salon: string
  profesores: string[]
}

// Dentro de las filas de UN SOLO CRN (ej. el value de groupByCrn), sub-agrupa por
// (horario, dias) -- teoría y laboratorio quedan en sesiones separadas (distinto
// horario/día), pero varias filas que ITACA repite solo porque cambia el profesor
// (team-teaching) colapsan en una sola sesión con todos los profesores unidos.
export function groupSessions(rows: ScheduleGroup[]): CrnSession[] {
  const map = new Map<string, CrnSession>()
  for (const row of rows) {
    const key = `${row.horario}__${row.dias}`
    let session = map.get(key)
    if (!session) {
      session = { horario: row.horario, dias: row.dias, salon: row.salon, profesores: [] }
      map.set(key, session)
    }
    if (!session.profesores.includes(row.profesor)) session.profesores.push(row.profesor)
  }
  return Array.from(map.values())
}
