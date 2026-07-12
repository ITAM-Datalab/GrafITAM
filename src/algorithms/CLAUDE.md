# Algoritmos (`src/algorithms/`)

Módulos independientes, todos puros (reciben estado y retornan estado nuevo, sin efectos secundarios). Los primeros seis operan sobre `src/types/curriculum.ts`/`src/types/store.ts` (dominio del plan de estudios); `scheduleOverlap.ts`/`scheduleAssign.ts` operan sobre `src/types/schedule.ts` (dominio de horarios).

## `coreqs.ts`

```ts
resolveCoreqGroup(coreqs: string[], allIds: Set<string>): string[]
```

`coreqs` en el JSON fuente ya trae las claves reales de la(s) materia(s) pareja (asignadas por `txt_json.py`, no una bandera genérica — ver `src/data/CLAUDE.md`). Esta función solo descarta referencias a materias que no existen en el plan, mismo patrón que `presentPrerreqs`/`danglingPrerreqs` en `loader.ts`.

Invocado por materia dentro de `loadPlanData`, junto al filtrado de `prerreqs`.

## `dfsApprove.ts`

```ts
approveWithAncestors(courseId: string, planData: PlanData, userState: UserStateMap): UserStateMap
```

DFS iterativo hacia atrás (siguiendo `prerreqs`). Marca `aprobada: true` en `courseId` y en todos sus ancestros transitivos. Retorna un nuevo `UserStateMap` (inmutable — spread en cada entrada modificada).

Usado en `toggleApproval` (camino de aprobar) y en `togglePlanned` (auto-aprobar prerreqs).

## `unapproveDescendants.ts`

```ts
unapproveDescendants(courseId: string, planData: PlanData, userState: UserStateMap): UserStateMap
```

DFS iterativo hacia adelante (siguiendo quién tiene a `courseId` como prerreq). Marca `aprobada: false` en `courseId` y todos sus descendientes transitivos. Retorna nuevo `UserStateMap`.

Usado en `toggleApproval` (camino de desaprobar) y en `togglePlanned` cuando el nodo estaba previamente aprobado.

## `topoValidate.ts`

```ts
validateTopology(planData: PlanData, userState: UserStateMap): ValidationError[]
```

O(V + E). Ignora materias ya `aprobada` (y prerreqs ya `aprobada`) — solo compara pares curso/prereq donde ambos siguen pendientes. Para cada materia pendiente, verifica que su `semestrePlaneado` sea estrictamente mayor al `semestrePlaneado` de cada prerrequisito pendiente. Si no, emite un `ValidationError { courseId, prereqId }`.

Llamado al final de `togglePlanned` y `setPlannedSemester`. Los errores se visualizan con `ErrorEdge` en el grafo.

## `enforceInvariant.ts`

```ts
clearPlannedWhereApproved(userState: UserStateMap): UserStateMap
```

Barre todo `userState` y pone `planeada: false` donde `aprobada: true`. Fuente única del invariante "aprobada XOR planeada" — usado en `toggleApproval` (limpia ancestros auto-aprobados por `approveWithAncestors`) y en `togglePlanned` (limpia lo recién auto-aprobado antes de marcar `planeada`).

## `dagreLayout.ts`

```ts
computeGridLayout(nodes: Node[], userSemesters: Record<string, number>): Node[]
```

Grid manual — **no usa dagre en runtime** (el nombre es legado). Columnas = semestres (paso horizontal `NODE_WIDTH(188) + COLUMN_GAP(120) = 308 px`), filas = índice dentro del semestre en orden de aparición (paso vertical `NODE_HEIGHT(112) + NODE_GAP(28) = 140 px`). Retorna los mismos nodos con `position: { x, y }` calculado.

`userSemesters` ya incluye `semestrePlaneado` del usuario, así que el nodo se mueve de columna si fue replanificado.

## `scheduleOverlap.ts`

```ts
parseHorario(horario: string): { inicio: number; fin: number }   // "09:00-10:30" -> minutos desde medianoche
parseDias(dias: string): string[]                                 // "LU MI VI" -> ["LU","MI","VI"]
groupsOverlap(a: ScheduleGroup, b: ScheduleGroup): boolean
```

`groupsOverlap` es true si comparten al menos un día Y sus rangos de horas se cruzan (`aInicio < bFin && bInicio < aFin` — un grupo que termina justo cuando otro empieza NO es traslape).

## `scheduleAssign.ts`

```ts
autoAssignSchedule(groupsByCourse: ScheduleData): SelectedGroups
```

Backtracking con poda: por cada materia prueba cada uno de sus grupos (o la deja fuera), maximizando el número de materias con grupo asignado sin traslapes entre sí. Complejidad exponencial en el peor caso (`~productoria(grupos_i + 1)`), pero trivial para cargas reales de semestre (≤10 materias, pocos grupos c/u). Si hay empate en el máximo de materias asignadas, se queda con la primera combinación encontrada — no hay criterio de desempate adicional (ej. no prioriza cierto profesor u horario).

> ⚠️ Esta función espera recibir **solo** las materias que realmente se van a agendar. `scheduleStore.autoAssign(courseIds)` filtra `groupsByCourse` a `courseIds` (las `plannedCourseIds` del curriculum) antes de llamarla — si se le pasa el `groupsByCourse` completo (todo el periodo scrapeado, ~500 materias) el backtracking se congela.

## `calendarLayout.ts`

```ts
layoutDayBlocks<T>(items: T[], getRange: (item: T) => { inicio: number; fin: number }): Array<{ item: T; left: number; width: number }>
```

Empaquetado de bloques en columnas dentro de un mismo día, estilo Google Calendar: agrupa los items en clusters de traslape mutuo transitivo (sweep ordenado por `inicio`; un item empieza cluster nuevo si `inicio >= clusterEnd` — mismo criterio de "no traslape" que `groupsOverlap`), y dentro de cada cluster asigna columnas por greedy (primera columna cuyo último `fin` sea `<= inicio` del nuevo item). `left`/`width` se regresan como fracción 0-1 del ancho total (`1/numColumnas` del cluster). No implementa el refinamiento de "expandir a espacio libre" (un evento largo con uno corto adentro no recupera ancho fuera de la ventana compartida) — decisión deliberada de alcance, no una limitación técnica.
