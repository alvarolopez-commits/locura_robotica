// Orden al filtrar: de menor a mayor nivel y, a igual nivel, de menor a mayor ataque. Sin filtros se conserva el orden de siempre.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_filter_order.mjs
import { elegirMazoJS } from './_elegir_mazo.mjs';
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
await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.removeItem('msa_cat_sort'); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(Object.keys(cat).filter((n) => /^(GD06|ST01)-/.test(n)).map((n) => n)))}); 1`);
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
const RT = { UNIT: 0, PILOT: 1, COMMAND: 2, BASE: 3 }, rk = (n) => (RT[cat[n].type] != null ? RT[cat[n].type] : 9);
check('Mi colección sin filtros va por tipo (Unidades, Pilotos, Comandos, Bases) y, dentro de cada tipo, por número', c0.length > 3 && c0.every((n, i) => i === 0 || rk(c0[i - 1]) < rk(n) || (rk(c0[i - 1]) === rk(n) && c0[i - 1].localeCompare(n, undefined, { numeric: true }) <= 0)), c0.slice(0, 6));
await ev(`document.querySelector('#cf-color .tag.chip[data-color="Blue"]').click(); 1`); await sleep(600);
const c1 = await ev(`Array.from(document.querySelectorAll('#collGrid .cc')).map(function(c){ return c.dataset.number })`);
check('Mi colección con un filtro va por tipo y, dentro de cada tipo, por nivel y ataque', c1.length > 3 && c1.every((n, i) => i === 0 || rk(c1[i - 1]) < rk(n) || (rk(c1[i - 1]) === rk(n) && nonDecreasing([c1[i - 1], n]))), c1.slice(0, 6));

// ventana del mazo y detalle en Mis mazos: dentro de cada tipo, por nivel y después por ataque
const decklists = JSON.parse(fs.readFileSync(new URL('../data/decklists.json', import.meta.url), 'utf8'));
const topDeck = decklists.archetypes[0].decks[0].cards;
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
await ev(`localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Orden',cards:${JSON.stringify(topDeck)}}})); localStorage.setItem('msa_active_deck','d1'); 1`);
await send('Page.reload'); await sleep(3800); await ev(elegirMazoJS('d1', { building: false })); await sleep(300);
await click('#deckCount'); await sleep(1200);
const rows = await ev(`Array.from(document.querySelectorAll('#deckView .dv-open')).map(function(b){ return b.getAttribute('aria-label') })`);
const dn = rows.map((l) => l.match(/[A-Z]{2}\d+-\d+/)[0]);
const ordenOK = (list) => list.every((n, i) => i === 0 || cat[list[i - 1]].type !== cat[n].type || dig(cat[list[i - 1]].lv) < dig(cat[n].lv) || (dig(cat[list[i - 1]].lv) === dig(cat[n].lv) && dig(cat[list[i - 1]].ap) <= dig(cat[n].ap)));
check('la ventana del mazo lista cada tipo por nivel y después por ataque', dn.length > 10 && ordenOK(dn), dn.map((n) => `${n}:${cat[n].type[0]}L${cat[n].lv}/${cat[n].ap}`).slice(0, 14));
check('los tipos siguen agrupados (Unidades, Pilotos, Comandos, Bases)', dn.every((n, i) => i === 0 || ['UNIT', 'PILOT', 'COMMAND', 'BASE'].indexOf(cat[dn[i - 1]].type) <= ['UNIT', 'PILOT', 'COMMAND', 'BASE'].indexOf(cat[n].type)));
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

// botón "Nivel ↑" (sustituye al selector de orden): un solo botón con dos estados dentro de la barra de búsqueda
await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(700);
await ev(`localStorage.removeItem('msa_cat_sort'); 1`);
await send('Page.reload'); await sleep(3500);
const btn = () => ev(`(function(){ var b=document.getElementById('catSortBtn'); if(!b) return null; var cs=getComputedStyle(b), ck=b.querySelector('.sort-ck'), sb=document.getElementById('searchBtn').getBoundingClientRect(), r=b.getBoundingClientRect(); return { texto:b.textContent.replace(/\\s+/g,' ').trim(), pressed:b.getAttribute('aria-pressed'), aria:b.getAttribute('aria-label'), dentro:!!b.closest('.searchbar'), check: ck ? (getComputedStyle(ck).display !== 'none' && getComputedStyle(ck).visibility !== 'hidden') : false, bg:cs.backgroundColor, antesDeLaLupa: r.right <= sb.left + 0.5, alto:Math.round(r.height), ancho:Math.round(r.width), selectViejo:!!document.getElementById('catSort') } })()`);
const cargaTodo = async () => {   // avanza como un scroll normal: se acerca al final de lo cargado hasta que el centinela entra en la zona de carga
  for (let i = 0; i < 80; i++) {
    const n = await ev(`document.querySelectorAll('#grid .dz-inner').length`); if (n >= 1086) break;
    await ev(`(function(){ var s=document.getElementById('gridMore'); if(s) window.scrollBy(0, s.getBoundingClientRect().top - innerHeight - 200); return 1 })()`); await sleep(220);
  }
  return nums();
};
const arriba = async () => { await ev(`window.scrollTo(0, 0); 1`); await sleep(200); };
const RANGO = { UNIT: 0, PILOT: 1, COMMAND: 2, BASE: 3 };
const b0 = await btn();
check('hay un único botón "Nivel ↑" dentro de la barra de búsqueda y ya no el selector', !!b0 && b0.texto === 'Nivel ↑' && b0.dentro && b0.selectViejo === false, b0);
check('empieza desactivado: aria-pressed=false, sin check y con la etiqueta accesible', b0 && b0.pressed === 'false' && b0.check === false && b0.aria === 'Ordenar por nivel de menor a mayor', b0);
check('está a la izquierda de la lupa y mide al menos 44 px de alto', b0 && b0.antesDeLaLupa && b0.alto >= 44, b0);
const orig = await cargaTodo(); const idx = new Map(orig.map((n, i) => [n, i]));
check('al abrir, las 1086 cartas salen por número de carta, cargadas en tandas y sin duplicados', orig.length === 1086 && new Set(orig).size === 1086 && orig[0] === 'ST01-001', [orig.length, new Set(orig).size, orig[0]]);
await arriba(); await click('#catSortBtn'); await sleep(700);
const b1 = await btn();
check('activado: aria-pressed=true, con check y un estilo distinto del neutro', b1 && b1.pressed === 'true' && b1.check === true && b0 && b1.bg !== b0.bg, [b0 && b0.bg, b1 && b1.bg]);
const on = await cargaTodo();
const clave = (n) => [RANGO[cat[n].type], dig(cat[n].lv), dig(cat[n].ap), idx.get(n)];
const crece = (list) => list.every((n, i) => { if (i === 0) return true; const a = clave(list[i - 1]), c = clave(n); for (let k = 0; k < 4; k++) { if (a[k] !== c[k]) return a[k] < c[k]; } return false; });
check('activado: las mismas 1086 cartas, sin duplicados ni faltas, tras cargar todas las tandas', on.length === 1086 && new Set(on).size === 1086 && [...on].sort().join() === [...orig].sort().join(), [on.length, new Set(on).size]);
check('ordenadas por tipo (Unidades, Pilotos, Comandos, Bases), nivel numérico (el 2 antes que el 10), ataque y, a igualdad, por número', crece(on), on.slice(0, 6).map((n) => `${cat[n].type[0]}${cat[n].lv}`));
check('el nivel 10 queda detrás del 2 dentro de los Comandos (orden numérico, no de texto; el 10 solo existe ahí)', (() => { const u = on.filter((n) => cat[n].type === 'COMMAND').map((n) => dig(cat[n].lv)); return u.indexOf(2) >= 0 && u.indexOf(10) >= 0 && u.lastIndexOf(2) < u.indexOf(10) && u.indexOf(10) === u.length - 1; })());
await arriba(); await click('#catSortBtn'); await sleep(700);
const b2 = await btn(); const off = await cargaTodo();
check('segundo toque: vuelve a desactivado y restaura exactamente el orden por número', b2.pressed === 'false' && b2.check === false && JSON.stringify(off) === JSON.stringify(orig), [b2.pressed, off.length]);
// con búsqueda: el botón no pierde el texto ni cambia el conjunto de resultados, solo el orden
await arriba();
await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='gundam'; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(900);
const sOff = await cargaTodo();
await arriba(); await click('#catSortBtn'); await sleep(800);
const sOn = await cargaTodo();
check('con búsqueda: mismo texto, mismo conjunto de cartas y orden por tipo/nivel al activarlo', (await ev(`document.getElementById('searchMain').value`)) === 'gundam' && sOn.length === sOff.length && [...sOn].sort().join() === [...sOff].sort().join() && crece(sOn), [sOff.length, sOn.length]);
await arriba(); await click('#catSortBtn'); await sleep(700);
check('y al desactivarlo la búsqueda sigue ahí con el mismo conjunto', (await ev(`document.getElementById('searchMain').value`)) === 'gundam' && (await cargaTodo()).length === sOff.length);
await arriba(); await click('#clearFilters'); await sleep(600);
// con filtro de set: 4 tipos agrupados y por nivel
await ev(`(function(){ var w=document.getElementById('f-set-wrap'); if(!w.classList.contains('open')) document.querySelector('.sb-ghead[data-toggle="f-set-wrap"]').click() })()`); await sleep(400);
await ev(`Array.from(document.querySelectorAll('#f-set .tag.chip')).filter(function(c){ return c.textContent==='ST01' })[0].click()`); await sleep(600);
await click('#catSortBtn'); await sleep(700);
const so = await nums();
check('con el filtro ST01 activado salen 16 cartas: Unidades, Pilotos, Comandos y Bases, cada tipo por nivel', so.length === 16 && new Set(so.map((n) => cat[n].type)).size === 4 && so.every((n, i) => i === 0 || RANGO[cat[so[i - 1]].type] < RANGO[cat[n].type] || (RANGO[cat[so[i - 1]].type] === RANGO[cat[n].type] && dig(cat[so[i - 1]].lv) <= dig(cat[n].lv))), so.map((n) => `${cat[n].type[0]}${cat[n].lv}`).join(' '));
// la elección se recuerda (ya se guardaba) y un valor antiguo "de mayor a menor" ya no se aplica
await send('Page.reload'); await sleep(3500);
check('la elección se recuerda al recargar', (await ev(`document.getElementById('catSortBtn').getAttribute('aria-pressed')`)) === 'true');
await ev(`localStorage.setItem('msa_cat_sort','lvDesc'); 1`); await send('Page.reload'); await sleep(3500);
check('un valor antiguo "lvDesc" arranca desactivado, por número de carta', (await ev(`document.getElementById('catSortBtn').getAttribute('aria-pressed')`)) === 'false' && (await nums())[0] === 'ST01-001');
await ev(`localStorage.setItem('msa_lang','en'); localStorage.removeItem('msa_cat_sort'); 1`); await send('Page.reload'); await sleep(3500);
const en = await btn();
check('en inglés: "Level ↑" y la etiqueta accesible se traducen', en && en.texto === 'Level ↑' && en.aria === 'Sort by level, low to high', en);
await ev(`localStorage.setItem('msa_lang','es'); 1`);
// móvil: sin desbordes y con el campo de búsqueda utilizable
for (const W of [320, 375, 430]) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 800, deviceScaleFactor: 1, mobile: true });
  await send('Page.reload'); await sleep(3800);
  const m = await ev(`(function(){ var b=document.getElementById('catSortBtn').getBoundingClientRect(), i=document.getElementById('searchMain').getBoundingClientRect(), s=document.getElementById('searchBtn').getBoundingClientRect(), sbar=document.querySelector('.searchbar').getBoundingClientRect(); return { scrollW:document.documentElement.scrollWidth, ancho:innerWidth, alto:Math.round(b.height), anchoBtn:Math.round(b.width), anchoCampo:Math.round(i.width), dentro: b.left >= sbar.left && s.right <= sbar.right + 0.5, sinSolape: b.right <= s.left + 0.5 && i.right <= b.left + 0.5, misma: Math.abs((b.top + b.bottom) / 2 - (s.top + s.bottom) / 2) < 3 } })()`);
  check(W + ' px: sin desborde horizontal, botón de 44 px y todo en la misma fila de la barra', m.scrollW <= m.ancho && m.alto >= 44 && m.dentro && m.sinSolape && m.misma, m);
  check(W + ' px: el campo de búsqueda conserva al menos 110 px', m.anchoCampo >= 110, m);
}
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
