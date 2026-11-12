// J3 · ficha de torneo con lista completa → comparar con MI mazo → diferencias exactas y colección → crear variante editable → volver sin alterar el original.
// Datos reales de la lista (data/competition_events.json, WinDecks); mazos y colección de prueba. Límites: 30 s por orden y 5 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_comp_j3.mjs
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
let passed = 0, failed = 0, toques = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const data = JSON.parse(fs.readFileSync('data/competition_events.json', 'utf8'));
const lista = data.results.find((r) => /^windecks:/.test(r.id)), evento = data.events.find((e) => e.id === lista.eventId), target = lista.cards;
const pendiente = data.results.find((r) => !r.cards);
// mi mazo = la lista sin 1 copia de GD03-110 y con una copia de más de GD01-128 (50 cartas): añadir 1, retirar 1
const own = Object.assign({}, target); delete own['GD03-110']; own['GD01-128'] = 3;
// colección de prueba: GD05-111 solo 3 (la lista pide 4), GD04-110 ninguna (pide 2), el resto completo
const COL = {}; Object.entries(target).forEach(([k, v]) => { if (k !== 'GD04-110') COL[k] = { q: k === 'GD05-111' ? 3 : v, t: 1 }; });
const MAZOS = { d1: { name: 'Mi mazo de prueba', cards: own, updatedAt: 1700000000000 }, d2: { name: 'Otro mazo', cards: { 'ST01-001': 4 }, updatedAt: 1700000000001 } };
const MAZOS_JSON = JSON.stringify(MAZOS);
async function abrir(W, H, hash, store) {
  paso = 'abrir ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${Object.entries(store || {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3500);
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const toque = async (sel, w = 450) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); if (r) toques++; await sleep(w); return r; };
const setSel = async (i, v) => { await ev(`(function(){ var s=document.getElementById(${JSON.stringify(i)}); s.value=${JSON.stringify(String(v))}; s.dispatchEvent(new Event('change', {bubbles:true})) })()`); toques++; await sleep(400); };
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('compPage').scrollWidth <= document.getElementById('compPage').clientWidth + 1`);
const decks = () => ev(`JSON.parse(localStorage.getItem('msa_decks') || '{}')`);
const filas = () => ev(`Array.from(document.querySelectorAll('.gd-cmprow')).map(function(b){ return { n:b.dataset.number, d:b.querySelector('.gd-cmprow-d').textContent, q:b.querySelector('.gd-cmprow-q').textContent, c:b.querySelector('.gd-cmprow-c').textContent } })`);
const sum = () => ev(`Array.from(document.querySelectorAll('.gd-cmp-k')).map(function(k){ return k.querySelector('b').textContent+' '+k.querySelector('span').textContent })`);

console.log('\n== datos de partida ==');
check('la lista es completa, legal según el motor y distinta del mazo propio', Object.values(target).reduce((a, b) => a + b, 0) === 50 && Object.values(own).reduce((a, b) => a + b, 0) === 50 && JSON.stringify(target) !== JSON.stringify(own));

console.log('\n== J3 · ficha de torneo → comparar ==');
await abrir(390, 844, '#competicion/torneos', { msa_decks: MAZOS_JSON, msa_active_deck: 'd1', msa_collection: JSON.stringify(COL) });
toques = 0;
await ev(`Array.from(document.querySelectorAll('.gd-event')).filter(function(x){ return /コーギーアール/.test(x.textContent) })[0].click()`); toques++; await sleep(500);
check('la ficha del torneo ofrece "Comparar mi mazo" en la lista completa', (await count('.gd-res .gd-cmp')) === 1);
await toque('.gd-res .gd-cmp', 600);
check('abre la comparación DE ESA LISTA (identidad estable en la URL, sin nombre de arquetipo)', (await ev(`location.hash`)).indexOf('#competicion/comparar/' + encodeURIComponent(lista.id)) === 0, await ev(`location.hash`));
check('la lista queda seleccionada y se pide elegir uno de mis mazos (no se compara por defecto con uno al azar)', (await ev(`document.getElementById('gdCmpList').value`)) === lista.id && (await ev(`document.getElementById('gdCmpDeck').value`)) === '' && /Elige una lista y uno de tus mazos/.test(await txt('.gd-empty')));
check('se enseña la fuente de la lista, con enlace al original', (await ev(`document.querySelector('.gd-sources a') && document.querySelector('.gd-sources a').href`)) === lista.decklistUrl);
await setSel('gdCmpDeck', 'd1');
const s1 = await sum();
check('resumen exacto: 49 coinciden (50 − la 1 que falta) · 1 por añadir · 1 por retirar · 3 faltan en la colección', JSON.stringify(s1) === JSON.stringify(['49 Coinciden', '1 Por añadir', '1 Por retirar', '3 Faltan en tu colección']), s1);
check('con mazos de 50 cartas lo que se añade es lo que se retira, y lo explica', /las copias que se añaden son las mismas que se retiran/.test(await txt('.gd-cmp-sum + .comp-note')));
let f = await filas();
check('"Cambios": solo 2 filas, con cantidad y código exactos', f.length === 2 && f.some((x) => x.n === 'GD03-110' && x.d === '+1' && /×0 → lista ×1/.test(x.q)) && f.some((x) => x.n === 'GD01-128' && x.d === '−1' && /×3 → lista ×2/.test(x.q)), f);
check('la colección es un cálculo aparte: GD03-110 hay que añadirla al mazo y YA la tengo (no falta)', f.find((x) => x.n === 'GD03-110').c === 'Colección: tienes 1, no falta ninguna', f);
await toque('#gdCmpF-all', 400); f = await filas();
check('"Todo": las 16 cartas de la lista', f.length === 16, f.length);
const gd5 = f.find((x) => x.n === 'GD05-111'), gd4 = f.find((x) => x.n === 'GD04-110');
check('GD05-111: no cambia en el mazo (=) pero me faltan 1 en la colección (tengo 3 de 4)', gd5.d === '=' && gd5.c === 'Colección: tienes 3 · faltan 1', gd5);
check('GD04-110: no está en mi colección: faltan 2', gd4.c === 'Colección: tienes 0 · faltan 2', gd4);
await toque('#gdCmpF-match', 400); check('"Coinciden": 15 códigos', (await count('.gd-cmprow')) === 15);
await toque('#gdCmpF-changes', 300);
await toque('.gd-cmprow[data-number="GD03-110"]', 800);
check('tocar una carta abre su ficha', (await ev(`document.getElementById('overlay').hidden`)) === false);
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(600);
check('la comparación no cambia ningún mazo ni la colección', JSON.stringify((await decks()).d1.cards) === JSON.stringify(own) && (await ev(`localStorage.getItem('msa_collection')`)) === JSON.stringify(COL));
check('accesible: sin desbordamiento horizontal a 390 px y cada fila con nombre accesible', (await noHScroll()) && (await ev(`Array.from(document.querySelectorAll('.gd-cmprow')).every(function(b){ return b.textContent.trim().length > 4 })`)) === true);

console.log('\n== crear variante: copia editable de mi mazo ==');
const antes = JSON.stringify(await decks());
await toque('#gdVarCopy', 700);
let d = await decks(), ids = Object.keys(d), nuevo = ids.find((k) => k !== 'd1' && k !== 'd2');
check('se crea un mazo NUEVO con id distinto y nombre claro, y se avisa', ids.length === 3 && nuevo && /^Variante de Mi mazo de prueba/.test(d[nuevo].name) && /Variante creada: «Variante de Mi mazo de prueba»\. Tu mazo original no ha cambiado/.test(await txt('.gd-var-done')), [ids, await txt('.gd-var-done')]);
check('la copia lleva exactamente mis cartas y es independiente (cambiarla no toca el original)', JSON.stringify(d[nuevo].cards) === JSON.stringify(own) && d[nuevo].cards !== d.d1.cards);
check('el ORIGINAL queda idéntico (cartas, nombre y fecha de modificación)', JSON.stringify(d.d1) === JSON.stringify(JSON.parse(antes).d1) && JSON.stringify(d.d2) === JSON.stringify(JSON.parse(antes).d2), d.d1);
const antesDoble = Object.keys(await decks()).length;
await toque('#gdVarCopy', 300);   // un segundo toque es una orden nueva y expresa: otra variante (nunca una sola con efectos dobles)
check('cada toque crea exactamente una variante', Object.keys(await decks()).length === antesDoble + 1);

console.log('\n== crear variante con la lista aplicada (pide confirmar) ==');
const nAntes = Object.keys(await decks()).length;
await toque('#gdVarApply', 400);
check('no crea nada hasta confirmar: muestra qué va a pasar', /Se creará un mazo nuevo con las 50 cartas de la lista\. «Mi mazo de prueba» no se modifica/.test(await txt('.gd-var-confirm')) && Object.keys(await decks()).length === nAntes);
await toque('#gdVarNo', 400);
check('cancelar no crea nada', Object.keys(await decks()).length === nAntes && (await count('.gd-var-confirm')) === 0);
await toque('#gdVarApply', 300); await toque('#gdVarYes', 700);
d = await decks(); ids = Object.keys(d);
const aplicada = ids.find((k) => d[k].cards && JSON.stringify(d[k].cards) === JSON.stringify(target));
check('confirmado: mazo nuevo con las 50 cartas de la lista, distinto del original', ids.length === nAntes + 1 && aplicada && aplicada !== 'd1' && JSON.stringify(d.d1.cards) === JSON.stringify(own), ids);
check('el original sigue idéntico tras todo', JSON.stringify(d.d1) === JSON.stringify(JSON.parse(antes).d1));
await ev(`location.reload()`); await sleep(3800);
d = await decks();
check('tras recargar, las variantes persisten y el original sigue idéntico', Object.keys(d).length === nAntes + 1 && JSON.stringify(d.d1) === JSON.stringify(JSON.parse(antes).d1) && Object.keys(d).every((k) => d[k].cards));
console.log('  (J3: ' + toques + ' acciones desde la ficha del torneo hasta la variante guardada)');

console.log('\n== fallo de guardado: no se declara creada ni se toca el original ==');
await abrir(390, 844, '#competicion/comparar/' + encodeURIComponent(lista.id), { msa_decks: MAZOS_JSON, msa_active_deck: 'd1', msa_collection: JSON.stringify(COL) });
await setSel('gdCmpDeck', 'd1');
await ev(`window.__setItem = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if(k === 'msa_decks') throw new Error('QuotaExceededError'); return window.__setItem.apply(this, arguments); }; 1`);
await toque('#gdVarCopy', 700);
check('avisa del fallo con un mensaje claro y no dice "creada"', /No se pudo guardar la variante en este dispositivo\. No se ha creado nada y tu mazo no ha cambiado/.test(await txt('.gd-error')) && (await count('.gd-var-done')) === 0, await txt('.gd-variant'));
await ev(`Storage.prototype.setItem = window.__setItem; 1`);
check('el almacenamiento sigue con solo los 2 mazos originales, idénticos', JSON.stringify(Object.keys(await decks())) === JSON.stringify(['d1', 'd2']) && JSON.stringify((await decks()).d1.cards) === JSON.stringify(own));
await ev(`location.reload()`); await sleep(3500);
check('y tras recargar no aparece ninguna variante fantasma', Object.keys(await decks()).length === 2);

console.log('\n== colección sin configurar, listas no válidas y entrada sin lista ==');
await abrir(390, 844, '#competicion/comparar/' + encodeURIComponent(lista.id), { msa_decks: MAZOS_JSON, msa_active_deck: 'd1' });
await setSel('gdCmpDeck', 'd1');
check('colección SIN configurar: no se inventan cifras (—) y se ofrece configurarla', (await sum())[3] === '— Colección sin configurar' && /no se puede calcular qué te falta/.test(await txt('.gd-cmp-nocoll')) && (await count('#gdCmpColl')) === 1);
check('las filas dicen "Colección sin configurar", no "faltan"', (await ev(`Array.from(document.querySelectorAll('.gd-cmprow-c')).every(function(x){ return /sin configurar/.test(x.textContent) })`)) === true);
await abrir(390, 844, '#competicion/comparar/' + encodeURIComponent(pendiente.id), { msa_decks: MAZOS_JSON, msa_active_deck: 'd1' });
check('una lista SIN composición no se puede comparar: explica el motivo y no ofrece comparar ni variante', /no tiene las 50 cartas verificadas/.test(await txt('.gd-cmp-invalid')) && (await count('#gdVarCopy, #gdVarApply, .gd-cmprow')) === 0, await txt('#compPanel'));
await abrir(390, 844, '#competicion/comparar', { msa_decks: MAZOS_JSON, msa_active_deck: 'd1' });
check('entrando sin lista (p. ej. desde Mis mazos) se pide elegirla de forma explícita', /Elige una lista y uno de tus mazos/.test(await txt('.gd-empty')) && (await count('#gdCmpList')) === 1);
await setSel('gdCmpList', lista.id); await setSel('gdCmpDeck', 'd1');
check('al elegir lista y mazo compara, y la URL pasa a identificar la lista', (await count('.gd-cmprow')) === 2 && (await ev(`location.hash`)).indexOf(encodeURIComponent(lista.id)) > 0);
await abrir(390, 844, '#competicion/comparar/' + encodeURIComponent(lista.id), {});
const unico = await ev(`Array.from(document.querySelectorAll('#gdCmpDeck option')).map(function(o){ return o.value }).filter(Boolean)`);
check('sin mazos propios no se inventa ninguno: el selector no ofrece mazos y se avisa de que aún no hay ninguno', unico.length === 0 && /Aún no tienes mazos/.test(await txt('#compPanel')), [unico, await txt('#compPanel')]);

console.log('\n== atrás, anchos y consola ==');
await abrir(390, 844, '#competicion/torneos', { msa_decks: MAZOS_JSON, msa_active_deck: 'd1', msa_collection: JSON.stringify(COL) });
await ev(`Array.from(document.querySelectorAll('.gd-event')).filter(function(x){ return /コーギーアール/.test(x.textContent) })[0].click()`); await sleep(500);
await toque('.gd-res .gd-cmp', 500); await setSel('gdCmpDeck', 'd1');
await ev(`history.back()`); await sleep(700);
check('"atrás" desde la comparación vuelve a la ficha del torneo', /コーギーアール/.test(await txt('.gd-title')) && (await count('.gd-res')) === 1);
await ev(`history.back()`); await sleep(700);
check('y otra vez a Torneos', (await count('.gd-event')) === 6);
for (const [W, H] of [[360, 760], [430, 900], [1440, 900]]) {
  await abrir(W, H, '#competicion/comparar/' + encodeURIComponent(lista.id), { msa_decks: MAZOS_JSON, msa_active_deck: 'd1', msa_collection: JSON.stringify(COL) });
  await setSel('gdCmpDeck', 'd1');
  check(W + ': sin desbordamiento horizontal y filas legibles', (await noHScroll()) && (await count('.gd-cmprow')) === 2);
  const peq = await ev(`Array.from(document.querySelectorAll('#compPanel button, #compPanel select')).filter(function(e){ return e.offsetParent && !e.disabled }).map(function(e){ var r=e.getBoundingClientRect(); return { h:Math.round(r.height), t:(e.id||e.className).slice(0,24) } }).filter(function(x){ return x.h < 44 })`);
  check(W + ': botones y selectores de al menos 44 px de alto', peq.length === 0, peq);
}
check('sin errores de consola', errs.length === 0, errs);

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
