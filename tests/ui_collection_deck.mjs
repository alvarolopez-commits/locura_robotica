// Prueba de interfaz: aviso "No la tengo" en las listas de mazo (ventana del mazo y detalle de Mis mazos).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_collection_deck.mjs
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

const DECK = { 'ST01-001': 3, 'ST01-005': 2, 'ST01-003': 1 };
async function load(collection) {
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Prueba',cards:${JSON.stringify(DECK)}}})); localStorage.setItem('msa_active_deck','d1');
    ${collection ? `localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(collection))});` : `localStorage.removeItem('msa_collection');`} 1`);
  await send('Page.reload'); await sleep(3200);
}
const rows = (root) => ev(`(function(){ var r=[].slice.call(document.querySelectorAll('${root} .dv-row')); return r.map(function(x){ var m=x.querySelector('.coll-miss'); var th=x.querySelector('.dv-thumb');
  return { num:(x.querySelector('.dv-meta')||{}).textContent.split(' · ')[0], falta:x.classList.contains('is-missing'), aviso:m&&m.textContent.trim(), color:m&&getComputedStyle(m).color, opacidadMiniatura:th&&getComputedStyle(th).opacity } }) })()`);
const banner = (root) => ev(`(function(){ var b=document.querySelector('${root} .coll-banner'); if(!b) return null; var cs=getComputedStyle(b.querySelector('summary'));
  return { texto:b.querySelector('summary').textContent.replace(/\\s+/g,' ').trim(), items:[].map.call(b.querySelectorAll('li'),function(l){return l.textContent.replace(/\\s+/g,' ').trim()}), color:cs.color, primero:b===b.parentNode.firstElementChild } })()`);
const legal = () => ev(`(function(){ var b=document.getElementById('dvLegal'); return b.hidden + '|' + b.textContent.trim() })()`);

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });

  await load(null);
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(900);
  let r = await rows('#deckView');
  const legalSin = await legal();
  check('sin colección no hay filas atenuadas ni avisos', r.length === 3 && r.every((x) => !x.falta && !x.aviso), r);
  check('sin colección no hay aviso superior', (await banner('#deckView')) === null);

  await load(['ST01-001']);
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(900);
  r = await rows('#deckView');
  const faltan = r.filter((x) => x.falta);
  check('con colección, las 2 cartas que no tengo salen como "No la tengo"', faltan.length === 2 && faltan.every((x) => x.aviso === 'No la tengo'), r);
  check('el aviso es #d86565', faltan.length === 2 && faltan.every((x) => x.color === 'rgb(216, 101, 101)'), faltan);
  check('la carta que tengo no se atenúa', r.filter((x) => !x.falta).length === 1 && r.filter((x) => !x.falta)[0].num === 'ST01-001' && parseFloat(r.find((x) => !x.falta).opacidadMiniatura) === 1, r);
  check('las otras sí se atenúan', faltan.length === 2 && faltan.every((x) => parseFloat(x.opacidadMiniatura) < 1), faltan);
  let bn = await banner('#deckView');
  check('aviso superior "Te faltan 2 cartas" y es lo primero del mazo', bn && bn.texto === 'Te faltan 2 cartas de este mazo' && bn.primero === true, bn);
  check('la lista nombra las 2 cartas que faltan con su número', bn && bn.items.length === 2 && bn.items.some((i) => /ST01-003/.test(i)) && bn.items.some((i) => /ST01-005/.test(i)), bn);
  check('el aviso superior usa #d86565', bn && bn.color === 'rgb(216, 101, 101)', bn);
  check('tener o no tener cartas no cambia la legalidad del mazo', (await legal()) === legalSin, [legalSin, await legal()]);

  // añadir a la colección desde el catálogo repinta el mazo abierto, sin recargar
  await ev(`document.querySelector('.coll-row[data-number="ST01-005"] .coll-add').click(); 1`); await sleep(500);
  r = await rows('#deckView');
  check('al añadir una carta a la colección, su fila deja de estar atenuada sin recargar', r.filter((x) => x.falta).length === 1, r);
  bn = await banner('#deckView');
  check('el aviso se actualiza a "Te falta 1 carta" sin recargar', bn && bn.texto === 'Te falta 1 carta de este mazo' && bn.items.length === 1, bn);

  // detalle de Mis mazos
  await ev(`document.getElementById('dvBack').click(); 1`); await sleep(500);
  await ev(`document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}').click(); 1`); await sleep(800);
  await ev(`document.querySelector('#dpGrid .dp-deck').click(); 1`); await sleep(900);
  r = await rows('#dpRows');
  bn = await banner('#dpRows');
  check('el detalle de Mis mazos también tiene el aviso superior', bn && bn.texto === 'Te falta 1 carta de este mazo', bn);
  check('el detalle de Mis mazos también avisa', r.length === 3 && r.filter((x) => x.falta).length === 1 && r.find((x) => x.falta).aviso === 'No la tengo', r);

  // quitar la última carta de la colección: desaparecen avisos
  await ev(`['ST01-001','ST01-005'].forEach(function(n){ document.querySelector('.coll-row[data-number="'+n+'"] .coll-del').click(); }); 1`); await sleep(600);
  r = await rows('#dpRows');
  check('al vaciar la colección desaparece también el aviso superior', (await banner('#dpRows')) === null);
  check('al vaciar la colección desaparecen los avisos en el detalle', r.every((x) => !x.falta && !x.aviso), r);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
