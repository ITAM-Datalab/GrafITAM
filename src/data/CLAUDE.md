# Data (`src/data/`)

## `loader.ts`

Carga todos los planes en bundle-time con Vite glob:

```ts
import.meta.glob('/jsonPEs/2025_01/*.json', { eager: true, import: 'default' })
```

Los 232 JSONs quedan embebidos en el bundle JS. No hay fetch en runtime.

### `parseFilename(path)` / `buildPlanFilename(program, letter, area?)`

`parseFilename` convierte `/jsonPEs/2025_01/CDA-A-plan-estudios.json` → `{ filename, program: "CDA", letter: "A" }`, o `/jsonPEs/2025_01/ACT-D-RIESGOS-FINANCIEROS-plan-estudios.json` → `{ ..., program: "ACT", letter: "D", area: "Riesgos Financieros" }` (Title Case, para mostrar en la UI). Usa el regex `^([A-Z]{2,4})-([A-Z])(?:-(.+))?$` sobre el stem — reemplaza el `lastIndexOf('-')` que se usaba antes (que ya soportaba programas de 2 chars como `MA`/`RI`, pero se volvía ambiguo en cuanto el nombre podía traer un tercer segmento de área con sus propios guiones). `buildPlanFilename` es la inversa exacta (arma el filename completo desde la selección del usuario en `PlanSelector.tsx`), evitando reconstruir esta lógica de string en dos lugares.

### `loadPlanData(filename): PlanData`

1. Resuelve `rawModules["/jsonPEs/2025_01/" + filename]` (con el filename completo, incluyendo el segmento de área si aplica).
2. Para cada materia:
   - Clasifica sus `prerreqs`: `presentPrerreqs` (IDs que existen en el plan → generan aristas en el grafo) vs. `danglingPrerreqs` (IDs que no existen → guardados pero ignorados en renderizado).
   - Resuelve `coreqGroup` vía `resolveCoreqGroup(course.coreqs, allIds)` (`src/algorithms/coreqs.ts`) — mismo filtrado de presencia, aplicado a las claves de pareja que ya trae `coreqs` en el JSON fuente.
3. Construye y retorna `PlanData`.

### `programIndex` / `areasByPlan`

`programIndex: Record<programa, letra[]>` — sin duplicados aunque un programa+letra tenga varias áreas (antes de esto existir, cada área hubiera insertado la misma letra otra vez). `areasByPlan: Record<"{programa}-{letra}", string[]>` — labels de área en Title Case, solo tiene entradas para los 13 planes que las traen; `PlanSelector.tsx` lo usa para decidir si muestra el tercer `<select>`.

### `planIndex.ts`

Barrel que re-exporta `programIndex`, `areasByPlan`, `allPlanMetas`, `parseFilename` y `buildPlanFilename` de `loader.ts`. Consumido por `PlanSelector.tsx`.

---

## `horariosLoader.ts`

Mismo patrón que `loader.ts` pero para horarios: `import.meta.glob('/jsonHorarios/*.json', { eager: true, import: 'default' })`, embebido al bundle, sin fetch en runtime. Ver `src/components/schedule/CLAUDE.md` para el pipeline completo (`horarios_scraper.py`) que genera estos JSON.

- `horarioPeriodos: HorarioPeriodo[]` — el manifiesto `jsonHorarios/index.json` (filtrado del glob por nombre de archivo).
- `defaultPeriodoSlug()` — el último periodo del manifiesto (el más reciente en aparecer en el menú de ITACA).
- `loadHorariosForPeriodo(slug): ScheduleData` — resuelve `jsonHorarios/{slug}.json` e inyecta `courseId` en cada `ScheduleGroup` (el JSON fuente lo omite porque ya es la clave del `Record`).

Consumido por `scheduleStore.ts`, no directamente por componentes (excepto `horarioPeriodos` en `ScheduleTab.tsx` para poblar el selector de periodo).

---

## `txt_json.py` — Pipeline PDF → JSON

Convierte PDFs del ITAM en `2025_01/` a JSONs en `jsonPEs/2025_01/`.

```bash
python txt_json.py   # procesa todos los PDFs, imprime resumen OK/SKIP/ERROR
```

Requiere `pdfplumber` (se instala automáticamente si falta).

### Detección de columnas (`detect_column_bounds`)

Lee las primeras 2 páginas buscando las palabras "Prerrequisito(s)", "Clave" y "Crédito(s)" (acepta variantes: Crds., Crd., etc.). Calcula los límites `x` de las cuatro columnas: prerreqs / clave / materia / créditos.

**Fallback de columna mal calibrada**: en algunos PDFs (`CEF-E/F`, `EDF-B/C/D`, `EPL-G/H`, `MCT-D/E`, `RI-F`) el límite `prereq_x` calculado del header no coincide con los datos reales, y la clave de una materia cae del lado de "prerrequisitos" en vez de "clave" por pocos puntos de diferencia (ej. `x0=206.88` cuando el límite es `213.04`) — la materia se pierde por completo (MCT-D/E perdían 18 de 49 materias reales así). En `parse_pdf`, cuando `clave_words` queda vacío pero la fila sí trae `name_words`+`cred_words` completos, se extraen los códigos de `prereq_words` y se reinterpreta el **último** como la clave real (el prerrequisito real, si lo hay, siempre queda a la izquierda de la clave — por eso el último código de esa zona es el correcto). Cubre tanto materias sin prerrequisito (la zona trae solo la clave) como con prerrequisito real (la zona trae `[prereq...] [clave]` juntos).

**Orden de palabras dentro de una fila**: `group_words_by_row` agrupaba por `top` exacto sin reordenar por `x0` al cerrar cada fila — en PDFs donde dos palabras de la misma línea visual difieren por un jitter de sub-píxel en `top` (ej. "SEMESTRE"/"TERCER" con `top` 415.6128 vs 415.6176, ambos dentro de `y_tolerance`), el orden global por `top` exacto podía invertirlas ("SEMESTRE TERCER" en vez de "TERCER SEMESTRE"), rompiendo `SEMESTER_RE` y perdiendo el semestre completo (pasaba en MCT-E). Ahora cada fila se reordena por `x0` antes de cerrarse.

### Parseo por filas (`parse_pdf`)

Máquina de estados que itera filas de palabras clasificadas por columna. Estados principales:

| Variable | Propósito |
|----------|-----------|
| `current_semester` | Semestre activo (0 hasta encontrar el primer header) |
| `pending_name` | Nombre acumulado de filas de solo-texto **antes** del código (patrón CDA-B) |
| `pending_stub` | Materia incompleta (falta nombre o créditos) pendiente de completar con filas siguientes |
| `pending_prereq_words` | Prerreqs de continuación (overflow de la columna prereq) |
| `in_optativas` | `True` cuando se detectó sección MATERIAS OPTATIVAS → filas se saltan |

### Patrones especiales del PDF

**Fila doble** — nombre antes del código:
```
[Nombre de la materia]          ← solo columna materia → pending_name
[PREREQS]  [COD-12345]  [N cr]  ← código + créditos, sin nombre → usa pending_name
```

**Fila triple** — nombre parcial + continuación:
```
[Nombre parcial]                ← pending_name
[PREREQS]  [COD-12345]  [N cr] ← crea stub con pending_name + creditos
[continuación del nombre]       ← se acumula en stub.nombre
```
El stub se libera (`_flush_stub`) cuando llega el siguiente código de materia o encabezado de semestre.

**Marcador de coreq en su propia fila, cerrando un stub ya completo** (confirmado en `DAC-A`, décimo semestre — `LEN-12762`/`DER-10114`): cuando el nombre de una materia se ensambló desde una fila previa (patrón "fila doble"), `parse_pdf` siempre crea un stub aunque nombre+créditos ya estén completos en la fila del código (`name_came_from_prior_row` fuerza esto — asume que podría venir más continuación). Si el marcador `(A)`/`(B)` de esa materia queda pegado a un nombre largo que se envuelve a dos líneas, el marcador termina en **su propia fila**, después del código:
```
[Nombre parcial]                     ← pending_name
[PREREQS]  [COD-12345]  [N cr]      ← crea stub (nombre+créditos ya completos, pero
                                        name_came_from_prior_row fuerza stub)
[(A)]                                 ← se absorbe bien como marcador del stub...
[Nombre de la SIGUIENTE materia]     ← ...pero el stub sigue abierto, así que esta fila
                                        se fusiona por error en el stub anterior en vez
                                        de iniciar el nombre de la materia siguiente
```
Antes del fix, esto fusionaba el nombre de las dos materias en la primera (`LEN-12762` terminaba con "...Ciencia de Datos Seminario de Legalidad y Ética en Ciencia de") y dejaba a la segunda con solo la palabra suelta que le quedaba (`DER-10114` = "Datos"). Fix: cuando llega una fila que es *solo* el marcador (sin texto de nombre) y el stub ya tenía `nombre` no vacío y `creditos > 0` **antes** de esa fila, se cierra el stub inmediatamente después de asignarle el marcador, en vez de dejarlo abierto a la espera de más continuaciones.

**Catálogo "MATERIAS OPTATIVAS OFRECIDAS POR LOS DIVERSOS DEPARTAMENTOS"** (sección larga al final del PDF, con clave real por materia pero compartida entre todos los planes — no es lo que se agrega al JSON):
- Si aparece ese header → `_flush_stub` + `in_optativas = True`, se saltan todas las filas hasta el siguiente encabezado de semestre.

**Slots de optativa dentro de la tabla de un semestre** (`OPTATIVA_SLOT_RE`, ej. "Optativa", "Optativa I", "Optativa de Estadística", "Optativa Área de Concentración" — sin clave real, distinto del catálogo de arriba): se capturan sus créditos (`optativa_credits`, con fallback a 6 si el crédito no se pudo leer de esa fila) y al final de `parse_pdf` se agregan como materias sintéticas `OPTATIVA-1`, `OPTATIVA-2`, ... (`nombre: "Optativa I"`, `"Optativa II"`, ... vía `to_roman`), sin `prerreqs`, en `semestre = (máximo semestre real) + 1` — quedan en su propia columna final del grafo, desconectadas. El regex reconoce **cualquier** variante que empiece con "Optativa"/"Optativas" (antes solo reconocía la forma corta tipo "Optativa I"; las variantes con nombre se colaban al nombre de la siguiente materia real — bug ya corregido).

**Slots de "Materia N de Área de Concentración"** (`AREA_CONCENTRACION_SLOT_RE`): mismo mecanismo de captura que optativas (mismos dos puntos de detección en `parse_pdf`), pero **a diferencia de optativas se quedan en su propio semestre real** (`semestre = current_semester` en el momento de la detección, no `max + 1`) — representan una materia obligatoria de esa etapa del plan, no una optativa libre. Se preserva el número que ya trae el PDF (`AREA-{n}`, `nombre: "Materia {n} de Área de Concentración"`) en vez de renumerar — es estable y sin ambigüedad.

**Palabras partidas en letras sueltas** (`merge_letter_runs`, solo confirmado en `RI-E/F/G`): algunos PDFs renderizan "Optativa" como tokens de una sola letra (`'O','p','t','a','t','i','v','a'`) con un espaciado entre letras casi idéntico al espaciado normal entre palabras en ese PDF — un umbral de distancia no sirve para distinguirlos. Se reconstruye el texto por contenido en su lugar: corridas consecutivas de tokens de una sola letra alfabética se unen en una sola palabra, dejando intactas las palabras normales. Se usa en los 3 puntos donde `parse_pdf` arma texto desde `name_words` (los dos de detección de slots + el nombre de materia real).

### Planes con múltiples áreas de concentración (`AREA_HEADER_RE`)

13 PDFs (`ACT-D/E/F/G`, `ECD-A`, `ECO-E/F/G/H/I`, `EDF-B/C/D`) no son un solo plan: son un **tronco común** (todo lo parseado antes del primer match, tenga o no la etiqueta "TRONCO COMÚN" impresa — `ADM-D` no la trae) seguido de 2-5 secciones **"ÁREA DE CONCENTRACIÓN: NOMBRE"** completas, cada una repitiendo los semestres finales con materias específicas de esa área (ej. Actuaría: Seguros/Estadística/Riesgos Financieros). Cada repetición termina con una referencia corta `"**Ver notas al Plan de Estudios"` que `END_OF_PLAN_RE` confundía con el encabezado real de fin de plan (bug ya corregido — `INLINE_FOOTNOTE_RE`, cualquier línea que empiece con `**`/`*` + "Ver notas", lo distingue del fin real que nunca lleva asteriscos).

`parse_pdf` maneja esto con **secciones** (`_new_section()`): arranca con una sección `(None, ...)` para el tronco; al encontrar `AREA_HEADER_RE` cierra la sección activa y abre una nueva **copiada del tronco** (`sections[0]`, no de la sección previa — así un área no hereda las materias específicas de OTRA área), con su propio `courses`/`coreq_groups`/`optativa_credits`/`area_concentracion` independientes. `parse_pdf` regresa `dict[label | None, tuple[courses, real_count]]`:
- Sin áreas (186 de 199 planes): un solo entry `{None: (courses, real_count)}`.
- Con áreas: un entry por área (`{"SEGUROS": (...), "ESTADÍSTICA": (...), ...}`) — **sin** entry para el tronco solo, que no es un plan usable por sí mismo.

### Correquisitos

Marcadores `(A)`, `(B)` en la columna de nombre → agrupados por `(semestre, marker)`, **por sección** (cada área tiene su propio `coreq_groups`, heredado del tronco al momento de crear la sección).

**La misma letra se reutiliza para varias parejas independientes dentro de un mismo semestre** — el PDF no usa una letra distinta por pareja (el pie de página lo dice explícitamente: *"(A) Estos pares de materias se deben cursar de manera simultánea..."* / *"(A) Cada par de materias se debe cursar..."*, siempre en plural). El orden de aparición en la tabla es lo que indica la pareja real: al aplicar los correquisitos, cada `(semestre, marker)` se empareja de dos en dos en ese orden (no se trata el grupo entero como un clique donde todos son pareja de todos). `dict.fromkeys` además quita duplicados — algunas materias quedan agregadas más de una vez al mismo grupo (su stub se libera más de una vez), lo que sin deduplicar producía una clave repetida en `coreqs`.

Cada materia recibe en el JSON de salida la(s) clave(s) real(es) de su pareja (`"coreqs": ["LEN-12722"]`), no una bandera genérica — así el frontend (`resolveCoreqGroup` en `src/algorithms/coreqs.ts`) no necesita re-adivinar la agrupación por semestre.

### Validación de sanidad

Por cada sección devuelta, `real_course_count` cuenta solo materias reales, sin las `OPTATIVA-N`/`AREA-N` sintéticas. En `main()`, el chequeo compara el **total** (`real_course_count + n_optativas + n_area`) contra `MIN_MATERIAS` (38), no solo lo real — un plan optativa-pesado (ej. MA-C: 37 reales + 9 optativas = 46) no debe marcarse sospechoso solo por tener pocas materias con clave fija. Si el total queda por debajo, el plan se agrega a la lista de sospechosos que se imprime al final de la corrida (no bloquea la generación, solo avisa) — pensado para detectar PDFs con formato distinto o fallos de parseo silenciosos.

### Output

- Un JSON por sección: `{PROG}-{LETRA}-plan-estudios.json` (sin área), o `{PROG}-{LETRA}-{AREA-SLUG}-plan-estudios.json` (`area_slug`: mayúsculas sin acentos vía `unicodedata.normalize('NFKD', ...)` — nombres de archivo ASCII-safe entre Windows/Linux/git, ya que el deploy corre en Ubuntu).
- `main()` **borra todo `*-plan-estudios.json` existente en `jsonPEs/2025_01/` antes de regenerar** — el directorio siempre refleja exactamente lo que las PDFs de hoy producen; si no se limpiara, cambiar el esquema de nombres (como pasó al separar áreas) dejaría archivos huérfanos con el nombre viejo.
- Resumen al terminar: `Generados: N | Omitidos: N | Errores: N`, más la lista de planes sospechosos (`< MIN_MATERIAS` materias en total) si los hay.

> ⚠️ `.gitignore` tenía `2025_01/` sin anclar a la raíz — esa regla también ignoraba `jsonPEs/2025_01/` (cualquier carpeta con ese nombre, a cualquier profundidad), así que los JSON de área nuevos quedaban invisibles para git. Ya corregido a `/2025_01/`.
