# Data (`src/data/`)

## `loader.ts`

Carga todos los planes en bundle-time con Vite glob:

```ts
import.meta.glob('/jsonPEs/2025_01/*.json', { eager: true, import: 'default' })
```

Los 199 JSONs quedan embebidos en el bundle JS. No hay fetch en runtime.

### `parseFilename(path)`

Convierte `/jsonPEs/2025_01/CDA-A-plan-estudios.json` → `{ filename, program: "CDA", letter: "A" }`. Usa `lastIndexOf('-')` en el stem (sin extensión ni sufijo `-plan-estudios`) para soportar programas de 2 chars (`MA`, `RI`).

### `loadPlanData(filename): PlanData`

1. Resuelve `rawModules["/jsonPEs/2025_01/" + filename]`.
2. Llama `detectCoreqGroups(raw)` → mapa `id → [partners]`.
3. Para cada materia, clasifica sus `prerreqs`:
   - `presentPrerreqs`: IDs que existen en el plan → generan aristas en el grafo.
   - `danglingPrerreqs`: IDs que no existen → guardados pero ignorados en renderizado.
4. Construye y retorna `PlanData`.

---

## `txt_json.py` — Pipeline PDF → JSON

Convierte PDFs del ITAM en `2025_01/` a JSONs en `jsonPEs/2025_01/`.

```bash
python txt_json.py   # procesa todos los PDFs, imprime resumen OK/SKIP/ERROR
```

Requiere `pdfplumber` (se instala automáticamente si falta).

### Detección de columnas (`detect_column_bounds`)

Lee las primeras 2 páginas buscando las palabras "Prerrequisito(s)", "Clave" y "Crédito(s)" (acepta variantes: Crds., Crd., etc.). Calcula los límites `x` de las cuatro columnas: prerreqs / clave / materia / créditos.

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

**Sección MATERIAS OPTATIVAS**:
- Si aparece el header "MATERIAS OPTATIVAS" → `_flush_stub` + `in_optativas = True`.
- Si aparece un slot "Optativa I/II/III" sin código → `_flush_stub` + se descarta (evita corrupción del nombre del último stub).
- Un encabezado de semestre después del header resetea `in_optativas = False`.

### Correquisitos

Marcadores `(A)`, `(B)` en la columna de nombre → agrupados por `(semestre, marker)`. Si el grupo tiene ≥ 2 materias, todas reciben `coreqs: ["CORREQ"]` en el JSON de salida.

### Output

- Un JSON por plan: `{PROG}-{LETRA}-plan-estudios.json`
- Resumen al terminar: `Generados: N | Omitidos: N | Errores: N`
