// Prueba de interfaz: filtros de Competición > Listas (solo arquetipo; orden siempre por fecha; evento solo como etiqueta al venir de Eventos).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_comp_lists.mjs
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
const MES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 };
const toNum = (txt) => { const m = /(\d+)\s+([a-z]{3})\w*\.?\s+(\d{4})/i.exec(txt); return m ? Number(m[3]) * 10000 + MES[m[2].toLowerCase()] * 100 + Number(m[1]) : 0; };

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/#competicion' }); await sleep(400); await send('Page.reload'); await sleep(4500);

  const f = await ev(`({ arch:!!document.getElementById('dlArch'), evento:!!document.getElementById('dlEvent'), orden:!!document.getElementById('dlSort'), selects:document.querySelectorAll('.dl-filters select').length })`);
  check('Listas solo tiene el desplegable de arquetipo', f.arch === true && f.evento === false && f.orden === false && f.selects === 1, f);
  const fechas = await ev(`[].map.call(document.querySelectorAll('.dl-deck .dl-edate'),function(e){return e.textContent.trim()})`);
  const nums = fechas.map(toNum);
  check('las listas salen de la más reciente a la más antigua', nums.length >= 6 && nums.every((n, i) => i === 0 || n <= nums[i - 1]) && nums.every((n) => n > 0), fechas);

  // desde Eventos: filtro por evento como etiqueta con botón para quitarlo
  await ev(`document.querySelectorAll('#compTabs .comp-tab')[4].click(); 1`); await sleep(1500);
  await ev(`document.querySelector('#compPanel .dl-actions .dp-btn-primary').click(); 1`); await sleep(1500);
  let chip = await ev(`(function(){ var c=document.querySelector('.dl-evchip'); return c ? { texto:c.textContent.replace(/\\s+/g,' ').trim(), quitar:!!c.querySelector('button'), aria:(c.querySelector('button')||{}).getAttribute && c.querySelector('button').getAttribute('aria-label'), filas:document.querySelectorAll('.dl-deck').length } : null })()`);
  check('al venir de Eventos aparece la etiqueta del evento con botón para quitarla', chip && chip.quitar === true && /Evento/.test(chip.texto) && chip.filas >= 1, chip);
  const sinSelect = await ev(`!document.getElementById('dlEvent') && !document.getElementById('dlSort')`);
  check('y sigue sin haber desplegables de evento ni de orden', sinSelect === true);
  const filasEvento = chip ? chip.filas : 0;
  await ev(`document.querySelector('.dl-evchip button').click(); 1`); await sleep(1200);
  chip = await ev(`(function(){ return { hay:!!document.querySelector('.dl-evchip'), filas:document.querySelectorAll('.dl-deck').length } })()`);
  check('al quitar la etiqueta se vuelven a ver las listas de todos los eventos', chip.hay === false && chip.filas >= filasEvento, [chip, filasEvento]);

  // desde Arquetipos: el filtro de arquetipo sigue funcionando
  await ev(`document.querySelectorAll('#compTabs .comp-tab')[2].click(); 1`); await sleep(1500);
  await ev(`document.querySelector('#compPanel .dl-actions .dp-btn-primary').click(); 1`); await sleep(1500);
  const arq = await ev(`(function(){ var s=document.getElementById('dlArch'); return { valor:s&&s.value, etiqueta:!!document.querySelector('.dl-evchip') } })()`);
  check('"Ver listas" desde Arquetipos selecciona ese arquetipo y no deja etiqueta de evento', arq.valor !== '' && arq.etiqueta === false, arq);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
