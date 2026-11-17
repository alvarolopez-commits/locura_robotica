// Competición al estilo de las webs de meta: el menú abre Meta; resumen, cuota por color y cartas más usadas; Torneos con podio y días; enlace a Explorar.
// Una sola pasada, sin reintentos. Límites: 30 s por orden y 4 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_competicion_meta.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (4 min) en: ' + paso); process.exit(3); }, 240000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text || '').slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: (r.result.exceptionDetails.exception?.description || '').slice(0, 300) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra).slice(0, 300) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
const q = (s) => `document.querySelector(${JSON.stringify(s)})`;
const count = (s) => ev(`document.querySelectorAll(${JSON.stringify(s)}).length`);
const txt = (s) => ev(`(${q(s)} || {}).textContent`);
const click = async (s, ms = 700) => { const r = await ev(`(function(){ var e = ${q(s)}; if(!e) return false; e.click(); return true; })()`); await sleep(ms); return r; };
const hashNow = () => ev('location.hash');
const noH = () => ev('document.documentElement.scrollWidth <= innerWidth + 1');
async function abrir(W, H, hash, lang = 'es') {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + (hash || '') }); await sleep(400);
  await send('Page.reload'); await sleep(3800);   // el cambio de hash no recarga: así el idioma guardado y la ruta se leen desde cero
}

/* ---- datos de referencia calculados aparte (totales por arquetipo de meta.json + colores de decklists.json) ---- */
const S = require('../comp_stats.js'); const { loadCatalog } = require('../scripts/import_deck_export.js'); const cat = loadCatalog();
const DL = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')), ML = JSON.parse(fs.readFileSync('data/meta.json', 'utf8')), HIST = JSON.parse(fs.readFileSync('data/decklists_hist.json', 'utf8'));
const colorsOfName = {}; DL.archetypes.forEach((a) => { colorsOfName[a.name] = a.colors || []; });
const LETTER = { B: 'Blue', G: 'Green', R: 'Red', P: 'Purple', W: 'White' };
const conteo = (era) => { const o = {}; ML.archetypes.forEach((a) => { if (a.eraDecks[era]) o[a.name] = a.eraDecks[era]; }); return o; };
const colorRefOf = (era) => S.colorShare(Object.entries(conteo(era)).map(([name, n]) => ({ colors: colorsOfName[name] || (ML.archetypes.find((a) => a.name === name).colors || []).map((x) => LETTER[x]), weight: n })));
const topRefOf = (era) => S.estimateTopCards(ML.archetypes, conteo(era), 30, (n) => cat[n] && !cat[n].token, era);   // perfil del mismo set
const totalOf = (era) => Object.values(conteo(era)).reduce((s, x) => s + x, 0);
const colorRef = colorRefOf('GD05'), topRef = topRefOf('GD05').rows, win05 = ML.snapshot.windows.GD05;

console.log('\n== el menú abre Meta (390 px) ==');
await abrir(390, 844);
await ev(`document.getElementById('menuBtn').click(); 1`); await sleep(400); await click('#pmCompetition', 2800);
check('el menú Competición abre Meta con sus pestañas, no la portada de Explorar', (await count('#compTabs button')) === 2 && (await count('.cx-card')) === 0 && (await ev(`${q('#compTab-meta')}.getAttribute('aria-selected')`)) === 'true', [await count('#compTabs button'), await count('.cx-card')]);

console.log('\n== Meta GD05: resumen de temporada, ranking, color y cartas ==');
await abrir(390, 844, '#competicion?s=GD05');
check('el ranking sigue siendo lo primero que se ve (390 × 844)', (await ev(`(function(){ var a=document.querySelector('.gd-arow').getBoundingClientRect(); return a.bottom <= innerHeight - 60 })()`)) === true);
const cover = await txt('.gd-cover'), inl = await txt('.gd-stats-inline');
check('resumen: temporada, fechas de cobertura y días', /^GD05 · Side-6/.test(cover) && /31 jul 2026/.test(cover) && /6 nov 2026/.test(cover) && /\(\d+ días\)/.test(cover), cover);
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
check('resumen: puestos registrados, arquetipos y porcentaje del top 3 con los valores de los datos', inl.indexOf(miles(totalOf('GD05'))) >= 0 && new RegExp('\\b' + Object.keys(conteo('GD05')).length + ' arquetipos').test(inl) && /\d+,\d %/.test(inl), inl);
const top3 = Object.values(conteo('GD05')).sort((x, y) => y - x).slice(0, 3).reduce((s, x) => s + x, 0) / totalOf('GD05') * 100;
check('el porcentaje del top 3 es la suma de las tres primeras filas', Math.abs(parseFloat(inl.match(/(\d+,\d) % en el top 3/)[1].replace(',', '.')) - top3) < 0.06, [inl, top3]);
check('aviso de los puestos sin arquetipo (GD05: ' + (win05.total - totalOf('GD05')) + ')', new RegExp(miles(win05.total - totalOf('GD05')) + ' puestos \\(').test(await txt('#gdSeasonSummary')) && /no entran en el ranking/.test(await txt('#gdSeasonSummary')), await txt('#gdSeasonSummary'));
check('GD05 ya no está «en curso»: sin aviso de temporada parcial', !/Temporada en curso/.test(await txt('#gdSeasonSummary')));
check('«Sobre estos datos» es un desplegable cerrado que explica que los puestos no son participantes', (await ev(`${q('.gd-method')}.open`)) === false && /no todos los participantes/.test(await ev(`${q('.gd-method')}.textContent`)));
check('el título del ranking dice «puestos registrados», no «listas»', /Ranking de arquetipos · .*puestos registrados/.test(await txt('.gd-share-title')) && !/listas/.test(await txt('.gd-share-title')), await txt('.gd-share-title'));
const filas = await ev(`Array.prototype.map.call(document.querySelectorAll('.gd-rows .gd-arow'), function(r){ return { name: r.querySelector('.cr-name').textContent.trim(), val: r.querySelector('.cr-val').textContent, meta: r.querySelector('.cr-meta').textContent, pips: r.querySelectorAll('.dd-pip').length, delta: (r.querySelector('.gd-delta') || {}).textContent || '', aria: r.getAttribute('aria-label') }; })`);
check('cada fila: nombre, colores, % y «N puestos» (sin «de N listas»)', filas.length === 7 && filas.every((f) => f.pips >= 1 && /^\d[\d.]* puestos?$/.test(f.meta) && /%/.test(f.val) && !/listas/.test(f.meta)), filas.slice(0, 2));
const ranking05 = Object.entries(conteo('GD05')).sort((x, y) => y[1] - x[1]);
check('el orden es por representación descendente y la fila 1 es el arquetipo con más puestos', filas[0].name === ranking05[0][0] && filas.every((f, i) => i === 0 || parseFloat(f.val.replace(',', '.')) <= parseFloat(filas[i - 1].val.replace(',', '.')) + 1e-9), [filas[0].name, ranking05[0]]);
const pctRef = (era, name) => conteo(era)[name] / totalOf(era) * 100;
check('cada porcentaje es puestos / total de puestos con arquetipo', filas.every((f) => Math.abs(parseFloat(f.val.replace(',', '.')) - pctRef('GD05', f.name)) < 0.06), filas.map((f) => [f.name, f.val]));
const cmp = filas.find((f) => conteo('GD04')[f.name] && f.delta);
check('la evolución frente a GD04 sale cuando es comparable, con flecha y signo (no solo color) y texto accesible', !!cmp && /^[▲▼]|^=/.test(cmp.delta) && /pts/.test(cmp.delta) && /Sube|Baja|Sin cambios/.test(cmp.aria), cmp);
if (cmp) {
  const dd = Math.abs(parseFloat(cmp.delta.replace(/[^\d,]/g, '').replace(',', '.'))), real = Math.abs(pctRef('GD05', cmp.name) - conteo('GD04')[cmp.name] / totalOf('GD04') * 100);
  check('esa evolución es la diferencia de porcentajes de las dos temporadas (' + cmp.name + ')', Math.abs(dd - real) < 0.06, [cmp.delta, real]);
}
check('Cambios recientes: puntos de representación, «no volúmenes» y la limitación de GD04 (puestos sin arquetipo)', /no volúmenes/.test(await ev(`document.getElementById('compPanel').textContent`)) && /menos fiable/.test(await ev(`document.getElementById('compPanel').textContent`)));
check('cuota por color → «Representación por color» con la explicación del reparto proporcional', /Representación por color/.test(await txt('#gdColors')) && /a partes iguales entre sus colores/.test(await txt('#gdColors')), await txt('#gdColors'));
check('representación por color: 5 filas en orden descendente', (await count('.gd-crow')) === 5, await count('.gd-crow'));
const cv = await ev(`Array.prototype.map.call(document.querySelectorAll('.gd-crow .gd-cval'), function(e){ return parseFloat(e.textContent.replace(',', '.')); })`);
check('los valores suman 100 (±0,3 por redondeo) y no crecen', Math.abs(cv.reduce((s, x) => s + x, 0) - 100) < 0.3 && cv.every((x, i) => i === 0 || x <= cv[i - 1] + 1e-9), cv);
check('cada fila de color es una imagen con texto accesible y el color tiene nombre', (await ev(`Array.prototype.every.call(document.querySelectorAll('.gd-crow'), function(e){ return e.getAttribute('role') === 'img' && /%/.test(e.getAttribute('aria-label')); })`)) === true);
check('el primer color y su porcentaje coinciden con el cálculo independiente (puestos por arquetipo)', Math.abs(cv[0] - colorRef[0].pct) < 0.06, [cv[0], colorRef[0].pct]);
check('«Cartas más utilizadas»: 10 filas con imagen, nombre y uso estimado', /Cartas más utilizadas/.test(await txt('#gdTopCards')) && (await count('.gd-tcard')) === 10 && (await count('.gd-tcard img')) === 10 && /Uso estimado ≈ \d+ %/.test((await txt('.gd-ttext small')) || ''), await txt('.gd-ttext small'));
check('es una estimación y lo dice: sin recuentos «N de M» ni decimales en las cartas', /Estimación a la baja, no un recuento/.test(await txt('#gdTopCards')) && (await ev(`Array.prototype.some.call(document.querySelectorAll('.gd-ttext small'), function(e){ return /\\d+ de \\d+|\\d,\\d/.test(e.textContent); })`)) === false, await txt('.gd-ttext small'));
const basis = await ev(`Array.prototype.map.call(document.querySelectorAll('#gdBasis li'), function(l){ return [l.dataset.basis, parseFloat(l.querySelector('b').textContent.replace(',', '.'))]; })`);
const ref5 = topRefOf('GD05');
check('la base de los datos se distingue: consenso / listas de ejemplo / sin perfil, con los % reales y suma 100', basis.length >= 1 && Math.abs(basis.reduce((s, x) => s + x[1], 0) - 100) < 0.3 && Math.abs((basis.find((x) => x[0] === 'consensus') || [0, 0])[1] - ref5.basis.consensus / ref5.total * 100) < 0.06, [basis, ref5.basis]);
const first = await ev(`${q('.gd-tcard')}.dataset.number`);
check('la carta número 1 es la más usada según el cálculo independiente (' + topRef[0].n + ')', first === topRef[0].n, [first, topRef[0]]);
const pct1 = parseFloat((await txt('.gd-ttext small')).match(/≈ (\d+) %/)[1]);
check('su uso estimado es la estimación redondeada al entero', pct1 === Math.round(topRef[0].pct), [pct1, topRef[0].pct]);
check('cada fila es un botón de al menos 44 px', (await ev(`Array.prototype.every.call(document.querySelectorAll('.gd-tcard'), function(b){ return b.getBoundingClientRect().height >= 44; })`)) === true);
await click('#gdAllCards', 500);
check('«Ver las 30 primeras» amplía la lista a 30 y vuelve a 10', (await count('.gd-tcard')) === 30 && (await ev(`${q('#gdAllCards')}.getAttribute('aria-expanded')`)) === 'true');
await click('#gdAllCards', 400);
check('al plegar vuelve a 10 filas', (await count('.gd-tcard')) === 10);
await click('.gd-tcard', 900);
check('tocar una carta abre su ficha', (await ev(`(function(){ var d = document.getElementById('detail'); return !!d && !d.hidden && d.getBoundingClientRect().width > 0; })()`)) === true);
await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`); await sleep(500);


console.log('\n== enlace a Explorar ==');
check('hay un botón «Explorar mazos» en Meta', (await txt('#gdToExplore')) === 'Explorar mazos');
await click('#gdToExplore', 1500);
check('lleva a la portada de Explorar con arquetipos', (await hashNow()).startsWith('#competicion/mazos') && (await count('.cx-card')) > 10, [await hashNow(), await count('.cx-card')]);
await ev('history.back(); 1'); await sleep(1200);
check('«atrás» devuelve a Meta', (await count('#compTabs button')) === 2 && (await count('.gd-stats-inline')) === 1, [await count('#compTabs button'), await count('.gd-stats-inline')]);

console.log('\n== Meta GD06 (Side-6) ==');
await abrir(390, 844, '#competicion?s=GD06');
const n06 = Number(String(await ev(`document.querySelector('.gd-stats-inline .gd-stat-i b').textContent`)).replace(/\D/g, ''));
check('el resumen cuenta los puestos de la temporada (totales de Side-6)', n06 === totalOf('GD06'), [n06, totalOf('GD06')]);
check('GD06 está «en curso»: aviso discreto con sus días de datos', /Temporada en curso \(\d+ días de datos\)/.test(await txt('#gdSeasonSummary')), await txt('#gdSeasonSummary'));
check('GD06 compara con GD05 en puntos de representación y lo explica', /entre GD06 \(.* puestos, \d+ días\) y GD05/.test(await ev(`document.getElementById('compPanel').textContent`)) && (await count('.gd-delta')) >= 5);
check('GD06: la base de sus cartas distingue lo que no tiene perfil', (await count('#gdBasis li')) >= 2 && /sin perfil de cartas/.test(await txt('#gdBasis')), await txt('#gdBasis'));
const cv6 = await ev(`Array.prototype.map.call(document.querySelectorAll('.gd-crow .gd-cval'), function(e){ return parseFloat(e.textContent.replace(',', '.')); })`);
check('cuota por color suma 100 también en GD06', cv6.length >= 3 && Math.abs(cv6.reduce((s, x) => s + x, 0) - 100) < 0.3, cv6);

console.log('\n== Torneos con podio y días ==');
await abrir(390, 844, '#competicion/torneos?s=GD06');
check('cada torneo con puestos conocidos muestra su podio (máx. 3 líneas) con arquetipos, sin jugadores', (await count('.gd-podium')) >= 3 && (await ev(`Array.prototype.every.call(document.querySelectorAll('.gd-podium'), function(p){ return p.querySelectorAll('.gd-pod').length <= 3; })`)) === true, await count('.gd-podium'));
check('los torneos van agrupados por día con su encabezado', (await count('.gd-day')) >= 1 && /\d{4}/.test((await txt('.gd-day')) || ''), await txt('.gd-day'));
check('el podio es un solo bloque accesible con sus mejores puestos conocidos', /Mejores puestos conocidos: \d/.test((await ev(`${q('.gd-podium')}.getAttribute('aria-label')`)) || ''), await ev(`${q('.gd-podium')}.getAttribute('aria-label')`));
await abrir(390, 844, '#competicion/torneos?s=GD05');
check('en GD05 (muestra Side-6) también hay días y podios donde hay puestos', (await count('.gd-day')) >= 1 && (await count('.gd-podium')) >= 1);
await abrir(390, 844, '#competicion/torneos?s=GD06');
const esc = await txt('.gd-scope'), evt = await txt('.gd-event');
check('Torneos dice «torneos registrados» y «puestos conocidos» y avisa de que no es el calendario completo', /\d+ torneos registrados/.test(esc) && /puestos? conocidos?/.test(evt) && /No es el calendario completo/.test(await ev(`document.getElementById('compPanel').textContent`)), [esc, evt]);
check('solo se muestran los puestos que se conocen: nunca más líneas que puestos conocidos, y cada una con su puesto', (await ev(`Array.prototype.every.call(document.querySelectorAll('.gd-event'), function(e){ var m = e.textContent.match(/(\\d+) puestos? conocidos?/); var n = m ? +m[1] : 0; return e.querySelectorAll('.gd-pod').length <= Math.min(3, n) && Array.prototype.every.call(e.querySelectorAll('.gd-pod b'), function(b){ return /^\\d+\\.º$/.test(b.textContent); }); })`)) === true);

console.log('\n== Explorar conserva las listas históricas (importaciones anteriores) ==');
await abrir(390, 844, '#competicion/mazos');
const nTags = await count('.cx-histtag'), nCards = await count('.cx-card');
check('Explorar muestra las listas actuales Y las históricas, estas con la etiqueta «Clasificación anterior»', nTags === HIST.archetypes.length && nCards > DL.archetypes.length + nTags - 1, [nTags, HIST.archetypes.length, nCards]);
check('los arquetipos actuales salen antes que los históricos y sin etiqueta', (await ev(`(function(){ var c = document.querySelectorAll('.cx-card'); var firstHist = Array.prototype.findIndex.call(c, function(x){ return !!x.querySelector('.cx-histtag'); }); return firstHist > 0 && !c[0].querySelector('.cx-histtag'); })()`)) === true);
await ev(`document.querySelector('.cx-histtag').closest('.cx-card').click(); 1`); await sleep(1100);
check('la ficha de un arquetipo histórico explica de dónde viene y conserva sus listas', /importación anterior de Side-6/.test(await txt('.cx-note')) && (await count('.cx-list')) >= 1, await txt('.cx-note'));
await click('.cx-list', 1200);
check('la lista histórica dice su procedencia («clasificación anterior» y fecha de importación) y se puede copiar', /clasificación anterior \(importada el \d+ \w+ 2026\)/.test(await ev(`document.getElementById('compPanel').textContent`)) && (await count('#cxCopy, .cx-cta, button')) > 0, await ev(`document.getElementById('compPanel').textContent.slice(0, 260)`));
check('Explorar no mezcla un arquetipo histórico con uno actual: ningún nombre histórico coincide con uno actual', HIST.archetypes.every((a) => !ML.archetypes.some((m) => m.name.toLowerCase() === a.name.toLowerCase())));

console.log('\n== inglés, ancho y sin errores ==');
await abrir(390, 844, '#competicion?s=GD05', 'en');
check('textos en inglés', /Most used cards/.test((await txt('#gdTopCards')) || '') && /Representation by color/.test((await txt('#gdColors')) || '') && /recorded placements/.test(await txt('.gd-stats-inline')) && (await txt('#gdToExplore')) === 'Explore decks', await txt('#gdToExplore'));
for (const [W, H] of [[320, 640], [360, 740], [430, 932], [1440, 900]]) {
  await abrir(W, H, '#competicion?s=GD06');
  const a = await noH(); await ev(`document.getElementById('compPage').scrollTop = 2400; 1`); await sleep(300);
  check('sin desbordamiento horizontal en Meta a ' + W + ' px', a && (await noH()));
}
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
