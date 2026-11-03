// Prueba de interfaz: cabecera del detalle de un mazo en Mis mazos — composición y responsive.
// Dos grupos: título (nombre, colores, estrella) con el recuento y su estado debajo, y las acciones (Añadir cartas, Comparar →, copiar, eliminar).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_cabecera_detalle.mjs
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
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const cartas = (n) => { const o = {}; let k = 0; for (let i = 1; i <= 13 && k < n; i++) { const q = Math.min(4, n - k); o['ST01-' + String(i).padStart(3, '0')] = q; k += q; } return o; };
async function abrir(W, H, nombre, n, lang, fav) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang || 'es'}'); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:${JSON.stringify(nombre)},favorite:${!!fav},cards:${JSON.stringify(cartas(n))}}})); localStorage.setItem('msa_active_deck','d1'); 1`);
  await send('Page.reload'); await sleep(4500);
  await ev(`(document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}')).click(); 1`); await sleep(1300);
  await ev(`document.querySelector('#dpGrid .dp-deck').click(); 1`); await sleep(1300);
}
const MEDIR = `(function(){
  function R(e){ var b=e.getBoundingClientRect(); return { l:b.left, r:b.right, t:b.top, b:b.bottom, w:b.width, h:b.height } }
  var ids=['dpAddCards','dpCompare','dpCopy','dpDelete'], rs={}, vis=[];
  ids.forEach(function(i){ var e=document.getElementById(i); if(!e.hidden && e.getBoundingClientRect().width > 0){ rs[i]=R(e); vis.push(i) } });
  var solape=false, fuera=false; for(var a=0;a<vis.length;a++){ var A=rs[vis[a]]; if(A.l < -0.5 || A.r > innerWidth + 0.5) fuera=true; for(var c=a+1;c<vis.length;c++){ var B=rs[vis[c]]; if(A.l < B.r + 5.5 && B.l < A.r + 5.5 && A.t < B.b + 5.5 && B.t < A.b + 5.5) solape=true } }
  var cmp=document.getElementById('dpCompare'), cmpInfo=null; if(!cmp.hidden){ var cb=cmp.getBoundingClientRect(), lbl=cmp.querySelector('.lblCompare').getBoundingClientRect(), arr=cmp.querySelector('.cmp-arrow').getBoundingClientRect(); cmpInfo={ texto: cmp.querySelector('.lblCompare').textContent, sinCorte: cmp.scrollWidth <= cmp.clientWidth && lbl.left >= cb.left + 8 && arr.right <= cb.right - 8 && lbl.right <= arr.left, ancho: Math.round(cb.width) } }
  var nm=document.getElementById('dpNameWrap'), co=document.getElementById('dpColors'), st=document.getElementById('dpStar'), meta=document.getElementById('dpDeckMeta'), tit=document.querySelector('.dp-dtitle'), act=document.querySelector('.dp-actions');
  var hs=vis.map(function(i){ return Math.round(rs[i].h) });
  var hdr=document.querySelector('.dp-dhead').textContent.match(/\\d+\\s*\\/\\s*50/g) || [];
  return { vis: vis, hs: hs, solape: solape, fuera: fuera, cmp: cmpInfo, scrollW: document.documentElement.scrollWidth, vw: innerWidth,
    nombre: R(nm), colores: co.hidden ? null : R(co), estrella: R(st), meta: R(meta), titulo: R(tit), acciones: R(act), recuentos: hdr.length,
    metaTxt: meta.textContent.trim(), icono: (meta.querySelector('.ico')||{}).className || null, iconoAria: (meta.querySelector('.ico')||{ getAttribute(){ return null } }).getAttribute('aria-label'),
    addAncho: vis.indexOf('dpAddCards') >= 0 ? Math.round(rs.dpAddCards.w) : 0, filaCompare: rs.dpCompare ? Math.round(rs.dpCompare.t) : null, filaAdd: rs.dpAddCards ? Math.round(rs.dpAddCards.t) : null, filaCopy: rs.dpCopy ? Math.round(rs.dpCopy.t) : null, filaDel: rs.dpDelete ? Math.round(rs.dpDelete.t) : null,
    aria: { copiar: document.getElementById('dpCopy').getAttribute('aria-label'), eliminar: document.getElementById('dpDelete').getAttribute('aria-label') } } })()`;

for (const [W, H] of [[1440, 900], [1024, 800], [430, 900], [375, 812], [320, 700]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H, 'AMURACION', 50);
  const m = await ev(MEDIR);
  check('las cuatro acciones (Añadir cartas, Comparar →, copiar, eliminar) son visibles, dentro de la pantalla y sin solaparse (con separación)', m.vis.length === 4 && !m.fuera && !m.solape, m);
  check('todas miden lo mismo de alto (50 px) como controles independientes', m.hs.every((h) => h === 50), m.hs);
  check('"Comparar →" se ve completo: texto y flecha dentro del botón con su espacio, sin recortes', m.cmp && m.cmp.texto === 'Comparar' && m.cmp.sinCorte && m.cmp.ancho >= 100, m.cmp);
  check('sin desborde horizontal', m.scrollW <= m.vw, m);
  check('el recuento aparece una sola vez, con el icono de mazo completo y su etiqueta accesible', m.recuentos === 1 && /^50\/50 cartas$/.test(m.metaTxt) && /ico-full/.test(m.icono) && m.iconoAria === 'Completo', m);
  const fila = (a, b) => Math.abs((a.t + a.b) / 2 - (b.t + b.b) / 2) < 30;
  check('nombre y recuento forman un bloque: el recuento va justo debajo del nombre', m.meta.t >= m.nombre.b - 4 && m.meta.t - m.nombre.b < 28 && Math.abs(m.meta.l - m.nombre.l) < 4, [m.nombre, m.meta]);
  if (W >= 375) check('los colores y la estrella van pegados al nombre (a su derecha, en su misma línea, con poco espacio)', m.colores && m.colores.l >= m.nombre.r - 2 && m.colores.l - m.nombre.r < 24 && fila(m.colores, m.nombre) && m.estrella.l >= m.colores.r - 2 && m.estrella.l - m.colores.r < 24 && fila(m.estrella, m.nombre), { n: m.nombre, c: m.colores, e: m.estrella });
  else check('a 320 px los colores y la estrella siguen junto al nombre (a su lado o justo debajo) y dentro de la pantalla', m.colores && m.colores.r <= m.vw && m.estrella.r <= m.vw && m.colores.t - m.nombre.b < 12, { n: m.nombre, c: m.colores, e: m.estrella });
  if (W >= 900) {
    check('escritorio: título a la izquierda y acciones a la derecha, alineados por su centro y sin invadirse', m.acciones.l >= m.titulo.r - 1 && Math.abs((m.acciones.t + m.acciones.b) / 2 - (m.titulo.t + m.titulo.b) / 2) < 45, [m.titulo, m.acciones]);
    check('escritorio: las cuatro acciones en una sola línea', m.filaAdd === m.filaCompare && m.filaCompare === m.filaCopy && m.filaCopy === m.filaDel, m);
  } else {
    check('móvil/tablet: "Añadir cartas" ocupa su propia fila y debajo van Comparar, copiar y eliminar en la misma fila', m.filaAdd < m.filaCompare && m.filaCompare === m.filaCopy && m.filaCopy === m.filaDel, m);
    check('móvil/tablet: "Añadir cartas" es la acción principal, a todo el ancho', m.addAncho >= m.vw - 40, m.addAncho);
  }
}

console.log('\n== estados, nombre largo, favorito, idioma y edición ==');
await abrir(375, 812, 'AMURACION', 32);
let m = await ev(MEDIR);
check('con 32 cartas el estado es "En progreso" con el icono de progreso, sin Comparar, y Añadir cartas + copiar + eliminar en una fila', m.metaTxt === '32/50 cartas' && /ico-build/.test(m.icono) && m.iconoAria === 'En progreso' && !m.vis.includes('dpCompare') && m.filaAdd === m.filaCopy && m.filaCopy === m.filaDel && m.vis.length === 3, m);
await abrir(375, 812, 'AMURACION', 0);
m = await ev(MEDIR);
check('con 0 cartas: "0/50 cartas" con el icono de progreso y sin errores de maquetación', m.metaTxt === '0/50 cartas' && /ico-build/.test(m.icono) && !m.fuera && m.scrollW <= m.vw, m);
for (const W of [1440, 375]) {
  await abrir(W, 900, 'Zeon agresivo de Char con Zakus rojos y verdes', 50);
  m = await ev(MEDIR);
  check(W + ' px con un nombre largo: no invade las acciones ni desborda y las acciones siguen completas', !m.fuera && !m.solape && m.scrollW <= m.vw && m.cmp && m.cmp.sinCorte && (W < 900 || m.nombre.r <= m.acciones.l), m);
}
await abrir(1440, 900, 'AMURACION', 50, 'es', false);
await ev(`document.getElementById('dpStar').click(); 1`); await sleep(400);
const fav = await ev(`({ pressed: document.getElementById('dpStar').getAttribute('aria-pressed'), guardado: JSON.parse(localStorage.getItem('msa_decks')).d1.favorite })`);
check('la estrella cambia el favorito del mazo real (aria-pressed y guardado local)', fav.pressed === 'true' && fav.guardado === true, fav);
await ev(`(function(){ var e=document.getElementById('dpName'); var w0=document.getElementById('dpNameWrap').getBoundingClientRect().width; e.value='Zeon'; e.dispatchEvent(new Event('input',{bubbles:true})); window.__w0=w0; return 1 })()`); await sleep(300);
const ed = await ev(`({ w0: window.__w0, w1: document.getElementById('dpNameWrap').getBoundingClientRect().width, nombre: JSON.parse(localStorage.getItem('msa_decks')).d1.name, colorAlLado: document.getElementById('dpColors').getBoundingClientRect().left - document.getElementById('dpNameWrap').getBoundingClientRect().right })`);
check('al editar el nombre el título se ajusta a su texto, los colores lo siguen y el nombre se guarda', ed.w1 < ed.w0 && ed.nombre === 'Zeon' && ed.colorAlLado >= -2 && ed.colorAlLado < 24, ed);
await ev(`document.getElementById('dpCopy').click(); 1`); await sleep(300);
check('"Mis mazos" vuelve a la vista anterior', (await ev(`document.querySelector('.dp-back').click(); 1`)) === 1 && (await sleep(900), (await ev(`document.getElementById('dpDetail').hidden`)) === true));
await abrir(1440, 900, 'AMURACION', 50, 'en');
m = await ev(MEDIR);
check('en inglés: "Compare →" completo, estado "Complete", "50/50 cards" y etiquetas accesibles traducidas', m.cmp && m.cmp.texto === 'Compare' && m.cmp.sinCorte && m.iconoAria === 'Complete' && /^50\/50 cards$/.test(m.metaTxt) && /opy/.test(m.aria.copiar) && /elete/.test(m.aria.eliminar), m);
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);   // no dejar idioma ni datos de prueba al siguiente test
ws.close(); process.exit(failed ? 1 : 0);
