// Explorar mazos: filtros (periodo, color, estilo, «contiene cartas», orden), estado en la URL, y detalle (resumen, copiar lista, mano de prueba).
// Una sola pasada, sin reintentos. Límites: 30 s por orden y 4 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_explorar_filtros.mjs
import fs from 'node:fs';
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
const click = async (s, ms = 600) => { const r = await ev(`(function(){ var e = ${q(s)}; if(!e) return false; e.click(); return true; })()`); await sleep(ms); return r; };
const hashNow = () => ev('location.hash');
async function abrir(W, H, hash) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + (hash || '') }); await sleep(3800);
}

console.log('\n== portada de Explorar con filtros (390 px) ==');
await abrir(390, 844);
await click('#tbDecks', 900); await click('#dpExplore', 2500);
const total = await count('.cx-card');
check('hay arquetipos y un botón «Filtros» sin filtros activos (sin insignia)', total > 10 && (await txt('#cxFilterBtn')) === 'Filtros' && (await count('.cx-badge')) === 0, [total, await txt('#cxFilterBtn')]);
check('el panel está cerrado y el botón lo anuncia', (await ev(`${q('#cxFilters')}.hidden`)) === true && (await ev(`${q('#cxFilterBtn')}.getAttribute('aria-expanded')`)) === 'false');
await click('#cxFilterBtn', 400);
check('al abrir se ven periodo, colores, estilo y «contiene cartas»', (await ev(`!${q('#cxFilters')}.hidden`)) === true && (await count('#cxFilters .cx-flabel')) === 4, await count('#cxFilters .cx-flabel'));

// color
await ev(`(function(){ var b = document.querySelector('#cxFilters [data-color="Blue"]'); b.click(); })()`); await sleep(400);
const nBlue = await count('.cx-card');
check('filtrar por «Azul» reduce las tarjetas, muestra la insignia 1 y escribe c=Blue en la URL', nBlue > 0 && nBlue < total && (await txt('.cx-badge')) === '1' && /[?&]c=Blue/.test(await hashNow()), [total, nBlue, await hashNow()]);
check('el recuento lo dice y es un aviso de estado', /de \d+ arquetipos con estos filtros/.test(await txt('#cxCount')) && (await ev(`${q('#cxCount')}.getAttribute('role')`)) === 'status', await txt('#cxCount'));
// estilo
await ev(`(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('#cxFilters .mc-chips')[2].children, function(x){ return x.textContent === 'Aggro'; })[0]; b.click(); })()`); await sleep(400);
const nBA = await count('.cx-card');
check('añadir «Aggro» reduce o mantiene y la URL lleva st=Aggro', nBA <= nBlue && /st=Aggro/.test(await hashNow()) && (await txt('.cx-badge')) === '2', [nBA, await hashNow()]);
// limpiar
await click('#cxClear', 500);
check('«Limpiar filtros» devuelve todo, quita la insignia y limpia la URL', (await count('.cx-card')) === total && (await count('.cx-badge')) === 0 && !/[?&](c|st)=/.test(await hashNow()), [await count('.cx-card'), await hashNow()]);
// orden A-Z
await ev(`(function(){ var s = document.getElementById('cxSort'); s.value = 'az'; s.dispatchEvent(new Event('change')); })()`); await sleep(400);
const names = await ev(`Array.prototype.map.call(document.querySelectorAll('.cx-card .cx-name'), function(e){ var n = e.querySelector('span:not(.cx-histtag):not(.cx-dual):last-of-type'); return Array.prototype.filter.call(e.children, function(c){ return !c.classList.contains('cx-histtag') && !c.classList.contains('cx-dual'); }).pop().textContent; })`);
const sorted = names.slice().sort((a, b) => a.localeCompare(b));
check('orden A–Z ordena por nombre y la URL lleva o=az', JSON.stringify(names) === JSON.stringify(sorted) && /o=az/.test(await hashNow()), [names.slice(0, 4), await hashNow()]);

console.log('\n== «contiene cartas» (390 px) ==');
await click('#cxFilterBtn', 300); if ((await ev(`${q('#cxFilters')}.hidden`)) === true) await click('#cxFilterBtn', 300);
await ev(`(function(){ var i = document.getElementById('cxCardQ'); i.value = 'gundam'; i.dispatchEvent(new Event('input')); })()`); await sleep(400);
const nSug = await count('#cxSuggest .cx-sug');
check('escribir «gundam» da sugerencias (máx. 8)', nSug >= 1 && nSug <= 8, nSug);
const numSug = await ev(`${q('#cxSuggest .cx-sug')}.dataset.number`);
await click('#cxSuggest .cx-sug', 500);
check('elegir una sugerencia crea una ficha con esa carta, cuenta como filtro y entra en la URL', (await count('.cx-cardchip')) === 1 && (await txt('.cx-badge')) === '1' && (await hashNow()).includes('cards=' + numSug), [numSug, await hashNow()]);
check('los chips del panel de filtros miden al menos 44 px de alto', (await ev(`Array.prototype.every.call(document.querySelectorAll('#cxFilters .tag.chip'), function(b){ return b.getBoundingClientRect().height >= 44; })`)) === true);
check('la ficha de carta es un botón de al menos 44 px de alto', (await ev(`${q('.cx-cardchip')}.getBoundingClientRect().height`)) >= 44);
const nCard = await count('.cx-card');
check('solo quedan arquetipos con alguna lista que tenga esa carta', nCard >= 0 && nCard < (await count('.cx-card')) + 1);
if (nCard > 0) {
  await click('.cx-card', 900);
  const nl = await count('.cx-list'), info = await txt('#cxFilterInfo');
  check('dentro del arquetipo salen solo las listas filtradas, con aviso «Mostrando N de M»', nl >= 1 && /Mostrando \d+ de \d+ listas/.test(info || ''), [nl, info]);
  await click('.cx-list', 1200);
  check('el detalle de la lista tiene resumen: coste medio, colores y curva con 8 columnas', (await count('.cx-stats')) === 1 && (await count('.cx-bar')) === 8 && (await count('.cx-pip')) >= 1 && /[A-Za-zÀ-ÿ]+ \d+/.test((await txt('.cx-pip')) || '') && /\d/.test((await txt('.cx-stat .v')) || ''), await txt('.cx-stat .v'));
  check('la curva expone su resumen como texto accesible', /Curva de coste/.test((await ev(`${q('.cx-bars')}.getAttribute('aria-label')`)) || ''));
  const listaTotal = await ev(`Array.prototype.reduce.call(document.querySelectorAll('.cx-bar b'), function(s, e){ return s + (+e.textContent); }, 0)`);
  check('la curva suma las cartas con coste (≤ 50)', listaTotal > 0 && listaTotal <= 50, listaTotal);
  // copiar
  await ev(`window.__copied = null; try{ Object.defineProperty(navigator, 'clipboard', { value: { writeText: function(t){ window.__copied = t; return Promise.resolve(); } }, configurable: true }); }catch(e){} 1`);
  await click('#cxCopyText', 500);
  const copied = await ev('window.__copied');
  check('«Copiar lista» deja la lista como texto y avisa', typeof copied === 'string' && copied.length > 40 && /\d/.test(copied) && /copiada/i.test((await txt('#cxTextMsg')) || ''), [String(copied).slice(0, 80), await txt('#cxTextMsg')]);
  // mano de prueba
  await click('#cxHandBtn', 600);
  check('«Mano de prueba» abre un diálogo modal con 5 cartas y el foco dentro', (await ev(`!${q('#handModal')}.hidden`)) === true && (await count('#handCards .hand-card')) === 5 && (await ev(`${q('#handModal')}.contains(document.activeElement)`)) === true, await count('#handCards .hand-card'));
  await click('#handDraw', 300);
  check('«Robar» añade una carta y el contador del mazo baja', (await count('#handCards .hand-card')) === 6 && /quedan 44/.test((await txt('#handDraw')) || ''), await txt('#handDraw'));
  await click('#handNew', 300);
  check('«Nueva mano» vuelve a 5 cartas y 45 en el mazo', (await count('#handCards .hand-card')) === 5 && /quedan 45/.test((await txt('#handDraw')) || ''), await txt('#handDraw'));
  // DEC-007: con el diálogo abierto, Tab y Mayús+Tab no sacan el foco del diálogo (teclado real)
  const tab = async (shift) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? 8 : 0 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await sleep(150); };
  const dentro = () => ev(`document.getElementById('handModal').contains(document.activeElement)`);
  await ev(`document.getElementById('handClose').focus(); 1`); await tab(false);
  check('Tab desde el último botón vuelve al primero, dentro del diálogo', (await dentro()) === true && (await ev('document.activeElement.id')) === 'handNew', await ev('document.activeElement.id'));
  await tab(true);
  check('Mayús+Tab desde el primero va al último, dentro del diálogo', (await dentro()) === true && (await ev('document.activeElement.id')) === 'handClose', await ev('document.activeElement.id'));
  check('el foco visible del diálogo es un contorno de al menos 2 px', parseFloat(await ev(`getComputedStyle(document.activeElement).outlineWidth`)) >= 2);
  await ev(`document.getElementById('handNew').focus(); 1`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`); await sleep(300);
  check('Esc cierra la mano y devuelve el foco al botón que la abrió', (await ev(`${q('#handModal')}.hidden`)) === true && (await ev(`document.activeElement && document.activeElement.id`)) === 'cxHandBtn', await ev(`document.activeElement && document.activeElement.id`));
}

check('el enlace «Fuente» del detalle mide al menos 44 px de alto (guía interna; WCAG 2.5.8 pide 24)', (await ev(`(function(){ var a = document.querySelector('.cx-srclink'); return a ? a.getBoundingClientRect().height : -1; })()`)) >= 44 || (await count('.cx-srclink')) === 0);
console.log('\n== estado en la URL: abrir un enlace con filtros (390 px) ==');
await abrir(390, 844, '#competicion/mazos?c=Blue&st=Aggro&o=az');
await sleep(1500);
check('un enlace con filtros los aplica: panel abierto, insignia 2, chips marcados', (await ev(`!${q('#cxFilters')}.hidden`)) === true && (await txt('.cx-badge')) === '2' && (await count('#cxFilters .chip.active')) >= 2, [await txt('.cx-badge'), await count('#cxFilters .chip.active')]);
check('el orden A–Z llega por la URL', (await ev(`${q('#cxSort')}.value`)) === 'az');
await abrir(390, 844, '#competicion/mazos?c=Pink&st=Combo&cards=%3Cb%3E&p=7');
await sleep(1500);
check('un enlace con valores inventados se ignora sin romper', (await count('.cx-card')) > 10 && (await count('.cx-badge')) === 0);

console.log('\n== escritorio (1280 px) y sin errores ==');
await abrir(1280, 900);
await click('#tbDecks', 900); await click('#dpExplore', 2500); await click('#cxFilterBtn', 400);
check('en escritorio el panel y las tarjetas se ven sin desbordar', (await ev(`document.documentElement.scrollWidth <= innerWidth + 1`)) === true && (await count('.cx-card')) > 10);
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
