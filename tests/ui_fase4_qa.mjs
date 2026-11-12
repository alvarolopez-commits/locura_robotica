// Prueba de interfaz: fase 4 (QA). Regresiones encontradas al medir: cerrar la ficha mientras la carta aún "vuela" hacia ella
// no debe perderse (antes se ignoraba y la ficha se quedaba abierta).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_fase4_qa.mjs
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
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });   // con el vuelo de la carta activo

for (const [W, H] of [[320, 700], [390, 844]]) {
  console.log('\n== ' + W + '×' + H + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
  await send('Page.reload'); await sleep(4500);
  await ev(`document.querySelectorAll('img').forEach(function(i){ i.loading='eager' }); 1`); await sleep(1500);

  for (const [como, accion] of [['la ×', `document.querySelector('#detail .d-close').click()`], ['Escape', 'ESC'], ['tocar fuera (velo)', `document.getElementById('overlay').dispatchEvent(new MouseEvent('click',{bubbles:true}))`]]) {
    await ev(`document.querySelectorAll('#grid .card-imgwrap')[2].scrollIntoView({ block: 'center' }); 1`); await sleep(400);   // con la barra del constructor y los selectores la tercera carta puede quedar fuera de pantalla a 320 px, y entonces no hay vuelo
    const y0 = await ev(`Math.round(scrollY)`);
    await ev(`document.querySelectorAll('#grid .card-imgwrap')[2].click(); 1`); await sleep(200);   // la carta aún va de camino (vuelo de 850 ms)
    const enVuelo = await ev(`!!document.querySelector('.fly-card')`);
    if (accion === 'ESC') { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); }
    else await ev(accion + '; 1');
    await sleep(2600);
    const fin = await ev(`({ abierta: !document.getElementById('overlay').hidden, clones: document.querySelectorAll('.fly-card').length, ocultas: [].filter.call(document.querySelectorAll('#grid .card-imgwrap'), function(c){ return c.style.visibility === 'hidden' }).length, y: Math.round(scrollY) })`);
    check('cerrar con ' + como + ' durante el vuelo de apertura cierra la ficha (sin clones ni cartas ocultas, mismo scroll)', enVuelo && !fin.abierta && fin.clones === 0 && fin.ocultas === 0 && fin.y === y0, { enVuelo, fin, y0 });
  }
  // el nombre del mazo en construcción (abre el mazo) se pulsa en 44 px de alto sin mover nada: se compara con la regla antigua (34 px) en la misma página
  await ev(`localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Prueba',cards:{'ST01-002':1}}})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); 1`);
  await send('Page.reload'); await sleep(4500); await ev(elegirMazoJS('d1', { building: true })); await sleep(300);
  const medir = `(function(){ var b=document.getElementById('buildBar').getBoundingClientRect(), n=document.getElementById('bbName'), r=n.getBoundingClientRect(), tr=document.createRange(); tr.selectNodeContents(n); var t=tr.getBoundingClientRect(); return { alto:Math.round(r.height), ancho:Math.round(r.width), barra:Math.round(b.height*10)/10, textoY:Math.round((t.top - b.top)*10)/10 } })()`;
  const nuevo = await ev(medir);
  await ev(`(function(){ var s=document.createElement('style'); s.id='__viejo'; s.textContent='.bb-namebtn{ min-width:0; padding:6px 0; margin:-6px 0 }'; document.head.appendChild(s); return 1 })()`); await sleep(200);
  const viejo = await ev(medir); await ev(`document.getElementById('__viejo').remove(); 1`);
  check('el nombre del mazo en construcción mide 44×44 como mínimo (antes 34 de alto)', nuevo.alto >= 44 && nuevo.ancho >= 44 && viejo.alto === 34, { nuevo, viejo });
  check('y la barra del mazo y la posición del texto no cambian', nuevo.barra === viejo.barra && nuevo.textoY === viejo.textoY, { nuevo, viejo });
  // abrir y cerrar normal sigue funcionando después
  await ev(`document.querySelectorAll('#grid .card-imgwrap')[1].click(); 1`); await sleep(1500);
  check('la ficha se abre con normalidad después', (await ev(`!document.getElementById('overlay').hidden && !!document.querySelector('#detail .d-name')`)) === true);
  await ev(`document.querySelector('#detail .d-close').click(); 1`); await sleep(1500);
  check('y se cierra con normalidad', (await ev(`document.getElementById('overlay').hidden`)) === true);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
