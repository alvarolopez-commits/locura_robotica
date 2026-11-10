// F5-09 · taxonomía de arquetipos en la interfaz: enlaces antiguos por nombre, alias de la tabla, sin fusionar Kshatriya y nombres sin asignar con su etiqueta original.
// Límites: 30 s por orden y 3 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_comp_taxonomia.mjs
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (3 min) en: ' + paso); process.exit(3); }, 180000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const real = JSON.parse(fs.readFileSync('data/competition_events.json', 'utf8'));
const table = JSON.parse(fs.readFileSync('data/archetype_aliases.json', 'utf8'));
// datos de prueba: un alias de la tabla (B/G OYW → BG OYW) y un nombre que no está en ella
const fx = JSON.parse(JSON.stringify(real)), tb = JSON.parse(JSON.stringify(table));
tb.archetypes.find((a) => a.id === 'bg-oyw').aliases = ['B/G OYW'];
const rBG = fx.results.filter((r) => r.archetypeId === 'bg-oyw' && r.eventId !== 'windecks:01M6G9R42V9CAP5B5H33SFXZ8T');
rBG[0].archetype = 'B/G OYW'; rBG[0].archetypeOriginal = 'B/G OYW';   // la fuente lo escribió de otra forma
const extra = fx.results.find((r) => r.archetypeId === 'char-ibo'); extra.archetype = 'Arquetipo Nuevo'; extra.archetypeOriginal = 'Arquetipo Nuevo'; extra.archetypeId = null;
let hookId = null;
async function abrir(hash, data, tabla) {
  paso = 'abrir ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId });
  hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ var of = window.fetch; window.fetch = function(u){ var s = String(u); if (s.indexOf('competition_events.json') >= 0) return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(data))}, {status:200, headers:{'content-type':'application/json'}})); if (s.indexOf('archetype_aliases.json') >= 0) return ${tabla === null ? "Promise.resolve(new Response('', {status:404}))" : `Promise.resolve(new Response(${JSON.stringify(JSON.stringify(tabla))}, {status:200, headers:{'content-type':'application/json'}}))`}; return of.apply(this, arguments); }; })();` })).result.identifier;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3500);
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const filas = () => ev(`Array.from(document.querySelectorAll('.gd-rows .gd-arow')).map(function(r){ return r.querySelector('.cr-name').textContent+'|'+r.querySelector('.cr-meta').textContent })`);

console.log('\n== datos y tabla ==');
check('cada resultado tiene archetypeId y archetypeOriginal; archetype no cambió', real.results.every((r) => 'archetypeId' in r && 'archetypeOriginal' in r && r.archetypeOriginal === r.archetype));
check('Kshatriya Banshee y Kshatriya + Strike Freedom Gundam tienen identidades distintas y la duda está anotada', real.results.some((r) => r.archetypeId === 'kshatriya-banshee') && real.results.some((r) => r.archetypeId === 'kshatriya-strike-freedom-gundam') && (table.pendingReview || []).length === 1);

console.log('\n== interfaz ==');
await abrir('#competicion', real, table);
let f = await filas();
check('el ranking sigue igual con la tabla (Mobile Fighter 16 de 56) y Kshatriya Banshee aparece solo', f[0] === 'Mobile Fighter|16 de 56 listas' && !(await ev(`document.getElementById('compPanel').textContent`)).includes('Strike Freedom'));
await abrir('#competicion/arquetipo/Kshatriya%20Banshee', real, table);
check('un enlace antiguo por nombre sigue funcionando', /Kshatriya Banshee/.test(await txt('.gd-title')) && /de 56 listas publicadas/.test(await txt('.gd-metric-n')), await txt('.gd-title'));
await abrir('#competicion/arquetipo/' + encodeURIComponent('Kshatriya + Strike Freedom Gundam'), real, table);
check('Kshatriya + Strike Freedom Gundam es otra ficha, no se funde con Banshee: fuera de la muestra y con su lista', /Strike Freedom/.test(await txt('.gd-title')) && /fuera de la muestra principal \(n = 56\)/.test(await txt('.gd-outside-arch')) && (await count('.gd-res')) === 1 && !/Banshee/.test(await txt('.gd-title')));
await abrir('#competicion', fx, tb);
f = await filas(); const nBG = f.filter((x) => /^(BG OYW|B\/G OYW)\|/.test(x));
check('un alias de la tabla se agrupa con su arquetipo con el nombre canónico (una sola fila BG OYW con 6 listas)', nBG.length === 1 && nBG[0] === 'BG OYW|6 de 56 listas', f);
await abrir('#competicion/arquetipo/' + encodeURIComponent('B/G OYW'), fx, tb);
check('el enlace con el alias llega a la ficha canónica con las 6 listas', /BG OYW/.test(await txt('.gd-title')) && /6 de 56 listas publicadas/.test(await txt('.gd-metric-n')), [await txt('.gd-title'), await txt('.gd-metric-n')]);
await abrir('#competicion', fx, tb);
f = await filas(); check('un nombre que no está en la tabla conserva su etiqueta original, sin perder la lista', f.some((x) => x === 'Arquetipo Nuevo|1 de 56 listas') || (await ev(`document.getElementById('gdAll') ? (document.getElementById('gdAll').click(), true) : false`), (await filas()).some((x) => x === 'Arquetipo Nuevo|1 de 56 listas')), f);
await abrir('#competicion', real, null);
check('sin la tabla (archivo ausente) todo sigue funcionando agrupando por nombre', (await filas())[0] === 'Mobile Fighter|16 de 56 listas');
check('sin errores de consola', errs.length === 0, errs);

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
