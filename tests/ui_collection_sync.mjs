// Mi colección sincronizada con la cuenta (Supabase simulado): subir, unir con otro dispositivo, propagar cambios y borrados,
// cierre de sesión y tabla aún sin crear. Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_collection_sync.mjs
import fs from 'node:fs';
const fake = fs.readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: fake + `;
(function(){
  var S = FakeSupabase.makeServer(); window.__S = S; var session = null, listeners = [];
  try{ var pre = JSON.parse(sessionStorage.getItem('__cloud') || 'null'); if(pre){ S.collections.u1 = pre.col; S.noCollectionTable = !!pre.missing; } }catch(e){}
  Object.defineProperty(window, 'SUPABASE_CONFIG', { value: { url: 'https://fake.supabase.co', anonKey: 'fake' }, writable: false });
  window.supabase = { createClient: function(){
    var c = S.client('u1');
    c.auth = {
      getSession: function(){ return Promise.resolve({ data: { session: session } }); },
      onAuthStateChange: function(cb){ listeners.push(cb); return { data: { subscription: {} } }; },
      signInWithOtp: function(){ return Promise.resolve({ error: null }); },
      signInWithPassword: function(){ return Promise.resolve({ error: null }); },
      signOut: function(){ session = null; listeners.forEach(function(cb){ cb('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); }
    };
    return c;
  } };
  window.__login = function(){ session = { user: { id: 'u1', email: 'palspamquetevas@gmail.com' } }; listeners.forEach(function(cb){ cb('SIGNED_IN', session); }); };
})();` });

const nube = () => ev(`(function(){ var r = window.__S.collections.u1; return r ? { q: Object.keys(r.cards).sort().map(function(k){ return k + ':' + r.cards[k].q }), rev: r.revision } : null })()`);
const local = () => ev(`(function(){ var o = JSON.parse(localStorage.getItem('msa_collection') || '{}'); return Object.keys(o).sort().map(function(k){ return k + ':' + o[k].q }) })()`);
async function abrir(localColl, cloudColl, missing) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); sessionStorage.setItem('__cloud', ${JSON.stringify(JSON.stringify({ col: cloudColl, missing: !!missing }))}); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.removeItem('msa_collsync_v1'); ${localColl ? `localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(localColl))});` : `localStorage.removeItem('msa_collection');`} 1`);
  await send('Page.reload'); await sleep(3000);
  await ev(`window.__login(); 1`); await sleep(1800);
}
const ficha = (q) => ({ q, t: 1000 });

console.log('\n== mi colección local sube a una cuenta vacía ==');
await abrir({ 'ST01-001': ficha(2), 'ST01-002': ficha(1) }, null);
check('al iniciar sesión se sube la colección del dispositivo', JSON.stringify((await nube())?.q) === JSON.stringify(['ST01-001:2', 'ST01-002:1']), await nube());
const diag = () => ev(`(function(){ document.getElementById('avatarBtn').click(); return new Promise(function(r){ setTimeout(function(){ var d=document.querySelector('.acc-diag'); d.open = true; r(d.textContent) }, 600) }) })()`);
check('el diagnóstico dice que la colección está guardada', /Colección: saved · 2 cartas distintas/.test(await diag()), await diag());
await ev(`document.getElementById('accountClose').click(); 1`); await sleep(400);

console.log('\n== un cambio posterior se envía solo ==');
await ev(`document.getElementById('pmCollection').click ? 0 : 0; 1`);
await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(300);
await ev(`(function(){ document.getElementById('menuBtn').click(); setTimeout(function(){ document.getElementById('pmCollection').click() }, 300) })()`); await sleep(1500);
await ev(`document.querySelector('#collGrid .cc-plus').click(); 1`); await sleep(1800);
check('+ en una carta llega a la nube con su nueva cantidad', JSON.stringify((await nube())?.q) === JSON.stringify(['ST01-001:3', 'ST01-002:1']), await nube());

console.log('\n== otro dispositivo cambia la nube y este se pone al día ==');
await ev(`(function(){ var r = window.__S.collections.u1; r.cards['ST01-002'] = { q: 4, t: 1 }; r.cards['GD01-001'] = { q: 1, t: 1 }; delete r.cards['ST01-001']; r.revision++ })()`);
await ev(`window.dispatchEvent(new Event('online')); 1`); await sleep(1500);
check('lo nuevo, lo cambiado y lo quitado en la nube llegan a este dispositivo', JSON.stringify(await local()) === JSON.stringify(['GD01-001:1', 'ST01-002:4']), await local());
check('la pantalla de Mi colección se repinta con ello', JSON.stringify(await ev(`Array.from(document.querySelectorAll('#collGrid .cc')).map(function(c){ return c.dataset.number })`)) === JSON.stringify(['GD01-001', 'ST01-002']));

console.log('\n== cerrar sesión (voluntario) con todo guardado ==');
await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(600);
await ev(`document.querySelector('.acc-out').click(); 1`); await sleep(1500);
check('la colección sale de este dispositivo y sigue en la nube', (await local()).length === 0 && (await nube())?.q.length === 2, [await local(), await nube()]);

console.log('\n== segundo dispositivo con otra colección: se unen ==');
await abrir({ 'ST02-001': ficha(1), 'ST01-002': ficha(1) }, { cards: { 'ST01-002': ficha(3), 'ST03-001': ficha(1) }, revision: 5 });
check('local y nube se unen sin perder nada', JSON.stringify(await local()) === JSON.stringify(['ST01-002:3', 'ST02-001:1', 'ST03-001:1']), await local());
check('la nube queda igual', JSON.stringify((await nube())?.q) === JSON.stringify(['ST01-002:3', 'ST02-001:1', 'ST03-001:1']), await nube());

console.log('\n== la tabla todavía no existe en Supabase ==');
await abrir({ 'ST01-001': ficha(2) }, null, true);
check('la colección local no se toca', JSON.stringify(await local()) === JSON.stringify(['ST01-001:2']), await local());
check('el diagnóstico avisa de que falta la tabla', /Colección: unavailable/.test(await diag()) && /falta crear la tabla/.test(await diag()), await diag());
await ev(`document.getElementById('accountClose').click(); 1`); await sleep(300);
const llamadas = await ev(`window.__S.calls.filter(function(c){ return c.indexOf('user_collection') === 0 || c === 'rpc.save_collection' }).length`);
await sleep(7500);
check('no se reintenta sin parar', (await ev(`window.__S.calls.filter(function(c){ return c.indexOf('user_collection') === 0 || c === 'rpc.save_collection' }).length`)) === llamadas, llamadas);
await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(600);
await ev(`document.querySelector('.acc-out').click(); 1`); await sleep(1200);
check('cerrar sesión sin haber guardado en la nube NO borra la colección local', JSON.stringify(await local()) === JSON.stringify(['ST01-001:2']), await local());
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
