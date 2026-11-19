/* Lógica pura de la franja proporcional y de la concentración del meta (comp_stats.js): metaStrip y metaDiversity.  Uso: node tests/meta_visual.test.js */
const S = require('../comp_stats.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= (tol || 1e-9), (m || 'valor') + ': ' + a + ' ≠ ' + b);

// presencia: puestos por arquetipo → { n, rows:[{archetype, lists, pct}] } ordenada de mayor a menor
const P = S.presenceFromCounts({ A: 40, B: 25, C: 15, D: 8, E: 6, F: 4, G: 2 });

console.log('\n== metaStrip: los N primeros arquetipos y el resto agrupado ==');
test('devuelve los N primeros en orden y un «resto» con los demás', () => {
  const s = S.metaStrip(P, 4);
  ok(s.items.length === 4 && s.items.map((x) => x.archetype).join('') === 'ABCD', s.items.map((x) => x.archetype).join(''));
  ok(s.rest.count === 3 && s.rest.lists === 12, JSON.stringify(s.rest)); near(s.rest.pct, 12, 1e-9, 'resto');
});
test('los porcentajes (partes + resto) suman 100 y cada parte coincide con su presencia', () => {
  const s = S.metaStrip(P, 4);
  near(s.items.reduce((t, x) => t + x.pct, 0) + s.rest.pct, 100, 1e-9, 'suma');
  s.items.forEach((x) => near(x.pct, P.rows.find((r) => r.archetype === x.archetype).pct, 1e-9, x.archetype));
});
test('si hay N o menos arquetipos no hay resto', () => {
  const s = S.metaStrip(P, 10); ok(s.items.length === 7 && s.rest.count === 0 && s.rest.pct === 0 && s.rest.lists === 0, JSON.stringify(s.rest));
});
test('sin datos: vacío y sin fallar', () => {
  [S.metaStrip(null, 5), S.metaStrip({ n: 0, rows: [] }, 5), S.metaStrip(undefined)].forEach((s) => ok(s.items.length === 0 && s.rest.count === 0 && s.rest.pct === 0));
});
test('N inválido (0, negativo, no numérico) usa 1 y nunca devuelve más de los que hay', () => {
  [0, -3, NaN, 'x'].forEach((n) => ok(S.metaStrip(P, n).items.length >= 1 && S.metaStrip(P, n).items.length <= 7));
});
test('no modifica la presencia recibida', () => {
  const copy = JSON.stringify(P); S.metaStrip(P, 3); ok(JSON.stringify(P) === copy);
});

console.log('\n== metaDiversity: cuántos arquetipos hacen falta para el 80 % de los puestos ==');
test('cuenta los arquetipos necesarios para llegar al umbral (40+25+15 = 80 → 3)', () => {
  const d = S.metaDiversity(P, 80); ok(d.count === 3 && d.total === 7 && d.target === 80, JSON.stringify(d)); near(d.pct, 80, 1e-9, 'acumulado');
});
test('el umbral se alcanza «o se supera»: con 85 hacen falta 4 (acumulado 88)', () => {
  const d = S.metaDiversity(P, 85); ok(d.count === 4, JSON.stringify(d)); near(d.pct, 88, 1e-9);
});
test('por defecto el umbral es 80 y con 100 hacen falta todos', () => {
  ok(S.metaDiversity(P).count === 3 && S.metaDiversity(P).target === 80); ok(S.metaDiversity(P, 100).count === 7);
});
test('un meta muy concentrado necesita pocos; uno parejo, muchos', () => {
  const conc = S.presenceFromCounts({ A: 90, B: 5, C: 5 }), flat = S.presenceFromCounts({ A: 10, B: 10, C: 10, D: 10, E: 10, F: 10, G: 10, H: 10, I: 10, J: 10 });
  ok(S.metaDiversity(conc, 80).count === 1 && S.metaDiversity(flat, 80).count === 8);
});
test('sin datos: cero y sin fallar; umbral inválido vuelve a 80', () => {
  ok(S.metaDiversity(null).count === 0 && S.metaDiversity({ n: 0, rows: [] }).count === 0);
  ok(S.metaDiversity(P, 0).target === 80 && S.metaDiversity(P, 150).target === 80 && S.metaDiversity(P, 'x').target === 80);
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
