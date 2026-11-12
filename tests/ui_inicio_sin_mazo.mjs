// Inicio sin mazo seleccionado: al abrir o recargar nunca hay un mazo activo; elegirlo es explícito; los mazos y la colección no se tocan.
// Límites: 30 s por orden y 5 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_inicio_sin_mazo.mjs
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (5 min) en: ' + paso); process.exit(3); }, 300000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const deck50 = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')).archetypes[0].decks[0].cards;
const KS = Object.keys(deck50), K0 = KS[0], K1 = KS[1], Q0 = deck50[K0];
const OTRA = KS.find((k) => !(k in { [K0]: 1 })) && 'GD01-001';   // una carta que el segundo mazo usa y el primero (probablemente) no
const MAZOS = { d1: { name: 'Mazo cincuenta', cards: deck50, updatedAt: 1700000000000 }, d2: { name: 'Mazo corto', cards: { [K1]: 2, 'GD01-002': 1 }, updatedAt: 1700000001000 } };
const COLECCION = { [K0]: 2, 'GD01-005': 1 };
let nav = 0;
async function abrir(W, H, { decks = MAZOS, lang = 'es', stale = true } = {}) {
  paso = 'abrir ' + W;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}');
    ${decks ? `localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(decks))});` : ''} localStorage.setItem('msa_collection', ${JSON.stringify(JSON.stringify(COLECCION))});
    ${stale ? "localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_building','1');" : ''} 1`);
  await send('Page.reload'); await sleep(3800);
}
const recargar = async () => { await send('Page.reload'); await sleep(3800); };
const barra = () => ev(`(function(){ var b=document.getElementById('buildBar'), v=function(id){ var e=document.getElementById(id); if(!e) return false; var r=e.getBoundingClientRect(); var cs=getComputedStyle(e); return !e.hidden && cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0; };
  return { visible: v('buildBar'), nombre: (document.getElementById('bbName')||{}).textContent, nombreOff: (document.getElementById('bbName')||{}).disabled, pista: v('bbHint') ? document.getElementById('bbHint').textContent : null,
    contador: v('bbCount'), estado: v('lblBuilding'), comparar: v('bbCompare'), pastilla: v('deckCount'), pastillaTxt: (document.getElementById('deckPillCount')||{}).textContent, bbCount: (document.getElementById('bbCount')||{}).textContent,
    anadir: v('btnAddDeck'), verMazos: v('btnMyDecks'), construyendo: document.body.classList.contains('is-building') }; })()`);
const mazos = () => ev(`JSON.parse(localStorage.getItem('msa_decks') || '{}')`);
const activoGuardado = () => ev(`localStorage.getItem('msa_active_deck')`);
const buscar = async (code) => { await ev(`(function(){ var i=document.getElementById('searchMain'); i.value=${JSON.stringify(code)}; i.dispatchEvent(new Event('input',{bubbles:true})); return 1 })()`); await sleep(900); };
const adder = (code) => ev(`(function(){ var a=document.querySelector('.adder[data-number="${code}"]'); if(!a) return null; var r=a.getBoundingClientRect(); return { n:a.querySelector('.ad-n').textContent, plusOff:a.querySelector('.ad-plus').disabled, minusOff:a.querySelector('.ad-minus').disabled, visible:r.width>0&&r.height>0 } })()`);
const tengo = async (code) => { await buscar(code); return ev(`(function(){ var a=document.querySelector('.adder[data-number="${code}"]'); if(!a) return null; var h=a.parentElement; while(h && !h.querySelector('.coll-tag')) h=h.parentElement; if(!h) return null; var n=h.querySelectorAll('.adder').length; var tg=h.querySelector('.coll-tag'); return n===1 ? !tg.hidden : null })()`); };
const hs = () => ev('document.documentElement.scrollWidth <= innerWidth + 1');
const elegirPorMisMazos = async (nombre) => {
  await ev(`document.getElementById('btnMyDecks').click(); 1`); await sleep(900);
  await ev(`(function(){ var t=Array.from(document.querySelectorAll('.dp-deck')).find(function(x){ return x.textContent.indexOf(${JSON.stringify(nombre)})>=0 }); t.click(); return 1 })()`); await sleep(900);
  await ev(`document.getElementById('dpAddCards').click(); 1`); await sleep(1100);
};

for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  const inicial = JSON.stringify(MAZOS);
  await abrir(W, H);
  let b = await barra();
  check('con varios mazos guardados NO hay ninguno seleccionado (aunque la clave antigua dijera d1)', b.visible && b.nombre === 'Ningún mazo seleccionado', b);
  check('mensaje secundario «Selecciona un mazo para empezar a editar»', b.pista === 'Selecciona un mazo para empezar a editar', b);
  check('sin selección se ocultan contador, estado, «Comparar» y la píldora superior', !b.contador && !b.estado && !b.comparar && !b.pastilla, b);
  check('«Añadir mazo» y «Ver mis mazos» siguen visibles', b.anadir && b.verMazos, b);
  check('el nombre no es pulsable sin mazo', b.nombreOff === true, b);
  const n0 = await ev(`document.querySelectorAll('.adder').length`);
  check('el catálogo se muestra normal (con tarjetas y selectores)', n0 > 10, n0);
  const sel0 = await ev(`Array.from(document.querySelectorAll('.adder')).slice(0, 12).every(function(a){ return a.querySelector('.ad-n').textContent === '0' && a.querySelector('.ad-plus').disabled && a.querySelector('.ad-minus').disabled })`);
  check('todas las cantidades salen a 0 y los botones + y − están deshabilitados', sel0 === true, sel0);
  check('la inicialización no sobrescribe ningún mazo', JSON.stringify(await mazos()) === inicial);
  check('no se guarda ninguna selección activa', (await activoGuardado()) === null, await activoGuardado());
  await buscar(K0);
  let a = await adder(K0);
  check('con la carta del mazo buscada: sigue en 0 y deshabilitada', a && a.n === '0' && a.plusOff && a.minusOff, a);
  const tg0 = await tengo(K0);
  check('la etiqueta TENGO aparece sin mazo seleccionado (carta de la colección)', tg0 === true, tg0);
  await buscar(K0);
  check('sin desbordamiento horizontal', await hs());

  // sin selección, la ficha tampoco elige un mazo por su cuenta
  await ev(`(function(){ var c=document.querySelector('.adder[data-number="${K0}"]'); var t=c.closest('.card, .cc, article, li, [role=button], div'); (document.querySelector('[data-open="${K0}"]')||c.parentElement.parentElement).click(); return 1 })()`); await sleep(900);
  const ficha = await ev(`(function(){ var s=document.querySelector('.d-deckline .dl-sel'); var p=document.querySelector('.d-ctl .dc-btn'); return s ? { valor:s.value, texto:s.options[s.selectedIndex].textContent, mas:p ? p.disabled : null } : null })()`);
  check('ficha de carta sin mazo: el selector muestra «Selecciona un mazo» y el + está deshabilitado', !!ficha && ficha.valor === '' && ficha.texto === 'Selecciona un mazo' && ficha.mas === true, ficha);
  await ev(`(function(){ var c=document.getElementById('overlay'); var x=document.querySelector('#overlay .close, #overlay [data-close], #closeBtn'); if(x) x.click(); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); return 1 })()`); await sleep(500);

  // elegir un mazo de 50: 50/50 y sus cantidades
  await elegirPorMisMazos('Mazo cincuenta');
  b = await barra();
  check('al elegirlo aparece su nombre, el contador 50/50, el estado y «Comparar»', b.nombre === 'Mazo cincuenta' && b.bbCount === '50' && b.contador && b.estado && b.pastilla && b.pastillaTxt === '50 / 50', b);
  check('«Comparar» disponible con 50 cartas', b.comparar === true, b);
  check('el nombre vuelve a ser pulsable y la pista desaparece', b.nombreOff === false && b.pista === null, b);
  await buscar(K0); a = await adder(K0);
  check('cantidad correcta de la carta del mazo (' + Q0 + ')', a && a.n === String(Q0), a);
  check('la etiqueta TENGO no cambia al elegir mazo', (await tengo(K0)) === tg0);
  const sinTengo = await tengo('GD01-001');
  check('una carta que no tengo sigue sin etiqueta (y su tarjeta existe)', sinTengo === false, sinTengo);
  check('mazo lleno (50): el + queda deshabilitado en una carta no usada', await ev(`(function(){ var a=Array.from(document.querySelectorAll('.adder')).find(function(x){ return x.querySelector('.ad-n').textContent==='0' }); return !!a && a.querySelector('.ad-plus').disabled })()`));

  // editar: quitar una copia y comprobar que se guarda
  await buscar(K0);
  await ev(`document.querySelector('.adder[data-number="${K0}"] .ad-minus').click(); 1`); await sleep(500);
  let d = await mazos();
  check('editarlo guarda el cambio (49 cartas)', d.d1.cards[K0] === Q0 - 1 && Object.values(d.d1.cards).reduce((x, y) => x + y, 0) === 49, d.d1 && d.d1.cards[K0]);
  b = await barra();
  check('el contador baja a 49 y «Comparar» se oculta', b.bbCount === '49' && !b.comparar, b);
  check('el resto de mazos no se toca', JSON.stringify(d.d2) === JSON.stringify(MAZOS.d2));

  // recargar: los cambios permanecen, pero no hay mazo activo
  await recargar();
  b = await barra();
  check('tras recargar vuelve «Ningún mazo seleccionado»', b.nombre === 'Ningún mazo seleccionado' && !b.pastilla && !b.comparar, b);
  const trasRecarga = await mazos();
  check('tras recargar los cambios permanecen guardados (49 cartas) y los demás mazos siguen igual', trasRecarga.d1.cards[K0] === Q0 - 1 && JSON.stringify(trasRecarga.d2) === JSON.stringify(MAZOS.d2) && Object.keys(trasRecarga).length === 2);
  check('tras recargar no se guarda ninguna selección', (await activoGuardado()) === null);

  // otro mazo
  await elegirPorMisMazos('Mazo corto');
  b = await barra();
  check('elegir otro mazo cambia solo el activo (nombre, contador 3)', b.nombre === 'Mazo corto' && b.bbCount === '3', b);
  await buscar(K1); a = await adder(K1);
  check('sus cantidades son correctas (' + MAZOS.d2.cards[K1] + ')', a && a.n === String(MAZOS.d2.cards[K1]), a);
  await buscar(K0); a = await adder(K0);
  check('las cantidades del otro mazo ya no aparecen (0)', a && a.n === '0', a);
  const fin = await mazos();
  check('al cambiar de mazo se conservan los datos de los demás', fin.d1.cards[K0] === Q0 - 1 && JSON.stringify(fin.d2) === JSON.stringify(MAZOS.d2));
  check('la etiqueta TENGO sigue igual con el otro mazo', (await tengo(K0)) === tg0);
  await recargar();
  check('de nuevo recargando, ninguno seleccionado', (await barra()).nombre === 'Ningún mazo seleccionado');
  check('sin desbordamiento horizontal al final', await hs());
}

console.log('\n== sin mazos guardados ==');
await abrir(390, 844, { decks: null });
let b = await barra();
check('sin mazos: no se crea ni se selecciona ninguno', b.nombre === 'Ningún mazo seleccionado' && JSON.stringify(await mazos()) === '{}', { b, d: await mazos() });
await ev(`document.getElementById('btnAddDeck').click(); 1`); await sleep(700);
await ev(`(function(){ var i=document.getElementById('newDeckName'); i.value='Mi primer mazo'; document.getElementById('addDeckForm').requestSubmit(); return 1 })()`); await sleep(1200);
b = await barra(); const dd = await mazos();
check('«Añadir mazo» crea y selecciona el nuevo', b.nombre === 'Mi primer mazo' && Object.keys(dd).length === 1, { b, n: Object.keys(dd).length });
await recargar();
check('recargar: el mazo creado se conserva y no queda seleccionado', (await barra()).nombre === 'Ningún mazo seleccionado' && Object.keys(await mazos()).length === 1);

console.log('\n== inglés ==');
await abrir(390, 844, { lang: 'en' });
b = await barra();
check('textos en inglés', b.nombre === 'No deck selected' && b.pista === 'Select a deck to start editing', b);

check('sin errores de JavaScript en toda la prueba', errs.length === 0, errs.slice(0, 3));
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
