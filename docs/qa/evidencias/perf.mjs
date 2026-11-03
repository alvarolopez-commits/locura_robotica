// Fase 4 · mediciones reproducibles con Chrome DevTools Protocol (sin librerías).
// Uso: Chrome sin interfaz con --remote-debugging-port=9333 y la app servida en BASE (por defecto http://localhost:8766)
//      node docs/qa/evidencias/perf.mjs <etiqueta> [repeticiones]  → escribe docs/qa/evidencias/perf_<etiqueta>.json
// Cada repetición usa un contexto de navegador NUEVO (perfil aislado: sin caché, sin service worker, sin datos del usuario).
// Condiciones fijas: 390×844, DPR 2, móvil; CPU 4× más lenta; red "4G lenta" (150 ms, 1,6 Mbps bajada, 750 kbps subida).
import fs from 'node:fs';
const [LABEL = 'medida', REPS = '5'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://localhost:8766';
const N = Number(REPS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NET = { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 };

function conn(url) {
  const ws = new WebSocket(url); let id = 0; const pend = new Map(), handlers = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else handlers.forEach((h) => h(d)); };
  return new Promise((r) => (ws.onopen = () => r({
    send: (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); }),
    on: (h) => handlers.push(h), close: () => ws.close(),
  })));
}
const browser = await conn((await (await fetch('http://127.0.0.1:9333/json/version')).json()).webSocketDebuggerUrl);

// métricas que la propia página va anotando desde el primer byte
const PROBE = `(function(){ try{ sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed', String(Date.now())); localStorage.setItem('msa_lang','es'); }catch(e){}
  var P = window.__perf = { lcp:0, cls:0, fcp:0, long:0, longMs:0, firstTile:0 };
  try{ new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ P.lcp = e.startTime; }); }).observe({type:'largest-contentful-paint', buffered:true}); }catch(e){}
  try{ new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ if(!e.hadRecentInput) P.cls += e.value; }); }).observe({type:'layout-shift', buffered:true}); }catch(e){}
  try{ new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ if(e.name==='first-contentful-paint') P.fcp = e.startTime; }); }).observe({type:'paint', buffered:true}); }catch(e){}
  try{ new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ P.long++; P.longMs += e.duration; }); }).observe({type:'longtask', buffered:true}); }catch(e){}
  (function poll(){ if(document.querySelector && document.querySelector('#grid .dz-inner img')){ P.firstTile = performance.now(); return; } setTimeout(poll, 10); })();
})();`;

async function page(contextId) {
  const { result } = await browser.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
  const p = await conn(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  p.targetId = result.targetId; p.errors = []; p.bytes = 0; p.reqs = []; p.failed = [];
  p.on((d) => {
    if (d.method === 'Runtime.exceptionThrown') p.errors.push(d.params.exceptionDetails.exception?.description?.slice(0, 160));
    if (d.method === 'Network.loadingFinished') p.bytes += d.params.encodedDataLength;
    if (d.method === 'Network.requestWillBeSent') p.reqs.push(d.params.request.url.replace(BASE, ''));
    if (d.method === 'Network.loadingFailed' && !d.params.canceled) p.failed.push(d.params.errorText);
  });
  await p.send('Runtime.enable'); await p.send('Page.enable'); await p.send('Network.enable'); await p.send('Performance.enable');
  await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.send('Network.emulateNetworkConditions', NET);
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  p.ev = async (e) => { const r = await p.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.result && r.result.result.value; };
  return p;
}
async function load(p, url) {
  p.bytes = 0; p.reqs = [];
  await p.send('Page.navigate', { url });
  for (let i = 0; i < 400; i++) { await sleep(100); if (await p.ev(`!!(window.__perf && window.__perf.firstTile)`)) break; }
  await sleep(2500);                                                   // deja asentar LCP/CLS tras la primera tanda
  const perf = await p.ev(`JSON.stringify(window.__perf)`);
  const m = Object.fromEntries((await p.send('Performance.getMetrics')).result.metrics.map((x) => [x.name, x.value]));
  const dom = await p.ev(`document.getElementsByTagName('*').length`);
  return { ...JSON.parse(perf || '{}'), domNodes: dom, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), listeners: m.JSEventListeners, kbTransfer: Math.round(p.bytes / 1024), requests: p.reqs.length, imgs: p.reqs.filter((u) => /\.webp/.test(u)).length };
}
// latencia "toque → siguiente pintado con el cambio hecho", medida dentro de la página
const LAT = `window.__lat = async function(act, done){ var t0 = performance.now(); act(); for(var i=0;i<600 && !done();i++) await new Promise(function(r){ requestAnimationFrame(r); }); await new Promise(function(r){ requestAnimationFrame(function(){ setTimeout(r, 0); }); }); return performance.now() - t0; }; 1`;

const med = (a) => { const s = a.filter((x) => typeof x === 'number' && !isNaN(x)).sort((x, y) => x - y); return s.length ? +(s[Math.floor((s.length - 1) / 2)]).toFixed(1) : null; };
const out = { label: LABEL, base: BASE, conditions: '390x844 DPR2 móvil, CPU 4x, red 150 ms / 1,6 Mbps / 750 kbps', reps: N, runs: { cold: [], warm: [], offline: [], interact: [], memory: [] }, errors: [] };

for (let r = 0; r < N; r++) {
  const ctx = (await browser.send('Target.createBrowserContext')).result.browserContextId;
  const p = await page(ctx);
  // 1) primera visita: sin caché ni service worker
  out.runs.cold.push(await load(p, BASE + '/'));
  await sleep(4000);                                                    // el service worker termina de precargar
  // 2) segunda visita con caché y service worker
  out.runs.warm.push(await load(p, BASE + '/'));
  // 3) interacciones (mazo de prueba local, modo construcción)
  await p.ev(`localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Prueba',cards:{'ST01-002':1}}})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); 1`);
  await load(p, BASE + '/'); await p.ev(LAT);
  const it = {};
  it.search = await p.ev(`__lat(function(){ var e=document.getElementById('searchMain'); e.value='zaku'; e.dispatchEvent(new Event('input',{bubbles:true})); }, function(){ return /^22 de/.test(document.getElementById('resultcount').textContent); })`);
  it.clearSearch = await p.ev(`__lat(function(){ var e=document.getElementById('searchMain'); e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); }, function(){ return /^1086 de/.test(document.getElementById('resultcount').textContent); })`);
  it.chip = await p.ev(`__lat(function(){ document.querySelectorAll('#quickFilters .tag.chip')[1].click(); }, function(){ return !/^1086 de/.test(document.getElementById('resultcount').textContent); })`);
  await p.ev(`document.getElementById('clearFilters').click(); 1`); await sleep(300);
  it.add = await p.ev(`__lat(function(){ document.querySelector('#grid .adder[data-number="ST01-002"] .ad-plus').click(); }, function(){ return document.getElementById('deckPillCount').textContent === '2 / 50'; })`);
  it.openSheet = await p.ev(`__lat(function(){ document.querySelectorAll('#grid .card-imgwrap')[3].click(); }, function(){ return !document.getElementById('overlay').hidden && !!document.querySelector('#detail .d-name'); })`);
  it.addInSheet = await p.ev(`__lat(function(){ document.querySelector('#detail .dc-btn:not(.dc-minus)').click(); }, function(){ return document.querySelector('#detail .dc-n').textContent === '1'; })`);
  it.openDeck = await p.ev(`(async function(){ var e=document.getElementById('detail'); document.querySelector('#detail .d-close').click(); await new Promise(function(r){ setTimeout(r, 900); }); return __lat(function(){ document.getElementById('deckCount').click(); }, function(){ return !document.getElementById('deckView').hidden && !!document.querySelector('#deckView .dv-row'); }); })()`);
  out.runs.interact.push(it);
  await p.ev(`document.getElementById('dvBack').click(); 1`); await sleep(600);
  // 4) memoria: abrir y cerrar la ficha 20 veces (con recolección de basura antes de cada lectura)
  await p.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const metrics = async () => { await p.send('HeapProfiler.collectGarbage'); await sleep(300); const m = Object.fromEntries((await p.send('Performance.getMetrics')).result.metrics.map((x) => [x.name, x.value])); return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents }; };
  const m0 = await metrics();
  const waitFor = async (cond, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.ev(cond)) return true; await sleep(50); } return false; };
  let timeouts = 0;
  for (let i = 0; i < 20; i++) {
    await p.ev(`document.querySelectorAll('#grid .card-imgwrap')[${i % 8}].click(); 1`);
    if (!(await waitFor(`!document.getElementById('overlay').hidden && !document.querySelector('.fly-card')`))) timeouts++;
    await p.ev(`(document.querySelector('#detail .d-close')||{click(){}}).click(); 1`);
    if (!(await waitFor(`document.getElementById('overlay').hidden && !document.querySelector('.fly-card')`))) timeouts++;
  }
  const m1 = await metrics();
  out.runs.memory.push({ before: m0, after20: m1, timeouts, residualOverlay: await p.ev(`!document.getElementById('overlay').hidden`) });
  await p.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // 5) sin conexión, después de la precarga
  await p.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const off = await load(p, BASE + '/');
  off.cards = await p.ev(`document.querySelectorAll('#grid .dz').length`); off.deckKept = await p.ev(`document.getElementById('deckPillCount').textContent`);
  out.runs.offline.push(off);
  out.errors.push(...p.errors); if (p.failed.length) out.errors.push('recursos fallidos (offline esperados): ' + p.failed.length);
  p.close(); await browser.send('Target.disposeBrowserContext', { browserContextId: ctx });
  console.log('repetición', r + 1, 'de', N);
}
const summary = {};
for (const k of ['cold', 'warm', 'offline']) { summary[k] = {}; for (const f of ['fcp', 'lcp', 'firstTile', 'cls', 'long', 'longMs', 'domNodes', 'kbTransfer', 'requests', 'imgs']) summary[k][f] = med(out.runs[k].map((x) => x[f])); }
summary.interact = {}; for (const f of Object.keys(out.runs.interact[0] || {})) summary.interact[f] = med(out.runs.interact.map((x) => x[f]));
summary.memory = { heapBefore: med(out.runs.memory.map((x) => x.before.heapMB)), heapAfter20: med(out.runs.memory.map((x) => x.after20.heapMB)), nodesBefore: med(out.runs.memory.map((x) => x.before.nodes)), nodesAfter20: med(out.runs.memory.map((x) => x.after20.nodes)), listenersBefore: med(out.runs.memory.map((x) => x.before.listeners)), listenersAfter20: med(out.runs.memory.map((x) => x.after20.listeners)), overlayResidual: out.runs.memory.some((x) => x.residualOverlay), ciclosConEspera: out.runs.memory.reduce((a, x) => a + x.timeouts, 0) };
summary.offline.cards = med(out.runs.offline.map((x) => x.cards));
out.summary = summary;
fs.writeFileSync(new URL(`./perf_${LABEL}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary, null, 1)); console.log('errores:', out.errors.length ? out.errors : 'ninguno');
browser.close(); process.exit(0);
