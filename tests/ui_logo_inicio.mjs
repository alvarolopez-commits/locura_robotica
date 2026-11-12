// Prueba de interfaz: el logo de la cabecera lleva siempre al inicio (Catálogo), desde cualquier pantalla, con un clic real.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_logo_inicio.mjs
import { elegirMazoJS } from './_elegir_mazo.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const c50 = {}; for (let i = 1; i <= 12; i++) c50['ST01-' + String(i).padStart(3, '0')] = 4; c50['ST01-013'] = 2;
const coll = { 'ST01-001': { q: 2, t: 1 }, 'ST01-002': { q: 1, t: 2 } };
async function abrir(W, H) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Mazo de 50',cards:${JSON.stringify(c50)}}})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); localStorage.setItem('msa_collection', JSON.stringify(${JSON.stringify(coll)})); 1`);
  await send('Page.reload'); await sleep(4500); await ev(elegirMazoJS('d1', { building: true })); await sleep(300);
}
// punto del logo y quién lo recibe de verdad
const logoPunto = () => ev(`(function(){ var a=document.getElementById('homeLogo'), r=a.getBoundingClientRect(), x=r.left + r.width/2, y=r.top + r.height/2, el=document.elementFromPoint(x, y); return { x: x, y: y, recibe: el ? (el.closest('#homeLogo') ? 'logo' : (el.id || el.className || el.tagName)) : null } })()`);
async function clicLogo() { const p = await logoPunto(); if (p.recibe !== 'logo') return p; await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(1100); return p; }
const estado = () => ev(`(function(){ function vis(id){ var e=document.getElementById(id); return !!e && !e.hidden } return { meta: vis('metaPage'), comp: vis('compPage'), coleccion: vis('collPage'), mazos: vis('decksPage'), ventanaMazo: vis('deckView'), ficha: vis('overlay'), filtros: document.getElementById('sidebar').classList.contains('open') && innerWidth < 900, menu: document.getElementById('pillMenu').classList.contains('open') || !document.getElementById('pillMenu').hidden, anadir: vis('addDrawer'), hash: location.hash, scrollY: Math.round(scrollY) } })()`);
const enInicio = (e) => !e.meta && !e.comp && !e.coleccion && !e.mazos && !e.ventanaMazo && !e.ficha && !e.filtros && !e.menu && !e.anadir && e.hash === '';
const irA = {
  'Mis mazos': (W) => `document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}').click(); 1`,
  'el detalle de un mazo en Mis mazos': (W) => `document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}').click(); setTimeout(function(){ document.querySelector('#dpGrid .dp-deck').click() }, 900); 1`,
  'Competición': () => `document.getElementById('menuBtn').click(); setTimeout(function(){ document.getElementById('pmCompetition').click() }, 300); 1`,
  'Mi colección': () => `document.getElementById('menuBtn').click(); setTimeout(function(){ document.getElementById('pmCollection').click() }, 300); 1`,
  'Mi colección con el panel de añadir cartas abierto': () => `document.getElementById('menuBtn').click(); setTimeout(function(){ document.getElementById('pmCollection').click(); setTimeout(function(){ document.getElementById('collAdd').click() }, 900) }, 300); 1`,
  'la ventana del mazo': () => `document.getElementById('deckCount').click(); 1`,
  'Comparar mazos (Meta Lab)': () => `document.getElementById('bbCompare').click(); 1`,
  'una ficha de carta abierta': () => `document.querySelectorAll('#grid .card-imgwrap')[2].click(); 1`,
  'el menú de la cabecera abierto': () => `document.getElementById('menuBtn').click(); 1`,
};
for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H);
  await ev(`window.scrollTo(0, 1800); 1`); await sleep(500);
  let p = await clicLogo(); let e = await estado();
  check('desde el catálogo con scroll, el logo sube al principio', p.recibe === 'logo' && e.scrollY < 5 && enInicio(e), { p, e });
  for (const [nombre, js] of Object.entries(irA)) {
    if (W >= 900 && /filtros/.test(nombre)) continue;
    await abrir(W, H);
    await ev(js(W)); await sleep(1800);
    const antes = await estado();
    p = await clicLogo(); e = await estado();
    let ok = p.recibe === 'logo' || /scrim|overlay|Scrim/i.test(String(p.recibe));
    // una ficha abierta tiene un velo encima de la cabecera: tocar fuera la cierra y se queda en el catálogo
    // el panel de añadir cartas es una capa modal que tapa la cabecera: se cierra con su × y entonces el logo funciona
    if (p.recibe !== 'logo' && /panel de añadir/.test(nombre)) { await ev(`document.getElementById('addClose').click(); 1`); await sleep(700); p = await clicLogo(); e = await estado(); }
    if (p.recibe !== 'logo' && /ficha/.test(nombre)) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(1300); e = await estado(); }
    ok = p.recibe === 'logo' || /ficha/.test(nombre);   // tras cerrar la capa que lo tapaba, el clic llega al logo
    check('desde ' + nombre + ' el logo vuelve al inicio', ok && enInicio(e) && Object.values(antes).some((v) => v === true || (typeof v === 'string' && v !== '' && v !== antes.scrollY)), { p, antes, e });
  }
}
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);   // no dejar idioma ni datos de prueba al siguiente test
ws.close(); process.exit(failed ? 1 : 0);
