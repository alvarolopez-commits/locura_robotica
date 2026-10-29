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
  eq(JSON.stringify(JSON.parse(h.text)), JSON.stringify(['GD01-002', 'ST01-001']), 'lista guardada, ordenada');
  ok(C.create(h).has('ST01-001'), 'otra instancia la ve');
});

test('un valor guardado corrupto se trata como colección vacía y no lanza', () => {
  ['{{no json', '{"a":1}', '[1,2]', '"texto"', ''].forEach((bad) => {
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

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
process.exit(failed ? 1 : 0);
