// Navegar desde Mi colección a las demás secciones (menú de la píldora y barra inferior): solo se ve la sección elegida.
// Fallo que cubre: «Competición» abría su pantalla DETRÁS de Mi colección, que seguía visible, y parecía que no pasaba nada.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_nav_desde_coleccion.mjs
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (3 min) en: ' + paso); process.exit(3); }, 180000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception?.description || '').slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: (r.result.exceptionDetails.exception?.description || '').slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra).slice(0, 400) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const col = { 'GD01-001': { q: 1, t: 1 }, 'GD01-002': { q: 1, t: 1 }, 'GD01-003': { q: 2, t: 2 } };
async function abrir(W, H) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(col))}); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(400); await send('Page.reload'); await sleep(4200);
}
// qué pantallas están a la vista (hidden=false)
const estado = () => ev(`(function(){ var v = function(i){ var e = document.getElementById(i); return !!e && !e.hidden; }; return { hash: location.hash, coll: v('collPage'), comp: v('compPage'), decks: v('decksPage'), deck: v('deckView') }; })()`);
const menu = async (btn) => { await ev(`document.querySelector('.pillWrap button').click(); 1`); await sleep(400); await ev(`document.getElementById('${btn}').click(); 1`); await sleep(1100); };
const solo = (e, cual) => ['coll', 'comp', 'decks'].every((k) => e[k] === (k === cual));

for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== desde Mi colección, ' + W + ' px ==');
  await abrir(W, H);
  check('se parte de Mi colección abierta', solo(await estado(), 'coll'), await estado());

  await menu('pmCompetition'); let e = await estado();
  check('menú → Competición: se ve Competición y Mi colección se cierra', solo(e, 'comp') && e.hash === '#competicion', e);
  await ev(`document.getElementById('compBack').click(); 1`); await sleep(900); e = await estado();
  check('«Volver» de Competición no deja Mi colección encima ni nada abierto', !e.coll && !e.comp, e);

  await abrir(W, H); await menu('pmMyDecks'); e = await estado();
  check('menú → Mis mazos: se ve Mis mazos y Mi colección se cierra', solo(e, 'decks'), e);

  await abrir(W, H); await menu('pmNewDeck'); e = await estado();
  check('menú → Nuevo mazo: Mi colección se cierra', !e.coll && !e.comp, e);

  await abrir(W, H); await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(1000); e = await estado();
  check('barra inferior → Mazos: se ve Mazos y Mi colección se cierra', solo(e, 'decks'), e);

  await abrir(W, H); await ev(`document.getElementById('tbCatalog').click(); 1`); await sleep(1000); e = await estado();
  check('barra inferior → Catálogo: no queda ninguna pantalla encima', !e.coll && !e.comp && !e.decks, e);

  // ida y vuelta: Competición → Mi colección → Competición sigue funcionando
  await abrir(W, H); await menu('pmCompetition'); await menu('pmCollection'); e = await estado();
  check('Competición → Mi colección: solo se ve Mi colección', solo(e, 'coll'), e);
  await menu('pmCompetition'); e = await estado();
  check('y otra vez → Competición: solo se ve Competición', solo(e, 'comp'), e);
}
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
