// Fase 4 · A/B de la latencia del chip de filtro rápido y de abrir la ficha. Mismo navegador, misma página, CPU 4× más lenta; cada variante inyecta
// una hoja de estilos de prueba que anula una regla concreta y se mide 10 veces (el chip se pulsa y se despulsa).
// Uso: Chrome en 9333 y la app en BASE (por defecto http://localhost:8766);  node docs/qa/evidencias/chip_ab.mjs
const BASE = process.env.BASE || 'http://localhost:8766';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.result && r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: BASE + '/' }); await sleep(800);
await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
await send('Page.reload'); await sleep(4500);
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await ev(`window.__lat = async function(act, done){ var t0 = performance.now(); act(); for(var i=0;i<600 && !done();i++) await new Promise(function(r){ requestAnimationFrame(r); }); await new Promise(function(r){ requestAnimationFrame(function(){ setTimeout(r, 0); }); }); return performance.now() - t0; }; 1`);
const VARIANTS = {
  'actual': '',
  'sin máscara en .quick': '.quick{-webkit-mask-image:none !important; mask-image:none !important}',
  'sin contorno del chip activo': '.tag.chip.active{box-shadow:none !important}',
  'sin degradado del contador': '.deck-count,.dv-count{background:var(--sky) !important}',
  '"Limpiar filtros" siempre visible': '#clearFilters[hidden]{display:inline-flex !important}',
};
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const res = {};
for (const [name, css] of Object.entries(VARIANTS)) {
  await ev(`(function(){ var o=document.getElementById('__ab'); if(o) o.remove(); var s=document.createElement('style'); s.id='__ab'; s.textContent=${JSON.stringify(css)}; document.head.appendChild(s); return 1 })()`);
  await sleep(300);
  const xs = [];
  for (let i = 0; i < 10; i++) {
    xs.push(await ev(`__lat(function(){ document.querySelectorAll('#quickFilters .tag.chip')[1].click(); }, function(){ return !/^1086 de/.test(document.getElementById('resultcount').textContent); })`));
    await ev(`document.getElementById('clearFilters').click(); 1`); await sleep(500);
  }
  const ys = [];
  for (let i = 0; i < 10; i++) {
    ys.push(await ev(`__lat(function(){ document.querySelectorAll('#grid .card-imgwrap')[3].click(); }, function(){ return !document.getElementById('overlay').hidden && !!document.querySelector('#detail .d-name'); })`));
    await ev(`document.querySelector('#detail .d-close').click(); 1`);
    for (let k = 0; k < 60 && !(await ev(`document.getElementById('overlay').hidden && !document.querySelector('.fly-card')`)); k++) await sleep(100);
    await sleep(200);
  }
  res[name] = { chip: Math.round(med(xs)), chipValores: xs.map(Math.round).join(' '), ficha: Math.round(med(ys)), fichaValores: ys.map(Math.round).join(' ') };
}
console.log(JSON.stringify(res, null, 1));
ws.close(); process.exit(0);
