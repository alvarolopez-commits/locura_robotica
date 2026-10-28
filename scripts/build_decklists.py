"""Listas competitivas de los últimos eventos -> data/decklists.json

  python -I scripts/build_decklists.py            descarga las páginas de arquetipo de Side-6 (≈2,5 s entre peticiones) y genera el JSON
  python -I scripts/build_decklists.py --offline  reutiliza las páginas ya guardadas en data/meta/raw/arch/ (solo local)

Cada página de arquetipo de Side-6 lleva incrustadas sus mejores listas (puestos altos de los eventos recientes) con las 50
cartas. Se guardan por arquetipo con su puesto, evento y fecha, y el enlace a la lista original. NO se guardan nombres de jugadores.
Todo o nada: si falla un arquetipo no se escribe nada. Las páginas descargadas quedan en data/meta/raw/arch/ (ignorada por git).
Cortesía con la fuente: User-Agent propio, pausa entre peticiones, caché de 12 horas y sin paralelismo."""
import json
import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "meta", "raw", "arch")
OUT = os.path.join(ROOT, "data", "decklists.json")
BASE = "https://side-6.com"
UA = "LocuraRobotica/1.0 (personal, non-commercial)"
PAUSE = 2.5
CACHE_HOURS = 12
COLORS = {"BLUE": "Blue", "GREEN": "Green", "RED": "Red", "PURPLE": "Purple", "WHITE": "White"}
SLUG_RE = re.compile(r"^[a-z]{2}-(aggro|control|midrange)$")
# solo las listas de los eventos del formato actual (la ventana de datos de Side-6 empieza el 3 de agosto de 2026)
FROM_DATE = "2026-08-03"


def unescape(html):
    """El HTML de Side-6 lleva los datos dentro de cadenas JSON de Next.js: se deshace el escapado de comillas."""
    return html.replace('\\"', '"').replace("\\\\", "\\")


def parse_index(html):
    slugs = sorted({m for m in re.findall(r"/en/archetypes/([a-z]{2}-[a-z]+)", html) if SLUG_RE.match(m)})
    return slugs


def _get(o, *keys):
    for k in keys:
        if not isinstance(o, dict):
            return None
        o = o.get(k)
    return o


def find_decklists(html):
    """Primer array "decklists" cuyos elementos traen mainboard."""
    text = unescape(html)
    dec = json.JSONDecoder()
    for m in re.finditer(r'"decklists":', text):
        try:
            arr, _ = dec.raw_decode(text[m.end():])
        except ValueError:
            continue
        if isinstance(arr, list) and arr and isinstance(arr[0], dict) and "mainboard" in arr[0]:
            return arr, text
    return None, text


def event_title(ev):
    t = _get(ev, "title", "text", "en") or _get(ev, "title", "source")
    return t if isinstance(t, str) and t.strip() else None


def parse_archetype(html, slug):
    """-> dict con id, name, colors, style y decks; decks = [{h, place, event:{id,title,date}, cards:{num:qty}}]. ValueError si no hay listas."""
    arr, text = find_decklists(html)
    if not arr:
        raise ValueError("sin listas en la página de " + slug)
    m = re.search(r'"heading":"([^"]+)","decklists"', text)
    name = m.group(1) if m else slug
    colors, style, decks = [], None, []
    titles = {}
    for d in arr:
        for p in d.get("placements") or []:
            ev = _get(p, "tournament", "event")
            if isinstance(ev, dict) and ev.get("id") and event_title(ev):
                titles[str(ev["id"])] = event_title(ev)
    for d in arr:
        if not isinstance(d, dict) or not d.get("hash"):
            continue
        cc = d.get("colorCombination") or ""
        if cc and not colors:
            colors = [COLORS[x] for x in cc.split("_") if x in COLORS]
        style = style or _get(d, "archetype", "strategy")
        cards = {}
        for c in d["mainboard"]:
            if isinstance(c, dict) and c.get("cardNumber") and isinstance(c.get("number"), int) and c["number"] > 0:
                cards[c["cardNumber"]] = cards.get(c["cardNumber"], 0) + c["number"]
        best = None
        for p in d.get("placements") or []:
            if isinstance(p, dict) and isinstance(p.get("placement"), int) and (best is None or p["placement"] < best["placement"]):
                best = p
        ev = _get(best, "tournament", "event") if best else None
        eid = str(ev["id"]) if isinstance(ev, dict) and ev.get("id") else None
        date = (ev.get("startDate") or "")[:10] if isinstance(ev, dict) else ""
        decks.append({
            "h": d["hash"], "place": best["placement"] if best else None,
            "event": {"id": eid, "title": titles.get(eid) or (event_title(ev) if ev else None), "date": date or None},
            "cards": dict(sorted(cards.items())),
        })
    return {"id": slug, "name": name, "colors": colors, "style": (style or "").capitalize() or None, "decks": decks}


def parse_deck_event(html):
    """Página de una lista concreta: mejor puesto con su evento -> (puesto, id, título, fecha); None si no se encuentra."""
    text = unescape(html)
    dec = json.JSONDecoder()
    for m in re.finditer(r'"placements":', text):
        try:
            arr, _ = dec.raw_decode(text[m.end():])
        except ValueError:
            continue
        best = None
        for p in arr if isinstance(arr, list) else []:
            if isinstance(p, dict) and isinstance(p.get("placement"), int) and (best is None or p["placement"] < best["placement"]):
                best = p
        ev = _get(best, "tournament", "event") if best else None
        if isinstance(ev, dict) and ev.get("id"):
            return best["placement"], str(ev["id"]), event_title(ev), (ev.get("startDate") or "")[:10] or None
    return None


def fetch(url, cache_name, offline):
    path = os.path.join(RAW, cache_name)
    if os.path.exists(path) and (offline or time.time() - os.path.getmtime(path) < CACHE_HOURS * 3600):
        return open(path, encoding="utf-8").read()
    if offline:
        raise RuntimeError("falta en la caché: " + cache_name)
    time.sleep(PAUSE)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60) as r:
        html = r.read().decode("utf-8", "replace")
    os.makedirs(RAW, exist_ok=True)
    open(path, "w", encoding="utf-8").write(html)
    return html


def build(offline=False, log=print):
    catalog = {c["number"] for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}
    slugs = parse_index(fetch(BASE + "/en/archetypes/", "index.html", offline))
    if len(slugs) < 25:
        raise RuntimeError("el índice trae solo %d arquetipos (se esperaban unos 30)" % len(slugs))
    archetypes, seen, unknown = [], {}, set()
    for i, slug in enumerate(slugs, 1):
        try:
            a = parse_archetype(fetch("%s/en/archetypes/%s/" % (BASE, slug), slug + ".html", offline), slug)
        except Exception as e:
            raise RuntimeError("falló %s: %s" % (slug, e))
        kept = []
        for d in a["decks"]:
            if sum(d["cards"].values()) != 50:
                log("  aviso: %s lista %s suma %d cartas, se omite" % (slug, d["h"][:8], sum(d["cards"].values())))
                continue
            if d["h"] in seen:                                   # la misma lista en dos arquetipos: se queda en el primero
                continue
            seen[d["h"]] = slug
            unknown.update(n for n in d["cards"] if n not in catalog)
            kept.append(d)
        kept.sort(key=lambda d: ((d["event"]["date"] or ""), -(d["place"] or 99)), reverse=True)
        a["decks"] = kept
        archetypes.append(a)
        log("%2d/%d %-16s %2d listas" % (i, len(slugs), slug, len(kept)))
    # listas cuyo evento no venía en la página del arquetipo: se piden una a una a su propia página
    missing = [d for a in archetypes for d in a["decks"] if not d["event"]["date"]]
    for i, d in enumerate(missing, 1):
        try:
            r = parse_deck_event(fetch("%s/en/decklists/%s/" % (BASE, d["h"]), "deck-" + d["h"][:16] + ".html", offline))
        except Exception as e:
            log("  aviso: no se pudo leer la lista %s (%s)" % (d["h"][:8], e)); continue
        if r:
            d["place"] = d["place"] or r[0]
            d["event"] = {"id": r[1], "title": r[2], "date": r[3]}
        if i % 20 == 0:
            log("  eventos resueltos %d/%d" % (i, len(missing)))
    for a in archetypes:
        a["decks"] = [d for d in a["decks"] if d["event"]["date"] and d["event"]["date"] >= FROM_DATE]
        a["decks"].sort(key=lambda d: (d["event"]["date"], -(d["place"] or 99)), reverse=True)
    titles = {}
    for a in archetypes:
        for d in a["decks"]:
            if d["event"]["id"] and d["event"]["title"]:
                titles[d["event"]["id"]] = d["event"]["title"]
    for a in archetypes:
        for d in a["decks"]:
            if d["event"]["id"] and not d["event"]["title"]:
                d["event"]["title"] = titles.get(d["event"]["id"])
    dates = sorted(d["event"]["date"] for a in archetypes for d in a["decks"] if d["event"]["date"])
    return {
        "snapshot": {
            "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": {"id": "side6", "name": "Side-6", "url": BASE + "/en/archetypes/"},
            "from": dates[0] if dates else None, "to": dates[-1] if dates else None,
            "note": "Mejores puestos de los eventos recientes por arquetipo. Sin nombres de jugadores.",
        },
        "archetypes": [a for a in archetypes if a["decks"]],
        "unknownCards": sorted(unknown),
    }


def main():
    offline = "--offline" in sys.argv
    data = build(offline)
    total = sum(len(a["decks"]) for a in data["archetypes"])
    if total < 100:
        raise RuntimeError("solo %d listas: algo ha cambiado en la fuente, no se escribe nada" % total)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print("%d arquetipos, %d listas (%s → %s), %d KB" % (len(data["archetypes"]), total, data["snapshot"]["from"], data["snapshot"]["to"], os.path.getsize(OUT) // 1024))
    if data["unknownCards"]:
        print("cartas que no están en el catálogo:", ", ".join(data["unknownCards"]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
