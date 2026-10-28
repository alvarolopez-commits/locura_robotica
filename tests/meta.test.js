/* Pruebas del motor de comparación con el meta (COMPARAR). Ejecutar:  node tests/meta.test.js */
const fs = require('fs');
const path = require('path');
const M = require('../meta.js');

let passed = 0, failed = 0, skipped = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function skip(name, why) { skipped++; console.log('  SKIP ' + name + ' (' + why + ')'); }
function eq(actual, expected, msg) { if (actual !== expected) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(actual)); }
function ok(cond, msg) { if (!cond) throw new Error(msg || 'condición falsa'); }
function near(actual, expected, msg) { if (Math.abs(actual - expected) > 1e-9) throw new Error((msg || 'valor') + ': esperado ' + expected + ' y salió ' + actual); }

// ---- catálogo mínimo y perfiles sintéticos ----
const cardMap = {
  'ST11-001': { number: 'ST11-001', name: 'Char Aznable', type: 'PILOT', color: 'Red', set: 'ST11', lv: 3, cost: 1, tags: [], trait: '(Zeon) (Newtype)', link: '-' },
  'ST11-002': { number: 'ST11-002', name: "Char's Zaku II", type: 'UNIT', color: 'Red', set: 'ST11', lv: 3, cost: 2, tags: ['damage'], trait: '(Zeon)', link: '[Char Aznable]' },
  'ST11-003': { number: 'ST11-003', name: 'Zaku Rara', type: 'UNIT', color: 'Red', set: 'ST11', lv: 5, cost: 4, tags: [], trait: '(Zeon)', link: '[Rara Pilot]' },
  'ST11-004': { number: 'ST11-004', name: 'Rara Pilot', type: 'PILOT', color: 'Red', set: 'ST11', lv: 2, cost: 1, tags: [], trait: '(Zeon)', link: '-' },
  'ST11-005': { number: 'ST11-005', name: 'Comando', type: 'COMMAND', color: 'Red', set: 'ST11', lv: 2, cost: 2, tags: [], trait: '-', link: '-' },
  'GD01-001': { number: 'GD01-001', name: 'Unidad Azul', type: 'UNIT', color: 'Blue', set: 'GD01', lv: 4, cost: 3, tags: [], trait: '(Earth Federation)', link: '-' },
  'GD01-002': { number: 'GD01-002', name: 'Unidad Azul 2', type: 'UNIT', color: 'Blue', set: 'GD01', lv: 5, cost: 4, tags: [], trait: '(Earth Federation)', link: '-' },
  'GD06-001': { number: 'GD06-001', name: 'Carta nueva', type: 'UNIT', color: 'Red', set: 'GD06', lv: 3, cost: 2, tags: [], trait: '(Zeon)', link: '-' },
};
const setDates = { GD06: { releaseDate: '2026-10-30' }, ST11: { releaseDate: '2026-02-01' }, GD01: { releaseDate: '2025-07-01' } };
const SNAP = '2026-10-23';
const redA = { id: 'red-a', name: 'R Aggro', colors: ['R'], deckCount: 120, cutoff: 0.31, sourceUrl: 'u1', cards: {
  'ST11-001': { adoption: 0.91, avgCopies: 3.9 }, 'ST11-002': { adoption: 0.8, avgCopies: 3.5 }, 'ST11-005': { adoption: 0.55, avgCopies: 2.2 }, 'ST11-003': { adoption: 0.12, avgCopies: 1.1 } } };
const blueB = { id: 'blue-b', name: 'B Control', colors: ['B'], deckCount: 300, cutoff: 0.3, sourceUrl: 'u2', cards: {
  'GD01-001': { adoption: 0.9, avgCopies: 3.8 }, 'GD01-002': { adoption: 0.7, avgCopies: 3 } } };
const tiny = { id: 'tiny', name: 'Raro', colors: ['R'], deckCount: 6, cutoff: 0.5, cards: { 'ST11-001': { adoption: 1, avgCopies: 4 } } };
const meta = { snapshot: { id: SNAP, dataDate: SNAP, windowLabel: 'Aug 3 – Oct 25, 2026 (12 weeks)' }, archetypes: [redA, blueB] };
const opts = (extra) => Object.assign({ meta: meta, cardMap: cardMap, setDates: setDates }, extra || {});

console.log('Evidencia, umbrales y similitud');
test('umbrales por defecto del diseño', () => {
  eq(M.DEFAULTS.roleCore, 0.75); eq(M.DEFAULTS.roleCommon, 0.5); eq(M.DEFAULTS.roleFlex, 0.2); eq(M.DEFAULTS.clearArchetype, 0.25);
});
test('evidenceLevel respeta los cortes', () => {
  [[100, 'high'], [99, 'medium'], [30, 'medium'], [29, 'low'], [10, 'low'], [9, 'insufficient'], [0, 'insufficient']].forEach((p) => eq(M.evidenceLevel(p[0]), p[1], 'deckCount ' + p[0]));
});
test('un mazo igual al perfil (adopción 1, copias redondeadas) es muy parecido', () => {
  const perfil = { cards: { A: { adoption: 1, avgCopies: 3.97 }, B: { adoption: 1, avgCopies: 2.1 }, C: { adoption: 1, avgCopies: 1.2 } } };
  const s = M.similarity({ A: 4, B: 2, C: 1 }, perfil);
  ok(s.value > 0.9, 'similitud ' + s.value); near(s.coverage, 1);
});
test('un mazo con las copias habituales de cartas de adopción alta sale claramente por encima del umbral de arquetipo claro', () => {
  const s = M.similarity({ 'ST11-001': 4, 'ST11-002': 4, 'ST11-005': 2, 'ST11-003': 1 }, redA);
  ok(s.value > M.DEFAULTS.clearArchetype, 'similitud ' + s.value);
});
test('un mazo sin cartas del perfil da 0', () => {
  const s = M.similarity({ 'GD01-001': 4 }, redA);
  eq(s.value, 0); eq(s.coverage, 0);
});
test('la cantidad importa', () => {
  const p = { cards: { A: { adoption: 0.9, avgCopies: 3.9 } } };
  const uno = M.similarity({ A: 1 }, p).value, cuatro = M.similarity({ A: 4 }, p).value;
  ok(uno > 0 && uno < cuatro, uno + ' < ' + cuatro);
});
test('perfil vacío, sin listas o con una carta: sin NaN ni división por cero', () => {
  [{}, { deckCount: 0, cards: {} }, { deckCount: 0 }, { cards: { A: { adoption: 0, avgCopies: 0 } } }].forEach((p) => {
    const s = M.similarity({ A: 2 }, p);
    eq(s.value, 0); ok(Number.isFinite(s.coverage));
  });
  eq(M.similarity({}, redA).value, 0);
  ok(Number.isFinite(M.similarity({ A: 1 }, { cards: { A: { adoption: 0.5, avgCopies: 2 } } }).value));
});

console.log('Ranking y perfiles combinados');
test('rankArchetypes pone el mejor primero (máx. 4)', () => {
  const many = [redA, blueB, tiny, Object.assign({}, redA, { id: 'c' }), Object.assign({}, blueB, { id: 'd' }), Object.assign({}, blueB, { id: 'e' })];
  const r = M.rankArchetypes({ 'GD01-001': 4, 'GD01-002': 3 }, many);
  eq(r.top[0].archetypeId, 'blue-b'); ok(r.top.length <= 4, 'top ' + r.top.length);
  for (let i = 1; i < r.top.length; i++) ok(r.top[i - 1].similarity >= r.top[i].similarity, 'orden descendente');
});
test('el desempate por id es estable y el orden no depende de la entrada', () => {
  const a = Object.assign({}, blueB, { id: 'a' }), b = Object.assign({}, blueB, { id: 'b' });
  eq(M.rankArchetypes({ 'GD01-001': 4 }, [b, a]).top[0].archetypeId, 'a');
  eq(M.rankArchetypes({ 'GD01-001': 4 }, [a, b]).top[0].archetypeId, 'a');
});
test('clear es false si el mejor no llega al 25 %', () => {
  const r = M.rankArchetypes({ 'ZZ-1': 4 }, [redA, blueB]);
  eq(r.clear, false);
  eq(M.rankArchetypes({}, []).clear, false);
});
test('mergeProfiles pondera por listas', () => {
  const a = { deckCount: 100, cards: { A: { adoption: 1, avgCopies: 4 } } }, b = { deckCount: 300, cards: {} };
  const m = M.mergeProfiles([a, b], 'x', 'x');
  near(m.cards.A.adoption, 0.25); near(m.cards.A.avgCopies, 4); eq(m.deckCount, 400);
});
test('mergeProfiles: copias medias ponderadas solo por las listas que llevan la carta', () => {
  const a = { deckCount: 100, cards: { A: { adoption: 1, avgCopies: 4 } } }, b = { deckCount: 100, cards: { A: { adoption: 1, avgCopies: 2 } } };
  near(M.mergeProfiles([a, b], 'x', 'x').cards.A.avgCopies, 3);
});
test('globalAdoption de todo el meta', () => {
  const g = M.globalAdoption([redA, blueB]);
  near(g['GD01-001'], 0.9 * 300 / 420); ok(g['ST11-001'] > 0);
});

console.log('Roles por carta');
const ctx = (archetype) => ({ archetype: archetype, cardMap: cardMap, setDates: setDates, snapshotDate: SNAP });
test('core / common / flex / flex_low según la adopción', () => {
  eq(M.roleOf('ST11-001', ctx(redA)).role, 'core');
  eq(M.roleOf('ST11-005', ctx(redA)).role, 'common');
  eq(M.roleOf('ST11-003', ctx(redA)).role, 'flex_low');
  eq(M.roleOf('ST11-002', ctx(Object.assign({}, redA, { cards: { 'ST11-002': { adoption: 0.3, avgCopies: 2 } } }))).role, 'flex');
});
test('Test D: una carta de un set posterior al snapshot es NEW y nunca off-meta', () => {
  const r = M.roleOf('GD06-001', ctx(redA));
  eq(r.role, 'new'); eq(r.adoption, null);
});
test('evidencia insuficiente da insufficient_data', () => {
  eq(M.roleOf('ST11-001', ctx(tiny)).role, 'insufficient_data');
});
test('carta fuera del perfil es off_meta con cota, no con un porcentaje inventado', () => {
  const r = M.roleOf('GD01-001', ctx(redA));
  eq(r.role, 'off_meta'); eq(r.adoption, null); eq(r.upperBound, 0.31);
});
test('el set con fecha ausente no se trata como nuevo', () => {
  eq(M.roleOf('GD01-001', Object.assign(ctx(redA), { setDates: {} })).role, 'off_meta');
});

console.log('Compare');
test('Test E: carta con 91 % que no llevas sale en missingCommon', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-002': 4 } }, { type: 'archetype', archetypeId: 'red-a' }, opts());
  const m = r.missingCommon.find((x) => x.number === 'ST11-001');
  ok(m, 'falta ST11-001'); eq(m.adoption, 0.91); eq(m.avgCopies, 3.9); eq(m.userCopies, 0);
});
test('Test F: 3 copias de una carta de 3,9 de media es core y no es un error', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-001': 3 } }, { type: 'archetype', archetypeId: 'red-a' }, opts());
  const c = r.cardAnalysis.find((x) => x.number === 'ST11-001');
  eq(c.userCopies, 3); eq(c.avgCopies, 3.9); eq(c.role, 'core');
  ok(!/illegal|error/i.test(JSON.stringify(r)), 'no debe aparecer ningún término de error');
});
test('Test C: Unidad rara + su Piloto fuera del perfil forman un paquete y no se recomienda quitar nada', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-001': 4, 'ST11-003': 2, 'ST11-004': 2 } }, { type: 'archetype', archetypeId: 'red-a' }, opts());
  ok(r.packages.length >= 1, 'paquetes');
  const pk = r.unusual.filter((u) => u.number === 'ST11-003' || u.number === 'ST11-004');
  eq(pk.length, 2); ok(pk.every((u) => u.packageId), 'packageId');
  ok(!/"(remove|cut|recommend\w*)"/.test(JSON.stringify(r)), 'no debe haber claves de recomendación');
});
test('Test B: un mazo mixto no se fuerza a un solo arquetipo', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-001': 4, 'ST11-002': 4, 'GD01-001': 4, 'GD01-002': 3 } }, { type: 'closest' }, opts());
  ok(r.ranking.top.length >= 2, 'candidatos');
  const t = r.ranking.top; ok(t[0].similarity > 0 && t[1].similarity > 0, 'ambos puntúan');
});
test('closest sin arquetipo claro marca el estado no_clear', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-004': 4 } }, { type: 'closest' }, opts());
  eq(r.state, 'no_clear');
});
test('Review Focus 1: números que ya no existen se ignoran y se informan', () => {
  const r = M.compare({ name: 'x', cards: { 'ZZ99-999': 4, 'ST11-001': 4 } }, { type: 'closest' }, opts());
  eq(JSON.stringify(r.ignoredCards), JSON.stringify(['ZZ99-999']));
});
test('Review Focus 4 y Test H: carta de GD06 abre el aviso de frontera y no se mezcla con datos', () => {
  const r = M.compare({ name: 'x', cards: { 'GD06-001': 2, 'ST11-001': 4 } }, { type: 'archetype', archetypeId: 'red-a' }, opts());
  eq(r.boundary.crossed, true); eq(r.boundary.sets[0], 'GD06');
  const c = r.cardAnalysis.find((x) => x.number === 'GD06-001');
  eq(c.role, 'new'); eq(c.adoption, null);
  ok(!r.missingCommon.some((m) => m.number === 'GD06-001'), 'no debe faltar una carta nueva');
});
test('Review Focus 2: sin datos no lanza y devuelve no_data', () => {
  [{ snapshot: null, archetypes: [] }, null, {}].forEach((m) => {
    const r = M.compare({ name: 'x', cards: { 'ST11-001': 4 } }, { type: 'closest' }, { meta: m, cardMap: cardMap, setDates: setDates });
    eq(r.state, 'no_data');
  });
});
test('composition: sin cartas del tipo en el perfil el valor del meta es null, no 0', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-001': 4, 'ST11-002': 4 } }, { type: 'archetype', archetypeId: 'blue-b' }, opts());
  eq(r.composition.find((c) => c.key === 'pilots').meta, null);
  ok(r.composition.find((c) => c.key === 'units').meta > 0, 'unidades del perfil');
});
test('modo colors: mismo par de colores, y monocolor usa los que contienen ese color', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-001': 4, 'ST11-002': 4 } }, { type: 'colors' }, opts());
  eq(r.selected.id, 'colors:R'); eq(r.selected.deckCount, 120);
  const rb = M.compare({ name: 'x', cards: { 'GD01-001': 4 } }, { type: 'colors' }, opts());
  eq(rb.selected.deckCount, 300);
});
test('modo all usa todo el meta', () => {
  const r = M.compare({ name: 'x', cards: { 'ST11-001': 4 } }, { type: 'all' }, opts());
  eq(r.selected.deckCount, 420);
});
test('mazo vacío: no lanza', () => {
  const r = M.compare({ name: 'x', cards: {} }, { type: 'closest' }, opts());
  ok(r && Array.isArray(r.cardAnalysis));
});
test('es determinista', () => {
  const d = { name: 'x', cards: { 'ST11-001': 4, 'ST11-002': 3, 'GD01-001': 2 } };
  eq(JSON.stringify(M.compare(d, { type: 'closest' }, opts())), JSON.stringify(M.compare(d, { type: 'closest' }, opts())));
});

console.log('Datos reales');
const realMeta = path.join(__dirname, '..', 'data', 'meta.json');
if (!fs.existsSync(realMeta)) {
  skip('Test A: la lista de ejemplo de un arquetipo real es su propio primer candidato', 'aún no existe data/meta.json (ejecuta scripts/scrape_meta.py)');
} else {
  test('Test A: la lista de ejemplo de un arquetipo real es su propio primer candidato', () => {
    const real = JSON.parse(fs.readFileSync(realMeta, 'utf8')), all = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'all_cards.json'), 'utf8'));
    const cm = {}; all.forEach((c) => { cm[c.number] = c; });
    const withSample = real.archetypes.filter((a) => a.sampleDecks && a.sampleDecks.length && a.deckCount >= 30);
    ok(withSample.length > 0, 'ningún arquetipo trae lista de ejemplo');
    let hits = 0;
    withSample.forEach((a) => { if (M.rankArchetypes(a.sampleDecks[0].cards, real.archetypes).top[0].archetypeId === a.id) hits++; });
    ok(hits / withSample.length >= 0.7, hits + '/' + withSample.length + ' listas de ejemplo caen en su propio arquetipo');
  });
}

console.log('\n' + passed + ' pasan · ' + failed + ' fallan' + (skipped ? ' · ' + skipped + ' omitidas' : ''));
process.exit(failed ? 1 : 0);
