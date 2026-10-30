// Copiar el mazo desde su ventana (botón cuadrado junto a "vaciar", como el de Mi colección).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_deck_copy.mjs
import fs from 'node:fs';
const decklists = JSON.parse(fs.readFileSync(new URL('../data/decklists.json', import.meta.url), 'utf8'));
const topDeck = decklists.archetypes[0].decks[0].cards;
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

async function abrir(cards, lang) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Mi mazo de prueba',cards:${JSON.stringify(cards)}}})); localStorage.setItem('msa_active_deck','d1'); 1`);
  await send('Page.reload'); await sleep(3500);
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(1100);
}
const estado = () => ev(`(function(){ var b=document.getElementById('dvCopy'), r=b.getBoundingClientRect(), c=document.getElementById('dvClear').getBoundingClientRect(); return { w:Math.round(r.width), h:Math.round(r.height), aria:b.getAttribute('aria-label'), title:b.title, dis:b.disabled, copied:b.dataset.copied, svg:!!b.querySelector('svg'), junto:Math.abs(r.top-c.top)<8 && r.right<=c.left+1 } })()`);

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await abrir(topDeck, 'es');
  let e = await estado();
  check('hay un botón de copiar cuadrado de 44 px con icono, junto al de vaciar', e.w === 44 && e.h === 44 && e.svg && e.junto, e);
  check('tiene nombre accesible "Copiar lista" y no está desactivado', e.aria === 'Copiar lista' && e.title === 'Copiar lista' && e.dis === false, e);
  await ev(`window.__copiado = null; navigator.clipboard.writeText = function(t){ window.__copiado = t; return Promise.resolve(); }; document.getElementById('dvCopy').click(); 1`); await sleep(350);
  const txt = await ev(`window.__copiado`);
  const total = Object.values(topDeck).reduce((a, b) => a + b, 0);
  check('copia el nombre del mazo, cada carta con sus copias y el total', typeof txt === 'string' && txt.startsWith('Mi mazo de prueba\n') && /\n\d+x .+ \([A-Z]{2}\d+-\d+\)/.test(txt) && txt.trim().endsWith(`${total}/50`), txt && txt.slice(0, 120));
  check('copia todas las cartas distintas del mazo', (txt.match(/^\d+x /gm) || []).length === Object.keys(topDeck).length, (txt.match(/^\d+x /gm) || []).length);
  e = await estado();
  check('el botón avisa "¡Copiado!" y vuelve a su estado', e.copied === 'true' && e.aria === '¡Copiado!', e);
  await sleep(1700); e = await estado();
  check('pasado un momento vuelve a "Copiar lista"', e.copied === 'false' && e.aria === 'Copiar lista', e);
  await abrir({}, 'es');
  e = await estado();
  check('con el mazo vacío el botón está desactivado', e.dis === true, e);
  await abrir(topDeck, 'en');
  e = await estado();
  check('en inglés dice "Copy list"', e.aria === 'Copy list', e);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
