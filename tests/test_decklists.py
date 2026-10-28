"""Pruebas de las listas competitivas.  Ejecutar:  python -I tests/test_decklists.py"""
import json
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import build_decklists as bd  # noqa: E402

CATALOG = {c["number"] for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}
DATA_PATH = os.path.join(ROOT, "data", "decklists.json")


def page(decklists, heading="BP Aggro", obj=None):
    """Imita cómo Side-6 incrusta los datos: JSON dentro de una cadena, con las comillas escapadas."""
    payload = json.dumps(obj if obj is not None else {"heading": heading, "decklists": decklists}, ensure_ascii=False, separators=(",", ":"))
    return "<html><body><script>self.__next_f.push([1,\"" + payload.replace("\\", "\\\\").replace('"', '\\"') + "\"])</script></body></html>"


def deck(h, cards, place=1, eid="9001", title="Evento de prueba", date="2026-10-18T13:00:00.000Z", colors="BLUE_PURPLE"):
    return {"hash": h * 64 if len(h) == 1 else h, "colorCombination": colors, "archetype": {"strategy": "AGGRO"},
            "mainboard": [{"cardNumber": n, "number": q} for n, q in cards.items()],
            "placements": [{"placement": place, "playerName": "NO DEBE GUARDARSE", "tournament": {"id": "t1", "event": {"id": eid, "startDate": date, "title": {"text": {"en": title}} if title else {}}}}]}


class Parser(unittest.TestCase):
    def test_lista_basica(self):
        a = bd.parse_archetype(page([deck("a", {"ST01-001": 4, "ST01-002": 46})]), "bp-aggro")
        self.assertEqual((a["name"], a["colors"], a["style"]), ("BP Aggro", ["Blue", "Purple"], "Aggro"))
        d = a["decks"][0]
        self.assertEqual((d["place"], d["event"]["title"], d["event"]["date"]), (1, "Evento de prueba", "2026-10-18"))
        self.assertEqual(sum(d["cards"].values()), 50)

    def test_no_se_guardan_nombres_de_jugadores(self):
        a = bd.parse_archetype(page([deck("a", {"ST01-001": 50})]), "x")
        self.assertNotIn("NO DEBE GUARDARSE", json.dumps(a))

    def test_mejor_puesto_si_hay_varios(self):
        d = deck("a", {"ST01-001": 50}, place=9)
        d["placements"].append({"placement": 2, "tournament": {"event": {"id": "9002", "startDate": "2026-10-20T00:00:00.000Z", "title": {"text": {"en": "Otro"}}}}})
        r = bd.parse_archetype(page([d]), "x")["decks"][0]
        self.assertEqual((r["place"], r["event"]["id"]), (2, "9002"))

    def test_evento_sin_titulo_se_completa_con_otra_lista_del_mismo_evento(self):
        a = bd.parse_archetype(page([deck("a", {"ST01-001": 50}, title="Mismo evento"), deck("b", {"ST01-001": 50}, title=None)]), "x")
        self.assertEqual({d["event"]["title"] for d in a["decks"]}, {"Mismo evento"})

    def test_sin_listas_falla_con_el_nombre_del_arquetipo(self):
        with self.assertRaises(ValueError) as cm:
            bd.parse_archetype("<html></html>", "rg-midrange")
        self.assertIn("rg-midrange", str(cm.exception))

    def test_indice_solo_devuelve_arquetipos_validos(self):
        html = '<a href="/en/archetypes/bp-aggro">x</a><a href="/en/archetypes/rg-midrange/">y</a><a href="/en/archetypes/other-page">z</a><a href="/en/archetypes/bp-aggro">dup</a>'
        self.assertEqual(bd.parse_index(html), ["bp-aggro", "rg-midrange"])

    def test_evento_de_una_lista_concreta(self):
        html = page(None, obj={"placements": deck("a", {"ST01-001": 50}, place=3)["placements"]})
        r = bd.parse_deck_event(html)
        self.assertEqual((r[0], r[1], r[2], r[3]), (3, "9001", "Evento de prueba", "2026-10-18"))


@unittest.skipUnless(os.path.exists(DATA_PATH), "aún no existe data/decklists.json (python -I scripts/build_decklists.py)")
class Datos(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.load(open(DATA_PATH, encoding="utf-8"))
        cls.decks = [(a, d) for a in cls.data["archetypes"] for d in a["decks"]]

    def test_hay_listas_suficientes(self):
        self.assertGreaterEqual(len(self.decks), 100)
        self.assertGreaterEqual(len(self.data["archetypes"]), 20)

    def test_todas_suman_50_cartas(self):
        for a, d in self.decks:
            self.assertEqual(sum(d["cards"].values()), 50, a["id"] + " " + d["h"][:8])

    def test_numeros_de_carta_validos_y_en_el_catalogo(self):
        for a, d in self.decks:
            for n in d["cards"]:
                self.assertRegex(n, r"^[A-Z]{2}\d{2}-\d{3}$")
        self.assertEqual(self.data["unknownCards"], [], "cartas que no están en data/all_cards.json")

    def test_ninguna_carta_con_mas_de_4_copias_salvo_excepciones_conocidas(self):
        raras = [(a["id"], n, q) for a, d in self.decks for n, q in d["cards"].items() if q > 4]
        self.assertEqual(raras, [], "copias > 4: revisar reglas de la carta")

    def test_todas_tienen_fecha_dentro_de_la_ventana_y_titulo(self):
        for a, d in self.decks:
            self.assertGreaterEqual(d["event"]["date"], bd.FROM_DATE)
            self.assertTrue(d["event"]["title"], d["h"][:8])
            self.assertIsInstance(d["place"], int)

    def test_hashes_unicos_y_enlace_construible(self):
        hs = [d["h"] for _, d in self.decks]
        self.assertEqual(len(hs), len(set(hs)))
        for h in hs:
            self.assertRegex(h, r"^[0-9a-f]{64}$")

    def test_sin_datos_personales(self):
        txt = open(DATA_PATH, encoding="utf-8").read()
        self.assertNotIn("playerName", txt)

    def test_procedencia(self):
        s = self.data["snapshot"]
        self.assertEqual(s["source"]["id"], "side6")
        self.assertRegex(s["retrievedAt"], r"^\d{4}-\d\d-\d\dT")
        self.assertLessEqual(s["from"], s["to"])


if __name__ == "__main__":
    unittest.main(verbosity=1)
