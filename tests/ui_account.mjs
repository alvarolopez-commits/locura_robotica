// Prueba de interfaz: ventana "Tu cuenta" con sesión iniciada (Supabase simulado). Orden: avatares → sesión → Mi colección + sincronizar
// (cuadrado, solo icono) → Diagnóstico → Cerrar sesión abajo. Sin "Guardado" ni contraseña para entrar sin correo. Todo en Inter.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_account.mjs
import fs from 'node:fs';
const fake = fs.readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', { source: fake + `;
(function(){
  var S = FakeSupabase.makeServer(); window.__S = S; var session = null, listeners = [];
  Object.defineProperty(window, 'SUPABASE_CONFIG', { value: { url: 'https://fake.supabase.co', anonKey: 'fake' }, writable: false });
  window.supabase = { createClient: function(){
    var c = S.client('u1');
    c.auth = {
      getSession: function(){ return Promise.resolve({ data: { session: session } }); },
      onAuthStateChange: function(cb){ listeners.push(cb); return { data: { subscription: {} } }; },
      signInWithOtp: function(){ return Promise.resolve({ error: null }); },
      signInWithPassword: function(){ return Promise.resolve({ error: null }); },
      signOut: function(){ session = null; listeners.forEach(function(cb){ cb('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); }
    };
    return c;
  } };
  window.__login = function(){ session = { user: { id: 'u1', email: 'palspamquetevas@gmail.com' } }; listeners.forEach(function(cb){ cb('SIGNED_IN', session); }); };
})();` });

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_collection','["ST01-001","ST01-002","GD01-001"]'); localStorage.removeItem('msa_decks'); 1`);
  await send('Page.reload'); await sleep(3000);
  await ev(`window.__login(); 1`); await sleep(1500);
  await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(700);

  const est = await ev(`(function(){ var b=document.getElementById('accountBody'); var kids=[].map.call(b.children,function(c){ return c.className||c.tagName.toLowerCase() });
    var who=b.querySelector('.acc-who'), coll=b.querySelector('.acc-coll'), sync=b.querySelector('.acc-sync'), out=b.querySelector('.acc-out'), diag=b.querySelector('.acc-diag');
    var r=function(e){ return e? e.getBoundingClientRect() : null };
    var txt=b.innerText;
    return { hijos:kids, quien: who ? who.textContent.replace(/\\s+/g,' ').trim() : null, quienB: who && who.querySelector('b') ? who.querySelector('b').textContent : null,
      coll: coll ? { texto:coll.textContent.replace(/\\s+/g,' ').trim(), icono:!!coll.querySelector('.coll-ico'), alto:Math.round(r(coll).height) } : null,
      sync: sync ? { ancho:Math.round(r(sync).width), alto:Math.round(r(sync).height), texto:sync.textContent.trim(), aria:sync.getAttribute('aria-label'), svg:!!sync.querySelector('svg'), alLado: Math.abs(r(sync).top - r(coll).top) < 8 && r(sync).left >= r(coll).right - 1 } : null,
      salir: out ? { texto:out.textContent.trim(), ultimo: b.lastElementChild === out, ancho:Math.round(r(out).width), alto:Math.round(r(out).height) } : null,
      orden: [who,coll,diag,out].every(Boolean) && r(who).top < r(coll).top && r(coll).top < r(diag).top && r(diag).top < r(out).top,
      guardado:/Guardado|Guardando/.test(txt), contrasena:!!document.getElementById('accNewPw') || /sin correo/.test(txt),
      botonesSueltos:[].filter.call(b.querySelectorAll('button.dp-btn'),function(x){ return /Sincronizar ahora|Cerrar sesión/.test(x.textContent) }).length,
      fuentes:{ quien: who ? getComputedStyle(who.querySelector('b')).fontFamily : '', coll: coll ? getComputedStyle(coll).fontFamily : '', salir: out ? getComputedStyle(out).fontFamily : '', diag: diag ? getComputedStyle(diag.querySelector('summary')).fontFamily : '' },
      hScroll: document.getElementById('accountModal').scrollWidth - document.getElementById('accountModal').clientWidth } })()`);
  check('el correo se muestra como "Sesión iniciada como" + el correo', est.quien === 'Sesión iniciada como palspamquetevas@gmail.com' && est.quienB === 'palspamquetevas@gmail.com', est.quien);
  check('debajo hay un botón "Mi colección" con icono y el número de cartas', est.coll && /^Mi colección/.test(est.coll.texto) && /3$/.test(est.coll.texto) && est.coll.icono && est.coll.alto >= 48, est.coll);
  check('sincronizar es un botón cuadrado, pequeño, solo con icono, al lado de Mi colección', est.sync && est.sync.ancho === est.sync.alto && est.sync.ancho <= 56 && est.sync.texto === '' && est.sync.svg && est.sync.alLado === true, est.sync);
  check('el botón de sincronizar tiene nombre accesible', est.sync && /Sincronizar/.test(est.sync.aria), est.sync);
  check('ya no aparece "Guardado" ni la contraseña para entrar sin correo', est.guardado === false && est.contrasena === false, [est.guardado, est.contrasena]);
  check('no quedan los botones antiguos "Sincronizar ahora" y "Cerrar sesión" sueltos', est.botonesSueltos === 0, est.botonesSueltos);
  check('"Cerrar sesión" es un botón ancho, lo último de la ventana', est.salir && est.salir.texto === 'Cerrar sesión' && est.salir.ultimo === true && est.salir.alto >= 44, est.salir);
  check('el orden es: sesión → Mi colección → Diagnóstico → Cerrar sesión', est.orden === true, est.hijos);
  check('todo en Inter', Object.values(est.fuentes).every((f) => /^"?Inter"?,/.test(f)), est.fuentes);
  check('sin desborde horizontal en la ventana', est.hScroll === 0, est.hScroll);

  // Mi colección abre la pantalla
  await ev(`document.querySelector('#accountBody .acc-coll').click(); 1`); await sleep(900);
  check('"Mi colección" abre la pantalla de la colección', (await ev(`!document.getElementById('collPage').hidden`)) === true);

  // sincronizar y cerrar sesión
  await ev(`document.getElementById('collBack').click(); 1`); await sleep(500);
  await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(600);
  check('al pulsar sincronizar no hay errores', (await ev(`document.querySelector('#accountBody .acc-sync').click(); 1`)) === 1);
  await sleep(600);
  await ev(`document.querySelector('#accountBody .acc-out').click(); 1`); await sleep(1200);
  await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(700);
  const fuera = await ev(`({ correo:!!document.getElementById('accEmail'), coll:!!document.querySelector('#accountBody .acc-coll'), quien:!!document.querySelector('#accountBody .acc-who') })`);
  check('tras cerrar sesión vuelve el formulario de acceso, y Mi colección sigue disponible', fuera.correo && fuera.coll && !fuera.quien, fuera);
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
