# Algoritmos (`src/algorithms/`)

Cinco módulos independientes. Todos operan sobre los tipos de `src/types/curriculum.ts` y `src/types/store.ts`. Ninguno tiene efectos secundarios — reciben estado y retornan estado nuevo.

## `coreqs.ts`

```ts
detectCoreqGroups(raw: RawPlan): Record<string, string[]>
```

Agrupa materias que (1) están en el mismo semestre y (2) tienen `coreqs: ["CORREQ"]`. Retorna un mapa `id → [ids de compañeros]`. Solo grupos de tamaño ≥ 2 se incluyen; singletons producen `coreqGroup: []` en el loader.

Invocado en `loadPlanData` antes de construir `PlanData`.

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

O(V + E). Para cada materia no aprobada, verifica que su `semestrePlaneado` sea estrictamente mayor al `semestrePlaneado` de cada prerrequisito no aprobado. Si no, emite un `ValidationError { courseId, prereqId }`.

Llamado al final de `togglePlanned` y `setPlannedSemester`. Los errores se visualizan con `ErrorEdge` en el grafo.

## `dagreLayout.ts`

```ts
computeGridLayout(nodes: Node[], userSemesters: Record<string, number>): Node[]
```

Grid manual — **no usa dagre en runtime** (el nombre es legado). Columnas = semestres (paso horizontal 240 px), filas = índice dentro del semestre en orden de aparición (paso vertical 220 px). Retorna los mismos nodos con `position: { x, y }` calculado.

`userSemesters` ya incluye `semestrePlaneado` del usuario, así que el nodo se mueve de columna si fue replanificado.
