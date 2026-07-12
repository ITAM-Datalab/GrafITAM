# Componentes (`src/components/`)

## `CourseNode.tsx`

Nodo del grafo. Recibe `data.course: Course` vía ReactFlow y suscribe al store para leer `userState` y `validationErrors`.

### Estados visuales (prioridad de arriba a abajo)

| Estado | Fondo | Borde | Color texto |
|--------|-------|-------|-------------|
| Error topológico | #FCFAF8 | 2px dashed #8C5E58 | #8C5E58 |
| Aprobada | #1E5E4B | none | #FCFAF8 |
| Planeada | #FCFAF8 | 2px solid #8C5E58 | #8C5E58 |
| Disponible | #FCFAF8 | 2px solid #22C55E | #15803D |
| Normal | #FCFAF8 | 1px solid #8CA699 | #0D3B2E |

El error se activa cuando `validationErrors` contiene una entrada con `courseId === course.id`. "Disponible" se activa cuando `showAvailable` (store) está prendido, la materia no está aprobada ni planeada, y todos sus prerreqs están aprobados.

> ⚠️ Nota: `validateTopology` no filtra por `aprobada` en el código real (ver `src/algorithms/CLAUDE.md`), así que en teoría el error topológico podría coexistir con "aprobada" — esta tabla asume prioridad de renderizado, no exclusión garantizada por los datos.

### Layout del nodo

- Ancho fijo: 188 px (mismo en cualquier viewport — lo que cambia con el tamaño de pantalla es el zoom de `fitView` en `FlowCanvas.tsx`, no el nodo)
- Fila 1: código (`font-mono`, 9 px desktop / 10 px por debajo de `md:`, `opacity-50`)
- Fila 2: nombre (11 px desktop / 13 px por debajo de `md:`, `font-semibold`)
- Fila 3: créditos + semestre planeado (10 px desktop / 11 px por debajo de `md:`, `opacity-50`)
- Fila 4: botones `[✓ Aprobada]` `[→ Planeada]` (9 px/padding 2px desktop, 11 px/padding 4px por debajo de `md:` — más grandes para tap en móvil; ya que el nodo vive dentro del zoom automático de ReactFlow, un tamaño de fuente más grande en "espacio de canvas" sí se traduce en texto más legible una vez aplicado el zoom-out en pantallas chicas)

Semestre mostrado: `semestrePlaneado ?? course.semestre` — refleja replanificación del usuario.

## `FlowCanvas.tsx`

Wrapper de `<ReactFlow>`. Todo el cálculo de nodes/edges ocurre en `useMemo` para evitar re-renders.

- **Nodes**: uno por cada `Course` en `planData`.
- **Edges**: `prereqEdge` por cada `(prereqId → courseId)` presente; `coreqEdge` por cada par de `coreqGroup` (solo renderiza `id < partnerId` para evitar duplicados); `errorEdge` cuando la clave `prereqId__courseId` está en `errorSet`.
- **Layout**: `computeGridLayout(rawNodes, userSemesters)` — recalcula posiciones cuando cambia `planData` o `userState`.
- **Tooltip on-hover**: al pasar el mouse sobre un nodo (delay 800ms) muestra sus prerreqs/coreqs.
- **Dimming de edges**: `displayEdges` atenúa las aristas no relacionadas al nodo con hover activo.
- `MiniMap` y `Controls` de ReactFlow habilitados.
- `nodesDraggable={false}`: posiciones fijas por columna de semestre.
- `fitView` con `padding: 0.15` al montar.

## `PlanSelector.tsx`

Dos o tres `<select>` encadenados. El primero lista programas (keys de `programIndex`); el segundo lista letras disponibles para ese programa. El tercero (área de concentración) **solo se muestra** si `areasByPlan["{programa}-{letra}"]` tiene entradas (13 planes: `ACT-D/E/F/G`, `ECD-A`, `ECO-E/F/G/H/I`, `EDF-B/C/D` — ver `src/data/CLAUDE.md`); al elegir letra con áreas disponibles se auto-selecciona la primera (nunca se deja el plan a medio elegir) y el tercer select queda para cambiarla después. `buildPlanFilename(programa, letra, area?)`/`parseFilename` (`src/data/loader.ts`) arman y reconstruyen el nombre de archivo completo — evita duplicar esa lógica de parseo aquí. Botón "Reiniciar" llama `resetPlan()`.

- **Barra de progreso de créditos**: muestra `aprobados / total (%)` (antes vivía como `<Panel>` en `FlowCanvas.tsx`, se movió aquí). Se centra con `absolute left-1/2` solo a partir de `md:` — por debajo de eso pasa a `block w-full text-center` en su propia línea, porque a `absolute` siempre se monta encima de la fila de selects en cuanto esta es más ancha que la pantalla.
- **Toggle "Disponibles"**: botón ligado a `showAvailable`/`toggleShowAvailable()` del store — activa el resaltado de materias cursables (ver estado "Disponible" en `CourseNode.tsx` arriba).
- **Responsive**: la fila de selects y la fila raíz usan `flex-wrap` — en pantallas angostas los `<select>`, badge y botones pasan a varias líneas en vez de desbordarse.

## `edges/PrereqEdge.tsx`

Bézier suave. Color del stroke: verde (`#1E5E4B`) si el nodo source tiene `aprobada: true`, gris (`#8CA699`) si no. `strokeWidth: 1.5`, `opacity: 0.7`. Dibuja la flecha estándar de ReactFlow en el target.

## `edges/CoreqEdge.tsx`

Línea recta (sin curva). `stroke: #8CA699`, `strokeWidth: 2`, `strokeDasharray: "6 3"`, `opacity: 0.5`. Representa que dos materias deben cursarse simultáneamente.

## `edges/ErrorEdge.tsx`

Bézier. `stroke: #8C5E58`, `strokeWidth: 2.5`, `strokeDasharray: "8 4"`, `opacity: 0.9`. Indica que la materia target está planeada en un semestre inválido respecto a este prerrequisito.
