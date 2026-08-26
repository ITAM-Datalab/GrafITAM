"""
Resuelve las reglas crudas de inscripcion estilo Banner (prerrequisitosMega.pkl)
al conjunto de prerrequisitos/correquisitos valido para UN plan concreto.

Cada valor de prerrequisitosMega.pkl es una expresion booleana en texto (and/or/
parentesis, sin "not") que Banner arma juntando TODAS las generaciones/planes que
alguna vez ofrecieron esa materia en una sola regla, ej.:

    ' ( EGN-17122 and EGN-17141 and LEN-12701 ) and ICIF-0 ) or ( ... otro plan ... )'

Los tokens vienen de dos familias, indistinguibles por forma salvo por el sufijo:
- Materia real: "EGN-17122" (clave real, aparece tal cual en planes.pkl).
- Pertenencia a plan: "ICIF-0" = plan_key.replace('-', '') + '-0' (ver plan_token).
  Los 3 programas de 2 letras (I.A/M.A/R.I) traen el punto literal en planes.pkl,
  por eso la sustitucion de guion no lo toca: "M.A-D" -> "M.AD-0".

resolve() sustituye el token del plan objetivo por True y cualquier otro token con
forma de plan (o el "-0" suelto sin prefijo, artefacto de exportacion con PlanC
vacio que aparece en algunas reglas) por False, y simplifica. Se probo contra los
2,504 registros reales: 70.76% quedan como una sola clausula AND, 8.09% sin
restriccion, 2.22% no matchea ningun branch para ese plan (posible generacion no
cubierta por el export), 12.59% quedan como un OR genuino de 2+ alternativas
(materias renumeradas entre subgeneraciones, ej. EST-24105 acepta EST-14103 o
EST-11102 dentro del mismo plan).
"""

from __future__ import annotations

import re
from typing import Union

Clause = frozenset  # cláusula AND: conjunto de códigos de materia (frozenset[str])
# Resultado de resolve(): True (sin restricción), False (el plan no matchea ningún
# branch de la regla), o un frozenset de Clause (OR de cláusulas AND — un solo
# elemento cuando la regla se redujo a una sola cláusula sin ambigüedad).
Rule = Union[bool, frozenset]

_TOKEN_RE = re.compile(r'\(|\)|[A-Za-z0-9.]{0,8}-[0-9]{1,5}|and|or')
_PLAN_TOKEN_RE = re.compile(r'^[A-Za-z0-9.]{1,4}-0$')


def _tokenize(rule_text: str) -> list[str]:
    return [m.group(0) for m in _TOKEN_RE.finditer(rule_text)]


class _Parser:
    """Descenso recursivo sobre and/or/parentesis (Banner no usa "not" aqui).

    "and" y "or" se evalúan con la MISMA precedencia, estrictamente de izquierda
    a derecha (NO la convención matemática de "and" antes que "or") -- se
    confirmó empíricamente que así es como el exportador de Banner serializó las
    reglas: patrones sin paréntesis completos como "(X) or (Y) or (Z) and W-0"
    aparecen una y otra vez, y solo tienen sentido semántico como
    "((X or Y) or Z) and W-0" (todo el OR gateado por el token de plan al final),
    no como "X or Y or (Z and W-0)" (que dejaría X e Y como alternativas
    universales sin ninguna restricción de plan -- se probó contra COM-12101 y
    esa lectura producía 2 alternativas espurias que no aparecen en el PDF).

    Validación cuantitativa (no solo el caso anecdótico de COM-12101): sobre las
    11,646 materias de jsonPEs/2025_01/ con prerreqs no vacíos y regla de Banner
    no trivial, izquierda-a-derecha matchea EXACTO el prereq del PDF en 80.5% de
    los casos, contra 78.1% con la convención and-antes-que-or -- una diferencia
    real pero modesta (no una prueba definitiva; queda como el mejor default
    medido, no como hecho confirmado para el 100% de los casos).
    """

    def __init__(self, tokens: list[str]):
        self._tokens = tokens
        self._i = 0

    def _peek(self) -> str | None:
        return self._tokens[self._i] if self._i < len(self._tokens) else None

    def _eat(self, expected: str | None = None) -> str:
        token = self._tokens[self._i]
        if expected is not None and token != expected:
            raise ValueError(f'se esperaba {expected!r}, se encontró {token!r}')
        self._i += 1
        return token

    def parse_expr(self):
        node = self.parse_factor()
        while self._peek() in ('and', 'or'):
            op = self._eat()
            node = (op, node, self.parse_factor())
        return node

    def parse_factor(self):
        if self._peek() == '(':
            self._eat('(')
            node = self.parse_expr()
            self._eat(')')
            return node
        return ('atom', self._eat())


def parse_rule(rule_text: str):
    """AST como tuplas anidadas ('and'|'or', izq, der) | ('atom', token)."""
    tokens = _tokenize(rule_text)
    if not tokens:
        return None
    return _Parser(tokens).parse_expr()


def plan_token(plan_key: str) -> str:
    """'ICI-F' -> 'ICIF-0'; 'M.A-D' -> 'M.AD-0' (ver docstring del módulo)."""
    return plan_key.replace('-', '') + '-0'


def _as_or_of_clauses(value: str | frozenset) -> frozenset:
    if isinstance(value, str):
        return frozenset({frozenset({value})})
    return value


def _drop_dominated(clauses: frozenset) -> frozenset:
    """Ley de absorción: A or (A y B) = A — descarta cláusulas que sean
    superconjunto estricto de otra cláusula del mismo grupo OR. Sin esto, ramas
    de la regla que solo agregan un requisito redundante (ej. una restricción de
    plan que ya no aporta nada tras sustituir el token) inflaban el OR aparente
    de 19.4% a un 12.59% real una vez aplicado."""
    clause_list = list(clauses)
    kept = [
        clause
        for i, clause in enumerate(clause_list)
        if not any(other < clause for j, other in enumerate(clause_list) if j != i)
    ]
    return frozenset(kept)


def _and_combine(left, right):
    if left is False or right is False:
        return False
    if left is True:
        return right
    if right is True:
        return left
    combined = {a | b for a in _as_or_of_clauses(left) for b in _as_or_of_clauses(right)}
    return _drop_dominated(frozenset(combined))


def _or_combine(left, right):
    if left is True or right is True:
        return True
    if left is False:
        return right
    if right is False:
        return left
    return _drop_dominated(frozenset(_as_or_of_clauses(left) | _as_or_of_clauses(right)))


def resolve(rule_text: str | None, plan_key: str) -> Rule:
    """Reduce la regla cruda de Banner al resultado valido para un plan concreto."""
    if rule_text is None:
        return True  # sin regla en Banner -> sin restricción
    tree = parse_rule(rule_text)
    if tree is None:
        return True
    token = plan_token(plan_key)

    def _simplify(node):
        if node[0] == 'atom':
            atom = node[1]
            if atom == token:
                return True
            if _PLAN_TOKEN_RE.match(atom) or atom == '-0':
                return False
            return atom  # materia real, queda simbólica
        left = _simplify(node[1])
        right = _simplify(node[2])
        return _and_combine(left, right) if node[0] == 'and' else _or_combine(left, right)

    result = _simplify(tree)
    if result is True or result is False:
        return result
    return _as_or_of_clauses(result)  # normaliza un átomo/cláusula suelta a frozenset[Clause]


def classify(
    rule: Rule,
    plan_key: str,
    target_semester: int,
    semester_by_plan_and_course: dict[tuple[str, str], int],
    semester_fallback: dict[str, int],
) -> list[str | list[str]]:
    """Convierte el resultado de resolve() en `prerreqs` del schema de GrafItam.

    IMPORTANTE -- esta función NO produce coreqs, a propósito: se midió en los
    232 archivos reales que promover los átomos de "mismo semestre que la
    materia objetivo" a coreq destruía 1121 de los 1136 coreqs que ya trae el
    JSON actual (generado por el marcador "(A)" del PDF, una pareja de diseño
    curricular) -- Banner casi nunca incluye a esa pareja como átomo de su
    regla; cuando incluye un curso del mismo semestre suele ser un curso
    predecesor/alternativo (ver EGN-17123: la regla exige LEN-12701, no el
    LEN-12702 con el que el PDF lo empareja), no la pareja de coreq real. Un
    átomo cuyo semestre coincide con el de la materia objetivo se DESCARTA
    (no se promueve a prereq ni a coreq): promoverlo a prereq generaría un
    ValidationError falso en topoValidate.ts (exige que el prereq quede
    planeado en un semestre estrictamente anterior). `coreqs` se deja
    intacto por el llamador (pickles_to_json.py no toca ese campo).

    Un átomo que no aparece en NINGÚN plan de planes.pkl (ruido de exportación
    tipo "9909-51"/"PL01-10201", o materias de otro nivel) también se descarta.

    Cuando la regla se redujo a un OR de 2+ alternativas, se factorizan los
    átomos comunes a TODAS las ramas como requisitos planos obligatorios, y solo
    lo que realmente difiere entre ramas se declara como grupo OR (un único
    elemento de `prerreqs` que es a su vez una lista = "cualquiera de estas").
    Si una rama conserva más de un átomo tras factorizar, se aplanan todos como
    alternativas individuales del grupo — se pierde el acoplamiento AND interno
    de esa rama, una simplificación consciente del schema actual (solo soporta
    un nivel de "cualquiera de estas", ver plan de diseño).
    """
    if rule is True or rule is False:
        return []

    def is_earlier(course: str) -> bool:
        sem = semester_by_plan_and_course.get((plan_key, course), semester_fallback.get(course))
        return sem is not None and sem < target_semester

    def keep_earlier(courses: set[str]) -> list[str]:
        return sorted(c for c in courses if is_earlier(c))

    clauses = list(rule)
    if len(clauses) == 1:
        return keep_earlier(set(clauses[0]))

    common = set.intersection(*(set(c) for c in clauses))
    prereqs = keep_earlier(common)
    branch_extras = [set(c) - common for c in clauses if set(c) - common]
    or_atoms = {atom for branch in branch_extras for atom in branch}
    if len(branch_extras) <= 1 or not or_atoms:
        return prereqs  # tras factorizar no quedó ambigüedad real

    group = keep_earlier(or_atoms)
    if len(group) <= 1:
        # tras descartar átomos de mismo semestre o sin semestre conocido no
        # quedó ambigüedad real -- no envolver un solo curso (o ninguno) en OR.
        prereqs.extend(group)
    else:
        prereqs.append(group)
    return prereqs
