"""Pruebas del analizador de habilidades/activaciones.  Ejecutar:  python tests/test_abilities.py"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from abilities import load_config, parse_abilities, norm  # noqa: E402

CFG = load_config()
CARDS = {c["number"]: c for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}


def abil(number):
    return parse_abilities(CARDS[number].get("effect"), CFG)


def p(text):
    return parse_abilities(text, CFG)


class Normalizacion(unittest.TestCase):
    def test_variantes_de_nombre(self):
        for raw in ("High-Maneuver", "HIGH-MANEUVER", "high maneuver", "High_Maneuver"):
            self.assertEqual(norm(raw), "HIGH_MANEUVER")
        for raw in ("First Strike", "First-Strike", "FIRST STRIKE"):
            self.assertEqual(norm(raw), "FIRST_STRIKE")

    def test_variantes_dentro_del_texto(self):
        self.assertEqual(p("<High Maneuver> (This Unit can't be blocked.)")["keywordEffects"], ["HIGH_MANEUVER"])
        self.assertEqual(p("<FIRST-STRIKE>\nOtra línea")["keywordEffects"], ["FIRST_STRIKE"])
        self.assertEqual(p("<High-Maneuver>")["keywordEffects"], ["HIGH_MANEUVER"])


class Habilidades(unittest.TestCase):
    def test_repair_impresa(self):
        self.assertEqual(abil("ST01-001")["keywordEffects"], ["REPAIR"])          # <Repair 2> al inicio

    def test_repair_no_incluye_curacion_por_otro_efecto(self):
        # "Choose 1 friendly Unit. It recovers 3 HP." no es la keyword <Repair>
        kai = [n for n, c in CARDS.items() if "recovers 3 HP" in (c.get("effect") or "") and "<Repair" not in (c.get("effect") or "")]
        self.assertTrue(kai)
        for n in kai:
            self.assertNotIn("REPAIR", abil(n)["keywordEffects"], n)

    def test_condicion_no_es_habilidad(self):
        self.assertNotIn("REPAIR", abil("GD01-089")["keywordEffects"])            # "While this Unit has <Repair>, it gets AP+1"
        self.assertNotIn("BLOCKER", abil("GD01-029")["keywordEffects"])           # "enemy Unit with <Blocker>"

    def test_gd05_112_concede_breach(self):
        self.assertEqual(abil("GD05-112")["keywordEffects"], ["BREACH"])           # "...without <Breach>. It gains <Breach 3>"

    def test_formato_sin_espacio_de_gd06(self):
        self.assertNotIn("BLOCKER", abil("GD06-024")["keywordEffects"])           # "with<Blocker>"
        self.assertNotIn("REPAIR", abil("GD06-083")["keywordEffects"])            # "has<Repair>"

    def test_ficha_con_blocker_no_cuenta(self):
        self.assertNotIn("BLOCKER", abil("GD01-066")["keywordEffects"])           # "[Fatum-00](...･<Blocker>) token"

    def test_concedida(self):
        self.assertIn("BREACH", abil("GD03-088")["keywordEffects"])               # "it gets AP+1 and <Breach 1>"
        self.assertIn("FIRST_STRIKE", abil("GD05-120")["keywordEffects"])         # "It gets <First Strike>"
        self.assertIn("HIGH_MANEUVER", abil("ST03-001")["keywordEffects"])        # "This Unit gains <High-Maneuver>"

    def test_support_va_tras_un_trigger(self):
        self.assertEqual(abil("ST03-002")["keywordEffects"], ["SUPPORT"])
        self.assertEqual(abil("ST03-002")["activationType"], ["ACTIVATE_MAIN"])

    def test_lista_de_referencias_no_cuenta(self):
        self.assertEqual(abil("GD04-067")["keywordEffects"], [])                  # "<Repair>/<Breach>/<First Strike>/..."

    def test_blocker_impreso(self):
        self.assertEqual(abil("ST01-009")["keywordEffects"], ["BLOCKER"])

    def test_sin_efecto(self):
        self.assertEqual(p(""), {"keywordEffects": [], "activationTiming": [], "activationType": [], "frequency": []})
        self.assertEqual(p("-"), {"keywordEffects": [], "activationTiming": [], "activationType": [], "frequency": []})
        self.assertEqual(p(None)["keywordEffects"], [])


class Activacion(unittest.TestCase):
    def test_momentos_simples(self):
        a = p("【Burst】Add this card to your hand.\n【Deploy】Draw 1.")
        self.assertEqual(a["activationTiming"], ["BURST", "DEPLOY"])

    def test_varios_momentos_en_una_linea(self):
        self.assertEqual(p("【Deploy】/【Attack】Choose 1 enemy Unit.")["activationTiming"], ["DEPLOY", "ATTACK"])
        self.assertEqual(p("【During Pair】【Destroyed】If you have another Link Unit in play, draw 1.")["activationTiming"], ["DESTROYED", "DURING_PAIR"])

    def test_trigger_con_calificador(self):
        self.assertEqual(p("【When Paired･(Zeon) Pilot】Draw 1.")["activationTiming"], ["WHEN_PAIRED"])
        self.assertEqual(p("【During Pair･Lv.3 or Lower Pilot】【Destroyed】You may discard 1.")["activationTiming"], ["DESTROYED", "DURING_PAIR"])
        self.assertEqual(p("【Deploy・Development 2】You may exile cards.")["activationTiming"], ["DEPLOY"])

    def test_tipo_de_activacion(self):
        self.assertEqual(p("【Activate･Main】Rest this Base：Draw 1.")["activationType"], ["ACTIVATE_MAIN"])
        self.assertEqual(p("【Activate･Action】【Once per Turn】①：This Unit gets AP+4.")["activationType"], ["ACTIVATE_ACTION"])
        self.assertEqual(p("【Activate･Main】/【Activate･Action】x")["activationType"], ["ACTIVATE_MAIN", "ACTIVATE_ACTION"])

    def test_main_y_action_de_comandos_no_son_activate(self):
        a = p("【Main】/【Action】Choose 1 enemy Unit. Deal 1 damage to it.")
        self.assertEqual((a["activationType"], a["activationTiming"], a["frequency"]), ([], [], []))

    def test_referencia_a_main_no_es_trigger(self):
        self.assertEqual(p("【During Link】【Attack】Activate 【Main】 on the card paired with this Unit.")["activationType"], [])

    def test_frecuencia(self):
        self.assertEqual(p("【Once per Turn】When this Unit destroys an enemy Unit, draw 1.")["frequency"], ["ONCE_PER_TURN"])
        self.assertEqual(p("【Deploy】Draw 1.")["frequency"], [])

    def test_activar_y_frecuencia_se_separan_del_momento(self):
        a = p("【Activate･Main】【Once per Turn】②：Choose 1 friendly Unit.")
        self.assertEqual((a["activationTiming"], a["activationType"], a["frequency"]), ([], ["ACTIVATE_MAIN"], ["ONCE_PER_TURN"]))

    def test_burst_antes_que_main(self):
        self.assertEqual(p("【Burst】Activate this card's 【Main】.\n【Main】/【Action】Choose 1 enemy Unit.")["activationTiming"], ["BURST"])


class Combinaciones(unittest.TestCase):
    """Los ejemplos de la especificación: habilidad + activación se evalúan con AND entre grupos."""

    def cartas(self, kw=None, timing=None):
        out = []
        for n, c in CARDS.items():
            a = parse_abilities(c.get("effect"), CFG)
            if kw and kw not in a["keywordEffects"]:
                continue
            if timing and timing not in a["activationTiming"]:
                continue
            out.append(n)
        return out

    def test_breach_y_when_paired(self):
        r = self.cartas("BREACH", "WHEN_PAIRED")
        self.assertTrue(r)
        self.assertLess(len(r), len(self.cartas("BREACH")))
        self.assertLess(len(r), len(self.cartas(timing="WHEN_PAIRED")))

    def test_blocker_y_deploy(self):
        r = self.cartas("BLOCKER", "DEPLOY")
        self.assertTrue(r)
        for n in r:
            self.assertIn("BLOCKER", abil(n)["keywordEffects"])
            self.assertIn("DEPLOY", abil(n)["activationTiming"])


class Datos(unittest.TestCase):
    def test_todas_las_cartas_tienen_los_cuatro_campos(self):
        for n, c in CARDS.items():
            for f in ("keywordEffects", "activationTiming", "activationType", "frequency"):
                self.assertIsInstance(c.get(f), list, (n, f))

    def test_ids_validos(self):
        valid = {g: {x["id"] for x in CFG[g]} for g in ("keywordEffects", "activationTiming", "activationType", "frequency")}
        for n, c in CARDS.items():
            for g, ids in valid.items():
                self.assertTrue(set(c[g]) <= ids, (n, g, c[g]))

    def test_categorias_funcionales_se_conservan(self):
        self.assertTrue(all(isinstance(c.get("tags"), list) and c["tags"] for c in CARDS.values()))

    def test_toda_keyword_oficial_impresa_se_detecta(self):
        # una carta cuyo texto empieza una línea con <Keyword ...> debe tenerla
        import re
        known = {x["id"]: x["label"] for x in CFG["keywordEffects"]}
        for n, c in CARDS.items():
            for m in re.finditer(r"(^|\n)\s*(?:【[^】]*】\s*)*<([A-Za-z][A-Za-z \-]*?)(?:\s+\d+)?>", c.get("effect") or ""):
                kid = norm(m.group(2))
                if kid in known:
                    self.assertIn(kid, c["keywordEffects"], (n, kid))


if __name__ == "__main__":
    unittest.main(verbosity=1)
