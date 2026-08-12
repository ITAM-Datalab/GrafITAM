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

## Git — remotos

El repo local tiene dos remotos, y **no son igual de importantes**:

- `upstream` (`ITAM-Datalab/GrafITAM`) — el repo real/canónico. **Es el que siempre debe quedar al día** — cualquier fix o feature termina aquí.
- `origin` (`BraulioLoz/GrafITAM`) — fork personal de Braulio. No es prioridad mantenerlo sincronizado; si queda atrás o diverge, no importa. Solo existía como destino de push antes de que `ReportIssueModal` apuntara al repo correcto (ver `src/components/schedule/CLAUDE.md`).

**Al hacer push a los dos, cuidado con conflictos falsos en `jsonHorarios/index.json`**: como `scrape-horarios.yml` corre en cada repo (`origin` y `upstream` tienen el workflow habilitado por separado), cada uno genera su propio commit automático `chore(horarios): actualiza datos de horarios <fecha>` de forma independiente, con timestamps distintos — esto hace que `origin/main` y `upstream/main` diverjan aunque el resto del código sea idéntico. Si haces `git pull --rebase <remoto> main` y el remoto de destino no tiene ese commit automático específico (porque generó el suyo propio), vas a ver un conflicto en `jsonHorarios/index.json` al intentar reproducirlo. Como es solo un snapshot de datos regenerable (el remoto de destino ya tiene su propia versión equivalente), la resolución es simplemente `git rebase --skip` ese commit puntual — no hay nada que reconciliar a mano, el scraper lo vuelve a actualizar en la siguiente corrida.

Recomendación práctica: pushear directo a `upstream` sin preocuparte por mantener `origin` sincronizado, salvo que se pida explícitamente.

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
- **Optativas**: cada plan incluye entradas sintéticas `OPTATIVA-1`, `OPTATIVA-2`, ... (`nombre: "Optativa I"`, `"Optativa II"`, ...) por cada slot de optativa detectado en el PDF (ej. "Optativa de Estadística — 6 créditos", sin clave real). Van sin `prerreqs`/`coreqs`, en su **semestre real** (el que trae el PDF para ese slot, no `max + 1`) — quedan mezcladas con las materias reales de ese semestre en el grafo, no en una columna final aparte. La numeración (`OPTATIVA-1`, `OPTATIVA-2`, ...) es global y secuencial por orden de aparición en el PDF, no reinicia por semestre. En los 13 planes con área de concentración, además puede haber `OPTATIVA-AREA-1`, `OPTATIVA-AREA-2`, ... — slots "Optativa..." que la tabla propia de un área trae más allá de lo que el tronco común ya traía en ese mismo semestre (ver "Issues conocidos de los datos" más abajo).
- **Materia N de Área de Concentración**: slots sin clave real dentro de la tabla de semestres (distinto de las áreas de concentración completas descritas abajo) — igual que las optativas en que no tienen `prerreqs`, y en que **también se quedan en su propio semestre real** (`AREA-{n}`, `n` = el número que ya trae el PDF), porque representan una materia obligatoria de esa etapa del plan, no una optativa libre.
- Tanto optativas como estos slots cuentan para la barra de progreso de `PlanSelector.tsx` sin ningún cambio de frontend (`loader.ts`, `curriculumStore.ts` y `dagreLayout.ts` ya son genéricos sobre cualquier entrada de `planData`).

### Planes con múltiples áreas de concentración

13 PDFs (`ACT-D/E/F/G`, `ECD-A`, `ECO-E/F/G/H/I`, `EDF-B/C/D`) no son un solo plan: son un **tronco común** (semestres compartidos) seguido de 2-5 secciones **"ÁREA DE CONCENTRACIÓN: NOMBRE"** completas, cada una reimprimiendo la **tabla completa de todos los semestres del plan** (no solo los finales — verificado con `pdfplumber` directo sobre el PDF) con las materias específicas de esa área (ej. ACT-D: Seguros / Estadística / Riesgos Financieros). `txt_json.py` separa cada área en su propio archivo (`{PROG}-{LETRA}-{AREA-SLUG}-plan-estudios.json`, slug en mayúsculas sin acentos) — **no existe** un archivo `{PROG}-{LETRA}-plan-estudios.json` "combinado" para estos 13 planes, el tronco solo no es un plan usable. `src/data/loader.ts` expone `areasByPlan` (labels en Title Case por `"{programa}-{letra}"`) para que `PlanSelector.tsx` muestre un tercer `<select>` de área solo cuando aplica.

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
- **`AREA-N` fantasma duplicado en los 13 planes con área** (bug ya corregido): al abrir cada área nueva, la sección heredaba `area_concentracion` del tronco común (slots "Materia N de Área de Concentración" sin clave real) — pero la tabla propia de cada área siempre rellena esos mismos slots con una materia real bajo su propia clave, así que el placeholder heredado nunca se "consumía" y quedaba como entrada fantasma duplicada (créditos contados dos veces en la barra de progreso). `area_concentracion` ya no se hereda al abrir una área (a diferencia de `optativa_credits`, que sí sigue heredándose — ver el punto siguiente).
- **`OPTATIVA-N` duplicado y mal clasificado en los 13 planes con área** (bug ya corregido, issues #23/#25): como cada área reimprime la tabla completa (ver arriba), cualquier fila "Optativa..." de esa tabla volvía a agregarse a `optativa_credits` sin deduplicar contra lo ya heredado del tronco — un slot genérico del tronco terminaba contado 2 veces (ej. `ACT-G-RIESGOS-FINANCIEROS` mostraba 3 optativas en 8º semestre en vez de 2). Además, en PDFs como `ECO-*`/`EDF-*` las materias de especialización de un área a veces se imprimen como texto plano `"Optativa"` (sin calificador propio), indistinguibles por texto de un elective libre genérico — el mecanismo `AREA-N` nunca las capturaba porque el PDF no usa la forma "Materia N de Área de Concentración" para ellas. `txt_json.py` (`_record_optativa_slot`) ahora sigue heredando `optativa_credits` del tronco sin cambios (garantiza que nunca se pierde el "piso"), pero al reparsear la tabla propia del área compara cada fila contra un contador por `(semestre, texto en mayúsculas)`: si ya hay una copia heredada sin "consumir" para esa clave, la descarta (evita la duplicación); si excede lo heredado, la clasifica como específica del área en una lista nueva (`optativa_area_credits` → `OPTATIVA-AREA-N` en el JSON), nombrada con el calificador real del PDF si lo trae (ej. "Optativa de Finanzas") o con un nombre de respaldo `"Optativa de {Área} {romano}"` si el texto es un "Optativa" genérico puro. La clave de comparación se normaliza a mayúsculas porque algunos PDFs (ej. `ECO-E` Fundamentos Económicos) reimprimen el mismo slot en mayúsculas ("OPTATIVA") donde el tronco lo trae en title case ("Optativa") — sin esa normalización, el mismatch de texto causaba la misma duplicación que se buscaba corregir.
- **Semestre 11°/12° no reconocidos** (bug ya corregido): `SEMESTER_MAP`/`SEMESTER_RE` solo llegaban hasta DÉCIMO. Los planes con "ONCEAVO SEMESTRE"/"DOCEAVO SEMESTRE" (ej. `ECD-A`, `DPL-D`, `CPD-E`) quedaban con esas materias mal etiquetadas como semestre 10, y el texto del encabezado no reconocido se pegaba como prefijo al nombre de la siguiente materia real.
- **Typo "0" (cero) por "O" (letra) en algunos PDFs** (bug ya corregido, confirmado en `ECD-A`): claves como `EC0-21104`/`CS0-16049` no matcheaban `COURSE_CODE_RE` (solo aceptaba letras en el prefijo), perdiendo esa materia/prerrequisito en silencio. Ahora el regex tolera `0` en el prefijo (exigiendo al menos una letra real) y `normalize_code` lo corrige a `O`.
  - **Regresión residual conocida, no corregida**: en `ECD-A` (ambas áreas) y `DPL-D`, corregir el reconocimiento del semestre 11°/12° hizo que una materia que antes se guardaba como "stub" ahora se guarde directo — lo que activa la heurística de atribución de prerrequisitos por hueco vertical (`pending_prereq_groups`, ver `parse_pdf`) para un bloque de continuación con huecos casi empatados (diferencia de ~0.5pt). Resultado: `COM-23116`/`LEN-12762` (ECD-A) y `CSO-17042`/`EGN-17162` (DPL-D) intercambiaron 2-3 prerrequisitos entre sí de forma incorrecta. Es una fragilidad preexistente de esa heurística (ya existía antes, solo que enmascarada por el bug del semestre 11°/12°), acotada a 5 materias en 3 archivos — pendiente de una revisión aparte del criterio de desempate cuando los huecos son casi iguales.
- **Solo 2 de las 5 áreas de concentración de `ECD-A` están en el PDF fuente**: la página de notas del PDF lista Fundamentos Económicos, Política Económica, Economía Empresarial, Economía Financiera y Derecho y Economía, pero solo las primeras dos traen tabla completa de semestres — no es un bug de parseo, el PDF simplemente no publica las otras 3. Revisar con ITAM si existe una versión más completa antes de esperar esos JSONs.
- **`ECO-I.pdf` usaba "Electiva N de área de concentración" en vez de "Materia N de Área de Concentración"** (bug ya corregido): `AREA_CONCENTRACION_SLOT_RE` solo reconocía el prefijo "Materia", así que esas filas se descartaban en silencio en las 5 áreas de `ECO-I` (Ciencia de Datos, Empresarial, Finanzas, Fundamentos, Políticas Públicas) sin generar entrada `AREA-N` ni corromper ninguna materia real. El regex ahora acepta también "Electiva"; el nombre sintético de salida sigue siendo siempre "Materia N de Área de Concentración" sin importar la palabra de origen. Dos de las 5 áreas (Finanzas, Empresarial) traen además un único slot de este tipo **sin numerar** ("Electiva de área de concentración", sin "N", porque el PDF no numera cuando solo hay uno) — cubierto por `AREA_CONCENTRACION_SLOT_SINGULAR_RE` como fallback (tratado como slot `1`).

## Paleta de colores

```
cream:    { 50:'#FEFEF9', 100:'#F5F5DC', 200:'#EDE8C8', 300:'#DDD4A8' }
espresso: { 700:'#3E2723', 800:'#2D1B14', 900:'#1A0F0A' }
```

## Deuda técnica conocida

Ninguna pendiente por ahora. (Resuelto: clases Tailwind `cream-*`/`espresso-*` que no existían en `tailwind.config.js` — `PlanSelector.tsx` y el tab-switcher de `App.tsx` ya migraron a `bg-base-cream`/`border-itam-muted/40` y colores inline `#0D3B2E`, consistentes con la paleta real definida.)

## Sub-CLAUDEs

- [`src/algorithms/CLAUDE.md`](src/algorithms/CLAUDE.md) — algoritmos de grafo (coreqs, DFS, topología, layout) y de horarios (traslapes, auto-asignación)
- [`src/components/CLAUDE.md`](src/components/CLAUDE.md) — componentes React y estilos de estado
- [`src/components/schedule/CLAUDE.md`](src/components/schedule/CLAUDE.md) — pestaña de horario, schema de datos y flujo de importación desde ITACA
- [`src/components/manual/CLAUDE.md`](src/components/manual/CLAUDE.md) — pestaña de manual de usuario
- [`src/store/CLAUDE.md`](src/store/CLAUDE.md) — los 2 stores (curriculum y schedule), persistencia, invariantes
- [`src/data/CLAUDE.md`](src/data/CLAUDE.md) — carga de planes y pipeline PDF→JSON
- [`src/lib/CLAUDE.md`](src/lib/CLAUDE.md) — analytics (GoatCounter)
