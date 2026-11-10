/* Prueba de aislamiento de favoritos por la Data API (la que usa la web), con dos cuentas de prueba y una sesión anónima.
 * NO sustituye ni se hace desde el SQL Editor: ahí eres administrador y la RLS no se aplica. Solo para un proyecto de STAGING con cuentas de PRUEBA.
 *
 *   SUPABASE_URL=https://<staging>.supabase.co SUPABASE_ANON_KEY=<clave pública anon/publishable> \
 *   RLS_A_EMAIL=… RLS_A_PASSWORD=… RLS_B_EMAIL=… RLS_B_PASSWORD=…  node scripts/rls_favorites_check.mjs [--hardened|--no-hardened]
 *
 * Todo va por variables de entorno: nada se guarda ni se imprime (ni claves, ni tokens, ni correos). NUNCA uses la clave service_role.
 * --hardened (por defecto) exige además que anon NO pueda ni leer la tabla ni llamar a la función (tras aplicar supabase/favorites_security.sql);
 * --no-hardened solo exige que anon no vea ni escriba datos (el estado de supabase/favorites.sql tal cual).
 * Se niega a ejecutarse contra la URL de config.js (producción) salvo que añadas --i-know-this-is-production.
 * Deja los favoritos de las cuentas de prueba como estaban (si no tenían fila, quedan en []: no se puede borrar sin permiso DELETE). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = (who) => ({ id: 'RLS-PRUEBA|' + who, season: 'GD06', name: 'RLS prueba ' + who, addedAt: 1 });
const T = 15000;

export async function runChecks({ fetch: f, env, hardened = true }) {
  const base = env.SUPABASE_URL.replace(/\/+$/, ''), anon = env.SUPABASE_ANON_KEY, results = [];
  const call = async (method, url, { token, body, prefer } = {}) => {
    const headers = { apikey: anon, 'Content-Type': 'application/json' }; if (token) headers.Authorization = 'Bearer ' + token; if (prefer) headers.Prefer = prefer;
    try { const r = await f(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(T) }); let j = null; try { j = await r.json(); } catch (e) { /* sin cuerpo */ } return { status: r.status, body: j }; }
    catch (e) { return { status: 0, body: null }; }
  };
  const check = (id, text, pass, status) => results.push({ id, text, pass: !!pass, status });
  const denied = (r) => r.status === 401 || r.status === 403;
  const rows = (r) => (r.status === 200 && Array.isArray(r.body) ? r.body : null);
  const login = async (email, password) => { const r = await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } }); return r.status === 200 && r.body && r.body.access_token ? { token: r.body.access_token, id: r.body.user && r.body.user.id } : null; };
  const A = await login(env.RLS_A_EMAIL, env.RLS_A_PASSWORD), B = await login(env.RLS_B_EMAIL, env.RLS_B_PASSWORD);
  if (!A || !B || !A.id || !B.id || A.id === B.id) { check('login', 'se pueden abrir dos sesiones distintas (A y B)', false, 0); return results; }
  const TAB = '/rest/v1/user_archetype_favorites';
  const own = async (u) => { const r = await call('GET', TAB + '?select=user_id,favorites,revision', { token: u.token }); return { r, row: (rows(r) || [])[0] || null }; };
  const save = (u, fav, rev) => call('POST', '/rest/v1/rpc/save_favorites', { token: u.token, body: { p_favorites: fav, p_expected_revision: rev } });
  const before = { A: await own(A), B: await own(B) };

  // sin sesión
  const at = await call('GET', TAB + '?select=user_id,favorites');
  check('anon-table', hardened ? 'sin sesión: la tabla se rechaza (401/403)' : 'sin sesión: no se ve ninguna fila', hardened ? denied(at) : (denied(at) || (rows(at) && rows(at).length === 0)), at.status);
  const ar = await call('POST', '/rest/v1/rpc/save_favorites', { body: { p_favorites: [MARK('anon')], p_expected_revision: null } });
  check('anon-rpc', hardened ? 'sin sesión: la función se rechaza (401/403)' : 'sin sesión: la función no guarda nada', hardened ? denied(ar) : ar.status >= 400, ar.status);

  // A escribe y lee lo suyo
  const aw = await save(A, [MARK('A')], before.A.row ? before.A.row.revision : 0);
  check('a-write', 'A guarda sus favoritos por la función', aw.status === 200, aw.status);
  const a1 = await own(A); check('a-read-own', 'A lee los suyos', a1.row && a1.row.user_id === A.id && JSON.stringify(a1.row.favorites).includes('RLS-PRUEBA|A'), a1.r.status);

  // B no ve ni toca lo de A
  const bAll = await call('GET', TAB + '?select=user_id,favorites', { token: B.token });
  check('b-no-read-a', 'B listando la tabla no ve filas de A', rows(bAll) && rows(bAll).every((x) => x.user_id !== A.id) && !JSON.stringify(rows(bAll)).includes('RLS-PRUEBA|A'), bAll.status);
  const bF = await call('GET', TAB + '?select=favorites&user_id=eq.' + A.id, { token: B.token });
  check('b-filter-a', 'B pidiendo expresamente la fila de A recibe vacío', rows(bF) && rows(bF).length === 0, bF.status);
  const bP = await call('PATCH', TAB + '?user_id=eq.' + A.id, { token: B.token, body: { favorites: [MARK('HACKEADO')] }, prefer: 'return=representation' });
  check('b-patch-a', 'B no puede modificar la fila de A (0 filas o rechazo)', denied(bP) || (Array.isArray(bP.body) && bP.body.length === 0), bP.status);
  const bI = await call('POST', TAB, { token: B.token, body: { user_id: A.id, favorites: [MARK('HACKEADO')] }, prefer: 'return=representation' });
  check('b-insert-a', 'B no puede insertar una fila a nombre de A', denied(bI) || (bI.status >= 400), bI.status);
  const bD = await call('DELETE', TAB + '?user_id=eq.' + A.id, { token: B.token, prefer: 'return=representation' });
  check('b-delete-a', hardened ? 'B no puede borrar filas (sin permiso DELETE)' : 'B no puede borrar la fila de A', hardened ? denied(bD) : (denied(bD) || (Array.isArray(bD.body) && bD.body.length === 0)), bD.status);

  // B escribe lo suyo y A no lo ve; lo de A sigue intacto
  const bw = await save(B, [MARK('B')], before.B.row ? before.B.row.revision : 0); check('b-write-own', 'B guarda los suyos', bw.status === 200, bw.status);
  const aAll = await call('GET', TAB + '?select=user_id,favorites', { token: A.token });
  check('a-no-read-b', 'A no ve filas de B', rows(aAll) && rows(aAll).every((x) => x.user_id !== B.id) && !JSON.stringify(rows(aAll)).includes('RLS-PRUEBA|B'), aAll.status);
  const a2 = await own(A); check('a-unchanged', 'lo de A sigue intacto tras los intentos de B', a2.row && JSON.stringify(a2.row.favorites) === JSON.stringify([MARK('A')]), a2.r.status);

  // control de concurrencia
  const cf = await save(A, [MARK('A')], 9999); check('a-conflict', 'una revisión esperada incorrecta se rechaza con 409 y no escribe', cf.status === 409, cf.status);

  // restaurar
  const restore = async (u, b) => { const cur = await own(u); if (cur.row) await save(u, b.row ? b.row.favorites : [], cur.row.revision); };
  await restore(A, before.A); await restore(B, before.B);
  return results;
}

function report(results) {
  const w = Math.max(...results.map((r) => r.id.length));
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.id.padEnd(w) + '  ' + r.text + ' [HTTP ' + r.status + ']'));
  const bad = results.filter((r) => !r.pass).length; console.log('\n' + (results.length - bad) + ' correctas · ' + bad + ' con problemas'); return bad;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), env = process.env, need = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'RLS_A_EMAIL', 'RLS_A_PASSWORD', 'RLS_B_EMAIL', 'RLS_B_PASSWORD'];
  const miss = need.filter((k) => !env[k]);
  if (miss.length) { console.log('Faltan variables de entorno: ' + miss.join(', ') + '.\nNo se ha hecho ninguna petición. Mira la cabecera de este archivo.'); process.exit(2); }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(env.SUPABASE_URL)) { console.log('SUPABASE_URL debe ser https://<proyecto>.supabase.co'); process.exit(2); }
  let prod = null; try { const t = fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8'); const m = t.match(/url:\s*'([^']+)'/); prod = m && m[1].replace(/\/+$/, ''); } catch (e) { /* sin config */ }
  if (prod && env.SUPABASE_URL.replace(/\/+$/, '') === prod && !a.includes('--i-know-this-is-production')) { console.log('Esa URL es la de producción (config.js). Esta prueba es para STAGING con cuentas de prueba: no se ejecuta.'); process.exit(2); }
  if (/service_role/i.test(env.SUPABASE_ANON_KEY) || (env.SUPABASE_ANON_KEY.split('.')[1] && /service_role/.test(Buffer.from(env.SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString('utf8')))) { console.log('Esa clave es service_role: no se usa. Pon la clave pública anon/publishable.'); process.exit(2); }
  const guard = setTimeout(() => { console.log('TIEMPO AGOTADO (2 min)'); process.exit(3); }, 120000);
  runChecks({ fetch, env, hardened: !a.includes('--no-hardened') }).then((r) => { clearTimeout(guard); process.exit(report(r) ? 1 : 0); }).catch(() => { console.log('Error inesperado (sin detalles para no filtrar datos).'); process.exit(1); });
}
export { report };
