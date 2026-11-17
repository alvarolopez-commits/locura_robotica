"""Listas competitivas de los últimos eventos -> data/decklists.json

  python -I scripts/build_decklists.py            descarga las páginas de arquetipo de Side-6 (≈2,5 s entre peticiones) y genera el JSON
  python -I scripts/build_decklists.py --offline  reutiliza las páginas ya guardadas en data/meta/raw/arch/ (solo local)

Cada página de arquetipo de Side-6 lleva incrustadas listas de ejemplo (de los puestos altos) con las 50 cartas y, por ventana de set
(GD05, GD05:ST11-14, GD06…), cuántos puestos y listas tuvo el arquetipo frente al total de la ventana (formato web de nov 2026: `decks`, `windows`). Se guardan por arquetipo con su puesto, evento y fecha, y el enlace a la lista original. NO se guardan nombres de jugadores.
Todo o nada: si falla un arquetipo no se escribe nada. Las páginas descargadas quedan en data/meta/raw/arch/ (ignorada por git).
Cortesía con la fuente: User-Agent propio, pausa entre peticiones, caché de 12 horas y sin paralelismo."""
import json
import os
import re
import sys
import time
import html as htmllib
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "meta", "raw", "arch")
OUT = os.path.join(ROOT, "data", "decklists.json")
HIST = os.path.join(ROOT, "data", "decklists_hist.json")   # listas de importaciones anteriores que ya no vienen en la fuente (se acumulan, nunca se borran)
BASE = "https://side-6.com"
UA = "LocuraRobotica/1.0 (personal, non-commercial)"
PAUSE = 2.5
CACHE_HOURS = 12
COLORS = {"BLUE": "Blue", "GREEN": "Green", "RED": "Red", "PURPLE": "Purple", "WHITE": "White"}
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")   # taxonomía nueva: p. ej. «mikazuki-barbatos» (la antigua era «bg-aggro»)
# Series de tiendas de Bandai Japón (comprobado en las páginas de evento: todas en Japón). El resto de eventos se mira uno a uno.
SERIES_JP_RE = re.compile(r"^(Gundam Card Game Serial Card Challenge|Newtype Challenge 2026 MISSION)")
COUNTRIES = {"Japan": "JP", "Philippines": "PH", "Indonesia": "ID", "United States": "US", "Germany": "DE", "France": "FR", "Spain": "ES", "Italy": "IT",
             "United Kingdom": "GB", "Netherlands": "NL", "Belgium": "BE", "Portugal": "PT", "Poland": "PL", "Sweden": "SE", "Austria": "AT", "Switzerland": "CH",
             "Singapore": "SG", "Thailand": "TH", "Malaysia": "MY", "Taiwan": "TW", "Hong Kong": "HK", "Korea": "KR", "Canada": "CA", "Mexico": "MX",
             "Brazil": "BR", "Australia": "AU", "Chile": "CL", "Argentina": "AR", "India": "IN", "Vietnam": "VN"}
HELD_RE = re.compile(r"\s*\((?:Held in|held in)[^)]*\)\s*$")


def clean_title(t):
    """'Gundam Card Game Serial Card Challenge (Held in October)' -> sin el '(Held in …)', que se repite en casi todos los eventos."""
    return HELD_RE.sub("", t).strip() if isinstance(t, str) else t


def parse_event_country(html):
    """Bloque 'Location' de la página de un evento: la dirección acaba en el país. -> código ISO o None."""
    m = re.search(r"Location</div>(.{0,700}?)(?:</div></div>|Timeline)", html, re.S)
    if not m:
        return None
    txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", m.group(1)))
    for name in sorted(COUNTRIES, key=len, reverse=True):
        if re.search(r"\b" + re.escape(name) + r"\b", txt):
            return COUNTRIES[name]
    return None

# solo las listas de los eventos del formato actual (la ventana GD05 de Side-6 empieza el 31 de julio de 2026)
FROM_DATE = "2026-07-31"


def unescape(html):
    """El HTML de Side-6 lleva los datos dentro de cadenas JSON de Next.js: se deshace el escapado de comillas."""
    return html.replace('\\"', '"').replace("\\\\", "\\")


def parse_index(html):
    slugs = sorted({m for m in re.findall(r"/en/archetypes/([a-z0-9-]+)/", html) if SLUG_RE.match(m)})
    return slugs


def _get(o, *keys):
    for k in keys:
        if not isinstance(o, dict):
            return None
        o = o.get(k)
    return o


def _object_after(text, key):
    """Objeto o lista JSON que sigue a `key` (p. ej. '"decks":'); None si no está o no se puede leer."""
    i = text.find(key)
    if i < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(text[i + len(key):])[0]
    except ValueError:
        return None


def event_title(ev):
    t = _get(ev, "title", "text", "en") or _get(ev, "title", "source")
    return t if isinstance(t, str) and t.strip() else None


def set_of_window(wid):
    """'GD05:ST11-14' -> 'GD05'; 'GD04:EB01_ST10' -> 'GD04'. Las ventanas intermedias (productos sueltos) cuentan para el set de la ventana principal."""
    return (wid or "").split(":")[0] or None


def parse_archetype(html, slug):
    """-> dict con id, name, colors, style, windows y decks; decks = [{h, place, set, event:{id,title,date}, cards:{num:qty}}]. ValueError si no hay listas.
    Para cada lista se toma su puesto más reciente DENTRO de la ventana de datos (desde FROM_DATE); si no tiene ninguno, queda sin fecha y se descarta después."""
    text = unescape(html)
    decks = _object_after(text, '"decks":')
    if not isinstance(decks, dict) or not decks:
        raise ValueError("sin listas en la página de " + slug)
    h1 = re.search(r"<h1[^>]*>([^<]+)</h1>", html)
    name = htmllib.unescape(h1.group(1)).strip() if h1 else slug
    st = re.search(r'"strategy":"([A-Z]+)"', text)
    style = st.group(1).capitalize() if st else None
    # el formato serializa un evento repetido como referencia ("$b:props:…"): se resuelve con los demás puestos del mismo torneo y con los resultados de las variantes
    tmap = {}
    for d in decks.values():
        for p in (d.get("placements") or []) if isinstance(d, dict) else []:
            t = p.get("tournament") if isinstance(p, dict) else None
            if isinstance(t, dict) and isinstance(t.get("event"), dict) and t["event"].get("id"):
                tmap[str(t["event"]["id"])] = {"event": t["event"], "windowID": t.get("windowID") or t["event"].get("windowID")}
    for m in re.finditer(r'"date":"([^"]+)","rank":\d+,"cutSize":\d+,"eventId":"(\d+)","eventWindowId":"([^"]+)","eventTitle":"([^"]*)"', text):
        tmap.setdefault(m.group(2), {"event": {"id": m.group(2), "startDate": m.group(1), "title": {"text": {"en": m.group(4)}}}, "windowID": m.group(3)})
    combos, out = {}, []
    for d in decks.values():
        if not isinstance(d, dict) or not d.get("hash") or not isinstance(d.get("mainboard"), list):
            continue
        cc = d.get("colorCombination") or ""
        if cc:
            combos[cc] = combos.get(cc, 0) + 1
        cards = {}
        for c in d["mainboard"]:
            if isinstance(c, dict) and c.get("cardNumber") and isinstance(c.get("number"), int) and c["number"] > 0:
                cards[c["cardNumber"]] = cards.get(c["cardNumber"], 0) + c["number"]
        best = None
        for p in d.get("placements") or []:
            t = p.get("tournament") if isinstance(p, dict) else None
            if isinstance(t, str) and isinstance(p, dict):   # referencia: el id del torneo es el prefijo del id del puesto ("8489229-11")
                t = tmap.get(str(p.get("id", "")).split("-")[0])
            ev = t.get("event") if isinstance(t, dict) else None
            if not isinstance(ev, dict) or not ev.get("id") or not isinstance(p.get("placement"), int):
                continue
            date = (ev.get("startDate") or "")[:10]
            key = (date >= FROM_DATE, date, -p["placement"])       # dentro de la ventana, el más reciente; a igualdad, el mejor puesto
            if best is None or key > best[0]:
                best = (key, p, ev, date, t.get("windowID") or ev.get("windowID"))
        p, ev, date, wid = (best[1], best[2], best[3], best[4]) if best else (None, None, "", None)
        out.append({"h": d["hash"], "place": p["placement"] if p else None, "set": set_of_window(wid),
                    "event": {"id": str(ev["id"]) if ev else None, "title": event_title(ev) if ev else None, "date": date or None},
                    "cards": dict(sorted(cards.items()))})
    colors = []
    if combos:
        top = sorted(combos.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
        colors = [COLORS[x] for x in top.split("_") if x in COLORS]
    windows = []
    for w in _object_after(text, '"windows":') or []:
        if isinstance(w, dict) and w.get("id"):
            windows.append({"id": w["id"], "from": (w.get("startDate") or "")[:10], "to": (w.get("endDate") or "")[:10],
                            "total": w.get("windowPlacements"), "placements": w.get("placements"), "lists": w.get("lists")})
    return {"id": slug, "name": name, "colors": colors, "style": style, "windows": windows, "decks": out}


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
    path = os.path.normpath(os.path.join(RAW, cache_name))
    if os.path.exists(path) and (offline or time.time() - os.path.getmtime(path) < CACHE_HOURS * 3600):
        return open(path, encoding="utf-8").read()
    if offline:
        raise RuntimeError("falta en la caché: " + cache_name)
    time.sleep(PAUSE)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60) as r:
        html = r.read().decode("utf-8", "replace")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(html)
    return html


def prior_countries():
    """id de evento -> país del data/decklists.json anterior (un evento no cambia de país)."""
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {d["event"]["id"]: d["event"].get("country") for a in old.get("archetypes", []) for d in a.get("decks", []) if d.get("event", {}).get("country")}


def set_totals(archetypes):
    """Por set: total de puestos de todas las ventanas del set (mismo total en todos los arquetipos), y primera/última fecha de las listas."""
    wins, sets = {}, {}
    for a in archetypes:
        for w in a.get("windows", []):
            wins[w["id"]] = w
    for wid, w in wins.items():
        st = set_of_window(wid)
        x = sets.setdefault(st, {"from": w["from"], "to": w["to"], "total": 0, "windows": []})
        x["from"] = min(x["from"], w["from"]) if w["from"] else x["from"]
        x["total"] += w["total"] or 0
        x["windows"].append(wid)
    for a in archetypes:
        for d in a["decks"]:
            x = sets.get(d.get("set"))
            if x:
                x["dataTo"] = max(x.get("dataTo", ""), d["event"]["date"] or "")
    for x in sets.values():
        x["windows"].sort()
    return dict(sorted(sets.items()))


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
    countries = prior_countries()   # los países ya conocidos no se vuelven a pedir
    for a in archetypes:
        for d in a["decks"]:
            e = d["event"]; eid = e["id"]
            if eid not in countries:
                if e["title"] and SERIES_JP_RE.match(e["title"]):
                    countries[eid] = "JP"
                else:
                    try:
                        countries[eid] = parse_event_country(fetch("%s/en/events/%s" % (BASE, eid), "../ev/%s.html" % eid, offline))
                    except Exception as ex:
                        log("  aviso: sin país para el evento %s (%s)" % (eid, ex)); countries[eid] = None
            e["country"] = countries[eid]
            e["title"] = clean_title(e["title"])
    dates = sorted(d["event"]["date"] for a in archetypes for d in a["decks"] if d["event"]["date"])
    return {
        "snapshot": {
            "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": {"id": "side6", "name": "Side-6", "url": BASE + "/en/archetypes/"},
            "from": dates[0] if dates else None, "to": dates[-1] if dates else None,
            "sets": set_totals(archetypes),
            "note": "Listas de ejemplo de los puestos altos por arquetipo, con su set. Sin nombres de jugadores.",
        },
        "archetypes": [{k: v for k, v in a.items() if k != "windows"} for a in archetypes if a["decks"]],
        "unknownCards": sorted(unknown),
    }


def check_against_previous(new, old, accept_reduction=False, accept_taxonomy=False):
    """Protección contra importaciones anómalas: no se sobrescribe un archivo válido si la cobertura cae a menos de la mitad o si casi todos los
    identificadores de arquetipo cambian, salvo que se pida expresamente (--accept-reduction, --accept-new-taxonomy)."""
    if not old or not old.get("archetypes"):
        return
    n_new = sum(len(a["decks"]) for a in new["archetypes"]); n_old = sum(len(a["decks"]) for a in old["archetypes"])
    if n_new < 0.5 * n_old and not accept_reduction:
        raise RuntimeError("la cobertura cae de %d a %d listas (menos de la mitad): revisa la fuente o usa --accept-reduction" % (n_old, n_new))
    ids_new = {a["id"] for a in new["archetypes"]}; ids_old = {a["id"] for a in old["archetypes"]}
    if ids_old and len(ids_old & ids_new) < 0.5 * len(ids_old) and not accept_taxonomy:
        raise RuntimeError("cambian más de la mitad de los identificadores de arquetipo (%d de %d siguen): taxonomía nueva, usa --accept-new-taxonomy" % (len(ids_old & ids_new), len(ids_old)))


def update_history(old, new, hist):
    """Añade al histórico las listas del archivo anterior que la fuente ya no trae (mismo hash = misma lista, no se duplica ni se pisa). Conserva
    su arquetipo con el nombre que tenía entonces, su set y la fecha de importación de origen. Devuelve el histórico (nuevo o el mismo)."""
    hist = hist or {"snapshot": {"note": "Listas de importaciones anteriores de Side-6 con la clasificación de arquetipos de su momento. No se usan en Meta."}, "archetypes": []}
    have = {d["h"] for a in new["archetypes"] for d in a["decks"]} | {d["h"] for a in hist["archetypes"] for d in a["decks"]}
    when = ((old or {}).get("snapshot") or {}).get("retrievedAt", "")[:10]
    by_id = {a["id"]: a for a in hist["archetypes"]}
    for a in (old or {}).get("archetypes", []):
        keep = [dict(d, set=d.get("set") or "GD05", importedFrom=when) for d in a["decks"] if d["h"] not in have]
        if not keep:
            continue
        h = by_id.get(a["id"])
        if not h:
            h = {"id": a["id"], "name": a["name"], "colors": a.get("colors", []), "style": a.get("style"), "decks": []}
            hist["archetypes"].append(h); by_id[a["id"]] = h
        h["decks"].extend(keep)
        for d in keep:
            have.add(d["h"])
    for a in hist["archetypes"]:
        a["decks"].sort(key=lambda d: (d["event"]["date"] or "", -(d["place"] or 99)), reverse=True)
    return hist


def write_json_atomic(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    return tmp


def main():
    offline = "--offline" in sys.argv
    data = build(offline)
    total = sum(len(a["decks"]) for a in data["archetypes"])
    if total < 100:
        raise RuntimeError("solo %d listas: algo ha cambiado en la fuente, no se escribe nada" % total)
    old = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else None
    check_against_previous(data, old, "--accept-reduction" in sys.argv, "--accept-new-taxonomy" in sys.argv)
    hist = json.load(open(HIST, encoding="utf-8")) if os.path.exists(HIST) else None
    hist = update_history(old, data, hist) if old else hist
    tmps = [(write_json_atomic(OUT, data), OUT)] + ([(write_json_atomic(HIST, hist), HIST)] if hist else [])   # primero se escribe todo a temporales; solo si todo va bien se sustituye
    for tmp, dest in tmps:
        os.replace(tmp, dest)
    print("%d arquetipos, %d listas (%s → %s), %d KB" % (len(data["archetypes"]), total, data["snapshot"]["from"], data["snapshot"]["to"], os.path.getsize(OUT) // 1024))
    if hist:
        print("histórico: %d listas en %d arquetipos" % (sum(len(a["decks"]) for a in hist["archetypes"]), len(hist["archetypes"])))
    if data["unknownCards"]:
        print("cartas que no están en el catálogo:", ", ".join(data["unknownCards"]))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
