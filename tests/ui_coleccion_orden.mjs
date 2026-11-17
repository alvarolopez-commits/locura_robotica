// Mi colección: orden por color (azul, verde, rojo, blanco, morado) → tipo (unidades, pilotos, comandos, bases) → de menor a mayor; y la pestaña «Filtros» de la barra inferior abre los filtros de la colección.
// Una sola pasada, sin reintentos. Límites: 30 s por orden y 3 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_coleccion_orden.mjs
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (3 min) en: ' + paso); process.exit(3); }, 180000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception?.description || '').slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: (r.result.exceptionDetails.exception?.description || '').slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra).slice(0, 400) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

/* ---- una colección mezclada y su orden esperado, calculado aparte del catálogo ---- */
const ALL = JSON.parse(fs.readFileSync('data/all_cards.json', 'utf8')).filter((c) => !c.token);
const COLORS = ['Blue', 'Green', 'Red', 'White', 'Purple'], TIPOS = ['UNIT', 'PILOT', 'COMMAND', 'BASE'];
const num = (v) => { const m = String(v == null ? '' : v).match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
const cmp = (a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color) || TIPOS.indexOf(a.type) - TIPOS.indexOf(b.type) || num(a.lv) - num(b.lv) || num(a.cost) - num(b.cost) || num(a.ap) - num(b.ap) || a.number.localeCompare(b.number, undefined, { numeric: true });
// 2 cartas de cada color y tipo (40 en total: caben en la primera tanda de la cuadrícula), de niveles distintos y mezcladas a propósito (no por orden de código)
const muestra = []; COLORS.forEach((col) => TIPOS.forEach((ty) => { ALL.filter((c) => c.color === col && c.type === ty).sort((a, b) => (num(b.lv) - num(a.lv)) || b.number.localeCompare(a.number)).slice(0, 2).forEach((c) => muestra.push(c)); }));
const coleccion = {}; muestra.slice().reverse().forEach((c) => { coleccion[c.number] = { q: 1, t: 1 }; });
const esperado = muestra.slice().sort(cmp).map((c) => c.number);

async function abrir(W, H, col) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(col))}); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(400); await send('Page.reload'); await sleep(4200);
}
const orden = () => ev(`Array.prototype.map.call(document.querySelectorAll('#collGrid .cc'), function(c){ return c.dataset.number; })`);
const txt = (s) => ev(`(document.querySelector(${JSON.stringify(s)}) || {}).textContent`);

console.log('\n== orden de Mi colección (390 px) ==');
await abrir(390, 844, coleccion);
const total = muestra.length;
let got = await orden();
check('se ven todas las cartas de la colección de prueba (' + total + ')', got.length === total, [got.length, total]);
check('orden: azul → verde → rojo → blanco → morado; en cada color unidades → pilotos → comandos → bases; de menor a mayor', JSON.stringify(got) === JSON.stringify(esperado), got.map((n, i) => n === esperado[i] ? null : [i, n, esperado[i]]).filter(Boolean).slice(0, 4));
const colDe = (n) => ALL.find((c) => c.number === n).color, tipoDe = (n) => ALL.find((c) => c.number === n).type;
check('los colores salen en bloques seguidos (sin volver a un color anterior)', got.every((n, i) => i === 0 || COLORS.indexOf(colDe(n)) >= COLORS.indexOf(colDe(got[i - 1]))));
check('dentro de cada color, los tipos salen en bloques: unidades, pilotos, comandos, bases', got.every((n, i) => i === 0 || colDe(n) !== colDe(got[i - 1]) || TIPOS.indexOf(tipoDe(n)) >= TIPOS.indexOf(tipoDe(got[i - 1]))));
check('dentro de cada tipo el nivel no baja (de más bajo a más alto)', got.every((n, i) => i === 0 || colDe(n) !== colDe(got[i - 1]) || tipoDe(n) !== tipoDe(got[i - 1]) || num(ALL.find((c) => c.number === n).lv) >= num(ALL.find((c) => c.number === got[i - 1]).lv)));

console.log('\n== el orden no cambia al filtrar y la pestaña «Filtros» abre los de la colección ==');
await ev(`document.getElementById('tbFilters').click(); 1`); await sleep(500);
check('«Filtros» de la barra inferior, estando en Mi colección, abre el panel de filtros de la colección (no el del catálogo)', (await ev(`document.getElementById('collFilters').classList.contains('open')`)) === true && (await ev(`document.getElementById('sidebar') ? document.getElementById('sidebar').classList.contains('open') : false`)) === false && (await ev(`!document.getElementById('collPage').hidden`)) === true);
check('el panel tiene Color, Tipo y demás grupos con opciones', (await ev(`document.querySelectorAll('#collFilters .sb-group:not([hidden])').length`)) >= 3, await ev(`document.querySelectorAll('#collFilters .sb-group:not([hidden])').length`));
await ev(`document.getElementById('tbFilters').click(); 1`); await sleep(500);
check('tocar «Filtros» otra vez cierra el panel', (await ev(`document.getElementById('collFilters').classList.contains('open')`)) === false);
await ev(`document.getElementById('collFilterBtn').click(); 1`); await sleep(400);
const rojo = await ev(`(function(){ var o = Array.prototype.filter.call(document.querySelectorAll('#cf-color .tag, #cf-color button, #cf-color label'), function(e){ return /Rojo|Red/.test(e.textContent); })[0]; if(!o) return false; o.click(); return true; })()`); await sleep(500);
await ev(`document.getElementById('collApply').click(); 1`); await sleep(600);
got = await orden();
const soloRojo = esperado.filter((n) => colDe(n) === 'Red');
check('filtrar por rojo deja solo las rojas y en el mismo orden (unidades → pilotos → comandos → bases)', rojo === true && JSON.stringify(got) === JSON.stringify(soloRojo), [rojo, got.length, soloRojo.length]);

console.log('\n== escritorio (1280 px) y sin errores ==');
await abrir(1280, 900, coleccion);
got = await orden();
check('el mismo orden en escritorio', JSON.stringify(got) === JSON.stringify(esperado));
check('sin desbordamiento horizontal', (await ev(`document.documentElement.scrollWidth <= innerWidth + 1`)) === true);
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
