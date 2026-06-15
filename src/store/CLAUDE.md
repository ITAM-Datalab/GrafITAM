# Store (`src/store/`)

Un solo store Zustand con `persist` middleware. Clave de LocalStorage: `grafitam-state`.

## Tipos (`src/types/`)

### `curriculum.ts`

```ts
RawCourse   // Estructura del JSON fuente (semestre, nombre, creditos, prerreqs, coreqs, estado)
RawPlan     // Record<string, RawCourse>
Course      // Materia enriquecida por el loader (agrega id, danglingPrerreqs, coreqGroup)
PlanData    // Record<string, Course>
PlanMeta    // { filename, program, letter } — metadato de un plan
ProgramIndex // Record<string, string[]> — programa → lista de letras disponibles
```

### `store.ts`

```ts
CourseUserState  // { aprobada, planeada, semestrePlaneado }
UserStateMap     // Record<string, CourseUserState>
ValidationError  // { courseId, prereqId }
CurriculumState  // Estado completo + acciones del store
```

## Persistencia

| Campo | Persiste | Motivo |
|-------|----------|--------|
| `activePlan` | Sí | Filename del plan seleccionado |
| `userState` | Sí | Aprobaciones y semestres planeados por materia |
| `planData` | No | Re-derivado de `activePlan` al hidratar |
| `validationErrors` | No | Recalculado en cada mutación |

Al hidratar desde LocalStorage, el middleware llama `loadPlan(activePlan)` para re-derivar `planData`.

## Acciones

### `loadPlan(filename)`

Carga el JSON con `loadPlanData(filename)`, resetea `userState` a `{}`, calcula `validationErrors` (siempre `[]` con estado vacío). Actualiza `activePlan`.

### `toggleApproval(courseId)`

- Si ya aprobada → `unapproveDescendants(courseId, ...)` (desaprueba el nodo y sus dependientes).
- Si no aprobada → `approveWithAncestors(courseId, ...)` (aprueba el nodo y sus prerreqs transitivos).
- En ambos casos limpia `planeada: false` en los nodos que cambiaron a `aprobada: true`.

### `togglePlanned(courseId)`

- Si ya planeada → quita el flag.
- Si no planeada:
  1. Si estaba aprobada → `unapproveDescendants` para limpiar primero.
  2. `approveWithAncestors` en cada prerreq directo.
  3. Limpia `planeada` de cualquier nodo que pasó a `aprobada`.
  4. Pone `planeada: true, aprobada: false` en `courseId`.
  5. Pone `planeada: true` en todos los `coreqGroup` partners.
  6. Llama `validateTopology` y actualiza `validationErrors`.

### `setPlannedSemester(courseId, sem)`

Actualiza `semestrePlaneado` en `userState[courseId]` y llama `validateTopology`.

### `resetPlan()`

Limpia `userState`, recarga `planData` del mismo `activePlan`.

## Invariante principal

Una materia **nunca** tiene `aprobada: true` y `planeada: true` al mismo tiempo. Ambas acciones (`toggleApproval`, `togglePlanned`) limpian el flag contrario explícitamente antes de establecer el propio.
