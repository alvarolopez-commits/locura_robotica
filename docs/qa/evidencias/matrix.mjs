// Fase 4 · matriz de QA visual y de accesibilidad en varias anchuras: desborde horizontal, texto menor de 12 px, zonas táctiles menores
// de 44 px (contando la zona ampliada con ::after), errores de consola y capturas a 320 y 390 px.
// Uso: Chrome en 9333;  node docs/qa/evidencias/matrix.mjs <etiqueta> <urlBase> [carpeta_capturas]   → matrix_<etiqueta>.json
import fs from 'node:fs';
const [LABEL, BASE, SHOTS] = process.argv.slice(2);
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); let errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 140)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const deck16 = { d1: { name: 'Prueba', cards: { 'ST01-001': 4, 'ST01-002': 3, 'ST01-005': 2, 'ST01-010': 2, 'ST01-013': 2, 'ST01-015': 1, 'GD01-001': 2 } } };
const c50 = {}; for (let i = 1; i <= 12; i++) c50['ST01-' + String(i).padStart(3, '0')] = 4; c50['ST01-013'] = 2;
const deck50 = { d1: { name: 'Mazo de 50', cards: c50 } };
const coll = { 'ST01-001': { q: 2, t: 1 }, 'ST01-002': { q: 1, t: 2 }, 'GD01-001': { q: 3, t: 3 } };

// auditoría de lo que se ve ahora mismo
const AUDIT = `(function(){
  function sel(e){ var s = e.tagName.toLowerCase(); if(e.id) s += '#' + e.id; else if(typeof e.className === 'string' && e.className.trim()) s += '.' + e.className.trim().split(/\\s+/).slice(0,2).join('.'); return s; }
  function visible(e){ var cs = getComputedStyle(e); if(cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; var r = e.getBoundingClientRect(); if(r.width < 1 || r.height < 1) return false; for(var p = e; p && p !== document.body; p = p.parentElement){ if(p.hidden || p.hasAttribute('inert')) return false; var c = getComputedStyle(p); if(c.display === 'none' || c.visibility === 'hidden') return false; } return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; }
  function eff(e){ var r = e.getBoundingClientRect(), w = r.width, h = r.height, a = getComputedStyle(e, '::after'); if(a.content !== 'none' && a.position === 'absolute'){ var l = parseFloat(a.left), tp = parseFloat(a.top), rt = parseFloat(a.right), b = parseFloat(a.bottom); if(l < 0) w -= l; if(rt < 0) w -= rt; if(tp < 0) h -= tp; if(b < 0) h -= b; } return [Math.round(w), Math.round(h)]; }
  var small = {}, tap = {}, nSmall = 0, nTap = 0, all = document.querySelectorAll('body *');
  [].forEach.call(all, function(e){
    if(e.closest('svg') && e.tagName.toLowerCase() !== 'svg') return;
    var own = [].some.call(e.childNodes, function(n){ return n.nodeType === 3 && n.textContent.trim().length; });
    if(own && visible(e)){ var fs = parseFloat(getComputedStyle(e).fontSize); if(fs < 12){ nSmall++; var k = sel(e) + ' ' + fs + 'px'; small[k] = (small[k] || 0) + 1; } }
  });
  [].forEach.call(document.querySelectorAll('button, a[href], select, input:not([type=hidden]), [role=button], [role=menuitem], [tabindex="0"]'), function(e){
    if(!visible(e) || e.disabled) return; var s = eff(e); if(s[0] < 44 || s[1] < 44){ nTap++; var k = sel(e) + ' ' + s[0] + '×' + s[1]; tap[k] = (tap[k] || 0) + 1; }
  });
  return { overflow: document.documentElement.scrollWidth > innerWidth, scrollW: document.documentElement.scrollWidth, nSmallText: nSmall, smallText: small, nSmallTargets: nTap, smallTargets: tap };
})()`;

const out = { label: LABEL, base: BASE, widths: {} };
const WIDTHS = [[320, 700], [360, 780], [375, 812], [390, 844], [430, 932], [768, 1024], [1440, 900]];
async function fresh(W, H, deck) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: BASE + '/' }); await sleep(700);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify(${JSON.stringify(deck)})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); localStorage.setItem('msa_collection', JSON.stringify(${JSON.stringify(coll)})); 1`);
  await send('Page.reload'); await sleep(4300);
  await ev(`document.querySelectorAll('img').forEach(function(i){ i.loading='eager' }); 1`); await sleep(900);
}
async function shot(W, name) { if (!SHOTS || (W !== 320 && W !== 390)) return; const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${SHOTS}/${LABEL}_${W}_${name}.png`, Buffer.from(s.result.data, 'base64')); }
async function page(W, name, act, wait = 1300) { if (act) { await ev(act); await sleep(wait); } const a = await ev(AUDIT); (out.widths[W] ||= {})[name] = a; await shot(W, name); }
const mobile = (W) => W < 900;

for (const [W, H] of WIDTHS) {
  errs = []; await fresh(W, H, deck16);
  await page(W, 'catalogo');
  await page(W, 'busqueda', `(function(){ var e=document.getElementById('searchMain'); e.value='zaku'; e.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`, 800);
  await ev(`document.getElementById('clearFilters').click(); 1`); await sleep(300);
  if (mobile(W)) { await page(W, 'filtros', `document.getElementById('tbFilters').click()`, 900); await ev(`document.getElementById('sbClose').click(); 1`); await sleep(700); }
  await page(W, 'ficha', `document.querySelectorAll('#grid .card-imgwrap')[2].click()`, 1500);
  await ev(`document.querySelector('#detail .d-close').click(); 1`); await sleep(900);
  await page(W, 'mazo', `document.getElementById('deckCount').click()`, 1300); await ev(`document.getElementById('dvBack').click(); 1`); await sleep(700);
  await page(W, 'mis_mazos', mobile(W) ? `document.getElementById('tbDecks').click()` : `document.getElementById('btnMyDecks').click()`, 1300);
  await page(W, 'coleccion', mobile(W) ? `document.getElementById('tbCollection').click()` : `document.getElementById('pmCollection') && (document.getElementById('menuBtn').click(), document.getElementById('pmCollection').click())`, 1500);
  await page(W, 'competicion', `(function(){ document.getElementById('menuBtn').click(); document.getElementById('pmCompetition').click(); return 1 })()`, 2000);
  out.widths[W].erroresConsola = errs.slice();
  // Meta Lab: hace falta un mazo de 50 cartas
  errs = []; await fresh(W, H, deck50);
  const ok = await ev(`(function(){ var b=document.getElementById('bbCompare'); if(!b || b.hidden) return false; b.click(); return true })()`); await sleep(2200);
  out.widths[W].metaLab = { botonVisible: ok, abierta: await ev(`!document.getElementById('metaPage').hidden`), ...(await ev(AUDIT)), erroresConsola: errs.slice() };
  if (W === 320 || W === 390) await shot(W, 'meta_lab');
  console.log('ancho', W, 'hecho');
}
fs.writeFileSync(new URL(`./matrix_${LABEL}.json`, import.meta.url), JSON.stringify(out, null, 1));
ws.close(); process.exit(0);
