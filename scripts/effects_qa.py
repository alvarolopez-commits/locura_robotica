"""QA del sistema de efectos: muestra diversa de cartas (revisadas leyendo su texto) y reporte final.

  python -I scripts/effects_qa.py sample    -> imprime una muestra diversa con texto original, análisis y etiqueta visible
  python -I scripts/effects_qa.py report    -> genera data/meta/qa/effects_qa_report.md y .csv (solo local)

La muestra revisada queda congelada en data/meta/qa/sample.json (las cartas que se leyeron de verdad). Las cartas marcadas como
dudosas por el análisis inicial (data/meta/qa/initial_effects.json) se revisan siempre. La muestra cubre tipos, colores, sets,
activaciones, Once per turn, efectos múltiples, habilidades oficiales y efectos condicionales.
"""
import csv
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import effects as fx  # noqa: E402

QA_DIR = os.path.join(ROOT, "data", "meta", "qa")
CARDS = json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))
BY = {c["number"]: c for c in CARDS}
CFG = fx.load_config()
ACT_ES = {a["id"]: a["es"] for a in CFG["activations"]}
ACTION_ES = {a["id"]: a["es"] for a in CFG["actions"]}
SEED = 2026


def label(e):
    a = ACTION_ES[e["action"]]
    return (ACT_ES[e["act"]] + " · " + a) if e.get("act") else a


def initial():
    return json.load(open(os.path.join(QA_DIR, "initial_effects.json"), encoding="utf-8"))


def flagged_numbers():
    return [n for n, effs in initial().items() if any(e["conf"] < 0.9 for e in effs)]


def select_sample(n=67):
    """Muestra estratificada y determinista (semilla fija) sobre el análisis actual."""
    rnd = random.Random(SEED)
    flagged = set(flagged_numbers())
    pool = [c for c in CARDS if c["number"] not in flagged and c.get("effects")]
    chosen, used = [], set()

    def has_act(c, a): return any(e.get("act") == a for e in c["effects"])
    crit = [
        ("type:UNIT", lambda c: c["type"] == "UNIT", 7), ("type:PILOT", lambda c: c["type"] == "PILOT", 7),
        ("type:COMMAND", lambda c: c["type"] == "COMMAND", 7), ("type:BASE", lambda c: c["type"] == "BASE", 5),
        *[(f"color:{col}", (lambda col: lambda c: c["color"] == col)(col), 4) for col in ("Blue", "Green", "Red", "Purple", "White")],
        *[(f"act:{a}", (lambda a: lambda c: has_act(c, a))(a), 5) for a in ("BURST", "DEPLOY", "ATTACK", "DESTROYED", "WHEN_PAIRED", "WHEN_LINKED", "DURING_LINK", "DURING_PAIR", "ACTIVATE_MAIN", "ACTIVATE_ACTION", "MAIN_ACTION")],
        ("once_per_turn", lambda c: any(e.get("freq") for e in c["effects"]), 6),
        ("multi_efecto", lambda c: len(c["effects"]) >= 3, 8),
        ("habilidad_oficial", lambda c: bool(c.get("keywordEffects")), 7),
        ("condicional", lambda c: any(e.get("cnd") for e in c["effects"]), 7),
    ]
    def count(f): return sum(1 for c in chosen if f(c))
    for _, f, quota in crit:
        cands = [c for c in pool if f(c) and c["number"] not in used]
        rnd.shuffle(cands)
        for c in cands:
            if count(f) >= quota or len(chosen) >= n:
                break
            chosen.append(c); used.add(c["number"])
    sets = sorted({c["set"] for c in pool})
    rest = [c for c in pool if c["number"] not in used]
    rnd.shuffle(rest)
    while len(chosen) < n and rest:
        for st in sets:
            hit = next((c for c in rest if c["set"] == st), None)
            if hit and len(chosen) < n:
                chosen.append(hit); rest.remove(hit); used.add(hit["number"])
    return chosen[:n]


def reviewed_numbers():
    path = os.path.join(QA_DIR, "sample.json")
    sample = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else [c["number"] for c in select_sample()]
    return list(dict.fromkeys(flagged_numbers() + sample))


def show(cards):
    for c in cards:
        print(f"\n## {c['number']} {c['name']} | {c['type']} {c['color']} {c['set']}")
        print("   " + (c.get("effect") or "").replace("\n", " // "))
        for e in c["effects"]:
            extra = " ".join(f"{k}={e[k]}" for k in ("value", "maxLevel", "maxHp", "maxAp", "duration", "freq", "cnd", "cond") if e.get(k) is not None)
            print(f"   -> {label(e)}  [{extra}] conf={e['conf']}")


def _key(effs):
    return [(e.get("act"), e["action"]) for e in effs]


def correction_text(old, new):
    if _key(old) == _key(new):
        return "Sin cambios: el análisis ya era correcto"
    o = [a for _, a in _key(old)]
    n = [a for _, a in _key(new)]
    removed = [ACTION_ES[a] for a in o if a not in n]
    added = [ACTION_ES[a] for a in n if a not in o]
    parts = []
    if removed: parts.append("quitado: " + ", ".join(removed))
    if added: parts.append("añadido: " + ", ".join(added))
    if not parts: parts.append("activación/orden corregidos")
    return "Regla general del analizador (" + "; ".join(parts) + ")"


def build():
    init = initial()
    reviewed = reviewed_numbers()
    with_fx = [c for c in CARDS if c.get("effects")]
    pend = [c["number"] for c in with_fx if any(e["conf"] < 0.9 for e in c["effects"])]
    ok = [c for c in with_fx if all(e["conf"] >= 0.9 for e in c["effects"])]
    overrides = fx.load_overrides()
    rows = []
    for n in reviewed:
        c = BY[n]
        old = init.get(n, [])
        rows.append({
            "card_number": n, "name": c["name"], "original_text": (c.get("effect") or "").replace("\n", " // "),
            "old_classification": " | ".join(c.get("tags", [])) or "-",
            "initial_parse": " | ".join(label(e) for e in old) or "-",
            "new_activation": " | ".join(dict.fromkeys((ACT_ES[e["act"]] if e.get("act") else "sin activación") for e in c["effects"])) or "-",
            "new_effects": " | ".join(label(e) for e in c["effects"]) or "-",
            "initial_confidence": min((e["conf"] for e in old), default=1.0),
            "correction": correction_text(old, c["effects"]),
            "final_confidence": min((e["conf"] for e in c["effects"]), default=1.0),
        })
    errors = [r for r in rows if not r["correction"].startswith("Sin cambios")]
    changed_all = [n for n, effs in init.items() if _key(effs) != _key(BY[n]["effects"])]
    summary = [
        ("Total de cartas", len(CARDS)),
        ("Cartas con efectos", len(with_fx)),
        ("Cartas procesadas correctamente (confianza >= 0,90)", len(ok)),
        ("Cartas revisadas en QA", len(reviewed)),
        ("Errores encontrados durante QA (cartas revisadas con clasificación inicial incorrecta)", len(errors)),
        ("Errores corregidos mediante regla general", len(errors)),
        ("Overrides manuales necesarios", len(overrides)),
        ("Cartas todavía pendientes de revisión humana", len(pend)),
        ("Cartas de toda la base cuya clasificación cambió gracias a las reglas generales", len(changed_all)),
    ]
    return summary, rows, pend


def write_files():
    summary, rows, pend = build()
    os.makedirs(QA_DIR, exist_ok=True)
    with open(os.path.join(QA_DIR, "effects_qa_report.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    lines = ["# QA del sistema de efectos", ""] + [f"- **{k}:** {v}" for k, v in summary] + ["", "## Cartas revisadas", ""]
    lines.append("| Carta | Nombre | Clasificación anterior | Parse inicial | Activación nueva | Efectos nuevos | Conf. inicial | Corrección | Conf. final |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        lines.append("| " + " | ".join(str(r[k]).replace("|", "/") for k in ("card_number", "name", "old_classification", "initial_parse", "new_activation", "new_effects", "initial_confidence", "correction", "final_confidence")) + " |")
    open(os.path.join(QA_DIR, "effects_qa_report.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return summary, rows, pend


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sample"
    if cmd == "sample":
        s = select_sample()
        print(len(s), "cartas |", len({c['set'] for c in s}), "sets |", {t: sum(1 for c in s if c['type'] == t) for t in ('UNIT', 'PILOT', 'COMMAND', 'BASE')})
        show(s)
    elif cmd == "flagged":
        show([BY[n] for n in flagged_numbers()])
    elif cmd == "report":
        summary, rows, pend = write_files()
        for k, v in summary:
            print(f"{k}: {v}")
        print("pendientes:", pend)
