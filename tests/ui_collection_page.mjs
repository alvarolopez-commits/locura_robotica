// Prueba de interfaz: pantalla Mi colección (acceso desde el usuario, mazos iniciales, expansiones y todas).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_collection_page.mjs
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

async function load(collection) {
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es');
    ${collection ? `localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(collection))});` : `localStorage.removeItem('msa_collection');`} 1`);
  await send('Page.reload'); await sleep(3200);
}
const stored = () => ev(`JSON.parse(localStorage.getItem('msa_collection') || '[]')`);
const page = () => ev(`(function(){ var p=document.getElementById('collPage'); if(!p) return null; var rows=[].slice.call(p.querySelectorAll('.cs-row'));
  return { abierta:!p.hidden, titulo:(document.getElementById('collTitle')||{}).textContent, sub:(document.getElementById('collSub')||{}).textContent,
           pestanas:[].map.call(p.querySelectorAll('#collTabs .comp-tab'),function(b){return b.textContent.trim()}), filas:rows.map(function(r){ return { set:r.dataset.set, texto:r.textContent.replace(/\\s+/g,' ').trim(), boton:(r.querySelector('button')||{}).textContent } }),
           hScroll:document.documentElement.scrollWidth-document.documentElement.clientWidth } })()`);
const tab = (i) => ev(`document.querySelectorAll('#collTabs .comp-tab')[${i}].click(); 1`);

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await load(null);
  const btn = await ev(`(function(){ document.getElementById('avatarBtn').click(); var b=[].filter.call(document.querySelectorAll('#accountBody button'),function(b){return /Mi colección/.test(b.textContent)})[0]; return !!b })()`);
  await sleep(500);
  check('el botón "Mi colección" está en la ventana del usuario, sin iniciar sesión', btn === true, btn);
  await ev(`[].filter.call(document.querySelectorAll('#accountBody button'),function(b){return /Mi colección/.test(b.textContent)})[0].click(); 1`); await sleep(700);
  let p = await page();
  check('abre la pantalla "Mi colección"', p && p.abierta && p.titulo === 'Mi colección', p);
  check('la ventana de usuario se cierra al abrirla', (await ev(`document.getElementById('accountModal').hidden`)) === true);
  check('con la colección vacía no se ofrece copiar', (await ev(`(function(){ var b=document.getElementById('collCopy'); return !b || b.hidden })()`)) === true);
  check('hay tres pestañas', p && p.pestanas.join('|') === 'Mazos iniciales|Expansiones|Todas', p && p.pestanas);
  check('colección vacía: explica cómo empezar', p && /Aún no|empezar|vacía/i.test(p.sub), p && p.sub);
  check('hay 14 mazos iniciales ST01–ST14', p && p.filas.length === 14 && p.filas[0].set === 'ST01' && p.filas[13].set === 'ST14', p && p.filas.map((f) => f.set));
  check('ST01 tiene 16 cartas y ST09 tiene 10', p && /16 cartas/.test(p.filas[0].texto) && /10 cartas/.test(p.filas[8].texto), p && [p.filas[0].texto, p.filas[8].texto]);
  check('sin scroll horizontal', p && p.hScroll === 0, p && p.hScroll);

  await ev(`document.querySelector('#collPage .cs-row[data-set="ST01"] button').click(); 1`); await sleep(500);
  let s = await stored(); p = await page();
  check('"Añadir mazo" añade las 16 cartas de ST01', s.length === 16 && s.every((n) => n.startsWith('ST01-')), s.length);
  check('el botón pasa a "Tengo el mazo" y el total se actualiza', p.filas[0].boton === 'Tengo el mazo' && /16 cartas distintas/.test(p.sub), [p.filas[0].boton, p.sub]);

  // mazo inicial a medias: se quita una carta desde "Todas"
  await tab(2); await sleep(400);
  await ev(`document.querySelector('#collPanel .coll-del').click(); 1`); await sleep(500);
  await tab(0); await sleep(300); p = await page(); s = await stored();
  check('con una carta de menos, ST01 vuelve a decir "Añadir mazo"', s.length === 15 && p.filas[0].boton === 'Añadir mazo', [s.length, p.filas[0].boton]);
  await ev(`document.querySelector('#collPage .cs-row[data-set="ST01"] button').click(); 1`); await sleep(400);
  s = await stored();
  check('"Añadir mazo" a medias añade solo las que faltan (vuelve a 16)', s.length === 16, s.length);
  await ev(`document.querySelector('#collPage .cs-row[data-set="ST01"] button').click(); 1`); await sleep(400);
  s = await stored();
  check('"Tengo el mazo" las quita todas', s.length === 0, s.length);

  // expansiones: carta a carta con el mismo botón
  await tab(1); await sleep(400);
  const exp = await ev(`(function(){ var chips=[].map.call(document.querySelectorAll('#collPanel .tag.chip'),function(b){return b.textContent.trim()}); var rows=document.querySelectorAll('#collPanel .coll-row').length; return {chips:chips, filas:rows} })()`);
  check('"Expansiones" ofrece GD01–GD06 y EB01 con cartas y botón', exp.chips.join(',') === 'GD01,GD02,GD03,GD04,GD05,GD06,EB01' && exp.filas > 50, exp);
  await ev(`document.querySelector('#collPanel .coll-add').click(); 1`); await sleep(400);
  s = await stored();
  check('añadir una carta de una expansión la guarda', s.length === 1 && s[0].startsWith('GD01-'), s);

  // "Todas": agrupado por set, con papelera
  await tab(2); await sleep(400);
  const todas = await ev(`(function(){ return { grupos:[].map.call(document.querySelectorAll('#collPanel .cl-group h3'),function(h){return h.textContent.trim()}), papeleras:document.querySelectorAll('#collPanel .coll-del:not([hidden])').length } })()`);
  check('"Todas" lista lo añadido por set, con papelera', todas.grupos.length === 1 && /GD01/.test(todas.grupos[0]) && todas.papeleras === 1, todas);
  await ev(`document.querySelector('#collPanel .coll-del').click(); 1`); await sleep(400);
  const vacia = await ev(`(document.querySelector('#collPanel .cl-empty')||{}).textContent`);
  check('al quitar la última, "Todas" explica cómo añadir cartas', typeof vacia === 'string' && vacia.length > 10, vacia);

  // número de carta desconocido guardado: no rompe ni cuenta
  await load(['XX99-999', 'ST01-001']);
  await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(400);
  await ev(`[].filter.call(document.querySelectorAll('#accountBody button'),function(b){return /Mi colección/.test(b.textContent)})[0].click(); 1`); await sleep(700);
  p = await page();
  await ev(`window.__copiado = null; navigator.clipboard.writeText = function(t){ window.__copiado = t; return Promise.resolve(); }; document.getElementById('collCopy').click(); 1`); await sleep(400);
  const copia = await ev(`({ texto:window.__copiado, boton:document.getElementById('collCopy').textContent.trim() })`);
  check('"Copiar mi colección" copia el número y el nombre de cada carta, por set', copia.texto && /^Mi colección de Gundam Card Game/.test(copia.texto) && /\nST01\nST01-001 · Gundam/.test(copia.texto), copia);
  check('lo copiado no incluye cartas que no existen en el catálogo', copia.texto && copia.texto.indexOf('XX99') === -1, copia.texto);
  check('el botón avisa "Copiado"', copia.boton === 'Copiado', copia.boton);
  check('una carta desconocida guardada no rompe la pantalla ni se cuenta', p && p.abierta && /^1 carta distinta/.test(p.sub), p && p.sub);
  // abrir directamente por la dirección #coleccion con la colección ya guardada
  await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(400); await send('Page.reload'); await sleep(3500);
  p = await page();
  check('al abrir por #coleccion se ven los 14 mazos iniciales y el total (catálogo ya cargado)', p && p.abierta && p.filas.length === 14 && /^1 carta distinta/.test(p.sub), p && [p.filas.length, p.sub]);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
