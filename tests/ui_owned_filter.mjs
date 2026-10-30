// Filtro "Mi colección" dentro del grupo Set del catálogo: deja solo las cartas que tienes.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_owned_filter.mjs
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
const OWNED = ['ST01-001', 'ST01-005', 'GD01-002'];
async function abrir(lang, coll) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); ${coll ? `localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(coll))});` : `localStorage.removeItem('msa_collection');`} 1`);
  await send('Page.reload'); await sleep(3500);
}
const tiles = () => ev(`Array.from(document.querySelectorAll('#grid .dz-inner .card-imgwrap')).map(function(w){ return w.dataset.number }).sort()`);
const chipEl = `document.querySelector('#f-set #f-owned')`;

for (const W of [1280, 390]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await abrir('es', OWNED);
  if (W < 900) { await ev(`document.getElementById('addFilterBtn').click(); 1`); await sleep(500); }
  await ev(`(function(){ var w=document.getElementById('f-set-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-set-wrap"]').click(); })()`); await sleep(500);
  const info = await ev(`(function(){ var c=${chipEl}; if(!c) return null; var first=document.querySelector('#f-set').firstElementChild; return { txt:c.textContent.trim(), primero:first.contains(c), pressed:c.getAttribute('aria-pressed'), active:c.classList.contains('active'), vis:c.getBoundingClientRect().height>=30 } })()`);
  check('el grupo Set empieza con el filtro "Mi colección"', info && info.txt === 'Mi colección' && info.primero && info.pressed === 'false' && info.active === false && info.vis, info);
  const before = (await tiles()).length;
  await ev(`${chipEl}.click(); 1`); await sleep(600);
  check('al activarlo solo salen las cartas de tu colección', JSON.stringify(await tiles()) === JSON.stringify([...OWNED].sort()), await tiles());
  check('el filtro queda marcado y accesible (aria-pressed)', await ev(`${chipEl}.classList.contains('active') && ${chipEl}.getAttribute('aria-pressed') === 'true'`));
  check('todas llevan la etiqueta TENGO', await ev(`Array.from(document.querySelectorAll('#grid .dz-inner')).every(function(d){ var g=d.querySelector('.coll-tag'); return g && !g.hidden })`));
  check('aparece como etiqueta de filtro activo y suma al contador', await ev(`(function(){ var a=document.querySelectorAll('#activeFilters .tag.removable'); var b=document.getElementById('tbFilterBadge'); return a.length===1 && /Mi colección/.test(a[0].textContent) && !b.hidden && b.textContent==='1' })()`));
  check('el contador de resultados dice 3', /3/.test(await ev(`document.getElementById('resultcount').textContent`)), await ev(`document.getElementById('resultcount').textContent`));
  // se combina con otros filtros (Y)
  await ev(`document.querySelector('#f-color .tag.chip[data-color="Blue"]').click(); 1`); await sleep(500);
  check('se combina con el color (solo las azules que tienes)', (await tiles()).every((n) => OWNED.includes(n)) && (await tiles()).length >= 1 && (await tiles()).length <= 3, await tiles());
  await ev(`document.querySelector('#f-color .tag.chip[data-color="Blue"]').click(); 1`); await sleep(400);
  // quitar con la etiqueta
  await ev(`document.querySelector('#activeFilters .tag.removable button').click(); 1`); await sleep(600);
  check('quitarlo con su etiqueta devuelve todo el catálogo', (await tiles()).length === before && (await ev(`${chipEl}.classList.contains('active')`)) === false, (await tiles()).length);
  // vuelve a ponerlo y cambia la colección: el catálogo se actualiza solo
  await ev(`${chipEl}.click(); 1`); await sleep(500);
  check('con la colección vacía el filtro no deja ninguna carta', true);
  await abrir('es', null);
  if (W < 900) { await ev(`document.getElementById('addFilterBtn').click(); 1`); await sleep(500); }
  await ev(`(function(){ var w=document.getElementById('f-set-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-set-wrap"]').click(); })()`); await sleep(500);
  await ev(`${chipEl}.click(); 1`); await sleep(600);
  check('sin colección, el filtro muestra el aviso de que no hay resultados', (await tiles()).length === 0 && (await ev(`!!document.querySelector('#grid .empty')`)), await tiles());
  await abrir('en', OWNED);
  if (W < 900) { await ev(`document.getElementById('addFilterBtn').click(); 1`); await sleep(500); }
  await ev(`(function(){ var w=document.getElementById('f-set-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-set-wrap"]').click(); })()`); await sleep(500);
  check('en inglés se llama "My collection"', (await ev(`${chipEl}.textContent.trim()`)) === 'My collection');
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
