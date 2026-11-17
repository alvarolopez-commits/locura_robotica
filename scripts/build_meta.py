"""Perfiles de arquetipo para COMPARAR y presencia por set -> data/meta.json

  python -I scripts/build_meta.py            (usa las páginas de data/meta/raw/arch/ y data/decklists.json; no hace peticiones nuevas)

Formato web de Side-6 de nov 2026: cada página de arquetipo trae `windows` (una por ventana de set: GD05, GD05:ST11-14, GD06…) con los puestos del
arquetipo, el total de puestos de la ventana y, cuando hay listas suficientes, un `consensus` por carta: inclusión (listas con la carta / listas) y
cuántas listas llevan 1, 2, 3 o 4 copias. De ahí salen:
  · presencia por set (`eraDecks`): puestos del arquetipo en las ventanas del set (las ventanas intermedias, p. ej. GD05:ST11-14, cuentan para GD05);
  · perfil de cartas (`cards`): adopción = inclusión; copias medias = entre las listas que la llevan. Se usa el set más reciente con consenso; si ninguno
    lo tiene, las listas de ejemplo de data/decklists.json (con al menos 5 y marcado `sampleBased`); si tampoco, sin perfil.
Lo que no sale en el consenso no tiene porcentaje exacto: queda por debajo de la carta menos incluida (`cutoff`). Todo o nada."""
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
FORMAT_LABEL = "GD05 + ST11–ST14 · GD06 desde el 6 nov"
ERA_RE = re.compile(r"^(GD|ST|EB)(\d+)$")
SAMPLES_PER_ARCHETYPE = 3
MIN_SAMPLE_PROFILE = 5


def merge_consensus(windows):
    """Consenso de varias ventanas del mismo set -> (listas, {carta: {adoption, avgCopies}}). Las cartas que una ventana omite cuentan 0 en esa ventana."""
    decks, with_card, copies = 0, {}, {}
    for w in windows:
        c = w.get("consensus") or {}
        n = c.get("deckCount") or 0
        if not n:
            continue
        decks += n
        for x in c.get("cards") or []:
            cc = x.get("copyCounts") or []
            k = sum(cc)
            if not k:
                continue
            with_card[x["cardNumber"]] = with_card.get(x["cardNumber"], 0) + k
            copies[x["cardNumber"]] = copies.get(x["cardNumber"], 0) + sum((i + 1) * v for i, v in enumerate(cc))
    cards = {n: {"adoption": round(k / decks, 4), "avgCopies": round(copies[n] / k, 2)} for n, k in with_card.items()} if decks else {}
    return decks, cards


def profile(slug, html, samples, recent):
    base = bd.parse_archetype(html, slug)              # nombre, colores, estilo y ventanas
    text = bd.unescape(html)
    raw = bd._object_after(text, '"windows":') or []
    by_set = {}
    for w in raw:
        if isinstance(w, dict) and w.get("id"):
            by_set.setdefault(bd.set_of_window(w["id"]), []).append(w)
    era_decks = {st: sum(w.get("placements") or 0 for w in ws) for st, ws in by_set.items() if ERA_RE.match(st or "")}
    era_decks = {k: v for k, v in era_decks.items() if v}
    if not era_decks:
        raise ValueError("sin ventanas por set en " + slug)
    pool_decks, cards, era, sample_based = 0, {}, None, False
    for st in sorted((x for x in by_set if x in recent), reverse=True):   # el perfil solo mira los dos sets más recientes: un consenso de GD03 no describe el meta de hoy
        pool_decks, cards = merge_consensus(by_set[st])
        if pool_decks and cards:
            era = st
            break
    if not era:   # sin consenso en ningún set: listas de ejemplo de los sets recientes
        rs = [d for d in samples if d.get("set") in recent]
        if len(rs) >= MIN_SAMPLE_PROFILE:
            era = max(d["set"] for d in rs)
            use = [d for d in rs if d["set"] == era] if sum(1 for d in rs if d["set"] == era) >= MIN_SAMPLE_PROFILE else rs
            pool_decks, sample_based = len(use), True
            tot = {}
            for d in use:
                for n, q in d["cards"].items():
                    t = tot.setdefault(n, [0, 0]); t[0] += 1; t[1] += q
            cards = {n: {"adoption": round(t[0] / pool_decks, 4), "avgCopies": round(t[1] / t[0], 2)} for n, t in tot.items()}
    out = {"id": slug, "name": base["name"], "colors": [bd_letter(x) for x in base["colors"]], "style": base["style"],
           "deckCount": pool_decks, "eraDecks": era_decks, "era": era or max(era_decks, key=lambda x: int(ERA_RE.match(x).group(2))),
           "cutoff": min((v["adoption"] for v in cards.values()), default=0), "sourceUrl": "%s/en/archetypes/%s/" % (bd.BASE, slug), "cards": cards}
    if sample_based:
        out["sampleBased"] = True
    return out


def bd_letter(color):
    return {"Blue": "B", "Green": "G", "Red": "R", "Purple": "P", "White": "W"}[color]


def build():
    catalog = {c["number"] for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}
    decklists = json.load(open(os.path.join(ROOT, "data", "decklists.json"), encoding="utf-8"))
    samples = {a["id"]: a["decks"] for a in decklists["archetypes"]}
    slugs = bd.parse_index(open(os.path.join(RAW, "index.html"), encoding="utf-8").read())
    if len(slugs) < 25:
        raise RuntimeError("el índice trae solo %d arquetipos" % len(slugs))
    recent = sorted(decklists["snapshot"].get("sets", {}))[-2:]
    archetypes, unknown = [], set()
    for slug in slugs:
        path = os.path.join(RAW, slug + ".html")
        if not os.path.exists(path):
            raise RuntimeError("falta la página de %s: ejecuta scripts/build_decklists.py primero" % slug)
        html = open(path, encoding="utf-8").read()
        try:
            a = profile(slug, html, samples.get(slug, []), recent)
        except Exception as e:
            raise RuntimeError("falló %s: %s" % (slug, e))
        unknown.update(n for n in a["cards"] if n not in catalog)
        best = sorted(samples.get(slug, []), key=lambda d: (d["place"] or 99, d["event"]["date"] or ""))[:SAMPLES_PER_ARCHETYPE]
        a["sampleDecks"] = [{"placement": d["place"], "sourceUrl": "%s/en/decklists/%s/" % (bd.BASE, d["h"]), "cards": d["cards"]} for d in best]
        archetypes.append(a)
    today = datetime.now(timezone.utc)
    sets = decklists["snapshot"].get("sets", {})
    eras = sorted({e for a in archetypes for e in a["eraDecks"]})
    cur = max(eras, key=lambda x: int(ERA_RE.match(x).group(2)))
    used = sorted({a["era"] for a in archetypes if a["cards"]})   # los perfiles de cartas salen de estos sets: la ventana que se enseña los cubre todos
    windows = {st: {"from": v.get("from"), "to": v.get("dataTo") or v.get("to"), "total": v.get("total")} for st, v in sets.items() if st in eras}
    return {
        "snapshot": {
            "id": today.strftime("%Y-%m-%d"), "retrievedAt": today.strftime("%Y-%m-%dT%H:%M:%SZ"), "dataDate": today.strftime("%Y-%m-%d"),
            "source": {"id": "side6", "name": "Side-6", "url": bd.BASE + "/en/archetypes/", "sourceType": "tournament_database"},
            "formatLabel": FORMAT_LABEL, "windows": windows, "windowFrom": min(windows[e]["from"] for e in used if e in windows), "windowTo": max(windows[e]["to"] for e in used if e in windows),
            "era": cur, "eras": eras,
        },
        "archetypes": archetypes,
        "unknownCards": sorted(unknown),
    }


def main():
    data = build()
    total = sum(a["eraDecks"].get(data["snapshot"]["era"], 0) for a in data["archetypes"])
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    no_prof = [a["name"] for a in data["archetypes"] if not a["cards"]]
    print("%d arquetipos, %d puestos en %s, %d KB; sin perfil de cartas: %d" % (len(data["archetypes"]), total, data["snapshot"]["era"], os.path.getsize(OUT) // 1024, len(no_prof)))
    if data["unknownCards"]:
        print("cartas que no están en el catálogo:", ", ".join(data["unknownCards"]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
