# Componentes (`src/components/`)

## `CourseNode.tsx`

Nodo del grafo. Recibe `data.course: Course` vía ReactFlow y suscribe al store para leer `userState` y `validationErrors`.

### Estados visuales (prioridad de arriba a abajo)

| Estado | Fondo | Borde | Color texto |
|--------|-------|-------|-------------|
| Error topológico | #FCFAF8 | 2px dashed #8C5E58 | #8C5E58 |
| Aprobada | #1E5E4B | none | #FCFAF8 |
| Planeada | #FCFAF8 | 2px solid #8C5E58 | #8C5E58 |
| Normal | #FCFAF8 | 1px solid #8CA699 | #0D3B2E |

El error se activa cuando `validationErrors` contiene una entrada con `courseId === course.id`. No coexiste con aprobada ni planeada porque `validateTopology` solo evalúa materias no aprobadas.

### Layout del nodo

- Ancho fijo: 188 px
- Fila 1: código (`font-mono`, 9 px, `opacity-50`)
- Fila 2: nombre (11 px, `font-semibold`)
- Fila 3: créditos + semestre planeado (10 px, `opacity-50`)
- Fila 4: botones `[✓ Aprobada]` `[→ Planeada]`

Semestre mostrado: `semestrePlaneado ?? course.semestre` — refleja replanificación del usuario.

## `FlowCanvas.tsx`

Wrapper de `<ReactFlow>`. Todo el cálculo de nodes/edges ocurre en `useMemo` para evitar re-renders.

- **Nodes**: uno por cada `Course` en `planData`.
- **Edges**: `prereqEdge` por cada `(prereqId → courseId)` presente; `coreqEdge` por cada par de `coreqGroup` (solo renderiza `id < partnerId` para evitar duplicados); `errorEdge` cuando la clave `prereqId__courseId` está en `errorSet`.
- **Layout**: `computeGridLayout(rawNodes, userSemesters)` — recalcula posiciones cuando cambia `planData` o `userState`.
- **Panel de créditos**: `<Panel position="top-center">` — muestra `aprobados / total (%)`. Se calcula en `useMemo` sobre `planData` y `userState`.
- `nodesDraggable={false}`: posiciones fijas por columna de semestre.
- `fitView` con `padding: 0.15` al montar.

## `PlanSelector.tsx`

Dos `<select>` encadenados. El primero lista programas (keys de `programIndex`); el segundo lista letras disponibles para ese programa. Al seleccionar llama `loadPlan("PROG-LETRA-plan-estudios.json")`. Botón "Reiniciar" llama `resetPlan()`.

## `edges/PrereqEdge.tsx`

Bézier suave. Color del stroke: verde (`#1E5E4B`) si el nodo source tiene `aprobada: true`, gris (`#8CA699`) si no. `strokeWidth: 1.5`, `opacity: 0.7`. Dibuja la flecha estándar de ReactFlow en el target.

## `edges/CoreqEdge.tsx`

Línea recta (sin curva). `stroke: #8CA699`, `strokeWidth: 2`, `strokeDasharray: "6 3"`, `opacity: 0.5`. Representa que dos materias deben cursarse simultáneamente.

## `edges/ErrorEdge.tsx`

Bézier. `stroke: #8C5E58`, `strokeWidth: 2.5`, `strokeDasharray: "8 4"`, `opacity: 0.9`. Indica que la materia target está planeada en un semestre inválido respecto a este prerrequisito.
