"""
Convierte PDFs de planes de estudio del ITAM (2025_01/) a JSONs para GrafItam.
Salida: jsonPEs/2025_01/{PLAN_CODE}-plan-estudios.json

Schema de salida:
{
  "COM-11101": {
    "semestre": 1, "nombre": "Algoritmos y Programas",
    "creditos": 9, "prerreqs": [], "coreqs": [], "optativa": false, "estado": 0
  }
}
"""

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path


def ensure_pdfplumber():
    try:
        import pdfplumber
        return pdfplumber
    except ImportError:
        print("Instalando pdfplumber...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pdfplumber"], check=True)
        import pdfplumber
        return pdfplumber


COURSE_CODE_RE = re.compile(r'[A-Z]{2,4}-?\d{5}')

SEMESTER_MAP = {
    'PRIMER': 1, 'SEGUNDO': 2, 'TERCER': 3, 'CUARTO': 4, 'QUINTO': 5,
    'SEXTO': 6, 'SÉPTIMO': 7, 'SEPTIMO': 7, 'SÉPTIMO': 7,
    'OCTAVO': 8, 'NOVENO': 9, 'DÉCIMO': 10, 'DECIMO': 10,
}

END_OF_PLAN_RE = re.compile(
    r'(NOTAS?\s+AL\s+PLAN|SERVICIO\s+SOCIAL)',
    re.IGNORECASE
)

SEMESTER_RE = re.compile(
    r'(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\s+SEMESTRE',
    re.IGNORECASE
)

OPTATIVAS_RE = re.compile(r'MATERIAS?\s+OPTATIVAS?', re.IGNORECASE)

# Renglón de slot genérico de optativa: "Optativa I", "Optativa II (**)", etc.
OPTATIVA_SLOT_RE = re.compile(r'^Optativas?\s*([IVXLCDM]+|\d+)?\s*(\([*]+\))?\s*$', re.IGNORECASE)

HEADER_RE = re.compile(r'Prerrequisitos|Clave', re.IGNORECASE)

COREQ_MARKER_RE = re.compile(r'\(\s*([A-Z])\s*\)')


def normalize_code(code: str) -> str:
    """Normaliza MAT12201 → MAT-12201 (agrega guión si falta)."""
    return re.sub(r'^([A-Z]{2,4})(\d{5})$', r'\1-\2', code)


def extract_codes_from_text(text: str) -> list[str]:
    """Extrae todos los códigos de materia de un string, normalizando sin-guión."""
    raw = COURSE_CODE_RE.findall(text)
    return [normalize_code(c) for c in raw]


def extract_plan_code(stem: str) -> str | None:
    """
    "CCI-A_Compu e Indust" -> "CCI-A"
    "IMA-A_ Mate e IA"    -> "IMA-A"
    "CDA-A"               -> "CDA-A"
    "DARLE"               -> None
    """
    m = re.match(r'^([A-Z]{2,4}-[A-Z])(?:[_\s]|$)', stem)
    return m.group(1) if m else None


def group_words_by_row(words: list[dict], y_tolerance: float = 3.0) -> list[list[dict]]:
    """Agrupa palabras en filas según su coordenada 'top' (y_tolerance px de margen)."""
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (w['top'], w['x0']))
    rows: list[list[dict]] = []
    current_row: list[dict] = [sorted_words[0]]
    current_y = sorted_words[0]['top']

    for word in sorted_words[1:]:
        if abs(word['top'] - current_y) <= y_tolerance:
            current_row.append(word)
        else:
            rows.append(current_row)
            current_row = [word]
            current_y = word['top']
    rows.append(current_row)
    return rows


def row_text(row: list[dict]) -> str:
    return ' '.join(w['text'] for w in row)


def detect_column_bounds(pdf) -> dict | None:
    """
    Detecta los límites de columnas leyendo las palabras de encabezado en la
    primera página. "Prerrequisito(s)" y "Clave" pueden estar en filas distintas
    (DER-F/G); "Créditos" puede abreviarse como "Crds." o "Crd." (ACT/DFI/IND).
    Devuelve {'prereq_x': float, 'materia_x': float, 'credits_x': float}
    """
    CLAVE_RE = re.compile(r'^Clave$', re.IGNORECASE)
    PREREQ_RE = re.compile(r'^Prerrequisitos?$', re.IGNORECASE)
    # Matches: Créditos, Crédito, Crds., Crd., Crds, Crd
    CREDITS_RE = re.compile(r'^Cr[eé]?d(itos?|s?\.?)$', re.IGNORECASE)

    prereq_word = None
    clave_word = None
    credits_word = None

    for page in pdf.pages[:2]:
        words = page.extract_words(x_tolerance=3, y_tolerance=3)
        for w in words:
            t = w['text']
            if prereq_word is None and PREREQ_RE.match(t):
                prereq_word = w
            if clave_word is None and CLAVE_RE.match(t):
                clave_word = w
            if credits_word is None and CREDITS_RE.match(t):
                credits_word = w

        if clave_word:
            break

    if not clave_word:
        return None

    if prereq_word:
        prereq_x = (prereq_word['x1'] + clave_word['x0']) / 2
    else:
        prereq_x = clave_word['x0'] - 15

    materia_x = clave_word['x1'] + 5
    credits_x = credits_word['x0'] if credits_word else 999

    return {'prereq_x': prereq_x, 'materia_x': materia_x, 'credits_x': credits_x}


def _flush_stub(stub: dict | None, courses: dict, coreq_groups: dict) -> None:
    """Guarda el stub en courses si tiene nombre y créditos completos."""
    if stub and stub.get('nombre') and stub.get('creditos', 0) > 0:
        sid = stub['id']
        courses[sid] = {
            'semestre': stub['semestre'],
            'nombre': stub['nombre'],
            'creditos': stub['creditos'],
            'prerreqs': stub['prerreqs'],
            'coreqs': [],
            'estado': 0,
        }
        if stub.get('marker'):
            coreq_groups[(stub['semestre'], stub['marker'])].append(sid)


def parse_pdf(pdf_path: Path, pdfplumber) -> dict:
    """Parsea un PDF de plan de estudios y retorna el dict de materias."""
    courses: dict[str, dict] = {}
    coreq_groups: dict[tuple, list[str]] = defaultdict(list)

    with pdfplumber.open(str(pdf_path)) as pdf:
        col = detect_column_bounds(pdf)
        if col is None:
            return {}

        prereq_x = col['prereq_x']
        materia_x = col['materia_x']
        credits_x = col['credits_x']

        current_semester = 0
        pending_prereq_words: list[dict] = []
        # stub: materia en construcción (nombre y/o créditos pueden llegar en filas separadas)
        # Se libera al iniciar la siguiente materia o al cambiar de semestre.
        pending_stub: dict | None = None
        # nombre acumulado de filas de solo-nombre ANTES del código (patrón CDA-B)
        pending_name: str = ''
        in_optativas = False
        done = False

        for page in pdf.pages:
            if done:
                break

            words = page.extract_words(x_tolerance=3, y_tolerance=3)
            rows = group_words_by_row(words, y_tolerance=4)

            for row in rows:
                if done:
                    break

                text = row_text(row)

                # Fin real del plan (notas al plan, servicio social)
                if END_OF_PLAN_RE.search(text):
                    done = True
                    break

                # Encabezado de columnas repetido entre páginas — saltar
                if 'Prerrequisito' in text and 'Clave' in text:
                    continue

                # Inicio de sección optativas: limpiar estado pendiente y saltar la sección
                if OPTATIVAS_RE.search(text) and 'Clave' not in text:
                    _flush_stub(pending_stub, courses, coreq_groups)
                    pending_stub = None
                    pending_name = ''
                    in_optativas = True
                    continue

                # Mientras estemos en la sección optativas, saltar todo excepto encabezados de semestre
                if in_optativas:
                    if not SEMESTER_RE.search(text):
                        continue
                    in_optativas = False
                    # cae al bloque de SEMESTER_RE abajo

                # Encabezado de semestre
                m_sem = SEMESTER_RE.search(text)
                if m_sem:
                    _flush_stub(pending_stub, courses, coreq_groups)
                    pending_stub = None
                    pending_prereq_words = []
                    pending_name = ''
                    key = m_sem.group(1).upper()
                    current_semester = SEMESTER_MAP.get(key, SEMESTER_MAP.get(key.replace('É', 'E'), 0))
                    continue

                if current_semester == 0:
                    continue

                # Clasificar palabras por columna
                prereq_words = [w for w in row if w['x0'] < prereq_x]
                clave_words  = [w for w in row if prereq_x <= w['x0'] < materia_x]
                name_words   = [w for w in row if materia_x <= w['x0'] < credits_x]
                cred_words   = [w for w in row if w['x0'] >= credits_x]

                # Extraer course_id de la columna Clave
                clave_text = ' '.join(w['text'] for w in clave_words)
                clave_codes = extract_codes_from_text(clave_text)
                course_id = clave_codes[0] if clave_codes else None

                if not course_id:
                    if pending_stub:
                        # Acumular información adicional en el stub existente
                        if name_words:
                            name_text2 = ' '.join(w['text'] for w in name_words).strip()
                            # Slot genérico de optativa — liberar stub y descartar el renglón
                            if OPTATIVA_SLOT_RE.match(name_text2):
                                _flush_stub(pending_stub, courses, coreq_groups)
                                pending_stub = None
                                pending_name = ''
                            else:
                                m2 = COREQ_MARKER_RE.search(name_text2)
                                if m2 and not pending_stub['marker']:
                                    pending_stub['marker'] = m2.group(1)
                                nombre2 = COREQ_MARKER_RE.sub('', name_text2).strip()
                                nombre2 = re.sub(r'\(\*+\).*$', '', nombre2).strip()
                                if nombre2:
                                    pending_stub['nombre'] = ' '.join(
                                        filter(None, [pending_stub['nombre'], nombre2])
                                    ).strip()
                        if pending_stub and cred_words and pending_stub['creditos'] == 0:
                            cred_text2 = ' '.join(w['text'] for w in cred_words)
                            m_cred2 = re.search(r'\d+', cred_text2)
                            if m_cred2:
                                pending_stub['creditos'] = int(m_cred2.group())
                        # El stub sigue en vuelo — se libera en la siguiente materia/semestre
                    elif name_words and not prereq_words and not clave_words:
                        # Fila de solo-nombre: puede ser el nombre de la materia siguiente
                        raw = ' '.join(w['text'] for w in name_words).strip()
                        raw = re.sub(r'\(\*+\).*$', '', raw).strip()
                        # Ignorar slots genéricos de optativa
                        if raw and not OPTATIVA_SLOT_RE.match(raw):
                            pending_name = (pending_name + ' ' + raw).strip()
                    else:
                        # Fila de continuación de prerrequisitos
                        pending_name = ''
                        pending_prereq_words.extend(prereq_words)
                        pending_prereq_words.extend(clave_words)
                    continue

                # --- Nueva materia encontrada (course_id presente) ---

                # Liberar el stub anterior si estaba completo
                _flush_stub(pending_stub, courses, coreq_groups)
                pending_stub = None

                # Prereqs: fila actual + acumulados de continuación
                all_prereq_words = pending_prereq_words + prereq_words
                prereq_text = ' '.join(w['text'] for w in all_prereq_words)
                prereqs = extract_codes_from_text(prereq_text)
                pending_prereq_words = []

                # Nombre y marcador de correquisito
                name_text = ' '.join(w['text'] for w in name_words).strip()
                marker_match = COREQ_MARKER_RE.search(name_text)
                marker = marker_match.group(1) if marker_match else None
                nombre = COREQ_MARKER_RE.sub('', name_text).strip()
                nombre = re.sub(r'\(\*+\).*$', '', nombre).strip()

                # Incorporar nombre acumulado de filas previas (patrón: nombre antes del código)
                name_came_from_prior_row = False
                if pending_name:
                    nombre = ' '.join(filter(None, [pending_name, nombre])).strip()
                    pending_name = ''
                    name_came_from_prior_row = True

                # Créditos
                cred_text = ' '.join(w['text'] for w in cred_words)
                cred_match = re.search(r'\d+', cred_text)
                creditos = int(cred_match.group()) if cred_match else 0

                if nombre and creditos > 0 and not name_came_from_prior_row:
                    # Todo en una sola fila — guardar directamente
                    courses[course_id] = {
                        "semestre": current_semester,
                        "nombre": nombre,
                        "creditos": creditos,
                        "prerreqs": prereqs,
                        "coreqs": [],
                        "estado": 0,
                    }
                    if marker:
                        coreq_groups[(current_semester, marker)].append(course_id)
                else:
                    # Nombre y/o créditos vienen de filas separadas — crear stub
                    # para acumular posibles continuaciones en la(s) fila(s) siguiente(s)
                    pending_stub = {
                        'id': course_id,
                        'semestre': current_semester,
                        'prerreqs': prereqs,
                        'marker': marker,
                        'nombre': nombre,
                        'creditos': creditos,
                    }

        # Liberar stub que quedó al final del plan
        _flush_stub(pending_stub, courses, coreq_groups)

    # Aplicar correquisitos (solo si el grupo tiene >= 2 materias)
    for group_courses in coreq_groups.values():
        if len(group_courses) >= 2:
            for cid in group_courses:
                if cid in courses:
                    courses[cid]["coreqs"] = ["CORREQ"]

    return courses


def main():
    pdfplumber = ensure_pdfplumber()

    input_dir = Path("2025_01")
    output_dir = Path("jsonPEs/2025_01")
    output_dir.mkdir(parents=True, exist_ok=True)

    pdf_files = sorted(input_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"No se encontraron PDFs en {input_dir}/")
        return

    ok = 0
    skipped = 0
    errors = []

    for pdf_path in pdf_files:
        plan_code = extract_plan_code(pdf_path.stem)
        if plan_code is None:
            print(f"  SKIP  {pdf_path.name}  (sin codigo de plan)")
            skipped += 1
            continue

        try:
            courses = parse_pdf(pdf_path, pdfplumber)
        except Exception as e:
            print(f"  ERROR {pdf_path.name}: {e}")
            errors.append(pdf_path.name)
            continue

        if not courses:
            print(f"  VACIO {pdf_path.name}  (no se extrajeron materias - formato distinto?)")
            skipped += 1
            continue

        output_path = output_dir / f"{plan_code}-plan-estudios.json"
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(courses, f, ensure_ascii=False, indent=2)

        print(f"  OK    {pdf_path.name}  ->  {output_path.name}  ({len(courses)} materias)")
        ok += 1

    print(f"\n{'-'*60}")
    print(f"Generados: {ok}  |  Omitidos: {skipped}  |  Errores: {len(errors)}")
    if errors:
        print("Con error:", ", ".join(errors))
    print(f"JSONs en: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
