// Prueba de interfaz: el filtro Tipo del catálogo ofrece Token; al elegirlo salen los tokens (sin selector de copias) y se abren como ficha.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_catalogo_tokens.mjs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); 1`);
await send('Page.reload'); await sleep(4500);
const chips = () => ev(`Array.from(document.querySelectorAll('#f-type .chip, #f-type .tag')).map(function(b){ return b.textContent.trim() })`);
const cuenta = () => ev(`document.getElementById('resultcount').textContent`);
const tiles = () => ev(`(function(){ var t = Array.from(document.querySelectorAll('#grid .dz-inner')); return { n: t.length, nums: t.slice(0, 3).map(function(x){ return x.querySelector('.card-imgwrap').dataset.number }), conSelector: t.filter(function(x){ return x.querySelector('.card-body .adder, .card-body [data-adder], .card-body .qty-ctl') }).length } })()`);
const marcar = (txt) => ev(`Array.from(document.querySelectorAll('#f-type .chip, #f-type .tag')).filter(function(b){ return b.textContent.trim() === ${JSON.stringify(txt)} })[0].click(); 1`);

check('el filtro Tipo ofrece Unidad, Piloto, Comando, Base y, al final, Token', JSON.stringify(await chips()) === JSON.stringify(['Unidad', 'Piloto', 'Comando', 'Base', 'Token']), await chips());
check('sin filtro el catálogo no incluye tokens', /1086 de 1086/.test(await cuenta()), await cuenta());
await marcar('Token'); await sleep(800);
const c = await cuenta(), tl = await tiles();
check('al elegir Token salen solo los tokens (T-…)', tl.n > 0 && tl.nums.every((n) => /^T-/.test(n)) && /^\d+ de 1121 cartas|^\d+ de \d+ cartas/.test(c), { c, tl });
check('un token no lleva selector de copias', tl.conSelector === 0, tl);
await ev(`document.querySelector('#grid .dz-inner .card-imgwrap').click(); 1`); await sleep(1200);
check('la ficha de un token se abre', await ev(`!document.getElementById('overlay').hidden`));
await ev(`document.getElementById('detailClose') ? document.getElementById('detailClose').click() : document.querySelector('#overlay .close, #overlay [aria-label*="errar"]').click(); 1`); await sleep(700);
await marcar('Unidad'); await sleep(800);
const conTokens = parseInt(await cuenta(), 10);
await marcar('Token'); await sleep(800);
const soloUnidad = parseInt(await cuenta(), 10), unidadesConSelector = (await tiles()).conSelector;
check('Token + Unidad suma los tokens a las unidades', conTokens > soloUnidad && soloUnidad > 0, { conTokens, soloUnidad });
check('la comprobación del selector es válida: las unidades sí lo llevan', unidadesConSelector > 0, unidadesConSelector);
await marcar('Unidad'); await sleep(800);
check('al quitar los filtros vuelven las 1086 cartas, sin tokens', /1086 de 1086/.test(await cuenta()), await cuenta());
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
ws.close(); process.exit(failed ? 1 : 0);
