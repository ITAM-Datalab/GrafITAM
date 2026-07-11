"""Scrapea horarios/CRN de todos los periodos LICENCIATURA vigentes en ITACA (ITAM).

Genera un JSON por periodo en jsonHorarios/{slug}.json con forma
Record<courseId, ScheduleGroup[]> (mismo schema que src/types/schedule.ts),
mas un manifiesto jsonHorarios/index.json con la lista de periodos disponibles.

No requiere login: "Servicios no personalizados" es publico. Los codigos de
periodo (?s=NNNN) cambian cada semestre, por eso se descubren leyendo el menu
en cada corrida en vez de quedar fijos en el codigo.
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "requests"], check=True)
    import requests

try:
    from bs4 import BeautifulSoup
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "beautifulsoup4"], check=True)
    from bs4 import BeautifulSoup

BASE = "https://itaca2.itam.mx:8443/b9prod/edsup"
MENU_URL = f"{BASE}/BWZKSENP.P_MenuServNoPers"
HORARIOS1_URL = f"{BASE}/BWZKSENP.P_Horarios1"
HORARIOS2_URL = f"{BASE}/BWZKSENP.P_Horarios2"

OUT_DIR = "jsonHorarios"
REQUEST_DELAY = 0.35  # segundos entre requests, para no saturar el servidor de ITAM
HEADERS = {"User-Agent": "GrafItam-horarios-scraper/1.0 (+https://github.com/BraulioLoz/GrafITAM)"}

PERIODO_RE = re.compile(
    r'href=BWZKSENP\.P_Horarios1\?s=(\d+)[^>]*>\s*-\s*Horarios para el per[ií]odo\s*(.*?)\s*</a>',
    re.IGNORECASE,
)
DIA_RE = re.compile(r'LU|MA|MI|JU|VI|SA|DO')


def slugify(label: str) -> str:
    s = label.lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
        s = s.replace(a, b)
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def normalize_dias(raw: str) -> str:
    return " ".join(DIA_RE.findall(raw.upper()))


def discover_periodos(session: "requests.Session") -> list[dict]:
    """Lee el menu de servicios no personalizados y regresa los periodos LICENCIATURA."""
    resp = session.get(MENU_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    periodos = []
    for match in PERIODO_RE.finditer(resp.text):
        s_code, label = match.group(1), match.group(2).strip()
        if label.startswith("(") and label.endswith(")"):
            label = label[1:-1].strip()
        if "LICENCIATURA" not in label.upper():
            continue
        periodos.append({"sCode": s_code, "label": label})
    return periodos


def fetch_materias(session: "requests.Session", s_code: str) -> list[str]:
    """Lee el <select name=txt_materia> de P_Horarios1 para un periodo dado."""
    resp = session.get(HORARIOS1_URL, params={"s": s_code}, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    select = soup.find("select", attrs={"name": "txt_materia"})
    if select is None:
        return []
    return [opt.get_text(strip=True) for opt in select.find_all("option") if opt.get_text(strip=True)]


def parse_grupos(html: str) -> dict[str, list[dict]]:
    """Parsea la tabla de resultados de P_Horarios2 a ScheduleGroup[] por courseId."""
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table", attrs={"border": "1"})
    result: dict[str, list[dict]] = {}
    if table is None:
        return result
    rows = table.find_all("tr")[1:]  # se salta el header
    for row in rows:
        cells = [c.get_text(" ", strip=True) for c in row.find_all("td")]
        if len(cells) < 12:
            continue
        depto, clave, grupo, crn, _tipo, nombre, profesor, _creditos, horario, dias, salon, campus = cells[:12]
        course_id = f"{depto}-{clave}"
        group = {
            "crn": crn,
            "grupo": grupo,
            "nombre": nombre,
            "profesor": profesor,
            "horario": horario,
            "dias": normalize_dias(dias),
            "salon": salon,
            "campus": campus,
        }
        result.setdefault(course_id, []).append(group)
    return result


def scrape_periodo(session: "requests.Session", periodo: dict) -> dict[str, list[dict]]:
    s_code = periodo["sCode"]
    materias = fetch_materias(session, s_code)
    data: dict[str, list[dict]] = {}
    total = len(materias)
    print(f"  {periodo['label']}: {total} materias")
    for i, materia in enumerate(materias, start=1):
        time.sleep(REQUEST_DELAY)
        try:
            resp = session.post(
                HORARIOS2_URL,
                data={"s": s_code, "txt_materia": materia},
                headers=HEADERS,
                timeout=30,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            print(f"    [{i}/{total}] ERROR {materia}: {e}")
            continue
        for course_id, groups in parse_grupos(resp.text).items():
            data.setdefault(course_id, []).extend(groups)
        if i % 50 == 0:
            print(f"    [{i}/{total}] procesadas")
    return data


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    session = requests.Session()

    print("Descubriendo periodos LICENCIATURA vigentes...")
    periodos = discover_periodos(session)
    if not periodos:
        print("No se encontraron periodos LICENCIATURA en el menu. Abortando.")
        sys.exit(1)

    index = []
    for periodo in periodos:
        slug = slugify(periodo["label"])
        print(f"Scrapeando {periodo['label']} (s={periodo['sCode']})...")
        data = scrape_periodo(session, periodo)
        out_path = os.path.join(OUT_DIR, f"{slug}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        index.append(
            {
                "slug": slug,
                "label": periodo["label"],
                "sCode": periodo["sCode"],
                "scrapedAt": datetime.now(timezone.utc).isoformat(),
                "materiasConGrupos": len(data),
            }
        )
        print(f"  -> {out_path} ({len(data)} materias con grupos)")

    with open(os.path.join(OUT_DIR, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"Listo. {len(index)} periodo(s) escritos en {OUT_DIR}/")


if __name__ == "__main__":
    main()
