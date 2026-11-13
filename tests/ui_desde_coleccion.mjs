// «Crear desde mi colección»: entrada rosa con el icono exacto, selección 1–3 cartas, sugerencias de Link, búsqueda en listas completas, copia y el mismo flujo desde Competición.
// Una sola pasada, sin reintentos. Límites: 30 s por orden y 5 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_desde_coleccion.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (5 min) en: ' + paso); process.exit(3); }, 300000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra).slice(0, 400) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

/* ---- datos de referencia calculados aparte con las mismas reglas ---- */
const S = require('../comp_stats.js'), M = require('../meta.js'); const { loadCatalog } = require('../scripts/import_deck_export.js');
const cat = loadCatalog(), has = (n) => !!cat[n];
const ALL = []; fs.readdirSync('data').filter((f) => /^(ST|GD|EB)\d+\.json$/.test(f)).forEach((f) => { const j = JSON.parse(fs.readFileSync('data/' + f, 'utf8')); (Array.isArray(j) ? j : j.cards).forEach((c) => ALL.push(c)); });
const by = {}; ALL.forEach((c) => { by[c.number] = c; });
const DLd = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')), EV = JSON.parse(fs.readFileSync('data/competition_events.json', 'utf8')), AL = JSON.parse(fs.readFileSync('data/archetype_aliases.json', 'utf8'));
const table = { archetypes: AL.archetypes, byId: AL.archetypes.reduce((m, x) => { m[x.id] = x.name; return m; }, {}) };
const lists = [], seen = {};
const push = (it) => { if (!it.name || !it.cards || seen[it.key] || S.deckStatus({ cards: it.cards }, has) !== 'complete') return; seen[it.key] = 1; lists.push(it); };
DLd.archetypes.forEach((a) => a.decks.forEach((d) => push({ key: d.h, name: a.name, date: (d.event || {}).date || '', cards: d.cards })));
{ const evs = {}; EV.events.forEach((e) => { evs[e.id] = e; }); EV.results.forEach((r) => { if (S.originOf(r) !== 'tournament' || !r.cards) return; const e = evs[r.eventId] || {}, res = S.resolveArchetype(r.archetype, table); push({ key: r.id, name: res.id ? res.name : r.archetype, date: e.date || '', cards: r.cards }); }); }
const freq = {}; lists.forEach((l) => Object.keys(l.cards).forEach((n) => { freq[n] = (freq[n] || 0) + 1; }));
const pilotsTop = Object.keys(freq).filter((n) => by[n] && by[n].type === 'PILOT').sort((a, b) => freq[b] - freq[a]).slice(0, 4);
const amuro = by['ST01-010'], unitLR = by['GD01-001'];
const unitComun = Object.keys(freq).filter((n) => by[n] && by[n].type === 'UNIT' && by[n].rarity !== 'LR' && n !== 'GD01-001').sort((a, b) => freq[b] - freq[a])[0];
const pilotA = pilotsTop[0];
// una Unidad que salga en listas pero nunca junto al Piloto A: pareja sin coincidencia exacta
const unitSola = Object.keys(freq).filter((n) => by[n] && by[n].type === 'UNIT' && n !== 'GD01-001' && n !== unitComun && !lists.some((l) => l.cards[n] && l.cards[pilotA])).sort((a, b) => freq[b] - freq[a])[0];
const COL = {}; pilotsTop.concat(['ST01-010']).forEach((n) => { COL[n] = 2; }); [unitLR.number, unitComun, unitSola].forEach((n) => { COL[n] = 1; });
const COLJ = JSON.stringify(COL);
const MAZOS = { d1: { name: 'Mi mazo A', cards: { 'GD01-001': 2 }, updatedAt: 1700000000000 } };
const sig = (c) => Object.keys(c).sort().map((k) => k + ':' + c[k]).join(',');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
console.log('datos: pilotos', pilotsTop.join(','), '· LR', unitLR.number, '· común', unitComun, '· sin pareja', unitSola, '· listas', lists.length);

async function abrir(W, H, { hash = '', col = COLJ, lang = 'es' } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(MAZOS))}); ${col ? `localStorage.setItem('msa_collection', ${JSON.stringify(col)});` : ''} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3800);
}
const porColeccion = async () => { await ev(`document.getElementById('tbCollection').click(); 1`); await sleep(1500); await ev(`document.getElementById('collBuilder').click(); 1`); await sleep(2500); };
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const hs = () => ev('document.documentElement.scrollWidth <= innerWidth + 1');
const hashNow = () => ev('location.hash');
const click = async (sel, ms = 500) => { await ev(`document.querySelector(${JSON.stringify(sel)}).click(); 1`); await sleep(ms); };
const tile = (n) => `.mc-tile[data-number="${n}"]`;
const sel = () => ev(`Array.from(document.querySelectorAll('.mc-sel')).map(function(r){ var p=r.querySelector('.mc-opt[aria-pressed="true"]'); return r.dataset.number+':'+(p ? p.dataset.prio : '') })`);
const mazos = () => ev(`JSON.parse(localStorage.getItem('msa_decks') || '{}')`);
const coleccion = () => ev(`localStorage.getItem('msa_collection')`);

for (const [W, H] of [[390, 844], [320, 640], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H); await ev(`document.getElementById('tbCollection') && document.getElementById('tbCollection').click(); 1`); await sleep(1500);
  if (W >= 900) { await ev(`document.getElementById('menuBtn').click(); 1`); await sleep(300); await ev(`document.getElementById('pmCollection').click(); 1`); await sleep(1500); }
  // 1 · entrada
  const b = await ev(`(function(){ var el=document.getElementById('collBuilder'), cs=getComputedStyle(el), r=el.getBoundingClientRect(), im=el.querySelector('img'), ir=im.getBoundingClientRect(); return { bg:cs.backgroundColor, color:cs.color, h:Math.round(r.height), w:Math.round(r.width), vis:r.width>0 && !document.getElementById('collBuilderWrap').hidden, src:im.getAttribute('src'), nat:im.naturalWidth, iw:Math.round(ir.width), txt:el.querySelector('b').textContent, sub:el.querySelector('small').textContent, tok:getComputedStyle(document.documentElement).getPropertyValue('--collection-builder').trim().toLowerCase() } })()`);
  check('Mi colección tiene el botón «Crear desde mi colección» con su descripción', b.vis && b.txt === 'Crear desde mi colección' && b.sub === 'Encuentra mazos con tus cartas', b);
  check('fondo #CD9FC8 por el token --collection-builder y texto navy de alto contraste', b.bg === 'rgb(205, 159, 200)' && b.tok === '#cd9fc8' && b.color === 'rgb(34, 30, 65)', b);
  check('tamaño cómodo para móvil (≥44 px de alto) sin desbordar', b.h >= 44 && (await hs()), b);
  check('icono: el PNG suministrado, cargado y a tamaño visible', /icons\/avatar-de-perfil\.png$/.test(b.src) && b.nat === 512 && b.iw >= 24, b);
  const hashPag = await ev(`fetch('icons/avatar-de-perfil.png').then(function(r){ return r.arrayBuffer() }).then(function(buf){ return crypto.subtle.digest('SHA-256', buf) }).then(function(d){ return Array.from(new Uint8Array(d)).map(function(x){ return x.toString(16).padStart(2,'0') }).join('') })`);
  check('el icono servido es idéntico byte a byte al del repositorio', hashPag === sha('icons/avatar-de-perfil.png'), hashPag);
  const orig = 'C:/Users/34656/Downloads/avatar-de-perfil.png';
  if (W === 390 && fs.existsSync(orig)) check('y al archivo original suministrado', sha(orig) === sha('icons/avatar-de-perfil.png'));
  const html = fs.readFileSync('dashboard.html', 'utf8');
  if (W === 390) check('el hex #CD9FC8 aparece una sola vez (token), no disperso', (html.match(/#CD9FC8/gi) || []).length === 1, (html.match(/#CD9FC8/gi) || []).length);
  check('el catálogo propio y «Mazos iniciales» siguen en Mi colección', (await count('#collStarters')) === 1 && (await count('#collBar')) === 1);

  // 2 · pantalla de selección
  const antesMazos = JSON.stringify(await mazos()), antesCol = await coleccion();
  await click('#collBuilder', 2500);
  check('se abre «Crear desde mis cartas» (ruta #competicion/mias) con su título y bajada', (await hashNow()) === '#competicion/mias' && (await txt('.cx-title')) === 'Crear desde mis cartas' && (await txt('.mc-intro')) === 'Elige las cartas con las que quieres jugar y encuentra listas que las utilizan', [await hashNow(), await txt('.cx-title')]);
  const tiles = await ev(`Array.from(document.querySelectorAll('.mc-tile')).map(function(b){ return b.dataset.number })`);
  const pilotosPropios = Object.keys(COL).filter((n) => by[n].type === 'PILOT').sort();
  check('al abrir solo salen los Pilots que tengo (' + pilotosPropios.length + '), ni uno más', JSON.stringify(tiles) === JSON.stringify(pilotosPropios), [tiles, pilotosPropios]);
  const tt = await ev(`(function(){ var b=document.querySelector('.mc-tile'); return { img:/images\\/[A-Z0-9-]+\\.webp$/.test(b.querySelector('img').getAttribute('src')), name:b.querySelector('b').textContent.length>1, code:/^[A-Z0-9]+-\\d+$/.test(b.querySelector('small').textContent), tengo:b.querySelector('.mc-tengo').textContent, h:Math.round(b.getBoundingClientRect().height) } })()`);
  check('cada carta enseña imagen real, nombre, código y «TENGO»', tt.img && tt.name && tt.code && tt.tengo === 'TENGO' && tt.h >= 44, tt);
  check('no hay nada preseleccionado y «Buscar mazos» está desactivado', (await count('.mc-sel')) === 0 && (await ev(`document.getElementById('mcSearch').disabled`)) === true && (await count('.mc-link')) === 0);
  check('por defecto: Pilots activado, color «Todos», sin LR (solo aparece al elegir Units)', (await ev(`document.querySelector('.mc-filters [data-kind="PILOT"]').getAttribute('aria-pressed')`)) === 'true' && (await ev(`document.querySelector('[data-color0]').getAttribute('aria-pressed')`)) === 'true' && (await count('#mcLR')) === 0);
  check('la pantalla no toca mazos ni colección', JSON.stringify(await mazos()) === antesMazos && (await coleccion()) === antesCol);

  // 3 · selección, color y prioridad
  await click(tile('ST01-010'));
  check('elegir un Pilot lo deja seleccionado como IMPRESCINDIBLE por defecto', JSON.stringify(await sel()) === JSON.stringify(['ST01-010:must']), await sel());
  const colores = await ev(`Array.from(document.querySelectorAll('.mc-chips [data-color]')).map(function(b){ return b.dataset.color })`);
  const otro = colores.find((c) => c !== amuro.color);
  await click(`.mc-chips [data-color="${otro}"]`, 400);
  const visibles = await ev(`Array.from(document.querySelectorAll('.mc-tile')).map(function(b){ return b.dataset.number })`);
  check('el filtro de color reduce la cuadrícula (' + otro + ') pero la selección sigue intacta', visibles.every((n) => by[n].color === otro) && JSON.stringify(await sel()) === JSON.stringify(['ST01-010:must']) && (await count('.mc-link')) > 0, [visibles, await sel()]);
  await click('[data-color0]', 400);
  check('quitar el filtro devuelve todos los Pilots', (await count('.mc-tile')) === pilotosPropios.length);
  await ev(`(function(){ var i=document.getElementById('mcQuery'); i.value='amuro'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(400);
  check('la búsqueda por nombre filtra y por código también', (await count('.mc-tile')) === 1 && ((await ev(`(function(){ var i=document.getElementById('mcQuery'); i.value='ST01-010'; i.dispatchEvent(new Event('input',{bubbles:true})); return document.querySelectorAll('.mc-tile').length })()`)) === 1));
  await ev(`(function(){ var i=document.getElementById('mcQuery'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(300);

  // 4 · Link: propuestas, no automáticas
  const esperadas = M.linkUnitsFor(amuro, ALL.filter((c) => c.type === 'UNIT')).map((x) => x.unit.number);
  check('«Units compatibles con Link» aparece debajo, con imagen, nombre, código y Tengo/No tengo', (await txt('.mc-linksec h3')).indexOf('Units compatibles con Link') === 0 && (await ev(`Array.from(document.querySelectorAll('.mc-link')).every(function(r){ return r.querySelector('img') && r.querySelector('b').textContent && /^[A-Z0-9]+-\\d+$/.test(r.querySelector('small').textContent) && /^(Tengo|No tengo)$/.test(r.querySelector('.mc-badge').textContent) })`)) === true);
  for (let i = 0; i < 10 && (await ev(`(function(){ var b=Array.from(document.querySelectorAll('.mc-more')).find(function(x){ return /^Ver todas/.test(x.textContent) }); if(b){ b.click(); return true } return false })()`)); i++) await sleep(250);   // despliega los grupos largos («Ver todas»)
  const filas = await ev(`Array.from(document.querySelectorAll('.mc-link')).map(function(r){ return { n:r.dataset.number, own:r.querySelector('.mc-badge').classList.contains('own'), via:r.querySelector('.comp-note').textContent } })`);
  check('muestra TODAS las Units compatibles del catálogo (' + esperadas.length + '), ni una más ni una menos', JSON.stringify(filas.map((f) => f.n).sort()) === JSON.stringify(esperadas.slice().sort()), [filas.length, esperadas.length]);
  const firstNot = filas.findIndex((f) => !f.own), lastOwn = filas.map((f) => f.own).lastIndexOf(true);
  check('primero las que tengo y después las que no; dentro de cada grupo, Link por nombre antes que por rasgo', (firstNot < 0 || lastOwn < firstNot) && filas.some((f) => f.own && f.n === 'GD01-001') && ((g) => g.every((f, i) => i === 0 || !(/rasgo/.test(g[i - 1].via) && /directo/.test(f.via))))(filas.filter((f) => f.own)), filas.slice(0, 4));
  check('ninguna Unidad se ha añadido sola a la búsqueda', JSON.stringify(await sel()) === JSON.stringify(['ST01-010:must']));
  await click('.mc-link[data-number="GD01-001"] .mc-add', 500);
  check('«Añadir a búsqueda» ocupa una plaza con «Me gustaría incluirla» por defecto', JSON.stringify(await sel()) === JSON.stringify(['ST01-010:must', 'GD01-001:want']), await sel());
  check('la Unidad ya añadida no se puede añadir dos veces', (await ev(`document.querySelector('.mc-link[data-number="GD01-001"] .mc-add').disabled`)) === true && (await txt('.mc-link[data-number="GD01-001"] .mc-add')) === 'En la búsqueda');
  await click('.mc-sel[data-number="ST01-010"] .mc-x', 400);
  check('al quitar el Pilot desaparecen sus propuestas, pero la Unidad añadida a mano se queda', (await count('.mc-link')) === 0 && JSON.stringify(await sel()) === JSON.stringify(['GD01-001:want']), await sel());
  await click(tile('ST01-010'), 400); await click('.mc-sel[data-number="ST01-010"] .mc-opt[data-prio="want"]', 300);
  check('la prioridad de cada carta se cambia explícitamente', JSON.stringify(await sel()) === JSON.stringify(['GD01-001:want', 'ST01-010:want']), await sel());
  await click('.mc-sel[data-number="ST01-010"] .mc-opt[data-prio="must"]', 300);

  // 5 · máximo 3
  await click(tile(pilotsTop[0]), 400); const tres = await sel();
  await click(tile(pilotsTop[1]), 400);
  check('una cuarta carta no entra, se avisa y no se borra nada', tres.length === 3 && (await sel()).length === 3 && JSON.stringify(await sel()) === JSON.stringify(tres) && /Ya has elegido 3 cartas/.test(await txt('#mcNote')), [tres, await sel(), await txt('#mcNote')]);
  check('se puede seguir deseleccionando', (await ev(`document.querySelector('.mc-sel .mc-x').click(); document.querySelectorAll('.mc-sel').length`)) === 2);
  check('sin desbordamiento horizontal en la selección', await hs());

  // 6 · Units y LR
  await click('.mc-filters [data-kind="UNIT"]', 400);
  const unidades = await ev(`Array.from(document.querySelectorAll('.mc-tile')).map(function(b){ return b.dataset.number }).sort()`);
  check('en Units solo salen las Units que tengo', JSON.stringify(unidades) === JSON.stringify(Object.keys(COL).filter((n) => by[n].type === 'UNIT').sort()), unidades);
  check('el filtro LR aparece solo en Units y deja las LR', (await count('#mcLR')) === 1 && ((await ev(`document.getElementById('mcLR').click(); Array.from(document.querySelectorAll('.mc-tile')).map(function(b){ return b.dataset.number })`)), true));
  await sleep(300);
  const lr = await ev(`Array.from(document.querySelectorAll('.mc-tile')).map(function(b){ return b.dataset.number })`);
  check('con LR solo se ven Units LR de mi colección', lr.length >= 1 && lr.every((n) => by[n].rarity === 'LR') && lr.indexOf(unitComun) < 0, lr);
  await click('.mc-filters [data-kind="PILOT"]', 300);
  check('volver a Pilots quita el filtro LR y no pierde lo elegido', (await count('#mcLR')) === 0 && (await count('.mc-sel')) === 2);

  // 7 · búsqueda de listas (exactas, deseadas)
  while ((await count('.mc-sel')) > 0) await click('.mc-sel .mc-x', 200);
  await click(tile('ST01-010'), 300);
  await click('.mc-link[data-number="GD01-001"] .mc-add', 400);
  const crit = [{ n: 'ST01-010', prio: 'must' }, { n: 'GD01-001', prio: 'want' }], res = S.matchLists(lists, crit);
  check('«Buscar mazos» se activa con criterios', (await ev(`document.getElementById('mcSearch').disabled`)) === false);
  await click('#mcSearch', 1500);
  check('la URL recoge la selección (#competicion/mias/buscar?s=…)', (await hashNow()) === '#competicion/mias/buscar?s=ST01-010.m,GD01-001.w', await hashNow());
  const claves = await ev(`Array.from(document.querySelectorAll('#mcResults .cx-list')).map(function(b){ return b.dataset.list })`);
  check('resultados: solo listas con la imprescindible, las que traen la deseada primero y después la más reciente', JSON.stringify(claves) === JSON.stringify(res.exact.slice(0, 20).map((m) => m.key)) && res.exact.length > 0, [claves.slice(0, 3), res.exact.slice(0, 3).map((m) => m.key)]);
  check('el estado lo dice y no mezcla coincidencias parciales', (await txt('#mcStatus')).indexOf(String(res.exact.length)) === 0 && (await count('#mcBanner')) === 0 && (await count('#mcPartial')) === 0);
  const tarj = await ev(`(function(){ var b=document.querySelector('#mcResults .cx-list'); var cs=Array.from(b.querySelectorAll('.mc-ok')).map(function(x){ return x.textContent }); return { arch:b.querySelector('.cx-name span:last-child').textContent.length>1, thumbs:b.querySelectorAll('.cx-thumbs img').length, chips:cs, foot:b.querySelector('.cx-foot').textContent, txt:b.textContent, h:Math.round(b.getBoundingClientRect().height) } })()`);
  check('cada resultado: arquetipo, 3–4 miniaturas, qué cartas coinciden, fecha discreta y sin jugador ni «50 cartas»', tarj.arch && tarj.thumbs >= 3 && tarj.thumbs <= 4 && tarj.chips.length >= 1 && !/jugador|player|50 cartas|puesto/i.test(tarj.txt) && tarj.h >= 44, tarj);
  check('el aviso de cobertura dice entre cuántas listas completas busca', new RegExp('entre ' + lists.length + ' listas completas').test(await txt('#compPanel')), await txt('.cx-note'));
  check('sin desbordamiento horizontal en los resultados', await hs());

  // 8 · abrir una lista, aviso de colección y copiar
  const k0 = claves[0], L0 = lists.find((l) => l.key === k0);
  await click(`#mcResults .cx-list[data-list="${k0}"]`, 1200);
  check('abrir un resultado muestra todas sus cartas con la cantidad exacta', (await hashNow()).indexOf('#competicion/mias/lista/') === 0 && (await count('.cx-cardbtn')) === Object.keys(L0.cards).length && (await ev(`(function(){ var o={}; document.querySelectorAll('.cx-cardbtn').forEach(function(b){ o[b.dataset.number]=+b.querySelector('.cx-qty').textContent.replace('×','') }); return JSON.stringify(Object.keys(o).sort().map(function(k){ return k+':'+o[k] })) })()`)) === JSON.stringify(Object.keys(L0.cards).sort().map((k) => k + ':' + L0.cards[k])));
  check('aviso de colección: cuántas cartas distintas de la lista tengo (solo informa)', /Tienes \d+ de las \d+ cartas distintas de esta lista/.test(await txt('#compPanel')) || /Tienes todas las cartas/.test(await txt('#compPanel')), (await txt('#compPanel')).slice(0, 160));
  await click('#cxCopy', 600); await click('#nameSave', 900);
  const m1 = await mazos(), nuevos = Object.keys(m1).filter((k) => !MAZOS[k]);
  check('«Copiar mazo» crea un mazo NUEVO idéntico; el mazo previo y la colección no cambian', nuevos.length === 1 && sig(m1[nuevos[0]].cards) === sig(L0.cards) && JSON.stringify(m1.d1) === JSON.stringify(MAZOS.d1) && (await coleccion()) === antesCol, { nuevos: nuevos.length });
  check('confirmación con «Ver mi mazo»', /Mazo creado/.test(await txt('#cxMsg')) && (await txt('#cxViewDeck')) === 'Ver mi mazo');

  // 9 · atrás conserva la búsqueda
  await ev(`history.back(); 1`); await sleep(800);
  check('«atrás» desde la lista vuelve a los resultados con la misma búsqueda', (await hashNow()).indexOf('#competicion/mias/buscar') === 0 && (await count('#mcResults .cx-list')) > 0);
  await ev(`history.back(); 1`); await sleep(800);
  check('«atrás» otra vez vuelve a elegir cartas con la selección intacta', (await hashNow()).indexOf('#competicion/mias') === 0 && (await count('.mc-sel')) === 2 && (await sel()).join() === 'ST01-010:must,GD01-001:want', await sel());
}

console.log('\n== sin coincidencias exactas → coincidencias parciales explícitas (390 px) ==');
await abrir(390, 844); await porColeccion();
await click(tile(pilotA), 300); await click('.mc-filters [data-kind="UNIT"]', 300); await click(tile(unitSola), 300);
const crit2 = [{ n: pilotA, prio: 'must' }, { n: unitSola, prio: 'must' }], res2 = S.matchLists(lists, crit2);
check('hay criterios sin ninguna lista que los reúna (preparación)', res2.exact.length === 0 && res2.partial.length > 0, [res2.exact.length, res2.partial.length]);
await click('#mcSearch', 1500);
check('sin exactas se dice claramente y no se relaja nada en silencio', (await txt('#mcStatus')) === 'No hay listas publicadas con todas tus cartas imprescindibles.' && (await count('#mcResults .cx-list')) === 0);
check('ofrece «Explorar coincidencias parciales»', (await txt('#mcPartial')).indexOf('Explorar coincidencias parciales') === 0);
await click('#mcPartial', 1200);
const parc = await ev(`Array.from(document.querySelectorAll('#mcResults .cx-list')).map(function(b){ return b.dataset.list })`);
check('en parcial se avisa de que NO es un mazo probado con la combinación completa', /ninguna de estas listas es un mazo probado con tu combinación completa/.test(await txt('#mcBanner')) && (await hashNow()).indexOf('p=1') > 0);
check('las parciales siguen el orden esperado y explican qué coincide y qué no', JSON.stringify(parc) === JSON.stringify(res2.partial.slice(0, 20).map((m) => m.key)) && (await ev(`(function(){ var c=document.querySelector('#mcResults .cx-list'); return c.querySelectorAll('.mc-ok').length>=1 && c.querySelectorAll('.mc-miss').length>=1 && /^✗/.test(c.querySelector('.mc-miss').textContent) })()`)) === true, [parc.slice(0, 2), res2.partial.slice(0, 2).map((m) => m.key)]);
await ev(`location.reload(); 1`); await sleep(3800);
check('recargar en la ruta de resultados la recupera (criterios y modo parcial en la URL)', (await count('#mcResults .cx-list')) > 0 && (await count('#mcBanner')) === 1 && (await count('.mc-crit span')) === 2, await hashNow());

console.log('\n== el mismo flujo desde Competición → «Desde mis cartas» ==');
await abrir(390, 844);
await ev(`document.getElementById('menuBtn').click(); 1`); await sleep(300); await ev(`document.getElementById('pmCompetition').click(); 1`); await sleep(2500);
check('Competición ofrece «Desde mis cartas»', (await txt('#cxMine')) === 'Desde mis cartas');
await click('#cxMine', 1800);
const tilesC = await ev(`Array.from(document.querySelectorAll('.mc-tile')).map(function(b){ return b.dataset.number })`);
check('es la misma pantalla y la misma lógica (mismos Pilots, mismos controles)', (await hashNow()) === '#competicion/mias' && (await txt('.cx-title')) === 'Crear desde mis cartas' && JSON.stringify(tilesC) === JSON.stringify(Object.keys(COL).filter((n) => by[n].type === 'PILOT').sort()) && (await count('#mcRoot')) === 1);
await click(tile('ST01-010'), 400);
await click('#mcSearch', 1500);
check('y encuentra las mismas listas', JSON.stringify(await ev(`Array.from(document.querySelectorAll('#mcResults .cx-list')).map(function(b){ return b.dataset.list })`)) === JSON.stringify(S.matchLists(lists, [{ n: 'ST01-010', prio: 'must' }]).exact.slice(0, 20).map((m) => m.key)));
await ev(`history.back(); 1`); await sleep(700); await ev(`history.back(); 1`); await sleep(800);
check('«atrás» vuelve a la portada de Competición', (await hashNow()) === '#competicion/mazos');

console.log('\n== colección vacía, inglés y catálogo intacto ==');
await abrir(390, 844, { col: '' }); await porColeccion();
check('sin Pilots: estado vacío amable, acceso a Mi colección y opción de explorar Units', /Todavía no tienes Pilots registrados/.test(await txt('#mcEmpty')) && (await count('#mcGoColl')) === 1 && (await count('#mcOther')) === 1 && (await count('.mc-tile')) === 0);
await click('#mcOther', 400);
check('y sin Units tampoco inventa nada', /Todavía no tienes Units registradas/.test(await txt('#mcEmpty')));
await click('#mcGoColl', 1500);
check('«Ir a Mi colección» vuelve a Mi colección', (await ev(`!document.getElementById('collPage').hidden`)) === true);
await abrir(390, 844, { lang: 'en' }); await porColeccion();
check('textos en inglés', (await txt('.cx-title')) === 'Build from my cards' && (await ev(`document.getElementById('mcSearch').textContent`)) === 'Find decks');
await abrir(390, 844);
check('el catálogo sigue mostrando las etiquetas TENGO de la colección', (await ev(`document.querySelectorAll('.coll-tag:not([hidden])').length`)) > 0);
check('sin errores de JavaScript', errs.length === 0, errs.slice(0, 3));
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
