/* Explorar mazos: filtros (color, estilo, periodo, orden, «contiene cartas») y su estado en la URL (comp_stats.js). Sin DOM.  Uso: node tests/explorar_filtros.test.js */
const S = require('../comp_stats.js');
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };
const q = (o) => (k) => (k in o ? o[k] : null);

console.log('\n== estado de los filtros en la URL ==');
test('sin parámetros: todo por defecto (más recientes, sin filtros)', () => { eq(S.exploreFromQuery(q({})), { colors: [], style: '', cards: [], sort: 'recent', period: '' }); });
test('lee colores, estilo, cartas, orden y periodo', () => {
  eq(S.exploreFromQuery(q({ c: 'Blue,Red', st: 'Aggro', cards: 'GD01-001,ST01-010', o: 'az', p: '30' })), { colors: ['Blue', 'Red'], style: 'Aggro', cards: ['GD01-001', 'ST01-010'], sort: 'az', period: '30' });
});
test('descarta lo que no existe: colores o estilos inventados, orden raro, códigos con caracteres peligrosos, repetidos y más de 10 cartas', () => {
  const f = S.exploreFromQuery(q({ c: 'Blue,Pink,Blue', st: 'Combo', cards: 'A1,A1,<b>,x y,' + Array.from({ length: 14 }, (_, i) => 'C' + i).join(','), o: 'vistas', p: '7' }));
  eq(f.colors, ['Blue']); eq(f.style, ''); eq(f.sort, 'recent'); eq(f.period, ''); eq(f.cards.length, 10); eq(f.cards[0], 'A1'); ok(f.cards.every((c) => /^[A-Za-z0-9-]+$/.test(c)), 'código raro');
});
function ok(c, m) { if (!c) throw new Error(m || 'falso'); }
test('serializa solo lo que no es el valor por defecto y vuelve a leerse igual (ida y vuelta)', () => {
  eq(S.exploreToQuery({ colors: [], style: '', cards: [], sort: 'recent', period: '' }), []);
  const f = { colors: ['Green', 'Purple'], style: 'Control', cards: ['GD05-081'], sort: 'az', period: '30' }, parts = S.exploreToQuery(f);
  eq(parts, ['c=Green,Purple', 'st=Control', 'cards=GD05-081', 'o=az', 'p=30']);
  const get = (k) => { const m = parts.map((x) => x.split('=')).find((x) => x[0] === k); return m ? m[1] : null; };
  eq(S.exploreFromQuery(get), f);
});
test('cuenta los filtros activos (el orden no cuenta como filtro)', () => {
  eq(S.exploreActiveCount({ colors: ['Blue', 'Red'], style: 'Aggro', cards: ['A', 'B', 'C'], sort: 'az', period: '30' }), 7); eq(S.exploreActiveCount({ colors: [], style: '', cards: [], sort: 'az', period: '' }), 0);
});

console.log('\n== qué se ve con cada filtro ==');
test('colores: el arquetipo debe tener TODOS los colores elegidos', () => {
  const A = { colors: ['Blue', 'Green'], style: 'Aggro' }, f = (c) => ({ colors: c, style: '', cards: [], sort: 'recent', period: '' });
  ok(S.exploreArchOk(A, f([]))); ok(S.exploreArchOk(A, f(['Blue']))); ok(S.exploreArchOk(A, f(['Green', 'Blue']))); ok(!S.exploreArchOk(A, f(['Blue', 'Red']))); ok(!S.exploreArchOk(A, f(['Red'])));
});
test('estilo: coincide solo con el mismo; un arquetipo sin estilo conocido NO sale si se filtra por estilo', () => {
  const f = { colors: [], style: 'Control', cards: [], sort: 'recent', period: '' };
  ok(S.exploreArchOk({ colors: [], style: 'Control' }, f)); ok(!S.exploreArchOk({ colors: [], style: 'Aggro' }, f)); ok(!S.exploreArchOk({ colors: [] }, f), 'sin estilo no puede afirmarse'); ok(S.exploreArchOk({ colors: [] }, { colors: [], style: '', cards: [], sort: 'recent', period: '' }));
});
test('«contiene cartas»: la lista debe traer TODAS (por código exacto)', () => {
  const l = { cards: { A: 4, B: 1 }, date: '2026-10-20' }, f = (c) => ({ colors: [], style: '', cards: c, sort: 'recent', period: '' });
  ok(S.exploreListOk(l, f([]), '')); ok(S.exploreListOk(l, f(['A']), '')); ok(S.exploreListOk(l, f(['A', 'B']), '')); ok(!S.exploreListOk(l, f(['A', 'C']), '')); ok(!S.exploreListOk({ cards: { AB: 4 } }, f(['A']), ''), 'A no es AB');
});
test('periodo: «últimos 30 días» deja las listas desde la fecha de corte; sin fecha NO se puede afirmar y sale fuera', () => {
  const f = { colors: [], style: '', cards: [], sort: 'recent', period: '30' }, cut = S.periodCutoff('2026-11-17', 30);
  eq(cut, '2026-10-18'); ok(S.exploreListOk({ cards: {}, date: '2026-10-18' }, f, cut)); ok(S.exploreListOk({ cards: {}, date: '2026-11-17' }, f, cut)); ok(!S.exploreListOk({ cards: {}, date: '2026-10-17' }, f, cut)); ok(!S.exploreListOk({ cards: {} }, f, cut));
  eq(S.periodCutoff('2026-03-05', 30), '2026-02-03', 'cruza de mes sin saltarse días'); eq(S.periodCutoff('2026-01-10', 30), '2025-12-11', 'cruza de año'); eq(S.periodCutoff('2026-11-17', 0), '');
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
