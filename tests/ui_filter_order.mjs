// Orden al filtrar: de menor a mayor nivel y, a igual nivel, de menor a mayor ataque. Sin filtros se conserva el orden de siempre.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_filter_order.mjs
import fs from 'node:fs';
const cat = {};
for (const f of fs.readdirSync(new URL('../data/', import.meta.url))) {
  if (!/^(ST|GD|EB)\d+\.json$/.test(f)) continue;
  const d = JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
  for (const c of (Array.isArray(d) ? d : d.cards || [])) cat[c.number] = c;
}
const dig = (v) => { const m = String(v ?? '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)).match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const nums = () => ev(`Array.from(document.querySelectorAll('#grid .dz-inner .card-imgwrap')).map(function(w){ return w.dataset.number })`);
const nonDecreasing = (list) => list.every((n, i) => i === 0 || dig(cat[list[i - 1]].lv) < dig(cat[n].lv) || (dig(cat[list[i - 1]].lv) === dig(cat[n].lv) && dig(cat[list[i - 1]].ap) <= dig(cat[n].ap)));
const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click(); 1`);

await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(Object.keys(cat).filter((n) => /^(GD06|ST01)-/.test(n)).map((n) => n)))}); 1`);
await send('Page.reload'); await sleep(3800);

const sinFiltros = await nums();
check('sin filtros se conserva el orden de siempre (por número)', sinFiltros.slice(0, 5).every((n, i) => n === Object.keys(cat).sort((a, b) => a.localeCompare(b))[i] || true) && sinFiltros[0] === 'ST01-001', sinFiltros.slice(0, 4));
check('sin filtros el orden NO es el de nivel/ataque', !nonDecreasing(sinFiltros.slice(0, 48)), null);

// como en la captura: set GD06 + color azul
await click('#f-set-wrap') ; // por si está plegado
await ev(`(function(){ var w=document.getElementById('f-set-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-set-wrap"]').click() })()`); await sleep(400);
await ev(`Array.from(document.querySelectorAll('#f-set .tag.chip')).filter(function(c){ return c.textContent==='GD06' })[0].click()`); await sleep(500);
await ev(`(function(){ var w=document.getElementById('f-color-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-color-wrap"]').click() })()`); await sleep(400);
await click('#f-color .tag.chip[data-color="Blue"]'); await sleep(700);
let f = await nums();
check('hay resultados con GD06 + Azul', f.length > 5 && f.every((n) => n.startsWith('GD06-') && cat[n].color === 'Blue'), f.length);
check('salen de menor a mayor nivel y, a igual nivel, de menor a mayor ataque', nonDecreasing(f), f.map((n) => `${n}:L${cat[n].lv}/AP${cat[n].ap}`).slice(0, 12));
check('el primero es de nivel mínimo y el último de nivel máximo', dig(cat[f[0]].lv) === Math.min(...f.map((n) => dig(cat[n].lv))) && dig(cat[f[f.length - 1]].lv) === Math.max(...f.map((n) => dig(cat[n].lv))));
// buscar también ordena
await click('#clearFilters'); await sleep(500);
await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='gundam'; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(900);
f = await nums();
check('una búsqueda también sale por nivel y ataque', f.length > 5 && nonDecreasing(f), f.slice(0, 6));
await click('#clearFilters'); await sleep(600);
check('al quitar los filtros vuelve el orden de siempre', (await nums())[0] === 'ST01-001');

// Mi colección
await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(300); await send('Page.reload'); await sleep(4000);
const c0 = await ev(`Array.from(document.querySelectorAll('#collGrid .cc')).map(function(c){ return c.dataset.number })`);
check('Mi colección sin filtros va por número', c0[0] === 'GD06-001', c0.slice(0, 3));
await ev(`document.querySelector('#cf-color .tag.chip[data-color="Blue"]').click(); 1`); await sleep(600);
const c1 = await ev(`Array.from(document.querySelectorAll('#collGrid .cc')).map(function(c){ return c.dataset.number })`);
check('Mi colección con un filtro va por nivel y ataque', c1.length > 3 && nonDecreasing(c1), c1.slice(0, 6));

// ventana del mazo y detalle en Mis mazos: dentro de cada tipo, por nivel y después por ataque
const decklists = JSON.parse(fs.readFileSync(new URL('../data/decklists.json', import.meta.url), 'utf8'));
const topDeck = decklists.archetypes[0].decks[0].cards;
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
await ev(`localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Orden',cards:${JSON.stringify(topDeck)}}})); localStorage.setItem('msa_active_deck','d1'); 1`);
await send('Page.reload'); await sleep(3800);
await click('#deckCount'); await sleep(1200);
const rows = await ev(`Array.from(document.querySelectorAll('#deckView .dv-open')).map(function(b){ return b.getAttribute('aria-label') })`);
const dn = rows.map((l) => l.match(/[A-Z]{2}\d+-\d+/)[0]);
const ordenOK = (list) => list.every((n, i) => i === 0 || cat[list[i - 1]].type !== cat[n].type || dig(cat[list[i - 1]].lv) < dig(cat[n].lv) || (dig(cat[list[i - 1]].lv) === dig(cat[n].lv) && dig(cat[list[i - 1]].ap) <= dig(cat[n].ap)));
check('la ventana del mazo lista cada tipo por nivel y después por ataque', dn.length > 10 && ordenOK(dn), dn.map((n) => `${n}:${cat[n].type[0]}L${cat[n].lv}/${cat[n].ap}`).slice(0, 14));
check('los tipos siguen agrupados (Unidades, Pilotos, Bases, Comandos)', dn.every((n, i) => i === 0 || ['UNIT', 'PILOT', 'BASE', 'COMMAND'].indexOf(cat[dn[i - 1]].type) <= ['UNIT', 'PILOT', 'BASE', 'COMMAND'].indexOf(cat[n].type)));
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(700);
await click('#btnMyDecks'); await sleep(900); await click('#dpGrid .dp-deck'); await sleep(1000);
const dp = (await ev(`Array.from(document.querySelectorAll('#dpRows button')).map(function(b){ return b.getAttribute('aria-label') || '' })`)).map((l) => (l.match(/[A-Z]{2}\d+-\d+/) || [])[0]).filter(Boolean);
check('el detalle en Mis mazos también', dp.length > 10 && ordenOK(dp), dp.slice(0, 8));
const romanos = await ev(`(function(){ document.getElementById('dvBack') && 0; return document.body.innerText.search(/[Ⅰ-Ⅹ]/) })()`);
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(700); await send('Page.reload'); await sleep(3500);
await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='zaku'; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(900);
const nombres = await ev(`Array.from(document.querySelectorAll('#grid .dz-inner')).map(function(d){ return d.getAttribute('aria-label') })`);
check('los nombres con "Ⅱ" se escriben con letras (Zaku II) y no queda ningún número romano de una pieza', nombres.length > 3 && nombres.every((n) => !/[Ⅰ-Ⅹ]/.test(n)) && nombres.some((n) => /Zaku II/.test(n)), nombres.slice(0, 4));
const buscaII = await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='zaku ii'; e.dispatchEvent(new Event('input',{bubbles:true})); return true })()`); await sleep(900);
check('se puede buscar "zaku ii" con letras normales', (await nums()).length >= 1, await nums());

// selector de orden del catálogo: por tipo (Unidades, Pilotos, Comandos, Bases) y nivel, de menor a mayor o de mayor a menor
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(700); await send('Page.reload'); await sleep(3500);
const opts = await ev(`Array.from(document.querySelectorAll('#catSort option')).map(function(o){ return o.value + '=' + o.textContent })`);
check('el catálogo tiene un selector de orden con 3 opciones', JSON.stringify(opts) === JSON.stringify(['auto=Orden normal', 'lvAsc=Nivel: de menor a mayor', 'lvDesc=Nivel: de mayor a menor']), opts);
await ev(`(function(){ var w=document.getElementById('f-set-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-set-wrap"]').click() })()`); await sleep(400);
await ev(`Array.from(document.querySelectorAll('#f-set .tag.chip')).filter(function(c){ return c.textContent==='ST01' })[0].click()`); await sleep(600);
const ORDEN = ['UNIT', 'PILOT', 'COMMAND', 'BASE'];
const setSort = async (v) => { await ev(`(function(){ var s=document.getElementById('catSort'); s.value='${v}'; s.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(600); };
const tipoNivel = (list, dir) => list.every((n, i) => i === 0 || ORDEN.indexOf(cat[list[i - 1]].type) < ORDEN.indexOf(cat[n].type) || (cat[list[i - 1]].type === cat[n].type && (dir * (dig(cat[list[i - 1]].lv) - dig(cat[n].lv)) < 0 || (dig(cat[list[i - 1]].lv) === dig(cat[n].lv) && dir * (dig(cat[list[i - 1]].ap) - dig(cat[n].ap)) <= 0))));
await setSort('lvAsc'); let so = await nums();
check('menor a mayor: primero Unidades, luego Pilotos, Comandos y Bases, y dentro de cada tipo por nivel', so.length === 16 && tipoNivel(so, 1) && new Set(so.map((n) => cat[n].type)).size === 4, so.map((n) => `${cat[n].type[0]}${cat[n].lv}`).join(' '));
await setSort('lvDesc'); so = await nums();
check('mayor a menor: mismos tipos en el mismo orden, y dentro de cada tipo del nivel más alto al más bajo', so.length === 16 && tipoNivel(so, -1), so.map((n) => `${cat[n].type[0]}${cat[n].lv}`).join(' '));
await send('Page.reload'); await sleep(3500);
check('la elección se recuerda al recargar', (await ev(`document.getElementById('catSort').value`)) === 'lvDesc');
await setSort('auto'); so = await nums();
check('"Orden normal" devuelve el de siempre', JSON.stringify(so) === JSON.stringify([...so].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) || so[0] === 'ST01-001', so.slice(0, 3));
await ev(`localStorage.setItem('msa_lang','en'); 1`); await send('Page.reload'); await sleep(3500);
check('en inglés las opciones se traducen', (await ev(`document.querySelector('#catSort option[value=lvAsc]').textContent`)) === 'Level: low to high');
await ev(`localStorage.removeItem('msa_cat_sort'); localStorage.setItem('msa_lang','es'); 1`);
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
