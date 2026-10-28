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


def pool_block(label, total, cards):
    pc = [{"cardNumber": n, "numberOfDecks": d, "numberOfCopies": c} for n, d, c in cards]
    return {"window": {"label": label}, "stats": {"totalDecks": total}, "totalDecks": total, "popularCards": pc}


def page(blocks):
    parts = []
    for b in blocks:
        parts.append('"window":{"__typename":"MetaTimeWindow","label":%s},"totalDecks":%d,"popularCards":%s' % (json.dumps(b["window"]["label"]), b["totalDecks"], json.dumps(b["popularCards"], separators=(",", ":"))))
    payload = "{" + "},{".join(parts) + "}"
    return "<script>self.__next_f.push([1,\"" + payload.replace("\\", "\\\\").replace('"', '\\"') + "\"])</script>"


class Parser(unittest.TestCase):
    def test_elige_la_ventana_del_ultimo_set(self):
        html = page([pool_block("GD04", 857, [("ST01-001", 700, 2800)]), pool_block("GD05", 163, [("ST11-009", 153, 605)]), pool_block(None, 1499, [("ST01-010", 1400, 5600)])])
        pools = bm.popular_pools(html)
        self.assertEqual(sorted(p["label"] or "" for p in pools), ["", "GD04", "GD05"])
        cur = bm.pick_current(pools)
        self.assertEqual((cur["label"], cur["total"]), ("GD05", 163))

    def test_adopcion_y_copias_medias(self):
        pool = bm.pick_current(bm.popular_pools(page([pool_block("GD05", 163, [("ST11-009", 153, 605)])])))
        c = pool["cards"][0]
        self.assertAlmostEqual(c["decks"] / pool["total"], 0.9387, places=3)
        self.assertAlmostEqual(c["copies"] / c["decks"], 3.9542, places=3)

    def test_sin_ventanas_por_set_falla(self):
        with self.assertRaises(ValueError):
            bm.pick_current(bm.popular_pools(page([pool_block(None, 10, [("ST01-001", 5, 10)])])))

    def test_fechas_de_la_ventana(self):
        self.assertEqual(bm.window_dates("Aug 3 – Nov 1, 2026"), ("2026-08-03", "2026-11-01"))
        self.assertEqual(bm.window_dates("Dec 20 – Feb 2, 2027"), ("2026-12-20", "2027-02-02"))
        self.assertIsNone(bm.window_dates("sin fechas"))


@unittest.skipUnless(os.path.exists(META), "aún no existe data/meta.json (python -I scripts/build_meta.py)")
class Datos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.load(open(META, encoding="utf-8"))

    def test_30_arquetipos_con_perfil(self):
        self.assertGreaterEqual(len(self.d["archetypes"]), 25)
        for a in self.d["archetypes"]:
            self.assertGreater(a["deckCount"], 0, a["id"])
            self.assertTrue(a["cards"], a["id"])

    def test_valores_en_rango_y_cartas_del_catalogo(self):
        for a in self.d["archetypes"]:
            for n, c in a["cards"].items():
                self.assertIn(n, CATALOG, a["id"])
                self.assertTrue(0 < c["adoption"] <= 1, (a["id"], n))
                self.assertTrue(1 <= c["avgCopies"] <= 4, (a["id"], n, c["avgCopies"]))
            self.assertAlmostEqual(a["cutoff"], min(c["adoption"] for c in a["cards"].values()))

    def test_procedencia_y_ventana(self):
        s = self.d["snapshot"]
        self.assertEqual(s["source"]["id"], "side6")
        self.assertEqual(s["era"], "GD05")
        self.assertTrue(s["windowFrom"] and s["windowTo"] and s["windowFrom"] < s["windowTo"])

    def test_listas_de_ejemplo_suman_50(self):
        for a in self.d["archetypes"]:
            for sd in a["sampleDecks"]:
                self.assertEqual(sum(sd["cards"].values()), 50, a["id"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
