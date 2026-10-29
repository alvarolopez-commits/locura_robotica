/* Pruebas del módulo Mi colección. Ejecutar:  node tests/collection.test.js */
const C = require('../collection.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}
function eq(actual, expected, msg) { if (actual !== expected) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(actual)); }
function ok(cond, msg) { if (!cond) throw new Error(msg || 'condición falsa'); }

function memHost(initial) {
  const h = { text: initial === undefined ? null : initial, saves: [],
    load() { return h.text; }, save(t) { h.saves.push(t); h.text = t; } };
  return h;
}
function counter(api) { let n = 0; api.onChange(() => { n++; }); return () => n; }

test('añadir una carta la marca y no se duplica', () => {
  const c = C.create(memHost());
  c.add('ST01-001'); c.add('ST01-001');
  ok(c.has('ST01-001'), 'debería tenerla');
  eq(c.size(), 1, 'tamaño');
});

test('quitar una carta que no está no cambia nada ni avisa', () => {
  const c = C.create(memHost()); const n = counter(c);
  c.remove('GD01-001');
  eq(n(), 0, 'avisos'); eq(c.size(), 0, 'tamaño');
});

test('la colección "existe" solo con al menos una carta y vuelve a no existir al quitar la última', () => {
  const c = C.create(memHost());
  eq(c.exists(), false, 'vacía');
  c.add('ST01-001'); eq(c.exists(), true, 'con una');
  c.remove('ST01-001'); eq(c.exists(), false, 'tras quitar la última');
});

test('isMissing es falso sin colección y verdadero con colección que no incluye la carta', () => {
  const c = C.create(memHost());
  eq(c.isMissing('GD01-001'), false, 'sin colección no hay avisos');
  c.add('ST01-001');
  eq(c.isMissing('GD01-001'), true, 'colección sin esa carta');
  eq(c.isMissing('ST01-001'), false, 'carta que sí tiene');
});

test('addMany y removeMany avisan una sola vez', () => {
  const c = C.create(memHost()); const n = counter(c);
  c.addMany(['ST01-001', 'ST01-002']); eq(n(), 1, 'avisos al añadir');
  c.removeMany(['ST01-001', 'ST01-002']); eq(n(), 2, 'avisos al quitar');
});

test('addMany sin novedades no avisa', () => {
  const c = C.create(memHost()); c.add('ST01-001'); const n = counter(c);
  c.addMany(['ST01-001']); eq(n(), 0, 'avisos');
});

test('hasAll es falso si falta alguna y falso con lista vacía', () => {
  const c = C.create(memHost()); c.add('ST01-001');
  eq(c.hasAll(['ST01-001', 'ST01-002']), false, 'falta una');
  c.add('ST01-002'); eq(c.hasAll(['ST01-001', 'ST01-002']), true, 'las tiene todas');
  eq(c.hasAll([]), false, 'lista vacía');
});

test('persiste y se recupera con otra instancia', () => {
  const h = memHost(); const c = C.create(h);
  c.add('ST01-001'); c.add('GD01-002');
  ok(h.saves.length >= 1, 'debió guardar');
  eq(Object.keys(JSON.parse(h.text)).join(','), 'GD01-002,ST01-001', 'cartas guardadas, ordenadas');
  ok(C.create(h).has('ST01-001'), 'otra instancia la ve');
});

test('un valor guardado corrupto se trata como colección vacía y no lanza', () => {
  ['{{no json', '{"a":"x"}', '{"a":0}', '[1,2]', '"texto"', ''].forEach((bad) => {
    const c = C.create(memHost(bad));
    eq(c.size(), 0, 'tamaño con ' + JSON.stringify(bad));
  });
});

test('un guardado que falla no impide seguir usando la colección en memoria', () => {
  const h = memHost(); h.save = () => { throw new Error('cuota llena'); };
  const c = C.create(h);
  c.add('ST01-001');
  ok(c.has('ST01-001'), 'sigue funcionando');
});

test('list devuelve las cartas en orden estable', () => {
  const c = C.create(memHost()); c.addMany(['ST01-002', 'GD01-001', 'ST01-001']);
  eq(c.list().join(','), 'GD01-001,ST01-001,ST01-002', 'orden');
});


/* ---- cantidades y fecha de alta ---- */
test('inc crea la carta con 1 copia y suma una por pulsación', () => {
  const c = C.create(memHost());
  eq(c.qty('ST01-001'), 0, 'sin la carta');
  c.inc('ST01-001'); eq(c.qty('ST01-001'), 1, 'primera');
  c.inc('ST01-001'); c.inc('ST01-001'); eq(c.qty('ST01-001'), 3, 'tras tres');
  eq(c.size(), 1, 'sigue siendo una carta distinta');
});

test('add sobre una carta que ya tienes no cambia sus copias (el botón del catálogo es de marcar)', () => {
  const c = C.create(memHost()); c.inc('ST01-001'); c.inc('ST01-001');
  c.add('ST01-001'); eq(c.qty('ST01-001'), 2, 'copias');
});

test('dec resta una copia y, con la última, quita la carta; sobre una ausente no hace nada ni avisa', () => {
  const c = C.create(memHost()); c.setQty('ST01-001', 2); const n = counter(c);
  c.dec('ST01-001'); eq(c.qty('ST01-001'), 1, 'queda una'); eq(c.has('ST01-001'), true, 'sigue');
  c.dec('ST01-001'); eq(c.has('ST01-001'), false, 'se quita al restar la última'); eq(n(), 2, 'avisos');
  c.dec('ST01-001'); eq(n(), 2, 'sin aviso extra');
});

test('setQty fija las copias, 0 quita la carta y se limita a 99', () => {
  const c = C.create(memHost());
  c.setQty('ST01-001', 5); eq(c.qty('ST01-001'), 5, 'cinco');
  c.setQty('ST01-001', 500); eq(c.qty('ST01-001'), 99, 'tope');
  c.setQty('ST01-001', 0); eq(c.has('ST01-001'), false, 'a cero se quita');
  c.setQty('ST01-002', 2.7); eq(c.qty('ST01-002'), 2, 'entero');
});

test('units suma las copias y size cuenta cartas distintas', () => {
  const c = C.create(memHost()); c.setQty('A', 3); c.setQty('B', 1); c.add('C');
  eq(c.units(), 5, 'unidades'); eq(c.size(), 3, 'distintas');
});

test('guarda cantidades y fecha y otra instancia las recupera', () => {
  const h = memHost(); let t = 1000; const c = C.create(h, { now: () => t });
  c.inc('ST01-001'); t = 2000; c.inc('ST01-001'); c.inc('GD01-001');
  const d = C.create(h);
  eq(d.qty('ST01-001'), 2, 'copias'); eq(d.addedAt('ST01-001'), 1000, 'se conserva la fecha del alta, no la de la última copia');
  eq(d.addedAt('GD01-001'), 2000, 'fecha de otra carta'); eq(d.hasDates(), true, 'hay fechas');
});

test('una colección guardada con el formato antiguo (lista) se lee con 1 copia y sin fecha', () => {
  const c = C.create(memHost(JSON.stringify(['ST01-001', 'ST01-002'])));
  eq(c.qty('ST01-001'), 1, 'copias'); eq(c.addedAt('ST01-001'), 0, 'sin fecha'); eq(c.hasDates(), false, 'no hay fechas');
  eq(c.units(), 2, 'unidades');
});

test('al leer se ignoran las entradas con cantidades no válidas', () => {
  const c = C.create(memHost(JSON.stringify({ A: 0, B: 'x', C: { q: 3, t: 5 }, D: 2, E: -1, F: { q: 'z' } })));
  eq(c.list().join(','), 'C,D', 'solo las válidas'); eq(c.qty('C'), 3, 'objeto'); eq(c.qty('D'), 2, 'número suelto');
});

test('inc, dec y setQty avisan una vez por cambio y persisten', () => {
  const h = memHost(); const c = C.create(h); const n = counter(c);
  c.inc('A'); c.inc('A'); c.dec('A'); c.setQty('A', 4);
  eq(n(), 4, 'avisos'); eq(JSON.parse(h.text).A.q, 4, 'último valor guardado');
  c.setQty('A', 4); eq(n(), 4, 'mismo valor: sin aviso');
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
process.exit(failed ? 1 : 0);
