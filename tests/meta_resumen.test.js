/* Resumen del meta: cifras, cuota por color, cartas más usadas y podio de un torneo (comp_stats.js). Sin DOM.  Uso: node tests/meta_resumen.test.js */
const S = require('../comp_stats.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };
const near = (a, b, m) => { if (Math.abs(a - b) > 1e-9) throw new Error((m || 'valor') + ': esperado ' + b + ' y salió ' + a); };

console.log('\n== cifras del resumen ==');
test('listas, arquetipos y cuota del top 3 salen de la presencia', () => {
  const p = { n: 10, rows: [{ archetype: 'A', lists: 4, pct: 40 }, { archetype: 'B', lists: 3, pct: 30 }, { archetype: 'C', lists: 2, pct: 20 }, { archetype: 'D', lists: 1, pct: 10 }] };
  const s = S.metaSummary(p); eq(s.lists, 10); eq(s.archetypes, 4); near(s.top3, 90);
});
test('con menos de 3 arquetipos suma los que hay; sin listas, todo a cero', () => {
  near(S.metaSummary({ n: 2, rows: [{ archetype: 'A', lists: 2, pct: 100 }] }).top3, 100);
  eq(S.metaSummary({ n: 0, rows: [] }), { lists: 0, archetypes: 0, top3: 0 });
});

console.log('\n== cuota por color ==');
test('cada lista reparte 1 entre sus colores; la suma es 100 % y va de mayor a menor', () => {
  const r = S.colorShare([{ colors: ['Blue', 'Red'] }, { colors: ['Blue'] }, { colors: ['Green', 'Blue'] }, { colors: [] }]);
  eq(r.map((x) => x.color), ['Blue', 'Green', 'Red'], 'verde y rojo empatan: orden fijo');
  near(r[0].pct, 200 / 3, 'Blue = (0,5 + 1 + 0,5) / 3'); near(r[1].pct, 50 / 3); near(r[2].pct, 50 / 3);
  near(r.reduce((s, x) => s + x.pct, 0), 100); eq(r[0].lists, 3, 'listas con azul');
});
test('las listas sin colores no cuentan y sin datos devuelve vacío; colores raros se ignoran', () => {
  eq(S.colorShare([]), []); eq(S.colorShare([{ colors: [] }, {}]), []);
  eq(S.colorShare([{ colors: ['Pink', 'Red'] }]).map((x) => [x.color, x.pct]), [['Red', 100]]);
});
test('empate: orden fijo por color (azul, verde, rojo, morado, blanco)', () => {
  eq(S.colorShare([{ colors: ['White'] }, { colors: ['Green'] }]).map((x) => x.color), ['Green', 'White']);
});

console.log('\n== cartas más usadas ==');
test('inclusión = listas con la carta / listas con composición; de mayor a menor y con límite', () => {
  const res = [{ cards: { A: 4, B: 2 } }, { cards: { A: 1 } }, { cards: { C: 3, A: 2 } }, { cards: null }, {}];
  const t = S.topCards(res, 2); eq(t.total, 3); eq(t.rows.map((x) => x.n), ['A', 'B']); eq(t.rows[0].lists, 3); near(t.rows[0].pct, 100); near(t.rows[1].pct, 100 / 3);
});
test('empates: por código; cantidades a 0 no cuentan; filtro opcional de cartas (p. ej. sin fichas)', () => {
  const t = S.topCards([{ cards: { Z: 1, B: 1, Q: 0 } }], 10); eq(t.rows.map((x) => x.n), ['B', 'Z']);
  eq(S.topCards([{ cards: { T1: 1, B: 1 } }], 10, (n) => n !== 'T1').rows.map((x) => x.n), ['B']);
  eq(S.topCards([], 10), { total: 0, rows: [] });
});

console.log('\n== podio de un torneo ==');
test('los tres mejores puestos por posición, sin puesto al final y como mucho 3', () => {
  const r = S.podium([{ id: 'x', placement: 3 }, { id: 'y', placement: 1 }, { id: 'z', placement: null }, { id: 'w', placement: 2 }, { id: 'v', placement: 4 }]);
  eq(r.map((x) => x.id), ['y', 'w', 'x']);
});
test('sin puestos no se inventa podio; puestos repetidos salen tal cual, en el orden de la fuente', () => {
  eq(S.podium([{ id: 'a', placement: null }, { id: 'b' }]), []);
  eq(S.podium([{ id: 'a', placement: 5 }, { id: 'b', placement: 5 }]).map((x) => x.id), ['a', 'b']);
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
