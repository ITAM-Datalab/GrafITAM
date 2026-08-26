"""
Regenera jsonPEs/2025_01/*.json usando planes.pkl (catálogo de materias por plan,
export directo del sistema tipo Banner de ITAM) y prerrequisitosMega.pkl (reglas
de inscripción crudas del mismo sistema) en vez de los PDFs -- ver el plan de
diseño para el detalle completo de por qué y las cifras de validación.

Por decisión explícita (ninguno de los dos pickles trae esta información):
- Las áreas de concentración de los 13 planes con múltiples áreas NO se vuelven a
  separar -- se sigue confiando en el archivo `{plan}-{AREA}-plan-estudios.json`
  que ya existe (generado por PDF). `planes.pkl` y `prerrequisitosMega.pkl` clavan
  sus datos por (materia, plan_key) SIN dimensión de área -- todas las áreas de un
  mismo plan_key (ej. ACT-D-SEGUROS/ACT-D-ESTADISTICA) recibirían el MISMO
  semestre/creditos/regla de prereqs, pisando diferencias reales que el PDF sí
  capturaba por área (confirmado con ECD-A: la tabla propia de
  ECD-A-ECONOMIA-FINANCIERA mueve COM-11101 a 2do semestre, mientras
  ECD-A-FUNDAMENTOS-ECONOMICOS lo deja en 1ro -- ambos correctos, pero un solo
  valor de planes.pkl no puede representar los dos). Por eso los archivos de área
  quedan como **pass-through completo**: ningún campo se toca (ver
  `kept_area_plan_untouched`).
- Los slots sintéticos OPTATIVA-N / AREA-N se copian tal cual, sin tocar.

Para cada materia real (clave que no empieza con OPTATIVA/AREA) se refresca
`semestre`/`creditos` desde planes.pkl y se recalculan `prerreqs`/`coreqs` con
banner_rules.py. Si algo no calza (la materia no está en el catálogo de ese
plan, no tiene regla en prerrequisitosMega.pkl, la regla no matchea ningún
branch de ese plan, o la regla está malformada y `resolve()` no puede parsearla)
se deja el valor que ya trae el JSON actual y se reporta como diagnóstico --
nunca se adivina.

`--apply` se rehúsa a escribir si algún archivo resultante contiene un grupo OR
en `prerreqs` (un elemento que es a su vez una lista): el frontend actual
(`src/types/curriculum.ts`, `src/data/loader.ts`) no tiene ninguna rama para ese
caso -- lo trataría como un ID de prerreq colgante silencioso (ver
`ApplyBlocked`/`check_apply_safe`). En modo scratch esto no bloquea nada.

Uso:
    python pickles_to_json.py              # escribe a jsonPEs_pickles/ (scratch)
    python pickles_to_json.py --apply      # sobreescribe jsonPEs/2025_01/ in-place
    python pickles_to_json.py --plan ACT-D # solo ese plan (incluye sus áreas), para revisar rápido
"""

from __future__ import annotations

import argparse
import json
import pickle
import re
import sys
from pathlib import Path

from banner_rules import classify, resolve

JSON_DIR = Path('jsonPEs/2025_01')
SCRATCH_DIR = Path('jsonPEs_pickles')
PLANES_PKL = Path('planes.pkl')
PREREQS_PKL = Path('prerrequisitosMega.pkl')

FILENAME_RE = re.compile(r'^([A-Z]{2,4})-([A-Z])(?:-(.+))?$')


def to_pickle_plan_key(programa: str, letra: str) -> str:
    """'MA','D' -> 'M.A-D' (los 3 programas de 2 letras traen punto literal en
    planes.pkl: I.A/M.A/R.I); 'ICI','F' -> 'ICI-F'."""
    prog = f'{programa[0]}.{programa[1]}' if len(programa) == 2 else programa
    return f'{prog}-{letra}'


def is_area_file(filename: str) -> bool:
    """True para {PROG}-{LETRA}-{AREA}-plan-estudios.json (uno de los 13 planes
    con múltiples áreas de concentración)."""
    name = filename.removesuffix('-plan-estudios.json')
    m = FILENAME_RE.match(name)
    return bool(m and m.group(3))


def load_pickles():
    with open(PLANES_PKL, 'rb') as f:
        planes = pickle.load(f)
    with open(PREREQS_PKL, 'rb') as f:
        rules = pickle.load(f)
    return planes, rules


def build_catalog_and_semester_lookups(planes):
    """catalog: {plan_key: {clave: (semestre, creditos)}}; fallback: {clave: semestre
    mínimo en que aparece en cualquier plan} -- para clasificar prereq/coreq de un
    átomo que no pertenece al plan objetivo (dangling, ver curriculumStore)."""
    catalog: dict[str, dict[str, tuple[int, int]]] = {}
    by_plan_and_course: dict[tuple[str, str], int] = {}
    fallback: dict[str, int] = {}
    for plan_key, df in planes.items():
        plan_catalog = {}
        for _, row in df.iterrows():
            clave = row['Clave']
            sem = int(row['Semestre'])
            plan_catalog[clave] = (sem, int(row['Créditos']))
            by_plan_and_course[(plan_key, clave)] = sem
            fallback[clave] = min(sem, fallback.get(clave, sem))
        catalog[plan_key] = plan_catalog
    return catalog, by_plan_and_course, fallback


def is_synthetic(course_id: str) -> bool:
    return course_id.startswith('OPTATIVA') or course_id.startswith('AREA-')


class ApplyBlocked(Exception):
    """--apply se rehúsa a escribir mientras haya grupos OR en prerreqs (ver
    check_apply_safe) -- el frontend actual no los interpreta."""


# Errores de parseo esperables de una regla malformada en prerrequisitosMega.pkl:
# ValueError (mismatch explícito en _Parser._eat) o IndexError (paréntesis sin
# cerrar, se queda sin tokens). No se captura Exception genérico para no
# enmascarar bugs de otro tipo.
_RULE_PARSE_ERRORS = (ValueError, IndexError)


class Report:
    def __init__(self):
        self.refreshed = 0
        self.or_groups_added = 0
        # sets, no listas: un plan con varias áreas comparte plan_key entre archivos
        # y no queremos contar/imprimir la misma (plan, clave) una vez por área.
        self.kept_no_catalog_match: set[tuple[str, str]] = set()
        self.kept_no_rule: set[tuple[str, str]] = set()
        self.kept_rule_never_matched: set[tuple[str, str]] = set()
        self.kept_rule_open_but_pdf_had_prereqs: set[tuple[str, str]] = set()
        self.kept_area_plan_untouched: set[tuple[str, str]] = set()
        # Subconjunto de kept_area_plan_untouched donde Banner SÍ tenía una
        # regla resoluble (no False/error) que se ignoró a propósito -- distingue
        # "había algo que descartamos" de "Banner no tenía nada de todos modos",
        # útil si algún día se reconsidera la decisión de excluir áreas.
        self.kept_area_plan_ignored_resolvable_rule: set[tuple[str, str]] = set()
        self.kept_rule_parse_error: set[tuple[str, str]] = set()
        self.extra_in_catalog: set[tuple[str, str]] = set()

    def print_summary(self):
        print(f'Materias refrescadas (semestre/créditos/prerreqs desde los pickles; coreqs sin tocar): {self.refreshed}')
        print(f'  ...de esas, con grupo OR genuino en prerreqs: {self.or_groups_added}')
        print(f'Sin match en el catálogo de ese plan (se dejó el JSON actual): {len(self.kept_no_catalog_match)}')
        print(f'Sin regla en prerrequisitosMega.pkl (se dejó el JSON actual): {len(self.kept_no_rule)}')
        print(f'Regla que no matchea ningún branch del plan (se dejó el JSON actual): {len(self.kept_rule_never_matched)}')
        print(f'Regla sin restricción pero el PDF sí traía prereqs (se dejó el JSON actual): {len(self.kept_rule_open_but_pdf_had_prereqs)}')
        print(f'Plan con área de concentración -- sin tocar (pass-through, ningún campo se refresca): {len(self.kept_area_plan_untouched)}')
        print(f'  ...de esos, Banner sí tenía una regla resoluble que se ignoró: {len(self.kept_area_plan_ignored_resolvable_rule)}')
        print(f'Regla malformada, no se pudo parsear (se dejó el JSON actual): {len(self.kept_rule_parse_error)}')
        print(f'En el catálogo del plan pero sin clave correspondiente en ningún archivo JSON del plan: {len(self.extra_in_catalog)}')
        for label, items in [
            ('sin match en catálogo', self.kept_no_catalog_match),
            ('sin regla', self.kept_no_rule),
            ('regla sin branch', self.kept_rule_never_matched),
            ('regla abierta pero PDF traía prereqs', self.kept_rule_open_but_pdf_had_prereqs),
            ('plan de área -- sin tocar', self.kept_area_plan_untouched),
            ('regla malformada', self.kept_rule_parse_error),
            ('extra en catálogo', self.extra_in_catalog),
        ]:
            if items:
                ordered = sorted(items)
                print(f'\n  Detalle "{label}" (plan, clave):')
                for plan, clave in ordered[:30]:
                    print(f'    {plan}  {clave}')
                if len(ordered) > 30:
                    print(f'    ... y {len(ordered) - 30} más')


def or_group_courses(new_data: dict) -> list[str]:
    """Claves cuyo `prerreqs` contiene al menos un grupo OR (elemento anidado que
    es a su vez una lista) -- el frontend actual no lo interpreta."""
    return sorted(
        course_id
        for course_id, course in new_data.items()
        if any(isinstance(p, list) for p in course.get('prerreqs', []))
    )


def check_apply_safe(apply: bool, all_new_data: dict[str, dict]) -> None:
    """Aborta con ApplyBlocked si apply=True y algún archivo tiene un grupo OR en
    prerreqs. En modo scratch (apply=False) nunca bloquea."""
    if not apply:
        return
    blockers = {filename: courses for filename, data in all_new_data.items() if (courses := or_group_courses(data))}
    if blockers:
        detail = '\n'.join(f'  {filename}: {", ".join(courses)}' for filename, courses in sorted(blockers.items()))
        raise ApplyBlocked(
            'No se puede aplicar: los siguientes archivos tienen grupos OR en prerreqs, '
            'que src/types/curriculum.ts y src/data/loader.ts no interpretan todavía '
            '(caerían como prerreq colgante silencioso):\n' + detail
        )


def topology_violations(json_dir: Path) -> list[tuple[str, str, str]]:
    """(archivo, materia, prereq) donde el prereq NO queda en un semestre
    estrictamente anterior -- mismo criterio que src/algorithms/topoValidate.ts.
    Los grupos OR (elemento anidado) se ignoran aquí; ver ApplyBlocked."""
    violations = []
    for path in sorted(json_dir.glob('*.json')):
        data = json.loads(path.read_text())
        for course_id, course in data.items():
            sem = course.get('semestre')
            for prereq_id in course.get('prerreqs', []):
                if isinstance(prereq_id, list):
                    continue
                prereq_course = data.get(prereq_id)
                if prereq_course is None:
                    continue
                prereq_sem = prereq_course.get('semestre')
                if sem is not None and prereq_sem is not None and prereq_sem >= sem:
                    violations.append((path.name, course_id, prereq_id))
    return violations


def coreq_split_pairs(json_dir: Path) -> list[tuple[str, str, str]]:
    """(archivo, materia, coreq) donde la pareja de coreq queda en un semestre
    DISTINTO -- viola la invariante de "deben cursarse simultáneamente"."""
    pairs = []
    for path in sorted(json_dir.glob('*.json')):
        data = json.loads(path.read_text())
        for course_id, course in data.items():
            sem = course.get('semestre')
            for coreq_id in course.get('coreqs', []):
                coreq_course = data.get(coreq_id)
                if coreq_course is None:
                    continue
                coreq_sem = coreq_course.get('semestre')
                if sem is not None and coreq_sem is not None and sem != coreq_sem:
                    pairs.append((path.name, course_id, coreq_id))
    return pairs


def process_file(path: Path, catalog, rules, by_plan_and_course, fallback, report: Report) -> tuple[dict, str, set[str]]:
    """Devuelve (json nuevo, plan_key de planes.pkl, claves reales vistas en este
    archivo) -- el llamador junta las claves vistas de todas las áreas de un mismo
    plan_key antes de calcular qué sobra en el catálogo (ver main())."""
    name = path.name.removesuffix('-plan-estudios.json')
    m = FILENAME_RE.match(name)
    if not m:
        print(f'AVISO: no se pudo parsear el nombre de archivo {path.name}, se copia sin tocar', file=sys.stderr)
        return json.loads(path.read_text()), '', set()

    programa, letra, area = m.groups()
    plan_key = to_pickle_plan_key(programa, letra)
    plan_catalog = catalog.get(plan_key, {})
    seen_claves: set[str] = set()

    data = json.loads(path.read_text())
    new_data = {}
    for course_id, course in data.items():
        if is_synthetic(course_id):
            new_data[course_id] = course
            continue

        seen_claves.add(course_id)

        if area is not None:
            # planes.pkl/prerrequisitosMega.pkl no distinguen área dentro de un
            # plan_key -- todas las áreas recibirían el mismo semestre/creditos/
            # regla de prereqs, pisando diferencias reales que el PDF sí capturaba
            # por área (ver docstring del módulo, caso ECD-A). Pass-through total:
            # ningún campo se toca, igual que las entradas sintéticas.
            new_data[course_id] = course
            report.kept_area_plan_untouched.add((plan_key, course_id))
            if course_id in rules:
                try:
                    if resolve(rules[course_id], plan_key) is not False:
                        report.kept_area_plan_ignored_resolvable_rule.add((plan_key, course_id))
                except _RULE_PARSE_ERRORS:
                    pass
            continue

        catalog_entry = plan_catalog.get(course_id)
        if catalog_entry is None:
            new_data[course_id] = course
            report.kept_no_catalog_match.add((plan_key, course_id))
            continue

        semestre, creditos = catalog_entry
        if course_id not in rules:
            new_data[course_id] = {**course, 'semestre': semestre, 'creditos': creditos}
            report.kept_no_rule.add((plan_key, course_id))
            continue

        try:
            resolved = resolve(rules[course_id], plan_key)
        except _RULE_PARSE_ERRORS:
            new_data[course_id] = {**course, 'semestre': semestre, 'creditos': creditos}
            report.kept_rule_parse_error.add((plan_key, course_id))
            continue

        if resolved is False:
            new_data[course_id] = {**course, 'semestre': semestre, 'creditos': creditos}
            report.kept_rule_never_matched.add((plan_key, course_id))
            continue

        prereqs = classify(resolved, plan_key, semestre, by_plan_and_course, fallback)
        if resolved is True and course.get('prerreqs'):
            # La regla de Banner es puro token de plan (sin ninguna materia real) y
            # resuelve a "sin restricción" -- pero el PDF sí trae prerreqs para esta
            # materia. No hay forma de saber si el PDF tiene razón (un prerreq real
            # que Banner no está modelando como tal) o si es Banner el que tiene
            # razón (el PDF heredó un prerreq viejo) -- se deja el valor del PDF y
            # se reporta, no se vacía a ciegas.
            new_data[course_id] = {**course, 'semestre': semestre, 'creditos': creditos}
            report.kept_rule_open_but_pdf_had_prereqs.add((plan_key, course_id))
            continue

        new_data[course_id] = {
            **course,
            'semestre': semestre,
            'creditos': creditos,
            'prerreqs': prereqs,
            # 'coreqs' NO se toca: Banner no modela la pareja de diseño curricular
            # que el PDF marca con "(A)" -- ver docstring de banner_rules.classify.
        }
        report.refreshed += 1
        if any(isinstance(p, list) for p in prereqs):
            report.or_groups_added += 1

    return new_data, plan_key, seen_claves


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apply', action='store_true', help='sobreescribe jsonPEs/2025_01/ in-place en vez de escribir a jsonPEs_pickles/')
    parser.add_argument('--plan', help='solo procesa archivos cuyo nombre empiece con este prefijo (ej. ACT-D)')
    args = parser.parse_args()

    planes, rules = load_pickles()
    catalog, by_plan_and_course, fallback = build_catalog_and_semester_lookups(planes)

    out_dir = JSON_DIR if args.apply else SCRATCH_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    report = Report()
    files = sorted(JSON_DIR.glob('*.json'))
    if args.plan:
        files = [f for f in files if f.name.startswith(args.plan)]

    seen_claves_by_plan: dict[str, set[str]] = {}
    all_new_data: dict[str, dict] = {}
    for path in files:
        new_data, plan_key, seen_claves = process_file(path, catalog, rules, by_plan_and_course, fallback, report)
        seen_claves_by_plan.setdefault(plan_key, set()).update(seen_claves)
        all_new_data[path.name] = new_data

    try:
        check_apply_safe(args.apply, all_new_data)
    except ApplyBlocked as exc:
        print(f'\n{exc}', file=sys.stderr)
        sys.exit(1)

    for filename, new_data in all_new_data.items():
        (out_dir / filename).write_text(json.dumps(new_data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # "Extra en catálogo" se calcula por plan_key (uniendo todas sus áreas), no por
    # archivo -- si no, una materia de ACT-D-SEGUROS parece "faltante" al mirar solo
    # ACT-D-ESTADISTICA aunque sí esté cubierta por otra área del mismo plan.
    for plan_key, seen in seen_claves_by_plan.items():
        for clave in catalog.get(plan_key, {}):
            if clave not in seen:
                report.extra_in_catalog.add((plan_key, clave))

    print(f'\n{len(files)} archivos escritos en {out_dir}/\n')
    report.print_summary()

    if out_dir != JSON_DIR:
        print('\n--- Sanity check (PDF actual vs salida nueva) ---')
        after_topology = topology_violations(out_dir)
        after_topology_area = [v for v in after_topology if is_area_file(v[0])]
        after_topology_non_area = [v for v in after_topology if not is_area_file(v[0])]
        before_topology = topology_violations(JSON_DIR)
        print(f'Violaciones de topología (prereq no anterior): PDF={len(before_topology)}  '
              f'nuevo={len(after_topology)} ({len(after_topology_non_area)} en planes normales, '
              f'{len(after_topology_area)} en archivos de área -- dato preexistente del PDF: los '
              f'archivos de área son pass-through completo, ningún campo se refresca ahí, así que '
              f'estas violaciones no son nuevas, ya venían del JSON original)')
        for filename, course_id, prereq_id in after_topology_non_area[:20]:
            print(f'    {filename}  {course_id} / {prereq_id}')

        before_coreq = set(coreq_split_pairs(JSON_DIR))
        after_coreq = set(coreq_split_pairs(out_dir))
        new_splits = sorted(after_coreq - before_coreq)
        print(f'Pares de coreq partidos entre semestres: PDF={len(before_coreq)}  nuevo={len(after_coreq)}'
              f'  (de esos, {len(new_splits)} son nuevos, no estaban en el PDF -- mismo mecanismo: '
              f'coreqs se congelan pero semestre se refresca por separado para cada miembro del par)')
        for filename, course_id, coreq_id in new_splits[:20]:
            print(f'    {filename}  {course_id} / {coreq_id}')


if __name__ == '__main__':
    main()
