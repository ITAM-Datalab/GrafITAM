# GrafItam

Visualizador interactivo de planes de estudio del ITAM basado en grafos dirigidos acíclicos (DAG).

**Demo:** https://BraulioLoz.github.io/GrafITAM/

## ¿Qué hace?

- Muestra el grafo completo de materias de cualquier programa y generación del ITAM
- Visualiza prerrequisitos como aristas dirigidas y correquisitos como líneas punteadas
- Permite marcar materias como **aprobadas** (con propagación automática a prerreqs) o **planeadas** (con propagación a correqs)
- Detecta inconsistencias topológicas cuando una materia planeada está en un semestre incorrecto
- Muestra el progreso en créditos aprobados sobre el total del plan
- Persiste el estado del usuario en LocalStorage

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| Vite | ^6 | Build y dev server |
| React + TypeScript | 18 / 5 | UI, tipado estricto |
| `@xyflow/react` | ^12 | Renderizado del DAG |
| `@dagrejs/dagre` | ^1.1 | Layout automático por semestre |
| Zustand + `persist` | ^5 | Estado global → LocalStorage |
| Tailwind CSS | ^3 | Estilos |

## Desarrollo local

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # compila a dist/
npm run preview  # sirve dist/ localmente
```

## Regenerar planes de estudio

Los JSONs en `jsonPEs/2025_01/` se generan desde los PDFs en `2025_01/`:

```bash
python txt_json.py
```

Requiere Python 3.10+ y `pdfplumber` (se instala automáticamente si falta). Genera 199 archivos JSON, uno por programa × generación.

## Estructura del proyecto

```
GrafItam/
├── src/
│   ├── types/        # Interfaces TypeScript (RawCourse, Course, store state)
│   ├── data/         # Loader de planes (import.meta.glob) + pipeline PDF→JSON
│   ├── algorithms/   # coreqs, DFS aprobar/desaprobar, validación topológica, layout
│   ├── store/        # Store Zustand (acciones, persistencia)
│   └── components/   # CourseNode, FlowCanvas, PlanSelector, edges/
├── jsonPEs/2025_01/  # 199 JSONs de planes de estudio (generados)
├── 2025_01/          # PDFs fuente de planes de estudio
├── txt_json.py       # Script de conversión PDF → JSON
└── CLAUDE.md         # Documentación para desarrollo con IA
```

## Deploy

El proyecto se despliega automáticamente a GitHub Pages en cada push a `main` via GitHub Actions. El `base` en `vite.config.ts` debe coincidir con el nombre exacto del repositorio.
