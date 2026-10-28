"""Perfiles de arquetipo para COMPARAR -> data/meta.json

  python -I scripts/build_meta.py            (usa las páginas de data/meta/raw/arch/ y data/decklists.json; no hace peticiones nuevas)

Lee de cada página de arquetipo de Side-6 el bloque "popularCards" de la ventana del último set (GD05): para cada una de las 40 cartas
más jugadas, en cuántas listas aparece y con cuántas copias. De ahí salen adopción (listas con la carta / listas totales) y copias medias
(entre las listas que la llevan). Lo que no está en el top 40 no tiene porcentaje exacto: solo se sabe que queda por debajo de la
adopción de la carta nº 40 (`cutoff`). Se añaden como listas de ejemplo las mejores de data/decklists.json. Todo o nada."""
import json
import os
import re
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_decklists as bd  # noqa: E402

RAW = bd.RAW
OUT = os.path.join(ROOT, "data", "meta.json")
# Etiqueta del formato que se enseña al usuario. Revisar cuando salga un set nuevo (p. ej. tras GD06).
FORMAT_LABEL = "GD05 + ST11–ST14 · PRE-GD06"
ERA_RE = re.compile(r"^(GD|ST|EB)(\d+)$")
SAMPLES_PER_ARCHETYPE = 3


def popular_pools(html):
    """-> [{label, total, cards:[{n, decks, copies}]}] una por ventana de set que traiga la página."""
    text = bd.unescape(html)
    dec = json.JSONDecoder()
    pools, prev_end = [], 0
    for m in re.finditer(r'"popularCards":', text):
        try:
            arr, used = dec.raw_decode(text[m.end():])
        except ValueError:
            continue
        # la etiqueta y el total de ESTA ventana están justo antes de su bloque, nunca en el de la ventana anterior
        ctx = text[max(prev_end, m.start() - 3000):m.start()]
        prev_end = m.end() + used
        label = re.findall(r'"window":\{[^{}]*?"label":"([^"]+)"', ctx)
        total = re.findall(r'"totalDecks":(\d+)', ctx)
        if not isinstance(arr, list) or not total:
            continue
        cards = [{"n": c["cardNumber"], "decks": c["numberOfDecks"], "copies": c["numberOfCopies"]} for c in arr
                 if isinstance(c, dict) and c.get("cardNumber") and c.get("numberOfDecks")]
        pools.append({"label": label[-1] if label else None, "total": int(total[-1]), "cards": cards})
    return pools


def pick_current(pools):
    """La ventana del último set (GD05 > GD04 > …). Sin etiqueta de set no es una ventana de era."""
    eras = [p for p in pools if p["label"] and ERA_RE.match(p["label"])]
    if not eras:
        raise ValueError("la página no trae ventanas por set")
    return max(eras, key=lambda p: (int(ERA_RE.match(p["label"]).group(2)), p["label"]))


MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}


def window_dates(text):
    """'Aug 3 – Nov 1, 2026' -> ('2026-08-03', '2026-11-01'); None si no se entiende."""
    m = re.match(r"([A-Z][a-z]{2}) (\d+)\s*[–-]\s*([A-Z][a-z]{2}) (\d+), (\d{4})", text or "")
    if not m or m.group(1) not in MONTHS or m.group(3) not in MONTHS:
        return None
    y = int(m.group(5)); y0 = y - 1 if MONTHS[m.group(1)] > MONTHS[m.group(3)] else y
    return "%04d-%02d-%02d" % (y0, MONTHS[m.group(1)], int(m.group(2))), "%04d-%02d-%02d" % (y, MONTHS[m.group(3)], int(m.group(4)))


def window_text(html):
    m = re.search(r"Data window</span><span[^>]*>([^<]+)</span>", html)
    w = re.search(r"(\d+) weeks", html[m.end():m.end() + 600]) if m else None
    return (m.group(1).strip() + (" (%s weeks)" % w.group(1) if w else "")) if m else None


def profile(slug, html):
    base = bd.parse_archetype(html, slug)              # nombre, colores, estilo (y las listas, que aquí no se usan)
    pools = popular_pools(html)
    pool = pick_current(pools)
    era_decks = {p["label"]: p["total"] for p in pools if p["label"] and ERA_RE.match(p["label"])}      # listas por ventana de set: sirve para la presencia y su movimiento
    if pool["total"] <= 0 or not pool["cards"]:
        raise ValueError("ventana vacía en " + slug)
    cards = {}
    for c in pool["cards"]:
        cards[c["n"]] = {"adoption": round(c["decks"] / pool["total"], 4), "avgCopies": round(c["copies"] / c["decks"], 2)}
    return {"id": slug, "name": base["name"], "colors": [bd_letter(x) for x in base["colors"]],
            "style": base["style"], "deckCount": pool["total"], "eraDecks": era_decks, "era": pool["label"], "cutoff": min(v["adoption"] for v in cards.values()),
            "sourceUrl": "%s/en/archetypes/%s/" % (bd.BASE, slug), "cards": cards}


def bd_letter(color):
    return {"Blue": "B", "Green": "G", "Red": "R", "Purple": "P", "White": "W"}[color]


def build():
    catalog = {c["number"] for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}
    decklists = json.load(open(os.path.join(ROOT, "data", "decklists.json"), encoding="utf-8"))
    samples = {a["id"]: a["decks"] for a in decklists["archetypes"]}
    slugs = bd.parse_index(open(os.path.join(RAW, "index.html"), encoding="utf-8").read())
    if len(slugs) < 25:
        raise RuntimeError("el índice trae solo %d arquetipos" % len(slugs))
    archetypes, unknown, win = [], set(), None
    for slug in slugs:
        path = os.path.join(RAW, slug + ".html")
        if not os.path.exists(path):
            raise RuntimeError("falta la página de %s: ejecuta scripts/build_decklists.py primero" % slug)
        html = open(path, encoding="utf-8").read()
        try:
            a = profile(slug, html)
        except Exception as e:
            raise RuntimeError("falló %s: %s" % (slug, e))
        win = win or window_text(html)
        unknown.update(n for n in a["cards"] if n not in catalog)
        best = sorted(samples.get(slug, []), key=lambda d: (d["place"] or 99, d["event"]["date"] or ""))[:SAMPLES_PER_ARCHETYPE]
        a["sampleDecks"] = [{"placement": d["place"], "sourceUrl": "%s/en/decklists/%s/" % (bd.BASE, d["h"]), "cards": d["cards"]} for d in best]
        archetypes.append(a)
    today = datetime.now(timezone.utc)
    return {
        "snapshot": {
            "id": today.strftime("%Y-%m-%d"), "retrievedAt": today.strftime("%Y-%m-%dT%H:%M:%SZ"), "dataDate": today.strftime("%Y-%m-%d"),
            "source": {"id": "side6", "name": "Side-6", "url": bd.BASE + "/en/archetypes/", "sourceType": "tournament_database"},
            "formatLabel": FORMAT_LABEL, "windowLabel": win, "windowFrom": (window_dates(win) or (None, None))[0], "windowTo": (window_dates(win) or (None, None))[1],
            "era": max(a["era"] for a in archetypes), "eras": sorted({e for a in archetypes for e in a["eraDecks"]}),
        },
        "archetypes": archetypes,
        "unknownCards": sorted(unknown),
    }


def main():
    data = build()
    total = sum(a["deckCount"] for a in data["archetypes"])
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print("%d arquetipos, %d listas en las ventanas, ventana: %s, %d KB" % (len(data["archetypes"]), total, data["snapshot"]["windowLabel"], os.path.getsize(OUT) // 1024))
    if data["unknownCards"]:
        print("cartas que no están en el catálogo:", ", ".join(data["unknownCards"]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
