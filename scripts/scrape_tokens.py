"""Descarga las cartas TOKEN (Unit tokens) de la web oficial del Gundam Card Game: ficha de cada una y su imagen.
Mismo método y mismas direcciones que scrape_gcg.py (listado, detail.php y la carpeta de imágenes), con una pausa entre peticiones.

Salida:
  images/T-001.webp …                    (una imagen por token; las variantes de arte alternativo _pN no se descargan)
  data/tokens.js                         window.TOKEN_CARDS = [ { number, name, ... token: true, set: 'TOKEN' } ]
Los tokens NO entran en el catálogo, ni en los filtros ni en los mazos: solo se pueden añadir a Mi colección y no cuentan como carta más.
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
LIST_URL = "https://www.gundam-gcg.com/en/cards/index.php"
DETAIL_URL = "https://www.gundam-gcg.com/en/cards/detail.php?detailSearch={}"
IMG_URL = "https://www.gundam-gcg.com/en/images/cards/card/{}.webp"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, "images")
DELAY = 0.5


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()


def text(s):
    s = re.sub(r"<br\s*/?>", "\n", s or "")
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&amp;", "&").replace("&#039;", "'").replace("&quot;", '"').replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
    return "\n".join(x.strip() for x in s.strip().splitlines()).strip()


def dash(v):
    return "" if v in ("-", "－", "—") else v


# 1) listado de tokens
qs = urllib.parse.urlencode({"search": "true", "type[]": "UNIT TOKEN"})
html = fetch(LIST_URL + "?" + qs).decode("utf-8", "replace")
ids = re.findall(r'data-src="detail\.php\?detailSearch=([^"]+)"', html)
bases = []
for i in ids:
    b = re.sub(r"_p\d+$", "", i)
    if b not in bases:
        bases.append(b)
print(len(ids), "entradas,", len(bases), "tokens distintos:", bases)

cards = []
for n, num in enumerate(sorted(bases)):
    time.sleep(DELAY)
    page = fetch(DETAIL_URL.format(num)).decode("utf-8", "replace")

    def row(title):
        m = re.search(r'<dt class="dataTit">\s*' + re.escape(title) + r'\s*</dt>\s*<dd class="dataTxt[^"]*">(.*?)</dd>', page, re.S)
        return text(m.group(1)) if m else ""

    name = text((re.search(r'<h1 class="cardName">(.*?)</h1>', page, re.S) or [None, ""])[1])
    rarity = text((re.search(r'<div class="rarity">(.*?)</div>', page, re.S) or [None, ""])[1])
    overview = text((re.search(r'<div class="cardDataRow overview">\s*<div class="dataTxt[^"]*">(.*?)</div>', page, re.S) or [None, ""])[1])
    card = {
        "number": num, "name": name, "rarity": rarity or "C", "lv": dash(row("Lv.")), "cost": dash(row("COST")), "color": dash(row("COLOR")),
        "type": "UNIT TOKEN", "effect": dash(overview), "zone": dash(row("Zone")), "trait": dash(row("Trait")), "link": dash(row("Link")),
        "ap": dash(row("AP")), "hp": dash(row("HP")), "source_title": dash(row("Source Title")), "where_to_get": dash(row("Where to get it")),
        "image_rel": "../images/cards/card/%s.webp" % num, "faq": [], "token": True, "set": "TOKEN",
    }
    # imagen: la del propio token; si solo existe en variantes de arte (p. ej. T-029) se usa la primera
    got = False
    for cand in [num] + [i for i in ids if i.startswith(num + "_p")]:
        try:
            time.sleep(DELAY)
            data = fetch(IMG_URL.format(cand))
            if len(data) > 1000:
                with open(os.path.join(IMG_DIR, num + ".webp"), "wb") as f:
                    f.write(data)
                got = True
                break
        except Exception as e:  # noqa: BLE001
            print("  sin imagen", cand, e)
    if not got:
        print("  !! sin imagen para", num)
        continue
    cards.append(card)
    print("%2d/%d %s %s AP%s HP%s %s" % (n + 1, len(bases), num, name, card["ap"], card["hp"], card["trait"]))

out = os.path.join(ROOT, "data", "tokens.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("/* Cartas TOKEN del juego (scripts/scrape_tokens.py). Solo se usan para añadirlas a Mi colección. */\nwindow.TOKEN_CARDS = ")
    json.dump(cards, f, ensure_ascii=False, indent=1)
    f.write(";\n")
print("guardado", out, len(cards), "tokens")
