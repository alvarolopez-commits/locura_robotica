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

console.log('\n== con totales por arquetipo (temporadas que la fuente da agregadas) ==');
test('colorShare admite peso por fila: un arquetipo con 3 puestos pesa el triple que uno con 1', () => {
  const r = S.colorShare([{ colors: ['Blue'], weight: 3 }, { colors: ['Red'], weight: 1 }]);
  eq(r.map((x) => x.color), ['Blue', 'Red']); near(r[0].pct, 75); near(r[1].pct, 25); eq(r[0].lists, 3, 'lists = peso, no filas');
});
test('colorShare descarta las filas con peso no válido (0, negativo, texto) y da 1 a las que no traen peso', () => {
  const r = S.colorShare([{ colors: ['Blue'], weight: 0 }, { colors: ['Red'], weight: -2 }, { colors: ['Green'], weight: 'x' }, { colors: ['White'] }]);
  eq(r.map((x) => x.color), ['White'], 'solo la fila sin peso (vale 1) cuenta'); near(r[0].pct, 100);
});
test('estimateTopCards pondera la adopción de cada perfil por los puestos del arquetipo', () => {
  const profiles = [{ name: 'A', cards: { X: { adoption: 1 }, Y: { adoption: 0.5 } } }, { name: 'B', cards: { X: { adoption: 0.5 }, Z: { adoption: 1 } } }, { name: 'C', cards: {} }];
  const t = S.estimateTopCards(profiles, { A: 60, B: 40, C: 100 }, 10);
  eq(t.total, 200, 'incluye los arquetipos sin perfil en el total'); eq(t.covered, 100, 'puestos con perfil');
  eq(t.rows.map((r) => r.n), ['X', 'Z', 'Y']);
  near(t.rows[0].lists, 80); near(t.rows[0].pct, 40, 'X: 60 + 20 = 80 de 200'); near(t.rows[1].lists, 40); near(t.rows[2].lists, 30);
});
test('estimateTopCards respeta límite y filtro, y sin datos devuelve vacío', () => {
  const profiles = [{ name: 'A', cards: { X: { adoption: 1 }, T: { adoption: 1 }, Y: { adoption: 0.5 } } }];
  eq(S.estimateTopCards(profiles, { A: 10 }, 1).rows.map((r) => r.n), ['T']);
  eq(S.estimateTopCards(profiles, { A: 10 }, 10, (n) => n !== 'T').rows.map((r) => r.n), ['X', 'Y']);
  eq(S.estimateTopCards([], {}, 5), { total: 0, covered: 0, basis: { consensus: 0, sample: 0, none: 0 }, rows: [] });
  eq(S.estimateTopCards(profiles, { Q: 5 }, 5), { total: 5, covered: 0, basis: { consensus: 0, sample: 0, none: 5 }, rows: [] });
});
test('estimateTopCards usa el perfil del MISMO set y nunca el de otro (sin mezclar temporadas)', () => {
  const profiles = [{ name: 'A', cards: { X: { adoption: 0.9 } }, profiles: { GD05: { basis: 'consensus', cards: { X: { adoption: 0.4 } } }, GD06: { basis: 'consensus', cards: { X: { adoption: 0.8 } } } } },
    { name: 'B', cards: { X: { adoption: 1 } }, profiles: { GD06: { basis: 'consensus', cards: { X: { adoption: 1 } } } } }];
  const g5 = S.estimateTopCards(profiles, { A: 100, B: 100 }, 5, null, 'GD05'), g6 = S.estimateTopCards(profiles, { A: 100, B: 100 }, 5, null, 'GD06');
  near(g5.rows[0].lists, 40, 'GD05: solo A (0,4 × 100); B no tiene perfil de GD05'); eq(g5.basis, { consensus: 100, sample: 0, none: 100 });
  near(g6.rows[0].lists, 180); eq(g6.basis, { consensus: 200, sample: 0, none: 0 });
});
test('estimateTopCards distingue consenso de listas de ejemplo y marca las cartas apoyadas en ejemplos', () => {
  const profiles = [{ name: 'A', profiles: { GD06: { basis: 'consensus', cards: { X: { adoption: 1 }, Y: { adoption: 1 } } } } }, { name: 'B', profiles: { GD06: { basis: 'sample', cards: { Y: { adoption: 1 } } } } }];
  const t = S.estimateTopCards(profiles, { A: 50, B: 50 }, 5, null, 'GD06');
  eq(t.basis, { consensus: 50, sample: 50, none: 0 }); eq(t.covered, 100);
  const y = t.rows.find((r) => r.n === 'Y'), x = t.rows.find((r) => r.n === 'X');
  near(y.sampleShare, 0.5, 'la mitad de Y viene de listas de ejemplo'); near(x.sampleShare, 0, 'X solo de consenso');
});
test('estimateTopCards sigue aceptando perfiles sin `profiles` (COMPARAR): sampleBased cuenta como ejemplo', () => {
  const t = S.estimateTopCards([{ name: 'A', sampleBased: true, cards: { X: { adoption: 1 } } }], { A: 10 }, 5);
  eq(t.basis, { consensus: 0, sample: 10, none: 0 }); near(t.rows[0].sampleShare, 1);
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
