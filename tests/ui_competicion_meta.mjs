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
const DL = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')), ML = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
const colorsOfName = {}; DL.archetypes.forEach((a) => { colorsOfName[a.name] = a.colors || []; });
const LETTER = { B: 'Blue', G: 'Green', R: 'Red', P: 'Purple', W: 'White' };
const conteo = (era) => { const o = {}; ML.archetypes.forEach((a) => { if (a.eraDecks[era]) o[a.name] = a.eraDecks[era]; }); return o; };
const colorRefOf = (era) => S.colorShare(Object.entries(conteo(era)).map(([name, n]) => ({ colors: colorsOfName[name] || (ML.archetypes.find((a) => a.name === name).colors || []).map((x) => LETTER[x]), weight: n })));
const topRefOf = (era) => S.estimateTopCards(ML.archetypes, conteo(era), 30, (n) => cat[n] && !cat[n].token);
const totalOf = (era) => Object.values(conteo(era)).reduce((s, x) => s + x, 0);
const colorRef = colorRefOf('GD05'), topRef = topRefOf('GD05').rows, nDecks = topRefOf('GD05').total;

console.log('\n== el menú abre Meta (390 px) ==');
await abrir(390, 844);
await ev(`document.getElementById('menuBtn').click(); 1`); await sleep(400); await click('#pmCompetition', 2800);
check('el menú Competición abre Meta con sus pestañas, no la portada de Explorar', (await count('#compTabs button')) === 2 && (await count('.cx-card')) === 0 && (await ev(`${q('#compTab-meta')}.getAttribute('aria-selected')`)) === 'true', [await count('#compTabs button'), await count('.cx-card')]);

console.log('\n== Meta GD05: resumen, color y cartas ==');
await abrir(390, 844, '#competicion?s=GD05');
check('el ranking sigue siendo lo primero que se ve', (await ev(`(function(){ var a=document.querySelector('.gd-arow').getBoundingClientRect(); return a.bottom <= innerHeight - 60 })()`)) === true);
check('resumen: tres cifras (listas, arquetipos, cuota del top 3) con valores', (await count('.gd-stat')) === 3 && /\d/.test((await txt('.gd-stat .v')) || '') && /%/.test(await ev(`document.querySelectorAll('.gd-stat .v')[2].textContent`)), await ev(`Array.prototype.map.call(document.querySelectorAll('.gd-stat'), function(e){ return e.textContent; })`));
const arq = Number(await ev(`document.querySelectorAll('.gd-stat .v')[1].textContent`));
check('el número de arquetipos coincide con los datos', arq === Object.keys(conteo('GD05')).length, [arq, Object.keys(conteo('GD05')).length]);
check('cuota por color: 5 filas en orden descendente y con la suma de 100 %', (await count('.gd-crow')) === 5, await count('.gd-crow'));
const cv = await ev(`Array.prototype.map.call(document.querySelectorAll('.gd-crow .gd-cval'), function(e){ return parseFloat(e.textContent.replace(',', '.')); })`);
check('los valores suman 100 (±0,3 por redondeo) y no crecen', Math.abs(cv.reduce((s, x) => s + x, 0) - 100) < 0.3 && cv.every((x, i) => i === 0 || x <= cv[i - 1] + 1e-9), cv);
check('cada fila de color es una imagen con texto accesible y el color tiene nombre', (await ev(`Array.prototype.every.call(document.querySelectorAll('.gd-crow'), function(e){ return e.getAttribute('role') === 'img' && /%/.test(e.getAttribute('aria-label')); })`)) === true);
const colRef = colorRef.map((x) => x.pct.toFixed(1));
check('el primer color y su porcentaje coinciden con el cálculo independiente', Math.abs(cv[0] - colorRef[0].pct) < 0.06, [cv[0], colorRef[0].pct]);
check('cartas más usadas: 10 filas con imagen, ranking y porcentaje', (await count('.gd-tcard')) === 10 && (await count('.gd-tcard img')) === 10 && /% de inclusión/.test((await txt('.gd-ttext small')) || ''), await count('.gd-tcard'));
const first = await ev(`${q('.gd-tcard')}.dataset.number`);
check('la carta número 1 es la más incluida según los datos (' + topRef[0].n + ')', first === topRef[0].n, [first, topRef[0]]);
const pct1 = parseFloat((await txt('.gd-ttext small')).match(/([\d,]+) % de inclusión/)[1].replace(',', '.'));
check('su porcentaje es la estimación (puestos × adopción del perfil) / total de puestos', Math.abs(pct1 - topRef[0].pct) < 0.06, [pct1, topRef[0].pct]);
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
check('«atrás» devuelve a Meta', (await count('#compTabs button')) === 2 && (await count('.gd-stat')) === 3, [await count('#compTabs button'), await count('.gd-stat')]);

console.log('\n== Meta GD06 (Side-6) ==');
await abrir(390, 844, '#competicion?s=GD06');
const n06 = Number(String(await ev(`document.querySelectorAll('.gd-stat .v')[0].textContent`)).replace(/\D/g, ''));
check('el resumen cuenta los puestos de la temporada (totales de Side-6)', n06 === totalOf('GD06'), [n06, totalOf('GD06')]);
const cv6 = await ev(`Array.prototype.map.call(document.querySelectorAll('.gd-crow .gd-cval'), function(e){ return parseFloat(e.textContent.replace(',', '.')); })`);
check('cuota por color suma 100 también en GD06', cv6.length >= 3 && Math.abs(cv6.reduce((s, x) => s + x, 0) - 100) < 0.3, cv6);

console.log('\n== Torneos con podio y días ==');
await abrir(390, 844, '#competicion/torneos?s=GD06');
check('cada torneo con puestos conocidos muestra su podio (máx. 3 líneas) con arquetipos, sin jugadores', (await count('.gd-podium')) >= 3 && (await ev(`Array.prototype.every.call(document.querySelectorAll('.gd-podium'), function(p){ return p.querySelectorAll('.gd-pod').length <= 3; })`)) === true, await count('.gd-podium'));
check('los torneos van agrupados por día con su encabezado', (await count('.gd-day')) >= 1 && /\d{4}/.test((await txt('.gd-day')) || ''), await txt('.gd-day'));
check('el podio es un solo bloque accesible con el texto completo', /Podio: 1\.º/.test((await ev(`${q('.gd-podium')}.getAttribute('aria-label')`)) || ''), await ev(`${q('.gd-podium')}.getAttribute('aria-label')`));
await abrir(390, 844, '#competicion/torneos?s=GD05');
check('en GD05 (muestra Side-6) también hay días y podios donde hay puestos', (await count('.gd-day')) >= 1 && (await count('.gd-podium')) >= 1);

console.log('\n== inglés, ancho y sin errores ==');
await abrir(390, 844, '#competicion?s=GD05', 'en');
check('textos en inglés', /Most played cards/.test((await txt('#gdTopCards')) || '') && /Share by color/.test((await txt('#gdColors')) || '') && (await txt('#gdToExplore')) === 'Explore decks', await txt('#gdToExplore'));
for (const [W, H] of [[320, 640], [360, 740], [430, 932], [1440, 900]]) {
  await abrir(W, H, '#competicion?s=GD05');
  const a = await noH(); await ev(`document.getElementById('compPage').scrollTop = 2400; 1`); await sleep(300);
  check('sin desbordamiento horizontal en Meta a ' + W + ' px', a && (await noH()));
}
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
