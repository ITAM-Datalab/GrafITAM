"""
Tests de banner_rules.py contra strings reales de prerrequisitosMega.pkl,
copiados tal cual durante el análisis previo a este pipeline (ver plan de diseño).
No dependen de tener el .pkl en disco -- son fixtures fijas.
"""

import unittest

from banner_rules import classify, plan_token, resolve

# Regla real completa de EGN-17123: agrega en un solo OR todas las generaciones
# de TODOS los planes que alguna vez la ofrecieron. Para el plan ICI-F, dos ramas
# "universales" (9909-51, LEN-10131 -- alternativas sin token de plan) sobreviven
# junto a la rama propia de ICI-F (gateada por ICIF-0, con LEN-12701).
EGN_17123_RULE = (
    '(  ( 9909-51 and EGN-17122 and EGN-17141 ) or ( LEN-10131 and EGN-17122 and EGN-17141 ) ) '
    'or ( ( ( EGN-17122 and EGN-17141 )  and ( ACAA-0 ) ) '
    'or (  ( EGN-17122 and EGN-17141 )  and ACDE-0 ) '
    'or (  ( EGN-17122 and EGN-17141 and LEN-12701 )  and ICIF-0 ) '
    'or (  ( EGN-17122 and EGN-17141 and LEN-10131 )  and AACD-0 ) )'
)

MAT_14200_RULE = (
    ' ( MAT-14001 and ( ACTC-0 or ACTD-0 or ACTE-0 or M.AA-0 ) and MAT-14001 ) '
    'or ( -0 and ( AACA-0 or AACB-0 ) and -0 ) '
    'or ( COME-0 ) or ( COMF-0 ) or ( COMG-0 ) '
    'or ( NEGC-0 and 9909-40 ) or ( NEGC-0 and MAT-14001 ) or ( NEGC-0 and -0 )'
)

ACT_25354_RULE = ' ( EST-14102 and ACT-15357 ) or ( ADM-15532 and ( ACMF-0 or DACB-0 ) and EST-24127 )'
EST_24105_RULE = ' ( EST-14103 or EST-11102 )'
COM_11303_RULE = ' COM-11302'
MAT_14100_RULE = ' ( AACD-0 or AACE-0 or ACTD-0 or ICIF-0 )'  # solo tokens de plan, ninguna materia real


class ResolveTests(unittest.TestCase):
    def test_plan_token_formatos(self):
        self.assertEqual(plan_token('ICI-F'), 'ICIF-0')
        self.assertEqual(plan_token('M.A-D'), 'M.AD-0')
        self.assertEqual(plan_token('ACT-D'), 'ACTD-0')

    def test_sin_regla_es_sin_restriccion(self):
        self.assertIs(resolve(None, 'ICI-F'), True)

    def test_cadena_trivial_de_un_solo_prereq(self):
        result = resolve(COM_11303_RULE, 'ICI-F')
        self.assertEqual(result, frozenset({frozenset({'COM-11302'})}))

    def test_solo_tokens_de_plan_sin_materia_real(self):
        # MAT-14100 (primer semestre): el plan propio hace que todo colapse a True.
        self.assertIs(resolve(MAT_14100_RULE, 'ICI-F'), True)
        # Un plan que no aparece en la regla -> ningún branch matchea -> False.
        self.assertIs(resolve(MAT_14100_RULE, 'RI-F'), False)

    def test_rama_propia_del_plan_colapsa_pero_alternativas_universales_sobreviven(self):
        result = resolve(EGN_17123_RULE, 'ICI-F')
        clauses = {frozenset(c) for c in result}
        self.assertIn(frozenset({'EGN-17122', 'EGN-17141', 'LEN-12701'}), clauses)
        self.assertIn(frozenset({'EGN-17122', 'EGN-17141', 'LEN-10131'}), clauses)
        self.assertIn(frozenset({'EGN-17122', 'EGN-17141', '9909-51'}), clauses)
        # Ramas gateadas por el token de OTRO plan (ACAA-0, ACDE-0, AACD-0) no aparecen.
        self.assertEqual(len(clauses), 3)

    def test_absorcion_colapsa_a_una_sola_clausula(self):
        # MAT-14001 aparece repetido en la primera rama (redundante) y la rama
        # "-0" (PlanC vacío) es puro artefacto -> False. Para ACT-D solo queda
        # la rama real: MAT-14001 (el token de plan ACTD-0 sí está en la lista).
        result = resolve(MAT_14200_RULE, 'ACT-D')
        self.assertEqual(result, frozenset({frozenset({'MAT-14001'})}))

    def test_plan_sin_ninguna_rama_matcheada(self):
        # RI-F no aparece en absoluto en esta regla recortada de prueba.
        self.assertIs(resolve(MAT_14200_RULE, 'RI-F'), False)

    def test_or_genuino_entre_alternativas_equivalentes(self):
        result = resolve(EST_24105_RULE, 'ACT-D')
        self.assertEqual(result, frozenset({frozenset({'EST-14103'}), frozenset({'EST-11102'})}))

    def test_and_de_dos_materias_reales(self):
        result = resolve(ACT_25354_RULE, 'ACT-D')
        self.assertEqual(result, frozenset({frozenset({'EST-14102', 'ACT-15357'})}))

    def test_regla_vacia_es_sin_restriccion(self):
        # Distinto de resolve(None, ...): string vacío sin ningún token -> parse_rule
        # regresa None -> misma salida (sin restricción), pero es un camino de código
        # distinto (parse_rule con texto vacío) que no tenía test propio.
        self.assertIs(resolve('', 'ICI-F'), True)

    def test_precedencia_and_or_izquierda_a_derecha(self):
        # Fija la decisión documentada en _Parser: "and"/"or" se evalúan con la
        # MISMA precedencia, izquierda a derecha -- NO la convención matemática de
        # "and" antes que "or". Con 'AAA-1 or BBB-1 or CCC-1 and OTHR-0' evaluado
        # para un plan que NO es el gateado por OTHR-0:
        #   izquierda-a-derecha (implementación actual):
        #     ((AAA or BBB) or CCC) and OTHR-0(False) -> False (todo queda gateado
        #     por el token de plan al final, y ese plan no matchea).
        #   and-antes-que-or (convención estándar, NO usada aquí):
        #     AAA or BBB or (CCC and OTHR-0(False)) -> AAA or BBB (dos alternativas
        #     universales sobreviven, sin restricción de plan).
        # Si un refactor futuro cambiara la precedencia por accidente, este test
        # empezaría a fallar (pasaría de False a un OR con AAA-1/BBB-1).
        rule = 'AAA-1 or BBB-1 or CCC-1 and OTHR-0'
        self.assertIs(resolve(rule, 'ICI-F'), False)

    def test_absorcion_aislada_sin_interferencia_de_token_de_plan(self):
        # Caso mínimo de la ley de absorción (_drop_dominated) sin ningún token de
        # plan de por medio: 'AAA-1 or (AAA-1 and BBB-1)' -> la cláusula más grande
        # {AAA-1, BBB-1} es superconjunto estricto de {AAA-1} y se descarta.
        rule = ' ( AAA-1 ) or ( AAA-1 and BBB-1 )'
        result = resolve(rule, 'ZZZ-Z')
        self.assertEqual(result, frozenset({frozenset({'AAA-1'})}))


class ClassifyTests(unittest.TestCase):
    """classify() nunca produce coreqs -- ver docstring de banner_rules.classify:
    promover átomos de "mismo semestre" a coreq destruía 1121/1136 de los coreqs
    reales (medido en jsonPEs/2025_01/ completo). El llamador deja `coreqs`
    intacto; classify() solo devuelve `prerreqs`, y un átomo de mismo semestre
    (o semestre desconocido) se descarta en vez de promoverse a cualquier lado.
    """

    def test_sin_restriccion_no_genera_nada(self):
        self.assertEqual(classify(True, 'ICI-F', 1, {}, {}), [])
        self.assertEqual(classify(False, 'ICI-F', 1, {}, {}), [])

    def test_atomo_de_mismo_semestre_se_descarta_no_se_promueve(self):
        rule = resolve(EGN_17123_RULE, 'ICI-F')
        semesters = {
            ('ICI-F', 'EGN-17122'): 2,
            ('ICI-F', 'EGN-17141'): 1,
            ('ICI-F', 'LEN-12701'): 3,  # mismo semestre que la materia objetivo -> se descarta
            ('ICI-F', 'LEN-10131'): 1,
            ('ICI-F', '9909-51'): 1,
        }
        prereqs = classify(rule, 'ICI-F', target_semester=3, semester_by_plan_and_course=semesters, semester_fallback={})
        # EGN-17122/EGN-17141 son comunes a las 3 ramas -> quedan como prereq plano.
        self.assertIn('EGN-17122', prereqs)
        self.assertIn('EGN-17141', prereqs)
        # De lo que difiere entre ramas, LEN-12701 es del mismo semestre -> se
        # descarta; solo sobreviven LEN-10131 y 9909-51 (semestre anterior), y
        # como ya no hay ambigüedad real (un solo grupo con 2 alternativas sigue
        # siendo un grupo) se mantiene como OR.
        or_groups = [p for p in prereqs if isinstance(p, list)]
        self.assertEqual(len(or_groups), 1)
        self.assertEqual(set(or_groups[0]), {'LEN-10131', '9909-51'})

    def test_atomo_sin_semestre_conocido_se_descarta(self):
        rule = resolve(COM_11303_RULE, 'ICI-F')
        prereqs = classify(rule, 'ICI-F', target_semester=2, semester_by_plan_and_course={}, semester_fallback={})
        self.assertEqual(prereqs, [])

    def test_or_de_alternativas_simples_sin_atomos_comunes(self):
        rule = resolve(EST_24105_RULE, 'ACT-D')
        semesters = {('ACT-D', 'EST-14103'): 5, ('ACT-D', 'EST-11102'): 5}
        prereqs = classify(rule, 'ACT-D', target_semester=6, semester_by_plan_and_course=semesters, semester_fallback={})
        self.assertEqual(len(prereqs), 1)
        self.assertEqual(set(prereqs[0]), {'EST-14103', 'EST-11102'})

    def test_atomo_dangling_se_clasifica_por_semestre_fallback(self):
        # COM-11302 no pertenece al plan objetivo (no está en
        # semester_by_plan_and_course) pero sí aparece en semester_fallback (semestre
        # mínimo en que aparece en CUALQUIER plan) -- debe clasificarse con ese valor.
        rule = resolve(COM_11303_RULE, 'ICI-F')
        prereqs = classify(rule, 'ICI-F', target_semester=3, semester_by_plan_and_course={}, semester_fallback={'COM-11302': 1})
        self.assertEqual(prereqs, ['COM-11302'])

    def test_atomo_dangling_con_fallback_no_anterior_se_descarta(self):
        rule = resolve(COM_11303_RULE, 'ICI-F')
        prereqs = classify(rule, 'ICI-F', target_semester=3, semester_by_plan_and_course={}, semester_fallback={'COM-11302': 5})
        self.assertEqual(prereqs, [])

    def test_or_group_con_un_solo_sobreviviente_no_se_envuelve_en_lista(self):
        # EST_24105_RULE resuelve a dos clausulas de un solo átomo cada una
        # (EST-14103 / EST-11102), sin átomos comunes. Si solo UNA sobrevive el
        # filtro de semestre, classify() debe devolverla plana (no como grupo OR
        # de un elemento) -- ver el branch `len(group) <= 1` de classify().
        rule = resolve(EST_24105_RULE, 'ACT-D')
        semesters = {('ACT-D', 'EST-14103'): 3}  # anterior al objetivo (target=4)
        # EST-11102 sin entrada en semesters ni en fallback -> se descarta.
        prereqs = classify(rule, 'ACT-D', target_semester=4, semester_by_plan_and_course=semesters, semester_fallback={})
        self.assertEqual(prereqs, ['EST-14103'])

    def test_or_group_sin_ningun_sobreviviente_queda_vacio(self):
        rule = resolve(EST_24105_RULE, 'ACT-D')
        semesters = {('ACT-D', 'EST-14103'): 6, ('ACT-D', 'EST-11102'): 6}  # ninguno anterior al objetivo
        prereqs = classify(rule, 'ACT-D', target_semester=6, semester_by_plan_and_course=semesters, semester_fallback={})
        self.assertEqual(prereqs, [])


if __name__ == '__main__':
    unittest.main()
