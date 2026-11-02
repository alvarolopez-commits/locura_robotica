// Mis mazos: cada mazo se puede marcar "para copiar" o no, y "Copiar mazos" copia solo los marcados. No toca los mazos.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_deck_copysel.mjs
import fs from 'node:fs';
const decklists = JSON.parse(fs.readFileSync(new URL('../data/decklists.json', import.meta.url), 'utf8'));
const decks = decklists.archetypes[0].decks.slice(0, 3).map((d) => d.cards);
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
const DECKS = { d1: { name: 'Mazo Alfa', cards: decks[0], updatedAt: 3000 }, d2: { name: 'Mazo Beta', cards: decks[1], updatedAt: 2000 }, d3: { name: 'Mazo Gamma', cards: decks[2], updatedAt: 1000 } };
async function abrir(W, lang, keep) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  if (!keep) {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
    await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
    await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); localStorage.setItem('msa_decks', JSON.stringify(${JSON.stringify(DECKS)})); localStorage.setItem('msa_active_deck','d1'); localStorage.removeItem('msa_copy_excl'); 1`);
  }
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(300); await send('Page.reload'); await sleep(3500);
  await ev(`document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}').click(); 1`); await sleep(900);
}
const tiles = () => ev(`Array.from(document.querySelectorAll('#dpGrid .dp-deck')).map(function(d){ var b=d.querySelector('.dp-copysel'); return { name:d.querySelector('.dp-deck-name').textContent.replace('★',''), on:b.getAttribute('aria-pressed'), h:Math.round(b.getBoundingClientRect().height), txt:b.textContent.trim() } })`);
const btn = () => ev(`(function(){ var b=document.getElementById('dpCopySel'); return { txt:b.textContent.trim(), dis:b.disabled } })()`);
const copiar = async () => { await ev(`window.__c=null; navigator.clipboard.writeText=function(t){ window.__c=t; return Promise.resolve() }; document.getElementById('dpCopySel').click(); 1`); await sleep(300); return ev(`window.__c`); };

for (const W of [1280, 390]) {
  console.log('\n== ancho ' + W + ' ==');
  await abrir(W, 'es');
  let ts = await tiles();
  check('cada mazo tiene su botón "Para copiar" y empiezan todos marcados', ts.length === 3 && ts.every((x) => x.on === 'true' && /Para copiar/.test(x.txt) && x.h >= 34), ts);
  check('el botón general dice "Copiar mazos (3)"', (await btn()).txt === 'Copiar mazos (3)', await btn());
  const antes = await ev(`localStorage.getItem('msa_decks')`);
  let c = await copiar();
  check('copia los tres mazos con su nombre, sus cartas y el total, separados', /Mazo Alfa/.test(c) && /Mazo Beta/.test(c) && /Mazo Gamma/.test(c) && (c.match(/----------------/g) || []).length === 2 && /\d+x .+ \([A-Z]{2}\d+-\d+\)/.test(c) && c.indexOf('Mazo Alfa') < c.indexOf('Mazo Beta'), c.slice(0, 120));
  // desmarcar el segundo
  await ev(`document.querySelectorAll('#dpGrid .dp-deck .dp-copysel')[1].click(); 1`); await sleep(300);
  ts = await tiles();
  check('desmarcar un mazo lo deja sin marcar y NO abre su detalle', ts.filter((x) => x.on === 'false').length === 1 && await ev(`document.getElementById('dpDetail').hidden`), ts.map((x) => x.on));
  check('el botón general baja a "Copiar mazos (2)"', (await btn()).txt === 'Copiar mazos (2)', await btn());
  c = await copiar();
  check('al copiar, el desmarcado no sale y los otros sí', /Mazo Alfa/.test(c) && /Mazo Gamma/.test(c) && !/Mazo Beta/.test(c) && (c.match(/----------------/g) || []).length === 1, c.slice(0, 100));
  check('marcar o desmarcar no cambia los mazos ni sus cartas', (await ev(`localStorage.getItem('msa_decks')`)) === antes);
  check('la elección se guarda en este dispositivo', JSON.stringify(JSON.parse(await ev(`localStorage.getItem('msa_copy_excl')`))) === JSON.stringify(['d2']));
  await abrir(W, 'es', true);
  ts = await tiles();
  check('y se mantiene al recargar', ts.length === 3 && ts.filter((x) => x.on === 'false').length === 1 && (await btn()).txt === 'Copiar mazos (2)', ts.map((x) => x.on));
  // todos / ninguno
  await ev(`document.getElementById('dpSelNone').click(); 1`); await sleep(300);
  check('"Ninguno" desmarca todos y desactiva el botón de copiar', (await tiles()).every((x) => x.on === 'false') && (await btn()).dis === true && (await btn()).txt === 'Copiar mazos', await btn());
  await ev(`document.getElementById('dpSelAll').click(); 1`); await sleep(300);
  check('"Todos" los marca otra vez', (await tiles()).every((x) => x.on === 'true') && (await btn()).txt === 'Copiar mazos (3)');
  // un mazo nuevo entra marcado
  await ev(`document.querySelector('#dpGrid .dp-new').click(); 1`); await sleep(900);
  await ev(`document.getElementById('dpBack').click(); 1`); await sleep(700);
  ts = await tiles();
  check('un mazo nuevo aparece marcado por defecto', ts.length === 4 && ts.every((x) => x.on === 'true') && (await btn()).txt === 'Copiar mazos (4)', ts.map((x) => x.on));
  // en inglés
  await abrir(W, 'en');
  check('en inglés: "To copy" y "Copy decks (3)"', (await tiles())[0].txt === 'To copy' && (await btn()).txt === 'Copy decks (3)', [await tiles(), await btn()]);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
