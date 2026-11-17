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


def page(decks, heading="BP Aggro", obj=None, windows=None):
    """Imita el formato web de Side-6 (nov 2026): <h1> con el nombre y JSON dentro de una cadena, con las comillas escapadas.
    `decks` es una lista; el formato real los guarda en un diccionario por hash."""
    body = obj if obj is not None else {"decks": {d["hash"]: d for d in decks}, "windows": windows or []}
    payload = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    return "<html><body><h1 class=\"x\">" + heading + "</h1><script>self.__next_f.push([1,\"" + payload.replace("\\", "\\\\").replace('"', '\\"') + "\"])</script></body></html>"


def deck(h, cards, place=1, eid="9001", title="Evento de prueba", date="2026-10-18T13:00:00.000Z", colors="BLUE_PURPLE", window="GD05"):
    return {"hash": h * 64 if len(h) == 1 else h, "colorCombination": colors,
            "mainboard": [{"cardNumber": n, "number": q} for n, q in cards.items()],
            "placements": [{"id": eid + "-" + str(place), "placement": place, "playerName": "NO DEBE GUARDARSE",
                            "tournament": {"id": eid, "event": {"id": eid, "startDate": date, "title": {"text": {"en": title}} if title else {}}, "windowID": window}}]}


class Parser(unittest.TestCase):
    def test_lista_basica(self):
        a = bd.parse_archetype(page([deck("a", {"ST01-001": 4, "ST01-002": 46})], "BP Aggro"), "bp-aggro")
        self.assertEqual((a["name"], a["colors"]), ("BP Aggro", ["Blue", "Purple"]))
        d = a["decks"][0]
        self.assertEqual((d["place"], d["event"]["title"], d["event"]["date"], d["set"]), (1, "Evento de prueba", "2026-10-18", "GD05"))
        self.assertEqual(sum(d["cards"].values()), 50)

    def test_estilo_y_ventanas(self):
        win = [{"id": "GD05:ST11-14", "startDate": "2026-10-02T00:00:00.000Z", "endDate": "2026-11-06T00:00:00.000Z", "windowPlacements": 3472, "placements": 5, "lists": 4},
               {"id": "GD06", "startDate": "2026-11-06T00:00:00.000Z", "endDate": "2027-02-05T00:00:00.000Z", "windowPlacements": 848, "placements": 7, "lists": 7}]
        body = {"tempoMix": [{"strategy": "MIDRANGE", "share": 1}], "decks": {"a" * 64: deck("a", {"ST01-001": 50})}, "windows": win}
        a = bd.parse_archetype(page(None, obj=body), "x")
        self.assertEqual(a["style"], "Midrange")
        self.assertEqual([(w["id"], w["total"], w["placements"], w["from"]) for w in a["windows"]], [("GD05:ST11-14", 3472, 5, "2026-10-02"), ("GD06", 848, 7, "2026-11-06")])

    def test_el_set_sale_de_la_ventana_y_las_ventanas_intermedias_cuentan_para_su_set(self):
        self.assertEqual((bd.set_of_window("GD05:ST11-14"), bd.set_of_window("GD04:EB01_ST10"), bd.set_of_window("GD06"), bd.set_of_window(None)), ("GD05", "GD04", "GD06", None))
        r = bd.parse_archetype(page([deck("a", {"ST01-001": 50}, window="GD06", date="2026-11-10T00:00:00.000Z")]), "x")["decks"][0]
        self.assertEqual(r["set"], "GD06")

    def test_no_se_guardan_nombres_de_jugadores(self):
        a = bd.parse_archetype(page([deck("a", {"ST01-001": 50})]), "x")
        self.assertNotIn("NO DEBE GUARDARSE", json.dumps(a))

    def test_puesto_mas_reciente_dentro_de_la_ventana(self):
        d = deck("a", {"ST01-001": 50}, place=9)
        d["placements"].append({"id": "9002-2", "placement": 2, "tournament": {"id": "9002", "event": {"id": "9002", "startDate": "2026-10-20T00:00:00.000Z", "title": {"text": {"en": "Otro"}}}, "windowID": "GD05"}})
        d["placements"].append({"id": "9000-1", "placement": 1, "tournament": {"id": "9000", "event": {"id": "9000", "startDate": "2026-03-01T00:00:00.000Z", "title": {"text": {"en": "Antiguo"}}}, "windowID": "GD03"}})
        r = bd.parse_archetype(page([d]), "x")["decks"][0]
        self.assertEqual((r["place"], r["event"]["id"], r["set"]), (2, "9002", "GD05"), "el más reciente dentro de la ventana, no el mejor puesto histórico")

    def test_evento_repetido_como_referencia_se_resuelve_con_el_mismo_torneo(self):
        a = deck("a", {"ST01-001": 50}, eid="9001", title="Mismo evento")
        b = deck("b", {"ST01-001": 50}, eid="9001", place=4)
        b["placements"][0]["tournament"] = "$b:props:children:3:props:model:decks:" + b["hash"] + ":placements:0:tournament"   # así lo serializa el formato
        r = bd.parse_archetype(page([a, b]), "x")
        self.assertEqual({d["event"]["title"] for d in r["decks"]}, {"Mismo evento"})
        self.assertEqual({d["event"]["date"] for d in r["decks"]}, {"2026-10-18"})

    def test_evento_sin_titulo_se_completa_con_otra_lista_del_mismo_evento(self):
        a = bd.parse_archetype(page([deck("a", {"ST01-001": 50}, title="Mismo evento"), deck("b", {"ST01-001": 50}, title=None)]), "x")
        self.assertEqual({d["event"]["id"] for d in a["decks"]}, {"9001"})

    def test_sin_listas_falla_con_el_nombre_del_arquetipo(self):
        with self.assertRaises(ValueError) as cm:
            bd.parse_archetype("<html></html>", "rg-midrange")
        self.assertIn("rg-midrange", str(cm.exception))

    def test_indice_solo_devuelve_arquetipos_validos(self):
        html = '<a href="/en/archetypes/mikazuki-barbatos/">x</a><a href="/en/archetypes/rg-other/">y</a><a href="/en/archetypes/">índice</a><a href="/en/archetypes/rg-other/">dup</a><a href="/en/decklists/abc/">no</a>'
        self.assertEqual(bd.parse_index(html), ["mikazuki-barbatos", "rg-other"])

    def test_titulo_sin_held_in(self):
        self.assertEqual(bd.clean_title("Gundam Card Game Serial Card Challenge (Held in October)"), "Gundam Card Game Serial Card Challenge")
        self.assertEqual(bd.clean_title("Newtype Challenge 2026 MISSION4 (held in September)"), "Newtype Challenge 2026 MISSION4")
        self.assertEqual(bd.clean_title("BCG Fest Special Tournament in Manila"), "BCG Fest Special Tournament in Manila")

    def test_pais_del_evento_por_su_direccion(self):
        page = lambda addr: '<div>Location</div><div>%s</div></div>' % addr
        self.assertEqual(bd.parse_event_country(page("<div>1 Ayala Ave</div><div>1226 Philippines</div>")), "PH")
        self.assertEqual(bd.parse_event_country(page("<div>Kitazonocho, Osaka</div><div>569-0802 Japan</div>")), "JP")
        self.assertEqual(bd.parse_event_country(page("<div>400 W Wisconsin Ave</div><div>75202 United States</div>")), "US")
        self.assertIsNone(bd.parse_event_country("<html></html>"))
        self.assertIsNone(bd.parse_event_country(page("<div>Calle sin país</div>")))

    def test_evento_de_una_lista_concreta(self):
        html = page(None, obj={"placements": deck("a", {"ST01-001": 50}, place=3)["placements"]})   # página de una lista concreta
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

    def test_eventos_con_pais_y_titulo_limpio(self):
        for a, d in self.decks:
            self.assertNotIn("Held in", d["event"]["title"])
            self.assertTrue(d["event"].get("country"), d["event"]["title"])
            self.assertRegex(d["event"]["country"], r"^[A-Z]{2}$")

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
