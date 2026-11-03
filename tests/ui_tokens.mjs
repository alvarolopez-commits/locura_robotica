// Cartas TOKEN: solo existen para Mi colección; no entran en el catálogo ni en los mazos y no suman como carta distinta.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_tokens.mjs
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../data/tokens.js', import.meta.url), 'utf8');
const TOKENS = JSON.parse(src.slice(src.indexOf('= ') + 2).replace(/;\s*$/, ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }

// ---- los datos descargados
check('hay 35 tokens, con número T-xxx, nombre, AP/HP y tipo UNIT TOKEN', TOKENS.length === 35 && TOKENS.every((c) => /^T-\d{3}$/.test(c.number) && c.name && c.type === 'UNIT TOKEN' && c.token === true && c.set === 'TOKEN'), TOKENS.length);
check('cada token tiene su imagen en images/', TOKENS.every((c) => fs.existsSync(new URL(`../images/${c.number}.webp`, import.meta.url)) && fs.statSync(new URL(`../images/${c.number}.webp`, import.meta.url)).size > 2000));
check('los números romanos de una pieza se normalizan al cargar (en los datos siguen como vienen de la web)', TOKENS.some((c) => /[Ⅰ-Ⅹ]/.test(c.name)));

await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
const OWNED = { 'ST01-001': { q: 1, t: 1 }, 'ST01-002': { q: 2, t: 2 }, 'GD01-001': { q: 1, t: 3 }, 'T-001': { q: 2, t: 4 }, 'T-007': { q: 1, t: 5 } };
async function abrir(hash, coll) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(coll))}); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + (hash || '') }); await sleep(300); await send('Page.reload'); await sleep(4200);
}
const cards = () => ev(`Array.from(document.querySelectorAll('#collGrid .cc')).map(function(c){ return c.dataset.number })`);
const text = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim() : null })()`);
const sleepTyped = async (sel, v) => { await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(400); };

for (const W of [1280, 390]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });

  // catálogo sin tokens
  await abrir('', OWNED);
  const cat = await ev(`(function(){ return { total: document.getElementById('resultcount').textContent, tokens: document.querySelectorAll('#grid [data-number^="T-"]').length } })()`);
  check('el catálogo no incluye tokens', cat.tokens === 0 && /1086/.test(cat.total), cat);
  await sleepTyped('#searchMain', 'zaku');
  check('buscar "zaku" en el catálogo no devuelve tokens', (await ev(`document.querySelectorAll('#grid [data-number^="T-"]').length`)) === 0);

  // Mi colección: aparecen, pero no cuentan
  await abrir('#coleccion', OWNED);
  check('Mi colección muestra las cartas y los tokens', JSON.stringify((await cards()).sort()) === JSON.stringify(Object.keys(OWNED).sort()), await cards());
  check('el recuento es de 3 cartas distintas: los tokens no suman', (await text('#collSub')) === '3 cartas distintas', await text('#collSub'));
  const tk = await ev(`(function(){ var c=document.querySelector('#collGrid .cc[data-number="T-007"]'); return { meta:c.querySelector('.cc-meta').textContent, tengo:!!c.querySelector('.coll-tag') && !c.querySelector('.coll-tag').hidden, n:c.querySelector('.cc-n').textContent, nombre:c.querySelector('.cc-name').textContent, img:c.querySelector('img').getAttribute('src') } })()`);
  check('el token se ve con su imagen, "Token", TENGO y sus copias', tk.meta === 'T-007 · Token' && tk.tengo && tk.n === '1' && tk.nombre === 'Zaku II' && tk.img === 'images/T-007.webp', tk);
  await ev(`document.querySelector('#collGrid .cc[data-number="T-001"] .cc-plus').click(); 1`); await sleep(300);
  check('se pueden sumar copias de un token', (JSON.parse(await ev(`localStorage.getItem('msa_collection')`))['T-001'].q) === 3 && (await text('#collSub')) === '3 cartas distintas');
  // filtro Tipo → Token (ya no está en Set), y tokens al final con filtros
  const chips = await ev(`Array.from(document.querySelectorAll('#cf-set .tag.chip')).map(function(c){ return c.textContent })`);
  check('el filtro Set ya no ofrece "TOKEN"', !chips.includes('TOKEN') && chips.includes('ST01'), chips);
  const tipos = await ev(`Array.from(document.querySelectorAll('#cf-type .tag.chip')).map(function(c){ return c.textContent })`);
  check('el filtro Tipo de Mi colección termina en "Token"', tipos[tipos.length - 1] === 'Token' && tipos.includes('Unidad'), tipos);
  if (W < 900) { await ev(`document.getElementById('collFilterBtn').click(); 1`); await sleep(500); }
  await ev(`(function(){ var w=document.getElementById('cf-type-wrap'); if(!w.classList.contains('open')) document.querySelector('#collFilters .sb-ghead[data-cf="cf-type-wrap"]').click() })()`); await sleep(400);
  const pulsa = (txt) => ev(`Array.from(document.querySelectorAll('#cf-type .tag.chip')).filter(function(c){ return c.textContent==='${txt}' })[0].click()`);
  await pulsa('Token'); await sleep(500);
  check('con Tipo → Token solo se ven los tokens', JSON.stringify((await cards()).sort()) === JSON.stringify(['T-001', 'T-007']), await cards());
  await pulsa('Token'); await pulsa('Unidad'); await sleep(500);
  check('con Tipo → Unidad no salen los tokens', (await cards()).length > 0 && (await cards()).every((n) => !n.startsWith('T-')), await cards());
  await ev(`document.getElementById('collClear').click(); 1`); await sleep(300);
  if (W < 900) { await ev(`document.getElementById('collApply').click(); 1`); await sleep(400); }
  // copiar
  await ev(`window.__c=null; navigator.clipboard.writeText=function(t){ window.__c=t; return Promise.resolve() }; document.getElementById('collCopy').click(); 1`); await sleep(300);
  const copia = await ev(`window.__c`);
  check('el texto copiado cuenta 3 cartas y lista los tokens al final', /\(3 cartas distintas/.test(copia) && /\nTOKEN\n3x T-001 · Gundam/.test(copia) && copia.indexOf('TOKEN') > copia.indexOf('GD01'), copia.slice(0, 200));

  // ficha del token
  await ev(`document.querySelector('#collGrid .cc[data-number="T-007"] .cc-open').click(); 1`); await sleep(1500);
  const fi = await ev(`(function(){ var d=document.getElementById('detail'); return { nombre:d.querySelector('.d-name').textContent, mazo: !!d.querySelector('.d-ctl .dc-btn, .dc-add'), kpis:Array.from(d.querySelectorAll('.d-kpi')).map(function(k){ return k.textContent.replace(/\\s+/g,' ').trim() }), coleccion:!!d.querySelector('.coll-row') } })()`);
  check('la ficha del token se abre sin controles de mazo y con AP · HP', fi.nombre === 'Zaku II' && fi.mazo === false && fi.kpis.some((k) => /^AP · HP\s*1 · 1$/.test(k)) && fi.coleccion === true, fi);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(1200);

  // añadir desde el panel
  await abrir('#coleccion', { 'ST01-001': { q: 1, t: 1 } });
  await ev(`document.getElementById('collAdd').click(); 1`); await sleep(500);
  await sleepTyped('#addSearch', 'zaku ii');
  const filas = await ev(`Array.from(document.querySelectorAll('#addResults .cadd-row')).map(function(r){ return r.dataset.number })`);
  check('el panel de añadir encuentra tokens por nombre', filas.includes('T-007') && filas.includes('T-006'), filas.slice(0, 8));
  await sleepTyped('#addSearch', 't007');
  check('y por código, sin guion', (await ev(`document.querySelector('#addResults .cadd-row').dataset.number`)) === 'T-007');
  check('se identifican como Token', /Token/.test(await text('#addResults .cadd-row .cadd-meta')), await text('#addResults .cadd-row .cadd-meta'));
  await ev(`document.querySelector('#addResults .cadd-row .cadd-btn').click(); 1`); await sleep(400);
  check('añadirlo lo mete en la colección y NO cambia el recuento', JSON.parse(await ev(`localStorage.getItem('msa_collection')`))['T-007']?.q === 1 && (await text('#addTotals')) === '1 carta distinta', await text('#addTotals'));
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
