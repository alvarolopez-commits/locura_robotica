/* Pruebas de aceptación del motor de legalidad (especificación §22). Ejecutar:  node tests/legality.test.js */
const fs = require('fs');
const path = require('path');
const L = require('../legality.js');

const root = path.join(__dirname, '..');
const all = JSON.parse(fs.readFileSync(path.join(root, 'data', 'all_cards.json'), 'utf8'));
const rulesets = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rulesets.json'), 'utf8')).rulesets;
const byNumber = {};
all.forEach((c) => { byNumber[c.number] = c; });
const RS = L.getActiveRuleset(rulesets, '2026-10-23', 'EN');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(actual, expected, msg) { if (actual !== expected) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(actual)); }
function hasError(res, ruleType, extra) {
  const e = res.errors.find((x) => x.ruleType === ruleType);
  if (!e) throw new Error('falta error ' + ruleType + ' (hay: ' + res.errors.map((x) => x.ruleType).join(', ') + ')');
  if (extra) extra(e);
  return e;
}

// ---- cartas "de relleno" que no se ven afectadas por ninguna regla ----
const ruleNumbers = new Set(['GD01-020', 'ST02-016', 'ST01-010', 'ST05-010', 'GD01-008', 'GD05-015']);
RS.exclusiveGroups.forEach((g) => { const m = L.groupMembers(g, byNumber); Object.keys(m.listed).concat(Object.keys(m.detected)).forEach((n) => ruleNumbers.add(n)); });
function filler(colors, count, avoid) {
  const out = {}; let n = 0;
  for (const c of all) {
    if (n >= count) break;
    if (!colors.includes(c.color) || ruleNumbers.has(c.number) || (avoid || []).includes(c.number)) continue;
    const q = Math.min(4, count - n); out[c.number] = q; n += q;
  }
  if (n < count) throw new Error('no hay suficientes cartas de relleno');
  return out;
}
const total = (d) => Object.values(d).reduce((s, q) => s + q, 0);
function deckOf(base, extra) { return Object.assign({}, base, extra); }
function fill(colors, size, forced) { // mazo de `size` cartas que incluye las `forced`
  const rest = size - total(forced);
  return deckOf(forced, filler(colors, rest, Object.keys(forced)));
}

console.log('\nRuleset activo: ' + RS.id + ' (' + RS.name + ')');

console.log('\nTests de mazo estándar');
test('A · 50 cartas Rojo/Verde sin violaciones → LEGAL', () => {
  const d = filler(['Red', 'Green'], 50); eq(total(d), 50);
  const r = L.validateDeck(d, RS, byNumber); eq(r.status, 'legal'); eq(r.errors.length, 0);
  eq(r.summary.colors.join(), 'Green,Red');
});
test('B · 49 cartas → INCOMPLETO; en validación de torneo → error de tamaño', () => {
  const d = filler(['Red', 'Green'], 49); eq(L.validateDeck(d, RS, byNumber).status, 'incomplete');
  const t = L.validateDeck(d, RS, byNumber, { tournament: true }); eq(t.status, 'illegal');
  hasError(t, 'deck_size', (e) => { eq(e.currentValue, 49); eq(e.allowedValue, 50); });
});
test('C · 51 cartas → ILEGAL (51 / 50)', () => {
  const r = L.validateDeck(filler(['Red', 'Green'], 51), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'deck_size', (e) => { eq(e.currentValue, 51); eq(e.allowedValue, 50); });
});
test('D · Rojo + Verde + Morado → ILEGAL (máx. 2 colores)', () => {
  const d = deckOf(filler(['Red', 'Green'], 46), filler(['Purple'], 4)); eq(total(d), 50);
  const r = L.validateDeck(d, RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'color_limit', (e) => { eq(e.currentValue, 3); eq(e.allowedValue, 2); eq(e.fixActions.length, 3); });
});
test('E · 5 copias de una carta normal → ILEGAL (5 / 4)', () => {
  const d = fill(['Red', 'Green'], 50, { 'ST03-011': 5 });
  const r = L.validateDeck(d, RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'copy_limit', (e) => { eq(e.cardNumbers[0], 'ST03-011'); eq(e.currentValue, 5); eq(e.allowedValue, 4); });
});
test('F · 1 Anksha GD01-020 → ILEGAL (baneada)', () => {
  const r = L.validateDeck(fill(['Blue', 'Red'], 50, { 'GD01-020': 1 }), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'banned_card', (e) => { eq(e.cardNumbers[0], 'GD01-020'); eq(e.allowedValue, 0); });
});
test('G · 2 Corsica Base ST02-016 → LEGAL', () => {
  const r = L.validateDeck(fill(['Blue', 'Red'], 50, { 'ST02-016': 2 }), RS, byNumber); eq(r.status, 'legal'); eq(r.errors.length, 0);
});
test('H · 3 Corsica Base → ILEGAL (restringida 3 / 2)', () => {
  const r = L.validateDeck(fill(['Blue', 'Red'], 50, { 'ST02-016': 3 }), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'restricted_card', (e) => { eq(e.currentValue, 3); eq(e.allowedValue, 2); });
});
test('4 Corsica Base también es ilegal, y 1 es legal', () => {
  eq(L.validateDeck(fill(['Blue', 'Red'], 50, { 'ST02-016': 4 }), RS, byNumber).status, 'illegal');
  eq(L.validateDeck(fill(['Blue', 'Red'], 50, { 'ST02-016': 1 }), RS, byNumber).status, 'legal');
});
test('I · Amuro ST01-010 + Mikazuki ST05-010 → ILEGAL (pareja prohibida)', () => {
  const r = L.validateDeck(fill(['Blue', 'Purple'], 50, { 'ST01-010': 1, 'ST05-010': 1 }), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'banned_pair', (e) => { eq(e.cardNumbers.join(), 'ST01-010,ST05-010'); eq(e.fixActions.length, 2); });
});
test('4 Amuro sin Mikazuki → LEGAL', () => {
  eq(L.validateDeck(fill(['Blue', 'Red'], 50, { 'ST01-010': 4 }), RS, byNumber).status, 'legal');
});
test('J · Guntank GD01-008 + M1 Astray Shrike GD05-015 → ILEGAL (pareja prohibida)', () => {
  const r = L.validateDeck(fill(['Blue', 'Red'], 50, { 'GD01-008': 1, 'GD05-015': 1 }), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'banned_pair', (e) => eq(e.cardNumbers.join(), 'GD01-008,GD05-015'));
});
test('K · 4 Jegan GD05-027 → LEGAL', () => {
  eq(L.validateDeck(fill(['Green', 'Red'], 50, { 'GD05-027': 4 }), RS, byNumber).status, 'legal');
});
test('L · 2 Jegan + 2 Ginn ST04-008 → ILEGAL (conflicto de grupo restringido)', () => {
  const r = L.validateDeck(fill(['Green', 'Red'], 50, { 'GD05-027': 2, 'ST04-008': 2 }), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'exclusive_group', (e) => { eq(e.cardNumbers.sort().join(), 'GD05-027,ST04-008'); eq(e.fixActions.length, 2); });
});
test('4 Ginn + 1 Zaku II GD01-035 → ILEGAL (no es un pool global de 4)', () => {
  const r = L.validateDeck(fill(['Green', 'Red'], 50, { 'ST04-008': 4, 'GD01-035': 1 }), RS, byNumber); eq(r.status, 'illegal');
  hasError(r, 'exclusive_group');
});
test('M · 4 Zaku II ST03-008 + 4 Jegan → LEGAL (ST03-008 tiene efecto: no es del grupo)', () => {
  eq(byNumber['ST03-008'].name.replace('Ⅱ', 'II'), 'Zaku II');
  const r = L.validateDeck(fill(['Green', 'Red'], 50, { 'ST03-008': 4, 'GD05-027': 4 }), RS, byNumber); eq(r.status, 'legal'); eq(r.errors.length, 0);
});

console.log('\nGrupo restringido: detección por características');
test('Las 22 Unidades listadas cumplen las características del grupo', () => {
  RS.exclusiveGroups[0].cardNumbers.forEach((n) => { if (!L.matchesCriteria(byNumber[n], RS.exclusiveGroups[0].criteria)) throw new Error(n + ' no cumple'); });
});
test('Cartas nuevas que cumplen las características (GD06) cuentan como miembros detectados', () => {
  const g = RS.exclusiveGroups[0], m = L.groupMembers(g, byNumber);
  const det = Object.keys(m.detected); if (!det.length) throw new Error('no se detectó ninguna');
  const r = L.validateDeck(fill(['Green', 'Red', 'Blue', 'White', 'Purple'].slice(0, 2), 50, { 'GD05-027': 2, [det[0]]: 2 }), RS, byNumber);
  hasError(r, 'exclusive_group', (e) => { if (!e.data.detected.includes(det[0])) throw new Error('no marcada como detectada'); });
});
test('Con detectByCriteria desactivado solo cuenta la lista oficial', () => {
  const off = JSON.parse(JSON.stringify(RS)); off.exclusiveGroups[0].detectByCriteria = false;
  const det = Object.keys(L.groupMembers(RS.exclusiveGroups[0], byNumber).detected)[0];
  eq(L.groupMembers(off.exclusiveGroups[0], byNumber).has(det), false);
});

console.log('\nInsignias de carta');
test('Insignias: BANNED, RESTRICTED 2, BANNED PAIR y RESTRICTED GROUP', () => {
  eq(L.cardRules('GD01-020', RS, byNumber)[0].kind, 'banned');
  const r = L.cardRules('ST02-016', RS, byNumber)[0]; eq(r.kind, 'restricted'); eq(r.max, 2);
  const p = L.cardRules('ST01-010', RS, byNumber)[0]; eq(p.kind, 'banned_pair'); eq(p.partner, 'ST05-010');
  eq(L.cardRules('GD05-027', RS, byNumber)[0].kind, 'exclusive_group');
  eq(L.cardRules('ST01-001', RS, byNumber).length, 0);
});

console.log('\nAñadir cartas (bloqueo proactivo)');
test('Corsica Base con 2 copias: no se puede añadir otra', () => {
  const r = L.maxAddable({ 'ST02-016': 2 }, 'ST02-016', 1, RS, byNumber); eq(r.max, 0); eq(r.blockedBy.ruleType, 'restricted_card');
});
test('Corsica Base con 1 copia: se puede añadir 1 más pero no 2', () => {
  const r = L.maxAddable({ 'ST02-016': 1 }, 'ST02-016', 3, RS, byNumber); eq(r.max, 1);
});
test('Carta baneada: nunca', () => { eq(L.maxAddable({}, 'GD01-020', 1, RS, byNumber).max, 0); });
test('Con Amuro en el mazo, Mikazuki no se puede añadir', () => {
  const r = L.maxAddable({ 'ST01-010': 1 }, 'ST05-010', 1, RS, byNumber); eq(r.max, 0); eq(r.blockedBy.ruleType, 'banned_pair');
});
test('Con Jegan en el mazo, Ginn está bloqueada pero otra Jegan no', () => {
  eq(L.maxAddable({ 'GD05-027': 1 }, 'ST04-008', 1, RS, byNumber).max, 0);
  eq(L.maxAddable({ 'GD05-027': 1 }, 'GD05-027', 4, RS, byNumber).max, 3);
});
test('Una quinta copia de una carta normal está bloqueada', () => { eq(L.maxAddable({ 'ST03-011': 4 }, 'ST03-011', 1, RS, byNumber).max, 0); });
test('Un tercer color está bloqueado', () => {
  const d = deckOf(filler(['Red'], 4), filler(['Green'], 4)); const purple = all.find((c) => c.color === 'Purple' && !ruleNumbers.has(c.number)).number;
  const r = L.maxAddable(d, purple, 1, RS, byNumber); eq(r.max, 0); eq(r.blockedBy.ruleType, 'color_limit');
});
test('Con 50 cartas no se puede añadir ninguna más', () => {
  const d = filler(['Red', 'Green'], 50), extra = all.find((c) => c.color === 'Red' && !d[c.number] && !ruleNumbers.has(c.number)).number;
  eq(L.maxAddable(d, extra, 1, RS, byNumber).blockedBy.ruleType, 'deck_size');
});
test('Se puede añadir con normalidad cuando no hay conflicto', () => { eq(L.maxAddable({}, 'ST01-001', 4, RS, byNumber).max, 4); });
test('Si el mazo ya tiene una pareja prohibida, no se añaden más copias de las cartas implicadas', () => {
  const d = { 'ST01-010': 1, 'ST05-010': 1 };
  eq(L.maxAddable(d, 'ST05-010', 1, RS, byNumber).max, 0); eq(L.maxAddable(d, 'ST01-010', 1, RS, byNumber).blockedBy.ruleType, 'banned_pair');
  eq(L.maxAddable(d, 'ST01-001', 1, RS, byNumber).max, 1);
});
test('Lo mismo con un conflicto de grupo restringido', () => {
  const d = { 'GD05-027': 2, 'ST04-008': 2 };
  eq(L.maxAddable(d, 'GD05-027', 1, RS, byNumber).max, 0); eq(L.maxAddable(d, 'ST04-008', 1, RS, byNumber).blockedBy.ruleType, 'exclusive_group');
});
test('Un mazo ya ilegal no bloquea cartas que no empeoran nada', () => {
  const d = { 'ST03-011': 5 }; eq(L.maxAddable(d, 'ST01-001', 2, RS, byNumber).max, 2);
});

console.log('\nAcciones de arreglo');
test('Quitar una de la pareja arregla el mazo', () => {
  const d = fill(['Blue', 'Purple'], 50, { 'ST01-010': 1, 'ST05-010': 1 });
  const r = L.validateDeck(d, RS, byNumber), fixed = L.applyFix(d, r.errors[0].fixActions[0]);
  eq(L.validateDeck(fixed, RS, byNumber).errors.length, 0); eq(total(d) - total(fixed), 1);
});
test('"Mantener Jegan" quita Ginn y deja el mazo sin conflicto de grupo', () => {
  const d = fill(['Green', 'Red'], 50, { 'GD05-027': 2, 'ST04-008': 2 });
  const e = L.validateDeck(d, RS, byNumber).errors.find((x) => x.ruleType === 'exclusive_group');
  const keep = e.fixActions.find((f) => f.keep === 'GD05-027'), fixed = L.applyFix(d, keep);
  eq(fixed['ST04-008'], undefined); eq(fixed['GD05-027'], 2); eq(d['ST04-008'], 2, 'el mazo original no debe mutar');
});
test('"Quitar sobrantes" deja la carta en su máximo', () => {
  const d = fill(['Blue', 'Red'], 50, { 'ST02-016': 3 });
  const fixed = L.applyFix(d, L.validateDeck(d, RS, byNumber).errors.find((x) => x.ruleType === 'restricted_card').fixActions[0]);
  eq(fixed['ST02-016'], 2);
});
test('Quitar un color entero deja 2 colores', () => {
  const d = deckOf(filler(['Red', 'Green'], 46), filler(['Purple'], 4));
  const fix = L.validateDeck(d, RS, byNumber).errors[0].fixActions.find((f) => f.color === 'Purple');
  eq(L.validateDeck(L.applyFix(d, fix), RS, byNumber).errors.length, 0);
});

console.log('\nInsignias según el mazo');
const kinds = (n, deck) => L.activeRules(n, deck, RS, byNumber).map((r) => r.kind);
test('Pareja prohibida: sin la otra carta en el mazo no hay insignia', () => {
  eq(kinds('ST01-010', {}).length, 0);
  eq(kinds('ST01-010', { 'ST01-010': 2 }).length, 0);
});
test('Pareja prohibida: aparece cuando la pareja ya está en el mazo', () => {
  eq(kinds('ST05-010', { 'ST01-010': 1 })[0], 'banned_pair');
  eq(kinds('ST01-010', { 'ST05-010': 3 })[0], 'banned_pair');
});
test('Grupo exclusivo: sin otra carta del grupo no hay insignia; con otra sí', () => {
  const [a, b] = RS.exclusiveGroups[0].cardNumbers;
  eq(kinds(a, {}).length, 0);
  eq(kinds(a, { [a]: 2 }).length, 0);
  eq(kinds(a, { [b]: 1 })[0], 'exclusive_group');
  eq(kinds(b, { [a]: 1, [b]: 1 })[0], 'exclusive_group');
});
test('Prohibida y restringida se muestran siempre', () => {
  eq(kinds('GD01-020', {})[0], 'banned');
  eq(kinds('ST02-016', {})[0], 'restricted');
});
test('Una carta con cantidad 0 en el mazo no cuenta como presente', () => {
  eq(kinds('ST05-010', { 'ST01-010': 0 }).length, 0);
});

console.log('\nRulesets');
test('getActiveRuleset elige la regla vigente por fecha', () => {
  eq(L.getActiveRuleset(rulesets, '2026-10-23', 'EN').id, 'gcg-global-2026-09-25');
  eq(L.getActiveRuleset(rulesets, '2026-09-25', 'EN').id, 'gcg-global-2026-09-25');
});
test('Todas las cartas de las reglas existen en la base', () => {
  const nums = []; RS.bannedCards.forEach((r) => nums.push(r.cardNumber)); RS.restrictedCards.forEach((r) => nums.push(r.cardNumber));
  RS.bannedPairs.forEach((p) => nums.push(p.cardA, p.cardB)); RS.exclusiveGroups.forEach((g) => nums.push(...g.cardNumbers));
  const missing = nums.filter((n) => !byNumber[n]); if (missing.length) throw new Error('faltan: ' + missing.join(', '));
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
process.exit(failed ? 1 : 0);
