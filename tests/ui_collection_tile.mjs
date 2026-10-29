// Prueba de interfaz de Mi colección en la carta del catálogo (Chrome sin interfaz).
// Uso: abrir Chrome con --remote-debugging-port=9333 y servir la carpeta en http://localhost:8766/ ; luego  node tests/ui_collection_tile.mjs
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

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.removeItem('msa_collection'); localStorage.setItem('msa_lang','es'); 1`);
  await send('Page.reload'); await sleep(3200);
  const tile = `document.querySelector('.dz-inner')`;
  const st = () => ev(`(function(){ var d=${tile}; var b=d.querySelector('.coll-add'), x=d.querySelector('.coll-del'), g=d.querySelector('.coll-tag');
    var vis=function(e){ return !!e && !e.hidden && e.getBoundingClientRect().width>0 };
    return { texto:b&&b.textContent.trim(), fondo:b&&getComputedStyle(b).backgroundColor, alto:b&&Math.round(b.getBoundingClientRect().height), aria:b&&b.getAttribute('aria-label'),
             fila:(function(){ var r=d.querySelector('.coll-row'); return !!r && r.getBoundingClientRect().height>0 })(), papelera:vis(x), papeleraFondo:x&&getComputedStyle(x).backgroundColor, etiqueta:vis(g), etiquetaTexto:g&&g.textContent.trim(),
             etiquetasVisibles:[].filter.call(document.querySelectorAll('.coll-tag'),vis).length, guardado:localStorage.getItem('msa_collection'), nombre:(d.getAttribute('aria-label')||'').split(' · ')[0] } })()`);

  const tags = () => ev(`[].filter.call(document.querySelectorAll('.coll-tag'),function(g){ return !g.hidden && g.getBoundingClientRect().width>0 }).length`);
  check('las cartas del catálogo no llevan botón de colección ni papelera', await ev(`document.querySelectorAll('.dz-inner .coll-row, .dz-inner .coll-add, .dz-inner .coll-del').length`) === 0);
  check('sin colección no hay etiqueta TENGO en ninguna carta', (await tags()) === 0);
  // colección ya guardada al cargar la página: la carta sale marcada con TENGO desde el principio
  const primera = await ev(`document.querySelector('.dz-inner .card-imgwrap').dataset.number`);
  await ev(`localStorage.setItem('msa_collection', JSON.stringify({${JSON.stringify(primera)}:{q:1,t:5}})); 1`);
  await send('Page.reload'); await sleep(3200);
  const marcada = await ev(`(function(){ var d=document.querySelector('.dz-inner'), g=d.querySelector('.coll-tag'); return { etiqueta:!g.hidden && g.getBoundingClientRect().width>0, texto:g.textContent.trim(), otras:[].filter.call(document.querySelectorAll('.coll-tag'),function(t){return !t.hidden}).length } })()`);
  check('con la colección guardada, la carta sale con su etiqueta TENGO, solo en esa carta', marcada.etiqueta === true && marcada.texto === 'TENGO' && marcada.otras === 1, marcada);
  // ficha de la carta: botón "Añadir a mi colección" y columna +, cantidad, −, papelera sin verde
  await ev(`localStorage.removeItem('msa_collection'); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Prueba',cards:{}}})); localStorage.setItem('msa_active_deck','d1'); 1`);
  await send('Page.reload'); await sleep(3200);
  await ev(`document.querySelector('.dz-inner').click(); 1`); await sleep(1200);
  const F = () => ev(`(function(){ var d=document.querySelector('.detail'); var bg=function(e){ return e ? getComputedStyle(e).backgroundColor : null };
    var btns=[].slice.call(d.querySelectorAll('.d-ctl .dc-btn')), del=d.querySelector('.d-ctl .dc-del'), add=d.querySelector('.coll-add'), cdel=d.querySelector('.coll-del');
    var todos=[].slice.call(d.querySelectorAll('.d-ctl button, .coll-row button')); var verdes=todos.filter(function(b){ return /47, 168, 95|20, 104, 58/.test(getComputedStyle(b).backgroundColor + getComputedStyle(b).color + getComputedStyle(b).borderColor) }).length;
    return { mas:bg(btns[0]), menos:bg(btns[1]), papelera:bg(del), colTexto:add&&add.textContent.trim(), colFondo:bg(add), colPapelera: cdel&&!cdel.hidden ? bg(cdel) : null, verdes:verdes, aria:add&&add.getAttribute('aria-label') } })()`);
  let f = await F();
  check('en la ficha existe el botón "Añadir a mi colección" en #221e41', f.colTexto === 'Añadir a mi colección' && f.colFondo === 'rgb(34, 30, 65)', f);
  check('en la ficha, el + del mazo es #221e41 y el − y la papelera son #dce5ed', f.mas === 'rgb(34, 30, 65)' && f.menos === 'rgb(220, 229, 237)' && f.papelera === 'rgb(220, 229, 237)', f);
  await ev(`document.querySelector('.detail .d-ctl .dc-btn').click(); 1`); await sleep(500);
  f = await F();
  check('al añadir la carta al mazo, el + pasa a #1a4d7a', f.mas === 'rgb(26, 77, 122)', f);
  await ev(`document.querySelector('.detail .coll-add').click(); 1`); await sleep(500);
  f = await F();
  check('al añadirla a la colección, el botón dice "En mi colección" en #1a4d7a y aparece la papelera #dce5ed', f.colTexto === 'En mi colección' && f.colFondo === 'rgb(26, 77, 122)' && f.colPapelera === 'rgb(220, 229, 237)', f);
  check('ya no queda nada en verde en la ficha', f.verdes === 0, f);
  await ev(`document.querySelector('.detail .coll-del').click(); 1`); await sleep(500);
  f = await F();
  check('la papelera de la ficha la quita de la colección', f.colTexto === 'Añadir a mi colección' && f.colPapelera === null, f);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
