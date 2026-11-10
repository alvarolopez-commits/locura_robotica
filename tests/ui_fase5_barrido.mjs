// Barrido de calidad (Fase 5): recorre las pantallas principales en 360/390/430/768/1440 px con datos de prueba y mide, sin juzgar:
// desbordamiento horizontal, objetivos táctiles < 44 px, controles sin nombre accesible, imágenes sin alt, errores de consola/excepciones y respuestas >= 400.
// Falla (salida 1) solo con desbordamiento horizontal de página, excepciones o respuestas de datos propios >= 400. El resto se informa para la auditoría.
// Límites: 30 s por orden al navegador y 5 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_fase5_barrido.mjs [--ancho 390] [--json salida.json]
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (5 min) en: ' + paso); process.exit(3); }, 300000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); let errs = [], bad = [], reqs = {};
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
  else if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 160));
  else if (d.method === 'Network.responseReceived') { const u = d.params.response.url, s = d.params.response.status; if (s >= 400 && /localhost:8766/.test(u)) bad.push(s + ' ' + u.replace('http://localhost:8766', '')); }
  else if (d.method === 'Page.frameNavigated' && !d.params.frame.parentId) { reqs = {}; }
  else if (d.method === 'Network.requestWillBeSent') { const u = d.params.request.url; if (/localhost:8766\/(data|images)/.test(u) || /\.json/.test(u)) reqs[u] = (reqs[u] || 0) + 1; }
};
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const dl = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')), deck50 = dl.archetypes[0].decks[0].cards, deck50b = dl.archetypes[1].decks[0].cards;

const coll = {}; Object.entries(deck50).forEach(([k, v], i) => { coll[k] = { q: i % 3 === 0 ? v - 1 : v, t: 1 }; });
const store = {
  msa_decks: JSON.stringify({ d1: { name: 'Mazo de prueba A', favorite: true, cards: deck50 }, d2: { name: 'Mazo de prueba B', cards: deck50b } }), msa_active_deck: 'd1', msa_building: '1',
  msa_collection: JSON.stringify(coll), msa_comp_favs: JSON.stringify([{ id: 'GD06|mobile fighter', season: 'GD06', name: 'Mobile Fighter', addedAt: 1 }]),
};
const MEDIR = `(function(){
  function vis(e){ var r=e.getBoundingClientRect(), s=getComputedStyle(e); if(!(r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && e.offsetParent!==null)) return false; if(r.right <= 0 || r.left >= innerWidth) return false; var a=e; while(a && a!==document.body){ if(a.hidden || a.getAttribute('aria-hidden')==='true' || a.inert) return false; a=a.parentElement; } return true; }
  function name(e){ var n=(e.getAttribute('aria-label')||'').trim(); if(n) return n; var lb=e.getAttribute('aria-labelledby'); if(lb){ var x=document.getElementById(lb); if(x && x.textContent.trim()) return x.textContent.trim(); }
    if(e.labels && e.labels.length) return e.labels[0].textContent.trim(); var t=(e.textContent||'').trim(); if(t) return t; if(e.title) return e.title; var im=e.querySelector('img[alt]'); if(im && im.alt) return im.alt; var sv=e.querySelector('[aria-label]'); return sv ? sv.getAttribute('aria-label') : ''; }
  /* zona realmente pulsable: se sondea con elementFromPoint (incluye los ::after que amplían el botón); null = tapado por otra capa; undefined = fuera de la pantalla actual */
  function hit(e){ var r=e.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2; if(cy<0||cy>=innerHeight||cx<0||cx>=innerWidth) return undefined;
    function is(x,y){ var t=document.elementFromPoint(x,y); return t===e || e.contains(t); }
    if(!is(cx,cy)) return null; var l=0,rr=0,u=0,d=0; while(l<40&&is(cx-l-1,cy)) l++; while(rr<40&&is(cx+rr+1,cy)) rr++; while(u<40&&is(cx,cy-u-1)) u++; while(d<40&&is(cx,cy+d+1)) d++; return { w:l+rr+1, h:u+d+1 }; }
  var els = Array.from(document.querySelectorAll('button, a[href], select, input:not([type=hidden]), textarea, [role=button], [role=tab], [tabindex="0"]')).filter(vis);
  var pequenos = [], sinNombre = [];
  els.forEach(function(e){ var r=e.getBoundingClientRect(), id=(e.id?'#'+e.id:'')+(e.className && typeof e.className==='string' ? '.'+e.className.trim().split(/\\s+/).slice(0,2).join('.') : '');
    var h=hit(e), w=r.width, hh=r.height, nota='';
    if(h===null) return;   // tapado por una capa (un cajón, una ventana): no es pulsable ahora
    if(h){ w=h.w; hh=h.h; nota=' pulsable '+h.w+'x'+h.h; }
    else { var ps=getComputedStyle(e,'::after'); if(ps.content!=='none' && ps.position==='absolute'){ w=Math.max(w,44); hh=Math.max(hh,44); nota=' (fuera de pantalla: zona ampliada por ::after, sin medir)'; } }
    if(Math.min(w, hh) < 43.5 && !(e.tagName==='INPUT' && /checkbox|radio/.test(e.type))) pequenos.push(e.tagName.toLowerCase()+id+' visible '+r.width.toFixed(1)+'x'+r.height.toFixed(1)+nota);
    if(!name(e)) sinNombre.push(e.tagName.toLowerCase()+id); });
  var sinAlt = Array.from(document.querySelectorAll('img')).filter(function(i){ return vis(i) && !i.hasAttribute('alt'); }).length;
  return { overflow: document.documentElement.scrollWidth > innerWidth + 1, scrollW: document.documentElement.scrollWidth, pequenos: pequenos, sinNombre: sinNombre, sinAlt: sinAlt, controles: els.length };
})()`;
const click = async (sel, w = 500) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); await sleep(w); return r; };
async function abrir(W, H, hash) {
  paso = 'abrir ' + W + ' ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3300);
}
const PANTALLAS = [
  ['Catálogo', '', async () => {}],
  ['Detalle de carta', '', async () => { await click('#grid .card-imgwrap', 900); }],
  ['Colección', '#coleccion', async () => {}],
  ['Mis mazos', '', async (W) => { await click(W < 900 ? '#tbDecks' : '#btnMyDecks', 900); }],
  ['Detalle de mazo', '', async (W) => { await click(W < 900 ? '#tbDecks' : '#btnMyDecks', 900); await click('#dpGrid .dp-deck', 900); }],
  ['Constructor (ventana del mazo)', '', async () => { await click('#deckCount', 900); }],
  ['Comparador (mazo frente al meta)', '', async () => { await click('#bbCompare', 1500); }],
  ['Meta + Para ti', '#competicion', async () => {}],
  ['Torneos', '#competicion/torneos', async () => {}],
  ['Ficha de arquetipo', '#competicion/arquetipo/Mobile%20Fighter', async () => {}],
  ['Ficha de torneo', '#competicion/torneos', async () => { await click('.gd-event', 700); }],
];
const out = [];
const solo = process.argv.indexOf('--ancho') >= 0 ? Number(process.argv[process.argv.indexOf('--ancho') + 1]) : 0;   // para repartirlo en ejecuciones de menos de 5 minutos
for (const [W, H] of [[360, 760], [390, 844], [430, 900], [768, 1024], [1440, 900]].filter((x) => !solo || x[0] === solo)) {
  for (const [nombre, hash, pre] of PANTALLAS) {
    errs = []; bad = []; reqs = {};
    await abrir(W, H, hash); await pre(W); await sleep(300);
    const m = await ev(MEDIR); paso = nombre + ' ' + W;
    const repetidos = Object.entries(reqs).filter(([, n]) => n > 2).map(([u, n]) => n + '× ' + u.replace('http://localhost:8766', ''));
    out.push({ pantalla: nombre, ancho: W, overflow: m.overflow, scrollW: m.scrollW, pequenos: m.pequenos, sinNombre: m.sinNombre, sinAlt: m.sinAlt, controles: m.controles, errores: errs.slice(), respuestasMalas: bad.slice(), repetidos });
  }
}
const j = process.argv.indexOf('--json'); if (j >= 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
let falla = 0;
console.log('pantalla | ancho | desborda | táctiles<44 | sin nombre | img sin alt | errores | resp>=400 | peticiones repetidas');
out.forEach((o) => {
  console.log([o.pantalla, o.ancho, o.overflow ? 'SÍ (' + o.scrollW + ')' : 'no', o.pequenos.length, o.sinNombre.length, o.sinAlt, o.errores.length, o.respuestasMalas.length, o.repetidos.length].join(' | '));
  if (o.overflow || o.errores.length || o.respuestasMalas.length) falla++;
});
console.log('\n' + (falla ? falla + ' pantallas con desbordamiento, excepciones o respuestas >= 400' : 'sin desbordamiento horizontal, excepciones ni respuestas >= 400 en ' + out.length + ' combinaciones'));
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(falla ? 1 : 0);
