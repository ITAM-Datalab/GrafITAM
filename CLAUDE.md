# GrafItam

Visualizador interactivo de planes de estudio del ITAM basado en grafos DAG. El usuario selecciona un programa y generación; la app muestra el grafo de materias con sus prerrequisitos, y permite marcar materias como aprobadas y planear semestres futuros.

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

## Comandos

```bash
npm install         # primera vez
npm run dev         # dev server en localhost:5173
npm run build       # compila a dist/ (tsc + vite)
npm run preview     # sirve dist/ localmente
python txt_json.py  # regenera JSONs desde PDFs en 2025_01/
```

## Deploy

GitHub Actions (`/.github/workflows/deploy.yml`) corre `npm run build` en cada push a `main` y despliega `dist/` a GitHub Pages.

- `base: '/GrafITAM/'` en `vite.config.ts` debe coincidir exactamente con el nombre del repo en GitHub.
- Habilitar Pages en Settings del repo → Source: **GitHub Actions** (no desde rama).

## Schema JSON de los planes

`jsonPEs/2025_01/` — 199 archivos generados por `txt_json.py`:

```json
{
  "MAT-14100": {
    "semestre": 1,
    "nombre": "Cálculo Diferencial e Integral I",
    "creditos": 8,
    "prerreqs": ["MAT-14000"],
    "coreqs": [],
    "estado": 0
  }
}
```

- `estado` siempre `0` en fuente; el estado real del usuario vive en Zustand.
- `coreqs`: `[]` o `["CORREQ"]` — ver `src/algorithms/CLAUDE.md`.
- Naming: `{PROGRAMA}-{LETRA}-plan-estudios.json` (ej. `CDA-A-plan-estudios.json`).

## Issues conocidos de los datos

- **Prerreqs colgantes**: ~1,116 referencias a IDs que no existen en el mismo plan → guardados en `danglingPrerreqs`, no generan arista.
- **CORREQ singletons**: materias con `["CORREQ"]` sin pareja en el mismo semestre → `coreqGroup` queda vacío.
- **Programas de 2 chars**: `MA` y `RI` — `parseFilename` usa `lastIndexOf('-')` para manejarlos.

## Paleta de colores

```
cream:    { 50:'#FEFEF9', 100:'#F5F5DC', 200:'#EDE8C8', 300:'#DDD4A8' }
espresso: { 700:'#3E2723', 800:'#2D1B14', 900:'#1A0F0A' }
```

## Sub-CLAUDEs

- [`src/algorithms/CLAUDE.md`](src/algorithms/CLAUDE.md) — algoritmos de grafo (coreqs, DFS, topología, layout)
- [`src/components/CLAUDE.md`](src/components/CLAUDE.md) — componentes React y estilos de estado
- [`src/store/CLAUDE.md`](src/store/CLAUDE.md) — contrato del store, persistencia, invariantes
- [`src/data/CLAUDE.md`](src/data/CLAUDE.md) — carga de planes y pipeline PDF→JSON
