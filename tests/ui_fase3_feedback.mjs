// Prueba de interfaz: Mobile UX vNext · fase 3 (microinteracciones). Un solo anuncio accesible por cambio de copias con carta,
// copias y mazo (o el motivo real si no se pudo), sin aria-live por cada número; toques rápidos que respetan el límite; + deshabilitado
// con su motivo; la ficha se abre y cierra seguido sin dejar el velo; y "Mis mazos" con un mazo por fila.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_fase3_feedback.mjs
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
const decks = { d1: { name: 'Prueba', cards: { 'ST01-002': 2 } }, d2: { name: 'Un mazo con un nombre bastante largo para un móvil', cards: { 'ST01-001': 1 } } };
const live = () => ev(`document.getElementById('deckLive').textContent`);
const tile = (n) => `document.querySelector('#grid .adder[data-number="${n}"]')`;
const stored = (n) => ev(`(JSON.parse(localStorage.getItem('msa_decks')).d1.cards['${n}'] || 0)`);

for (const [W, H] of [[320, 700], [375, 812]]) {
  console.log('\n== ' + W + '×' + H + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify(${JSON.stringify(decks)})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); 1`);
  await send('Page.reload'); await sleep(4500);

  check('ningún número de copias lleva su propio aria-live (un solo anuncio: #deckLive)', (await ev(`document.querySelectorAll('.ad-n[aria-live], .dc-n[aria-live]').length`)) === 0 && (await ev(`document.getElementById('deckLive').getAttribute('aria-live')`)) === 'polite');

  // añadir desde la carta del catálogo
  await ev(`${tile('ST01-002')}.querySelector('.ad-plus').click(); 1`); await sleep(200);
  check('añadir anuncia carta, copias y mazo', (await live()) === 'Gundam (MA Form): 3 copias en Prueba', await live());
  check('el número de la carta se anima como en la ficha y el mazo', (await ev(`${tile('ST01-002')}.querySelector('.ad-n').classList.contains('tick')`)) === true);
  // dos toques muy seguidos: solo cuenta lo que permite el límite (3 → 4, el segundo no hace nada)
  await ev(`(function(){ var b=${tile('ST01-002')}.querySelector('.ad-plus'); b.click(); b.click(); return 1 })()`); await sleep(200);
  const n = await stored('ST01-002');
  check('dos toques rápidos con 3 copias dejan 4 (no 5) en el mazo guardado', n === 4, n);
  check('cabecera y carta coinciden con el mazo guardado', (await ev(`document.getElementById('deckPillCount').textContent`)) === '4 / 50' && (await ev(`${tile('ST01-002')}.querySelector('.ad-n').textContent`)) === '4');
  check('al llegar al máximo el anuncio lo dice', /4 copias en Prueba · Límite alcanzado$/.test(await live()), await live());
  const dis = await ev(`(function(){ var b=${tile('ST01-002')}.querySelector('.ad-plus'); return { d:b.disabled, title:b.title } })()`);
  check('el + deshabilitado explica el motivo', dis.d === true && dis.title.length > 0, dis);

  // quitar desde la ventana del mazo
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(1200);
  await ev(`document.querySelector('#deckView .dv-row .dv-sbtn').click(); 1`); await sleep(300);
  check('quitar desde la ventana del mazo también se anuncia', /^Gundam \(MA Form\): 3 copias en Prueba$/.test(await live()), await live());
  await ev(`document.getElementById('dvBack').click(); 1`); await sleep(800);

  // la ficha: abrir y cerrar varias veces seguidas sin que quede el velo ni se pierda el scroll
  await ev(`window.scrollTo(0, 600); 1`); await sleep(300);
  const y0 = await ev(`Math.round(scrollY)`);
  for (let i = 0; i < 4; i++) {
    await ev(`document.querySelectorAll('#grid .card-imgwrap')[4].click(); 1`); await sleep(120);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(120);
  }
  await sleep(1200);
  const fin = await ev(`({ velo: !document.getElementById('overlay').hidden, y: Math.round(scrollY) })`);
  check('tras abrir y cerrar la ficha 4 veces seguidas no queda el velo y el scroll sigue igual', fin.velo === false && fin.y === y0, { y0, fin });

  // Mis mazos: un mazo por fila y nombres completos
  await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(1200);
  const dp = await ev(`(function(){ var c=[].slice.call(document.querySelectorAll('#dpGrid .dp-deck')); return { n:c.length, lefts:c.map(function(e){ return Math.round(e.getBoundingClientRect().left) }), anchos:c.map(function(e){ return Math.round(e.getBoundingClientRect().width) }), cortado:c.some(function(e){ var nm=e.querySelector('.dp-deck-name'); return nm && nm.scrollWidth > nm.clientWidth + 1 }), scroll: document.documentElement.scrollWidth <= innerWidth } })()`);
  check('"Mis mazos" muestra un mazo por fila', dp.n === 2 && dp.lefts[0] === dp.lefts[1] && dp.anchos[0] === dp.anchos[1], dp);
  check('el nombre largo no se corta y no hay scroll horizontal', dp.cortado === false && dp.scroll === true, dp);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
