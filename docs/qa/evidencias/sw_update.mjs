// Fase 4 · F12 y F09: actualización de la PWA (versión publicada → versión actual) y funcionamiento sin conexión.
// Se sirve una copia de la versión publicada, se instala el service worker, se cambian en el servidor los archivos que difieren
// (dashboard.html y decks_sync.js) y se comprueba que la página nueva llega sin mezclar versiones, que el mazo de prueba se conserva
// y que sin conexión se usa la versión nueva completa.
// Uso: node docs/qa/evidencias/sw_update.mjs <carpeta_servida_por_serve.mjs> <puerto> <carpeta_con_la_version_nueva>
//      (la carpeta servida empieza con la versión publicada; este script copia encima dashboard.html y decks_sync.js de la nueva)
import fs from 'node:fs'; import path from 'node:path';
const [SERVED, PORT, NEWDIR] = process.argv.slice(2);
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await (async () => { const ws = new WebSocket((await (await fetch('http://127.0.0.1:9333/json/version')).json()).webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); let id = 0; const pend = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } }; return { send: (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() }; })();
const ctx = (await browser.send('Target.createBrowserContext')).result.browserContextId;
const tgt = (await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: ctx })).result.targetId;
const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${tgt}`); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errs.push('console.error: ' + (d.params.args[0] && d.params.args[0].value)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.result && r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
const rows = []; const check = (id, name, ok, extra) => { rows.push({ id, name, ok, extra }); console.log((ok ? '  PASS ' : '  FAIL ') + id + ' ' + name + (ok ? '' : '  ' + JSON.stringify(extra))); };
const esNueva = () => ev(`!!document.getElementById('deckLive')`);          // marca de la versión actual (la publicada no la tiene)
const hasSW = () => ev(`navigator.serviceWorker.getRegistration().then(function(r){ return !!(r && r.active) })`);
const load = async () => { await send('Page.navigate', { url: BASE + '/' }); await sleep(5500); };

// 1) primera visita con la versión publicada: instala el service worker y precarga
await load();
await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Prueba QA',cards:{'ST01-002':3}}})); localStorage.setItem('msa_active_deck','d1'); 1`);
await load(); await sleep(3000);
check('F12.1', 'versión publicada instalada y con service worker activo', (await hasSW()) === true && (await esNueva()) === false, { sw: await hasSW(), nueva: await esNueva() });
const cacheAntes = await ev(`caches.keys().then(function(k){ return k.join(',') })`);

// 2) en el servidor se sustituye por la versión actual
for (const f of ['dashboard.html', 'decks_sync.js']) fs.copyFileSync(path.join(NEWDIR, f), path.join(SERVED, f));

// 3) recarga con conexión: la red manda para la página y los JS, sin bucles ni versiones mezcladas
const navs = []; ws.onmessage = ((orig) => (m) => { const d = JSON.parse(m.data); if (d.method === 'Page.frameNavigated' && !d.params.frame.parentId) navs.push(d.params.frame.url); orig(m); })(ws.onmessage);
await load();
check('F12.2', 'tras recargar online llega la versión nueva', (await esNueva()) === true);
check('F12.3', 'una sola navegación (sin bucle de recargas por el service worker)', navs.length === 1, navs);
const ds = await ev(`caches.open('locura-shell-v13').then(function(c){ return c.match('/decks_sync.js') }).then(function(r){ return r.text() })`);
check('F12.4', 'la caché guarda decks_sync.js nuevo (no queda una mezcla vieja/nueva)', /pull\(withPrefs\)/.test(ds) && !/function pull\(\)/.test(ds));
check('F12.5', 'el mazo de prueba y la colección locales se conservan tras actualizar', (await ev(`document.getElementById('deckPillCount').textContent`)) === '3 / 50', await ev(`document.getElementById('deckPillCount').textContent`));
await sleep(3500);                                                          // que termine el calentamiento en segundo plano

// 4) sin conexión tras la precarga
await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await send('Page.navigate', { url: BASE + '/' }); await sleep(4500);
const cards = await ev(`document.querySelectorAll('#grid .dz').length`);
check('F09.1', 'sin conexión la app arranca con la versión nueva y el catálogo', (await esNueva()) === true && cards === 48, { nueva: await esNueva(), cards });
check('F09.2', 'sin conexión el mazo local sigue ahí', (await ev(`document.getElementById('deckPillCount').textContent`)) === '3 / 50');
await ev(`document.querySelector('#grid .adder[data-number="ST01-002"] .ad-plus, #grid .dz-inner').click(); 1`); await sleep(300);
const rec = await ev(`(async function(){ var out = {}; document.getElementById('tbDecks').click(); await new Promise(function(r){ setTimeout(r, 900); }); out.mazos = !document.getElementById('decksPage').hidden; document.getElementById('tbCollection') && document.getElementById('tbCollection').click(); await new Promise(function(r){ setTimeout(r, 900); }); out.coleccion = !!document.getElementById('collPage') && !document.getElementById('collPage').hidden; out.imagenes = [].filter.call(document.images, function(i){ return i.complete && i.naturalWidth === 0 && i.src; }).length; return out; })()`);
check('F09.3', 'sin conexión se puede navegar a Mis mazos y Mi colección', rec.mazos === true && rec.coleccion === true, rec);
check('F09.4', 'imágenes ya vistas disponibles sin conexión (sin imágenes rotas)', rec.imagenes === 0, rec);

// 5) vuelve la conexión
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await load();
check('F09.5', 'al volver la conexión la app carga normal y conserva el mazo', (await esNueva()) === true && (await ev(`document.getElementById('deckPillCount').textContent`)) !== null);
const sinRuido = errs.filter((e) => !/Failed to fetch|net::ERR|NetworkError|Load failed/i.test(String(e)));
check('F12.6', 'sin errores de JavaScript durante todo el recorrido (se ignoran los de red esperados sin conexión)', sinRuido.length === 0, sinRuido);
console.log('\n' + rows.filter((r) => r.ok).length + ' pasan · ' + rows.filter((r) => !r.ok).length + ' fallan');
fs.writeFileSync(new URL('./sw_update.json', import.meta.url), JSON.stringify({ cacheAntes, rows, errores: errs }, null, 1));
ws.close(); await browser.send('Target.disposeBrowserContext', { browserContextId: ctx }); browser.close(); process.exit(rows.some((r) => !r.ok) ? 1 : 0);
