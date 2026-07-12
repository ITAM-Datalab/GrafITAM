# Schedule (`src/components/schedule/`)

Pestaña "Planear Horario" — segunda vista de la app (toggle en `App.tsx`, sin react-router). Dominio independiente del plan de estudios: usa `useScheduleStore` (`src/store/scheduleStore.ts`) para los grupos/horarios y solo lee de `useCurriculumStore` la lista de materias `planeada` del plan activo (más las agregadas a mano por búsqueda, que no viven en `useCurriculumStore` — ver `MateriaSearchBar.tsx`).

## `ScheduleTab.tsx`

- Filtra `planData` por `userState[id].planeada === true` → lista de materias a planear horario (`plannedCourseIds`). Se combina con `manualCourseIds` (ver `MateriaSearchBar.tsx` abajo) en `allTrackedCourseIds = [...plannedCourseIds, ...manualCourseIds]` — esa es la lista que realmente se dibuja, se colorea y se exporta; `plannedCourseIds` solo (sin las manuales) ya no se usa para nada visual.
- Selector de periodo (`<select>`, solo visible si `horarioPeriodos.length > 1`) → `setPeriodo(slug)` del store. Por defecto se carga el último periodo publicado (ver store).
- Cada materia trackeada tiene un color fijo de `coursePalette.ts` (`getCourseColor(courseId, allTrackedCourseIds)`), mostrado como punto de color junto al nombre y como fondo de la fila cuando el grupo está seleccionado.
- Por materia sin grupos para el periodo elegido: mensaje "Sin grupos programados..." (no hay textarea/importación manual).
- Por materia con grupos: radio buttons (uno por grupo) con `selectGroup`/`clearGroup`. El `<input type="radio">` usa `onClick` (no `onChange`) para el toggle — un radio nativo no dispara `onChange` si vuelves a hacer click en el que ya está marcado, por eso el handler vive en `onClick` con `checked` controlado por React (`onChange` queda como no-op solo para evitar el warning de input controlado).
- `hasConflict` se calcula para **todas** las filas (estén o no seleccionadas) contra `selectedGroupObjects` de otras materias — así se avisa el traslape *antes* de elegir, no solo después. Estilo: borde punteado `alert-rust` (`#8C5E58`) + texto "Traslapa con tu selección actual" si hay conflicto; el fondo de color de materia solo aparece si la fila está `isSelected` (para no confundir "hay conflicto" con "está elegido").
- Botón "Auto-asignar horario sin traslapes" → `autoAssign(allTrackedCourseIds)` del store. **Importante**: pasar explícitamente la lista de materias a considerar — antes se le pasaba nada y corría sobre TODO `groupsByCourse` (~500 materias del periodo completo, no solo las trackeadas), lo cual congelaba la pestaña por el backtracking exponencial de `autoAssignSchedule`.
- Si `course.coreqGroup.length > 0`, debajo del nombre de la materia se muestra una nota ("⚭ Correquisito — llevar junto con...") con los nombres de las materias del grupo. Solo aplica a materias del plan (`course = planData?.[courseId]` puede ser `undefined` para una materia agregada por búsqueda, que no vive en `planData`).
- Botón "Descargar horario (Excel)": `import()` dinámico de `scheduleExport.ts` (no estático — `exceljs` pesa ~950 KB sin minificar/~272 KB gzip, y así solo se descarga cuando alguien realmente exporta, en vez de inflar el bundle principal para todos). Exporta **todos** los horarios guardados del periodo actual (uno por hoja).
- **Layout responsive**: la raíz es `flex flex-col md:flex-row` — por debajo de `md:` el sidebar (antes `w-[420px]` fijo, más ancho que cualquier celular) pasa a `w-full` y se apila ARRIBA del calendario en vez de ir al lado; cada panel deja de manejar su propio scroll interno en móvil (`overflow-visible`) y es la raíz (`overflow-y-auto`) la que scrollea la pestaña completa. A partir de `md:` el comportamiento vuelve a ser el original: sidebar de ancho fijo con su propio scroll, calendario a la derecha con el suyo.

## `MateriaSearchBar.tsx`

Buscador por clave (ej. `EST-24124`) para ver el horario de **cualquier materia del periodo**, esté o no en el plan de estudios cargado — pensado para optativas, que `jsonPEs/` no incluye (ver "Issues conocidos de los datos" en el `CLAUDE.md` raíz). No hace falta traer datos extra: `groupsByCourse` ya trae **todo** el catálogo scrapeado del periodo (~500 materias, no solo las del plan — ver sección del scraper abajo), así que el buscador solo filtra `Object.keys(groupsByCourse)` por substring de clave o nombre (sin distinguir mayúsculas), excluyendo lo que ya está en `trackedCourseIds` (prop, recibe `allTrackedCourseIds` de `ScheduleTab`). Click en un resultado → `addManualCourse(id)` del store.

Las materias agregadas así (`manualCourseIds`) se dibujan con el mismo código que las del plan en `ScheduleTab.tsx`, con una etiqueta "Agregada por búsqueda" y un botón "×" → `removeManualCourse(courseId)` (que además limpia cualquier grupo seleccionado para esa clave — si no, `selectedGroupObjects` la seguiría mostrando en el calendario aunque ya no esté en el sidebar).

## `ScheduleOptionsBar.tsx`

Selector de "horarios guardados" (`SavedSchedule[]`) del periodo activo — pensado para cuando un grupo se cierra y hay que rearmar con otra combinación sin perder la anterior. Un tab por horario (`setActiveSchedule`), y sobre el tab activo: renombrar (✎), duplicar (⧉, útil como respaldo antes de intentar inscribirse), eliminar (×, oculto si solo queda uno — siempre debe existir al menos un horario por periodo) y "+ Nueva opción". Usa `window.prompt`/`window.confirm` nativos en vez de un modal propio — consistente con mantener esta feature simple.

Botón "Limpiar horario" → `clearPeriodoSchedule()` del store, con `window.confirm` previo (destructivo). Resetea **todo el periodo activo**: vuelve a un solo horario "Opción A" vacío y borra `manualCourseIdsByPeriodo` de ese periodo — no toca otros periodos. Existe porque `scheduleStore` es independiente de `curriculumStore` (ver `src/store/CLAUDE.md`): cambiar de plan/generación en `PlanSelector.tsx` nunca limpia el horario por sí solo, así que este botón es la vía manual para "empezar de cero" después de cambiar de plan.

## `coursePalette.ts`

10 colores fijos (`COURSE_PALETTE`) validados con el skill `dataviz` (`node scripts/validate_palette.js "<10 hex>" --mode light --pairs all` → ALL CHECKS PASS; la separación CVD de un par queda en la banda piso 8-12, aceptable porque cada bloque siempre lleva etiqueta directa de clave+nombre, no depende solo del color). `getCourseColor(courseId, orderedCourseIds)` asigna por índice (`orderedCourseIds.indexOf(courseId) % 10`) — el orden viene de `plannedCourseIds` (orden del plan de estudios), no del orden real en que el usuario marcó cada materia como planeada; es una simplificación deliberada para no necesitar estado nuevo en el store.

## `ScheduleCalendar.tsx`

Grid semanal (LU-SA, horas 7:00-22:00, 1px = 1 minuto) de los grupos en `selectedGroups`, con fondo `bg-base-cream` y líneas de hora/día marcadas (`itam-dark/25`) para que se vean sobre el fondo de la app. El grid tiene un `min-width: 560px` y su contenedor es `overflow-x-auto` — en pantallas angostas el fallback es scroll horizontal en vez de columnas de día ilegibles (las 6 columnas usan `1fr`, sin piso propio). Cada bloque usa el color de su materia (`coursePalette.ts`); si hay traslape con otro bloque seleccionado, se le agrega un borde punteado `#8C5E58` encima (no se repinta de rojo sólido, para no perder de vista de qué materia es). El bloque muestra 3 líneas: clave + nombre, salón, y profesor + horario — con wrap normal (no `truncate` de una sola línea) y una altura mínima de 26px para que hasta las clases más cortas alcancen a mostrarlas; el `overflow-hidden` del bloque sigue como red de seguridad si aun así no caben, y el `title` del div trae el detalle completo (incluyendo salón) para hover.

Los bloques que se traslapan en el mismo día se reparten el ancho en columnas iguales (estilo Google Calendar) vía `layoutDayBlocks` (`src/algorithms/calendarLayout.ts`), llamado una vez por día sobre los bloques de ese día.

## `scheduleExport.ts`

`downloadScheduleWorkbook(schedules, groupsByCourse, courseNames, orderedCourseIds, fileNameBase)` genera un `.xlsx` con **una hoja por `SavedSchedule`** (nombrada como `schedule.name`, con des-duplicado tipo "Opción A (2)" si dos horarios comparten nombre) usando `exceljs` — es el único paquete gratuito que soporta relleno de color de celda desde el navegador (el `xlsx`/SheetJS gratuito no lo soporta).

Basado en revisar el archivo real de referencia de Braulio (`Horario Plantilla.xlsx`, inspeccionado con `openpyxl`, no solo la captura) — ahí la plantilla apila varios grids verticalmente en una sola hoja según fue rearmando su horario; aquí se optó por una hoja por opción en vez de apilar (mismo contenido, estructura más simple y sí escala a N opciones).

Por hoja:
- Grid semanal LU-SA en franjas de 30 min (7:00-22:00, mismas constantes que `ScheduleCalendar.tsx`), encabezado de día en negrita/gris (`BFBFBF`).
- Por cada grupo seleccionado en ese horario: celdas combinadas (`mergeCells`) del rango de tiempo (redondeado a franjas de 30 min), rellenas con el hex de `coursePalette.ts` de esa materia (directo, sin replicar el sistema de tema+tinte de Excel), texto en 3 líneas `{clave} {nombre}\n{profesor}\n{salón}`.
- **Traslapes sin resolver**: si dos grupos seleccionados chocan en el mismo horario/día, se queda el primero que se procesó y el resto no se dibuja en esa celda (a diferencia de `ScheduleCalendar.tsx`, que sí los parte en columnas) — limitación de alcance aceptada, un Excel no se presta bien a sub-dividir una celda.
- Tabla lateral "Materia | CRNs | 2da Opción" (mismo header gris/negrita) — clave de materia + CRN seleccionado; "2da Opción" siempre vacía (para llenar a mano, igual que en la plantilla real de Braulio, donde nunca se llenó).
- Descarga vía `Blob` + `<a>` temporal.

Test (`scheduleExport.test.ts`) simula las APIs de navegador (`Blob`, `URL.createObjectURL`, `document.createElement`) con `vi.stubGlobal` para capturar el buffer generado, y lo relee con `ExcelJS.Workbook().xlsx.load()` para verificar celdas/merges/colores/nombres de hoja — no es un test manual, corre en `npm test`.

## `ReportIssueModal.tsx`

Botón "¿No encuentras tu materia, grupo o plan?" que abre un modal (tipo de problema, clave de materia, nombre, grupo/CRN, carrera/plan, comentario). Al enviar arma una URL `github.com/ITAM-Datalab/GrafITAM/issues/new?title=...&body=...` prellenada y la abre en pestaña nueva — el usuario le da clic a "Submit" del lado de GitHub. Cero backend propio; no se pueden adjuntar PDFs vía querystring, solo describir el plan/carrera en texto.

Vive en el header de `App.tsx` (junto al tab-switcher, alineado a la derecha), no en el sidebar de `ScheduleTab` — así queda accesible sin importar en qué pestaña estés (Plan de Estudios u Horario). No depende de ningún store ni prop, así que el montaje es independiente de la pestaña activa.

## Cómo se llenan los datos: scraper automático (`horarios_scraper.py`, raíz del repo)

ITACA (`itaca2.itam.mx:8443/b9prod/edsup/BWZKSENP.P_MenuServNoPers`) es un portal Banner público — "Servicios no personalizados" **no requiere login**. El formulario real de búsqueda (confirmado inspeccionando el HTML crudo, no visible vía herramientas que renderizan a Markdown) es:

```html
<form action="BWZKSENP.P_Horarios2" method="POST">
  <input type="hidden" name="s" value="3077" />
  <select name="txt_materia">
    <option>ACT-11300-CALCULO ACTUARIAL I</option>
    ...
  </select>
</form>
```

- El menú (`P_MenuServNoPers`) lista varios periodos LICENCIATURA a la vez (ej. PRIMAVERA/VERANO/OTOÑO del mismo año), cada uno con su propio código `s=`. **Los códigos cambian cada semestre sin patrón fijo** (se van agregando incrementalmente a lo largo del año) — por eso el scraper los descubre leyendo el menú en cada corrida en vez de tenerlos fijos.
- Las materias en `P_Horarios1?s=...` están organizadas por **departamento** (ADM, MAT, ACT, ...), no por carrera — como los `courseId` de `jsonPEs/` ya usan claves de departamento, scrapear todas las materias de un periodo cubre automáticamente todas las carreras.
- Por cada materia se hace `POST` a `P_Horarios2` con `s` + `txt_materia` (el texto exacto de la opción) y se parsea la tabla de resultados (columnas `DEPTO.`, `CLAVE`, `GRUPO`, `CRN`, `TEORÍA O LABORATORIO`, `NOMBRE`, `PROF.`, `CRÉDITOS`, `HORARIO`, `DÍAS`, `SALÓN`, `CAMPUS`, `COMENTARIOS` — solo se usan las que mapean a `ScheduleGroup`).
- `courseId` = `DEPTO-CLAVE` (ej. `ACT-11300`).

### Output: `jsonHorarios/`

- Un JSON por periodo: `jsonHorarios/{slug}.json`, forma `Record<courseId, Omit<ScheduleGroup, 'courseId'>[]>` (el `courseId` se inyecta al cargar, en `src/data/horariosLoader.ts`, igual que antes hacía `ScheduleTab` a mano).
- Manifiesto `jsonHorarios/index.json`: `HorarioPeriodo[]` — `{ slug, label, sCode, scrapedAt, materiasConGrupos }`, en el orden en que aparecen en el menú (el último de la lista es el "último publicado", que es el default de la UI).

### Automatización

`.github/workflows/scrape-horarios.yml` corre el scraper diario (cron) + `workflow_dispatch` manual. Si `jsonHorarios/` cambió, commitea directo a `main` con identidad `github-actions[bot]` — ese push dispara `deploy.yml` y republica GitHub Pages con datos frescos.

### Correr manualmente

```bash
python horarios_scraper.py   # auto-instala requests + beautifulsoup4 si faltan
```
