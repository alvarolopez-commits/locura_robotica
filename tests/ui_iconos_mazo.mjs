// Prueba de interfaz: iconos de acciones y estados del constructor de mazos.
//  · copiar lista: icono de copiar en la ventana del mazo y en Mis mazos, y la acción sigue copiando
//  · mazo lleno: el aviso largo se sustituye por un chip con el icono de mazo lleno y "Mazo lleno", y con 50 cartas no se puede añadir
//  · estado en la cabecera: icono de progreso por debajo de 50 cartas e icono de mazo lleno al llegar a 50, con su texto
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_iconos_mazo.mjs
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
const c49 = {}; for (let i = 1; i <= 12; i++) c49['ST01-' + String(i).padStart(3, '0')] = 4; c49['ST01-013'] = 1;
async function abrir(W, H, lang) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang || 'es'}'); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Prueba',cards:${JSON.stringify(c49)}}})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1'); 1`);
  await send('Page.reload'); await sleep(4500);
}
const estado = () => ev(`(function(){ function m(id){ var e=document.getElementById(id), cs=e && getComputedStyle(e); return e ? { full:e.classList.contains('ico-full'), build:e.classList.contains('ico-build'), mask:(cs.webkitMaskImage||cs.maskImage||'').slice(0,18), w:Math.round(e.getBoundingClientRect().width), h:Math.round(e.getBoundingClientRect().height), color:cs.backgroundColor } : null }
  return { pill:m('deckStateIco'), barra:m('bbStateIco'), etiqueta:document.getElementById('lblBuilding').textContent, contador:document.getElementById('deckPillCount').textContent, aria:document.getElementById('deckCount').getAttribute('aria-label') } })()`);
const clickAdder = (n, sel) => ev(`document.querySelector('#grid .adder[data-number="${n}"] ${sel}').click(); 1`);

console.log('\n== 390×844 (español) ==');
await abrir(390, 844);
let e = await estado();
check('con 49 cartas: icono de progreso en la píldora superior y en la barra del mazo (con la imagen cargada)', e.pill.build && !e.pill.full && e.barra.build && e.pill.mask.startsWith('url(') && e.barra.mask.startsWith('url(') && e.barra.w > 20 && e.barra.h > 5, e);
check('con 49 cartas el estado dice "En progreso" y el contador 49 / 50', e.etiqueta === 'En progreso' && e.contador === '49 / 50', e);
const pillBg = () => ev(`getComputedStyle(document.getElementById('deckCount')).backgroundColor`);
const bg49 = await pillBg();
await clickAdder('ST01-013', '.ad-plus'); await sleep(500);
e = await estado();
check('al llegar a 50 cartas ambos iconos pasan a "mazo lleno"', e.pill.full && !e.pill.build && e.barra.full && !e.barra.build && e.contador === '50 / 50', e);
check('y el estado pasa a "Completo" (no depende solo del icono) y el botón superior lo anuncia como "Mazo completo"', e.etiqueta === 'Completo' && /Mazo completo/.test(e.aria), e);
const bg50 = await pillBg(), langBg = await ev(`getComputedStyle(document.querySelector('.lt-opt.is-active, .lt-opt[aria-pressed="true"], .lt-opt.active')||document.querySelector('.lt-opt')).backgroundColor`);
check('el botón 50 / 50 de arriba completo es el azul de acento a plena opacidad, el mismo que el botón ES (no el verde de antes)', bg50 === 'rgb(139, 205, 255)' && bg50 === langBg && bg50 !== bg49, { bg49, bg50, langBg });
const barra = await ev(`(function(){ var c=document.querySelector('.bb-count').getBoundingClientRect(), st=document.querySelector('.bb-state').getBoundingClientRect(); return { cierre: !!document.getElementById('bbClose'), eyebrow: !!document.querySelector('.bb-eyebrow'), estadoAlLado: st.left >= c.right - 1 && Math.abs((st.top + st.bottom) / 2 - (c.top + c.bottom) / 2) < 14, texto: document.querySelector('.bb-state').textContent.trim(), icono: !!document.querySelector('.bb-state .ico-full') } })()`);
check('en la barra del mazo el estado es el icono con "Completo" junto al 50/50, sin la línea de arriba y sin la ×', barra.cierre === false && barra.eyebrow === false && barra.estadoAlLado && barra.texto === 'Completo' && barra.icono, barra);
// mazo lleno en el catálogo: las tarjetas no escriben ningún aviso; solo el + deshabilitado
const tile = await ev(`(function(){ var a=document.querySelector('#grid .adder[data-number="ST01-014"]'); if(!a) return null; return { chips: a.querySelectorAll('.full-chip').length, texto: a.querySelector('.ad-why').textContent.trim(), masDeshab: a.querySelector('.ad-plus').disabled } })()`);
check('en las tarjetas del catálogo no sale ningún aviso de mazo lleno (ni chip ni frase): solo el + deshabilitado', tile && tile.chips === 0 && tile.texto === '' && tile.masDeshab === true, tile);
// ficha de una carta que no está en el mazo: sin la frase larga y sin poder añadir
await ev(`document.querySelector('#grid .card-imgwrap[data-number="ST01-014"]').click(); 1`); await sleep(1500);
const ficha = await ev(`(function(){ var d=document.getElementById('detail'), m=d.querySelector('.dl-msg'), more=d.querySelector('.dc-btn:not(.dc-minus)'); return { msg: m ? m.textContent.trim() : null, chip: !!(m && m.querySelector('.full-chip .ico-full')), mas: more ? more.disabled : null, largo: /Quita una antes|ya tiene 50/.test(d.textContent) } })()`);
check('en la ficha sale el chip "Mazo lleno" y desaparece "Este mazo ya tiene 50 cartas. Quita una antes de añadir otra."', ficha.msg === 'Mazo lleno' && ficha.chip && ficha.largo === false, ficha);
check('con 50 cartas el + de la ficha está deshabilitado (la lógica del límite no cambia)', ficha.mas === true, ficha);
await ev(`document.querySelector('#detail .dc-btn:not(.dc-minus)').click(); 1`); await sleep(300);
check('pulsarlo no añade nada: el mazo sigue en 50', (await ev(`document.getElementById('deckPillCount').textContent`)) === '50 / 50');
await ev(`document.querySelector('#detail .d-close').click(); 1`); await sleep(1500);
// quitar una carta: vuelve el icono de progreso y la etiqueta
await clickAdder('ST01-013', '.ad-minus'); await sleep(500);
e = await estado();
check('al bajar a 49 vuelven el icono de progreso y "En progreso"', e.pill.build && e.barra.build && e.etiqueta === 'En progreso' && e.contador === '49 / 50', e);
check('y el chip "Mazo lleno" desaparece de las cartas', (await ev(`document.querySelectorAll('#grid .full-chip').length`)) === 0);

// ventana del mazo: icono de estado en el contador y copiar lista con el icono nuevo
await ev(`document.getElementById('deckCount').click(); 1`); await sleep(1400);
const dv = await ev(`(function(){ var s=document.getElementById('dvStateIco'), c=document.querySelector('#dvCopy .ico-copy'), cs=c && getComputedStyle(c); return { estado: s ? s.className : null, copiar: !!c, mask: cs ? (cs.webkitMaskImage||'').slice(0,18) : null, w: c ? Math.round(c.getBoundingClientRect().width) : 0, aria: document.getElementById('dvCopy').getAttribute('aria-label') } })()`);
check('la ventana del mazo muestra el icono de progreso junto al contador', /ico-build/.test(dv.estado), dv);
check('el botón de copiar lista de la ventana del mazo lleva el icono de copiar y su etiqueta accesible', dv.copiar && dv.mask.startsWith('url(') && dv.w === 20 && /opiar/.test(dv.aria), dv);
await ev(`window.__c=null; navigator.clipboard.writeText=function(t){ window.__c=t; return Promise.resolve() }; document.getElementById('dvCopy').click(); 1`); await sleep(500);
const cp = await ev(`({ texto: window.__c, copiado: document.getElementById('dvCopy').dataset.copied })`);
check('copiar sigue funcionando: copia la lista y el botón confirma con el check', cp.copiado === 'true' && typeof cp.texto === 'string' && /Gundam|ST01/.test(cp.texto) && cp.texto.length > 100, { copiado: cp.copiado, n: (cp.texto || '').length });
await sleep(2500);
check('y después vuelve al icono de copiar', (await ev(`!!document.querySelector('#dvCopy .ico-copy')`)) === true);
await ev(`document.getElementById('dvBack').click(); 1`); await sleep(800);

// Mis mazos: copiar lista y copiar mazos con el icono
await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(1300);
const sel = await ev(`(function(){ var b=document.querySelector('#dpCopySel .ico-copy'); return { icono: !!b, texto: document.getElementById('lblDpCopySel').textContent } })()`);
check('"Copiar mazos" lleva el icono de copiar y conserva su texto', sel.icono && /Copiar mazos/.test(sel.texto), sel);
await ev(`document.querySelector('#dpGrid .dp-deck').click(); 1`); await sleep(1100);
const lista = await ev(`(function(){ var b=document.getElementById('dpCopy'); return { icono: !!b.querySelector('.ico-copy'), texto: b.textContent.trim(), aria: b.getAttribute('aria-label'), alto: Math.round(b.getBoundingClientRect().height) } })()`);
check('"Copiar lista" del detalle es solo el icono de copiar (sin texto), con su etiqueta accesible y 44 px o más', lista.icono && lista.texto === '' && lista.aria === 'Copiar lista' && lista.alto >= 44, lista);
await ev(`window.__c=null; navigator.clipboard.writeText=function(t){ window.__c=t; return Promise.resolve() }; document.getElementById('dpCopy').click(); 1`); await sleep(500);
check('y copia la lista', ((await ev(`window.__c`)) || '').length > 100);

// anchuras de móvil: la cabecera sigue cabiendo
for (const W of [320, 375, 430]) {
  await abrir(W, 800);
  const m = await ev(`(function(){ var p=document.getElementById('deckCount').getBoundingClientRect(), h=document.getElementById('menuBtn').getBoundingClientRect(), i=document.getElementById('deckStateIco'); return { scrollW:document.documentElement.scrollWidth, ancho:innerWidth, pillDentro: p.right <= innerWidth && h.right <= innerWidth && p.right <= h.left + 0.5, icono: getComputedStyle(i).display !== 'none', barraW: Math.round(document.getElementById('bbStateIco').getBoundingClientRect().width) } })()`);
  check(W + ' px: sin desborde y la cabecera superior sigue cabiendo con el icono' + (W < 350 ? ' (a 320 px se oculta, como ya hacía el icono anterior)' : ''), m.scrollW <= m.ancho && m.pillDentro && (W < 350 ? m.icono === false : m.icono === true) && m.barraW > 20, m);
}
// barra del mazo con 50 cartas (aparece "Comparar"): el nombre no se aprieta en una columna estrecha y todo cabe
for (const W of [320, 375, 430]) {
  await abrir(W, 800);
  await clickAdder('ST01-013', '.ad-plus'); await sleep(600);
  const bb = await ev(`(function(){ var bar=document.getElementById('buildBar').getBoundingClientRect(), main=document.querySelector('.bb-main').getBoundingClientRect(), cmp=document.getElementById('bbCompare'), cr=cmp.getBoundingClientRect(), ey=document.querySelector('.bb-state').getBoundingClientRect(); return { visible: !cmp.hidden && cr.width > 0, anchoNombre: Math.round(main.width), dentro: cr.right <= bar.right + 0.5 && cr.left >= bar.left - 0.5, scrollW: document.documentElement.scrollWidth, ancho: innerWidth, altoEtiqueta: Math.round(ey.height) } })()`);
  check(W + ' px con 50 cartas: "Comparar" visible dentro de la barra, nombre con al menos 140 px de ancho y etiqueta en una o dos líneas', bb.visible && bb.dentro && bb.anchoNombre >= 140 && bb.altoEtiqueta <= 34 && bb.scrollW <= bb.ancho, bb);
}
// inglés
await abrir(390, 844, 'en');
await clickAdder('ST01-013', '.ad-plus'); await sleep(500);
const en = await estado(); await ev(`document.querySelector('#grid .card-imgwrap[data-number="ST01-014"]').click(); 1`); await sleep(1500); const enChip = await ev(`(document.querySelector('#detail .dl-msg .full-chip')||{}).textContent`);
check('en inglés: "Complete" y "Deck full"', en.etiqueta === 'Complete' && (enChip || '').trim() === 'Deck full', [en.etiqueta, enChip]);
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
