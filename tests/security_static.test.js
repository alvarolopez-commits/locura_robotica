/* Comprobaciones estáticas de seguridad: ningún secreto en lo versionado y forma segura de los SQL de favoritos. No ejecuta SQL (no hay PostgreSQL
 * local): eso solo lo prueba scripts/rls_favorites_check.mjs contra staging.   Uso: node tests/security_static.test.js */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
const test = (n, fn) => { try { fn(); passed++; console.log('  PASS ' + n); } catch (e) { failed++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const files = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 }).stdout.split('\n').filter((f) => /\.(js|mjs|cjs|html|json|sql|md|txt|css|webmanifest|yml|yaml)$/i.test(f));
console.log('\n== secretos en lo versionado (' + files.length + ' archivos de texto) ==');
const jwtRole = (t) => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')).role; } catch (e) { return null; } };
test('hay archivos que revisar', () => ok(files.length > 50, String(files.length)));
test('ningún JWT con rol service_role, ninguna sb_secret_ y ninguna cadena de conexión con contraseña', () => {
  const bad = [];
  files.forEach((f) => {
    let t; try { t = read(f); } catch (e) { return; }
    (t.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g) || []).forEach((j) => { if (jwtRole(j) && jwtRole(j) !== 'anon') bad.push(f + ': JWT con rol ' + jwtRole(j)); });
    if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(t)) bad.push(f + ': sb_secret_');
    if (/postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]{3,}@/i.test(t)) bad.push(f + ': cadena de conexión con contraseña');
    if (/DIGILAB_API_KEY\s*[:=]\s*['"][^'"\s]{8,}['"]/.test(t)) bad.push(f + ': DIGILAB_API_KEY con valor');
    if (/service_role['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/.test(t)) bad.push(f + ': service_role con valor');
  });
  ok(!bad.length, bad.join(' | '));
});
test('la clave del navegador (config.js) es pública: publishable o JWT con rol anon', () => {
  const k = read('config.js').match(/anonKey:\s*'([^']*)'/)[1];
  ok(/^sb_publishable_/.test(k) || jwtRole(k) === 'anon' || k === '', 'clave no pública en config.js');
});
test('los archivos que se sirven al navegador no leen variables de entorno ni mencionan DIGILAB_API_KEY', () => {
  ['dashboard.html', 'config.js', 'comp_stats.js', 'favorites_sync.js', 'decks_sync.js', 'legality.js', 'meta.js', 'sw.js'].forEach((f) => { const t = read(f); ok(!/process\.env|DIGILAB_API_KEY/.test(t), f); });
});

console.log('\n== SQL de favoritos ==');
const sec = read('supabase/favorites_security.sql'), rb = read('supabase/favorites_security_rollback.sql'), base = read('supabase/favorites.sql');
const code = (s) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').toLowerCase();
test('el parche exige la migración base, usa transacción y toca los permisos de tabla y función', () => {
  const c = code(sec);
  ok(/to_regclass\('public\.user_archetype_favorites'\)/.test(c) && /to_regprocedure\('public\.save_favorites\(jsonb,integer\)'\)/.test(c), 'sin comprobación previa');
  ok(/^\s*begin;/m.test(c) && /^\s*commit;/m.test(c), 'sin transacción');
  ok(/revoke execute on function public\.save_favorites\(jsonb, integer\) from public, anon, authenticated/.test(c), 'no revoca la función a PUBLIC/anon');
  ok(/grant execute on function public\.save_favorites\(jsonb, integer\) to authenticated/.test(c), 'falta el grant a authenticated');
  ok(/revoke all on table public\.user_archetype_favorites from public, anon, authenticated/.test(c) && /grant select, insert, update on table public\.user_archetype_favorites to authenticated/.test(c), 'permisos de tabla');
  ok(/set search_path = ''/.test(c) && /security invoker/.test(c), 'search_path o invoker');
  ok(/using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\)/.test(c), 'política de propiedad');
});
test('ni el parche ni el rollback borran ni modifican datos', () => {
  [sec, rb].forEach((s) => ok(!/\b(drop table|truncate|delete\s+from|drop column|update\s+public\.|insert\s+into)\b/.test(code(s)), 'sentencia destructiva'));
  ok(!/drop function/.test(code(sec)), 'el parche no borra la función');
});
test('el parche no concede DELETE y la función base sigue siendo la que usa la app', () => {
  ok(!/grant[^;]*delete/.test(code(sec)), 'concede delete');
  ok(/create or replace function public\.save_favorites\(p_favorites jsonb, p_expected_revision integer/.test(code(base)), 'firma distinta de la que usa favorites_sync.js');
  const sync = read('favorites_sync.js'); ok(/rpc\('save_favorites'/.test(sync) && !/\.delete\(\)/.test(sync), 'la app no debe borrar la fila');
});
test('el rollback restaura la política original y los permisos de la migración base', () => {
  const c = code(rb); ok(/using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/.test(c) && /reset search_path/.test(c) && /grant execute on function public\.save_favorites\(jsonb, integer\) to public/.test(c) && /revoke all on table public\.user_archetype_favorites from anon/.test(c), 'rollback incompleto');
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
