// Competición V1: explorar mazos → arquetipo → lista → copiar. Datos reales del repositorio (decklists.json + competition_events.json); los casos de datos malos se inyectan
// interceptando fetch en la página (nada se escribe en disco). Límites: 30 s por orden y 5 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_competicion_v1.mjs
import fs from 'node:fs';
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

/* ---- lo que debería salir, calculado aparte con los mismos datos y reglas ---- */
const S = require('../comp_stats.js'); const { loadCatalog } = require('../scripts/import_deck_export.js');
const cat = loadCatalog(), has = (n) => !!cat[n];
const DL = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')), EV = JSON.parse(fs.readFileSync('data/competition_events.json', 'utf8')), AL = JSON.parse(fs.readFileSync('data/archetype_aliases.json', 'utf8'));
const table = { archetypes: AL.archetypes, byId: AL.archetypes.reduce((m, x) => { m[x.id] = x.name; return m; }, {}) };
const slug = (n, set) => S.normText(n).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '.' + String(set || '').toLowerCase();
function esperado(extra) {
  const lists = [], seen = {};
  const push = (it) => { if (!it.name || !it.cards || seen[it.key] || S.deckStatus({ cards: it.cards }, has) !== 'complete') return; seen[it.key] = 1; it.arch = slug(it.name, it.set); lists.push(it); };
  (extra || DL).archetypes.forEach((a) => a.decks.forEach((d) => push({ key: d.h, name: a.name, set: 'GD05', date: (d.event || {}).date || '', cards: d.cards })));
  const evs = {}; EV.events.forEach((e) => { evs[e.id] = e; });
  EV.results.forEach((r) => { if (S.originOf(r) !== 'tournament' || !r.cards) return; const e = evs[r.eventId] || {}, res = S.resolveArchetype(r.archetype, table); push({ key: r.id, name: res.id ? res.name : r.archetype, set: e.set || r.set, date: e.date || '', cards: r.cards }); });
  const by = {}; lists.forEach((l) => { (by[l.arch] = by[l.arch] || { key: l.arch, name: l.name, lists: [] }).lists.push(l); });
  const arches = Object.values(by); arches.forEach((a) => { a.lists.sort((x, y) => (x.date ? 0 : 1) - (y.date ? 0 : 1) || String(y.date).localeCompare(x.date) || x.key.localeCompare(y.key)); a.latest = a.lists[0].date || ''; });
  arches.sort((a, b) => (a.latest ? 0 : 1) - (b.latest ? 0 : 1) || String(b.latest).localeCompare(a.latest) || a.name.localeCompare(b.name));
  return { arches, lists };
}
const E = esperado();
const sig = (c) => Object.keys(c).sort().map((k) => k + ':' + c[k]).join(',');
const MAZOS = { d1: { name: 'Mi mazo A', cards: { 'GD01-001': 2 }, updatedAt: 1700000000000 }, d2: { name: 'Mi mazo B', cards: { 'GD01-002': 3 }, updatedAt: 1700000001000 } };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'], fecha = (iso) => { const p = iso.split('-'); return +p[2] + ' ' + MES[+p[1] - 1] + ' ' + p[0]; };

let hookId = null;
async function abrir(W, H, { hash = '', mod = '', lang = 'es', seed = true } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId }); hookId = null;
  if (mod) hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ var of = window.fetch; window.fetch = function(u, o){ var s = String(u); ${mod} return of.apply(this, arguments); }; })();` })).result.identifier;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); ${seed ? `localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(MAZOS))});` : ''} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3800);
}
const porMenu = async () => { await ev(`document.getElementById('menuBtn').click(); 1`); await sleep(400); await ev(`document.getElementById('pmCompetition').click(); 1`); await sleep(2500); };
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const hs = () => ev('document.documentElement.scrollWidth <= innerWidth + 1');
const hashNow = () => ev('location.hash');
const mazos = () => ev(`JSON.parse(localStorage.getItem('msa_decks') || '{}')`);
const archAttr = () => ev(`Array.from(document.querySelectorAll('.cx-card')).map(function(b){ return b.dataset.arch })`);

for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H); const antes = JSON.stringify(await mazos());
  await porMenu();
  // 1 · portada
  check('entrar en Competición muestra «Explorar mazos» (sin elegir GD05/GD06 ni Torneos)', (await hashNow()) === '#competicion/mazos' && (await count('.cx-card')) === E.arches.length && (await count('#compTabs > *')) === 0 && (await ev(`document.getElementById('compScope').hidden`)) === true, [await hashNow(), await count('.cx-card'), E.arches.length]);
  check('título «Competición», subtítulo y buscador «Buscar mazo…»', (await txt('#compTitle')) === 'Competición' && (await txt('#compSub')) === 'Descubre qué mazos se están jugando.' && (await ev(`document.getElementById('cxSearch').placeholder`)) === 'Buscar mazo…');
  const orden = await archAttr();
  check('solo arquetipos con al menos una lista completa, ordenados por la actividad más reciente', JSON.stringify(orden) === JSON.stringify(E.arches.map((a) => a.key)), [orden.slice(0, 4), E.arches.slice(0, 4).map((a) => a.key)]);
  const home = await ev(`(function(){ var p=document.getElementById('compPanel').textContent; return { pct:/%/.test(p), win:/win ?rate/i.test(p), cincuenta:/50 cartas/i.test(p), jugador:/jugador|player/i.test(p), puesto:/puesto/i.test(p) } })()`);
  check('sin porcentajes, win rate, «50 cartas», jugadores ni puestos', !home.pct && !home.win && !home.cincuenta && !home.jugador && !home.puesto, home);
  const tarj = await ev(`(function(){ var b=document.querySelector('.cx-card'), r=b.getBoundingClientRect(), im=b.querySelector('img'), d=b.querySelector('.cx-dual'); return { h:Math.round(r.height), w:Math.round(r.width), img:/images\\/[A-Z0-9-]+\\.webp$/.test(im.getAttribute('src')), alt:im.alt, ratio:+(im.getBoundingClientRect().width/im.getBoundingClientRect().height).toFixed(2), dual:d && getComputedStyle(d).backgroundImage.indexOf('linear-gradient')>=0, tag:b.tagName } })()`);
  check('tarjeta: botón completo ≥44 px, imagen real del catálogo con alt, proporción de carta y cuadrado de color', tarj.tag === 'BUTTON' && tarj.h >= 44 && tarj.img && tarj.alt.length > 2 && tarj.ratio > 0.68 && tarj.ratio < 0.75 && tarj.dual === true, tarj);
  check('sin desbordamiento horizontal', await hs());
  check('seguir en Meta y Torneos es posible pero no es lo primero', (await txt('#cxToMeta')) === 'Ver Meta y Torneos');
  const sinMeta = await ev(`document.getElementById('compPanel').querySelectorAll('.gd-rows, .gd-arow').length`);
  check('la portada no pinta tablas de presencia', sinMeta === 0);

  // 2 · buscador
  const q = E.arches[0].name.split(' ')[0].toLowerCase();
  await ev(`(function(){ var i=document.getElementById('cxSearch'); i.focus(); i.value=${JSON.stringify(q)}; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(500);
  const esp = E.arches.filter((a) => S.normText(a.name).indexOf(S.normText(q)) >= 0).length;
  check('buscar filtra por nombre de arquetipo (' + q + ': ' + esp + ')', (await count('.cx-card')) === esp && esp >= 1 && (await ev(`document.activeElement.id`)) === 'cxSearch', [await count('.cx-card'), esp]);
  check('la búsqueda queda en la URL', (await hashNow()).indexOf('?q=') > 0, await hashNow());
  await ev(`(function(){ var i=document.getElementById('cxSearch'); i.value='zzzzzz-no-existe'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(400);
  check('sin coincidencias se dice claramente, sin tarjetas falsas', (await count('.cx-card')) === 0 && /Ningún mazo coincide/.test(await txt('.cx-note')));
  await ev(`(function(){ var i=document.getElementById('cxSearch'); i.value=${JSON.stringify(q)}; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(400);

  // 3 · arquetipo
  const A = E.arches.filter((a) => S.normText(a.name).indexOf(S.normText(q)) >= 0)[0];
  await ev(`document.querySelector('.cx-card[data-arch="${A.key}"]').click(); 1`); await sleep(900);
  check('abrir un arquetipo cambia la URL y muestra su nombre y su cuadrado de color', (await hashNow()).indexOf('#competicion/mazos/' + A.key) === 0 && (await txt('.cx-title')) === A.name && (await count('.cx-title .cx-dual')) === 1, [await hashNow(), await txt('.cx-title')]);
  const listas = await ev(`Array.from(document.querySelectorAll('.cx-list')).map(function(b){ return { key:b.dataset.list, foot:b.querySelector('.cx-foot').textContent.trim(), thumbs:b.querySelectorAll('.cx-thumbs img').length, h:Math.round(b.getBoundingClientRect().height) } })`);
  check('sus listas salen por fecha, de más recientes a más antiguas', JSON.stringify(listas.map((l) => l.key)) === JSON.stringify(A.lists.map((l) => l.key)), [listas.slice(0, 3).map((l) => l.key), A.lists.slice(0, 3).map((l) => l.key)]);
  check('cada lista: 3–4 miniaturas reales, fecha discreta y tarjeta completa clicable', listas.every((l) => l.thumbs >= 3 && l.thumbs <= 4 && l.h >= 44) && listas.every((l, i) => A.lists[i].date ? l.foot.indexOf(fecha(A.lists[i].date)) === 0 : /Fecha no disponible/.test(l.foot)), listas.slice(0, 2));
  const cuerpo = await txt('#compPanel');
  check('sin nombres de jugador, «50 cartas», posiciones ni bloque de estadísticas', !/jugador|player|50 cartas|puesto|%/i.test(cuerpo), cuerpo.slice(0, 200));
  const fechaPeq = await ev(`parseFloat(getComputedStyle(document.querySelector('.cx-foot')).fontSize)`);
  check('la fecha es pequeña pero legible (≥12 px)', fechaPeq >= 12 && fechaPeq <= 14, fechaPeq);

  // 4 · lista
  const L = A.lists[0], Lx = Object.keys(L.cards);
  await ev(`document.querySelector('.cx-list').click(); 1`); await sleep(1100);
  check('abrir una lista muestra todas sus cartas distintas con su cantidad', (await count('.cx-cardbtn')) === Lx.length, [await count('.cx-cardbtn'), Lx.length]);
  const cant = await ev(`(function(){ var o={}; document.querySelectorAll('.cx-cardbtn').forEach(function(b){ o[b.dataset.number] = +b.querySelector('.cx-qty').textContent.replace('×','') }); return o })()`);
  check('las cantidades coinciden con la lista original y suman 50', sig(cant) === sig(L.cards) && Object.values(cant).reduce((x, y) => x + y, 0) === 50);
  check('cartas agrupadas por tipo (unidades, pilotos, comandos, bases) con imágenes reales', (await count('.cx-type')) >= 2 && (await ev(`Array.from(document.querySelectorAll('.cx-cardbtn img')).every(function(i){ return /images\\/[A-Z0-9-]+\\.webp$/.test(i.getAttribute('src')) && i.alt.length > 1 })`)) === true);
  check('hay un CTA principal «Copiar mazo» visible sin desbordar', (await txt('#cxCopy')) === 'Copiar mazo' && (await hs()));
  check('la fecha y la fuente se ven discretas, sin jugador', /\d{1,2} \w{3} \d{4}/.test(await txt('.cx-metaline')) && !/jugador|player/i.test(await txt('#compPanel')));
  // abrir una carta no cambia ningún mazo
  await ev(`document.querySelector('.cx-cardbtn').click(); 1`); await sleep(1200);
  check('tocar una carta abre su ficha y no cambia ningún mazo', (await ev(`!document.getElementById('overlay').hidden`)) === true && JSON.stringify(await mazos()) === antes);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); 1`); await sleep(900);

  // 5 · copiar
  await ev(`document.getElementById('cxCopy').click(); 1`); await sleep(700);
  check('«Copiar mazo» pide nombre (por defecto «<arquetipo> · Copia») sin crear nada todavía', (await ev(`document.getElementById('nameInput').value`)) === (A.name + ' · Copia').slice(0, 40) && JSON.stringify(await mazos()) === antes, await ev(`document.getElementById('nameInput').value`));
  await ev(`document.getElementById('nameSave').click(); 1`); await sleep(900);
  const m1 = await mazos(), nuevos = Object.keys(m1).filter((k) => !MAZOS[k]);
  check('se crea UN mazo nuevo, idéntico a la lista, y los existentes no se tocan', nuevos.length === 1 && sig(m1[nuevos[0]].cards) === sig(L.cards) && JSON.stringify(m1.d1) === JSON.stringify(MAZOS.d1) && JSON.stringify(m1.d2) === JSON.stringify(MAZOS.d2), { nuevos: nuevos.length });
  check('confirmación clara con «Ver mi mazo»', /Mazo creado/.test(await txt('#cxMsg')) && (await txt('#cxViewDeck')) === 'Ver mi mazo' && (await ev(`document.getElementById('cxMsg').getAttribute('role')`)) === 'status');
  await ev(`document.getElementById('cxCopy').click(); 1`); await sleep(500); await ev(`document.getElementById('nameSave').click(); 1`); await sleep(900);
  const m2 = await mazos();
  check('copiarla otra vez crea otro mazo distinto (nunca sobrescribe)', Object.keys(m2).length === Object.keys(MAZOS).length + 2 && JSON.stringify(m2[nuevos[0]]) === JSON.stringify(m1[nuevos[0]]));
  await ev(`document.getElementById('cxViewDeck').click(); 1`); await sleep(1400);
  check('«Ver mi mazo» abre el mazo copiado en Mis mazos', (await ev(`!document.getElementById('decksPage').hidden`)) === true && (await ev(`document.getElementById('compPage').hidden`)) === true);
}

console.log('\n== navegación atrás/adelante, scroll y teclado (390 px) ==');
await abrir(390, 844); await porMenu();
await ev(`document.getElementById('compPage').scrollTop = 900; 1`); await sleep(300);
const sc0 = await ev(`Math.round(document.getElementById('compPage').scrollTop)`);
const alto = await ev(`Array.from(document.querySelectorAll('.cx-card'))[6].dataset.arch`);
await ev(`document.querySelector('.cx-card[data-arch="${alto}"]').click(); 1`); await sleep(800);
await ev(`document.querySelector('.cx-list').click(); 1`); await sleep(800);
await ev(`history.back(); 1`); await sleep(700); const enArch = (await hashNow()).split('/').length === 3 && (await count('.cx-list')) >= 1;
await ev(`history.back(); 1`); await sleep(900);
const sc1 = await ev(`Math.round(document.getElementById('compPage').scrollTop)`);
check('«atrás» vuelve de la lista al arquetipo y de ahí a la portada', enArch && (await hashNow()) === '#competicion/mazos' && (await count('.cx-card')) > 10);
check('al volver a la portada el scroll no salta (±2 px)', Math.abs(sc1 - sc0) <= 2 && sc0 > 400, [sc0, sc1]);
await ev(`history.forward(); 1`); await sleep(700);
check('«adelante» reabre el arquetipo', (await hashNow()).indexOf('/' + alto) > 0 && (await count('.cx-list')) >= 1);
await ev(`document.getElementById('cxBack').click(); 1`); await sleep(800);
check('el botón «← Competición» también vuelve a la portada', (await hashNow()) === '#competicion/mazos');
// buscar, entrar y volver conserva lo tecleado
await ev(`(function(){ var i=document.getElementById('cxSearch'); i.value='bg'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(400);
await ev(`document.querySelector('.cx-card').click(); 1`); await sleep(700); await ev(`history.back(); 1`); await sleep(800);
check('tras abrir un mazo y volver, el buscador conserva lo escrito y el filtro', (await ev(`document.getElementById('cxSearch').value`)) === 'bg' && (await count('.cx-card')) === E.arches.filter((a) => S.normText(a.name).indexOf('bg') >= 0).length);
// teclado
await ev(`document.getElementById('cxSearch').value=''; document.getElementById('cxSearch').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.cx-card').focus(); 1`); await sleep(300);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(800);
check('con teclado: Enter sobre una tarjeta la abre y el foco pasa al título', (await count('.cx-list')) >= 1 && (await ev(`document.activeElement.classList.contains('cx-title')`)) === true);
check('las transiciones solo animan transform (nada de width, height ni padding)', (await ev(`['.cx-card','.cx-list'].every(function(s){ var e=document.querySelector(s)||document.querySelector('.cx-list'); return !/(width|height|padding|all)/.test(getComputedStyle(e).transitionProperty) })`)) === true);

console.log('\n== dos listas el mismo día, datos malos, imágenes y errores ==');
const mismo = E.arches.map((a) => { const g = {}; a.lists.forEach((l) => { if (l.date) (g[l.date] = g[l.date] || []).push(l); }); const d = Object.keys(g).find((k) => g[k].length >= 2 && sig(g[k][0].cards) !== sig(g[k][1].cards)); return d ? { a, l: g[d] } : null; }).filter(Boolean)[0];
if (mismo) {
  await abrir(390, 844, { hash: '#competicion/mazos/' + mismo.a.key });
  const dos = await ev(`Array.from(document.querySelectorAll('.cx-list')).map(function(b){ return b.dataset.list })`);
  check('dos listas del mismo día salen como tarjetas separadas, sin fusionarse', mismo.l.every((l) => dos.indexOf(l.key) >= 0) && new Set(dos).size === dos.length, [dos.length, mismo.l.map((l) => l.key)]);
  for (const l of mismo.l.slice(0, 2)) {
    await ev(`document.querySelector('.cx-list[data-list="${l.key}"]').click(); 1`); await sleep(800);
    const c = await ev(`(function(){ var o={}; document.querySelectorAll('.cx-cardbtn').forEach(function(b){ o[b.dataset.number] = +b.querySelector('.cx-qty').textContent.replace('×','') }); return o })()`);
    check('cada una se abre con SU composición (' + l.key.slice(0, 8) + '…)', sig(c) === sig(l.cards));
    await ev(`history.back(); 1`); await sleep(700);
  }
} else check('hay un arquetipo con dos listas distintas el mismo día (sin él esta comprobación no probaría nada)', false);

const malos = { snapshot: DL.snapshot, unknownCards: [], archetypes: DL.archetypes.concat([
  { id: 'zz1', name: 'ZZ Incompleto', colors: ['Red'], style: 'x', decks: [{ h: 'h-incompleta', place: 1, event: { id: '1', title: 'E', date: '2026-11-09', country: 'JP' }, cards: Object.assign({}, DL.archetypes[0].decks[0].cards, { 'GD01-001': 4 }) }] },
  { id: 'zz2', name: 'ZZ Desconocido', colors: ['Blue'], style: 'x', decks: [{ h: 'h-desconocida', place: 1, event: { id: '2', title: 'E', date: '2026-11-09', country: 'JP' }, cards: Object.assign({}, DL.archetypes[0].decks[0].cards, { 'ZZ99-999': 1, [Object.keys(DL.archetypes[0].decks[0].cards)[0]]: 3 }) }] }]) };
// la primera: más de 50 o menos de 50; se fuerza 49 quitando una copia
{ const d = malos.archetypes[malos.archetypes.length - 2].decks[0]; const k = Object.keys(d.cards)[0]; d.cards[k] = Math.max(0, d.cards[k] - 1); if (!d.cards[k]) delete d.cards[k]; }
await abrir(390, 844, { mod: `if (s.indexOf('data/decklists.json') >= 0) return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(malos))}, { status:200, headers:{'Content-Type':'application/json'} }));` });
await porMenu();
const claves = await archAttr();
check('listas incompletas (49 cartas) o con cartas que no existen NO entran en el catálogo principal', claves.indexOf('zz-incompleto.gd05') < 0 && claves.indexOf('zz-desconocido.gd05') < 0 && claves.length === E.arches.length, [claves.length, E.arches.length]);

// imagen que falta
await abrir(390, 844); await porMenu();
const cubierta = await ev(`document.querySelector('.cx-card img').getAttribute('src')`);
await send('Network.setBlockedURLs', { urls: ['*' + cubierta.replace(/^.*\//, '')] });
await abrir(390, 844); await porMenu();
check('si falta la imagen, la tarjeta sale con un recuadro con el nombre y no se rompe', (await count('.cx-card .cx-ph')) >= 1 && (await count('.cx-card')) === E.arches.length && (await hs()));
await send('Network.setBlockedURLs', { urls: [] });

// sin listas
await abrir(390, 844, { mod: `if (s.indexOf('data/decklists.json') >= 0) return Promise.resolve(new Response(JSON.stringify({ snapshot:{ source:{name:'x',url:'https://x.test'} }, archetypes:[], unknownCards:[] }), { status:200, headers:{'Content-Type':'application/json'} })); if (s.indexOf('data/competition_events.json') >= 0) return Promise.resolve(new Response(JSON.stringify({ version:1, events:[], results:[], review:[] }), { status:200, headers:{'Content-Type':'application/json'} }));` });
await porMenu();
check('sin listas completas: estado vacío claro y ninguna tarjeta inventada', (await count('.cx-card')) === 0 && /Todavía no hay listas completas disponibles/.test(await txt('.cx-note')));

// error de carga y reintento
await abrir(390, 844, { mod: `if (s.indexOf('data/decklists.json') >= 0 && !window.__ok) return Promise.resolve(new Response('x', { status:500 }));` });
await porMenu();
check('si falla la carga, aviso con «Reintentar» (no pantalla en blanco)', /No se pudieron cargar los mazos/.test(await txt('#compPanel')) && (await count('.gd-retry')) === 1);
await ev(`window.__ok = true; document.querySelector('.gd-retry').click(); 1`); await sleep(2500);
check('al reintentar se recupera sin recargar la página', (await count('.cx-card')) === E.arches.length);

console.log('\n== lo antiguo sigue ahí, idioma y anchos ==');
await abrir(390, 844, { hash: '#competicion' });
check('la ruta antigua #competicion sigue abriendo Meta (con sus pestañas)', (await count('#compTabs [role="tab"], #compTabs button')) >= 2 && (await count('.cx-card')) === 0);
await abrir(390, 844, { hash: '#competicion/torneos' });
check('#competicion/torneos sigue abriendo Torneos', (await count('.cx-card')) === 0 && (await count('#compTabs button, #compTabs [role="tab"]')) >= 2);
await abrir(390, 844); await porMenu();
await ev(`document.getElementById('cxToMeta').click(); 1`); await sleep(1500);
check('«Ver Meta y Torneos» lleva a la vista antigua', (await count('#compTabs button, #compTabs [role="tab"]')) >= 2 && (await count('.cx-card')) === 0);
await abrir(390, 844, { lang: 'en' }); await porMenu();
check('textos en inglés', (await txt('#compSub')) === 'Discover which decks are being played.' && (await ev(`document.getElementById('cxSearch').placeholder`)) === 'Search deck…');
for (const [W, H] of [[320, 640], [360, 740], [430, 932], [1440, 900]]) {
  await abrir(W, H); await porMenu();
  const a1 = await hs(); await ev(`document.querySelector('.cx-card').click(); 1`); await sleep(700); const a2 = await hs(); await ev(`document.querySelector('.cx-list').click(); 1`); await sleep(900); const a3 = await hs();
  check('sin desbordamiento horizontal en portada, arquetipo y lista a ' + W + ' px', a1 && a2 && a3, [a1, a2, a3]);
}
check('sin errores de JavaScript', errs.length === 0, errs.slice(0, 3));
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
