"""Pruebas del sistema maestro de efectos.  Ejecutar:  python -I tests/test_effects.py"""
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import effects as fx  # noqa: E402

CFG = fx.load_config()
ACTIONS = {a["id"] for a in CFG["actions"]}
ACTS = {a["id"] for a in CFG["activations"]}
CARDS = {c["number"]: c for c in json.load(open(os.path.join(ROOT, "data", "all_cards.json"), encoding="utf-8"))}


def pairs(text):
    return [(e["act"], e["action"]) for e in fx.parse_effects(text)]


def card(number):
    return fx.parse_effects(CARDS[number]["effect"])


class Ejemplos(unittest.TestCase):
    def test_full_frontal(self):
        self.assertEqual([(e["act"], e["action"]) for e in card("ST03-010")], [("BURST", "ADD_TO_HAND"), ("WHEN_PAIRED", "DEPLOY_FROM_HAND")])

    def test_ap_menos_3_no_es_eliminacion(self):
        e = card("ST01-006")
        self.assertEqual([(x["act"], x["action"], x.get("value")) for x in e], [("WHEN_PAIRED", "AP_REDUCTION", 3)])
        self.assertEqual(e[0].get("maxLevel"), 5)
        self.assertEqual(e[0].get("duration"), "THIS_TURN")

    def test_burst_solo_nunca_es_un_efecto(self):
        for c in CARDS.values():
            for e in fx.parse_effects(c.get("effect")):
                self.assertNotIn(e["action"], ACTS, c["number"])

    def test_repair_no_es_recuperar_hp(self):
        self.assertNotIn("RECOVER_HP", [e["action"] for e in card("ST01-001")])      # solo <Repair 2> + AP+1

    def test_daño_no_es_eliminacion(self):
        self.assertEqual(pairs("【Burst】Choose 1 enemy Unit. Deal 1 damage to it."), [("BURST", "DAMAGE_UNIT")])
        self.assertEqual(pairs("【Main】Deal 1 damage to all enemy Units."), [("MAIN", "AOE_DAMAGE")])
        self.assertEqual(pairs("【Deploy】Choose 1 enemy Base. Deal 2 damage to it."), [("DEPLOY", "DAMAGE_BASE")])

    def test_destruir_solo_si_el_texto_lo_dice(self):
        self.assertEqual(pairs("【Main】Choose 1 enemy Unit. Destroy it."), [("MAIN", "DESTROY_UNIT")])
        self.assertNotIn("DESTROY_UNIT", [a for _, a in pairs("【Attack】Choose 1 enemy Unit. It gets AP-2 during this turn.")])

    def test_robar_y_anadir_son_distintos(self):
        self.assertEqual(pairs("【Deploy】Draw 1."), [("DEPLOY", "DRAW")])
        self.assertEqual(pairs("【Burst】Add this card to your hand."), [("BURST", "ADD_TO_HAND")])

    def test_zona_origen_se_conserva(self):
        self.assertEqual(pairs("【Deploy】Choose 1 Unit card from your trash. Add it to your hand."), [("DEPLOY", "RECOVER_FROM_TRASH")])
        self.assertEqual(pairs("【Deploy】You may deploy 1 Unit card that is Lv.4 or lower from your hand."), [("DEPLOY", "DEPLOY_FROM_HAND")])


class Activacion(unittest.TestCase):
    def test_once_per_turn_es_frecuencia(self):
        e = fx.parse_effects("【Attack】【Once per Turn】Draw 1.")
        self.assertEqual((e[0]["act"], e[0]["freq"], e[0]["action"]), ("ATTACK", "ONCE_PER_TURN", "DRAW"))

    def test_once_per_turn_sin_otro_timing(self):
        e = fx.parse_effects("【Once per Turn】When an enemy Unit is destroyed, draw 1.")
        self.assertEqual((e[0]["act"], e[0]["freq"], e[0]["action"]), (None, "ONCE_PER_TURN", "DRAW"))

    def test_estado_mas_evento(self):
        e = fx.parse_effects("【During Pair】【Destroyed】Draw 1.")
        self.assertEqual((e[0]["act"], e[0].get("cond")), ("DESTROYED", "DURING_PAIR"))

    def test_main_action(self):
        self.assertEqual(pairs("【Main】/【Action】Choose 1 enemy Unit. Rest it."), [("MAIN_ACTION", "REST")])

    def test_referencia_a_otro_timing_no_es_cabecera(self):
        self.assertEqual(pairs("【Burst】Activate this card's 【Main】."), [("BURST", "TRIGGER_OTHER_EFFECT")])

    def test_coste_antes_de_los_dos_puntos_no_es_efecto(self):
        self.assertEqual(pairs("【Activate･Main】Rest this Base：Draw 1."), [("ACTIVATE_MAIN", "DRAW")])

    def test_solo_keywords_no_genera_efectos(self):
        self.assertEqual(pairs("<Blocker> (Rest this Unit to change the attack target to it.)"), [])
        self.assertEqual(pairs("-"), [])
        self.assertEqual(pairs(None), [])


class Datos(unittest.TestCase):
    def test_todo_valido_en_la_configuracion(self):
        for n, c in CARDS.items():
            for e in c["effects"]:
                self.assertIn(e["action"], ACTIONS, n)
                self.assertTrue(e["act"] is None or e["act"] in ACTS, (n, e["act"]))
                self.assertGreaterEqual(e["conf"], 0)

    def test_otro_efecto_bajo_el_5_por_ciento(self):
        allfx = [e for c in CARDS.values() for e in c["effects"]]
        otros = [e for e in allfx if e["action"] == "OTHER"]
        self.assertLess(len(otros) / len(allfx), 0.05)

    def test_otros_estan_marcados_para_revision(self):
        for c in CARDS.values():
            for e in c["effects"]:
                if e["action"] == "OTHER":
                    self.assertLess(e["conf"], 0.9)

    def test_colores_de_la_especificacion(self):
        col = {a["id"]: a["color"] for a in CFG["activations"]}
        self.assertEqual((col["BURST"], col["DEPLOY"], col["ATTACK"], col["DESTROYED"]), ("#F29A3F", "#55A9D6", "#63BFC3", "#55A9D6"))
        self.assertEqual((col["WHEN_PAIRED"], col["WHEN_LINKED"], col["DURING_LINK"]), ("#D989B8", "#E4D72D", "#E4D72D"))
        self.assertEqual(CFG["fallbackColor"], "#5F7F8D")

    def test_sentence_case_en_etiquetas(self):
        for a in CFG["actions"]:
            for lang in ("es", "en"):
                label = a[lang]
                self.assertNotEqual(label, label.upper(), a["id"]) if len(label) > 3 and "AP" not in label and "HP" not in label else None
                self.assertEqual(label[0], label[0].upper(), a["id"])
        for a in CFG["activations"]:
            self.assertNotEqual(a["es"], a["es"].upper(), a["id"]) if len(a["es"]) > 5 else None

    def test_old_tags_no_alimentan_los_efectos(self):
        # el análisis no lee `tags`: cambiarlas no cambia el resultado
        c = dict(CARDS["ST03-010"]); c["tags"] = ["removal"]
        self.assertEqual(fx.parse_effects(c["effect"]), fx.parse_effects(CARDS["ST03-010"]["effect"]))


class RegresionesQA(unittest.TestCase):
    """Casos que el analizador falló en la revisión QA y que se arreglaron con reglas generales."""

    def test_la_condicion_no_es_la_accion(self):
        # "when you pair a Pilot..." describe cuándo, no qué hace
        self.assertEqual([e["action"] for e in card("ST13-001")], ["GENERATE_TOKEN", "START_BATTLE"])
        self.assertEqual([e["action"] for e in card("GD01-065")], ["AP_REDUCTION"])

    def test_linea_sin_cabecera_es_otro_efecto(self):
        a = pairs("【Burst】Add this card to your hand.\nWhen playing this card from your hand, play this card as if it has 0 cost.")
        self.assertEqual(a, [("BURST", "ADD_TO_HAND"), (None, "MODIFY_COST_LEVEL")])

    def test_dos_puntos_no_siempre_es_coste(self):
        self.assertEqual([a for _, a in pairs("【Action】Choose 1 friendly Unit. It gains the following effect during this battle：\n■When this Unit destroys an enemy Unit, choose 1 enemy Unit. Destroy it.")], ["GAIN_EFFECT", "DESTROY_UNIT"])
        self.assertEqual([a for _, a in card_pairs("GD06-039")], ["DEPLOY_FROM_HAND"])        # "Destroy ... Lv.3 ...：" es coste

    def test_gains_sin_espacio_y_get_and_keyword(self):
        self.assertEqual([a for _, a in pairs("While 3 or more enemy Units are in play, this Unit gains<Blocker>.")], ["GAIN_KEYWORD"])
        self.assertEqual(sorted(a for _, a in card_pairs("GD05-007")), ["AP_INCREASE", "GAIN_KEYWORD"])

    def test_proteger_y_redirigir_dano(self):
        self.assertEqual([a for _, a in card_pairs("ST11-002")], ["PREVENT_DAMAGE"])
        self.assertEqual([a for _, a in card_pairs("GD04-095")], ["ADD_TO_HAND", "REDIRECT_DAMAGE"])
        self.assertEqual([a for _, a in card_pairs("GD06-093")], ["ADD_TO_HAND", "REDUCE_DAMAGE"])

    def test_nada_de_otro_efecto_en_la_base(self):
        self.assertEqual([n for n, c in CARDS.items() for e in c["effects"] if e["action"] == "OTHER"], [])

    def test_deploy_this_card_no_es_desplegar_unidad(self):
        self.assertEqual([a for _, a in pairs("【Burst】Deploy this card.")], ["DEPLOY_CARD"])

    def test_condicion_solo_en_lo_condicionado(self):
        e = card("ST11-016")
        self.assertIsNone(next(x for x in e if x["action"] == "ADD_TO_HAND").get("cnd"))
        self.assertEqual(next(x for x in e if x["action"] == "DAMAGE_UNIT").get("cnd"), ["IF"])


def card_pairs(number):
    return [(e["act"], e["action"]) for e in card(number)]


class Overrides(unittest.TestCase):
    def test_override_prevalece(self):
        e = fx.parse_effects("【Main】Choose 1 enemy Unit. Rest it.")
        fx.apply_overrides("X-001", e, [{"card": "X-001", "index": 0, "action": "OTHER", "activation": "BURST"}])
        self.assertEqual((e[0]["act"], e[0]["action"], e[0]["conf"]), ("BURST", "OTHER", 1.0))


if __name__ == "__main__":
    unittest.main(verbosity=1)
