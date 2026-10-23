"""Analizador de habilidades oficiales y activaciones a partir del texto de efecto de una carta.

Separa dos preguntas distintas (no se mezclan nunca con las categorías funcionales de `tags`):
  - keywordEffects   -> ¿qué habilidad oficial (keyword) tiene la carta?     <Blocker>, <Repair 2>, <Support 2>...
  - activationTiming / activationType / frequency -> ¿cuándo se activa su efecto?   【Deploy】, 【Activate･Main】, 【Once per Turn】...

Una keyword cuenta cuando la carta la TIENE (impresa) o la CONCEDE ("gains <High-Maneuver>", "gets AP+1 and <Repair 1>").
No cuenta cuando solo se nombra como condición o referencia ("Choose 1 enemy Unit with <Blocker>", "while this Unit has <Repair>",
listas "<Repair>/<Breach>/...") ni cuando aparece dentro de la definición de una ficha ("[Fatum-00](...･<Blocker>)").
"""
import json
import os
import re

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "abilities.json")


def load_config(path=CONFIG_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def norm(name):
    """'High-Maneuver' / 'HIGH MANEUVER' / 'high_maneuver' -> 'HIGH_MANEUVER'."""
    return re.sub(r"[^A-Z0-9]+", "_", str(name).upper()).strip("_")


_LINE_START = re.compile(r"(^|\n)\s*(【[^】]*】\s*)*$")
_REFERENCE_WORD = re.compile(r"\b(with|has|have|having|without|activates?|all)\s*(other\s+)?$", re.I)
_GRANT_WORD = re.compile(r"\b(gains?|gets?)\b", re.I)
_ANGLE = re.compile(r"<([A-Za-z][A-Za-z \-]*?)(?:\s+\d+)?>")
_TRIGGER = re.compile(r"【([^】]*)】")
_SEPARATORS = re.compile(r"[･・·]")


def _keyword_counts(text, known):
    """Devuelve el conjunto de keywords (ids) que la carta tiene o concede."""
    found = set()
    for m in _ANGLE.finditer(text):
        kid = norm(m.group(1))
        if kid not in known:
            continue
        pre, post = text[:m.start()], text[m.end():]
        if _LINE_START.search(pre):
            found.add(kid)                       # impresa (al inicio de línea, con o sin trigger delante)
        elif pre.endswith("･"):
            continue                              # definición de una ficha: la carta no la tiene
        elif pre.endswith("/") or post.startswith("/<"):
            continue                              # lista de keywords usada como referencia
        elif _REFERENCE_WORD.search(pre):
            continue                              # condición: "with <Blocker>", "has <Repair>", "activates <Blocker>"
        elif _GRANT_WORD.search(re.split(r"[.\n]", pre)[-1]):
            found.add(kid)                        # concedida: "gains <X>", "gets AP+1 and <X>"
    return found


def parse_abilities(effect, config):
    """Metadatos de habilidad/activación de una carta (listas de ids, en el orden de la configuración)."""
    text = effect or ""
    known_kw = {x["id"] for x in config["keywordEffects"]}
    timings, types, freqs = set(), set(), set()
    for m in _TRIGGER.finditer(text):
        parts = [p.strip() for p in _SEPARATORS.split(m.group(1))]
        name = norm(parts[0])
        if name == "ACTIVATE" and len(parts) > 1:
            types.add("ACTIVATE_" + norm(parts[1]))
        else:
            timings.add(name)
            freqs.add(name)

    def ordered(group, found):
        return [x["id"] for x in config[group] if x["id"] in found]

    return {
        "keywordEffects": ordered("keywordEffects", _keyword_counts(text, known_kw)),
        "activationTiming": ordered("activationTiming", timings),
        "activationType": ordered("activationType", types),
        "frequency": ordered("frequency", freqs),
    }
