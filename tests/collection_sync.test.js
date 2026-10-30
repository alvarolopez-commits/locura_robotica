/* Pruebas de la sincronización de Mi colección con la cuenta. Ejecutar:  node tests/collection_sync.test.js */
const CS = require('../collection_sync.js');
const Collection = require('../collection.js');

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }
function eq(actual, expected, msg) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(expected) + ' y salió ' + JSON.stringify(actual)); }
function ok(cond, msg) { if (!cond) throw new Error(msg || 'condición falsa'); }
const q = (o) => { const r = {}; Object.keys(o).sort().forEach((k) => { r[k] = o[k].q; }); return r; };
const M = (o) => { const r = {}; Object.keys(o).forEach((k) => { r[k] = { q: o[k], t: 1 }; }); return r; };

// ---------- merge (tres vías) ----------
test('merge: solo local o solo remoto se conserva', () => {
  eq(q(CS.merge({}, M({ A: 1 }), M({ B: 2 }))), { A: 1, B: 2 });
});
test('merge: el cambio de un solo lado gana (aunque sea quitar una carta)', () => {
  const base = M({ A: 2, B: 1 });
  eq(q(CS.merge(base, M({ A: 2 }), M({ A: 2, B: 1 }))), { A: 2 }, 'quitada en local');
  eq(q(CS.merge(base, M({ A: 2, B: 1 }), M({ B: 1 }))), { B: 1 }, 'quitada en remoto');
  eq(q(CS.merge(base, M({ A: 3, B: 1 }), M({ A: 2, B: 1 }))), { A: 3, B: 1 }, 'más copias en local');
  eq(q(CS.merge(base, M({ A: 2, B: 1 }), M({ A: 5, B: 1 }))), { A: 5, B: 1 }, 'más copias en remoto');
});
test('merge: si los dos cambian lo mismo cada uno, se queda el mayor y nada se pierde', () => {
  eq(q(CS.merge(M({ A: 1 }), M({ A: 2 }), M({ A: 4 }))), { A: 4 });
  eq(q(CS.merge(M({ A: 1 }), M({}), M({ A: 3 }))), { A: 3 }, 'quitada aquí y cambiada allí: se conserva');
});
test('merge: primera vez (sin base) une las dos colecciones con el mayor número de copias', () => {
  eq(q(CS.merge({}, M({ A: 1, B: 2 }), M({ B: 3, C: 1 }))), { A: 1, B: 3, C: 1 });
});
test('merge: se conserva la fecha de alta más antigua', () => {
  const l = { A: { q: 1, t: 50 } }, r = { A: { q: 2, t: 20 } };
  eq(CS.merge({}, l, r).A.t, 20);
});

// ---------- sincronización con un servidor de mentira ----------
function server() {
  const S = { row: null, calls: [], offline: false, missing: false, failNext409: 0, rev: 0 };
  S.client = {
    from() { const b = { select() { return b; }, limit() { return b; }, then(res, rej) { S.calls.push('select'); return Promise.resolve(read()).then(res, rej); } }; return b; },
    rpc(name, a) {
      S.calls.push('rpc');
      return new Promise((resolve) => {
        if (S.offline) return resolve({ data: null, error: { message: 'TypeError: Failed to fetch', status: 0 } });
        if (S.missing) return resolve({ data: null, error: { code: 'PGRST202', message: 'function not found', status: 404 } });
        if (S.failNext409 > 0) { S.failNext409--; S.row = S.row || { cards: {}, revision: 1 }; S.row.revision++; return resolve({ data: null, error: { code: 'PT409', message: 'revision_conflict', status: 409 } }); }
        const cur = S.row ? S.row.revision : 0;
        if (a.p_expected_revision != null && a.p_expected_revision !== cur) return resolve({ data: null, error: { code: 'PT409', message: 'revision_conflict', status: 409 } });
        S.row = { cards: JSON.parse(JSON.stringify(a.p_cards)), revision: cur + 1 };
        resolve({ data: [{ new_revision: S.row.revision, saved_at: 'x' }], error: null });
      });
    },
  };
  function read() {
    if (S.offline) return { data: null, error: { message: 'TypeError: Failed to fetch', status: 0 } };
    if (S.missing) return { data: null, error: { code: 'PGRST205', message: 'Could not find the table', status: 404 } };
    return { data: S.row ? [{ cards: S.row.cards, revision: S.row.revision }] : [], error: null };
  }
  return S;
}
function device(S, initial, opts) {
  let text = initial ? JSON.stringify(initial) : null, store = {};
  const states = [];
  const coll = Collection.create({ load: () => text, save: (t) => { text = t; } }, { now: () => 100 });
  let t0 = 0; const timers = [];
  const sync = CS.create({
    client: () => S.client, snapshot: () => coll.snapshot(), replaceAll: (m) => coll.replaceAll(m),
    storage: { get: (k) => store[k] || null, set: (k, v) => { store[k] = v; } },
    onState: (s) => states.push(s.phase),
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
  });
  coll.onChange(() => sync.touch());
  return { coll, sync, states, store, timers, runTimers() { const t = timers.splice(0); t.forEach((f) => f()); } };
}
const U = { id: 'user-1' };

test('primer inicio de sesión con colección local y nube vacía: se sube todo', async () => {
  const S = server(); const d = device(S, { A: { q: 2, t: 5 }, B: { q: 1, t: 6 } });
  await d.sync.start(U);
  eq(q(S.row.cards), { A: 2, B: 1 }, 'servidor'); eq(S.row.revision, 1, 'revisión'); eq(d.sync.state().phase, 'saved');
});
test('segundo dispositivo vacío: baja la colección de la cuenta', async () => {
  const S = server(); S.row = { cards: M({ A: 2, B: 1 }), revision: 3 };
  const d = device(S, null); await d.sync.start(U);
  eq(d.coll.list(), ['A', 'B']); eq(d.coll.qty('A'), 2); eq(S.calls.filter((c) => c === 'rpc').length, 0, 'no escribe si no hay nada que subir');
});
test('dos dispositivos con colecciones distintas se unen sin perder nada, y el servidor queda igual', async () => {
  const S = server(); S.row = { cards: M({ A: 1, X: 2 }), revision: 2 };
  const d = device(S, { A: { q: 3, t: 5 }, B: { q: 1, t: 6 } }); await d.sync.start(U);
  eq(q(d.coll.snapshot()), { A: 3, B: 1, X: 2 }, 'local'); eq(q(S.row.cards), { A: 3, B: 1, X: 2 }, 'nube');
});
test('un cambio local se envía tras tocar (con espera) y quitar una carta se propaga al otro dispositivo', async () => {
  const S = server(); const a = device(S, { A: { q: 1, t: 1 }, B: { q: 1, t: 1 } }); await a.sync.start(U);
  const b = device(S, null); await b.sync.start(U); eq(b.coll.list(), ['A', 'B'], 'B recibe');
  a.coll.remove('B'); ok(a.timers.length > 0, 'programó el envío'); a.runTimers(); await a.sync.flush();
  eq(q(S.row.cards), { A: 1 }, 'nube sin B');
  await b.sync.start(U); eq(b.coll.list(), ['A'], 'B ya no tiene B');
  b.coll.inc('A'); b.runTimers(); await b.sync.flush(); await a.sync.start(U);
  eq(a.coll.qty('A'), 2, 'A recibe la copia nueva');
});
test('sin cambios no se envía nada', async () => {
  const S = server(); const d = device(S, { A: { q: 1, t: 1 } }); await d.sync.start(U);
  const n = S.calls.length; await d.sync.flush(); eq(S.calls.length, n, 'sin llamadas nuevas');
});
test('un conflicto de revisión se resuelve solo volviendo a mezclar', async () => {
  const S = server(); S.row = { cards: M({ A: 1 }), revision: 1 };
  const d = device(S, { B: { q: 1, t: 1 } }); S.failNext409 = 1;
  await d.sync.start(U);
  eq(q(S.row.cards), { A: 1, B: 1 }, 'nube'); eq(d.sync.state().phase, 'saved', 'estado');
});
test('sin conexión conserva lo local, avisa "offline" y reintenta', async () => {
  const S = server(); S.offline = true; const d = device(S, { A: { q: 1, t: 1 } });
  await d.sync.start(U); eq(d.sync.state().phase, 'offline'); eq(d.coll.list(), ['A'], 'no se pierde'); ok(d.timers.length > 0, 'reintento programado');
  S.offline = false; d.runTimers(); await d.sync.flush(); eq(q(S.row.cards), { A: 1 }, 'se sube al volver');
});
test('si la tabla aún no existe en Supabase: estado "unavailable", no reintenta y lo local no se toca', async () => {
  const S = server(); S.missing = true; const d = device(S, { A: { q: 1, t: 1 } });
  await d.sync.start(U); eq(d.sync.state().phase, 'unavailable'); eq(d.timers.length, 0, 'sin reintentos'); eq(d.coll.list(), ['A']);
});
test('stop deja de enviar y borra lo recordado de esa cuenta', async () => {
  const S = server(); const d = device(S, { A: { q: 1, t: 1 } }); await d.sync.start(U); d.sync.stop();
  d.coll.inc('A'); eq(d.timers.length, 0, 'no programa nada'); eq(d.sync.state().phase, 'signedout');
});
test('con otra cuenta no se reutiliza lo recordado de la anterior', async () => {
  const S = server(); const d = device(S, { A: { q: 1, t: 1 } }); await d.sync.start(U);
  S.row = null; d.sync.stop(); await d.sync.start({ id: 'user-2' });
  eq(q(S.row.cards), { A: 1 }, 'la colección local se sube a la cuenta nueva (primera unión)');
});

(async () => {
  for (const t of pending) {
    try { await t.fn(); passed++; console.log('  PASS ' + t.name); } catch (e) { failed++; console.log('  FAIL ' + t.name + '\n       ' + e.message); }
  }
  console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
  process.exit(failed ? 1 : 0);
})();
