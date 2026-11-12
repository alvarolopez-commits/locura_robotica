/* «Crear desde mi colección»: reglas de Link (meta.js) y de selección y búsqueda de listas (comp_stats.js). Sin DOM.  Uso: node tests/desde_coleccion.test.js */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');
const M = require('../meta.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };

const ALL = []; fs.readdirSync(path.join(__dirname, '..', 'data')).filter((f) => /^(ST|GD|EB)\d+\.json$/.test(f)).forEach((f) => { const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8')); (Array.isArray(j) ? j : j.cards).forEach((c) => ALL.push(c)); });
const byNum = {}; ALL.forEach((c) => { byNum[c.number] = c; });
const U = (name, link) => ({ number: 'T-U', name, type: 'UNIT', link, trait: '' });
const P = (name, trait) => ({ number: 'T-P', name, type: 'PILOT', link: '-', trait: trait || '' });

console.log('\n== Link: por nombre y por rasgo (meta.js) ==');
test('por nombre: la Unidad con [Amuro Ray] enlaza con el Piloto Amuro Ray, sin importar mayúsculas', () => { eq(M.linkMatch(U('Gundam', '[Amuro Ray]'), P('Amuro Ray')), 'name'); eq(M.linkMatch(U('Gundam', '[amuro ray]'), P('AMURO RAY')), 'name'); });
test('por rasgo: «(Earth Federation) Trait» enlaza con un Piloto que tiene ese rasgo', () => { eq(M.linkMatch(U('X', '(Earth Federation) Trait'), P('Alguien', '(Earth Federation) (Support)')), 'trait'); });
test('si coinciden nombre y rasgo gana el nombre (Link directo)', () => { eq(M.linkMatch(U('X', '[Alguien] / (Zeon) Trait'), P('Alguien', '(Zeon)')), 'name'); });
test('FALSO POSITIVO nombre: «Banagher» no es «Banagher Links» ni al revés', () => { eq(M.linkMatch(U('X', '[Banagher Links]'), P('Banagher')), null); eq(M.linkMatch(U('X', '[Banagher]'), P('Banagher Links')), null); });
test('FALSO POSITIVO rasgo: un rasgo parecido no cuenta (solo igualdad exacta)', () => { eq(M.linkMatch(U('X', '(Earth Federation) Trait'), P('A', '(Earth Federation Forces)')), null); eq(M.linkMatch(U('X', '(White Base Team) Trait'), P('A', '(White Base)')), null); });
test('el nombre del Piloto no cuenta como rasgo y el rasgo no cuenta como nombre', () => { eq(M.linkMatch(U('X', '(Zeon) Trait'), P('Zeon', '')), null); eq(M.linkMatch(U('X', '[Zeon]'), P('Otro', '(Zeon)')), null); });
test('sin Link («-» o vacío) no hay compatibilidad; solo Unidad con Piloto', () => {
  eq(M.linkMatch(U('X', '-'), P('A', '(Zeon)')), null); eq(M.linkMatch(U('X', ''), P('A')), null); eq(M.linkMatch(U('X', undefined), P('A')), null);
  eq(M.linkMatch({ type: 'COMMAND', link: '[A]', name: 'c' }, P('A')), null); eq(M.linkMatch(U('X', '[A]'), { type: 'UNIT', name: 'A', trait: '' }), null);
});
test('varios requisitos separados por « / »: vale cualquiera', () => { const u = U('X', '[A] / [B] / (T) Trait'); eq(M.linkMatch(u, P('B')), 'name'); eq(M.linkMatch(u, P('C', '(T)')), 'trait'); eq(M.linkMatch(u, P('C', '(Q)')), null); });
test('catálogo real: Gundam (GD01-001) enlaza con Amuro Ray y no con otro Piloto cualquiera', () => {
  const amuro = ALL.find((c) => c.type === 'PILOT' && c.name === 'Amuro Ray'); ok(amuro, 'el catálogo no trae a Amuro Ray');
  eq(M.linkMatch(byNum['GD01-001'], amuro), 'name'); eq(M.linkMatch(byNum['GD01-001'], byNum['GD01-088']), null);
});
test('linkUnitsFor: solo Unidades con enlace confirmado; por nombre primero, luego por rasgo; sin repetir', () => {
  const pil = P('Amuro Ray', '(Earth Federation) (White Base Team)'), units = [U('t1', '(Earth Federation) Trait'), U('n1', '[Amuro Ray]'), U('sin', '-'), U('otro', '[Otro]'), U('t0', '(White Base Team) Trait')];
  units.forEach((u, i) => { u.number = 'U' + i; });
  const r = M.linkUnitsFor(pil, units); eq(r.map((x) => [x.unit.name, x.via]), [['n1', 'name'], ['t1', 'trait'], ['t0', 'trait']], 'orden: nombre, luego rasgo (por código)');
  eq(r.find((x) => x.unit.name === 't1').trait, 'Earth Federation');
});
test('detectPackages conserva su comportamiento (misma cantidad de paquetes de enlace)', () => {
  const cardMap = { 'U1': { type: 'UNIT', name: 'G', link: '[A R]', trait: '' }, 'P1': { type: 'PILOT', name: 'A R', trait: '(X)', link: '-' }, 'P2': { type: 'PILOT', name: 'Z', trait: '', link: '-' } };
  const out = M.detectPackages({ U1: 1, P1: 1, P2: 1 }, cardMap).filter((p) => p.reason === 'link'); eq(out.map((p) => p.cards), [['U1', 'P1']]);
});

console.log('\n== Selección de 1–3 cartas con prioridad (comp_stats.js) ==');
test('se añade con la prioridad indicada y se quita al repetir; el orden de elección se conserva', () => {
  let r = S.toggleCriterion([], 'A', 'must'); eq(r.sel, [{ n: 'A', prio: 'must' }]); eq(r.blocked, false);
  r = S.toggleCriterion(r.sel, 'B', 'want'); eq(r.sel.map((x) => x.n + x.prio), ['Amust', 'Bwant']);
  r = S.toggleCriterion(r.sel, 'A', 'must'); eq(r.sel.map((x) => x.n), ['B']);
});
test('la cuarta carta se rechaza SIN borrar nada y lo indica', () => {
  let sel = []; ['A', 'B', 'C'].forEach((n) => { sel = S.toggleCriterion(sel, n, 'must').sel; });
  const r = S.toggleCriterion(sel, 'D', 'must'); eq(r.blocked, true); eq(r.sel.map((x) => x.n), ['A', 'B', 'C']);
  eq(S.toggleCriterion(sel, 'B', 'must').blocked, false, 'quitar una ya elegida nunca se bloquea');
});
test('cambiar la prioridad solo toca esa carta; una carta que no está se ignora', () => {
  const sel = [{ n: 'A', prio: 'must' }, { n: 'B', prio: 'want' }];
  eq(S.setCriterionPrio(sel, 'B', 'must').map((x) => x.prio), ['must', 'must']); eq(S.setCriterionPrio(sel, 'Z', 'must'), sel); eq(S.setCriterionPrio(sel, 'A', 'rara'), sel, 'prioridad no válida: no cambia');
  ok(sel[1].prio === 'want', 'no debe mutar la entrada');
});
test('serializa y recupera la selección para la URL (códigos y prioridad; máximo 3; sin repetidos)', () => {
  const sel = [{ n: 'GD01-087', prio: 'must' }, { n: 'GD01-001', prio: 'want' }]; const s = S.criteriaToString(sel);
  eq(s, 'GD01-087.m,GD01-001.w'); eq(S.criteriaFromString(s), sel);
  eq(S.criteriaFromString('A.m,A.w,B.m,C.m,D.m,,x').map((x) => x.n), ['A', 'B', 'C'], 'sin repetidos y con tope de 3'); eq(S.criteriaFromString(''), []); eq(S.criteriaFromString(null), []);
});

console.log('\n== Buscar listas completas: exactas, deseadas, parciales (comp_stats.js) ==');
const L = (key, cards, date) => ({ key, cards, date });
const lists = [
  L('l1', { A: 4, B: 2, C: 1 }, '2026-11-01'), L('l2', { A: 4, B: 2 }, '2026-11-05'), L('l3', { A: 2, C: 3 }, '2026-11-03'), L('l4', { B: 4, C: 2, D: 1 }, '2026-10-20'),
  L('l5', { A: 4, B: 3, C: 2, D: 2 }, ''), L('l6', { Z: 4 }, '2026-11-09'),
];
test('exactas: solo las listas con TODAS las imprescindibles, comparando por código exacto', () => {
  const r = S.matchLists(lists, [{ n: 'A', prio: 'must' }, { n: 'B', prio: 'must' }]); eq(r.exact.map((x) => x.key), ['l2', 'l1', 'l5'], 'por fecha, la más reciente primero; sin fecha al final');
  eq(S.matchLists(lists, [{ n: 'A', prio: 'must' }]).exact.map((x) => x.key), ['l2', 'l3', 'l1', 'l5']);
});
test('la comparación es por código: «A» no coincide con «AB» ni con un nombre parecido', () => { eq(S.matchLists([L('x', { AB: 4 }, '2026-11-01')], [{ n: 'A', prio: 'must' }]).exact, []); });
test('dentro de las exactas, primero las que incluyen más cartas deseadas y después por fecha', () => {
  const r = S.matchLists(lists, [{ n: 'A', prio: 'must' }, { n: 'B', prio: 'want' }, { n: 'C', prio: 'want' }]);
  eq(r.exact.map((x) => x.key), ['l1', 'l5', 'l2', 'l3'], 'l1 y l5 traen B y C; l2 y l3 solo una'); eq(r.exact[0].wantHit, 2); eq(r.exact[2].wantHit, 1);
});
test('las deseadas NO excluyen: una lista sin ninguna deseada sigue siendo exacta si trae las imprescindibles', () => { eq(S.matchLists(lists, [{ n: 'A', prio: 'must' }, { n: 'D', prio: 'want' }]).exact.map((x) => x.key), ['l5', 'l2', 'l3', 'l1']); });
test('solo deseadas (sin imprescindibles): salen las listas que traen alguna, no todas', () => { eq(S.matchLists(lists, [{ n: 'D', prio: 'want' }]).exact.map((x) => x.key), ['l4', 'l5']); });
test('si ninguna cumple todas las imprescindibles, exact queda vacío y NO se relaja en silencio; la parcial se ofrece aparte', () => {
  const r = S.matchLists(lists, [{ n: 'A', prio: 'must' }, { n: 'Z', prio: 'must' }]); eq(r.exact, []); ok(r.partial.length >= 1);
  eq(r.partial[0].key, 'l6', 'misma cobertura (1 imprescindible): manda la fecha más reciente'); ok(r.partial.every((x) => x.mustHit < x.mustTotal && x.mustHit + x.wantHit > 0));
});
test('parcial: dice qué cartas coinciden y cuáles faltan, y ordena por imprescindibles cubiertas, deseadas y fecha', () => {
  const r = S.matchLists(lists, [{ n: 'A', prio: 'must' }, { n: 'C', prio: 'must' }, { n: 'D', prio: 'must' }]);
  eq(r.exact.map((x) => x.key), ['l5']); const p = r.partial; eq(p.map((x) => x.key), ['l3', 'l1', 'l4', 'l2'], '2 imprescindibles cubiertas primero (por fecha), luego 1'); const l4 = p.find((x) => x.key === 'l4'); eq(l4.hit, ['C', 'D']); eq(l4.miss, ['A']);
});
test('sin criterios o con criterios que no existen en ninguna lista: no sale nada (nada se inventa)', () => { eq(S.matchLists(lists, []), { exact: [], partial: [] }); const r = S.matchLists(lists, [{ n: 'Q', prio: 'must' }]); eq(r.exact, []); eq(r.partial, []); });
test('deduplica por clave: la misma lista repetida sale una vez', () => { eq(S.matchLists(lists.concat([L('l2', { A: 4, B: 2 }, '2026-11-05')]), [{ n: 'A', prio: 'must' }]).exact.filter((x) => x.key === 'l2').length, 1); });
test('no modifica las listas ni los criterios recibidos', () => {
  const l = JSON.stringify(lists), c = [{ n: 'A', prio: 'must' }, { n: 'B', prio: 'want' }], cs = JSON.stringify(c); S.matchLists(lists, c); eq(JSON.stringify(lists), l); eq(JSON.stringify(c), cs);
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
