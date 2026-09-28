import urllib.request
import urllib.parse
import re
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

LIST_URL = "https://www.gundam-gcg.com/en/cards/index.php"
DETAIL_URL = "https://www.gundam-gcg.com/en/cards/detail.php?detailSearch={}"
IMG_URL = "https://www.gundam-gcg.com/en/images/cards/card/{}.webp"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# Package ids used by the official card search form.
PACKAGES = {
    "GD01": "616101", "GD02": "616102", "GD03": "616103", "GD04": "616104", "GD05": "616105",
    "ST01": "616001", "ST02": "616002", "ST03": "616003", "ST04": "616004", "ST05": "616005",
    "ST06": "616006", "ST07": "616007", "ST08": "616008", "ST09": "616009", "ST10": "616010",
    "ST11": "616011", "ST12": "616012", "ST13": "616013", "ST14": "616014", "EB01": "616201",
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
IMG_DIR = os.path.join(ROOT, "images")
os.makedirs(IMG_DIR, exist_ok=True)


def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


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
        fields[strip_tags(m.group(1)).rstrip(".")] = strip_tags(m.group(2))

    effect = ""
    eff_m = re.search(r'<div class="cardDataRow overview">.*?<div class="dataTxt isRegular">(.*?)</div>', html, re.S)
    if eff_m:
        effect = strip_tags(eff_m.group(1))

    faq = []
    for m in re.finditer(r'<dt class="qNo">(.*?)</dt>.*?<dd class="q">(.*?)</dd>.*?<dd class="a">(.*?)</dd>', html, re.S):
        faq.append({"q_no": strip_tags(m.group(1)), "question": strip_tags(m.group(2)), "answer": strip_tags(m.group(3))})

    return {
        "number": number, "name": name, "rarity": rarity,
        "lv": fields.get("Lv", ""), "cost": fields.get("COST", ""), "color": fields.get("COLOR", ""),
        "type": fields.get("TYPE", ""), "effect": effect, "zone": fields.get("Zone", ""),
        "trait": fields.get("Trait", ""), "link": fields.get("Link", ""),
        "ap": fields.get("AP", ""), "hp": fields.get("HP", ""),
        "source_title": fields.get("Source Title", ""), "where_to_get": fields.get("Where to get it", ""),
        "image_rel": img_rel, "faq": faq,
    }


def list_numbers(set_code):
    """Main-deck card numbers of a set (SET-NNN); skips parallels (_p1), tokens (T-) and resources (R-, EX*)."""
    data = urllib.parse.urlencode({"package": PACKAGES[set_code], "freeword": ""}).encode()
    html = fetch(LIST_URL, data).decode("utf-8", errors="replace")
    ids = dict.fromkeys(re.findall(r"detailSearch=([A-Za-z0-9_\-]+)", html))
    return [i for i in ids if re.fullmatch(rf"{set_code}-\d{{3}}", i)]


def scrape_set(set_code, delay=0.15):
    cards = []
    for number in list_numbers(set_code):
        try:
            card = parse_card(fetch(DETAIL_URL.format(number)).decode("utf-8", errors="replace"), number)
        except Exception as e:
            print(f"  ERROR {number}: {e}", file=sys.stderr)
            continue
        if card:
            cards.append(card)
        time.sleep(delay)
    return cards


def download_images(cards, delay=0.1):
    for c in cards:
        out_path = os.path.join(IMG_DIR, f"{c['number']}.webp")
        if os.path.exists(out_path):
            continue
        try:
            data = fetch(IMG_URL.format(c["number"]))
            with open(out_path, "wb") as f:
                f.write(data)
        except Exception as e:
            print(f"  IMG ERROR {c['number']}: {e}", file=sys.stderr)
        time.sleep(delay)


if __name__ == "__main__":
    for set_code in sys.argv[1:]:
        cards = scrape_set(set_code)
        with open(os.path.join(DATA_DIR, f"{set_code}.json"), "w", encoding="utf-8") as f:
            json.dump(cards, f, ensure_ascii=False, indent=2)
        download_images(cards)
        print(f"{set_code}: {len(cards)} cards")
