"""Pruebas de los perfiles de arquetipo para COMPARAR.  Ejecutar:  python -I tests/test_meta_build.py"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_meta as bm  # noqa: E402

META = os.path.join(ROOT, "data", "meta.json")
CATALOG = {c["number"] for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}


def win(wid, placements, cons=None, lists=None):
    w = {"id": wid, "startDate": "2026-10-02T00:00:00.000Z", "endDate": "2026-11-06T00:00:00.000Z", "windowPlacements": 1000, "placements": placements, "lists": lists or placements}
    if cons:
        w["consensus"] = {"deckCount": cons[0], "cards": [{"cardNumber": n, "inclusion": sum(cc) / cons[0], "copyCounts": cc} for n, cc in cons[1].items()]}
    return w


def page(windows, heading="Arquetipo de prueba"):
    """Formato web de Side-6 (nov 2026): <h1> y JSON dentro de una cadena con las comillas escapadas; sin listas de ejemplo (no hacen falta aquí)."""
    body = {"decks": {"a" * 64: {"hash": "a" * 64, "colorCombination": "BLUE_RED", "mainboard": [{"cardNumber": "ST01-001", "number": 50}], "placements": []}}, "windows": windows}
    payload = json.dumps(body, separators=(",", ":"))
    return "<html><h1>" + heading + "</h1><script>self.__next_f.push([1,\"" + payload.replace("\\", "\\\\").replace('"', '\\"') + "\"])</script></html>"


SAMPLES = lambda st, n: [{"set": st, "place": 1, "event": {"date": "2026-11-10"}, "cards": {"ST01-001": 4, "ST01-002": 46}, "h": str(i)} for i in range(n)]


class Parser(unittest.TestCase):
    def test_consenso_de_varias_ventanas_del_mismo_set(self):
        w1 = win("GD05", 10, cons=(10, {"ST01-001": [0, 0, 0, 10]}))
        w2 = win("GD05:ST11-14", 30, cons=(30, {"ST01-001": [0, 10, 10, 10], "ST01-002": [5, 0, 0, 0]}))
        decks, cards = bm.merge_consensus([w1, w2])
        self.assertEqual(decks, 40)
        self.assertAlmostEqual(cards["ST01-001"]["adoption"], 1.0); self.assertAlmostEqual(cards["ST01-001"]["avgCopies"], 3.25)
        self.assertAlmostEqual(cards["ST01-002"]["adoption"], 0.125); self.assertAlmostEqual(cards["ST01-002"]["avgCopies"], 1.0)

    def test_sin_consenso_no_hay_cartas(self):
        self.assertEqual(bm.merge_consensus([win("GD06", 5)]), (0, {}))

    def test_presencia_por_set_suma_las_ventanas_intermedias(self):
        p = bm.profile("x", page([win("GD05", 100, cons=(20, {"ST01-001": [0, 0, 0, 20]})), win("GD05:ST11-14", 50), win("GD06", 7)]), [], ["GD05", "GD06"])
        self.assertEqual(p["eraDecks"], {"GD05": 150, "GD06": 7})
        self.assertEqual((p["era"], p["deckCount"], p["colors"], p["name"]), ("GD05", 20, ["B", "R"], "Arquetipo de prueba"))

    def test_el_perfil_usa_el_set_mas_reciente_con_consenso_y_solo_de_los_recientes(self):
        w = [win("GD03", 500, cons=(400, {"ST01-001": [0, 0, 0, 400]})), win("GD05", 40, cons=(30, {"ST01-001": [0, 0, 30, 0]})), win("GD06", 9, cons=(9, {"ST01-001": [0, 9, 0, 0]}))]
        p = bm.profile("x", page(w), [], ["GD05", "GD06"])
        self.assertEqual((p["era"], p["deckCount"], p["cards"]["ST01-001"]["avgCopies"]), ("GD06", 9, 2.0))
        p2 = bm.profile("x", page(w[:1]), [], ["GD05", "GD06"])   # solo consenso de GD03: no describe el meta de hoy
        self.assertEqual((p2["cards"], p2["deckCount"]), ({}, 0))

    def test_sin_consenso_se_usan_las_listas_de_ejemplo_si_hay_al_menos_5(self):
        w = [win("GD06", 7)]
        p = bm.profile("x", page(w), SAMPLES("GD06", 5), ["GD05", "GD06"])
        self.assertTrue(p["sampleBased"]); self.assertEqual((p["era"], p["deckCount"]), ("GD06", 5))
        self.assertAlmostEqual(p["cards"]["ST01-001"]["adoption"], 1.0); self.assertAlmostEqual(p["cards"]["ST01-001"]["avgCopies"], 4.0)
        p4 = bm.profile("x", page(w), SAMPLES("GD06", 4), ["GD05", "GD06"])
        self.assertEqual((p4["cards"], p4["deckCount"]), ({}, 0))
        self.assertNotIn("sampleBased", p4)

    def test_sin_ventanas_por_set_falla(self):
        with self.assertRaises(ValueError):
            bm.profile("x", page([win("otra", 3)]), [], ["GD06"])


@unittest.skipUnless(os.path.exists(META), "aún no existe data/meta.json (python -I scripts/build_meta.py)")
class Datos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.load(open(META, encoding="utf-8"))

    def test_30_arquetipos_con_perfil(self):
        self.assertGreaterEqual(len(self.d["archetypes"]), 25)
        con_perfil = [a for a in self.d["archetypes"] if a["cards"]]
        self.assertGreaterEqual(len(con_perfil), len(self.d["archetypes"]) - 3, "como mucho 3 arquetipos sin perfil (casi sin listas)")
        for a in self.d["archetypes"]:
            self.assertEqual(a["deckCount"] > 0, bool(a["cards"]), a["id"])

    def test_valores_en_rango_y_cartas_del_catalogo(self):
        for a in self.d["archetypes"]:
            for n, c in a["cards"].items():
                self.assertIn(n, CATALOG, a["id"])
                self.assertTrue(0 < c["adoption"] <= 1, (a["id"], n))
                self.assertTrue(1 <= c["avgCopies"] <= 4, (a["id"], n, c["avgCopies"]))
            if a["cards"]:
                self.assertAlmostEqual(a["cutoff"], min(c["adoption"] for c in a["cards"].values()))

    def test_procedencia_y_ventana(self):
        s = self.d["snapshot"]
        self.assertEqual(s["source"]["id"], "side6")
        self.assertEqual(s["era"], max(s["eras"]))
        for era, w in s["windows"].items():
            self.assertTrue(w["from"] and w["to"] and w["from"] <= w["to"], era)
            self.assertGreater(w["total"], 0, era)
        self.assertTrue(s["windowFrom"] and s["windowTo"] and s["windowFrom"] <= s["windowTo"])

    def test_listas_de_ejemplo_suman_50(self):
        for a in self.d["archetypes"]:
            for sd in a["sampleDecks"]:
                self.assertEqual(sum(sd["cards"].values()), 50, a["id"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
