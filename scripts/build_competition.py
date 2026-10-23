"""Convierte el pack de meta (CSV en data/meta/pack/) en data/meta/competition.js, que la sección Competición carga si existe.

El archivo generado queda en data/meta/ (ignorado por git): sin él, la web muestra "Próximamente".
Los datos del pack son un seed de desarrollo: se regeneran al actualizar el pack.

Uso:  python -I scripts/build_competition.py
"""
import csv
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(ROOT, "data", "meta", "pack")
OUT = os.path.join(ROOT, "data", "meta", "competition.js")
TOURNAMENT_SNAPSHOT = "3"
TRACKED_SNAPSHOT = "4"


def rd(name):
    with open(os.path.join(PACK, name + ".csv"), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def num(v):
    """'' -> None, '12.5' -> 12.5, '154' -> 154."""
    if v is None or str(v).strip() == "":
        return None
    x = float(v)
    return int(x) if x.is_integer() and "." not in str(v) else x


def main():
    cfg = json.load(open(os.path.join(PACK, "intelligence_config.json"), encoding="utf-8"))
    snaps = {r["id"]: r for r in rd("snapshots")}
    fmt = rd("format_context")[0]
    archetypes = {}
    for r in rd("archetypes"):
        colors = [c.strip() for c in r["colors"].split("/") if c.strip()]
        archetypes[r["id"]] = {"id": r["id"], "name": r["name"], "slug": r["slug"], "colors": colors, "family": r["family"] or None}

    data = {
        "asOf": cfg["as_of_date"],
        "formatLabel": cfg["format_context"],
        "format": {
            "currentBooster": fmt["current_booster"], "currentBoosterRelease": fmt["current_booster_release"],
            "recentStarters": fmt["recent_starters"], "upcomingBooster": fmt["upcoming_booster"], "upcomingRelease": fmt["upcoming_release"],
        },
        "thresholds": {"role": cfg["role_thresholds"], "evidence": cfg["evidence"]},
        "sources": [{"id": r["id"], "name": r["name"], "type": r["source_type"], "url": r["url"], "retrievedAt": r["retrieved_at"]} for r in rd("sources")],
        "snapshots": {
            k: {"id": k, "name": v["name"], "type": v["dataset_type"], "asOf": v["as_of_date"], "windowStart": v["window_start"], "windowEnd": v["window_end"],
                "windowLabel": v["window_label"], "records": num(v["total_records"]), "players": num(v["total_players"]), "sourceId": v["source_id"], "methodology": v["methodology"]}
            for k, v in snaps.items()
        },
        "tournamentSnapshot": TOURNAMENT_SNAPSHOT,
        "trackedSnapshot": TRACKED_SNAPSHOT,
        "archetypes": archetypes,
        "tournament": [
            {"archetypeId": r["archetype_id"], "tier": num(r["tier"]), "rank": num(r["rank"]), "share": num(r["meta_share_pct"]), "decks": num(r["deck_count"]),
             "movement": num(r["movement_pp"]), "evidence": r["evidence_status"]}
            for r in rd("tournament_meta") if r["snapshot_id"] == TOURNAMENT_SNAPSHOT
        ],
        "tracked": [
            {"archetypeId": r["archetype_id"], "fieldShare": num(r["field_share_pct"]), "pilotedShare": num(r["piloted_share_pct"]), "games": num(r["piloted_games"]),
             "facedGames": num(r["faced_games"]), "pilots": num(r["pilots"]), "winRate": num(r["win_rate_pct"]), "wrLow": num(r["win_rate_low_pct"]),
             "wrHigh": num(r["win_rate_high_pct"]), "first": num(r["first_win_rate_pct"]), "second": num(r["second_win_rate_pct"]),
             "minutes": num(r["avg_game_minutes"]), "evidence": r["evidence_status"]}
            for r in rd("tracked_archetype_stats") if r["snapshot_id"] == TRACKED_SNAPSHOT
        ],
        "matchups": [
            {"a": r["archetype_a_id"], "b": r["archetype_b_id"], "winRate": num(r["win_rate_a_pct"]), "games": num(r["decided_games"]),
             "suppressed": r["suppressed"] == "1", "evidence": r["evidence_status"]}
            for r in rd("matchups") if r["snapshot_id"] == TRACKED_SNAPSHOT
        ],
        "core": [
            {"archetypeId": r["archetype_id"], "card": r["card_number"], "name": r["card_name"], "adoption": num(r["adoption_pct"]), "status": r["current_status"], "sourceId": r["source_id"]}
            for r in rd("archetype_core_cards")
        ],
        "staples": [
            {"rank": num(r["rank"]), "name": r["card_name"], "topArchetypes": num(r["top_archetypes_count"]), "topTotal": num(r["top_archetypes_total"]),
             "decks": num(r["deck_count"]), "avgCopies": num(r["avg_copies"])}
            for r in rd("staple_ladder") if r["snapshot_id"] == TOURNAMENT_SNAPSHOT
        ],
        "movers": [
            {"label": r["archetype_label"], "share": num(r["current_share_pct"]), "previous": num(r["previous_share_pct"]), "change": num(r["change_pp"]),
             "decks": num(r["current_deck_count"]), "previousDecks": num(r["previous_deck_count"]), "type": r["movement_type"], "notes": r["notes"]}
            for r in rd("meta_movers") if r["snapshot_id"] == TOURNAMENT_SNAPSHOT
        ],
    }
    # integridad: todo lo que se enlaza por id debe existir
    ids = set(archetypes)
    for key in ("tournament", "tracked"):
        bad = [x["archetypeId"] for x in data[key] if x["archetypeId"] not in ids]
        assert not bad, (key, bad)
    bad = [m for m in data["matchups"] if m["a"] not in ids or m["b"] not in ids]
    assert not bad, bad
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="") as f:
        f.write("/* Generado por scripts/build_competition.py a partir de data/meta/pack. Solo local (data/meta/ está en .gitignore). */\n")
        f.write("var COMPETITION_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n")
    print("ok:", {k: (len(v) if isinstance(v, (list, dict)) else v) for k, v in data.items() if k in ("archetypes", "tournament", "tracked", "matchups", "core", "staples", "movers")})


if __name__ == "__main__":
    sys.exit(main())
