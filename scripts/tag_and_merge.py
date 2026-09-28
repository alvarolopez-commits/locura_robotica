import json
import re
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(DIR), "data")
SETS = ["ST01", "ST02", "ST03", "ST04", "GD01", "GD05"]
OWNED_SETS = {"ST01", "ST02", "ST03", "ST04"}

# key -> regex patterns. Display labels (EN/ES) live in the dashboard's i18n dict, not here.
RULES = [
    ("breach", [r"<Breach", r"Breach \d"]),
    ("removal", [r"[Rr]est (this|it|1|the chosen)? ?enem", r"[Dd]estroy(ed)? .*enemy", r"deal \d+ damage to .*enemy", r"AP-\d"]),
    ("aoe", [r"all enem", r"each enem"]),
    ("search", [r"[Ll]ook at the top \d+ cards? of your deck.*add it to your hand", r"reveal .*add it to your hand"]),
    ("scry", [r"[Ll]ook at the top card of your deck", r"return (it|the remaining cards)"]),
    ("draw", [r"draw \d+", r"draw a card"]),
    ("ramp", [r"EX Resource", r"set \d+ [Rr]esource"]),
    ("teambuff", [r"all your Units", r"[Aa]ll .*Units get AP", r"Link Units? AP"]),
    ("blocker", [r"<Blocker>"]),
    ("token", [r"[Tt]oken", r"[Cc]reate 1"]),
    ("heal", [r"<Repair", r"recovers? \d+ HP"]),
    ("taunt", [r"choose this .*as their attack target", r"as (its|their) attack target if possible"]),
    ("damagered", [r"reduce (it|the damage|enemy damage)", r"immune to"]),
    ("bounce", [r"[Rr]eturn (it|1 enemy Unit|the chosen Unit) to.*hand"]),
    ("trick", [r"AP\+\d.*this (turn|battle)", r"gains? <[A-Za-z -]+> during this turn"]),
    ("shieldhand", [r"[Ss]hield.*to your hand", r"add 1 of your [Ss]hields"]),
    ("burst", [r"【Burst】"]),
]

def tag_card(card):
    text = card.get("effect", "") or ""
    tags = []
    for key, patterns in RULES:
        for p in patterns:
            if re.search(p, text, re.I):
                tags.append(key)
                break
    if not tags:
        if text.strip() in ("", "-", "—"):
            tags = ["vanilla"]
        else:
            tags = ["other"]
    return tags

all_cards = []
for s in SETS:
    path = os.path.join(DATA_DIR, f"{s}.json")
    with open(path, encoding="utf-8") as f:
        cards = json.load(f)
    for c in cards:
        c["set"] = s
        c["owned"] = s in OWNED_SETS
        c["tags"] = tag_card(c)
        c["image_url"] = f"https://www.gundam-gcg.com/en/images/cards/card/{c['number']}.webp"
        all_cards.append(c)

out_path = os.path.join(DATA_DIR, "all_cards.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(all_cards, f, ensure_ascii=False, indent=1)

print(f"Total cards: {len(all_cards)}")
from collections import Counter
tag_counts = Counter(t for c in all_cards for t in c["tags"])
for tag, cnt in tag_counts.most_common():
    print(f"  {tag}: {cnt}")
