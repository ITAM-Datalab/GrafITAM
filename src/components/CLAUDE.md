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
- **Edges**: `prereqEdge` por cada `(prereqId → courseId)` presente; `coreqEdge` por cada par de `coreqGroup` (solo renderiza `id < partnerId` para evitar duplicados); `errorEdge` cuando la clave `prereqId__courseId` está en `errorSet`. Los ids se construyen con `prereqEdgeId`/`coreqEdgeId` (`src/algorithms/graphHighlight.ts`), única fuente de verdad del formato — no se arman como template literal inline en ningún otro lugar.
- **`markerEnd` dinámico por edge**: cada edge declara su propio marcador (no hay `defaultEdgeOptions` global) — `MarkerType.ArrowClosed` con color verde/gris según `aprobada` del source para prereq, o `'error-marker'` (id del `<marker>` custom montado por `EdgeMarkers.tsx`) para errorEdge. Antes había un solo color fijo para todas las flechas, que no coincidía con el stroke de la línea.
- **Layout**: `computeGridLayout(rawNodes, userSemesters)` — recalcula posiciones cuando cambia `planData` o `userState`.
- **Tooltip on-hover**: al pasar el mouse sobre un nodo (delay 800ms) muestra sus prerreqs, coreqs, y "Desbloquea" (materias cuyo `prerreqs` incluye directamente a esta — no transitivo).
- **Hover-highlight transitivo**: `computeHoverHighlight` (`src/algorithms/graphHighlight.ts`) calcula, sobre el nodo con hover, la cadena completa de ancestros (prerreqs de prerreqs...) y descendientes (todo lo que esa materia eventualmente desbloquea) en ambas direcciones, más sus coreqs directos — `displayNodes`/`displayEdges` atenúan (`NODE_DIM_OPACITY`/`EDGE_DIM_OPACITY`) todo lo que quede fuera de ese set. Los edges se marcan durante el mismo recorrido BFS/DFS (no por chequeo posterior de "¿ambos extremos están en el set?"), para no resaltar una arista coincidental entre dos nodos que están en el set por razones distintas.
- `MiniMap` y `Controls` de ReactFlow habilitados.
- `nodesDraggable={false}`: posiciones fijas por columna de semestre.
- `fitView` con `padding: 0.15` al montar.

## `PlanSelector.tsx`

Dos o tres `<select>` encadenados. El primero lista programas (keys de `programIndex`); el segundo lista letras disponibles para ese programa. El tercero (área de concentración) **solo se muestra** si `areasByPlan["{programa}-{letra}"]` tiene entradas (13 planes: `ACT-D/E/F/G`, `ECD-A`, `ECO-E/F/G/H/I`, `EDF-B/C/D` — ver `src/data/CLAUDE.md`); al elegir letra con áreas disponibles se auto-selecciona la primera (nunca se deja el plan a medio elegir) y el tercer select queda para cambiarla después. `buildPlanFilename(programa, letra, area?)`/`parseFilename` (`src/data/loader.ts`) arman y reconstruyen el nombre de archivo completo — evita duplicar esa lógica de parseo aquí. Botón "Reiniciar" llama `resetPlan()`.

- **Barra de progreso de créditos**: muestra `aprobados / total (%)` (antes vivía como `<Panel>` en `FlowCanvas.tsx`, se movió aquí). Antes se centraba con `absolute left-1/2` a partir de `md:`, calibrado para 2 `<select>` — con los 13 planes de área (3er `<select>`) la fila de selects se volvía lo bastante ancha como para invadir el centro y solaparse con el badge/"Reiniciar" (bug real, reportado y corregido). Ahora la raíz es `flex flex-col` en móvil y `md:grid md:grid-cols-[1fr_auto_1fr]` a partir de `md:` — cada sección (selects, progreso, "Disponibles") vive en su propia columna de grid, así que no pueden solaparse sin importar cuántos `<select>` tenga la fila izquierda.
- **Toggle "Disponibles"**: botón ligado a `showAvailable`/`toggleShowAvailable()` del store — activa el resaltado de materias cursables (ver estado "Disponible" en `CourseNode.tsx` arriba). Su wrapper es `flex justify-center md:justify-end` (centrado en móvil junto con el resto, alineado a la derecha en `md:`+, igual que antes con `ml-auto`).
- **Responsive**: la fila de selects (dentro de la primera columna del grid) sigue usando `flex-wrap` — si no cabe en el ancho de su columna, los `<select>` envuelven a una segunda línea en vez de desbordarse.
- **Toggle "Buscar plan" / `searchMode`**: botón pill (mismo estilo que "Disponibles") **incondicional** — a diferencia del badge+"Reiniciar" (que solo aparecen con plan activo), este botón siempre se renderiza, inmediatamente después de "Reiniciar" en el DOM. Con `searchMode=true`, los 2-3 `<select>` se sustituyen por `<PlanSearchBar>`; el badge y "Reiniciar" (si hay plan activo) se quedan visibles. Al elegir un resultado (`handleSearchSelect`), se sincronizan `selectedProgram/selectedLetter/selectedArea` con lo elegido, se llama `loadPlan(buildPlanFilename(...))`, y se regresa a `searchMode=false` — decisión de producto: buscar es solo una vía alterna de *entrada*, la vista de referencia sigue siendo los selects.

## `PlanSearchBar.tsx`

Buscador de texto libre sobre los 232 `allPlanMetas` (no solo el plan activo) — pensado para encontrar un plan por nombre de carrera en vez de por código de programa (los códigos, ej. `ACT`, `AAC`, son acrónimos opacos sin nombre en ningún dato existente; ver `programNames.ts` en `src/data/CLAUDE.md`). Mismo patrón base que `MateriaSearchBar.tsx` (input controlado + `useMemo` + lista clicable), con dos diferencias necesarias porque aquí se busca texto en español con acentos, no claves ASCII:

- **Plegado de acentos** (`fold`, `s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()`): sin esto, escribir "actuaria"/"matematicas" (sin tilde, como teclea la mayoría) no encontraría nada contra "Actuaría"/"Matemáticas". `MateriaSearchBar` no lo necesita porque las claves de materia son ASCII.
- **Match por tokens (AND)**, no un solo substring: la query se separa en palabras y cada una debe aparecer en el texto combinado (`programa + letra + área + programNames[programa] + planGenerations["programa-letra"]`) — así "actuaria d" o "ciencia de datos economia" (en cualquier orden) encuentran resultado.
- `MAX_RESULTS = 30` (vs. 15 de `MateriaSearchBar`): se busca sobre 232 planes, no 500 materias de un solo periodo, pero una palabra genérica ("administracion") sí matchea una docena de programas × sus letras.
- Lista de resultados en `<ul>` con posición `absolute` (no in-flow) — vive dentro de la fila de header de `PlanSelector`; in-flow empujaría el grafo hacia abajo con cada tecleo.
- Cada fila muestra `{programa}-{letra}` (mono) + nombre completo de carrera (semibold) + área si aplica + generación — necesario para distinguir resultados ambiguos como `AAC-D` vs `ACA-A`.

Props: `onSelect(meta: PlanMeta)`. Click en un resultado → `trackEvent('/plan/search-select', ...)`, `onSelect(meta)`, limpia `query`. `trackEvent('/plan/search-open', ...)` se dispara aparte, desde `PlanSelector`, al activar el toggle — mide adopción del buscador libre por separado de `/plan/select` (selects).

## `edges/edgeGeometry.ts`

Geometría pura (sin React/store), reusada por `PrereqEdge`/`CoreqEdge`. Estilo "vías de tren":

- `computePrereqEdgeGeometry(sourceX, sourceY, targetX, targetY, creditosOrigen, columnGap)`: si source/target comparten fila, path recto; si cruzan filas, ruteo H-V-H con esquinas redondeadas (`CORNER_RADIUS`) por un troncal vertical fijo a la mitad del primer gutter de semestre (`sourceX + columnGap/2` — **simplificación deliberada**: en saltos de más de un semestre no evade columnas intermedias, igual que el bézier anterior). También calcula los "ticks de crédito" (`buildTicks`, densidad `clamp(creditosOrigen, MIN_TICKS=2, MAX_TICKS=9)`, siempre en el primer tramo horizontal, nunca sobre columnas intermedias) y el punto "estación" (círculo en el origen).
- `computeLengthOpacity(length)`: aristas más largas (más semestres de distancia, longitud Manhattan) quedan más tenues (entre `MIN_OPACITY=0.35` y `MAX_OPACITY=0.85`), sin desaparecer del todo.
- `computeCoreqRails(sourceX, sourceY, targetX, targetY)`: "riel doble + durmientes" — dos líneas paralelas offset perpendicular (`RAIL_OFFSET=3px`) al segmento source→target, con travesaños entre ellas cada `SLEEPER_SPACING=14px`.

## `edges/PrereqEdge.tsx`

Usa `computePrereqEdgeGeometry` (créditos del nodo **origen**, i.e. el prerrequisito — no del target). Color del stroke: verde (`#1E5E4B`) si el nodo source tiene `aprobada: true`, gris (`#8CA699`) si no. Renderiza `<BaseEdge>` (el path) + `<circle>` (estación) + un `<line>` por tick, todos con la misma opacidad: `style?.opacity` que llega de `EdgeProps` (multiplicador de hover-dim seteado por `FlowCanvas.tsx`) × `computeLengthOpacity` del propio edge. Dibuja la flecha estándar de ReactFlow en el target (color dinámico, ver `FlowCanvas.tsx` arriba).

## `edges/CoreqEdge.tsx`

Usa `computeCoreqRails`. Renderiza dos `<path>` (rieles, `stroke: #8CA699`, `strokeWidth: 1.5`) + un `<path>` (durmientes, `strokeWidth: 1`) dentro de un `<g>` con la opacidad combinada (`style?.opacity` de hover-dim × `0.5` fijo). No usa `<BaseEdge>`/`getStraightPath` — coreq no es seleccionable/eliminable hoy, no necesita el hit-area que provee `BaseEdge`; si se necesita interacción más adelante, se puede agregar un `<BaseEdge>` extra invisible sin tocar el resto.

## `edges/ErrorEdge.tsx`

Bézier (sin cambio de path). `stroke: #8C5E58`, `strokeWidth: 2.5`, `strokeDasharray: "8 4"`, opacidad `0.9 × style?.opacity` (hover-dim). Indica que la materia target está planeada en un semestre inválido respecto a este prerrequisito. Usa el marcador custom `error-marker` (ver `edges/EdgeMarkers.tsx`) en vez del triángulo estándar.

## `edges/EdgeMarkers.tsx`

Componente sin props, monta un `<svg><defs>` una sola vez (como hermano de `<ReactFlow>` en `FlowCanvas.tsx`) con el `<marker id="error-marker">` custom (círculo + cruz, stroke rust) — los `<marker>` SVG resuelven por id a nivel de documento, no necesitan vivir dentro del mismo `<svg>` que las aristas.
