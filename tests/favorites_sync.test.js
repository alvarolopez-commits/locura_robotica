/* Pruebas de la sincronización de favoritos con la cuenta (servidor Supabase simulado de tests/fake_supabase.js).  node tests/favorites_sync.test.js */
const FS = require('../favorites_sync.js');
const Fake = require('./fake_supabase.js');

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };
const fav = (name, season, t) => ({ id: (season || 'GD06') + '|' + name.toLowerCase(), season: season || 'GD06', name, addedAt: t || 1 });
const names = (l) => l.map((x) => x.name).sort();

/* un "dispositivo": sus favoritos locales y su almacenamiento, contra el mismo servidor */
function device(S, userId, initial) {
  let local = (initial || []).slice(), store = {}, state = {}, timers = [];
  const sync = FS.create({
    client: () => S.client(userId), snapshot: () => local.slice(), replaceAll: (l) => { local = l.slice(); },
    storage: { get: (k) => store[k] || null, set: (k, v) => { store[k] = v; } }, onState: (s) => { state = s; },
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
  });
  return { sync, get: () => local, set: (l) => { local = l; }, state: () => state.phase, user: { id: userId }, flushTimers: async () => { while (timers.length) timers.shift()(); await sync.flush(); } };
}

(async () => {
  console.log('\n== mezcla ==');
  await test('primera vez: se unen las dos listas', async () => { eq(names(FS.merge([], [fav('A')], [fav('B')])), ['A', 'B']); });
  await test('un favorito nuevo en un lado se conserva', async () => { eq(names(FS.merge([fav('A')], [fav('A'), fav('N')], [fav('A')])), ['A', 'N']); });
  await test('dejar de seguir en un lado se propaga (estaba en la base)', async () => { eq(names(FS.merge([fav('A'), fav('B')], [fav('A')], [fav('A'), fav('B')])), ['A']); });
  await test('favoritos de otra temporada se conservan', async () => { eq(names(FS.merge([], [fav('A', 'GD06')], [fav('A', 'GD05')])), ['A', 'A']); });
  await test('sin duplicados por id y con el tope de 200', async () => {
    eq(FS.merge([], [fav('A'), fav('A')], [fav('A')]).length, 1);
    const many = Array.from({ length: 250 }, (_, i) => fav('X' + i, 'GD06', i + 1)); eq(FS.merge([], many, []).length, 200);
  });

  console.log('\n== con cuenta ==');
  await test('inicio de sesión: sube los favoritos locales a la cuenta', async () => {
    const S = Fake.makeServer(), d = device(S, 'u1', [fav('A'), fav('B')]); await d.sync.start(d.user);
    eq(d.state(), 'saved'); eq(names(S.favorites.u1.favorites), ['A', 'B']);
  });
  await test('un segundo dispositivo recibe los de la cuenta y los suyos se unen', async () => {
    const S = Fake.makeServer(), a = device(S, 'u1', [fav('A')]); await a.sync.start(a.user);
    const b = device(S, 'u1', [fav('C')]); await b.sync.start(b.user);
    eq(names(b.get()), ['A', 'C']); await a.sync.retry(); eq(names(a.get()), ['A', 'C']);
  });
  await test('seguir y dejar de seguir se propagan', async () => {
    const S = Fake.makeServer(), a = device(S, 'u1', []), b = device(S, 'u1', []); await a.sync.start(a.user); await b.sync.start(b.user);
    a.set([fav('A')]); a.sync.touch(); await a.flushTimers(); await b.sync.retry(); eq(names(b.get()), ['A']);
    a.set([]); a.sync.touch(); await a.flushTimers(); await b.sync.retry(); eq(names(b.get()), []);
  });
  await test('cada persona ve solo lo suyo', async () => {
    const S = Fake.makeServer(), a = device(S, 'u1', [fav('A')]), z = device(S, 'u2', []); await a.sync.start(a.user); await z.sync.start(z.user);
    eq(z.get(), []); eq(Object.keys(S.favorites).sort(), ['u1']);
  });
  await test('conflicto de revisión: se vuelve a mezclar y no se pierde nada', async () => {
    const S = Fake.makeServer(), a = device(S, 'u1', [fav('A')]), b = device(S, 'u1', []); await a.sync.start(a.user); await b.sync.start(b.user);
    a.set([fav('A'), fav('X')]); a.sync.touch(); await a.flushTimers();
    b.set([fav('A'), fav('B')]); b.sync.touch(); await b.flushTimers();   // b guarda con una revisión vieja
    eq(names(S.favorites.u1.favorites), ['A', 'B', 'X']);
  });

  console.log('\n== sin conexión, invitado y migración sin aplicar ==');
  await test('sin conexión: los favoritos locales siguen intactos y queda en reintento', async () => {
    const S = Fake.makeServer(), d = device(S, 'u1', [fav('A')]); S.offline = true; await d.sync.start(d.user);
    eq(d.state(), 'offline'); eq(names(d.get()), ['A']);
    S.offline = false; await d.sync.retry(); eq(d.state(), 'saved'); eq(names(S.favorites.u1.favorites), ['A']);
  });
  await test('migración SIN aplicar: estado "unavailable", favoritos locales intactos, sin reintentos', async () => {
    const S = Fake.makeServer(); S.noFavoritesTable = true; const d = device(S, 'u1', [fav('A')]); await d.sync.start(d.user);
    eq(d.state(), 'unavailable'); eq(names(d.get()), ['A']); const calls = S.calls.length;
    d.sync.touch(); await d.flushTimers(); eq(S.calls.length, calls, 'sigue llamando a una tabla que no existe');
  });
  await test('sesión caducada: pasa a "signedout" con lo pendiente, sin perder nada', async () => {
    const S = Fake.makeServer(), d = device(S, 'u1', [fav('A')]); S.authFail = true; await d.sync.start(d.user);
    eq(d.state(), 'signedout'); eq(names(d.get()), ['A']);
  });
  await test('sin sesión no se llama a Supabase (el invitado es solo local)', async () => {
    const S = Fake.makeServer(), d = device(S, 'u1', [fav('A')]); d.sync.touch(); await d.flushTimers(); eq(S.calls.length, 0); ok(!d.state() || d.state() === 'signedout');
  });
  await test('al cerrar sesión se olvida la base y no se vuelve a llamar', async () => {
    const S = Fake.makeServer(), d = device(S, 'u1', [fav('A')]); await d.sync.start(d.user); d.sync.stop(); const n = S.calls.length; d.sync.touch(); await d.flushTimers(); eq(S.calls.length, n);
  });

  console.log('\n== migración SQL ==');
  const sql = require('fs').readFileSync(require('path').join(__dirname, '..', 'supabase', 'favorites.sql'), 'utf8');
  await test('es aditiva: no borra ni altera nada existente (solo drop policy if exists de la propia tabla)', async () => {
    ok(!/\b(drop\s+table|alter\s+table\s+public\.(decks|deck_cards|user_collection|user_preferences)|truncate|delete\s+from|update\s+public\.(decks|user_collection))\b/i.test(sql.replace(/^--.*$/gm, '')), 'tiene sentencias destructivas');
    ok(/create table if not exists public\.user_archetype_favorites/.test(sql) && /drop policy if exists favorites_owner/.test(sql) && /create or replace function public\.save_favorites/.test(sql));
  });
  await test('RLS activado, política solo para el propietario y sin acceso anónimo', async () => {
    ok(/enable row level security/.test(sql) && /using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/.test(sql) && /to authenticated/.test(sql) && /revoke all on public\.user_archetype_favorites from anon/.test(sql));
    ok(!/security definer/i.test(sql), 'la función no debe saltarse RLS');
  });

  console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
  process.exit(failed ? 1 : 0);
})();
