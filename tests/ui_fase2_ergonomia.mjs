// Prueba de interfaz: Mobile UX vNext · fase 2 (ergonomía). Borrar la búsqueda desde el propio buscador, − + papelera del mazo
// pulsables a 44×44 sin pisarse y "Añadir a mi colección" como acción secundaria en la ficha.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_fase2_ergonomia.mjs
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
const deck = { d1: { name: 'Prueba', cards: { 'ST01-001': 4, 'ST01-002': 3, 'ST01-005': 2, 'ST01-010': 2 } } };

for (const [W, H] of [[320, 568], [375, 667], [390, 844]]) {
  console.log('\n== ' + W + '×' + H + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify(${JSON.stringify(deck)})); localStorage.setItem('msa_active_deck','d1'); 1`);
  await send('Page.reload'); await sleep(4500);

  // buscar con un filtro rápido activo y borrar la búsqueda con el botón del buscador
  await ev(`document.querySelectorAll('#quickFilters .tag.chip')[0].click(); 1`); await sleep(400);
  const conColor = await ev(`document.getElementById('resultcount').textContent`);
  let b = await ev(`(function(){ var b=document.getElementById('searchBtn'); return { lbl:b.getAttribute('aria-label'), clear:b.classList.contains('is-clear') } })()`);
  check('sin texto, el botón del buscador es la lupa ("Buscar")', b.lbl === 'Buscar' && !b.clear, b);
  await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='zaku'; e.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(500);
  b = await ev(`(function(){ var b=document.getElementById('searchBtn'), r=b.getBoundingClientRect(); return { lbl:b.getAttribute('aria-label'), clear:b.classList.contains('is-clear'), w:r.width, h:r.height, n:document.getElementById('resultcount').textContent } })()`);
  check('con texto pasa a "Borrar búsqueda" (×), de 44×44', b.lbl === 'Borrar búsqueda' && b.clear && b.w >= 44 && b.h >= 44, b);
  await ev(`document.getElementById('searchBtn').click(); 1`); await sleep(500);
  const tras = await ev(`({ v: document.getElementById('searchMain').value, foco: document.activeElement && document.activeElement.id, n: document.getElementById('resultcount').textContent, chip: document.querySelectorAll('#quickFilters .tag.chip')[0].getAttribute('aria-pressed'), lbl: document.getElementById('searchBtn').getAttribute('aria-label') })`);
  check('al pulsarlo se borra solo la búsqueda: el filtro de color sigue y el foco queda en el campo', tras.v === '' && tras.foco === 'searchMain' && tras.n === conColor && tras.chip === 'true' && tras.lbl === 'Buscar', { conColor, tras });

  // lista del mazo: − + papelera de 44×44 pulsables que no se pisan
  await ev(`document.getElementById('clearFilters').click(); document.getElementById('deckCount').click(); 1`); await sleep(1300);
  const zonas = await ev(`(function(){ var out=[]; [].forEach.call(document.querySelectorAll('#deckView .dv-row')[0].querySelectorAll('.dv-sbtn'), function(b){ var r=b.getBoundingClientRect(), a=getComputedStyle(b,'::after'); var l=parseFloat(a.left), tp=parseFloat(a.top); out.push({ x1:r.left+l, x2:r.right-l, w:r.width-2*l, h:r.height-2*tp }); }); return out })()`);
  check('cada botón de la fila se pulsa en al menos 44×44', zonas.length === 3 && zonas.every((z) => z.w >= 44 && z.h >= 44), zonas);
  check('las zonas pulsables vecinas no se solapan', zonas.length === 3 && zonas[0].x2 <= zonas[1].x1 + 0.5 && zonas[1].x2 <= zonas[2].x1 + 0.5, zonas);
  const tot = await ev(`(function(){ var row=document.querySelectorAll('#deckView .dv-row')[0], a=document.getElementById('dvCountTxt').textContent; row.querySelector('.dv-sbtn').click(); return [a, document.getElementById('dvCountTxt').textContent, document.getElementById('deckPillCount').textContent] })()`);
  check('quitar una copia baja el total del mazo y el de la cabecera', parseInt(tot[1]) === parseInt(tot[0]) - 1 && tot[1] === tot[2], tot);
  check('sin scroll horizontal en la ventana del mazo', (await ev(`document.documentElement.scrollWidth <= innerWidth`)) === true);
  await ev(`document.getElementById('dvBack').click(); 1`); await sleep(800);

  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
