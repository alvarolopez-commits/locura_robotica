// Barra «Ningún mazo seleccionado»: un selector con los mazos creados para elegir uno sin salir del catálogo (y «+ Nuevo mazo»).
// Límites: 30 s por orden y 3 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_barra_elegir_mazo.mjs
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

const MAZOS = { d1: { name: 'Mazo cincuenta', cards: { 'GD01-001': 4, 'GD01-002': 4 }, updatedAt: 1700000000000 }, d2: { name: 'Mazo corto', cards: { 'GD01-003': 2, 'GD01-002': 1 }, updatedAt: 1700000001000 } };
async function abrir(W, H, decks) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es');
    ${decks ? `localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(decks))});` : ''} 1`);
  await send('Page.reload'); await sleep(3800);
}
const barra = () => ev(`(function(){ var s = document.getElementById('bbPick'); var vis = function(e){ if(!e) return false; var r = e.getBoundingClientRect(), cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && r.width > 0 && r.height > 0; };
  var r = s ? s.getBoundingClientRect() : null, b = document.getElementById('buildBar').getBoundingClientRect();
  return { selector: vis(s), opciones: s ? Array.prototype.map.call(s.options, function(o){ return o.textContent + '|' + o.value; }) : null, valor: s ? s.value : null, aria: s ? s.getAttribute('aria-label') : null,
    alto: r ? Math.round(r.height) : 0, dentro: r ? (r.left >= b.left - 1 && r.right <= b.right + 1) : null, nombre: document.getElementById('bbName').textContent, cuenta: document.getElementById('bbCount').textContent }; })()`);
const elegir = async (valor) => { await ev(`(function(){ var s = document.getElementById('bbPick'); s.value = ${JSON.stringify(valor)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`); await sleep(900); };

for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H, MAZOS);
  let b = await barra();
  check('sin mazo seleccionado, la barra trae un selector con los mazos creados', b.nombre === 'Ningún mazo seleccionado' && b.selector === true, b);
  check('opciones: «Selecciona un mazo» (marcada), los mazos creados y «+ Nuevo mazo»', JSON.stringify(b.opciones) === JSON.stringify(['Selecciona un mazo|', 'Mazo cincuenta|d1', 'Mazo corto|d2', '+ Nuevo mazo|__new']) && b.valor === '', b);
  check('el selector tiene nombre accesible, mide ≥ 44 px y cabe en la barra', !!b.aria && b.alto >= 44 && b.dentro === true, b);
  check('sin desbordamiento horizontal', (await ev('document.documentElement.scrollWidth <= innerWidth + 1')) === true);

  await elegir('d2'); b = await barra();
  check('elegir un mazo lo selecciona: la barra pasa a mostrar su nombre y su recuento, y el selector desaparece', b.nombre === 'Mazo corto' && b.cuenta === '3' && b.selector === false, b);
  check('la elección no toca los mazos guardados', JSON.stringify(await ev(`JSON.parse(localStorage.getItem('msa_decks'))`)) === JSON.stringify(MAZOS));

  await send('Page.reload'); await sleep(3800); b = await barra();
  check('al recargar vuelve a no haber ninguno seleccionado y el selector está otra vez', b.nombre === 'Ningún mazo seleccionado' && b.selector === true, b);

  await elegir('__new'); b = await barra(); const n = Object.keys(await ev(`JSON.parse(localStorage.getItem('msa_decks'))`)).length;
  check('«+ Nuevo mazo» crea un mazo y lo deja seleccionado', n === 3 && b.selector === false && /^Mazo 3$/.test(b.nombre), [n, b.nombre]);

  await abrir(W, H, null); b = await barra();
  check('sin mazos creados, el selector ofrece solo «+ Nuevo mazo»', b.selector === true && JSON.stringify(b.opciones) === JSON.stringify(['Selecciona un mazo|', '+ Nuevo mazo|__new']), b);
}
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
