// Prueba de interfaz: Competición, Fase 4 (favoritos, Para ti, novedades y lo que se puede construir). Colecciones y lotes de esta prueba son datos de prueba.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_comp_f4.mjs
// Límites: 30 s por orden al navegador y 5 min en total; si se atasca, para y dice dónde.
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (5 min) en: ' + paso); process.exit(3); }, 300000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r, no) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const real = JSON.parse(fs.readFileSync(new URL('./fixtures/comp_lote_inicial.json', import.meta.url), 'utf8'));
const dl = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8'));
let hookId = null;
async function abrir(W, H, { data, keep = false, store = {}, hash = '#competicion' } = {}) {
  paso = 'abrir ' + W + ' ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId });
  hookId = null;
  { const body = JSON.stringify(data || real); hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ var of = window.fetch; window.fetch = function(u){ if (String(u).indexOf('competition_events.json') >= 0) return Promise.resolve(new Response(${JSON.stringify(body)}, {status:200, headers:{'content-type':'application/json'}})); return of.apply(this, arguments); }; })();` })).result.identifier; }
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  if (!keep) await ev(`localStorage.clear(); 1`);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300);
  if (!keep) await ev(`localStorage.removeItem('msa_comp_seen'); 1`);   // el cambio de hash ya pinta la pantalla: la visita que cuenta es la de después de recargar
  await send('Page.reload'); await sleep(3600);
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const click = async (sel, w = 350) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); await sleep(w); return r; };
const setSel = async (i, v) => { await ev(`(function(){ var s=document.getElementById(${JSON.stringify(i)}); s.value=${JSON.stringify(String(v))}; s.dispatchEvent(new Event('change', {bubbles:true})) })()`); await sleep(300); };
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('compPage').scrollWidth <= document.getElementById('compPage').clientWidth + 1`);
const small = () => ev(`Array.from(document.querySelectorAll('#compPanel button, #compPanel select, #compPanel input, #compScope button, #compTabs button')).filter(function(e){ return e.offsetParent && !e.disabled }).map(function(e){ var r=e.getBoundingClientRect(); return { h:Math.round(r.height), w:Math.round(r.width), c:(e.id||e.className||'').slice(0,24) } }).filter(function(x){ return x.h < 44 })`);
const starMF = '.gd-star[data-fav="GD06|mobile fighter"][data-where="rank"]';
const favsLS = () => ev(`JSON.parse(localStorage.getItem('msa_comp_favs') || '[]').map(function(x){ return x.id })`);

console.log('\n== favoritos ==');
await abrir(390, 844);
check('sin favoritos: invitación discreta, sin tarjetas', /Toca la estrella/.test(await txt('.gd-invite')) && (await count('.gd-fav')) === 0);
check('cada fila del ranking tiene estrella accesible de 44 px sin marcar', (await count('.gd-rows .gd-star')) === 7 && (await ev(`document.querySelector('${starMF}').getAttribute('aria-pressed')`)) === 'false' && /Seguir arquetipo: Mobile Fighter/.test(await ev(`document.querySelector('${starMF}').getAttribute('aria-label')`)));
const hash0 = await ev(`location.hash`);
await click(starMF);
check('seguir: se ve al instante en Para ti con % y x/n', (await count('.gd-fav')) === 1 && /Mobile Fighter/.test(await txt('.gd-fav-name')) && /28,6 % · 16 de 56 listas/.test(await txt('.gd-fav-num')), await txt('.gd-fav'));
check('resultado destacado verificable', /Mejor resultado: 1\.º · カードラボ所沢店 · 3 nov 2026/.test(await txt('.gd-fav-best')), await txt('.gd-fav-best'));
check('la estrella queda marcada y no abre la ficha', (await ev(`document.querySelector('${starMF}').getAttribute('aria-pressed')`)) === 'true' && (await count('.gd-rows')) === 1);
check('el favorito no entra en la URL', (await ev(`location.hash`)) === hash0 && !/fav|mobile/i.test(await ev(`location.href`)));
await click('.gd-rows .gd-star[data-where="rank"]:not(.is-on)');
check('se guardan con id estable', (await favsLS()).includes('GD06|mobile fighter') && (await favsLS()).length === 2, await favsLS());
await abrir(390, 844, { keep: true });
check('tras recargar, los favoritos siguen', (await count('.gd-fav')) === 2 && (await count('.gd-rows .gd-star.is-on')) === 2);
await setSel('gdCountry', 'Japan');
await click('#gdMoreBtn'); await setSel('gdTop', 8);
check('Top 8 recalcula el favorito con su n (x de 40)', /de 40 listas/.test(await txt('.gd-fav-num')), await txt('.gd-fav-num'));
await ev(`(function(){ var i=document.getElementById('gdFrom'); i.value='2026-12-01'; i.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(300);
check('con filtros sin listas no enseña el bloque ni un 0 % falso', (await count('.gd-rows')) === 0 && !/NaN/.test(await txt('#compPanel')));
await click('#gdClear');
await click('.gd-fav-main');
check('el favorito abre su ficha, con estrella en cabecera marcada', (await count('.gd-metric')) === 1 && (await count('.gd-title .gd-star.is-on')) === 1);
await click('#gdBack', 450);
check('volver desde la ficha deja Para ti como estaba', (await count('.gd-fav')) === 2);
await click('#gdSeason-GD05', 1400);
check('en GD05 los favoritos de GD06 no se mezclan, no se borran y se avisa', (await count('.gd-fav')) === 0 && /2 favoritos en GD06/.test(await txt('.gd-fav-other')) && (await favsLS()).length === 2, await txt('.gd-fav-other'));
await click('.gd-rows .gd-star[data-where="rank"]');
check('un favorito de GD05 convive con los de GD06, con su evolución comparable', (await count('.gd-fav')) === 1 && (await favsLS()).length === 3 && /pts · GD04 → GD05/.test(await txt('.gd-fav')), await txt('.gd-fav'));
await click('.gd-fav-other', 500);
check('el aviso lleva a la temporada de esos favoritos', (await count('.gd-fav')) === 2);
await click('.gd-fav .gd-star');
check('dejar de seguir es inmediato y reversible', (await count('.gd-fav')) === 1 && (await favsLS()).length === 2);
await click('#gdFyToggle');
check('Para ti se puede plegar y lo recuerda', (await count('.gd-fav')) === 0 && (await ev(`document.getElementById('gdFyToggle').getAttribute('aria-expanded')`)) === 'false' && (await ev(`localStorage.getItem('msa_comp_foryou')`)) === '0');
await click('#gdFyToggle');
const estable = await ev(`(function(){ var s=document.querySelector('.gd-rows .gd-star:not(.is-on)'), a=s.getBoundingClientRect().top; s.click(); return new Promise(function(r){ setTimeout(function(){ var again=document.querySelector('.gd-star[data-fav="'+s.dataset.fav+'"][data-where="rank"]'); r(Math.abs(again.getBoundingClientRect().top - a)) }, 200) }) })()`);
check('seguir no mueve la estrella de debajo del dedo', estable <= 2, estable);
check('sin errores de consola', errs.length === 0, errs);

console.log('\n== novedades ==');
{
  const favs = JSON.stringify([{ id: 'GD06|mobile fighter', season: 'GD06', name: 'Mobile Fighter', addedAt: 1 }]);
  await abrir(390, 844, { store: { msa_comp_favs: favs } });
  check('primera visita: lo dice y no inventa novedades', /Primera visita/.test(await txt('.gd-news')) && (await count('.gd-newsbox')) === 0);
  await abrir(390, 844, { keep: true });
  check('segunda visita con los mismos datos: sin novedades', /Sin novedades/.test(await txt('.gd-news')) && (await count('.gd-newsbox')) === 0);
  const d2 = JSON.parse(JSON.stringify(real)); d2.updatedAt = '2026-11-10';
  d2.events.push({ id: 'prueba:nuevo', date: '2026-11-09', name: 'Torneo de prueba', venue: 'Sede de prueba', country: 'Japan', format: 'Standard', set: 'GD06', type: 'Otro', playersTotal: 32, listsPublished: 8, sources: [{ provider: 'prueba', id: 'nuevo', url: 'https://example.test/nuevo', primary: true }] });
  for (let i = 1; i <= 8; i++) d2.results.push({ id: 'prueba:nuevo:' + i, eventId: 'prueba:nuevo', placement: i, player: 'p' + i, archetype: 'Mobile Fighter', colors: ['Red', 'White'], set: 'GD06', country: 'Japan', sourceUrl: '', decklistUrl: null, cards: null });
  await abrir(390, 844, { keep: true, data: d2 });
  check('datos nuevos (de prueba): cuenta ids nuevos', /1 torneo y 8 resultados publicados nuevos/.test(await txt('.gd-news-t')), await txt('.gd-newsbox'));
  check('antes → ahora con n de cada foto y puntos', /n = 56 antes, n = 64 ahora/.test(await txt('.gd-newsbox')) && /Mobile Fighter: 28,6 % \(16\/56\) → 37,5 % \(24\/64\) · \+8,9 pts/.test(await txt('.gd-news-row')), await txt('.gd-news-row'));
  await click('#gdMoreBtn'); await setSel('gdTop', 8);
  check('otros filtros son otro contexto: no compara', /Primera visita/.test(await txt('.gd-news')) && (await count('.gd-newsbox')) === 0);
  await setSel('gdTop', 0);
  check('al volver al contexto, la novedad sigue hasta marcarla', (await count('.gd-newsbox')) === 1);
  await click('#gdSeen');
  check('"Marcar como visto" la retira', (await count('.gd-newsbox')) === 0 && /Sin novedades/.test(await txt('.gd-news')));
  await abrir(390, 844, { keep: true, data: d2 });
  check('y sigue retirada tras recargar', (await count('.gd-newsbox')) === 0);
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n== construibles (colecciones de prueba) ==');
{
  const deck = dl.archetypes[0].decks[0].cards, arch0 = dl.archetypes[0].name;
  await abrir(390, 844);
  check('GD06 sin listas completas: lo dice y no calcula nada', /Todavía no hay listas completas verificadas/.test(await txt('.gd-buildsec .gd-pending')) && (await count('.gd-build')) === 0);
  await abrir(390, 844, { hash: '#competicion?s=GD05' }); await sleep(900);
  check('colección sin configurar: invita a configurarla, sin 0 % inventado', /Configura tu colección/.test(await txt('.gd-buildsec .gd-pending')) && (await count('#gdGoColl')) === 1 && (await count('.gd-build')) === 0 && !/0\/50/.test(await txt('.gd-buildsec')));
  await click('#gdGoColl', 700);
  check('el enlace lleva a Mi colección', (await ev(`document.getElementById('collPage').hidden`)) === false);
  await abrir(390, 844, { hash: '#competicion?s=GD05', store: { msa_collection: '{}' } }); await sleep(900);
  check('colección configurada con 0 copias: cero válido y las más cercanas', /Ninguna se puede construir aún/.test(await txt('.gd-buildsec')) && (await count('.gd-build')) === 3 && /0\/50 copias · faltan 50 · 0,0 % de cobertura/.test(await txt('.gd-cov')), await txt('.gd-cov'));
  const coll = {}; Object.entries(deck).forEach(([k, v]) => { coll[k] = { q: v, t: 1 }; });
  const antes = JSON.stringify(coll);
  await abrir(390, 844, { hash: '#competicion?s=GD05', store: { msa_collection: antes } }); await sleep(900);
  const cards0 = await ev(`Array.from(document.querySelectorAll('.gd-build')).map(function(b){ return b.textContent.replace(/\\s+/g,' ') })`);
  check('con las copias exactas de una lista: esa sale primera, 50/50 y legalidad comprobada', /50\/50 copias · no falta ninguna · 100,0 % de cobertura/.test(cards0[0]) && /Construible|No legal/.test(cards0[0]) && cards0[0].indexOf(arch0) >= 0, cards0[0]);
  const esLegal = /Construible/.test(cards0[0]);
  check('chip "Solo construibles" cuenta y filtra', esLegal ? (await txt('#gdBuild-ready')) !== 'Solo construibles (0)' : true, await txt('#gdBuild-ready'));
  await click('#gdBuild-ready');
  check('filtro "Solo construibles": todas con 0 faltan', (await ev(`Array.from(document.querySelectorAll('.gd-build .gd-cov')).every(function(x){ return /no falta ninguna/.test(x.textContent) })`)) === true);
  await click('#gdBuild-all');
  const faltan = await ev(`(function(){ var c=Array.from(document.querySelectorAll('.gd-build')).filter(function(b){ return b.querySelector('.gd-miss-btn') })[0]; if(!c) return null; c.querySelector('.gd-miss-btn').click(); return c.dataset.result })()`); await sleep(350);
  const fila = await ev(`(function(){ var b=document.querySelector('.gd-build[data-result="${faltan}"]'), r=b.querySelector('.gd-miss-row'); return { filas:b.querySelectorAll('.gd-miss-row').length, texto:r.textContent, aria:r.getAttribute('aria-label'), tipos:b.querySelectorAll('.gd-miss .dl-type').length, cov:b.querySelector('.gd-cov').textContent } })()`);
  const nFaltan = Number((/faltan (\d+)/.exec(fila.cov) || [])[1]);
  const sumaFilas = await ev(`Array.from(document.querySelectorAll('.gd-build[data-result="${faltan}"] .gd-miss-row b')).reduce(function(s,x){ return s + Number(x.textContent.replace('×','')) }, 0)`);
  check('"Ver cartas que faltan": por tipo, con código y cantidad, y suma lo que indica la tarjeta', fila.tipos >= 1 && /[A-Z0-9]+-\d{3}/.test(fila.texto) && /Tienes/.test(fila.aria) && sumaFilas === nFaltan, { fila, sumaFilas, nFaltan });
  await click(`.gd-build[data-result="${faltan}"] .gd-miss-row`, 600);
  check('cada carta que falta abre su ficha', (await ev(`document.getElementById('overlay').hidden`)) === false);
  await ev(`document.getElementById('overlay').hidden ? 0 : document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(600);
  check('ver y consultar no cambia la colección', (await ev(`JSON.stringify(JSON.parse(localStorage.getItem('msa_collection')))`)) === JSON.stringify(JSON.parse(antes)));
  check('en cada lista usable se ofrece "Comparar mi mazo" (compara esa lista; el mazo se elige en la pantalla) y no hay botones desactivados', (await count('.gd-cmp')) > 0 && (await count('.gd-build button:disabled')) === 0);
  const decks = JSON.stringify({ d1: { name: 'Mi mazo', cards: deck } });
  await abrir(390, 844, { keep: true, hash: '#competicion?s=GD05', store: { msa_decks: decks, msa_active_deck: 'd1' } }); await sleep(900);
  await click('.gd-build .gd-cmp', 800);
  check('"Comparar mi mazo" abre la comparación de esa lista, con su identidad en la URL', (await ev(`location.hash`)).indexOf('#competicion/comparar/') === 0);
  check('el mazo original no cambia', (await ev(`JSON.stringify(JSON.parse(localStorage.getItem('msa_decks')).d1.cards)`)) === JSON.stringify(deck));
  await click('#gdBack', 500);
  await click('.gd-rows .gd-arow', 800);
  check('la ficha de arquetipo tiene sus listas con tu colección y cartas populares con su n', (await count('.gd-buildsec')) === 1 && /Sobre \d+ listas con las 50 cartas verificadas/.test(await txt('.gd-buildsec')) && (await count('.gd-cards .ml-row')) > 0);
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n== móvil y escritorio ==');
{
  const favs = JSON.stringify(['Mobile Fighter', 'Char IBO', 'BG OYW', 'SF Blockers'].map((n) => ({ id: 'GD06|' + n.toLowerCase(), season: 'GD06', name: n, addedAt: 1 })));
  for (const [W, H] of [[360, 760], [390, 844], [430, 900], [768, 1024], [1440, 900]]) {
    await abrir(W, H, { store: { msa_comp_favs: favs, msa_collection: '{}' } });
    check(W + ': sin desbordamiento y objetivos de 44 px', (await noHScroll()) && (await small()).length === 0, await small());
    check(W + ': con 4 favoritos solo 3 tarjetas, y el ranking llega sin dos pantallas de scroll', (await count('.gd-fav')) === 3 && (await ev(`document.querySelector('.gd-arow').getBoundingClientRect().top < innerHeight * 1.75`)) === true, await ev(`Math.round(document.querySelector('.gd-arow').getBoundingClientRect().top)`));
    await click('#gdSeason-GD05', 1300);
    check(W + ': GD05 con tarjetas de construibles sin desbordar', (await count('.gd-build')) === 3 && (await noHScroll()) && (await small()).length === 0, await small());
  }
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
