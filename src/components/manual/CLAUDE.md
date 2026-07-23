# Manual (`src/components/manual/`)

Pestaña "Manual" — tercera vista de la app (toggle en `App.tsx`, junto a "Plan de Estudios" y "Planear Horario"), sin react-router.

## `ManualTab.tsx`

Contenido estático (copy en español, sin datos de ningún store). Títulos de sección formulados como preguntas que el usuario realmente se haría ("¿Cómo marco una materia como aprobada o planeada?", "¿Por qué una flecha se ve punteada?"), no como nombres de feature — aplicando los principios de *minimalismo* de John Carroll (IBM, ver `The Nurnberg Funnel`): orientación a tareas reales en vez de narrativa exhaustiva, prosa breve, y soporte explícito de reconocimiento/recuperación de errores (la sección de la flecha punteada y la de "no encuentro mi materia" existen justo para eso — reconocer que algo se ve raro y saber qué hacer). El formato de pregunta también favorece "leer para localizar" (el usuario escanea títulos buscando su duda puntual) sobre leer todo de corrido.

Cubre: qué es GrafItam, cómo elegir plan, cómo marcar aprobada/planeada (con los 5 estados visuales de una materia, ver tabla en `src/components/CLAUDE.md`), prerrequisitos/correquisitos y el hover-highlight, el error topológico (arista punteada), la pestaña Planear Horario, y el botón de reportar un problema (`ReportIssueModal.tsx`, ver `src/components/schedule/CLAUDE.md`).

No es un modal — a diferencia de `ReportIssueModal.tsx` (pensado para una acción puntual), el manual es contenido de lectura extensa, por eso vive como pestaña completa en `<main>` en vez de un overlay.

`Section`/`StateRow` son componentes internos de solo presentación (no exportados) — `StateRow` recibe el swatch de color como `CSSProperties` tipado (no como string a parsear), replicando los mismos valores hex que `CourseNode.tsx` usa para cada estado, para que la leyenda no se desincronice visualmente si ese archivo cambia de paleta.
