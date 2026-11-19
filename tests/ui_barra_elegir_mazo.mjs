// Barra «Ningún mazo seleccionado»: un buscador (como el de Mi colección) con la lista de tus mazos para elegir uno sin salir del catálogo, y «+ Nuevo mazo».
// Límites: 30 s por orden y 4 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_barra_elegir_mazo.mjs
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (4 min) en: ' + paso); process.exit(3); }, 240000);
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
await send('Emulation.setFocusEmulationEnabled', { enabled: true });   // Chrome sin ventana: sin esto no se disparan los eventos «focus»

const MAZOS = { d1: { name: 'Mazo cincuenta', cards: { 'GD01-001': 4, 'GD01-002': 4 }, updatedAt: 1700000000000 }, d2: { name: 'Azul rápido', cards: { 'GD01-003': 2, 'GD01-002': 1 }, updatedAt: 1700000001000 } };
async function abrir(W, H, decks) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es');
    ${decks ? `localStorage.setItem('msa_decks', ${JSON.stringify(JSON.stringify(decks))});` : ''} 1`);
  await send('Page.reload'); await sleep(3800);
}
// estado del buscador y de su lista
const barra = () => ev(`(function(){ var i = document.getElementById('bbPick'), l = document.getElementById('bbPickList'), w = document.getElementById('bbPickWrap');
  var vis = function(e){ if(!e) return false; var r = e.getBoundingClientRect(), cs = getComputedStyle(e); return !e.hidden && cs.display !== 'none' && r.width > 0 && r.height > 0; };
  var ri = i ? i.getBoundingClientRect() : null, rb = document.getElementById('buildBar').getBoundingClientRect();
  return { campo: vis(i), lista: vis(l), ph: i ? i.placeholder : null, rol: i ? i.getAttribute('role') : null, aria: i ? i.getAttribute('aria-label') : null, expandido: i ? i.getAttribute('aria-expanded') : null, alto: ri ? Math.round(ri.height) : 0, dentro: ri ? (ri.left >= rb.left - 1 && ri.right <= rb.right + 1) : null,
    filas: l ? Array.prototype.map.call(l.querySelectorAll('[role=option]'), function(o){ return o.textContent.replace(/\\s+/g,' ').trim() + '|' + o.dataset.id; }) : null, sinRes: !!(l && l.querySelector('.bb-none')),
    nombre: document.getElementById('bbName').textContent, cuenta: document.getElementById('bbCount').textContent, hint: vis(document.getElementById('bbHint')) }; })()`);
const abrirLista = async () => { await ev(`document.getElementById('bbPick').focus(); 1`); await sleep(300); };
const escribir = async (txt) => { await ev(`(function(){ var i = document.getElementById('bbPick'); i.focus(); i.value = ${JSON.stringify(txt)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`); await sleep(250); };
const tecla = async (key) => { await ev(`document.getElementById('bbPick').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true })); 1`); await sleep(250); };
const clicFila = async (valor) => { await ev(`(function(){ var o = document.querySelector('#bbPickList [data-id=${JSON.stringify(valor)}]'); o.click(); return 1; })()`); await sleep(900); };

for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H, MAZOS);
  let b = await barra();
  check('sin mazo seleccionado, la barra trae un buscador de mazos («Buscar mi mazo…») y el mensaje', b.campo === true && b.ph === 'Buscar mi mazo…' && b.nombre === 'Ningún mazo seleccionado' && b.hint === true, b);
  check('el buscador es un combobox con nombre accesible, mide ≥ 44 px y cabe en la barra; la lista empieza cerrada', b.rol === 'combobox' && !!b.aria && b.alto >= 44 && b.dentro === true && b.lista === false && b.expandido === 'false', b);

  await abrirLista(); b = await barra();
  check('al enfocarlo se abre la lista con tus mazos (con su recuento) y «+ Nuevo mazo»', b.lista === true && b.expandido === 'true' && JSON.stringify(b.filas) === JSON.stringify(['Mazo cincuenta 8/50|d1', 'Azul rápido 3/50|d2', '+ Nuevo mazo|__new']), b);
  check('la lupa queda dentro del campo (no se desplaza al abrir la lista)', (await ev(`(function(){ var a = document.querySelector('#bbPickWrap .cs-ico').getBoundingClientRect(), i = document.getElementById('bbPick').getBoundingClientRect(); return a.top >= i.top && a.bottom <= i.bottom; })()`)) === true);
  check('sin desbordamiento horizontal', (await ev('document.documentElement.scrollWidth <= innerWidth + 1')) === true);
  const filaAlto = await ev(`Math.min.apply(null, Array.prototype.map.call(document.querySelectorAll('#bbPickList [role=option]'), function(o){ return o.getBoundingClientRect().height; }))`);
  check('cada fila mide ≥ 44 px', filaAlto >= 44, filaAlto);
  const claro = await ev(`(function(){ var c = getComputedStyle(document.getElementById('bbPick')).color.match(/[0-9.]+/g).map(Number), f = function(v){ v/=255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }; var L = .2126*f(c[0]) + .7152*f(c[1]) + .0722*f(c[2]); return (L + .05) / (0.0165 + .05); })()`);
  check('el texto escrito se lee sobre el fondo navy (contraste ≥ 4,5 : 1)', claro >= 4.5, claro);

  await escribir('AZUL'); b = await barra();
  check('al escribir se filtra por nombre sin importar mayúsculas', JSON.stringify(b.filas) === JSON.stringify(['Azul rápido 3/50|d2', '+ Nuevo mazo|__new']), b.filas);
  await escribir('rapido'); b = await barra();
  check('…ni tildes («rapido» encuentra «Azul rápido»)', b.filas[0] === 'Azul rápido 3/50|d2', b.filas);
  await escribir('zzz'); b = await barra();
  check('sin coincidencias dice «Sin resultados» y deja «+ Nuevo mazo»', b.sinRes === true && JSON.stringify(b.filas) === JSON.stringify(['+ Nuevo mazo|__new']), b);

  await escribir('cinc'); await clicFila('d1'); b = await barra();
  check('elegir un mazo lo selecciona: la barra muestra su nombre y recuento y el buscador desaparece', b.nombre === 'Mazo cincuenta' && b.cuenta === '8' && b.campo === false, b);
  check('la elección no toca los mazos guardados', JSON.stringify(await ev(`JSON.parse(localStorage.getItem('msa_decks'))`)) === JSON.stringify(MAZOS));

  await send('Page.reload'); await sleep(3800); b = await barra();
  check('al recargar vuelve a no haber ninguno seleccionado y el buscador está otra vez', b.nombre === 'Ningún mazo seleccionado' && b.campo === true && b.lista === false, b);

  await abrirLista(); await tecla('ArrowDown'); await tecla('ArrowDown'); await tecla('Enter'); b = await barra();
  check('con teclado: ↓ ↓ y Intro eligen el segundo mazo', b.nombre === 'Azul rápido' && b.campo === false, b);

  await send('Page.reload'); await sleep(3800);
  await abrirLista(); await tecla('Escape'); b = await barra();
  check('Escape cierra la lista sin elegir nada', b.lista === false && b.nombre === 'Ningún mazo seleccionado', b);
  await escribir('azul'); await tecla('Enter'); b = await barra();
  check('con un solo resultado, Intro lo elige', b.nombre === 'Azul rápido', b);

  await send('Page.reload'); await sleep(3800);
  await abrirLista(); await clicFila('__new'); b = await barra(); const n = Object.keys(await ev(`JSON.parse(localStorage.getItem('msa_decks'))`)).length;
  check('«+ Nuevo mazo» crea un mazo y lo deja seleccionado', n === 3 && b.campo === false && b.nombre === 'Mazo 3', [n, b.nombre]);

  await abrir(W, H, null); await abrirLista(); b = await barra();
  check('sin mazos creados, la lista solo ofrece «+ Nuevo mazo»', b.campo === true && JSON.stringify(b.filas) === JSON.stringify(['+ Nuevo mazo|__new']), b);
}
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
