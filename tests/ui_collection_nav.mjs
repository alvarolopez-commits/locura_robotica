// Prueba de interfaz: navegación de Mi colección (menú, barra de abajo y avatar).
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_collection_nav.mjs
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

async function load(lang) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); localStorage.removeItem('msa_collection'); 1`);
  await send('Page.reload'); await sleep(3200);
}
const collOpen = () => ev(`!document.getElementById('collPage').hidden`);
const active = () => ev(`[].filter.call(document.querySelectorAll('#tabbar .tb-item'),function(b){return b.classList.contains('is-active')}).map(function(b){return b.id})`);

for (const W of [320, 390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await load('es');

  // menú
  await ev(`document.getElementById('menuBtn').click(); 1`); await sleep(500);
  const menu = await ev(`[].map.call(document.querySelectorAll('#pillMenu .pm-item'),function(b){return b.textContent.trim()})`);
  check('el menú es: Nuevo mazo, Ver mis mazos, Mi colección, Competición (sin Iniciar sesión)', menu.join('|') === 'Nuevo mazo|Ver mis mazos|Mi colección|Competición', menu);
  await ev(`document.getElementById('pmCollection').click(); 1`); await sleep(800);
  check('"Mi colección" del menú abre la pantalla', (await collOpen()) === true);

  // barra de abajo (solo móvil)
  if (W < 900) {
    const tabs = await ev(`[].map.call(document.querySelectorAll('#tabbar .tb-item'),function(b){var r=b.getBoundingClientRect(); var s=b.querySelector('span:last-child'); return {id:b.id, texto:b.textContent.trim(), ancho:Math.round(r.width), alto:Math.round(r.height), desborda:s? s.scrollWidth>s.clientWidth+1 : false}})`);
    check('la barra tiene 5 pestañas y la última es "Colección"', tabs.length === 5 && tabs[4].id === 'tbCollection' && tabs[4].texto === 'Colección', tabs);
    check('ningún texto de la barra se corta', tabs.every((x) => !x.desborda), tabs);
    check('cada pestaña mide al menos 44 px de alto', tabs.every((x) => x.alto >= 44), tabs);
    const ico = await ev(`(function(){ var i=document.querySelector('#tbCollection .coll-ico'); if(!i) return null; var cs=getComputedStyle(i); return { mascara:(cs.webkitMaskImage||cs.maskImage||''), fondo:cs.backgroundColor, ancho:Math.round(i.getBoundingClientRect().width) } })()`);
    check('el icono es el PNG del usuario aplicado como máscara', ico && /tab-coleccion\.png/.test(ico.mascara) && ico.ancho >= 18, ico);
    const act = await active();
    check('con Mi colección abierta, la pestaña activa es Colección', act.join(',') === 'tbCollection', act);
    await ev(`document.getElementById('tbCatalog').click(); 1`); await sleep(800);
    check('pulsar Catálogo cierra Mi colección y activa Catálogo', (await collOpen()) === false && (await active()).join(',') === 'tbCatalog', [await collOpen(), await active()]);
    check('al cerrar, la dirección ya no queda en #coleccion', (await ev(`location.hash`)) === '', await ev(`location.hash`));
    await ev(`document.getElementById('tbCollection').click(); 1`); await sleep(800);
    check('la pestaña Colección abre la pantalla', (await collOpen()) === true);
    await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(800);
    check('pulsar Mazos cierra Mi colección', (await collOpen()) === false);
  }

  // avatar: es el acceso a la cuenta (inicio de sesión)
  await load('es');
  await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(600);
  check('el avatar abre la ventana de cuenta con el formulario de acceso', await ev(`!document.getElementById('accountModal').hidden && !!document.getElementById('accEmail')`));
  check('el icono existe en el servidor', (await ev(`fetch('/icons/tab-coleccion.png').then(function(r){return r.status})`)) === 200);

  // inglés
  if (W < 900) {
    await load('en');
    const en = await ev(`document.querySelector('#tbCollection').textContent.trim()`);
    check('en inglés la pestaña dice "Collection"', en === 'Collection', en);
  }
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
