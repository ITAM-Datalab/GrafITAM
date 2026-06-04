# GrafItam

Visualizador interactivo de planes de estudio del ITAM basado en grafos dirigidos acíclicos (DAG). El usuario selecciona un programa y generación de plan; la app muestra el grafo de materias con sus prerrequisitos, y permite marcar materias como aprobadas y planear semestres futuros.

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| Vite | ^6 | Build y dev server |
| React + TypeScript | 18 / 5 | UI, tipado estricto |
| `@xyflow/react` | ^12 | Renderizado del DAG |
| `@dagrejs/dagre` | ^1.1 | Layout automático por semestre |
| Zustand + `persist` | ^5 | Estado global → LocalStorage |
| Tailwind CSS | ^3 | Estilos (paleta espresso/cream) |
| GitHub Actions | — | CI/CD → GitHub Pages |

## Carpetas (`src/`)

```
src/
  types/         # Interfaces TypeScript: RawCourse, Course, PlanData, store state
  data/          # loader.ts (import.meta.glob eager) + planIndex.ts
  algorithms/    # coreqs, dfsApprove, topoValidate, dagreLayout
  store/         # curriculumStore.ts (Zustand)
  components/    # CourseNode, FlowCanvas, PlanSelector
  components/edges/  # PrereqEdge, CoreqEdge, ErrorEdge
```

## Schema JSON de los planes

Los 148 archivos en `jsonPEs/jsonPEs/` siguen este esquema:

```json
{
  "MAT-14100": {
    "semestre": 1,
    "nombre": "Cálculo Diferencial e Integral I",
    "creditos": 8,
    "prerreqs": [],
    "coreqs": [],
    "estado": 0
  }
}
```

- La clave del objeto es el código de materia.
- `prerreqs`: IDs de materias que deben aprobarse antes.
- `coreqs`: `[]` o `["CORREQ"]` (placeholder — ver algoritmo de coreqs).
- `estado`: siempre `0` en los JSON fuente; el estado del usuario se gestiona en Zustand.
- Naming de archivos: `{PROGRAMA}-{LETRA}-plan-estudios.json` (ej. `CDA-A-plan-estudios.json`).

### Issues conocidos de los datos

- **Prerrequisitos colgantes**: 1,116 referencias a IDs que no existen en el mismo archivo. Se clasifican en `danglingPrerreqs` y se ignoran (no se renderiza arista).
- **CORREQ singletons**: Algunas materias tienen `["CORREQ"]` pero no tienen pareja en el mismo semestre. Su `coreqGroup` queda vacío.
- **Grupos CORREQ de N>2**: Posible que 3 o más materias estén ligadas como correquisitos.
- **Programas de 2 chars**: `MA` y `RI` — se parsean con `lastIndexOf('-')`.

## Algoritmos (`src/algorithms/`)

| Archivo | Propósito |
|---|---|
| `coreqs.ts` | Detecta grupos de correquisitos (misma semestre + flag `CORREQ`) |
| `dfsApprove.ts` | DFS iterativo hacia atrás: aprobar V aprueba todos sus ancestros |
| `topoValidate.ts` | Valida O(V+E) que cada materia esté en un semestre posterior a sus prerrequisitos |
| `dagreLayout.ts` | Convierte nodes/edges a posiciones x,y usando dagre (columnas = semestres) |

## Contrato del Store (`src/store/curriculumStore.ts`)

**Persiste en LocalStorage**: `activePlan` (filename) + `userState` (aprobaciones y semestres planeados por materia).

**No persiste**: `planData` (re-derivado del JSON al hidratar), `validationErrors` (calculado en cada mutación).

**Acciones**: `loadPlan(filename)`, `toggleApproval(courseId)`, `setPlannedSemester(courseId, sem)`, `resetPlan()`.

## Paleta de Colores

```js
cream:    { 50:'#FEFEF9', 100:'#F5F5DC', 200:'#EDE8C8', 300:'#DDD4A8' }
espresso: { 700:'#3E2723', 800:'#2D1B14', 900:'#1A0F0A' }
```

Nodo sin aprobar: cream-100 con borde cream-300. Nodo aprobado: fondo y borde espresso.

## Comandos

```bash
npm install       # primera vez
npm run dev       # servidor de desarrollo en localhost:5173
npm run build     # compila a dist/ (tsc + vite)
npm run preview   # sirve dist/ localmente
```

## Deploy

GitHub Actions (`/.github/workflows/deploy.yml`) ejecuta `npm run build` en cada push a `main` y despliega `dist/` a GitHub Pages.

- `base: '/GrafITAM/'` en `vite.config.ts` debe coincidir exactamente con el nombre del repo.
- Habilitar Pages en Settings del repo → Source: **GitHub Actions** (no desde rama).

## Sub-CLAUDE.md

Se crearán conforme se añadan módulos. Por ahora toda la documentación está aquí.
