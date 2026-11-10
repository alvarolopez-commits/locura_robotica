// Prueba de interfaz sobre los DATOS REALES (data/competition_events.json): la primera lista GD06 completa (WinDecks, 1.er puesto del 3 nov 2026).
// Las colecciones y mazos de esta prueba son de prueba. Límites: 30 s por orden y 5 min en total.  Uso: node tests/ui_comp_windecks.mjs
import fs from 'node:fs';
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
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const data = JSON.parse(fs.readFileSync('data/competition_events.json', 'utf8'));
const lista = data.results.find((r) => /^windecks:/.test(r.id)), evento = data.events.find((e) => e.id === lista.eventId);
const cards = lista.cards;
const COLECCION = {}; Object.entries(cards).forEach(([k, v], i) => { COLECCION[k] = { q: i === 0 ? v - 1 : v, t: 1 }; });   // de prueba: a una copia de completarla
const MIO = { d1: { name: 'Mi mazo de prueba', cards: Object.assign({}, cards, { 'GD05-111': 3, 'GD01-128': 3 }) } };
async function abrir(W, H, hash, store) {
  paso = 'abrir ' + W + ' ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${Object.entries(store || {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3500);
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const click = async (sel, w = 450) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); await sleep(w); return r; };
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('compPage').scrollWidth <= document.getElementById('compPage').clientWidth + 1`);

console.log('\n== datos incorporados ==');
check('el archivo tiene 6 torneos y 57 listas: las 56 de antes más esta', data.events.length === 6 && data.results.length === 57);
check('la lista tiene 50 cartas, 16 códigos, origen torneo y la URL original', Object.values(cards).reduce((a, b) => a + b, 0) === 50 && Object.keys(cards).length === 16 && lista.origin === 'tournament' && lista.decklistUrl === 'https://gcg-win-decks.jp/season/GD06/event/01M6G9R42V9CAP5B5H33SFXZ8T/deck/01M6G9R42TD8FAWCRGWM8Z3RRN');
check('los metadatos confirmados: 3 nov 2026, 16 participantes, Japón, Standard, GD06, 1.º', evento.date === '2026-11-03' && evento.playersTotal === 16 && evento.country === 'Japan' && evento.format === 'Standard' && evento.set === 'GD06' && lista.placement === 1);
check('la información que no se ha confirmado queda vacía, no inventada: nº de listas publicadas del torneo', evento.listsPublished === null);
check('sin nombres de jugador', !/"player"|slug|profile/i.test(JSON.stringify(data).replace(/playersTotal/g, '')));

console.log('\n== pantallas ==');
for (const [W, H] of [[390, 844], [1440, 900]]) {
  await abrir(W, H, '#competicion', { msa_collection: JSON.stringify(COLECCION), msa_decks: JSON.stringify(MIO), msa_active_deck: 'd1' });
  check(W + ': presencia sobre la muestra homogénea Top 8/16, n = 56, con el rótulo exacto', (await txt('.gd-share-title')) === 'Presencia entre listas publicadas Top 8/16 · n = 56' && /5 torneos · 56 listas publicadas/.test(await txt('.gd-scope')), [await txt('.gd-share-title'), await txt('.gd-scope')]);
  check(W + ': avisa de que el torneo con un solo mazo no entra en el porcentaje y ofrece incluirlo de forma expresa', /1 torneo con un solo mazo publicado no entra en este porcentaje/.test(await txt('.gd-outside')) && (await count('#gdIncl')) === 1, await txt('.gd-outside'));
  check(W + ': Mobile Fighter 16 de 56 = 28,6 %', (await txt('.gd-rows .gd-arow .cr-val')) === '28,6 %' && (await txt('.gd-rows .gd-arow .cr-meta')) === '16 de 56 listas', await txt('.gd-rows .gd-arow .cr-val'));
  await click('#gdIncl', 500);
  check(W + ': si se elige incluirlo, el rótulo lo dice sin ambigüedad: TODAS las listas (mezcla cortes), n = 57, y Mobile Fighter 16 de 57 (28,1 %)', (await txt('.gd-share-title')) === 'Presencia entre TODAS las listas publicadas (mezcla cortes distintos) · n = 57' && (await txt('.gd-rows .gd-arow .cr-val')) === '28,1 %' && /cov=all/.test(await ev(`location.hash`)) && /Todas las listas \(mezcla cortes\)/.test(await txt('.gd-chips')), await txt('.gd-share-title'));
  await click('#gdClear', 500);
  check(W + ': "Limpiar" vuelve a la muestra homogénea (n = 56)', (await txt('.gd-share-title')) === 'Presencia entre listas publicadas Top 8/16 · n = 56');
  check(W + ': la lista aparece en "Mazos competitivos que puedes construir" con cobertura de la colección de prueba', /49\/50 copias · faltan 1 · 98,0 % de cobertura/.test(await txt('.gd-build .gd-cov')) && /Torneo/.test(await txt('.gd-build .dl-meta')) && /Legal, faltan copias/.test(await txt('.gd-build')), await txt('.gd-build'));
  check(W + ': ese bloque dice sobre cuántas listas calcula (1)', /Sobre 1 lista con las 50 cartas verificadas/.test(await txt('.gd-buildsec')));
  await click('#compTab-torneos');
  const sedes = await ev(`Array.from(document.querySelectorAll('.gd-event .dl-etitle')).map(function(x){ return x.textContent })`);
  check(W + ': Torneos: 6, y el nuevo con su sede, sin mezclarse con el otro del 3 de nov.', sedes.length === 6 && sedes.indexOf('コーギーアール本店') >= 0 && sedes.indexOf('カードラボ所沢店') >= 0, sedes);
  await ev(`Array.from(document.querySelectorAll('.gd-event')).filter(function(x){ return /コーギーアール/.test(x.textContent) })[0].click()`); await sleep(500);
  check(W + ': ficha del torneo: fuente WinDecks con enlace, 16 participantes como contexto y 1 lista', (await txt('.gd-facts')).indexOf('16 participantes') >= 0 && /1 lista/.test(await txt('.gd-facts')) && (await ev(`document.querySelector('.gd-sources a').href`)) === lista.decklistUrl, await txt('.gd-facts'));
  check(W + ': la lista se distingue como completa, con 49/50 de la colección y "Comparar mi mazo"', /50 cartas verificadas/.test(await txt('.gd-res')) && /49\/50/.test(await txt('.gd-res-cov')) && (await count('.gd-res .gd-cmp')) === 1);
  check(W + ': sin nombre de jugador en la ficha', !/Persona|player/i.test(await txt('#compPanel')));
  await click('.gd-res .gd-open', 500);
  const filas = await ev(`Array.from(document.querySelectorAll('.gd-deck .dl-card')).map(function(b){ return [b.querySelector('small').textContent, Number(b.querySelector('.dl-qty').textContent.replace('×',''))] })`);
  check(W + ': se ven las 16 cartas con sus cantidades exactas (suman 50) y se puede copiar a Mis mazos', filas.length === 16 && filas.reduce((a, f) => a + f[1], 0) === 50 && filas.every(([c, q]) => cards[c] === q) && /Copiar mazo/.test(await txt('.gd-res .dl-actions')), filas);
  check(W + ': el enlace de la lista va a su página original', (await ev(`document.querySelector('.gd-res a.comp-link').href`)) === lista.decklistUrl);
  await click('.gd-res .gd-cmp', 900);
  check(W + ': "Comparar mi mazo" abre la comparación de ESTA lista, con su identidad en la URL', (await ev(`location.hash`)).indexOf('#competicion/comparar/' + encodeURIComponent(lista.id)) === 0 && (await ev(`document.getElementById('gdCmpList').value`)) === lista.id, await ev(`location.hash`));
  check(W + ': el mazo propio no cambia', (await ev(`JSON.stringify(JSON.parse(localStorage.getItem('msa_decks')).d1.cards)`)) === JSON.stringify(MIO.d1.cards));
  await click('#gdBack', 450);
  check(W + ': sin desbordamiento horizontal', await noHScroll());
}
await abrir(390, 844, '#competicion/arquetipo/' + encodeURIComponent('Kshatriya + Strike Freedom Gundam'), {});
check('ficha del arquetipo de WinDecks: no cuenta en el porcentaje (fuera de la muestra principal, n = 56) pero su lista se consulta', /fuera de la muestra principal \(n = 56\)/.test(await txt('.gd-outside-arch')) && (await count('.gd-res')) === 1 && (await count('.gd-metric .comp-big')) === 0, await txt('.gd-metric'));
check('y, aparte, cartas populares: 1 lista completa, por debajo del mínimo de 10, sin porcentajes', /\(1 con las 50 cartas verificadas\)/.test(await txt('.gd-pending')) && (await count('.gd-cards .ml-row')) === 0);
check('sin errores de consola', errs.length === 0, errs);

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
