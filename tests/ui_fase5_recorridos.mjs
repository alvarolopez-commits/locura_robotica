// Fase 5 · recorridos J2 (construcción) y J6 (recuperación: recarga, atrás del navegador y fallo de datos). Datos de prueba; los mazos reales no se tocan.
// Registra los toques que hace falta dar. Límites: 30 s por orden y 4 min en total.  Uso: node tests/ui_fase5_recorridos.mjs
import { elegirMazoJS } from './_elegir_mazo.mjs';
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (4 min) en: ' + paso); process.exit(3); }, 240000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0, toques = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const real = JSON.parse(fs.readFileSync(new URL('./fixtures/comp_lote_inicial.json', import.meta.url), 'utf8'));
let hookId = null;
async function abrir(W, H, hash, { store = {}, fallo = false } = {}) {
  paso = 'abrir ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId });
  const body = JSON.stringify(real);
  hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ var of = window.fetch; window.__fallo = ${fallo}; window.fetch = function(u){ if (String(u).indexOf('competition_events.json') >= 0) { if (window.__fallo) return Promise.resolve(new Response('', {status:503})); return Promise.resolve(new Response(${JSON.stringify(body)}, {status:200, headers:{'content-type':'application/json'}})); } return of.apply(this, arguments); }; })();` })).result.identifier;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3500);
  if (store.msa_active_deck) { await ev(elegirMazoJS(store.msa_active_deck, { building: store.msa_building === '1' })); await sleep(300); }
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const toque = async (sel, w = 450) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); if (r) toques++; await sleep(w); return r; };
const setSel = async (i, v) => { await ev(`(function(){ var s=document.getElementById(${JSON.stringify(i)}); s.value=${JSON.stringify(String(v))}; s.dispatchEvent(new Event('change', {bubbles:true})) })()`); toques++; await sleep(350); };
const mazo = () => ev(`(function(){ var d=JSON.parse(localStorage.getItem('msa_decks')||'{}'); var k=Object.keys(d)[0]; return k ? { n:Object.values(d[k].cards).reduce(function(a,b){return a+b},0), cards:d[k].cards, ids:Object.keys(d) } : null })()`);

console.log('\n== J2 · Catálogo → carta → mazo → contador 50/50 → persistencia ==');
await abrir(390, 844, '', {});
toques = 0;
const primera = await ev(`document.querySelector('#grid .adder').dataset.number`);
check('al abrir no hay mazo: sin contador superior y con el "+" deshabilitado', (await ev(`document.getElementById('deckCount').hidden`)) === true && (await ev(`document.querySelector('#grid .adder .ad-plus').disabled`)) === true);
await toque('#btnAddDeck', 500);
await ev(`(function(){ var i=document.getElementById('newDeckName'); i.value='Mi primer mazo'; document.getElementById('addDeckForm').requestSubmit(); return 1 })()`); toques++; await sleep(900);
check('al crear el primer mazo, el contador marca 0 / 50', /0\s*\/\s*50/.test(await txt('#deckPillCount')) && (await ev(`document.getElementById('deckCount').hidden`)) === false);
for (let i = 0; i < 3; i++) await toque('#grid .adder .ad-plus', 300);
check('3 toques en "+" de la primera carta: 3 copias y 3 / 50', (await txt('#grid .adder .ad-n')) === '3' && /3\s*\/\s*50/.test(await txt('#deckPillCount')));
let m = await mazo();
check('el mazo creado por la persona guarda esas 3 copias con el código correcto', m && m.n === 3 && m.cards[primera] === 3 && m.ids.length === 1, m);
await toque('#grid .adder .ad-minus', 300);
check('quitar una: 2 copias y 2 / 50', (await txt('#grid .adder .ad-n')) === '2' && /2\s*\/\s*50/.test(await txt('#deckPillCount')));
for (let i = 0; i < 3; i++) await toque('#grid .adder .ad-plus', 250);
check('el límite de 4 copias por carta se respeta: el "+" se desactiva en la cuarta', (await txt('#grid .adder .ad-n')) === '4' && (await ev(`document.querySelector('#grid .adder .ad-plus').disabled`)) === true);
await ev(`location.reload()`); await sleep(3500);
m = await mazo();
check('tras recargar las 4 copias siguen guardadas, pero no hay mazo seleccionado (contador oculto y "+" deshabilitado)', m && m.cards[primera] === 4 && (await ev(`document.getElementById('deckCount').hidden`)) === true && (await txt('#grid .adder .ad-n')) === '0', m);
await ev(elegirMazoJS(Object.keys(JSON.parse(await ev(`localStorage.getItem('msa_decks')`)))[0], { building: true })); await sleep(300);
check('al elegirlo de nuevo vuelven las 4 copias y el contador 4 / 50', /4\s*\/\s*50/.test(await txt('#deckPillCount')) && (await txt('#grid .adder .ad-n')) === '4');
console.log('  (J2: ' + toques + ' toques desde el catálogo hasta tener la carta en el mazo guardado: 1 por copia; el guardado es automático, sin botón)');

console.log('\n== J6 · recuperación: recarga, atrás y fallo de datos ==');
await abrir(390, 844, '#competicion');
await toque('#gdMoreBtn'); await setSel('gdTop', 8);
await toque('.gd-rows .gd-arow', 500);
const hash1 = await ev(`location.hash`);
await ev(`location.reload()`); await sleep(3800);
check('recargar en mitad de una ficha vuelve a la misma ficha con sus filtros (n = 40)', (await ev(`location.hash`)) === hash1 && /Mobile Fighter/.test(await txt('.gd-title')) && /de 40 listas publicadas/.test(await txt('.gd-metric-n')), [await ev(`location.hash`), await txt('.gd-metric-n')]);
await ev(`history.back()`); await sleep(700);
check('"atrás" del navegador desde la ficha vuelve a Meta con el filtro Top 8 (n = 40)', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 40$/.test(await txt('.gd-share-title')) && /Top 8/.test(await txt('.gd-chips')), await txt('.gd-share-title'));
await ev(`history.forward()`); await sleep(700);
check('"adelante" reabre la ficha', /Mobile Fighter/.test(await txt('.gd-title')));
await ev(`history.back()`); await sleep(500);
await toque('#compTab-torneos'); await toque('.gd-event', 500);
await ev(`history.back()`); await sleep(600);
check('de la ficha de un torneo, "atrás" vuelve a Torneos', (await ev(`document.getElementById('compTab-torneos').getAttribute('aria-selected')`)) === 'true' && (await count('.gd-event')) === 5);
const MAZOS = JSON.stringify({ d1: { name: 'Mazo de prueba', cards: { 'ST01-001': 4, 'ST01-002': 3 } } });
await abrir(390, 844, '#competicion', { fallo: true, store: { msa_decks: MAZOS } });
check('si los datos fallan (503): mensaje claro con "Reintentar", sin pantalla en blanco y la otra temporada sigue usable', /No se pudieron cargar los torneos/.test(await txt('.gd-error')) && (await count('.gd-retry')) === 1 && /^GD05/.test(await txt('.gd-scope')), await txt('.gd-error'));
await ev(`window.__fallo = false; 1`);
await toque('.gd-retry', 1800);
check('al volver los datos, "Reintentar" recupera GD06 sin recargar ni duplicar nada', (await count('#gdSeason-GD06')) === 1 && (await count('.gd-retry')) === 0, await txt('.gd-scope'));
// la app añade una vez `updatedAt` a los mazos antiguos que no lo tenían (observación F5-05); lo que no puede cambiar es el nombre, las cartas ni los identificadores
const despues = JSON.parse(await ev(`localStorage.getItem('msa_decks')`)), antes = JSON.parse(MAZOS);
check('el fallo de datos y la recuperación no tocaron los mazos guardados (mismos ids, nombre y cartas)', JSON.stringify(Object.keys(despues)) === JSON.stringify(Object.keys(antes)) && despues.d1.name === antes.d1.name && JSON.stringify(despues.d1.cards) === JSON.stringify(antes.d1.cards), despues);
check('sin errores de consola', errs.length === 0, errs);

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
