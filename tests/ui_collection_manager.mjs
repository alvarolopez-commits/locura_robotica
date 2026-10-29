// Mi colección como gestor de cartas: cabecera, buscador, orden, filtros del catálogo sobre tus cartas, cantidades y panel "Añadir cartas".
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_collection_manager.mjs
import fs from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// datos del catálogo para calcular los resultados esperados sin fiarnos de la propia página
const cat = {};
for (const f of fs.readdirSync(new URL('../data/', import.meta.url))) {
  if (!/^(ST|GD|EB)\d+\.json$/.test(f)) continue;
  const d = JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
  for (const c of (Array.isArray(d) ? d : d.cards || [])) cat[c.number] = c;
}
const pick = (set, n) => Object.keys(cat).filter((k) => k.startsWith(set + '-')).sort().slice(0, n);
const OWNED = [...pick('ST01', 12), ...pick('ST02', 10), ...pick('GD01', 12), ...pick('EB01', 3)];
const QTY = (i) => (i % 5 === 0 ? 3 : i % 3 === 0 ? 2 : 1);
const SEED_OBJ = {}; OWNED.forEach((n, i) => { SEED_OBJ[n] = { q: QTY(i), t: 1000 + i * 10 }; });
const UNITS = OWNED.reduce((a, n, i) => a + QTY(i), 0);
const NOT_OWNED = pick('ST14', 3).concat(pick('GD05', 2));

const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });

async function abrir(seedText) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${seedText === null ? "localStorage.removeItem('msa_collection');" : `localStorage.setItem('msa_collection', ${JSON.stringify(seedText)});`} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(300);
  await send('Page.reload'); await sleep(4200);
}
const stored = async () => JSON.parse((await ev(`localStorage.getItem('msa_collection')`)) || '{}');
const cards = () => ev(`Array.from(document.querySelectorAll('#collGrid .cc')).map(function(c){ return c.dataset.number })`);
const text = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim() : null })()`);
const click = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`);
const setInput = async (sel, v) => { await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(260); };
const vis = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; var r=e.getBoundingClientRect(), cs=getComputedStyle(e); return !e.hidden && cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0 })()`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const W of [1440, 390, 820]) {
  const desktop = W >= 900;
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await abrir(JSON.stringify(SEED_OBJ));

  // ---- cabecera
  const head = await ev(`(function(){ var h=document.getElementById('collTitle'), cs=getComputedStyle(h); return { txt:h.textContent, up:cs.textTransform, fam:cs.fontFamily, sub:document.getElementById('collSub').textContent } })()`);
  check('el título es "Mi colección" en mayúsculas con la tipografía Display', head.txt === 'Mi colección' && head.up === 'uppercase' && /Big Shoulders/.test(head.fam), head);
  check('la cabecera cuenta solo las cartas distintas (sin unidades)', head.sub === `${OWNED.length} cartas distintas`, head.sub);
  check('el botón de copiar está junto al título y "Mazos iniciales" sigue en la cabecera', await ev(`(function(){ var t=document.getElementById('collTitle').getBoundingClientRect(), c=document.getElementById('collCopy').getBoundingClientRect(); return c.width>0 && Math.abs((c.top+c.height/2)-(t.top+t.height/2)) < 40 && c.left>=t.right-1 })()`), null);
  check('"Mazos iniciales" sigue en la cabecera', (await text('#collStarters')) === 'Mazos iniciales' && (await vis('#collStarters')));

  // ---- aprovechamiento del ancho
  const lay = await ev(`(function(){ var inner=document.querySelector('.coll-inner').getBoundingClientRect(), g=document.getElementById('collGrid'), gr=g.getBoundingClientRect(), f=document.getElementById('collFilters').getBoundingClientRect(), cols=getComputedStyle(g).gridTemplateColumns.split(' ').length, gap=parseFloat(getComputedStyle(g).columnGap);
    var im=g.querySelector('.card-imgwrap').getBoundingClientRect(), cc=g.querySelectorAll('.cc'); var over=0; cc.forEach(function(c){ if(c.scrollWidth>c.clientWidth+1) over++; });
    return { innerW:Math.round(inner.width), gridL:Math.round(gr.left), gridR:Math.round(gr.right), vw:innerWidth, filtW:Math.round(f.width), filtR:Math.round(f.right), cols:cols, gap:gap, ratio:+(im.width/im.height).toFixed(3), over:over, sw:document.getElementById('collPage').scrollWidth, cw:document.getElementById('collPage').clientWidth } })()`);
  if (W === 1440) {
    check('el contenedor usa casi todo el ancho (máx. ~1500) y está centrado', lay.innerW >= 1340 && lay.innerW <= 1500, lay);
    check('la cuadrícula llega cerca del borde derecho (sin hueco enorme)', lay.vw - lay.gridR <= 90, lay);
    check('la barra lateral mide 240–260 px y la separa de las cartas un hueco de 24–32 px', lay.filtW >= 240 && lay.filtW <= 260 && lay.gridL - lay.filtR >= 24 && lay.gridL - lay.filtR <= 32, lay);
    check('hay 4 o 5 cartas por fila', lay.cols >= 4 && lay.cols <= 5, lay);
    check('el hueco entre cartas es de 16–24 px', lay.gap >= 16 && lay.gap <= 24, lay);
  } else if (W === 820) {
    check('en tableta hay 2–3 columnas', lay.cols >= 2 && lay.cols <= 3, lay);
  } else {
    check('en móvil hay 2 columnas', lay.cols === 2, lay);
  }
  check('la carta conserva su proporción 63:88 y no se desborda', Math.abs(lay.ratio - 63 / 88) < 0.012 && lay.over === 0, lay);
  check('no hay scroll horizontal', lay.sw <= lay.cw + 1, lay);

  // ---- tarjeta: nombre, código, copias y control
  const first = await ev(`(function(){ var c=document.querySelector('#collGrid .cc'); return { n:c.dataset.number, name:c.querySelector('.cc-name').textContent, meta:c.querySelector('.cc-meta').textContent, q:c.querySelector('.cc-n').textContent, plus:!!c.querySelector('.cc-plus'), minus:!!c.querySelector('.cc-minus'), tengo:false } })()`);
  const firstNum = (await cards())[0];
  check('cada carta muestra nombre, código y número de copias', first.name === cat[first.n].name && first.meta.startsWith(first.n) && Number(first.q) === SEED_OBJ[first.n].q, first);
  const tg = await ev(`(function(){ var c=document.querySelector('#collGrid .cc'), g=c.querySelector('.coll-tag'), r=g.getBoundingClientRect(), i=c.querySelector('.card-imgwrap').getBoundingClientRect(); return { txt:g.textContent.trim(), dentro:r.top>=i.top && r.right<=i.right+1 && r.width>0, fila:!!c.querySelector('.coll-row'), todas:document.querySelectorAll('#collGrid .cc').length===document.querySelectorAll('#collGrid .coll-tag').length } })()`);
  check('cada carta lleva la etiqueta TENGO sobre la imagen, sin fila "En mi colección"', tg.txt === 'TENGO' && tg.dentro && !tg.fila && tg.todas, tg);
  check('hay controles − y + por carta', first.plus && first.minus, first);
  check('el orden por defecto es por código', eq(await cards(), [...OWNED].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))), (await cards()).slice(0, 4));

  // ---- barra de búsqueda / orden / añadir
  check('hay buscador y botón "Añadir cartas"', (await vis('#collSearch')) && !(await ev(`!!document.getElementById('collSort')`)) && (await vis('#collAdd')) && /Añadir cartas/.test(await text('#collAdd')), null);
  const count0 = await text('#collCount');
  check('el contador dice "Mostrando 35 de 35 cartas"', count0 === `Mostrando ${OWNED.length} de ${OWNED.length} cartas`, count0);

  // ---- filtros: los de siempre, sobre tus cartas
  const groups = await ev(`Array.from(document.querySelectorAll('#collFilters .sb-group')).filter(function(g){ return !g.hidden && g.getBoundingClientRect().height>0 || window.innerWidth<900 }).map(function(g){ return g.querySelector('.eyebrow').textContent })`);
  check('los grupos de filtro son Set, Color, Tipo, Habilidad, Efecto y Rasgos', eq(groups, ['Set', 'Color', 'Tipo', 'Habilidad', 'Efecto', 'Rasgos']), groups);
  const setChips = await ev(`Array.from(document.querySelectorAll('#cf-set .tag.chip')).map(function(c){ return c.textContent })`);
  check('los sets ofrecidos son solo los de tu colección', eq(setChips, ['ST01', 'ST02', 'GD01', 'EB01']), setChips);
  if (!desktop) { await click('#collFilterBtn'); await sleep(450); check('el botón Filtros abre el panel y aparece la hoja', await vis('#collFilters'), null); }
  const colorsOwned = [...new Set(OWNED.map((n) => cat[n].color))];
  check('hay un botón por color presente en tu colección', (await ev(`document.querySelectorAll('#cf-color .tag.chip').length`)) === colorsOwned.length, colorsOwned);
  const c1 = colorsOwned[0], c2 = colorsOwned[1];
  const exp1 = OWNED.filter((n) => cat[n].color === c1).length, exp12 = OWNED.filter((n) => cat[n].color === c1 || cat[n].color === c2).length;
  await click(`#cf-color .tag.chip[data-color="${c1}"]`); await sleep(250);
  check('un color filtra y el contador se actualiza', (await text('#collCount')) === `Mostrando ${exp1} de ${exp1} cartas · ${OWNED.length} en tu colección`, await text('#collCount'));
  check('todas las cartas visibles son de ese color', (await cards()).every((n) => cat[n].color === c1), await cards());
  await click(`#cf-color .tag.chip[data-color="${c2}"]`); await sleep(250);
  check('dos colores se suman (O dentro del grupo)', (await cards()).length === exp12, (await cards()).length);
  const setPick = ['ST01', 'ST02', 'GD01', 'EB01'].find((s) => OWNED.some((n) => n.startsWith(s + '-') && (cat[n].color === c1 || cat[n].color === c2)));
  await ev(`Array.from(document.querySelectorAll('#cf-set .tag.chip')).filter(function(c){ return c.textContent==='${setPick}' })[0].click()`); await sleep(250);
  const expAnd = OWNED.filter((n) => n.startsWith(setPick + '-') && (cat[n].color === c1 || cat[n].color === c2));
  check('color + set se combinan (Y entre grupos)', eq((await cards()).sort(), [...expAnd].sort()), { got: await cards(), expAnd });
  check('el grupo con selección muestra su indicador y el botón Filtros su total', (await text('#cfn-color')) === '2' && (await text('#cfn-set')) === '1', [await text('#cfn-color'), await text('#cfn-set')]);
  check('las etiquetas de filtros activos aparecen y se pueden quitar', (await ev(`document.querySelectorAll('#collActive .tag.removable').length`)) === 3, null);
  await ev(`document.querySelector('#collActive .tag.removable button').click()`); await sleep(250);
  check('quitar una etiqueta actualiza resultados', (await ev(`document.querySelectorAll('#collActive .tag.removable').length`)) === 2, null);
  await click('#collClear'); await sleep(250);
  check('"Limpiar filtros" lo deja todo como estaba', (await cards()).length === OWNED.length && (await text('#collCount')) === count0, await text('#collCount'));
  if (!desktop) {
    await click('#cfClose'); await sleep(450);
    check('en pantallas pequeñas la hoja de filtros se cierra', !(await vis('#collFilters')), null);
    await click('#collFilterBtn'); await sleep(400); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(450);
    check('Escape cierra la hoja de filtros', !(await vis('#collFilters')), null);
  }

  // ---- búsqueda y orden
  await setInput('#collSearch', 'ST01-00');
  const sr = await cards();
  check('buscar por código filtra la colección', sr.length > 0 && sr.every((n) => n.startsWith('ST01-00')), sr);
  await setInput('#collSearch', 'zzzzqq');
  check('sin coincidencias se muestra un mensaje y un botón para limpiar', (await vis('#collNoMatch')) && (await vis('#collEmptyClear')), null);
  await click('#collEmptyClear'); await sleep(250);
  check('limpiar desde el mensaje devuelve las cartas y vacía el buscador', (await cards()).length === OWNED.length && (await ev(`document.getElementById('collSearch').value`)) === '', null);
  // ---- cantidades
  await ev(`window.__otra = document.querySelectorAll('#collGrid .cc')[3]; 1`);
  const target = OWNED.find((n, i) => QTY(i) === 1);          // una carta con 1 copia
  const tIdx = OWNED.indexOf(target);
  await ev(`(function(){ var b=document.querySelector('#collGrid .cc[data-number="${target}"] .cc-plus'); b.focus(); b.click() })()`); await sleep(250);
  let st = await stored();
  check('+ suma una copia y se guarda', st[target].q === 2, st[target]);
  check('cambiar copias solo rehace esa carta (el resto de la cuadrícula no se repinta)', await ev(`window.__otra === document.querySelectorAll('#collGrid .cc')[3] && document.contains(window.__otra)`));
  check('el foco se queda en el botón + de esa carta', await ev(`(function(){ var a=document.activeElement; return a.dataset.role==='plus' && a.closest('.cc').dataset.number==='${target}' })()`), await ev(`document.activeElement.outerHTML.slice(0,80)`));
  check('la cabecera no cambia al sumar una copia', (await text('#collSub')) === `${OWNED.length} cartas distintas`, await text('#collSub'));
  await ev(`document.querySelector('#collGrid .cc[data-number="${target}"] .cc-minus').click()`); await sleep(250);
  st = await stored();
  check('− resta una copia', st[target].q === 1 && (await vis('#confirmModal')) === false, st[target]);
  await ev(`document.querySelector('#collGrid .cc[data-number="${target}"] .cc-minus').click()`); await sleep(350);
  check('quitar la última copia pide confirmación', await vis('#confirmModal'), null);
  await click('#confirmCancel'); await sleep(350);
  check('cancelar la conserva', (await stored())[target]?.q === 1 && (await cards()).includes(target), null);
  await ev(`document.querySelector('#collGrid .cc[data-number="${target}"] .cc-minus').click()`); await sleep(350);
  await click('#confirmOk'); await sleep(350);
  check('confirmar la quita de la colección y del grid', !(await stored())[target] && !(await cards()).includes(target), null);
  check('el contador baja a 34 cartas', (await text('#collCount')) === `Mostrando ${OWNED.length - 1} de ${OWNED.length - 1} cartas`, await text('#collCount'));

  // ---- Añadir cartas (todo el catálogo)
  await ev(`document.getElementById('collAdd').focus()`); await click('#collAdd'); await sleep(500);
  check('"Añadir cartas" abre el panel con el foco en el buscador', (await vis('#addDrawer')) && (await ev(`document.activeElement.id`)) === 'addSearch', await ev(`document.activeElement.id`));
  check('sin escribir se muestra la ayuda', (await vis('#addHint')) && (await ev(`document.querySelectorAll('#addResults .cadd-row').length`)) === 0, null);
  const dr = await ev(`(function(){ var r=document.getElementById('addDrawer').getBoundingClientRect(); return { w:Math.round(r.width), vw:innerWidth, sw:document.documentElement.scrollWidth } })()`);
  check(W >= 640 ? 'el panel lateral mide como máximo 480 px' : 'en móvil el panel ocupa todo el ancho', W >= 640 ? dr.w <= 482 : dr.w >= dr.vw - 1, dr);
  const newCard = NOT_OWNED[0], nm = cat[newCard].name;
  await setInput('#addSearch', newCard);
  let rows = await ev(`Array.from(document.querySelectorAll('#addResults .cadd-row')).map(function(r){ return r.dataset.number })`);
  check('buscar por código encuentra cartas fuera de tu colección', rows[0] === newCard, rows.slice(0, 3));
  await setInput('#addSearch', newCard.replace('-', '').toLowerCase());
  rows = await ev(`Array.from(document.querySelectorAll('#addResults .cadd-row')).map(function(r){ return r.dataset.number })`);
  check('también sin guion ni mayúsculas', rows[0] === newCard, rows.slice(0, 3));
  const word = nm.split(' ')[0];
  await setInput('#addSearch', word);
  rows = await ev(`Array.from(document.querySelectorAll('#addResults .cadd-row')).map(function(r){ return r.dataset.number })`);
  check('buscar por nombre consulta todo el catálogo (no solo tu colección)', rows.includes(newCard) && rows.some((n) => !OWNED.includes(n)), rows.slice(0, 6));
  await setInput('#addSearch', newCard);
  const rowInfo = await ev(`(function(){ var r=document.querySelector('#addResults .cadd-row'); return { have:r.querySelector('[data-role=have]').textContent, img:!!r.querySelector('img'), name:r.querySelector('.cadd-name').textContent, btn:!!r.querySelector('.cadd-btn') } })()`);
  check('cada resultado muestra imagen, nombre y si ya la tienes', rowInfo.img && rowInfo.name === nm && rowInfo.have === 'No la tienes' && rowInfo.btn, rowInfo);
  await ev(`(function(){ var b=document.querySelector('#addResults .cadd-row[data-number="${newCard}"] .cadd-btn'); b.focus(); b.click() })()`); await sleep(350);
  st = await stored();
  check('"Añadir" mete una copia en la colección real', st[newCard]?.q === 1 && st[newCard].t > 5000, st[newCard]);
  const rowInfo2 = await ev(`(function(){ var r=document.querySelector('#addResults .cadd-row[data-number="${newCard}"]'); return { have:r.querySelector('[data-role=have]').textContent, step:!!r.querySelector('.cadd-step'), n:r.querySelector('.cc-n').textContent } })()`);
  check('la fila pasa a "Tienes 1" con selector de copias', rowInfo2.have === 'Tienes 1' && rowInfo2.step && rowInfo2.n === '1', rowInfo2);
  check('el foco no se pierde al cambiar el botón', await ev(`document.activeElement.closest('.cadd-row') && document.activeElement.closest('.cadd-row').dataset.number==='${newCard}'`), await ev(`document.activeElement.outerHTML.slice(0,80)`));
  await ev(`document.querySelector('#addResults .cadd-row[data-number="${newCard}"] .cc-plus').click()`); await sleep(300);
  st = await stored();
  check('+ en el panel suma otra copia sin duplicar la entrada', st[newCard].q === 2 && Object.keys(st).filter((k) => k === newCard).length === 1, st[newCard]);
  check('el toast confirma la acción', /Añadida/.test(await text('#caddToast')), await text('#caddToast'));
  check('el panel actualiza el total', (await text('#addTotals')) === `${OWNED.length} cartas distintas`, await text('#addTotals'));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(500);
  check('Escape cierra el panel y devuelve el foco al botón', !(await vis('#addDrawer')) && (await ev(`document.activeElement.id`)) === 'collAdd', await ev(`document.activeElement.id`));
  check('el grid de detrás ya tiene la carta nueva con 2 copias', (await cards()).includes(newCard) && (await text(`#collGrid .cc[data-number="${newCard}"] .cc-n`)) === '2', null);
  check('la cabecera cuenta la carta nueva', (await text('#collSub')) === `${OWNED.length} cartas distintas`, await text('#collSub'));
  await click('#collAdd'); await sleep(450); await setInput('#addSearch', 'zzzzqq');
  check('buscar algo inexistente muestra un mensaje', /No hay cartas/.test(await text('#addHint')) && (await vis('#addHint')), await text('#addHint'));
  await click('#addClose'); await sleep(450);

  // ---- persistencia, ficha, estado vacío, mazos iniciales
  await send('Page.reload'); await sleep(4200);
  st = await stored();
  check('tras recargar siguen las copias y la carta nueva', st[newCard]?.q === 2 && !st[target] && (await cards()).includes(newCard), st[newCard]);
  await ev(`document.querySelector('#collGrid .cc-open').click()`); await sleep(1400);
  check('pulsar una carta sigue abriendo su ficha', await vis('#detail'), null);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(1200);
  await click('#collStarters'); await sleep(300);
  check('"Mazos iniciales" muestra los 14 mazos y oculta la barra', (await ev(`document.querySelectorAll('#collPanel .cs-row').length`)) === 14 && !(await vis('#collBar')), null);
  await click('#collBackCards'); await sleep(300);
  check('se vuelve a la colección', (await vis('#collGrid')) && (await vis('#collBar')), null);
  const mobileOverflow = await ev(`document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('collPage').scrollWidth <= document.getElementById('collPage').clientWidth + 1`);
  check('sin scroll horizontal tras todo el recorrido', mobileOverflow, null);

  await abrir(null);
  check('colección vacía: mensaje con botones para añadir cartas y mazos iniciales', (await text('.coll-empty-t')) === 'Tu colección está vacía' && (await vis('#collEmptyAdd')) && (await vis('#collStatus')) === false, await text('.coll-empty-t'));
  await click('#collEmptyAdd'); await sleep(450);
  check('el botón del estado vacío abre el panel de añadir', await vis('#addDrawer'), null);
  await click('#addClose'); await sleep(400);

  // ---- formato antiguo (lista): cada carta cuenta como 1 copia
  await abrir(JSON.stringify(OWNED.slice(0, 5)));
  check('una colección guardada con el formato antiguo se lee bien', (await text('#collSub')) === '5 cartas distintas' && (await cards()).length === 5, await text('#collSub'));
}
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
