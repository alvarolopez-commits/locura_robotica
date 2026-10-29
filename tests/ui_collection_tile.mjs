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
             papelera:vis(x), papeleraFondo:x&&getComputedStyle(x).backgroundColor, etiqueta:vis(g), etiquetaTexto:g&&g.textContent.trim(),
             etiquetasVisibles:[].filter.call(document.querySelectorAll('.coll-tag'),vis).length, guardado:localStorage.getItem('msa_collection'), nombre:(d.getAttribute('aria-label')||'').split(' · ')[0] } })()`);

  let s = await st();
  check('sin colección no hay etiqueta TENGO en ninguna carta', s.etiquetasVisibles === 0, s);
  check('el botón se llama "Añadir a mi colección"', s.texto === 'Añadir a mi colección', s);
  check('el botón es #221e41', s.fondo === 'rgb(34, 30, 65)', s);
  check('el botón mide al menos 44 px de alto', s.alto >= 44, s);
  check('el botón tiene nombre accesible con la carta', !!s.aria && s.aria.indexOf('Añadir a mi colección') === 0 && s.aria.indexOf(s.nombre) !== -1, s);
  check('sin añadir no se ve la papelera', s.papelera === false, s);

  await ev(`${tile}.querySelector('.coll-add').click(); 1`); await sleep(300);
  s = await st();
  check('tras añadir, el botón dice "En mi colección"', s.texto === 'En mi colección', s);
  check('tras añadir, el botón es #1a4d7a', s.fondo === 'rgb(26, 77, 122)', s);
  check('aparece la etiqueta TENGO solo en esa carta', s.etiqueta === true && s.etiquetaTexto === 'TENGO' && s.etiquetasVisibles === 1, s);
  check('aparece la papelera #dce5ed', s.papelera === true && s.papeleraFondo === 'rgb(220, 229, 237)', s);
  check('se guarda en el dispositivo', !!s.guardado && JSON.parse(s.guardado).length === 1, s);

  // idioma inglés con colección creada
  await ev(`document.querySelector('#langToggle [data-lang="en"]').click(); 1`); await sleep(900);
  s = await st();
  check('en inglés los textos cambian', s.texto === 'In my collection' && s.etiquetaTexto === 'OWNED', s);
  await ev(`document.querySelector('#langToggle [data-lang="es"]').click(); 1`); await sleep(900);

  await ev(`${tile}.querySelector('.coll-del').click(); 1`); await sleep(300);
  s = await st();
  check('al quitar la última, desaparecen etiquetas en todas las cartas', s.etiquetasVisibles === 0 && s.papelera === false, s);
  check('al quitar la última, el botón vuelve a #221e41', s.fondo === 'rgb(34, 30, 65)' && s.texto === 'Añadir a mi colección', s);
  // colección ya guardada al cargar la página: las cartas salen marcadas desde el principio, sin tocar nada
  const primera = await ev(`(function(){ return document.querySelector('.dz-inner .coll-row').dataset.number })()`);
  await ev(`localStorage.setItem('msa_collection', JSON.stringify([${JSON.stringify(primera)}])); 1`);
  await send('Page.reload'); await sleep(3200);
  const marcada = await ev(`(function(){ var d=document.querySelector('.dz-inner'), b=d.querySelector('.coll-add'), g=d.querySelector('.coll-tag'), x=d.querySelector('.coll-del');
    return { texto:b.textContent.trim(), fondo:getComputedStyle(b).backgroundColor, etiqueta:!g.hidden && g.getBoundingClientRect().width>0, papelera:!x.hidden, otras:[].filter.call(document.querySelectorAll('.coll-tag'),function(t){return !t.hidden}).length } })()`);
  check('con la colección ya guardada, la carta sale como "En mi colección" desde el principio', marcada.texto === 'En mi colección' && marcada.fondo === 'rgb(26, 77, 122)', marcada);
  check('y con su etiqueta TENGO y su papelera, solo en esa carta', marcada.etiqueta === true && marcada.papelera === true && marcada.otras === 1, marcada);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
