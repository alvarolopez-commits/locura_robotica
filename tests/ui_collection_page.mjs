// Prueba de interfaz: pantalla Mi colección = tus cartas a modo de catálogo; "Mazos iniciales" abre la vista de ST01–ST14;
// copiar es un botón cuadrado pequeño junto a "Mazos iniciales".
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
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es');
    ${collection ? `localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(collection))});` : `localStorage.removeItem('msa_collection');`} 1`);
  await send('Page.reload'); await sleep(3200);
}
const stored = () => ev(`Object.keys(JSON.parse(localStorage.getItem('msa_collection') || '{}'))`);
const openFromAccount = async () => { await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(400); await ev(`[].filter.call(document.querySelectorAll('#accountBody button'),function(b){return /Mi colección/.test(b.textContent)})[0].click(); 1`); await sleep(800); };
const vista = () => ev(`(function(){ var p=document.getElementById('collPage'); var g=document.getElementById('collGrid'); var rows=[].slice.call(p.querySelectorAll('.cs-row'));
  var cp=document.getElementById('collCopy'), st=document.getElementById('collStarters'); var rc=cp&&cp.getBoundingClientRect(), rs=st&&st.getBoundingClientRect();
  return { abierta:!p.hidden, titulo:document.getElementById('collTitle').textContent, sub:document.getElementById('collSub').textContent,
    tabs:!!document.getElementById('collTabs'), cuadricula:!!g, tarjetas:g?g.querySelectorAll('.cc').length:0,
    vacio:(p.querySelector('.coll-empty')||{}).textContent||null, masBoton:!!p.querySelector('.coll-more'),
    mazos:rows.map(function(r){ return { set:r.dataset.set, texto:r.textContent.replace(/\\s+/g,' ').trim(), boton:(r.querySelector('button')||{}).textContent } }),
    atras:!!document.getElementById('collBackCards'),
    iniciales: st ? { visible:!st.hidden && rs.width>0, texto:st.textContent.trim() } : null,
    copiar: cp ? { visible:!cp.hidden && rc.width>0, ancho:Math.round(rc.width), alto:Math.round(rc.height), aria:cp.getAttribute('aria-label'), alLado: !!rs && rc.width>0 && Math.abs(rc.top - rs.top) < 30 && rc.left >= rs.right - 1 } : null,
    hScroll:document.documentElement.scrollWidth-document.documentElement.clientWidth } })()`);

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });

  // colección vacía
  await load(null); await openFromAccount();
  let v = await vista();
  check('abre "Mi colección" desde el usuario', v.abierta && v.titulo === 'Mi colección', v);
  check('ya no hay pestañas (Expansiones y Todas se han quitado)', v.tabs === false, v);
  check('vacía: explica cómo empezar y no hay cartas', v.tarjetas === 0 && /Mazos iniciales/.test(v.vacio || ''), v);
  check('hay un botón "Mazos iniciales"', v.iniciales && v.iniciales.visible && v.iniciales.texto === 'Mazos iniciales', v.iniciales);
  check('vacía: no se ofrece copiar', v.copiar && v.copiar.visible === false, v.copiar);

  // mazos iniciales
  await ev(`document.getElementById('collStarters').click(); 1`); await sleep(500);
  v = await vista();
  check('"Mazos iniciales" abre las 14 filas ST01–ST14', v.mazos.length === 14 && v.mazos[0].set === 'ST01' && v.mazos[13].set === 'ST14', v.mazos.map((m) => m.set));
  check('ST01 tiene 16 cartas y ST09 tiene 10', /16 cartas/.test(v.mazos[0].texto) && /10 cartas/.test(v.mazos[8].texto), [v.mazos[0].texto, v.mazos[8].texto]);
  check('en esa vista hay un botón para volver a Mi colección', v.atras === true, v);
  await ev(`document.querySelector('#collPage .cs-row[data-set="ST01"] button').click(); 1`); await sleep(500);
  let s = await stored(); v = await vista();
  check('"Añadir mazo" añade las 16 cartas de ST01', s.length === 16 && s.every((n) => n.startsWith('ST01-')), s.length);
  check('el botón pasa a "Tengo el mazo" y el total se actualiza', v.mazos[0].boton === 'Tengo el mazo' && /16 cartas distintas/.test(v.sub), [v.mazos[0].boton, v.sub]);

  // volver: las cartas salen en la cuadrícula de la colección
  await ev(`document.getElementById('collBackCards').click(); 1`); await sleep(700);
  v = await vista();
  check('al volver se ven las 16 cartas como en el catálogo', v.cuadricula && v.tarjetas === 16, [v.tarjetas]);
  check('las cartas ocupan una cuadrícula (2 columnas en móvil, más en escritorio)', await ev(`(function(){ var g=document.getElementById('collGrid'); return getComputedStyle(g).display==='grid' && getComputedStyle(g).gridTemplateColumns.split(' ').length >= ${W < 900 ? 2 : 3} })()`));
  check('"copiar" es un botón cuadrado y pequeño, al lado de "Mazos iniciales"', v.copiar && v.copiar.visible && v.copiar.ancho === v.copiar.alto && v.copiar.ancho <= 56 && v.copiar.alLado === true, v.copiar);
  check('las cartas no repiten "TENGO" ni la fila "En mi colección"', await ev(`document.querySelector('#collGrid').textContent.indexOf('TENGO') === -1 && !document.querySelector('#collGrid .coll-row')`));
  check('el botón de copiar tiene nombre accesible', v.copiar && /Copiar mi colección/.test(v.copiar.aria), v.copiar);

  // quitar una carta con su papelera: desaparece de la cuadrícula
  await ev(`document.querySelector('#collGrid .cc .cc-minus').click(); 1`); await sleep(500); await ev(`document.getElementById('confirmOk').click(); 1`); await sleep(500);
  s = await stored(); v = await vista();
  check('quitar una carta (− y confirmar) la saca de la cuadrícula', s.length === 15 && v.tarjetas === 15, [s.length, v.tarjetas]);

  // mazo inicial a medias
  await ev(`document.getElementById('collStarters').click(); 1`); await sleep(500);
  v = await vista();
  check('con una carta de menos, ST01 vuelve a decir "Añadir mazo"', v.mazos[0].boton === 'Añadir mazo' && /15 de 16/.test(v.mazos[0].texto), v.mazos[0]);
  await ev(`document.querySelector('#collPage .cs-row[data-set="ST01"] button').click(); 1`); await sleep(400);
  check('"Añadir mazo" a medias añade solo las que faltan (vuelve a 16)', (await stored()).length === 16);
  await ev(`document.querySelector('#collPage .cs-row[data-set="ST01"] button').click(); 1`); await sleep(400);
  check('"Tengo el mazo" las quita todas', (await stored()).length === 0);
  await ev(`document.getElementById('collBackCards').click(); 1`); await sleep(600);
  v = await vista();
  check('colección vacía otra vez: sin cartas y sin botón de copiar', v.tarjetas === 0 && v.copiar.visible === false, v);

  // paginación como en el inicio
  await load(Array.from({ length: 60 }, (_, i) => 'GD01-' + String(i + 1).padStart(3, '0')));
  await openFromAccount();
  v = await vista();
  check('con muchas cartas se pinta por tandas (48) y hay "mostrar más"', v.tarjetas === 48 && v.masBoton === true, [v.tarjetas, v.masBoton]);
  await ev(`document.querySelector('#collPage .coll-more').click(); 1`); await sleep(700);
  v = await vista();
  check('"mostrar más" completa las 60', v.tarjetas === 60 && v.masBoton === false, [v.tarjetas, v.masBoton]);

  // copiar la colección
  await load(['XX99-999', 'ST01-001']);
  await openFromAccount();
  v = await vista();
  check('una carta desconocida guardada no rompe la pantalla ni se cuenta', v.abierta && /^1 carta distinta/.test(v.sub) && v.tarjetas === 1, [v.sub, v.tarjetas]);
  await ev(`window.__copiado = null; navigator.clipboard.writeText = function(t){ window.__copiado = t; return Promise.resolve(); }; document.getElementById('collCopy').click(); 1`); await sleep(400);
  const copia = await ev(`({ texto:window.__copiado, aria:document.getElementById('collCopy').getAttribute('aria-label'), copiado:document.getElementById('collCopy').dataset.copied })`);
  check('copiar da el número y el nombre de cada carta, por set', copia.texto && /^Mi colección de Gundam Card Game/.test(copia.texto) && /\nST01\nST01-001 · Gundam/.test(copia.texto), copia);
  check('lo copiado no incluye cartas que no existen en el catálogo', copia.texto && copia.texto.indexOf('XX99') === -1, copia.texto);
  check('el botón avisa "Copiado" (accesible y visual)', copia.copiado === 'true' && /Copiado/.test(copia.aria), copia);

  // apertura directa por dirección
  await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(400); await send('Page.reload'); await sleep(3500);
  v = await vista();
  check('al abrir por #coleccion se ven las cartas ya cargadas', v.abierta && v.tarjetas === 1, [v.abierta, v.tarjetas]);
  check('sin scroll horizontal', v.hScroll === 0, v.hScroll);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
