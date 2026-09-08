"""
Tests de pickles_to_json.py. No dependen de tener planes.pkl/prerrequisitosMega.pkl
en disco -- construyen catalog/rules/report en memoria y archivos JSON temporales.
"""

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from pickles_to_json import (
    ApplyBlocked,
    Report,
    check_apply_safe,
    coreq_split_pairs,
    is_area_file,
    or_group_courses,
    process_file,
    to_pickle_plan_key,
    topology_violations,
)


class ToPicklePlanKeyTests(unittest.TestCase):
    def test_programas_de_2_letras_traen_punto_literal(self):
        self.assertEqual(to_pickle_plan_key('MA', 'D'), 'M.A-D')
        self.assertEqual(to_pickle_plan_key('RI', 'F'), 'R.I-F')
        self.assertEqual(to_pickle_plan_key('IA', 'A'), 'I.A-A')

    def test_programa_general_sin_punto(self):
        self.assertEqual(to_pickle_plan_key('ICI', 'F'), 'ICI-F')
        self.assertEqual(to_pickle_plan_key('ACT', 'D'), 'ACT-D')


def _write_json(dir_path: Path, filename: str, data: dict) -> Path:
    path = dir_path / filename
    path.write_text(json.dumps(data), encoding='utf-8')
    return path


class ProcessFileAreaExclusionTests(unittest.TestCase):
    """Los 13 planes con área de concentración comparten plan_key entre áreas, pero
    prerrequisitosMega.pkl no tiene dimensión de área -- refrescar prerreqs ahí
    homogeneiza diferencias reales que el PDF sí capturaba por área -- y lo MISMO
    aplica a semestre/creditos: planes.pkl guarda un solo (semestre, creditos) por
    (plan_key, clave), sin dimensión de área, y las tablas de área del PDF a veces
    reordenan legítimamente el semestre de una materia compartida entre áreas (ej.
    ECD-A-ECONOMIA-FINANCIERA mueve COM-11101 a 2do semestre, ECD-A-FUNDAMENTOS-
    ECONOMICOS lo deja en 1ro -- ambos válidos, Banner solo conoce un valor). Por
    eso los archivos {PROG}-{LETRA}-{AREA}-plan-estudios.json quedan como
    pass-through completo: NINGÚN campo se toca."""

    def setUp(self):
        self.catalog = {'ACT-D': {'ACT-11300': (3, 8)}}
        self.rules = {'ACT-11300': 'EST-14101'}
        self.by_plan_and_course = {('ACT-D', 'EST-14101'): 1}
        self.fallback: dict[str, int] = {}
        self.report = Report()

    def test_archivo_de_area_no_toca_ningun_campo(self):
        with TemporaryDirectory() as tmp:
            path = _write_json(
                Path(tmp),
                'ACT-D-SEGUROS-plan-estudios.json',
                {'ACT-11300': {'semestre': 99, 'creditos': 0, 'prerreqs': ['ACT-15357'], 'coreqs': [], 'estado': 0}},
            )
            new_data, plan_key, _ = process_file(
                path, self.catalog, self.rules, self.by_plan_and_course, self.fallback, self.report
            )
        self.assertEqual(plan_key, 'ACT-D')
        self.assertEqual(new_data['ACT-11300']['prerreqs'], ['ACT-15357'])  # sin tocar
        self.assertEqual(new_data['ACT-11300']['semestre'], 99)  # sin tocar (NO se refresca desde el catálogo)
        self.assertEqual(new_data['ACT-11300']['creditos'], 0)  # sin tocar
        self.assertIn(('ACT-D', 'ACT-11300'), self.report.kept_area_plan_untouched)

    def test_archivo_sin_area_si_recalcula_prereqs(self):
        with TemporaryDirectory() as tmp:
            path = _write_json(
                Path(tmp),
                'ACT-D-plan-estudios.json',
                {'ACT-11300': {'semestre': 99, 'creditos': 0, 'prerreqs': ['ACT-15357'], 'coreqs': [], 'estado': 0}},
            )
            new_data, plan_key, _ = process_file(
                path, self.catalog, self.rules, self.by_plan_and_course, self.fallback, self.report
            )
        self.assertEqual(plan_key, 'ACT-D')
        self.assertEqual(new_data['ACT-11300']['prerreqs'], ['EST-14101'])
        self.assertEqual(new_data['ACT-11300']['semestre'], 3)  # sí se refresca (no es archivo de área)
        self.assertEqual(self.report.kept_area_plan_untouched, set())

    def test_archivo_de_area_con_regla_resoluble_se_marca_como_ignorada(self):
        # ACT-11300 sí tiene una regla de Banner que resuelve a algo usable (no
        # False/error) -- se ignora por ser archivo de área, pero se distingue de
        # "Banner no tenía nada de todos modos" para poder revisarlo si algún día
        # se reconsidera la decisión de excluir áreas.
        with TemporaryDirectory() as tmp:
            path = _write_json(
                Path(tmp),
                'ACT-D-SEGUROS-plan-estudios.json',
                {'ACT-11300': {'semestre': 99, 'creditos': 0, 'prerreqs': ['ACT-15357'], 'coreqs': [], 'estado': 0}},
            )
            process_file(path, self.catalog, self.rules, self.by_plan_and_course, self.fallback, self.report)
        self.assertIn(('ACT-D', 'ACT-11300'), self.report.kept_area_plan_ignored_resolvable_rule)

    def test_archivo_de_area_sin_regla_no_se_marca_como_ignorada(self):
        catalog = {'ACT-D': {'ACT-99999': (2, 8)}}
        rules: dict[str, str] = {}  # sin regla en Banner para esta clave
        report = Report()
        with TemporaryDirectory() as tmp:
            path = _write_json(
                Path(tmp),
                'ACT-D-SEGUROS-plan-estudios.json',
                {'ACT-99999': {'semestre': 99, 'creditos': 0, 'prerreqs': [], 'coreqs': [], 'estado': 0}},
            )
            process_file(path, catalog, rules, {}, {}, report)
        self.assertIn(('ACT-D', 'ACT-99999'), report.kept_area_plan_untouched)
        self.assertEqual(report.kept_area_plan_ignored_resolvable_rule, set())


class IsAreaFileTests(unittest.TestCase):
    def test_archivo_de_area_se_detecta(self):
        self.assertTrue(is_area_file('ACT-D-SEGUROS-plan-estudios.json'))

    def test_archivo_sin_area_no_se_detecta(self):
        self.assertFalse(is_area_file('ACT-D-plan-estudios.json'))


class ProcessFileMalformedRuleTests(unittest.TestCase):
    """Una sola regla malformada en prerrequisitosMega.pkl no debe abortar el
    procesamiento del resto de materias/archivos."""

    def test_regla_malformada_no_interrumpe_y_se_reporta(self):
        catalog = {'ICI-F': {'AAA-1': (5, 8), 'BBB-1': (1, 6)}}
        rules = {
            'AAA-1': 'A-1 and ( B-1 and C-1',  # paréntesis sin cerrar -> excepción de parseo
            'BBB-1': 'AAA-1',  # regla válida, debe procesarse normalmente
        }
        report = Report()
        with TemporaryDirectory() as tmp:
            path = _write_json(
                Path(tmp),
                'ICI-F-plan-estudios.json',
                {
                    'AAA-1': {'semestre': 99, 'creditos': 0, 'prerreqs': ['VIEJO-1'], 'coreqs': [], 'estado': 0},
                    'BBB-1': {'semestre': 99, 'creditos': 0, 'prerreqs': [], 'coreqs': [], 'estado': 0},
                },
            )
            new_data, plan_key, _ = process_file(path, catalog, rules, {}, {}, report)
        self.assertEqual(new_data['AAA-1']['prerreqs'], ['VIEJO-1'])  # se dejó el valor del PDF
        self.assertEqual(new_data['AAA-1']['semestre'], 5)
        self.assertIn(('ICI-F', 'AAA-1'), report.kept_rule_parse_error)
        # La materia siguiente (BBB-1) sí se procesó con normalidad.
        self.assertEqual(new_data['BBB-1']['semestre'], 1)


class ApplyGuardrailTests(unittest.TestCase):
    """Antes de --apply, ningún archivo debe contener un grupo OR en prerreqs: el
    frontend (src/types/curriculum.ts, src/data/loader.ts) no lo interpreta y lo
    trataría como prerreq colgante silencioso (ver reporte de exploración)."""

    def test_bloquea_apply_si_hay_grupo_or(self):
        all_new_data = {
            'ACT-D-plan-estudios.json': {
                'ACT-11300': {'prerreqs': [['EST-14101', 'EST-11102']], 'coreqs': [], 'semestre': 3, 'creditos': 8, 'estado': 0}
            }
        }
        with self.assertRaises(ApplyBlocked):
            check_apply_safe(apply=True, all_new_data=all_new_data)

    def test_no_bloquea_apply_sin_grupos_or(self):
        all_new_data = {
            'ACT-D-plan-estudios.json': {
                'ACT-11300': {'prerreqs': ['EST-14101'], 'coreqs': [], 'semestre': 3, 'creditos': 8, 'estado': 0}
            }
        }
        check_apply_safe(apply=True, all_new_data=all_new_data)  # no debe lanzar

    def test_modo_scratch_nunca_bloquea_aunque_haya_grupos_or(self):
        all_new_data = {
            'ACT-D-plan-estudios.json': {
                'ACT-11300': {'prerreqs': [['EST-14101', 'EST-11102']], 'coreqs': [], 'semestre': 3, 'creditos': 8, 'estado': 0}
            }
        }
        check_apply_safe(apply=False, all_new_data=all_new_data)  # no debe lanzar

    def test_or_group_courses_detecta_grupos_anidados(self):
        new_data = {
            'ACT-11300': {'prerreqs': [['EST-14101', 'EST-11102']]},
            'ACT-11301': {'prerreqs': ['EST-14101']},
        }
        self.assertEqual(or_group_courses(new_data), ['ACT-11300'])


class TopologyAndCoreqSanityCheckTests(unittest.TestCase):
    """Mismo criterio que src/algorithms/topoValidate.ts: un prereq debe quedar en
    un semestre ESTRICTAMENTE anterior al de la materia que lo requiere."""

    def test_topology_violations_detecta_prereq_no_anterior(self):
        with TemporaryDirectory() as tmp:
            _write_json(Path(tmp), 'ICI-F-plan-estudios.json', {
                'AAA-1': {'semestre': 3, 'prerreqs': ['BBB-1'], 'coreqs': [], 'creditos': 8, 'estado': 0},
                'BBB-1': {'semestre': 5, 'prerreqs': [], 'coreqs': [], 'creditos': 8, 'estado': 0},  # >= 3 -> violación
            })
            violations = topology_violations(Path(tmp))
        self.assertEqual(violations, [('ICI-F-plan-estudios.json', 'AAA-1', 'BBB-1')])

    def test_topology_violations_vacio_cuando_todo_es_anterior(self):
        with TemporaryDirectory() as tmp:
            _write_json(Path(tmp), 'ICI-F-plan-estudios.json', {
                'AAA-1': {'semestre': 3, 'prerreqs': ['BBB-1'], 'coreqs': [], 'creditos': 8, 'estado': 0},
                'BBB-1': {'semestre': 1, 'prerreqs': [], 'coreqs': [], 'creditos': 8, 'estado': 0},
            })
            violations = topology_violations(Path(tmp))
        self.assertEqual(violations, [])

    def test_topology_violations_ignora_grupos_or(self):
        # Los grupos OR (elemento anidado) no se validan aquí -- ver ApplyBlocked.
        with TemporaryDirectory() as tmp:
            _write_json(Path(tmp), 'ICI-F-plan-estudios.json', {
                'AAA-1': {'semestre': 3, 'prerreqs': [['BBB-1', 'CCC-1']], 'coreqs': [], 'creditos': 8, 'estado': 0},
                'BBB-1': {'semestre': 5, 'prerreqs': [], 'coreqs': [], 'creditos': 8, 'estado': 0},
                'CCC-1': {'semestre': 5, 'prerreqs': [], 'coreqs': [], 'creditos': 8, 'estado': 0},
            })
            violations = topology_violations(Path(tmp))
        self.assertEqual(violations, [])

    def test_coreq_split_pairs_detecta_par_en_semestres_distintos(self):
        with TemporaryDirectory() as tmp:
            _write_json(Path(tmp), 'RI-F-plan-estudios.json', {
                'AAA-1': {'semestre': 6, 'prerreqs': [], 'coreqs': ['BBB-1'], 'creditos': 8, 'estado': 0},
                'BBB-1': {'semestre': 7, 'prerreqs': [], 'coreqs': ['AAA-1'], 'creditos': 8, 'estado': 0},
            })
            pairs = coreq_split_pairs(Path(tmp))
        self.assertEqual(set(pairs), {('RI-F-plan-estudios.json', 'AAA-1', 'BBB-1'), ('RI-F-plan-estudios.json', 'BBB-1', 'AAA-1')})

    def test_coreq_split_pairs_vacio_cuando_mismo_semestre(self):
        with TemporaryDirectory() as tmp:
            _write_json(Path(tmp), 'RI-F-plan-estudios.json', {
                'AAA-1': {'semestre': 6, 'prerreqs': [], 'coreqs': ['BBB-1'], 'creditos': 8, 'estado': 0},
                'BBB-1': {'semestre': 6, 'prerreqs': [], 'coreqs': ['AAA-1'], 'creditos': 8, 'estado': 0},
            })
            pairs = coreq_split_pairs(Path(tmp))
        self.assertEqual(pairs, [])


if __name__ == '__main__':
    unittest.main()
