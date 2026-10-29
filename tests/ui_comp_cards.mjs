// Prueba de interfaz: Competición > Cartas con 4 botones de tipo (selección múltiple) en lugar del desplegable.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_comp_cards.mjs
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const tipoDe = {};
for (const ch of html.split('"number": "').slice(1)) {
  const n = ch.slice(0, ch.indexOf('"')); const m = /"type": "(\w+)"/.exec(ch.slice(0, 2500));
  if (m && !tipoDe[n]) tipoDe[n] = m[1];
}
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

const estado = () => ev(`(function(){ var chips=[].map.call(document.querySelectorAll('#compPanel .cp-types .tag.chip'),function(b){ return { texto:b.textContent.trim(), pulsado:b.getAttribute('aria-pressed'), activo:b.classList.contains('active'), alto:Math.round(b.getBoundingClientRect().height) } });
  var inp=document.getElementById('cpQ'); var cont=document.querySelector('#compPanel .cp-types');
  var nums=[].map.call(document.querySelectorAll('#compPanel .ml-row[data-number]'),function(r){ return r.dataset.number });
  return { chips:chips, selects:document.querySelectorAll('#compPanel .dl-filters select').length, buscador:!!inp,
           debajo: !!(inp && cont) && cont.getBoundingClientRect().top >= inp.getBoundingClientRect().bottom - 1, nums:nums } })()`);

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/#competicion' }); await sleep(400); await send('Page.reload'); await sleep(4500);
  await ev(`document.querySelectorAll('#compTabs .comp-tab')[3].click(); 1`); await sleep(1800);

  let s = await estado();
  check('ya no hay desplegable de tipo, solo el buscador', s.selects === 0 && s.buscador === true, s);
  check('hay 4 botones de tipo: Unidad, Piloto, Comando, Base', s.chips.map((c) => c.texto).join('|') === 'Unidad|Piloto|Comando|Base', s.chips);
  check('los botones están debajo del buscador', s.debajo === true, s);
  check('al empezar ninguno está pulsado (todos los tipos)', s.chips.length === 4 && s.chips.every((c) => c.pulsado === 'false' && !c.activo), s.chips);
  const tiposInicio = new Set(s.nums.map((n) => tipoDe[n]));
  check('sin filtro salen cartas de varios tipos', tiposInicio.size >= 2, [...tiposInicio]);

  await ev(`document.querySelectorAll('#compPanel .cp-types .tag.chip')[0].click(); 1`); await sleep(500);
  s = await estado();
  check('con "Unidad" pulsado solo salen unidades', s.nums.length > 0 && s.nums.every((n) => tipoDe[n] === 'UNIT') && s.chips[0].pulsado === 'true' && s.chips[0].activo, [s.chips[0], s.nums.slice(0, 5).map((n) => tipoDe[n])]);

  await ev(`document.querySelectorAll('#compPanel .cp-types .tag.chip')[1].click(); 1`); await sleep(500);
  s = await estado();
  const t2 = new Set(s.nums.map((n) => tipoDe[n]));
  check('se pueden pulsar varios a la vez: Unidad + Piloto', s.chips[0].pulsado === 'true' && s.chips[1].pulsado === 'true' && s.nums.every((n) => ['UNIT', 'PILOT'].includes(tipoDe[n])) && t2.has('UNIT') && t2.has('PILOT'), [s.chips.map((c) => c.pulsado), [...t2]]);

  await ev(`document.querySelectorAll('#compPanel .cp-types .tag.chip')[0].click(); 1`); await sleep(500);
  s = await estado();
  check('al despulsar "Unidad" quedan solo pilotos', s.chips[0].pulsado === 'false' && s.nums.length > 0 && s.nums.every((n) => tipoDe[n] === 'PILOT'), [s.chips.map((c) => c.pulsado), s.nums.slice(0, 5).map((n) => tipoDe[n])]);

  await ev(`document.querySelectorAll('#compPanel .cp-types .tag.chip')[1].click(); 1`); await sleep(500);
  s = await estado();
  check('sin ninguno pulsado vuelven todos los tipos', s.chips.every((c) => c.pulsado === 'false') && new Set(s.nums.map((n) => tipoDe[n])).size >= 2);

  // el filtro conserva el buscador y sobrevive a cambiar de pestaña
  await ev(`document.querySelectorAll('#compPanel .cp-types .tag.chip')[2].click(); 1`); await sleep(400);
  await ev(`document.querySelectorAll('#compTabs .comp-tab')[0].click(); 1`); await sleep(900);
  await ev(`document.querySelectorAll('#compTabs .comp-tab')[3].click(); 1`); await sleep(1200);
  s = await estado();
  check('el filtro de tipo se mantiene al volver a la pestaña', s.chips[2].pulsado === 'true', s.chips);
  check('los botones miden como el resto de chips (40 px en móvil, 34 en escritorio)', s.chips.every((c) => c.alto >= (W < 900 ? 40 : 34)), s.chips);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
