// Prueba de interfaz: jerarquía tipográfica. Títulos de sección = Big Shoulders Display (con cifras en Inter);
// cuerpo, nombres de mazos y de cartas = Inter, en minúsculas/mayúsculas tal como se escriben.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_typography.mjs
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

const fam = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var cs=getComputedStyle(e); return { fam:cs.fontFamily, peso:cs.fontWeight, mayus:cs.textTransform, px:parseFloat(cs.fontSize) } })()`);
const esInter = (r) => r && /^"?Inter"?,/.test(r.fam) && r.fam.indexOf('Big Shoulders') === -1 && r.mayus === 'none';
const esTitulo = (r) => r && r.fam.indexOf('Big Shoulders Display') !== -1 && /^"?Inter Digits"?,/.test(r.fam);

async function abrir(seed) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${seed} 1`);
  await send('Page.reload'); await sleep(3500);
}
const SEED = `localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'Zakus Control',cards:{'ST01-001':3,'ST01-005':2,'ST01-003':1}}})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1');`;

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await abrir(SEED);

  const cuerpo = await fam('body');
  check('el cuerpo de la app usa Inter', esInter({ ...cuerpo, mayus: 'none' }), cuerpo);
  check('el título de la página principal sigue en Big Shoulders con cifras Inter', esTitulo(await fam('.pageTitle h1')), await fam('.pageTitle h1'));
  const bb = await fam('#bbName');
  check('el nombre del mazo en construcción usa Inter, en negrita y tal como se escribe', esInter(bb) && +bb.peso >= 600, bb);
  const fuentes = await ev(`Promise.all([document.fonts.load('400 16px Inter', 'Guncannon áéíóú ñ ¿'), document.fonts.load('700 16px Inter', 'Zakus')]).then(function(){ return { texto:document.fonts.check('400 16px Inter','Guncannon áéíóú'), negrita:document.fonts.check('700 16px Inter','Zakus'), cifras:document.fonts.check('700 16px "Inter Digits"','0123456789') } })`);
  check('Inter carga (texto, negrita y cifras)', fuentes.texto && fuentes.negrita && fuentes.cifras, fuentes);
  const enlaces = await ev(`[].map.call(document.querySelectorAll('link[href*="fonts.googleapis"]'),function(l){return l.href}).join(' ')`);
  check('ya no se pide Zen Kaku Gothic New', enlaces.indexOf('Zen+Kaku') === -1, enlaces);
  check('Big Shoulders Display sigue cargándose para los títulos', enlaces.indexOf('Big+Shoulders') !== -1, enlaces);
  check('los archivos de Inter existen en el proyecto', (await ev(`Promise.all(['inter-latin','inter-latin-ext','inter-greek'].map(function(n){ return fetch('/assets/fonts/'+n+'.woff2').then(function(r){ return r.status }) }))`)).every((c) => c === 200));

  // ficha de carta: nombre de la carta
  await ev(`document.querySelector('.dz-inner').click(); 1`); await sleep(1200);
  const dn = await fam('.d-name');
  check('el nombre de la carta en la ficha usa Inter', esInter(dn) && +dn.peso >= 600, dn);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); 1`); await sleep(500);

  // ventana del mazo
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(1000);
  const dv = await fam('.dv-name'), dk = await fam('#dvName');
  check('los nombres de carta en la lista del mazo usan Inter', esInter(dv), dv);
  check('el nombre del mazo (campo editable) usa Inter en negrita', esInter(dk) && +dk.peso >= 600, dk);
  const cn = await fam('.dv-cname');
  check('el título "Unidades" de cada segmento es un título de sección en Inter 700 (sistema tipográfico)', esInter(cn) && +cn.peso === 700 && cn.px >= 20 && cn.px <= 24, cn);

  // Mis mazos
  await ev(`document.getElementById('dvBack').click(); 1`); await sleep(400);
  await ev(`document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}').click(); 1`); await sleep(900);
  const dd = await fam('.dp-deck-name');
  check('el nombre del mazo en Mis mazos usa Inter', esInter(dd) && +dd.peso >= 600, dd);
  check('el título "MIS MAZOS" sigue como título', esTitulo(await fam('#lblDpTitle')), await fam('#lblDpTitle'));
  await ev(`document.querySelector('#dpGrid .dp-deck').click(); 1`); await sleep(900);
  const dp = await fam('#dpName');
  check('el nombre del mazo abierto (campo editable) usa Inter', esInter(dp) && +dp.peso >= 600, dp);

  // Competición > Listas: nombre del arquetipo y texto de apoyo
  await send('Page.navigate', { url: 'http://localhost:8766/#competicion' }); await sleep(400); await send('Page.reload'); await sleep(4500);
  const nm = await fam('.dl-deck .dl-name'), nota = await fam('.comp-note');
  check('el nombre del arquetipo en Listas usa Inter', esInter(nm) && +nm.peso >= 600, nm);
  check('las notas de apoyo usan Inter', esInter(nota), nota);
  check('el título "COMPETICIÓN" sigue como título', esTitulo(await fam('#compTitle')), await fam('#compTitle'));
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
