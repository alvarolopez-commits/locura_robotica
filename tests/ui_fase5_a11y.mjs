// Fase 5 · accesibilidad: el buscador principal tiene nombre accesible y las insignias de regla se pulsan en 44 px de alto (DESIGN.md: objetivos ≥ 44 px).
// Límites: 30 s por orden y 2 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_fase5_a11y.mjs
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (2 min) en: ' + paso); process.exit(3); }, 120000);
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

const dl = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')), deck50 = dl.archetypes[0].decks[0].cards;
async function abrir(W, H, lang) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); localStorage.setItem('msa_decks', JSON.stringify({ d1: { name: 'Mazo de prueba', cards: ${JSON.stringify(deck50)} } })); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); 1`);
  await send('Page.reload'); await sleep(4200);
}
const nombre = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var n=(e.getAttribute('aria-label')||'').trim(); if(n) return n; var l=e.getAttribute('aria-labelledby'); if(l){ var x=document.getElementById(l); return x ? x.textContent.trim() : '' } return e.labels && e.labels.length ? e.labels[0].textContent.trim() : '' })()`);

for (const [W, H] of [[390, 844], [1440, 900]]) {
  for (const lang of ['es', 'en']) {
    await abrir(W, H, lang);
    const n = await nombre('#searchMain');
    check(`${W}/${lang}: el buscador principal tiene nombre accesible (${lang === 'es' ? 'Buscar carta' : 'Search card'})`, !!n && (lang === 'es' ? /Buscar/i : /Search/i).test(n), n);
  }
}
await abrir(390, 844, 'es');
const badge = await ev(`(function(){ var b=document.querySelector('.rule-badge'); if(!b) return null; b.scrollIntoView({block:'center'}); return new Promise(function(r){ setTimeout(function(){ var q=b.getBoundingClientRect(), cx=q.left+q.width/2, cy=q.top+q.height/2; function is(x,y){ var t=document.elementFromPoint(x,y); return t===b || b.contains(t) }
  var u=0,d=0; while(u<30 && is(cx,cy-u-1)) u++; while(d<30 && is(cx,cy+d+1)) d++; r({ visible:Math.round(q.height), pulsable:u+d+1, ancho:Math.round(q.width) }) }, 300) }) })()`);
check('hay insignias de regla en el catálogo con un mazo de prueba', !!badge, badge);
check('las insignias de regla se pulsan en al menos 44 px de alto (se ven de 28)', badge && badge.pulsable >= 44 && badge.visible <= 30, badge);
check('sin errores de consola', errs.length === 0, errs);

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
