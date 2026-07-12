# GrafItam

Visualizador interactivo de planes de estudio del ITAM basado en grafos DAG. El usuario selecciona un programa y generación; la app muestra el grafo de materias con sus prerrequisitos, y permite marcar materias como aprobadas y planear semestres futuros. Una segunda pestaña ("Planear Horario") permite, para las materias marcadas como planeadas, importar sus grupos/CRN de ITACA y armar un horario semanal sin traslapes (ver `src/components/schedule/CLAUDE.md`).

## Stack

| Tecnología | Versión | Rol |
|---|---|---|
| Vite | ^6 | Build y dev server |
| React + TypeScript | 18 / 5 | UI, tipado estricto |
| `@xyflow/react` | ^12 | Renderizado del DAG |
| ~~`@dagrejs/dagre`~~ | — | No es dependencia real; el layout es grid manual (nombre legado, ver `src/algorithms/CLAUDE.md`) |
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
python diagnostic.py # script de debug ad-hoc (parseo de CDA-A.pdf/CDA-B.pdf), no es parte del pipeline
python horarios_scraper.py # scrapea horarios/CRN de ITACA para todos los periodos LICENCIATURA vigentes -> jsonHorarios/
npm test            # vitest, corre los tests de src/algorithms/
```

## Deploy

GitHub Actions (`/.github/workflows/deploy.yml`) corre `npm run build` en cada push a `main` y despliega `dist/` a GitHub Pages.

- `base: '/GrafITAM/'` en `vite.config.ts` debe coincidir exactamente con el nombre del repo en GitHub.
- Habilitar Pages en Settings del repo → Source: **GitHub Actions** (no desde rama).

Además, `/.github/workflows/scrape-horarios.yml` corre `horarios_scraper.py` diario (cron) + manualmente (`workflow_dispatch`); si `jsonHorarios/` cambió, commitea a `main` con `github-actions[bot]`, lo cual dispara `deploy.yml` y republica con datos frescos.

## Schema JSON de los planes

`jsonPEs/2025_01/` — 232 archivos generados por `txt_json.py`:

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
- `coreqs`: `[]` o `["{clave de la materia pareja}"]` (ej. `["MAT-14200"]`) — la clave real de la materia con la que debe cursarse simultáneamente, no una bandera genérica — ver `src/algorithms/CLAUDE.md` y `src/data/CLAUDE.md`.
- Naming: `{PROGRAMA}-{LETRA}-plan-estudios.json` (ej. `CDA-A-plan-estudios.json`), o `{PROGRAMA}-{LETRA}-{AREA-SLUG}-plan-estudios.json` si el plan tiene áreas de concentración (ej. `ACT-D-RIESGOS-FINANCIEROS-plan-estudios.json`) — ver más abajo.
- **Optativas**: cada plan incluye entradas sintéticas `OPTATIVA-1`, `OPTATIVA-2`, ... (`nombre: "Optativa I"`, `"Optativa II"`, ...) por cada slot de optativa detectado en el PDF (ej. "Optativa de Estadística — 6 créditos", sin clave real). Van sin `prerreqs`/`coreqs`, en `semestre = (máximo semestre real del plan) + 1` — caen solas en su propia columna final del grafo, desconectadas de todo.
- **Materia N de Área de Concentración**: slots sin clave real dentro de la tabla de semestres (distinto de las áreas de concentración completas descritas abajo) — igual que las optativas en que no tienen `prerreqs`, pero a diferencia de ellas **se quedan en su propio semestre real** (`AREA-{n}`, `n` = el número que ya trae el PDF), porque representan una materia obligatoria de esa etapa del plan, no una optativa libre.
- Tanto optativas como estos slots cuentan para la barra de progreso de `PlanSelector.tsx` sin ningún cambio de frontend (`loader.ts`, `curriculumStore.ts` y `dagreLayout.ts` ya son genéricos sobre cualquier entrada de `planData`).

### Planes con múltiples áreas de concentración

13 PDFs (`ACT-D/E/F/G`, `ECD-A`, `ECO-E/F/G/H/I`, `EDF-B/C/D`) no son un solo plan: son un **tronco común** (semestres compartidos) seguido de 2-5 secciones **"ÁREA DE CONCENTRACIÓN: NOMBRE"** completas, cada una repitiendo los semestres finales con materias específicas de esa área (ej. ACT-D: Seguros / Estadística / Riesgos Financieros). `txt_json.py` separa cada área en su propio archivo (`{PROG}-{LETRA}-{AREA-SLUG}-plan-estudios.json`, slug en mayúsculas sin acentos) — **no existe** un archivo `{PROG}-{LETRA}-plan-estudios.json` "combinado" para estos 13 planes, el tronco solo no es un plan usable. `src/data/loader.ts` expone `areasByPlan` (labels en Title Case por `"{programa}-{letra}"`) para que `PlanSelector.tsx` muestre un tercer `<select>` de área solo cuando aplica.

## Schema JSON de los horarios

`jsonHorarios/` — generado por `horarios_scraper.py` (scraping de ITACA, ver `src/components/schedule/CLAUDE.md`):

- `jsonHorarios/{slug}.json` — un archivo por periodo LICENCIATURA vigente, forma `Record<courseId, ScheduleGroup[]>` (sin el campo `courseId` dentro de cada grupo; se inyecta al cargar):

```json
{
  "MAT-14100": [
    {
      "crn": "2341",
      "grupo": "001",
      "nombre": "CALCULO DIF. E INT., II",
      "profesor": "JOSE DEL NIÑO JESUS CAMPERO PARDO",
      "horario": "09:00-10:30",
      "dias": "LU MI VI",
      "salon": "RH302",
      "campus": "RIO HONDO"
    }
  ]
}
```

- `jsonHorarios/index.json` — manifiesto `HorarioPeriodo[]`: `{ slug, label, sCode, scrapedAt, materiasConGrupos }`, en el orden de aparición en el menú de ITACA (el último es el periodo más reciente publicado, default de la UI).

## Issues conocidos de los datos

- **Prerreqs colgantes**: ~1,116 referencias a IDs que no existen en el mismo plan → guardados en `danglingPrerreqs`, no generan arista.
- **CORREQ singletons**: materias con `["CORREQ"]` sin pareja en el mismo semestre → `coreqGroup` queda vacío.
- **Programas de 2 chars**: `MA` y `RI` — `parseFilename` usa `lastIndexOf('-')` para manejarlos.
- **Planes con áreas de concentración repetidas** (ej. Actuaría: Seguros/Estadística/Riesgos Financieros) imprimen la tabla de semestres una vez por área, y cada repetición termina con una referencia corta tipo `"**Ver notas al Plan de Estudios"`. `txt_json.py` distinguía mal esto del encabezado real de fin de plan y cortaba el parseo en la primera área (bug ya corregido — ver `INLINE_FOOTNOTE_RE` en `src/data/CLAUDE.md`). Ahora además cada área se separa en su propio archivo JSON en vez de mezclarse — ver "Planes con múltiples áreas de concentración" arriba.
- **Columnas mal calibradas en algunos PDFs** (`CEF-E/F`, `EDF-B/C/D`, `EPL-G/H`, `MCT-D/E`, `RI-F`): la clave de una materia caía del lado de "prerrequisitos" en vez de "clave" por unos pocos puntos de diferencia, perdiendo la materia completa (en MCT-D/E esto costaba 18 de 49 materias reales). `txt_json.py` ahora reinterpreta el último código de la zona de prerrequisitos como la clave real cuando la zona de clave queda vacía pero la fila sí trae nombre+créditos completos — ver `parse_pdf` en `src/data/CLAUDE.md`.
- **Encabezados de semestre en desorden** (ej. MCT-E: "SEMESTRE TERCER" en vez de "TERCER SEMESTRE"): un jitter de sub-píxel en la coordenada vertical entre dos palabras de la misma línea (diferencia de milésimas de punto) podía invertir su orden al agrupar por fila. `group_words_by_row` ahora reordena cada fila por `x0` al cerrarla, sin depender de que el orden global por `top` exacto coincida con la lectura izquierda-a-derecha.
- **Palabras partidas en letras sueltas** (solo confirmado en `RI-E/F/G`): "Optativa" viene renderizado como `O p t a t i v a` — el espaciado entre esas letras es casi idéntico al espaciado normal entre palabras en ese PDF específico, así que un umbral de distancia no sirve para detectarlo. `merge_letter_runs` reconstruye el texto por contenido (junta corridas de tokens de una sola letra) antes de intentar cualquier match de regex.
- **Validación de mínimo de materias**: `txt_json.py` avisa (no bloquea) si un plan genera menos de `MIN_MATERIAS` (38) materias en total (reales + optativas + área de concentración) — puede indicar un PDF con formato distinto o un fallo de parseo silencioso. Revisar la lista impresa al final de la corrida.
- **`.gitignore` tenía `2025_01/` sin anclar a la raíz** — esa regla también ignoraba `jsonPEs/2025_01/` (cualquier directorio con ese nombre, a cualquier profundidad), así que los archivos de área nuevos (recién creados por el split de arriba) quedaban invisibles para git y nunca se hubieran subido. Ya se corrigió a `/2025_01/` (ancla solo la carpeta de PDFs fuente en la raíz).

## Paleta de colores

```
cream:    { 50:'#FEFEF9', 100:'#F5F5DC', 200:'#EDE8C8', 300:'#DDD4A8' }
espresso: { 700:'#3E2723', 800:'#2D1B14', 900:'#1A0F0A' }
```

## Deuda técnica conocida

- **Clases Tailwind `cream-*`/`espresso-*` no existen.** `PlanSelector.tsx` y el tab-switcher en `App.tsx` usan `bg-cream-50`, `border-cream-300`, `text-espresso-800`, etc. (la paleta de arriba), pero `tailwind.config.js` **no las define** — solo define `itam-dark`, `itam-core`, `itam-muted`, `base-cream`, `base-bone`, `alert-rust`. Esas clases no generan CSS: los elementos quedan sin fondo/borde de color (transparente), aunque el resto del layout funcione. Nadie lo ha corregido porque visualmente pasa casi desapercibido (el fondo de la app ya es claro). Pendiente: o se agregan `cream-*`/`espresso-*` a `tailwind.config.js` con los hex de arriba, o se migran esos componentes a las clases/colores que sí existen (como ya hace `CourseNode.tsx` con estilos inline).

## Sub-CLAUDEs

- [`src/algorithms/CLAUDE.md`](src/algorithms/CLAUDE.md) — algoritmos de grafo (coreqs, DFS, topología, layout) y de horarios (traslapes, auto-asignación)
- [`src/components/CLAUDE.md`](src/components/CLAUDE.md) — componentes React y estilos de estado
- [`src/components/schedule/CLAUDE.md`](src/components/schedule/CLAUDE.md) — pestaña de horario, schema de datos y flujo de importación desde ITACA
- [`src/store/CLAUDE.md`](src/store/CLAUDE.md) — los 2 stores (curriculum y schedule), persistencia, invariantes
- [`src/data/CLAUDE.md`](src/data/CLAUDE.md) — carga de planes y pipeline PDF→JSON
