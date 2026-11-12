// Filtros en móvil: botón contextual «Borrar» y apertura/cierre suave de la hoja de filtros. Escritorio sin cambios.
// Límites: 30 s por orden y 4 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_filtros_movil.mjs
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (4 min) en: ' + paso); process.exit(3); }, 240000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const MOTION = (v) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: v }] });
const MAZOS = { d1: { name: 'Mazo de prueba', cards: { 'GD01-001': 2 }, updatedAt: 1700000000000 } };

async function abrir(W, H) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es');
    localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(MAZOS))}); localStorage.setItem('msa_collection', '{"GD01-005":1}'); 1`);
  await send('Page.reload'); await sleep(3800);
}
const borrar = () => ev(`(function(){ var b=document.getElementById('tbClear'); var cs=getComputedStyle(b), r=b.getBoundingClientRect(), tb=document.getElementById('tabbar').getBoundingClientRect(), f=document.getElementById('tbFilters').getBoundingClientRect();
  return { on:b.classList.contains('on'), vis:cs.visibility, op:+cs.opacity, disp:cs.display, w:Math.round(r.width), h:Math.round(r.height), left:Math.round(r.left), right:Math.round(r.right), bottom:Math.round(r.bottom), tabTop:Math.round(tb.top), filtrosL:Math.round(f.left), filtrosR:Math.round(f.right), texto:b.textContent.trim(), aria:b.getAttribute('aria-label') } })()`);
const visible = (b) => b.vis === 'visible' && b.op > 0.9 && b.disp !== 'none';
const oculto = (b) => b.vis === 'hidden' || b.op < 0.05 || b.disp === 'none';
const quick = (n) => ev(`(function(){ var b=document.querySelectorAll('#quickFilters button')[${n}]; b.click(); return b.textContent.trim() })()`);
const info = () => ev(`({ cuenta: document.getElementById('resultcount').textContent.trim(), etiquetas: document.querySelectorAll('#activeFilters .tag').length, badgeOculto: document.getElementById('tbFilterBadge').hidden, buscar: document.getElementById('searchMain').value, orden: Array.from(document.querySelectorAll('#grid .adder')).slice(0, 12).map(function(a){ return a.dataset.number }), mazos: localStorage.getItem('msa_decks'), coleccion: localStorage.getItem('msa_collection'), hscroll: document.documentElement.scrollWidth <= innerWidth + 1 })`);
const hoja = () => ev(`(function(){ var s=document.getElementById('sidebar'), c=document.getElementById('scrim'), a=getComputedStyle(s), b=getComputedStyle(c); return { abierta:s.classList.contains('open'), tr:a.transform, op:+a.opacity, vis:a.visibility, scOp:+b.opacity, scVis:b.visibility, dur:a.transitionDuration, scDur:b.transitionDuration, prop:a.transitionProperty } })()`);

for (const [W, H] of [[320, 640], [375, 812], [430, 932]]) {
  console.log('\n== ' + W + ' px ==');
  await MOTION('no-preference'); await abrir(W, H);
  const ini = await info(); let b = await borrar();
  check('sin filtros solo está «Filtros»: «Borrar» no se ve (no desactivado: oculto)', oculto(b) && !b.on, b);
  check('la pestaña «Filtros» sigue siendo la acción principal y visible', (await ev(`getComputedStyle(document.getElementById('tbFilters')).display !== 'none' && document.getElementById('tbFilters').getBoundingClientRect().width > 40`)) === true);

  const f1 = await quick(0); await sleep(500); b = await borrar();
  check('al elegir un filtro (' + f1 + ') aparece «Borrar»', visible(b) && b.texto === 'Borrar' && b.aria === 'Borrar filtros', b);
  check('es compacto, con 44 px de alto como mínimo, dentro de la pantalla y justo encima de la pestaña «Filtros» sin tocar la barra', b.h >= 44 && b.w <= 130 && b.left >= 0 && b.right <= W && b.bottom <= b.tabTop && b.tabTop - b.bottom <= 12 && b.left < b.filtrosR && b.right > b.filtrosL - 40, b);
  const f2 = await quick(1); await sleep(400); b = await borrar();
  check('con varios filtros sigue visible', visible(b) && (await info()).etiquetas === 2, b);

  // sigue visible al abrir y cerrar el panel
  await ev(`document.getElementById('tbFilters').click(); 1`); await sleep(500);
  let h = await hoja();
  check('el panel se abre (hoja arriba y fondo oscurecido)', h.abierta && h.vis === 'visible' && h.tr === 'none' && h.op === 1 && h.scOp > 0.95, h);
  await ev(`document.getElementById('sbClose').click(); 1`); await sleep(500);
  b = await borrar(); h = await hoja();
  check('«Borrar» sigue visible tras cerrar el panel y la hoja queda oculta', visible(b) && !h.abierta && h.vis === 'hidden' && h.scOp === 0, { b, h });

  // Borrar quita todos los filtros, no toca la búsqueda, el orden ni mazos/colección
  await ev(`(function(){ var i=document.getElementById('searchMain'); i.value='a'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(700);
  const antes = await info();
  await ev(`document.getElementById('tbClear').click(); 1`); await sleep(700);
  const desp = await info(); b = await borrar();
  check('«Borrar» quita todos los filtros a la vez, sin abrir el panel ni pedir confirmación', desp.etiquetas === 0 && desp.badgeOculto && (await hoja()).abierta === false, desp);
  check('y desaparece al instante', oculto(b) && !b.on, b);
  check('el texto de búsqueda se conserva y el contador se actualiza', desp.buscar === 'a' && desp.cuenta !== antes.cuenta, [antes.cuenta, desp.cuenta]);
  check('los controles del panel quedan restablecidos (ningún filtro marcado)', (await ev(`document.querySelectorAll('#sidebar .tag.chip.active, #sidebar input:checked').length`)) === 0);
  check('mazos y colección no cambian', desp.mazos === ini.mazos && desp.coleccion === ini.coleccion);
  // sin la búsqueda el orden y el recuento vuelven a ser los iniciales
  await ev(`(function(){ var i=document.getElementById('searchMain'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(700);
  const fin = await info();
  check('quitado todo, el orden y el recuento son los del principio', JSON.stringify(fin.orden) === JSON.stringify(ini.orden) && fin.cuenta === ini.cuenta, [fin.cuenta, ini.cuenta]);

  // quitar a mano el último filtro también lo oculta
  await quick(0); await sleep(400); await quick(1); await sleep(400);
  check('de nuevo con dos filtros aparece', visible(await borrar()));
  await ev(`document.querySelector('#activeFilters .tag button').click(); 1`); await sleep(400);
  check('al quitar uno de dos sigue visible', visible(await borrar()) && (await info()).etiquetas === 1);
  await ev(`document.querySelector('#activeFilters .tag button').click(); 1`); await sleep(500);
  check('al quitar a mano el último filtro desaparece', oculto(await borrar()) && (await info()).etiquetas === 0);

  // no estorba fuera del catálogo
  await quick(0); await sleep(400);
  await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(700);
  check('en «Mazos» no aparece', oculto(await borrar()));
  await ev(`document.getElementById('tbCatalog').click(); 1`); await sleep(700);
  check('al volver al catálogo con el filtro puesto, reaparece', visible(await borrar()));
  await ev(`document.getElementById('tbClear').click(); 1`); await sleep(500);
  check('sin desbordamiento horizontal', (await info()).hscroll);
}

console.log('\n== animación de la hoja (390 px) ==');
await MOTION('no-preference'); await abrir(390, 844);
let h = await hoja();
check('cerrada: fuera de pantalla, transparente y sin velo', h.tr !== 'none' && h.op === 0 && h.vis === 'hidden' && h.scOp === 0, h);
check('transición de 240 ms en transform y de opacidad (hoja y velo), sin rebote', /0\.24s/.test(h.dur) && /transform/.test(h.prop) && /opacity/.test(h.prop) && /0\.24s/.test(h.scDur), h);
await ev(`document.getElementById('tbFilters').click(); 1`); await sleep(90);
h = await hoja();
check('a mitad de apertura la hoja está en camino (ni cerrada ni terminada) y el velo se funde a la vez', h.op > 0 && h.op < 1 && h.tr !== 'none' && h.scOp > 0 && h.scOp < 1, h);
await sleep(400); h = await hoja();
check('abierta del todo: sin transformación, opaca y con el velo al 100 %', h.tr === 'none' && h.op === 1 && h.scOp === 1 && h.vis === 'visible', h);
const y0 = await ev(`Math.round(scrollY)`);
await ev(`document.getElementById('sbClose').click(); 1`); await sleep(90);
h = await hoja();
check('a mitad de cierre sigue visible y en camino (cierre en sentido inverso, sin cortes)', h.vis === 'visible' && h.op < 1 && h.scOp < 1 && h.scOp > 0, h);
await sleep(400); h = await hoja();
check('cerrada del todo: oculta y sin saltos de scroll', h.vis === 'hidden' && h.scVis === 'hidden' && (await ev(`Math.round(scrollY)`)) === y0, h);
await ev(`document.getElementById('tbFilters').click(); 1`); await sleep(500);
await ev(`document.getElementById('scrim').click(); 1`); await sleep(500);
check('el velo también cierra la hoja', (await hoja()).abierta === false);

console.log('\n== movimiento reducido ==');
await MOTION('reduce'); await abrir(390, 844);
h = await hoja();
check('con movimiento reducido las transiciones son prácticamente instantáneas', parseFloat(h.dur) < 0.01 && parseFloat(h.scDur) < 0.01, h);
await ev(`document.getElementById('tbFilters').click(); 1`); await sleep(120);
h = await hoja();
check('y la hoja ya está abierta casi al instante', h.abierta && h.tr === 'none' && h.op === 1, h);
await MOTION('no-preference');

console.log('\n== escritorio (1280 px): sin cambios ==');
await abrir(1280, 900);
const d = await ev(`(function(){ var s=getComputedStyle(document.getElementById('sidebar')), c=getComputedStyle(document.getElementById('scrim')), tb=getComputedStyle(document.getElementById('tabbar')), b=document.getElementById('tbClear'); return { pos:s.position, op:s.opacity, vis:s.visibility, tr:s.transform, scrim:c.display, tabbar:tb.display, clearDisp:getComputedStyle(b).display, clearVis:getComputedStyle(b).visibility, rect:b.getBoundingClientRect().width } })()`);
check('el panel lateral sigue estático y opaco, sin velo ni barra inferior', d.pos !== 'fixed' && d.op === '1' && d.vis === 'visible' && d.tr === 'none' && d.scrim === 'none' && d.tabbar === 'none', d);
await ev(`document.querySelector('.sb-tagwrap .tag.chip, #sidebar .tag.chip').click(); 1`); await sleep(500);
check('en escritorio «Borrar» no existe (la barra inferior está oculta) y «Limpiar filtros» sigue donde estaba', (await ev(`document.getElementById('tbClear').getBoundingClientRect().width`)) === 0 && (await ev(`!document.getElementById('clearFilters').hidden`)) === true);

check('sin errores de JavaScript', errs.length === 0, errs.slice(0, 3));
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
