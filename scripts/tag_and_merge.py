import json
import re
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(DIR), "data")
SETS = ["ST01", "ST02", "ST03", "ST04", "ST05", "ST06", "ST07", "ST08", "ST09", "ST10", "ST11", "ST12", "ST13", "ST14",
        "GD01", "GD02", "GD03", "GD04", "GD05", "EB01"]
OWNED_SETS = {"ST01", "ST02", "ST03", "ST04"}

# key -> regex patterns. Display labels (EN/ES) live in the dashboard's i18n dict, not here.
# Matching is case-insensitive. "(?:[^.]|\.\d|(?<=Lv)\.){0,100}\." (dots allowed only as in "Lv.2" or "Lv. is") keeps a target and its consequence inside the same sentence pair
# ("Choose 1 enemy Unit ... . Deal 1 damage to it."), so effects that hit your own Units don't count as removal.
RULES = [
    ("breach", [r"<Breach", r"Breach \d", r"damage to the first card in your opponent's shield"]),
    ("removal", [r"enemy units?(?:[^.]|\.\d|(?<=Lv)\.){0,100}\.\s*deal \d+ damage", r"deal \d+ damage to [^.]*enemy",
                 r"enemy units?(?:[^.]|\.\d|(?<=Lv)\.){0,100}\.\s*destroy (it|them)", r"destroy(ed)? [^.]*enemy", r"destroy all units",
                 r"enemy players?[^.]*units?\.\s*destroy (it|them)", r"AP-\d",
                 r"enemy units?(?:[^.]|\.\d|(?<=Lv)\.){0,100}\.\s*deal an amount of damage",
                 r"enemy base[^.]*\.\s*deal \d+ damage", r"damage to all bases"]),
    ("rest", [r"enemy units?(?:[^.]|\.\d|(?<=Lv)\.){0,100}\.\s*rest (it|them)", r"rest (this|it|1|the chosen)? ?enem", r"won' ?t be set as active"]),
    ("aoe", [r"all enem", r"each enem", r"to all units", r"destroy all units", r"choose 1 to \d+ enemy units"]),
    ("search", [r"look at the top \d+ cards? of your deck.*add it to your hand", r"reveal .*add it to your hand",
                r"top \d+ cards of your deck into your trash[^.]*\.\s*add", r"add it to their hand"]),
    ("scry", [r"look at the top card of your deck", r"return (it|the remaining cards)"]),
    ("draw", [r"draw \d+", r"draw a (card|number of cards)"]),
    ("ramp", [r"EX Resource", r"set \d+ resource", r"place \d+ (rested )?resource", r"deploy 1 EX Base"]),
    ("teambuff", [r"all your Units", r"all .*Units get AP", r"Link Units? AP", r"all (other )?(?:[^.]|\.\d)*units(?:[^.]|\.\d)*get ap\+"]),
    ("support", [r"<Support \d"]),
    ("selfbuff", [r"this unit gets ap\+", r"increase this unit's ap", r"while this unit [^.]*, it gets ap\+"]),
    ("combatkw", [r"<High-Maneuver>", r"<First Strike>", r"<Suppression>"]),
    ("assault", [r"may choose an? (damaged )?(active|rested) enemy unit"]),
    ("blocker", [r"<Blocker>"]),
    ("token", [r"token", r"create 1"]),
    ("cheat", [r"deploy 1 [^.]*from your hand", r"pair 1 [^.]*from your hand"]),
    ("heal", [r"<Repair", r"recovers? \d+ HP"]),
    ("taunt", [r"choose this .*as their attack target", r"as (its|their) attack target if possible",
               r"change a battling enemy unit's attack target"]),
    ("damagered", [r"reduce (it|the damage|enemy damage)", r"immune to", r"can't receive (enemy )?(battle |effect )?damage",
                    r"can't choose it as their attack target"]),
    ("bounce", [r"return (it|1 enemy Unit|the chosen Unit) to.*hand", r"return the enemy unit to its owner's hand"]),
    ("recursion", [r"from your trash[^.]*\.\s*(add|pair|deploy)", r"(add|pair|deploy)[^.]*from your trash",
                   r"return this unit's paired pilot to its owner's hand", r"from your trash\.\s*pay its cost to deploy",
                   r"return (the card|a [a-z]+ pilot) paired with this unit to (your|its owner's) hand"]),
    ("ready", [r"set (this unit|it|them) as active"]),
    ("discard", [r"(they|that enemy player|opponent)[^.]{0,40}discard",
                  r"that player chooses \d+ [^.]*from their trash\.\s*exile"]),
    ("costred", [r"cost -\d", r"as if it has \d+ lv\. and cost", r"reduce the cost of this card"]),
    ("trick", [r"AP\+\d.*this (turn|battle)", r"gains? <[A-Za-z -]+> during this turn"]),
    ("shieldhand", [r"shield.*to your hand", r"add 1 of your shields"]),
    ("drawback", [r"this unit can't choose the enemy player", r"can only attack", r"deal \d+ damage to this unit"]),
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

# Spanish effect text keyed by the exact English effect (keywords like 【Deploy】/<Blocker> stay as printed).
with open(os.path.join(DATA_DIR, "effects_es.json"), encoding="utf-8") as f:
    EFFECTS_ES = json.load(f)

all_cards = []
for s in SETS:
    path = os.path.join(DATA_DIR, f"{s}.json")
    with open(path, encoding="utf-8") as f:
        cards = json.load(f)
    for c in cards:
        c["set"] = s
        c["owned"] = s in OWNED_SETS
        c["tags"] = tag_card(c)
        effect = c.get("effect") or ""
        if effect.strip() not in ("", "-"):
            if effect not in EFFECTS_ES:
                sys.exit(f"Missing Spanish effect for {c['number']}")
            c["effect_es"] = EFFECTS_ES[effect]
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
