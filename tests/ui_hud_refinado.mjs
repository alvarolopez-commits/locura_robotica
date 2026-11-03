// Prueba de interfaz: Mobile UX vNext · opción A ("HUD refinado"). Menos altura antes de las cartas, sin cambiar funciones.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_hud_refinado.mjs
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
const deck = { d1: { name: 'Prueba', cards: { 'ST01-001': 4, 'ST01-002': 3, 'ST01-005': 2, 'ST01-010': 2, 'ST01-013': 2, 'ST01-015': 1, 'GD01-001': 2 } } };

for (const W of [320, 390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 780, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify(${JSON.stringify(deck)})); localStorage.setItem('msa_active_deck','d1'); localStorage.removeItem('msa_cat_sort'); 1`);
  await send('Page.reload'); await sleep(4500);

  const s = await ev(`(function(){
    var first = document.querySelector('#grid .dz-inner').getBoundingClientRect(), xs = {};
    [].forEach.call(document.querySelectorAll('#grid > .dz'), function(e, i){ if(i < 6) xs[Math.round(e.getBoundingClientRect().left)] = 1; });
    var h1 = document.querySelector('.pageTitle h1').getBoundingClientRect(), av = document.getElementById('avatarBtn').getBoundingClientRect();
    return { top: Math.round(first.top), cols: Object.keys(xs).length, scrollW: document.documentElement.scrollWidth, ancho: innerWidth,
      avatarJuntoAlTitulo: av.top < h1.bottom && av.left >= h1.right - 1,
      limpiarOculto: document.getElementById('clearFilters').hidden, fill: document.getElementById('deckCount').style.getPropertyValue('--fill') };
  })()`);
  check('dos columnas de cartas', W < 900 ? s.cols === 2 : s.cols >= 2, s);
  check('sin scroll horizontal', s.scrollW <= s.ancho, s);
  if (W < 900) {
    check('la primera fila de cartas empieza antes de 500 px (antes 586–629)', s.top < 500, s.top);
    check('el avatar va en la fila del título', s.avatarJuntoAlTitulo, s);
  }
  check('"Limpiar filtros" no aparece sin filtros', s.limpiarOculto === true, s);
  check('el contador del mazo lleva el progreso hacia 50 (16/50)', Math.abs(parseFloat(s.fill) - 0.32) < 1e-9, s.fill);

  await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='zaku'; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(700);
  check('con una búsqueda aparece "Limpiar filtros"', (await ev(`document.getElementById('clearFilters').hidden`)) === false);
  await ev(`document.getElementById('clearFilters').click(); 1`); await sleep(500);
  check('al limpiar vuelve a ocultarse y se recupera el catálogo', (await ev(`document.getElementById('clearFilters').hidden && /^1086 de 1086/.test(document.getElementById('resultcount').textContent)`)) === true);

  if (W < 900) {
    await ev(`document.querySelectorAll('#quickFilters .tag.chip')[1].click(); 1`); await sleep(500);
    const chip = await ev(`(function(){ var c=document.querySelectorAll('#quickFilters .tag.chip')[1], cs=getComputedStyle(c); return { pulsado:c.getAttribute('aria-pressed'), sombra:cs.boxShadow, peso:cs.fontWeight } })()`);
    check('el chip activo se distingue también por contorno y peso, no solo por color', chip.pulsado === 'true' && /inset/.test(chip.sombra) && Number(chip.peso) >= 700, chip);
    await ev(`document.getElementById('clearFilters').click(); 1`); await sleep(400);
  }
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
