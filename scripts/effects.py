"""Analizador de efectos: texto de la carta -> efectos estructurados (activación + acción literal).

Sigue "Sistema maestro de habilidades, activaciones y efectos":
  - Activación = cuándo ocurre (Burst, Deploy, When paired...). Nunca es el efecto.
  - Acción = qué hace literalmente (Reducción de AP, Robar cartas...). Nunca un rol estratégico.
  - Once per turn es una frecuencia (modificador), no un trigger principal.
  - Las etiquetas antiguas (`tags`) NO son fuente de verdad: todo sale del texto de la carta.
Determinista (reglas sobre el texto inglés oficial). Cada efecto lleva `conf`; < 0.90 queda para revisión.
Los overrides manuales de data/effect_overrides.json prevalecen sobre el análisis.
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "data", "effects_config.json")
OVERRIDES_PATH = os.path.join(ROOT, "data", "effect_overrides.json")


def load_config(path=CONFIG_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_overrides(path=OVERRIDES_PATH):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("overrides", []) if isinstance(data, dict) else data


def _norm(name):
    return re.sub(r"[^A-Z0-9]+", "_", str(name).upper()).strip("_")


_HEADER = re.compile(r"^\s*((?:【[^】]*】[\s/]*)+)(.*)$", re.S)
_TAG = re.compile(r"【([^】]*)】")
_SEP = re.compile(r"[･・·]")

_TIMINGS = {"BURST", "DEPLOY", "ATTACK", "DESTROYED", "WHEN_PAIRED", "DURING_PAIR", "WHEN_LINKED", "DURING_LINK",
            "ACTIVATE_MAIN", "ACTIVATE_ACTION", "MAIN", "ACTION"}
_EVENTS = {"BURST", "DEPLOY", "ATTACK", "DESTROYED", "WHEN_PAIRED", "WHEN_LINKED", "ACTIVATE_MAIN", "ACTIVATE_ACTION", "MAIN", "ACTION"}
_STATES = {"DURING_PAIR", "DURING_LINK"}


def _parse_header(group):
    """Devuelve (timings, frecuencia, cualificador, alternativas) de un grupo de 【..】 de cabecera."""
    timings, freq, qual = [], None, None
    for raw in _TAG.findall(group):
        parts = [p.strip() for p in _SEP.split(raw)]
        name = _norm(parts[0])
        if name == "ACTIVATE" and len(parts) > 1:
            timings.append("ACTIVATE_" + _norm(parts[1]))
        elif name == "ONCE_PER_TURN":
            freq = "ONCE_PER_TURN"
        elif name == "PILOT":
            continue
        elif name in _TIMINGS:
            timings.append(name)
            if len(parts) > 1:
                qual = " ".join(parts[1:])
        else:
            timings.append("OTHER_TRIGGER")
    return timings, freq, qual


def split_blocks(text):
    """Divide el efecto en bloques {acts, freq, qual, body}. Una etiqueta 【..】 solo es cabecera si abre una línea."""
    blocks, cur = [], None
    for line in (text or "").replace("\r", "").split("\n"):
        m = _HEADER.match(line)
        if m:
            timings, freq, qual = _parse_header(m.group(1))
            cur = {"timings": timings, "freq": freq, "qual": qual, "body": m.group(2).strip()}
            blocks.append(cur)
        elif line.strip():
            text_line = line.strip()
            continuation = cur is not None and (text_line.startswith(("■", "(", "（", "<")) or re.match(r"(if you do|then,|otherwise)\b", text_line, re.I))
            if not continuation:
                cur = {"timings": [], "freq": None, "qual": None, "body": ""}
                blocks.append(cur)
            cur["body"] = (cur["body"] + " " + text_line).strip()
    return blocks


def _activations(timings):
    """Alternativas de activación de un bloque. Un estado (During pair/link) junto a un evento pasa a ser condición."""
    if not timings:
        return [None], None
    uniq = list(dict.fromkeys(timings))
    events = [t for t in uniq if t in _EVENTS or t == "OTHER_TRIGGER"]
    states = [t for t in uniq if t in _STATES]
    if "MAIN" in events and "ACTION" in events:
        events = [e for e in events if e not in ("MAIN", "ACTION")] + ["MAIN_ACTION"]
    if events and states:
        return events, states[0]
    return (events or states), None


# ---- reglas de acción: (regex sobre frase en minúsculas, acción) ----
def _R(p, a):
    return (re.compile(p), a)


_RULES = [
    _R(r"(add|return).*?\bfrom your trash\b.*?\bto your hand", "RECOVER_FROM_TRASH"),
    _R(r"\badd\b.*?\bto your hand", "ADD_TO_HAND"),
    _R(r"\bdeploy\b.*?\bfrom your hand", "DEPLOY_FROM_HAND"),
    _R(r"\bdeploy\b.*?\bfrom your trash", "DEPLOY_FROM_TRASH"),
    _R(r"\bdeploy\b.*?\bfrom your deck", "DEPLOY_FROM_DECK"),
    _R(r"\bdeploy\b.*?(without paying|for free)", "DEPLOY_FREE"),
    _R(r"\bdeploy (this card|it|them)\b", "DEPLOY_CARD"),
    _R(r"\bdeploy (1|a|an|\d)", "DEPLOY_UNIT"),
    _R(r"\bpair (this card|it|1)\b|\bpair\b.*?\bwith\b", "PAIR_PILOT"),
    _R(r"\bdeals? (\d+ |that much )?damage\b", "DAMAGE"),
    _R(r"\bdestroy\b(?!ed)", "DESTROY"),
    _R(r"\brest (it|them|1|this|all|\d|up to|one)\b|\bset (it|them).*? as rested", "REST"),
    _R(r"\bset (\d+ of )?(it|them|this [a-z]+|your resources?|\d+ resources?).*? as active", "ACTIVATE"),
    _R(r"\breturn\b.*?(its|their) owners?'?s?'? hands?", "RETURN_TO_HAND"),
    _R(r"\breturn this pilot.*?hand", "RETURN_PILOT"),
    _R(r"\bap([+-])(\d+)", "AP"),
    _R(r"\bhp([+-])(\d+)", "HP"),
    _R(r"\brecovers? (\d+|\w+) hp", "RECOVER_HP"),
    _R(r"\bdraw (\d+|a card|one)\b", "DRAW"),
    _R(r"\blook at the top\b", "LOOK_AT_CARDS"),
    _R(r"\breveal\b", "REVEAL"),
    _R(r"\bsearch your deck\b", "SEARCH"),
    _R(r"\bshuffle\b", "SHUFFLE_DECK"),
    _R(r"\bto the top or bottom of your deck|on top of your deck|top of your deck", "TOP_DECK_MANIPULATION"),
    _R(r"\bto the bottom of (your|its owner'?s?|their owners?'?s?'?) deck", "SEND_TO_BOTTOM"),
    _R(r"\bdiscards? (\d+|a card|that card|their hand|it)", "DISCARD"),
    _R(r"\bplace (the top )?\d+ cards? of your deck into your trash|\bplace.*?into your trash", "SEND_TO_TRASH"),
    _R(r"\bexile\b", "EXILE"),
    _R(r"\bplace (\d+ )?(rested )?ex resources?", "GENERATE_EX_RESOURCE"),
    _R(r"\bplace (\d+ )?(rested )?resources?", "GENERATE_RESOURCE"),
    _R(r"\b(place|deploy)\b.*?\btoken", "GENERATE_TOKEN"),
    _R(r"\bcost (is )?reduced|\breduce.*?\bcost|\bcost -\d", "REDUCE_COST"),
    _R(r"\bcost \+\d|\bincrease.*?\bcost", "INCREASE_COST"),
    _R(r"can'?t attack|cannot attack", "CANNOT_ATTACK"),
    _R(r"can'?t block|cannot block|can'?t be blocked by", "CANNOT_BLOCK"),
    _R(r"can'?t be chosen|cannot be chosen", "CANNOT_BE_CHOSEN"),
    _R(r"won'?t be destroyed|can'?t be destroyed|cannot be destroyed", "CANNOT_BE_DESTROYED"),
    _R(r"won'?t be set as active|can'?t be set as active", "CANNOT_REACTIVATE"),
    _R(r"\bchoose an? (active|rested) enemy unit.*?as its attack target|may choose an? (?:damaged )?(active|rested) enemy unit", "ATTACK_TARGET"),
    _R(r"change the attack target|change its attack target", "CHANGE_ATTACK_TARGET"),
    _R(r"\b(start|begin) a battle\b", "START_BATTLE"),
    _R(r"\bgains?\b[^<]*<", "GAIN_KEYWORD"),                  # incluye "gains<X>" sin espacio y "gains the same number of<X>"
    _R(r"\bgains? traittoken", "GAIN_TRAIT"),
    _R(r"\bloses? <", "LOSE_KEYWORD"),
    _R(r"\btakes? (\d+|\w+) less damage|\bdamage.*?\breduced\b", "REDUCE_DAMAGE"),
    _R(r"\bprevent\b.*?damage|\bdoes? not take damage|\bwon'?t take damage", "PREVENT_DAMAGE"),
    _R(r"\bactivate\b.*?\bref\b", "TRIGGER_OTHER_EFFECT"),
    _R(r"can'?t receive [a-z0-9 ]*damage|doesn'?t receive that damage|does not receive that damage", "PREVENT_DAMAGE"),
    _R(r"\bincrease the damage\b", "INCREASE_DAMAGE"),
    _R(r"(is|are) dealt to (that|this) (unit|base).*?instead|dealt to that (unit|base) instead", "REDIRECT_DAMAGE"),
    _R(r"\bap can'?t be reduced", "AP_PROTECTION"),
    _R(r"\b(are|is) deployed rested\b", "DEPLOY_RESTED"),
    _R(r"\bplay (it|this card) as if it has\b", "MODIFY_COST_LEVEL"),
    _R(r"\bgains? the following effect", "GAIN_EFFECT"),
    _R(r"\bgets? .*?\band <", "GAIN_KEYWORD"),
    _R(r"\bto the top\b(?! of the specified)", "TOP_DECK_MANIPULATION"),
    _R(r"\bcan only attack\b", "ATTACK_RESTRICTION"),
    _R(r"can'?t activate <", "DISABLE_KEYWORD"),
    _R(r"\bmay attack on the turn it is deployed", "ATTACK_ON_DEPLOY"),
    _R(r"\bincrease\b.*?\bap\b", "AP_INCREASE_BY"),
    _R(r"\breduce\b.*?\bdamage|\bdamage\b.*?\breduce\b", "REDUCE_DAMAGE"),
    _R(r"\breduce (its|their|the) ap\b", "AP_REDUCE"),
    _R(r"\breturn the card paired with this unit", "RETURN_PILOT"),
    _R(r"\b(must )?choose (this|that|one of your).*? (rested )?unit.*?as (its|their) attack target", "CHANGE_ATTACK_TARGET"),
    _R(r"can'?t choose .*?as (its|their) attack target", "CANNOT_CHOOSE_TARGET"),
    _R(r"can'?t choose (it|this unit|them) as (its|their) attack target", "CANNOT_BE_CHOSEN"),
    _R(r"\bchange a battling enemy unit'?s attack target", "CHANGE_ATTACK_TARGET"),
    _R(r"\bwon' ?t be set as active", "CANNOT_REACTIVATE"),
    _R(r"name is also treated as", "MODIFY_LINK"),
    _R(r"\bignore.*?\bcost|\bwithout paying\b", "IGNORE_COST"),
]
# cadenas que no son efecto: condiciones, avisos y continuaciones que no cambian el estado de la partida
_NOT_AN_EFFECT = re.compile(r"^(choose|if you do|then|you may|if |when |while |during this turn,? it may|for each|this card's name|activate the following)", re.I)
_SKIP_SENTENCE = re.compile(r"^(return the remaining cards|the (specified|remaining)|it is |they are )", re.I)

_SUBSUMES = {"ADD_TO_HAND": {"RECOVER_FROM_TRASH"},
             "DEPLOY_UNIT": {"DEPLOY_FROM_HAND", "DEPLOY_FROM_TRASH", "DEPLOY_FROM_DECK", "DEPLOY_FREE", "GENERATE_TOKEN"},
             "DEPLOY_CARD": {"DEPLOY_FROM_HAND", "DEPLOY_FROM_TRASH", "DEPLOY_FROM_DECK", "DEPLOY_FREE", "GENERATE_TOKEN"},
             "CHANGE_ATTACK_TARGET": {"CANNOT_BE_CHOSEN"}, "CANNOT_CHOOSE_TARGET": {"CANNOT_BE_CHOSEN"}}
_NUM = re.compile(r"(\d+)")


def _target_of(prev_choose):
    s = prev_choose
    if not s:
        return None
    if "enemy player" in s:
        return "ENEMY_PLAYER"
    if "base" in s:
        return "BASE"
    if "enemy" in s:
        return "ENEMY_UNIT"
    if "friendly" in s or "your" in s:
        return "FRIENDLY_UNIT"
    return None


def _resolve(tag, sentence, target, block_actions):
    """Concreta las reglas genéricas (DAMAGE, DESTROY, AP, HP, ATTACK_TARGET) y devuelve (acción, valor)."""
    s = sentence
    if tag == "DAMAGE":
        v = re.search(r"deals? (\d+) damage", s)
        if "shield" in s or target == "SHIELD":
            a = "DAMAGE_SHIELD"
        elif "base" in s or target == "BASE":
            a = "DAMAGE_BASE"
        elif re.search(r"\b(all|each)\b", s):
            a = "AOE_DAMAGE"
        else:
            a = "DAMAGE_UNIT"
        return a, int(v.group(1)) if v else None
    if tag == "DESTROY":
        return ("DESTROY_BASE" if ("base" in s or target == "BASE") else "DESTROY_UNIT"), None
    if tag in ("AP", "HP"):
        m = re.search(tag.lower() + r"([+-])(\d+)", s)
        up = m.group(1) == "+"
        return f"{tag}_{'INCREASE' if up else 'REDUCTION'}", int(m.group(2))
    if tag == "ATTACK_TARGET":
        return ("ATTACK_RESTED_UNIT" if "rested" in s else "ATTACK_ACTIVE_UNIT"), None
    if tag == "AP_REDUCE":
        return "AP_REDUCTION", None
    if tag == "CANNOT_CHOOSE_TARGET":
        return "CANNOT_ATTACK_PLAYER", None
    if tag == "DISCARD" and (target == "ENEMY_PLAYER" or "opponent" in s or "enemy player" in s):
        return "OPPONENT_DISCARD", None
    if tag == "SEND_TO_BOTTOM" and "LOOK_AT_CARDS" in block_actions:
        return None, None            # "devuelve el resto al fondo" forma parte de mirar cartas
    if tag == "AP_INCREASE_BY":
        return "AP_INCREASE", None
    if tag == "DRAW":
        v = re.search(r"\bdraw (\d+)", s)
        return tag, int(v.group(1)) if v else None
    if tag == "RECOVER_HP":
        v = re.search(r"recovers? (\d+) hp", s)
        return tag, int(v.group(1)) if v else None
    return tag, None


def _duration(s):
    if "during this battle" in s:
        return "DURING_BATTLE"
    if "during this turn" in s or "this turn" in s:
        return "THIS_TURN"
    if "while this unit is linked" in s or "while linked" in s:
        return "WHILE_LINKED"
    if "while this unit is paired" in s or "while paired" in s:
        return "WHILE_PAIRED"
    return None


def _clean_body(body):
    b = body
    b = re.sub(r"【[^】]*】", " REF ", b)        # referencias a otros timings dentro del texto
    b = re.sub(r"\b(gains?) \(", r"\1 TRAITTOKEN (", b)  # "All your Units gain (Neo Zeon)" = ganar trait
    while re.search(r"\([^()]*\)", b):          # recordatorios entre paréntesis (también anidados)
        b = re.sub(r"\([^()]*\)", " ", b)
    b = b.replace(")", " ")
    b = re.sub(r"[①②③④⑤⑥⑦⑧⑨⑩]", " ", b)
    while "：" in b:
        before, after = b.split("：", 1)
        if "." in before.replace("Lv.", "Lv") or "following" in before.lower():
            b = before + " " + after            # "...gains the following effect：■..." no es un coste
            continue
        b = after                               # lo anterior a "：" es el coste, no el efecto
    return re.sub(r"\s+", " ", b).strip()


def _sentences(body):
    alt = r"\s+/\s+(?=(?:Choose|Deal|Draw|Rest|Add|Return|Deploy|Destroy|Place|Look|Exile|Discard|Set|It|This|You)\b)"
    for s in re.split(r"(?<=[.])\s+|" + alt, body.replace("Lv.", "Lv§")):
        s = s.strip(" .").replace("Lv§", "Lv.")
        if s:
            yield s


def parse_effects(text):
    """Lista de efectos de una carta: [{act, freq, action, target?, value?, maxLevel?, duration?, cond?, conf, text}]."""
    out = []
    for blk in split_blocks(text):
        acts, cond = _activations(blk["timings"])
        body = _clean_body(blk["body"])
        if not body or body == "-" or re.fullmatch(r"(\[[^\]]*\]\s*)+", body):
            continue           # vacío, "-" o solo el nombre del Pilot (modo Pilot de un Command)
        # líneas que solo declaran una habilidad oficial (<Blocker>, <Repair 2>...) no son efectos
        if re.fullmatch(r"(<[^>]+>\s*)+", body):
            continue
        actions, target, max_level, max_hp, max_ap, from_trash, conds = [], None, None, None, None, False, []
        for sent in _sentences(body):
            low = sent.lower()
            if low.startswith("choose"):
                target = _target_of(low) or target
                m = re.search(r"lv\.?\s*(\d+) or lower", low)
                max_level = int(m.group(1)) if m else max_level
                m = re.search(r"(\d+) or less hp", low)
                max_hp = int(m.group(1)) if m else max_hp
                m = re.search(r"(\d+) or less ap", low)
                max_ap = int(m.group(1)) if m else max_ap
            led = re.match(r"(?:during [^,]+, )?(when|whenever|if|while|after|at the (?:start|end) of)\b[^,]*,\s*(.+)$", low)
            if led or re.search(r"\b(while|if)\b", low):
                kind = "WHILE" if re.search(r"\bwhile\b", low) else "IF" if re.search(r"\bif\b", low) else None
                if kind and kind not in conds:
                    conds.append(kind)             # WHEN/After no es una condición: describe cuándo ocurre, no si ocurre
            main = led.group(2) if led else low         # lo que va tras "When/If/While ..., " es lo que hace la carta
            if _SKIP_SENTENCE.match(low):
                continue
            hits = []
            for rx, tag in _RULES:
                for m in rx.finditer(main):
                    hits.append((m.start(), tag))
            if re.search(r"\breduce (it|them|that damage) by\b", main) and "damage" in low:
                hits.append((0, "REDUCE_DAMAGE"))        # "When this Unit receives damage, reduce it by N": el daño está en la cláusula de condición
            hits.sort()
            seen = set()
            if "from your trash" in low or "in your trash" in low:
                from_trash = True
            tags_here = {t for _, t in hits}
            drop = set()
            for general, specifics in _SUBSUMES.items():
                if general in tags_here and tags_here & specifics:
                    drop.add(general)
            for pos, tag in hits:
                if tag in drop:
                    continue
                if (pos, tag) in seen:
                    continue
                seen.add((pos, tag))
                # "Destroy it" / "Deal damage" y similares: ya resueltos por sus reglas específicas
                action, val = _resolve(tag, main, target, [a["action"] for a in actions])
                if action is None:
                    continue
                if from_trash and action == "ADD_TO_HAND":
                    action = "RECOVER_FROM_TRASH"
                elif from_trash and action in ("DEPLOY_UNIT", "DEPLOY_CARD"):
                    action = "DEPLOY_FROM_TRASH"
                if any(a["action"] == action for a in actions):
                    continue
                e = {"action": action, "value": val, "duration": _duration(low), "conf": 0.95, "cnd": list(conds)}
                if action in ("DAMAGE_UNIT", "AOE_DAMAGE", "DESTROY_UNIT", "REST", "ACTIVATE", "RETURN_TO_HAND", "AP_REDUCTION", "AP_INCREASE", "HP_REDUCTION", "HP_INCREASE", "RECOVER_HP"):
                    e["target"] = target
                    e["maxLevel"] = max_level
                    e["maxHp"] = max_hp
                    e["maxAp"] = max_ap
                actions.append(e)
        if not actions:
            if _NOT_AN_EFFECT.match(body) and False:
                continue
            actions = [{"action": "OTHER", "value": None, "duration": None, "conf": 0.5}]
        for act in acts:
            for e in actions:
                eff = {"act": act, "freq": blk["freq"], "action": e["action"], "conf": e["conf"], "text": body[:160]}
                for k in ("value", "duration", "target", "maxLevel", "maxHp", "maxAp"):
                    if e.get(k) is not None:
                        eff[k] = e[k]
                if e.get("cnd"):
                    eff["cnd"] = e["cnd"]
                if cond:
                    eff["cond"] = cond
                out.append(eff)
    return out


def apply_overrides(card_number, effects, overrides):
    """Los overrides (card, index, activation, action) prevalecen sobre el análisis automático."""
    for o in overrides:
        if o.get("card") != card_number:
            continue
        i = o.get("index", 0)
        if 0 <= i < len(effects):
            if o.get("activation") is not None:
                effects[i]["act"] = o["activation"]
            if o.get("action"):
                effects[i]["action"] = o["action"]
            effects[i]["conf"] = 1.0
            effects[i]["override"] = True
    return effects


def needs_review(effects):
    return any(e["conf"] < 0.9 for e in effects)
