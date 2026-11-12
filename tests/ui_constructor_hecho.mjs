// F5-06 · «Hecho»: salir del modo construcción desde la ventana del mazo, sin perder nada, con teclado y con la sincronización pendiente.
// Límites: 30 s por orden y 4 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_constructor_hecho.mjs
import { elegirMazoJS } from './_elegir_mazo.mjs';
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (4 min) en: ' + paso); process.exit(3); }, 240000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fake = fs.readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
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

const deck50 = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')).archetypes[0].decks[0].cards;
const deck49 = Object.assign({}, deck50); const k0 = Object.keys(deck49)[0]; deck49[k0] -= 1;
const MAZO = { d1: { name: 'Mazo de prueba', cards: deck49, updatedAt: 1700000000000 } };
const FAKE = fake + `;(function(){ var S = FakeSupabase.makeServer(); window.__S = S; var session = null, listeners = [];
  Object.defineProperty(window, 'SUPABASE_CONFIG', { value: { url: 'https://fake.supabase.co', anonKey: 'fake' }, writable: false });
  window.supabase = { createClient: function(){ var c = S.client('u1'); c.auth = { getSession: function(){ return Promise.resolve({ data: { session: session } }); }, onAuthStateChange: function(cb){ listeners.push(cb); return { data: { subscription: {} } }; },
    signInWithOtp: function(){ return Promise.resolve({ error: null }); }, signInWithPassword: function(){ return Promise.resolve({ error: null }); }, signOut: function(){ session = null; listeners.forEach(function(cb){ cb('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); } }; return c; } };
  window.__login = function(){ session = { user: { id: 'u1', email: 'prueba@example.test' } }; listeners.forEach(function(cb){ cb('SIGNED_IN', session); }); }; })();`;
let hookId = null;
async function abrir(W, H, { building = true, cloud = false } = {}) {
  paso = 'abrir ' + W;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId }); hookId = null;
  if (cloud) hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE })).result.identifier;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(MAZO))}); localStorage.setItem('msa_active_deck','d1'); ${building ? "localStorage.setItem('msa_building','1');" : ''} 1`);
  await send('Page.reload'); await sleep(3800); await ev(elegirMazoJS('d1', { building: building })); await sleep(300);
}
const key = async (k, code, vk, text) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(500); };
const deck = () => ev(`(function(){ var d = JSON.parse(localStorage.getItem('msa_decks') || '{}'); return d[localStorage.getItem('msa_active_deck')] || d.d1 || Object.values(d)[0] })()`);
const enServidor = () => ev(`window.__S.cards.filter(function(c){ return c.board === 'main' }).reduce(function(a, c){ return a + c.quantity }, 0)`);
const estado = () => ev(`({ building: document.body.classList.contains('is-building'), ls: localStorage.getItem('msa_building'), barra: !document.getElementById('buildBar').hidden, vista: !document.getElementById('deckView').hidden, hecho: !document.getElementById('dvDone').hidden })`);
const sinHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1`);

for (const [W, H] of [[390, 844], [360, 740], [430, 900], [1440, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H);
  let e = await estado();
  check('en modo construcción hay barra del mazo y «Hecho» aún no se ve (la ventana del mazo está cerrada)', e.building && e.barra && !e.vista);
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(800);
  e = await estado();
  check('al abrir la ventana del mazo en modo construcción aparece «Hecho»', e.vista && e.hecho);
  const g = await ev(`(function(){ var b=document.getElementById('dvDone'), r=b.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, tb=Array.from(document.querySelectorAll('.tabbar, #tabbar, nav.tabbar')).filter(function(x){ return x.offsetParent !== null && getComputedStyle(x).position === 'fixed' })[0], tr=tb ? tb.getBoundingClientRect() : null;
    var top=document.elementFromPoint(cx, cy); return { w:Math.round(r.width), h:Math.round(r.height), libre: top===b || b.contains(top), dentro: r.left>=0 && r.right<=innerWidth && r.top>=0, bajoBarra: tr ? r.bottom > tr.top : false, nombre:b.getAttribute('aria-label'), texto:b.textContent.trim(), tab:b.tabIndex } })()`);
  check('«Hecho»: mide al menos 44×44, nada lo tapa, cabe en pantalla y no queda bajo la navegación inferior', g.w >= 44 && g.h >= 44 && g.libre && g.dentro && !g.bajoBarra, g);
  check('«Hecho»: nombre accesible claro y entra en el orden de tabulación', /Hecho: salir del modo construcción/.test(g.nombre) && g.texto === 'Hecho' && g.tab >= 0, g);
  check('sin desbordamiento horizontal con «Hecho» visible', await sinHScroll());
  const antes = JSON.stringify(await deck());
  await ev(`document.getElementById('dvDone').focus(); 1`);
  await key('Enter', 'Enter', 13, '\r');
  e = await estado();
  check('con el teclado (Enter) sale del modo construcción: sin barra, sin marca guardada y la ventana se cierra', !e.building && e.ls === null && !e.barra && !e.vista, e);
  check('no se pierde nada: el mazo guardado es idéntico (cartas, nombre, fecha)', JSON.stringify(await deck()) === antes);
  check('se anuncia a lectores de pantalla, sin prometer guardado en la nube', /Has salido del modo construcción/.test(await ev(`document.getElementById('deckLive').textContent`)) && !/nube|cuenta|sincroniz/i.test(await ev(`document.getElementById('deckLive').textContent`)));
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(700);
  e = await estado();
  check('al volver a abrir el mazo «Hecho» ya no está', e.vista && !e.hecho);
  await ev(`location.reload()`); await sleep(3800);
  e = await estado();
  check('tras recargar vuelve el estado inicial (constructor sin mazo seleccionado, sin marca guardada) y el mazo sigue intacto', e.building && e.barra && e.ls === null && (await ev(`document.getElementById('bbName').textContent`)) === 'Ningún mazo seleccionado' && JSON.stringify(await deck()) === antes);
}

console.log('\n== volver a entrar y editar, y sincronización pendiente ==');
await abrir(390, 844, { building: false });
check('fuera del modo construcción, «Hecho» no se ofrece', !(await estado()).hecho);
await abrir(390, 844, { building: true, cloud: true });
await ev(`window.__login(); 1`); await sleep(2000);
await ev(`window.__S.offline = true; 1`);
await ev(`document.getElementById('deckCount').click(); 1`); await sleep(800);
await ev(`document.querySelector('#deckView [data-key="${k0}|p"]').click(); 1`); await sleep(900);   // la copia que faltaba, desde la propia ventana del mazo
const pendiente = await deck(); const nPend = Object.values(pendiente.cards).reduce((a, b) => a + b, 0);
check('sin conexión se edita igual: la carta añadida queda en el mazo local (50 cartas)', nPend === 50, nPend);
await ev(`document.getElementById('dvDone').click(); 1`); await sleep(700);
const e2 = await estado(), d2 = await deck();
check('«Hecho» con la sincronización pendiente: sale, y los cambios locales siguen intactos', !e2.building && JSON.stringify(d2.cards) === JSON.stringify(pendiente.cards));
const srvAntes = await enServidor();
check('no promete haberlo guardado en la cuenta: el servidor aún tiene 49 y el mazo local 50', !/guardad|nube|cuenta|sincroniz/i.test(await ev(`document.getElementById('deckLive').textContent`)) && srvAntes === 49 && nPend === 50, [srvAntes, nPend]);
await ev(`window.__S.offline = false; window.dispatchEvent(new Event('online')); 1`); await sleep(3500);
check('al volver la conexión, lo pendiente sube solo y el servidor llega a 50 cartas', (await enServidor()) === 50, await enServidor());
check('sin errores de consola', errs.length === 0, errs);

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
