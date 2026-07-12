"""
Convierte PDFs de planes de estudio del ITAM (2025_01/) a JSONs para GrafItam.
Salida: jsonPEs/2025_01/{PLAN_CODE}-plan-estudios.json

Schema de salida:
{
  "COM-11101": {
    "semestre": 1, "nombre": "Algoritmos y Programas",
    "creditos": 9, "prerreqs": [], "coreqs": [], "estado": 0
  }
}

Los slots de optativa de la tabla de cada semestre (ej. "Optativa de Estadistica",
sin clave real) se agregan como materias sinteticas "OPTATIVA-1", "OPTATIVA-2", ...
con nombre "Optativa I", "Optativa II", ..., sin prerrequisitos, en un semestre
extra al final del plan (para que el grafo las dibuje en su propia columna final,
desconectadas de todo) — sus creditos si cuentan para la barra de progreso.

Los slots "Materia N de Area de Concentracion" (sin clave real tampoco, ej. familia
ECD/ECO/EDF) se agregan como "AREA-N" — a diferencia de las optativas, se quedan en
su propio semestre real (no en una columna final), porque representan una materia
obligatoria de esa etapa del plan.

Algunos PDFs (ACT/ECD/ECO/EDF) no son un solo plan: repiten un "tronco comun" mas
2-5 secciones "AREA DE CONCENTRACION: X" completas. Cada area se separa en su
propio archivo: {PLAN_CODE}-{AREA-SLUG}-plan-estudios.json (ver AREA_HEADER_RE).
"""

import json
import re
import subprocess
import sys
import unicodedata
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

# Piso esperado de materias reales por plan (sin contar optativas sintéticas) — si un
# PDF genera menos, probablemente el parseo falló en algo (columnas corridas, formato
# distinto, etc.) y vale la pena revisarlo a mano. No bloquea la generación, solo avisa.
MIN_MATERIAS = 38

SEMESTER_MAP = {
    'PRIMER': 1, 'SEGUNDO': 2, 'TERCER': 3, 'CUARTO': 4, 'QUINTO': 5,
    'SEXTO': 6, 'SÉPTIMO': 7, 'SEPTIMO': 7, 'SÉPTIMO': 7,
    'OCTAVO': 8, 'NOVENO': 9, 'DÉCIMO': 10, 'DECIMO': 10,
}

END_OF_PLAN_RE = re.compile(
    r'(NOTAS?\s+AL\s+PLAN|SERVICIO\s+SOCIAL)',
    re.IGNORECASE
)

# Referencia corta en línea (ej. "**Ver notas al Plan de Estudios") que aparece al
# final de CADA área de concentración cuando el plan repite la tabla de semestres
# una vez por área (ej. Actuaría: Seguros/Estadística/Riesgos Financieros) — no es
# el fin real del plan, así que no debe disparar END_OF_PLAN_RE (a diferencia del
# encabezado real de la sección de notas, "NOTAS AL PLAN DE ESTUDIOS PARA LOS
# ALUMNOS...", o de "SERVICIO SOCIAL", que sí marcan el fin genuino).
INLINE_FOOTNOTE_RE = re.compile(r'^\**\s*Ver\s+notas', re.IGNORECASE)

SEMESTER_RE = re.compile(
    r'(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO|S[ÉE]PTIMO|OCTAVO|NOVENO|D[ÉE]CIMO)\s+SEMESTRE',
    re.IGNORECASE
)

OPTATIVAS_RE = re.compile(r'MATERIAS?\s+OPTATIVAS?', re.IGNORECASE)

# Renglón de slot genérico de optativa dentro de la tabla de un semestre — sin clave
# real. Cubre "Optativa", "Optativa I/II", "Optativa 1/2", y variantes con nombre
# como "Optativa de Estadística", "Optativa de Finanzas", "Optativa Área de
# Concentración" (antes solo se reconocía la forma corta, y las variantes con
# nombre se colaban al nombre de la siguiente materia real — bug ya corregido aquí).
OPTATIVA_SLOT_RE = re.compile(r'^Optativas?(\s|$)', re.IGNORECASE)

# Renglón de slot "Materia N de Área de Concentración" (ej. familia ECD/ECO/EDF) —
# igual que una optativa, sin clave real, pero a diferencia de Optativa este slot SÍ
# debe quedarse en su propio semestre (no en una columna final): representa una
# materia obligatoria de esa etapa del plan que el alumno elige según su área, no
# una optativa libre de cualquier semestre. El número ya lo trae el PDF y es estable,
# así que se preserva tal cual en vez de renumerar.
AREA_CONCENTRACION_SLOT_RE = re.compile(r'^Materia\s+(\d+)\s+de\s+\S*rea\s+de\s+[Cc]oncentraci', re.IGNORECASE)

# Encabezado de página que abre una sección de área de concentración completa (ej.
# familia ACT/ECD/ECO/EDF: el PDF reimprime los semestres finales una vez por área —
# "ÁREA DE CONCENTRACIÓN: SEGUROS", luego "...: ESTADÍSTICA", etc.). Todo lo parseado
# ANTES del primer match de este regex es el "tronco común" (compartido entre áreas,
# tenga o no la etiqueta "TRONCO COMÚN" impresa — algunos PDFs como ADM-D no la traen).
AREA_HEADER_RE = re.compile(r'\S*REA\s+DE\s+CONCENTRACI[OÓ]N\s*:\s*(.+)', re.IGNORECASE)

HEADER_RE = re.compile(r'Prerrequisitos|Clave', re.IGNORECASE)

COREQ_MARKER_RE = re.compile(r'\(\s*([A-Z])\s*\)')


def normalize_code(code: str) -> str:
    """Normaliza MAT12201 → MAT-12201 (agrega guión si falta)."""
    return re.sub(r'^([A-Z]{2,4})(\d{5})$', r'\1-\2', code)


def extract_codes_from_text(text: str) -> list[str]:
    """Extrae todos los códigos de materia de un string, normalizando sin-guión."""
    raw = COURSE_CODE_RE.findall(text)
    return [normalize_code(c) for c in raw]


_ROMAN_NUMERALS = [(50, 'L'), (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I')]


def to_roman(n: int) -> str:
    """Convierte un entero pequeño (1-99) a numeral romano — para nombrar Optativa I, II, ..."""
    result = ''
    for value, symbol in _ROMAN_NUMERALS:
        while n >= value:
            result += symbol
            n -= value
    return result


def area_slug(label: str) -> str:
    """'Riesgos Financieros' -> 'RIESGOS-FINANCIEROS', para el nombre de archivo
    (mayúsculas sin acentos, mismo criterio ASCII que ya usa {PROGRAMA}/{LETRA} —
    evita problemas de nombres de archivo con Unicode entre Windows/Linux/git,
    ej. el runner de GitHub Actions corre en Ubuntu)."""
    ascii_label = unicodedata.normalize('NFKD', label).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'\s+', '-', ascii_label.strip().upper())


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
            # Reordenar por x0 al cerrar la fila: el orden global por 'top' exacto puede
            # invertir dos palabras de la MISMA línea visual cuando su offset vertical
            # difiere por un sub-píxel (ej. "SEMESTRE"/"TERCER" con top 415.6128 vs
            # 415.6176 — ambas dentro de y_tolerance, pero en el orden global "SEMESTRE"
            # queda primero, rompiendo la lectura izquierda-a-derecha).
            current_row.sort(key=lambda w: w['x0'])
            rows.append(current_row)
            current_row = [word]
            current_y = word['top']
    current_row.sort(key=lambda w: w['x0'])
    rows.append(current_row)
    return rows


def row_text(row: list[dict]) -> str:
    return ' '.join(w['text'] for w in row)


def merge_letter_runs(words: list[dict]) -> str:
    """Reconstruye el texto de una lista de palabras (ya en orden x0), uniendo
    corridas de tokens de una sola letra alfabética en una sola palabra (ej. en
    RI-E/F/G "Optativa" viene partida en 'O','p','t','a','t','i','v','a' — el
    espaciado entre esas letras es casi idéntico al espaciado normal entre
    palabras en ese PDF, así que un umbral de distancia no sirve para
    distinguirlos; se reconstruye por contenido en su lugar). Palabras normales
    de más de un carácter quedan intactas."""
    parts: list[str] = []
    buffer = ''
    for w in words:
        t = w['text']
        if len(t) == 1 and t.isalpha():
            buffer += t
        else:
            if buffer:
                parts.append(buffer)
                buffer = ''
            parts.append(t)
    if buffer:
        parts.append(buffer)
    return ' '.join(parts)


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


def _new_section() -> dict:
    """Estado independiente de una sección del plan (tronco común, o una de sus
    áreas de concentración si el PDF las trae)."""
    return {
        'courses': {},
        'coreq_groups': defaultdict(list),
        # créditos de cada slot de optativa encontrado (sin clave real), en orden
        'optativa_credits': [],
        # numero (tal cual lo trae el PDF) -> (semestre, creditos) de cada slot de
        # área de concentración; si el mismo número se repite (bloque duplicado),
        # la última aparición gana — igual que con materias reales
        'area_concentracion': {},
    }


def parse_pdf(pdf_path: Path, pdfplumber) -> dict[str | None, tuple[dict, int]]:
    """
    Parsea un PDF de plan de estudios. Retorna {label: (dict de materias, num.
    materias reales)} — un solo entry con label=None si el plan no tiene áreas de
    concentración (la inmensa mayoría), o una entry por área (sin entry para el
    tronco solo, que no es un plan usable) si el PDF reimprime los semestres
    finales una vez por área (ver `AREA_HEADER_RE`).
    """
    # sections[0] es siempre el tronco común (todo lo parseado antes de la primera
    # "ÁREA DE CONCENTRACIÓN: X"); cada área nueva arranca como copia del tronco.
    sections: list[tuple[str | None, dict]] = [(None, _new_section())]
    current_section = sections[0][1]
    courses = current_section['courses']
    coreq_groups = current_section['coreq_groups']
    optativa_credits = current_section['optativa_credits']
    area_concentracion = current_section['area_concentracion']

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

                # Fin real del plan (notas al plan, servicio social) — pero no si es
                # solo la referencia corta en línea de fin de área de concentración
                if END_OF_PLAN_RE.search(text) and not INLINE_FOOTNOTE_RE.match(text):
                    done = True
                    break

                # Encabezado de columnas repetido entre páginas — saltar
                if 'Prerrequisito' in text and 'Clave' in text:
                    continue

                # Encabezado de página "ÁREA DE CONCENTRACIÓN: X" — abre una sección
                # nueva, copiada del tronco común (sections[0]), no de la sección
                # activa (si ya veníamos de otra área, no debe heredar SUS materias).
                m_area_header = AREA_HEADER_RE.search(text)
                if m_area_header:
                    _flush_stub(pending_stub, courses, coreq_groups)
                    pending_stub = None
                    pending_name = ''
                    pending_prereq_words = []

                    label = m_area_header.group(1).strip()
                    tronco = sections[0][1]
                    new_section = _new_section()
                    new_section['courses'] = dict(tronco['courses'])
                    new_section['coreq_groups'] = defaultdict(
                        list, {k: list(v) for k, v in tronco['coreq_groups'].items()}
                    )
                    new_section['optativa_credits'] = list(tronco['optativa_credits'])
                    new_section['area_concentracion'] = dict(tronco['area_concentracion'])
                    sections.append((label, new_section))

                    current_section = new_section
                    courses = current_section['courses']
                    coreq_groups = current_section['coreq_groups']
                    optativa_credits = current_section['optativa_credits']
                    area_concentracion = current_section['area_concentracion']
                    current_semester = 0
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

                # Fallback: en algunos PDFs el límite de columna calculado del header no
                # coincide con los datos reales, y la clave de una materia cae del lado
                # de "prerrequisitos" en vez de "clave" (ej. x0=206.88 cuando el límite
                # calculado es 213.04 — pocos puntos de diferencia). Pasa tanto en
                # materias sin prerrequisito (la zona de prereqs trae solo la clave)
                # como con prerrequisito real (la zona trae [prereq...] + [clave] juntos
                # — la clave es siempre el ÚLTIMO código, porque va inmediatamente antes
                # del nombre). Si la zona de clave está vacía pero la fila sí tiene
                # nombre y créditos completos, se reinterpreta el último código de la
                # zona de prerrequisitos como la clave real — sin esto la materia se
                # pierde por completo.
                if not course_id and not clave_words and name_words and cred_words:
                    prereq_codes_fallback = extract_codes_from_text(
                        ' '.join(w['text'] for w in prereq_words)
                    )
                    if prereq_codes_fallback:
                        course_id = prereq_codes_fallback[-1]
                        # La palabra que aportó ese código ya no es un prerrequisito
                        for i in range(len(prereq_words) - 1, -1, -1):
                            if course_id in extract_codes_from_text(prereq_words[i]['text']):
                                del prereq_words[i]
                                break

                if not course_id:
                    if pending_stub:
                        # Acumular información adicional en el stub existente
                        if name_words:
                            name_text2 = merge_letter_runs(name_words).strip()
                            # Slot genérico de optativa — liberar el stub anterior y capturar
                            # sus créditos (el renglón en sí no tiene clave real, se descarta)
                            m_area2 = AREA_CONCENTRACION_SLOT_RE.match(name_text2)
                            if OPTATIVA_SLOT_RE.match(name_text2):
                                _flush_stub(pending_stub, courses, coreq_groups)
                                pending_stub = None
                                pending_name = ''
                                cred_text_opt = ' '.join(w['text'] for w in cred_words)
                                m_cred_opt = re.search(r'\d+', cred_text_opt)
                                optativa_credits.append(int(m_cred_opt.group()) if m_cred_opt else 6)
                            elif m_area2:
                                _flush_stub(pending_stub, courses, coreq_groups)
                                pending_stub = None
                                pending_name = ''
                                cred_text_area = ' '.join(w['text'] for w in cred_words)
                                m_cred_area = re.search(r'\d+', cred_text_area)
                                area_concentracion[m_area2.group(1)] = (
                                    current_semester,
                                    int(m_cred_area.group()) if m_cred_area else 6,
                                )
                            else:
                                m2 = COREQ_MARKER_RE.search(name_text2)
                                nombre2 = COREQ_MARKER_RE.sub('', name_text2).strip()
                                nombre2 = re.sub(r'\(\*+\).*$', '', nombre2).strip()
                                stub_ya_completo = bool(pending_stub['nombre']) and pending_stub['creditos'] > 0
                                if m2 and not pending_stub['marker']:
                                    pending_stub['marker'] = m2.group(1)
                                if nombre2:
                                    pending_stub['nombre'] = ' '.join(
                                        filter(None, [pending_stub['nombre'], nombre2])
                                    ).strip()
                                elif m2 and stub_ya_completo:
                                    # Marcador "(A)"/"(B)" en su propia fila (wrap del PDF)
                                    # cerrando un stub que ya tenía nombre+créditos completos
                                    # antes de esta fila: es lo último que le faltaba. Cerrarlo
                                    # ya evita que la fila de la SIGUIENTE materia se cuele como
                                    # continuación suya (bug DAC-A: DER-10114/LEN-12762 se
                                    # fusionaban — ver src/data/CLAUDE.md).
                                    _flush_stub(pending_stub, courses, coreq_groups)
                                    pending_stub = None
                        if pending_stub and cred_words and pending_stub['creditos'] == 0:
                            cred_text2 = ' '.join(w['text'] for w in cred_words)
                            m_cred2 = re.search(r'\d+', cred_text2)
                            if m_cred2:
                                pending_stub['creditos'] = int(m_cred2.group())
                        # El stub sigue en vuelo — se libera en la siguiente materia/semestre
                    elif name_words and not prereq_words and not clave_words:
                        # Fila de solo-nombre: puede ser el nombre de la materia siguiente
                        raw = merge_letter_runs(name_words).strip()
                        raw = re.sub(r'\(\*+\).*$', '', raw).strip()
                        m_area = AREA_CONCENTRACION_SLOT_RE.match(raw) if raw else None
                        if raw and OPTATIVA_SLOT_RE.match(raw):
                            # Slot genérico de optativa (no el nombre de la siguiente materia)
                            cred_text_opt = ' '.join(w['text'] for w in cred_words)
                            m_cred_opt = re.search(r'\d+', cred_text_opt)
                            optativa_credits.append(int(m_cred_opt.group()) if m_cred_opt else 6)
                        elif m_area:
                            # Slot de "Materia N de Área de Concentración" — se queda en
                            # el semestre actual, no es el nombre de la siguiente materia
                            cred_text_area = ' '.join(w['text'] for w in cred_words)
                            m_cred_area = re.search(r'\d+', cred_text_area)
                            area_concentracion[m_area.group(1)] = (
                                current_semester,
                                int(m_cred_area.group()) if m_cred_area else 6,
                            )
                        elif raw:
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
                name_text = merge_letter_runs(name_words).strip()
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

        # Liberar stub que quedó al final del plan (de la última sección activa)
        _flush_stub(pending_stub, courses, coreq_groups)

    # Si hay áreas de concentración, el tronco solo (sections[0]) no es un plan
    # usable por sí mismo — se descarta, cada área ya trae una copia de sus materias.
    output_sections = sections[1:] if len(sections) > 1 else sections

    results: dict[str | None, tuple[dict, int]] = {}
    for label, section in output_sections:
        sec_courses = section['courses']
        sec_coreq_groups = section['coreq_groups']
        sec_optativa_credits = section['optativa_credits']
        sec_area_concentracion = section['area_concentracion']

        # Aplicar correquisitos: cada materia guarda la clave real de su pareja, no una
        # bandera genérica. El PDF reutiliza la MISMA letra para varias PAREJAS
        # independientes dentro de un mismo semestre — no una letra por pareja (ver pie
        # de página real: "(A) Estos pares de materias se deben cursar de manera
        # simultánea..." / "(A) Cada par de materias se debe cursar..."). El orden de
        # aparición en la tabla es lo que indica la pareja real, así que se van
        # emparejando de dos en dos en ese orden — tratar todo el grupo como un solo
        # clique (todos compañeros de todos) fundía parejas independientes entre sí
        # (bug reportado: DAC-A semestre 7, COM-12104/LEN-12722 + ACT-15358/LEN-12713
        # aparecían como un solo grupo de 4). `dict.fromkeys` además quita duplicados:
        # algunas materias quedan agregadas más de una vez al mismo grupo (su stub se
        # libera más de una vez), lo que sin esto producía una clave repetida en
        # "coreqs".
        for group_courses in sec_coreq_groups.values():
            unique_courses = [cid for cid in dict.fromkeys(group_courses) if cid in sec_courses]
            for i in range(0, len(unique_courses) - 1, 2):
                a, b = unique_courses[i], unique_courses[i + 1]
                sec_courses[a]["coreqs"] = [b]
                sec_courses[b]["coreqs"] = [a]

        real_course_count = len(sec_courses)

        # Optativas sintéticas: una columna final, desconectada, después del último semestre real
        if sec_optativa_credits:
            max_semestre = max((c['semestre'] for c in sec_courses.values()), default=0)
            for i, creditos in enumerate(sec_optativa_credits, start=1):
                sec_courses[f"OPTATIVA-{i}"] = {
                    "semestre": max_semestre + 1,
                    "nombre": f"Optativa {to_roman(i)}",
                    "creditos": creditos,
                    "prerreqs": [],
                    "coreqs": [],
                    "estado": 0,
                }

        # Slots de área de concentración: cada uno en su propio semestre real, desconectado
        for numero, (semestre, creditos) in sec_area_concentracion.items():
            sec_courses[f"AREA-{numero}"] = {
                "semestre": semestre,
                "nombre": f"Materia {numero} de Área de Concentración",
                "creditos": creditos,
                "prerreqs": [],
                "coreqs": [],
                "estado": 0,
            }

        results[label] = (sec_courses, real_course_count)

    return results


def main():
    pdfplumber = ensure_pdfplumber()

    input_dir = Path("2025_01")
    output_dir = Path("jsonPEs/2025_01")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Limpiar salidas de corridas previas: si cambia el esquema de nombres (ej. un
    # plan que antes era un solo archivo y ahora se separa en áreas), el archivo
    # viejo se queda huérfano si no se borra primero — el directorio siempre debe
    # reflejar exactamente lo que las PDFs de hoy producen.
    for stale in output_dir.glob("*-plan-estudios.json"):
        stale.unlink()

    pdf_files = sorted(input_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"No se encontraron PDFs en {input_dir}/")
        return

    ok = 0
    skipped = 0
    errors = []
    sospechosos = []

    for pdf_path in pdf_files:
        plan_code = extract_plan_code(pdf_path.stem)
        if plan_code is None:
            print(f"  SKIP  {pdf_path.name}  (sin codigo de plan)")
            skipped += 1
            continue

        try:
            sections = parse_pdf(pdf_path, pdfplumber)
        except Exception as e:
            print(f"  ERROR {pdf_path.name}: {e}")
            errors.append(pdf_path.name)
            continue

        if not sections:
            print(f"  VACIO {pdf_path.name}  (no se extrajeron materias - formato distinto?)")
            skipped += 1
            continue

        wrote_any = False
        for label, (courses, real_course_count) in sections.items():
            if real_course_count == 0:
                continue

            if label is None:
                output_path = output_dir / f"{plan_code}-plan-estudios.json"
                plan_label = pdf_path.name
            else:
                output_path = output_dir / f"{plan_code}-{area_slug(label)}-plan-estudios.json"
                plan_label = f"{pdf_path.name} [{label.strip().title()}]"

            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(courses, f, ensure_ascii=False, indent=2)

            n_optativas = sum(1 for k in courses if k.startswith('OPTATIVA-'))
            n_area = sum(1 for k in courses if k.startswith('AREA-'))
            suffix_parts = []
            if n_optativas:
                suffix_parts.append(f"+{n_optativas} optativas")
            if n_area:
                suffix_parts.append(f"+{n_area} area de concentracion")
            suffix = f" ({', '.join(suffix_parts)})" if suffix_parts else ""
            print(f"  OK    {plan_label}  ->  {output_path.name}  ({real_course_count} materias{suffix})")
            ok += 1
            wrote_any = True

            # El piso de materias cuenta el total (reales + optativas + área de
            # concentración) — un plan optativa-pesado (ej. MA-C: 37 reales + 9
            # optativas) no debe marcarse sospechoso solo porque tiene pocas materias
            # con clave fija.
            total_count = real_course_count + n_optativas + n_area
            if total_count < MIN_MATERIAS:
                sospechosos.append(
                    f"{output_path.name} ({real_course_count} materias reales, {total_count} en total)"
                )

        if not wrote_any:
            print(f"  VACIO {pdf_path.name}  (no se extrajeron materias - formato distinto?)")
            skipped += 1

    print(f"\n{'-'*60}")
    print(f"Generados: {ok}  |  Omitidos: {skipped}  |  Errores: {len(errors)}")
    if errors:
        print("Con error:", ", ".join(errors))
    if sospechosos:
        print(
            f"\n[!] {len(sospechosos)} plan(es) con menos de {MIN_MATERIAS} materias en total "
            "(revisar manualmente, puede indicar un parseo fallido):"
        )
        for s in sospechosos:
            print(f"   - {s}")
    print(f"JSONs en: {output_dir.resolve()}")


if __name__ == "__main__":
    main()
