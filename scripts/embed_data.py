"""Incrusta en dashboard.html los datos que la página necesita sin hacer fetch (así funciona también abierta como archivo):

  - CARDS_DATA     <- data/all_cards.json
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

    html = embed(html, "CARDS_DATA", cards, "\n];")
    html = embed(html, "RULESETS", rulesets, "\n];", after_var="CARDS_DATA")
    html = embed(html, "ABILITY_CONFIG", abilities, "\n};", after_var="RULESETS")

    open(HTML, "w", encoding="utf-8", newline="").write(html)
    check = open(HTML, encoding="utf-8").read()
    assert extract(check, "CARDS_DATA", "\n];") == cards
    assert extract(check, "RULESETS", "\n];") == rulesets
    assert extract(check, "ABILITY_CONFIG", "\n};") == abilities
    print("cartas:", len(cards), "| rulesets:", [x["id"] for x in rulesets], "| grupos de habilidad:", list(abilities))


if __name__ == "__main__":
    sys.exit(main())
