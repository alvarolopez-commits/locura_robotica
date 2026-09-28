import urllib.request
import re
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://www.gundam-gcg.com/en/cards/detail.php?detailSearch={}"
IMG_BASE = "https://www.gundam-gcg.com/en/images/cards/card/{}.webp"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(OUT_DIR, "images")
os.makedirs(IMG_DIR, exist_ok=True)

def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read().decode("utf-8", errors="replace")

def strip_tags(s):
    if s is None:
        return ""
    s = s.replace("<br />", "\n").replace("<br>", "\n").replace("<br/>", "\n")
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&#039;", "'").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return s.strip()

def parse_card(html, number):
    if "cardDetailPageContent" not in html:
        return None
    def find1(pat, default=""):
        m = re.search(pat, html, re.S)
        return strip_tags(m.group(1)) if m else default

    name = find1(r'<h1 class="cardName">(.*?)</h1>')
    rarity = find1(r'<div class="rarity">\s*(.*?)\s*</div>')
    img_m = re.search(r'<img src=\s*"([^"]+)"\s*alt=', html)
    img_rel = img_m.group(1) if img_m else ""

    fields = {}
    for m in re.finditer(r'<dt class="dataTit">(.*?)</dt>\s*<dd class="dataTxt[^"]*">(.*?)</dd>', html, re.S):
        key = strip_tags(m.group(1)).rstrip(".")
        val = strip_tags(m.group(2))
        fields[key] = val

    effect = ""
    eff_m = re.search(r'<div class="cardDataRow overview">.*?<div class="dataTxt isRegular">(.*?)</div>', html, re.S)
    if eff_m:
        effect = strip_tags(eff_m.group(1))

    faq = []
    for m in re.finditer(r'<dt class="qNo">(.*?)</dt>.*?<dd class="q">(.*?)</dd>.*?<dd class="a">(.*?)</dd>', html, re.S):
        faq.append({"q_no": strip_tags(m.group(1)), "question": strip_tags(m.group(2)), "answer": strip_tags(m.group(3))})

    return {
        "number": number,
        "name": name,
        "rarity": rarity,
        "lv": fields.get("Lv", ""),
        "cost": fields.get("COST", ""),
        "color": fields.get("COLOR", ""),
        "type": fields.get("TYPE", ""),
        "effect": effect,
        "zone": fields.get("Zone", ""),
        "trait": fields.get("Trait", ""),
        "link": fields.get("Link", ""),
        "ap": fields.get("AP", ""),
        "hp": fields.get("HP", ""),
        "source_title": fields.get("Source Title", ""),
        "where_to_get": fields.get("Where to get it", ""),
        "image_rel": img_rel,
        "faq": faq,
    }

def scan_set(prefix, max_num, delay=0.05):
    results = []
    misses_in_a_row = 0
    for i in range(1, max_num + 1):
        number = f"{prefix}-{i:03d}"
        url = BASE.format(number)
        try:
            html = fetch(url)
        except Exception as e:
            print(f"  ERROR fetching {number}: {e}", file=sys.stderr)
            continue
        card = parse_card(html, number)
        if card:
            results.append(card)
            misses_in_a_row = 0
            print(f"  found {number}: {card['name']} ({card['color']}, {card['type']})")
        else:
            misses_in_a_row += 1
        time.sleep(delay)
    return results

def download_images(cards, prefix):
    for c in cards:
        number = c["number"]
        out_path = os.path.join(IMG_DIR, f"{number}.webp")
        if os.path.exists(out_path):
            continue
        url = IMG_BASE.format(number)
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=15) as r:
                data = r.read()
            with open(out_path, "wb") as f:
                f.write(data)
        except Exception as e:
            print(f"  IMG ERROR {number}: {e}", file=sys.stderr)
        time.sleep(0.03)

if __name__ == "__main__":
    prefix = sys.argv[1]
    max_num = int(sys.argv[2])
    print(f"Scanning {prefix}-001 .. {prefix}-{max_num:03d}")
    cards = scan_set(prefix, max_num)
    out_json = os.path.join(OUT_DIR, f"{prefix}.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
    print(f"Saved {len(cards)} cards to {out_json}")
    print("Downloading images...")
    download_images(cards, prefix)
    print("Done.")
