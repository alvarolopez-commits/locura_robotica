/* Prueba del verificador de aislamiento (scripts/rls_favorites_check.mjs) contra un Supabase FALSO en memoria: uno que se comporta bien
 * y varios que fallan a propósito, para demostrar que el verificador detecta cada fuga. No hay red. NO prueba el proyecto real:
 * eso solo lo hace el propio verificador contra staging con dos cuentas de prueba.   Uso: node tests/rls_check.test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runChecks, report } from '../scripts/rls_favorites_check.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const test = async (n, fn) => { try { await fn(); passed++; console.log('  PASS ' + n); } catch (e) { failed++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };

const SECRETS = { anon: 'sb_publishable_CLAVE-FALSA-0123456789', pa: 'PASSWORD-A-FALSA-123', pb: 'PASSWORD-B-FALSA-123', ea: 'persona-a@example.test', eb: 'persona-b@example.test' };
const ENV = { SUPABASE_URL: 'https://falso-staging.supabase.co', SUPABASE_ANON_KEY: SECRETS.anon, RLS_A_EMAIL: SECRETS.ea, RLS_A_PASSWORD: SECRETS.pa, RLS_B_EMAIL: SECRETS.eb, RLS_B_PASSWORD: SECRETS.pb };

/* Supabase falso: opciones para romperlo de distintas formas */
function mock(o = {}) {
  const users = { [SECRETS.ea]: { id: 'uuid-a', token: 'tok-a' }, [SECRETS.eb]: { id: 'uuid-b', token: 'tok-b' } };
  const rows = { 'uuid-a': { favorites: [{ id: 'previo|a', season: 'GD06', name: 'Previo', addedAt: 5 }], revision: 3 } };   // A ya tenía favoritos; B no tenía fila
  const calls = [];
  const R = (status, body) => ({ status, ok: status < 300, json: async () => { if (body === undefined) throw new Error('sin cuerpo'); return body; } });
  const f = async (url, init) => {
    const u = new URL(url), method = init.method, auth = init.headers.Authorization, uid = Object.values(users).find((x) => 'Bearer ' + x.token === auth);
    const me = uid ? uid.id : null, body = init.body ? JSON.parse(init.body) : null, filt = u.searchParams.get('user_id'), want = filt && filt.replace(/^eq\./, ''); calls.push({ method, path: u.pathname, me });
    if (u.pathname === '/auth/v1/token') { const x = users[body.email]; return x && body.password.startsWith('PASSWORD') ? R(200, { access_token: x.token, user: { id: x.id } }) : R(400, { error: 'invalid' }); }
    const visible = () => Object.keys(rows).filter((k) => o.leakRead || k === me).filter((k) => !want || k === want);
    if (u.pathname === '/rest/v1/user_archetype_favorites') {
      if (!me) return method === 'GET' ? ((o.hardened === false || o.anonTableOpen) ? R(200, []) : R(401, { code: '42501' })) : R(401, {});
      if (method === 'GET') return R(200, visible().map((k) => Object.assign({ user_id: k }, rows[k])));
      if (method === 'PATCH') { const ks = Object.keys(rows).filter((k) => (o.leakWrite || k === me) && (!want || k === want)); ks.forEach((k) => { rows[k].favorites = body.favorites; }); return R(200, ks.map((k) => Object.assign({ user_id: k }, rows[k]))); }
      if (method === 'POST') { if (body.user_id !== me && !o.leakWrite) return R(403, { code: '42501' }); rows[body.user_id] = { favorites: body.favorites, revision: 1 }; return R(201, [body]); }
      if (method === 'DELETE') { if (o.hardened !== false && !o.leakWrite) return R(403, { code: '42501' }); const ks = Object.keys(rows).filter((k) => (o.leakWrite || k === me) && (!want || k === want)); ks.forEach((k) => delete rows[k]); return R(200, ks.map((k) => ({ user_id: k }))); }
    }
    if (u.pathname === '/rest/v1/rpc/save_favorites') {
      if (!me) { if (o.anonRpcOpen) { rows['uuid-anon'] = { favorites: body.p_favorites, revision: 1 }; return R(200, [{ new_revision: 1 }]); } return o.hardened === false ? R(400, { code: 'PT401' }) : R(401, { code: '42501' }); }
      const cur = rows[me], rev = cur ? cur.revision : 0; if (body.p_expected_revision != null && body.p_expected_revision !== rev) return R(409, { code: 'PT409', message: 'revision_conflict' });
      rows[me] = { favorites: body.p_favorites, revision: rev + 1 }; return R(200, [{ new_revision: rev + 1, saved_at: 'x' }]);
    }
    return R(404, {});
  };
  return { f, rows, calls };
}
const run = async (m, hardened = true) => runChecks({ fetch: m.f, env: ENV, hardened });
const failedIds = (r) => r.filter((x) => !x.pass).map((x) => x.id);

console.log('\n== verificador de aislamiento de favoritos ==');
await test('un Supabase bien configurado: las 13 comprobaciones pasan y los favoritos de prueba se restauran', async () => {
  const m = mock(), r = await run(m); eq(r.length, 13); eq(failedIds(r), []);
  eq(m.rows['uuid-a'].favorites, [{ id: 'previo|a', season: 'GD06', name: 'Previo', addedAt: 5 }], 'A debe quedar como estaba'); eq(m.rows['uuid-b'].favorites, [], 'B (sin fila previa) queda en []'); ok(!m.rows['uuid-anon']);
});
await test('fuga de lectura (B ve filas de A): se detecta', async () => { const r = await run(mock({ leakRead: true })); ok(failedIds(r).indexOf('b-no-read-a') >= 0 && failedIds(r).indexOf('b-filter-a') >= 0, failedIds(r).join()); });
await test('fuga de escritura (B toca lo de A): se detecta', async () => { const r = await run(mock({ leakWrite: true })); const f = failedIds(r); ['b-patch-a', 'b-insert-a', 'b-delete-a', 'a-unchanged'].forEach((id) => ok(f.indexOf(id) >= 0, 'no detectó ' + id + ' (' + f.join() + ')')); });
await test('la función abierta a quien no tiene sesión: se detecta', async () => { const m = mock({ anonRpcOpen: true }), r = await run(m); ok(failedIds(r).indexOf('anon-rpc') >= 0); });
await test('tabla legible sin sesión (aunque devuelva vacío): con --hardened falla; sin él, solo exige no ver datos', async () => {
  const m1 = mock({ hardened: false }); ok(failedIds(await run(m1, true)).indexOf('anon-table') >= 0); ok(failedIds(await run(m1, true)).indexOf('anon-rpc') >= 0);
  eq(failedIds(await run(mock({ hardened: false }), false)), [], 'sin endurecer pero con RLS bien puesta, --no-hardened debe pasar');
});
await test('si no se pueden abrir las dos sesiones, falla pronto y no sigue pidiendo cosas', async () => {
  const m = mock(), r = await runChecks({ fetch: m.f, env: Object.assign({}, ENV, { RLS_B_PASSWORD: 'mala' }), hardened: true }); eq(failedIds(r), ['login']); ok(m.calls.every((c) => c.path === '/auth/v1/token'));
});
await test('el informe no imprime claves, contraseñas, correos ni tokens', async () => {
  const r = await run(mock()), lines = []; const orig = console.log; console.log = (x) => lines.push(String(x)); try { report(r); } finally { console.log = orig; }
  const t = lines.join('\n'); Object.values(SECRETS).concat(['tok-a', 'tok-b', 'uuid-a', 'uuid-b']).forEach((s) => ok(!t.includes(s), 'se coló ' + s));
});
await test('consola: sin variables no hace ninguna petición; se niega con la URL de producción y con una clave service_role', () => {
  const run1 = (env, ...a) => spawnSync('node', [path.join(ROOT, 'scripts', 'rls_favorites_check.mjs'), ...a], { encoding: 'utf8', timeout: 30000, env: Object.assign({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, env) });
  let r = run1({}); eq(r.status, 2); ok(/Faltan variables/.test(r.stdout));
  const prod = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').match(/url:\s*'([^']+)'/)[1];
  r = run1(Object.assign({}, ENV, { SUPABASE_URL: prod })); eq(r.status, 2); ok(/producción/.test(r.stdout));
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.firma';
  r = run1(Object.assign({}, ENV, { SUPABASE_ANON_KEY: jwt })); eq(r.status, 2); ok(/service_role/.test(r.stdout)); ok(!(r.stdout + r.stderr).includes(jwt));
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
