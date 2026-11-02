"""Prepara los datos que la página necesita sin hacer fetch (así funciona también abierta como archivo):

  - CARDS_DATA     <- data/all_cards.json   → data/cards.js (archivo aparte; el HTML lo carga con <script src>)
  - RULESETS       <- data/rulesets.json   (clave "rulesets")
  - ABILITY_CONFIG <- data/abilities.json  (configuración central de los filtros HABILIDAD / ACTIVACIÓN)

Uso:  python scripts/embed_data.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = os.path.join(ROOT, "dashboard.html")


def block_end(html, start, closer="\n];"):
    """Índice justo después de `];` (array) o `};` (objeto) que cierra el bloque que empieza en `start`."""
    return html.index(closer, start) + len(closer)


def embed(html, var, value, closer, after_var=None):
    """Sustituye (o crea, justo antes de la IIFE principal) el bloque `var NAME = ...;`."""
    head = "var %s = " % var
    text = head + json.dumps(value, ensure_ascii=False, indent=1) + ";"
    if head in html:
        s = html.index(head)
        return html[:s] + text + html[block_end(html, s, closer):]
    k = html.index("(function(){", html.index("var %s = " % after_var))
    return html[:k] + text + "\n" + html[k:]


def extract(html, var, closer):
    head = "var %s = " % var
    s = html.index(head) + len(head)
    return json.loads(html[s:block_end(html, s, closer) - 1])


def main():
    html = open(HTML, encoding="utf-8").read()
    cards = json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))
    rulesets = json.load(open(os.path.join(ROOT, "data", "rulesets.json"), encoding="utf-8"))["rulesets"]
    abilities = json.load(open(os.path.join(ROOT, "data", "abilities.json"), encoding="utf-8"))
    abilities = {k: v for k, v in abilities.items() if not k.startswith("_")}

    # el catálogo va en un archivo aparte (data/cards.js, minificado): el HTML pesa ~1,4 MB menos y los datos se cachean por separado
    with open(os.path.join(ROOT, "data", "cards.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("/* Catálogo de cartas (generado por scripts/embed_data.py desde data/all_cards.json). */\nvar CARDS_DATA = ")
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    html = embed(html, "RULESETS", rulesets, "\n];", after_var="RULESETS")
    html = embed(html, "ABILITY_CONFIG", abilities, "\n};", after_var="RULESETS")
    effect_cfg = json.load(open(os.path.join(ROOT, "data", "effects_config.json"), encoding="utf-8"))
    effect_cfg = {k: v for k, v in effect_cfg.items() if not k.startswith("_")}
    html = embed(html, "EFFECT_CONFIG", effect_cfg, "\n};", after_var="ABILITY_CONFIG")

    open(HTML, "w", encoding="utf-8", newline="").write(html)
    check = open(HTML, encoding="utf-8").read()
    js = open(os.path.join(ROOT, "data", "cards.js"), encoding="utf-8").read()
    assert json.loads(js[js.index("= ") + 2:js.rindex(";")]) == cards
    assert "var CARDS_DATA = " not in check, "el catálogo ya no va incrustado en el HTML"
    assert extract(check, "RULESETS", "\n];") == rulesets
    assert extract(check, "ABILITY_CONFIG", "\n};") == abilities
    assert extract(check, "EFFECT_CONFIG", "\n};") == effect_cfg
    print("cartas:", len(cards), "| rulesets:", [x["id"] for x in rulesets], "| grupos de habilidad:", list(abilities))


if __name__ == "__main__":
    sys.exit(main())
