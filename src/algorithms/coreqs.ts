/** `coreqs` en el JSON fuente ya trae las claves reales de la(s) materia(s) pareja
 * (asignadas por txt_json.py) — esto solo descarta referencias a materias que no
 * existen en el plan, mismo patrón que `presentPrerreqs`/`danglingPrerreqs` en
 * `loader.ts`. */
export function resolveCoreqGroup(coreqs: string[], allIds: Set<string>): string[] {
  return coreqs.filter((id) => allIds.has(id))
}
