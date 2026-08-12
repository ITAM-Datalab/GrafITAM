# Pendientes

Lista de issues/mejoras detectadas, sin código todavía — solo para no perderlas de vista.

## 1. Secciones duplicadas cuando un mismo CRN/horario tiene varios profesores — ✅ implementado

**Ejemplo real:** `ADM-12302 Tópicos de Negocios II` — ITACA reporta 3 filas para esa materia: mismo CRN, mismo grupo, mismo horario y mismos días, y la única columna que cambia es el profesor. Hoy la pestaña "Planear Horario" muestra **3 secciones** distintas (una por profesor), cuando debería mostrarse **1 sola sección** — como se mostraba antes.

**Contexto:** No es el mismo caso que el fix reciente de teoría+laboratorio (issue #24, ya corregido) — ahí el mismo CRN trae horarios/días *distintos* (teoría un día, laboratorio otro) y sí deben mostrarse como bloques separados dentro de la misma sección. Aquí el horario es **idéntico** en las 3 filas; lo único distinto es el profesor — probablemente una materia con varios profesores asignados al mismo grupo (team-teaching, o el dato viene repetido en ITACA por cada profesor). Hay que decidir el criterio correcto: ¿agrupar por (CRN + horario + día) y mostrar todos los profesores juntos en una sola tarjeta?, ¿quedarse solo con el primero?, ¿mostrar "profesor 1 / profesor 2 / profesor 3"?

**Resuelto:** se agregó `groupSessions` en `src/algorithms/scheduleOverlap.ts` — sub-agrupa las filas de un CRN por `(horario, dias)` y une los profesores con `" / "`. Aplicado en `ScheduleTab.tsx`, `ScheduleCalendar.tsx` y `scheduleExport.ts`. Verificado en navegador con `ADM-12302` CRN 2574 (3 profesores, 1 sola tarjeta/bloque).

## 2. Ampliar los "tipos de problema" del formulario de reporte — ✅ implementado

**Contexto:** `ReportIssueModal.tsx` (botón "Reporta un problema") hoy solo tiene 4 categorías:
- `materia_faltante` — "Materia no aparece en horarios"
- `grupo_incorrecto` — "Grupo/CRN incorrecto o faltante"
- `plan_faltante` — "Plan de estudios no encontrado"
- `otro` — "Otro problema"

**Por qué hace falta revisarlas:** de los issues reales recibidos hasta ahora (#23, #24, #25), 2 de 3 (#23 y #24) cayeron en la categoría genérica "Otro problema" porque no encajaban bien en ninguna de las 3 categorías específicas existentes — ambas categorías específicas están pensadas para *horarios* (materia/grupo no aparece), pero los reportes reales también incluyen:
- Datos incorrectos generados desde el PDF del plan de estudios (ej. #23: número de optativas equivocado, materias de área mal clasificadas) — no es que falte un grupo de horario, es que el **plan de estudios en sí** (el grafo/DAG) trae un dato mal parseado.
- Horario incompleto para una materia que sí aparece, pero le falta una sesión (ej. #24: falta el bloque de laboratorio) — distinto de "grupo incorrecto o faltante" (que suena a CRN equivocado, no a sesión faltante dentro de un CRN que sí existe).

**Resuelto:** se agregaron `horario_incompleto` ("Horario incompleto...") y `plan_dato_incorrecto` ("Dato incorrecto en el plan de estudios...") a `TipoProblema`/`TIPO_LABELS` en `ReportIssueModal.tsx`. Catálogo único (sin filtrar por pestaña activa, decisión de producto). Ambas usan el mecanismo "Otro" del Google Form (`TIPO_FORM_OPTION = null`) — no se tocó el form real. `isValid` se generalizó a una tabla `REQUIRED_FIELD` en vez de un ternario anidado.

## 3. `ECO-I.pdf` usa "Electiva N de área de concentración" — el parser no lo reconoce — ✅ implementado

**Contexto:** detectado al investigar los issues #23/#25 (verificado con `pdfplumber` directo sobre el PDF, no es una suposición). En las 5 áreas de concentración de `ECO-I` (Ciencia de Datos, Empresarial, Finanzas, Fundamentos, Políticas Públicas) el PDF usa el texto **"Electiva N de área de concentración"** para los slots de especialización sin clave real — en vez de "Materia N de Área de Concentración", que es la única forma que reconoce `AREA_CONCENTRACION_SLOT_RE` en `txt_json.py`. Como ningún regex existente matchea "Electiva...", esas filas caen en la rama genérica de "posible nombre de la siguiente materia" y **se descartan en silencio**.

**Impacto verificado:** no corrompe el nombre de ninguna materia real (se revisó cada JSON de `ECO-I-*` y ninguna trae texto "Electiva" ni "área de" colado en su `nombre`) — el dato simplemente se pierde sin dejar rastro, no genera una entrada `AREA-N` para esos slots. No es el mismo bug que #23/#25 (que era de `OPTATIVA`, no de `AREA_CONCENTRACION_SLOT_RE`) y no afecta a los 3 issues ya cerrados — es un hallazgo aparte, no corregido.

**Resuelto:** `AREA_CONCENTRACION_SLOT_RE` ahora acepta también el prefijo `Electiva\s+(\d+)\s+de\s+...`. **Hallazgo adicional durante la implementación** (confirmado con `pdfplumber`, no en el diagnóstico original): 2 de las 5 áreas (Finanzas, Empresarial) traen un único slot de este tipo sin numerar — texto literal **"Electiva de área de concentración"** (sin "N") — porque el PDF no numera cuando solo hay uno. Se agregó `AREA_CONCENTRACION_SLOT_SINGULAR_RE` como fallback (tratado como slot `1`) para cubrir ese caso también. Verificado: los 5 archivos `ECO-I-*-plan-estudios.json` ahora generan exactamente los slots `AREA-N` que trae el PDF (Fundamentos +2, Políticas Públicas +3, Finanzas +1, Empresarial +1, Ciencia de Datos +2), sin cambiar el conteo de materias reales de ningún archivo, y sin afectar ningún otro plan fuera de `ECO-I-*`.
