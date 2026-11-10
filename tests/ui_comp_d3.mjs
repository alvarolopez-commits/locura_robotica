// Prueba de interfaz: privacidad (sin jugadores), torneo frente a comunidad, atribución a DigiLab y favoritos sincronizados (Supabase simulado).
// Los lotes y colecciones son datos de prueba. Límites: 30 s por orden al navegador y 5 min en total.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_comp_d3.mjs
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (5 min) en: ' + paso); process.exit(3); }, 300000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fake = fs.readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
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

const real = JSON.parse(fs.readFileSync(new URL('./fixtures/comp_lote_inicial.json', import.meta.url), 'utf8'));
const deck50 = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')).archetypes[0].decks[0].cards;
let hookId = null;
const FAKE_SETUP = fake + `;
(function(){
  var S = FakeSupabase.makeServer(); window.__S = S; var session = null, listeners = [];
  try{ var pre = JSON.parse(sessionStorage.getItem('__cloud') || 'null'); if(pre){ if(pre.fav) S.favorites.u1 = pre.fav; S.noFavoritesTable = !!pre.missingFav; } }catch(e){}
  Object.defineProperty(window, 'SUPABASE_CONFIG', { value: { url: 'https://fake.supabase.co', anonKey: 'fake' }, writable: false });
  window.supabase = { createClient: function(){
    var c = S.client('u1');
    c.auth = {
      getSession: function(){ return Promise.resolve({ data: { session: session } }); },
      onAuthStateChange: function(cb){ listeners.push(cb); return { data: { subscription: {} } }; },
      signInWithOtp: function(){ return Promise.resolve({ error: null }); }, signInWithPassword: function(){ return Promise.resolve({ error: null }); },
      signOut: function(){ session = null; listeners.forEach(function(cb){ cb('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); }
    };
    return c;
  } };
  window.__login = function(){ session = { user: { id: 'u1', email: 'prueba@example.test' } }; listeners.forEach(function(cb){ cb('SIGNED_IN', session); }); };
})();`;
async function abrir(W, H, { data, store = {}, cloud, hash = '#competicion', keep = false } = {}) {
  paso = 'abrir ' + hash;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId });
  const body = JSON.stringify(data || real);
  hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ var of = window.fetch; window.fetch = function(u){ if (String(u).indexOf('competition_events.json') >= 0) return Promise.resolve(new Response(${JSON.stringify(body)}, {status:200, headers:{'content-type':'application/json'}})); return of.apply(this, arguments); }; })();` + (cloud ? FAKE_SETUP : '') })).result.identifier;
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  if (!keep) await ev(`localStorage.clear(); 1`);
  await ev(`sessionStorage.setItem('msa_splash','1'); ${cloud ? `sessionStorage.setItem('__cloud', ${JSON.stringify(JSON.stringify(cloud))});` : ''} localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(300); await send('Page.reload'); await sleep(3300);
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const panelText = () => ev(`document.getElementById('compPanel').textContent.replace(/\\s+/g,' ')`);
const click = async (sel, w = 350) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); await sleep(w); return r; };
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('compPage').scrollWidth <= document.getElementById('compPage').clientWidth + 1`);
const favsLocal = () => ev(`JSON.parse(localStorage.getItem('msa_comp_favs') || '[]').map(function(x){ return x.id }).sort()`);
const favsCloud = () => ev(`(function(){ var r = window.__S.favorites.u1; return r ? { ids: r.favorites.map(function(x){ return x.id }).sort(), rev: r.revision } : null })()`);
const favCalls = () => ev(`window.__S.calls.filter(function(c){ return /favorites/.test(c) }).length`);
const diag = () => ev(`(function(){ document.getElementById('avatarBtn').click(); return new Promise(function(r){ setTimeout(function(){ var d=document.querySelector('.acc-diag'); d.open = true; r(d.textContent) }, 600) }) })()`);
const star = (name, where = 'rank') => `.gd-star[data-fav="GD06|${name.toLowerCase()}"][data-where="${where}"]`;

console.log('\n== privacidad: ningún jugador en datos ni en pantalla ==');
{
  const sinNombres = JSON.stringify(real).replace(/playersTotal/g, '');
  check('el archivo de datos no tiene nombres, perfiles ni slugs de jugadores', !/"player"|slug|profile/i.test(sinNombres) && real.results.every((r) => !('player' in r)));
  const d = JSON.parse(JSON.stringify(real)); d.results.forEach((r) => { r.player = 'NOMBRE-SECRETO'; r.playerName = 'NOMBRE-SECRETO'; r.profileUrl = 'https://x.test/NOMBRE-SECRETO'; });
  await abrir(390, 844, { data: d });
  let all = await panelText();
  await click('.gd-rows .gd-arow'); all += await panelText();
  await click('.gd-best'); all += await panelText();
  await click('#gdBack', 400); await click('#gdBack', 400); await click('#compTab-torneos'); await click('.gd-event'); all += await panelText();
  check('aunque la fuente trajera nombres, no se enseñan en Meta, ficha de arquetipo, mejores resultados ni ficha de torneo', !/NOMBRE-SECRETO/.test(all) && (await ev(`document.documentElement.innerHTML.indexOf('NOMBRE-SECRETO')`)) === -1);
  check('las posiciones se identifican por puesto y arquetipo, sin nombre', (await count('.gd-res')) >= 8 && /\d+\.º/.test(await txt('.gd-res-place')));
}

console.log('\n== torneo frente a comunidad ==');
{
  const d = JSON.parse(JSON.stringify(real));
  d.results.push({ id: 'whitebase:c1', eventId: null, placement: null, archetype: 'BG Aggro', colors: ['Blue', 'Green'], set: 'GD06', country: '', origin: 'community', sourceUrl: '', decklistUrl: null, cards: deck50 });
  d.results.push({ id: 'whitebase:c2', eventId: null, placement: null, archetype: 'Mobile Fighter', colors: ['Red', 'White'], set: 'GD06', country: '', origin: 'community', sourceUrl: '', decklistUrl: null, cards: null });
  const t0 = d.events.slice().sort((a, b) => (b.date + b.venue).localeCompare(a.date + a.venue))[0]; d.results.find((r) => r.eventId === t0.id && r.placement === 1).cards = deck50;
  const coll = {}; Object.entries(deck50).forEach(([k, v]) => { coll[k] = { q: v, t: 1 }; });
  await abrir(390, 844, { data: d, store: { msa_collection: JSON.stringify(coll) } });
  check('los mazos de la comunidad no cambian la presencia: sigue n = 56', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 56$/.test(await txt('.gd-share-title')) && /Mobile Fighter/.test(await txt('.gd-rows .gd-arow .cr-name')) && (await txt('.gd-rows .gd-arow .cr-meta')) === '16 de 56 listas');
  check('construibles cuenta torneo y comunidad por separado, y lo dice', /Sobre 1 listas de torneo y 1 mazos de la comunidad con las 50 cartas verificadas\. Se cuentan por separado/.test(await txt('.gd-buildsec')), await txt('.gd-buildsec .comp-note'));
  const origen = await ev(`Array.from(document.querySelectorAll('.gd-build')).map(function(b){ return /Comunidad/.test(b.querySelector('.dl-meta').textContent) ? 'comunidad' : /Torneo/.test(b.querySelector('.dl-meta').textContent) ? 'torneo' : '?' }).sort()`);
  check('cada tarjeta dice si es de torneo o de la comunidad', JSON.stringify(origen) === JSON.stringify(['comunidad', 'torneo']), origen);
  check('el mazo de la comunidad sin cartas no aparece como construible ni como lista', (await count('.gd-build')) === 2);
  await click('.gd-rows .gd-arow'); const f = await panelText();
  check('en la ficha, cartas populares usan solo listas de torneo (n = 1, bajo el mínimo) y no cuentan la de la comunidad', /\(1 con las 50 cartas verificadas\)/.test(f), await txt('.gd-pending'));
  check('cada resultado dice que es de torneo', (await ev(`Array.from(document.querySelectorAll('.gd-res')).every(function(x){ return x.querySelector('.gd-origin').textContent === 'Torneo' })`)) === true);
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n== lista completa aportada por texto (ejemplo tipo WinDecks) ==');
{
  const URL_LISTA = 'https://gcg-win-decks.jp/season/GD06/event/EJEMPLO/deck/EJEMPLO';
  const coll = {}; Object.entries(deck50).forEach(([k, v], i) => { coll[k] = { q: i === 0 ? v - 1 : v, t: 1 }; });
  // a) la composición se añade a un resultado que ya existía: la presencia no cambia
  const a = JSON.parse(JSON.stringify(real)); const top = a.events.slice().sort((x, y) => (y.date + y.venue).localeCompare(x.date + x.venue))[0];
  const r1 = a.results.find((r) => r.eventId === top.id && r.placement === 1); r1.cards = deck50; r1.decklistUrl = URL_LISTA;
  const mine = JSON.stringify({ d1: { name: 'Mi mazo', cards: deck50 } });
  await abrir(390, 844, { data: a, store: { msa_collection: JSON.stringify(coll), msa_decks: mine, msa_active_deck: 'd1' } });
  check('presencia sigue en n = 56 (no se cuenta dos veces)', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 56$/.test(await txt('.gd-share-title')));
  await click('.gd-rows .gd-arow'); await click('.gd-best');
  const hit = await ev(`(function(){ var x=document.querySelector('.gd-res[data-status="complete"]'); return x ? { id:x.dataset.result, ver:/Ver lista/.test(x.textContent), cov:(x.querySelector('.gd-res-cov')||{}).textContent, cmp:!!x.querySelector('.gd-cmp') } : null })()`);
  check('en la ficha del torneo la lista completa se distingue, con cobertura de tu colección y "Comparar mi mazo"', hit && hit.ver && /49\/50 copias · faltan 1 · 98,0 % de cobertura/.test(hit.cov) && hit.cmp, hit);
  await click('.gd-res[data-status="complete"] .gd-open', 450);
  check('el enlace de la lista va a su página de origen, no a Side-6', (await ev(`document.querySelector('.gd-res[data-status="complete"] a.comp-link').href`)) === URL_LISTA, await ev(`document.querySelector('.gd-res[data-status="complete"] a.comp-link') && document.querySelector('.gd-res[data-status="complete"] a.comp-link').href`));
  check('permite copiar la lista a Mis mazos', /Copiar mazo/.test(await txt('.gd-res[data-status="complete"] .dl-actions')));
  await click('.gd-res[data-status="complete"] .gd-cmp', 900);
  check('"Comparar mi mazo" abre la comparación de esa lista (identidad en la URL)', (await ev(`location.hash`)).indexOf('#competicion/comparar/') === 0);
  check('el mazo original no cambia', (await ev(`JSON.stringify(JSON.parse(localStorage.getItem('msa_decks')).d1.cards)`)) === JSON.stringify(deck50));
  await click('#gdBack', 500);
  // b) torneo nuevo con solo ese primer puesto: entra en la muestra de presencia (n = 57); las cartas populares tienen aparte su propio n
  const b = JSON.parse(JSON.stringify(real));
  b.events.push({ id: 'windecks:EJEMPLO', date: '2026-11-03', name: 'Torneo de ejemplo', venue: 'Sede de ejemplo', country: 'Japan', format: 'Standard', set: 'GD06', type: 'Otro', playersTotal: null, listsPublished: null, dataQuality: 'single_deck', sources: [{ provider: 'windecks', id: 'EJEMPLO', url: URL_LISTA, label: 'WinDecks', primary: true }] });
  b.results.push({ id: 'windecks:lista1', eventId: 'windecks:EJEMPLO', placement: 1, archetype: 'BG Aggro', colors: ['Blue', 'Green'], set: 'GD06', country: 'Japan', origin: 'tournament', sourceUrl: '', decklistUrl: URL_LISTA, cards: deck50 });
  await abrir(390, 844, { data: b });
  check('torneo nuevo con solo el primer puesto (single_deck): NO entra en la muestra de presencia (n = 56) y se avisa', /^Presencia entre listas publicadas Top 8\/16 · n = 56$/.test(await txt('.gd-share-title')) && /1 torneo con un solo mazo publicado no entra/.test(await txt('.gd-outside')), await txt('.gd-share-title'));
  await abrir(390, 844, { data: b, hash: '#competicion/arquetipo/BG%20Aggro' });   // no está en el ranking (fuera de la muestra), pero su ficha se abre por enlace
  check('su ficha de arquetipo: fuera del porcentaje (n = 56) y 1 lista completa en cartas (denominadores distintos), sin nombres', /fuera de la muestra principal \(n = 56\)/.test(await txt('.gd-outside-arch')) && /\(1 con las 50 cartas verificadas\)/.test(await ev(`Array.from(document.querySelectorAll('.gd-pending')).map(function(x){ return x.textContent }).join(' ')`)) && !/NOMBRE|player/i.test(await panelText()), [await txt('.gd-outside-arch'), await ev(`Array.from(document.querySelectorAll('.gd-pending')).map(function(x){ return x.textContent }).join(' | ')`)]);
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n== atribución a DigiLab ==');
{
  await abrir(390, 844);
  check('con los datos actuales no hay enlace a DigiLab (no se usan sus datos)', (await count('.gd-attrib')) === 0);
  const d = JSON.parse(JSON.stringify(real)); d.events[0].sources.push({ provider: 'digilab', id: '9', url: 'https://gundam.digilab.cards/tournaments/9', label: 'DigiLab', primary: false });
  await abrir(390, 844, { data: d });
  check('con un evento de DigiLab, enlace visible a digilab.cards en Meta', /Datos de torneos aportados por digilab\.cards/.test(await txt('.gd-attrib')) && (await ev(`document.querySelector('.gd-attrib a').href`)) === 'https://digilab.cards/' && (await ev(`document.querySelector('.gd-attrib a').rel`)) === 'noopener noreferrer');
  await click('#compTab-torneos'); check('y en Torneos', (await count('.gd-attrib')) === 1);
  await click('.gd-event'); check('y en la ficha de torneo', (await count('.gd-attrib')) === 1);
  check('sin desbordamiento', await noHScroll());
}

console.log('\n== favoritos sincronizados ==');
{
  await abrir(390, 844, { cloud: {} });
  await click(star('Mobile Fighter'));
  check('como invitado: se guarda en el dispositivo y no se llama a la nube', JSON.stringify(await favsLocal()) === JSON.stringify(['GD06|mobile fighter']) && (await favCalls()) === 0, await favCalls());
  await ev(`window.__login(); 1`); await sleep(1800);
  check('al iniciar sesión se suben los favoritos del dispositivo', JSON.stringify((await favsCloud())?.ids) === JSON.stringify(['GD06|mobile fighter']), await favsCloud());
  check('el diagnóstico dice que están guardados', /Favoritos: saved · 1/.test(await diag()), await diag());
  await ev(`document.getElementById('accountClose').click(); 1`); await sleep(400);
  await click(star('Char IBO')); await sleep(2000);
  check('seguir otro se envía solo', JSON.stringify((await favsCloud())?.ids) === JSON.stringify(['GD06|char ibo', 'GD06|mobile fighter']), await favsCloud());
  await ev(`(function(){ var r = window.__S.favorites.u1; r.favorites.push({ id: 'GD05|bg aggro', season: 'GD05', name: 'BG Aggro', addedAt: 5 }); r.favorites = r.favorites.filter(function(x){ return x.id !== 'GD06|char ibo' }); r.revision++ })()`);
  await ev(`window.dispatchEvent(new Event('online')); 1`); await sleep(1800);
  check('lo que otro dispositivo añade y quita llega aquí, también a la pantalla', JSON.stringify(await favsLocal()) === JSON.stringify(['GD05|bg aggro', 'GD06|mobile fighter']) && (await count('.gd-fav')) === 1, await favsLocal());
  check('un favorito de otra temporada se conserva y se avisa', /1 favorito en GD05/.test(await txt('.gd-fav-other')), await txt('.gd-fav-other'));
  await click(star('Mobile Fighter', 'fy')); await sleep(2000);
  check('dejar de seguir se sube', JSON.stringify((await favsCloud())?.ids) === JSON.stringify(['GD05|bg aggro']), await favsCloud());
  await ev(`document.getElementById('avatarBtn').click(); 1`); await sleep(600);
  await ev(`document.querySelector('.acc-out').click(); 1`); await sleep(1500);
  check('cerrar sesión con todo guardado: salen de este navegador y siguen en la cuenta', (await favsLocal()).length === 0 && (await favsCloud())?.ids.length === 1, [await favsLocal(), await favsCloud()]);
  check('sin errores de consola', errs.length === 0, errs);

  await abrir(390, 844, { cloud: { fav: { favorites: [{ id: 'GD06|char ibo', season: 'GD06', name: 'Char IBO', addedAt: 3 }], revision: 4 } }, store: { msa_comp_favs: JSON.stringify([{ id: 'GD06|mobile fighter', season: 'GD06', name: 'Mobile Fighter', addedAt: 1 }]) } });
  await ev(`window.__login(); 1`); await sleep(1800);
  check('segundo dispositivo: se unen los de la cuenta y los locales', JSON.stringify(await favsLocal()) === JSON.stringify(['GD06|char ibo', 'GD06|mobile fighter']) && JSON.stringify((await favsCloud())?.ids) === JSON.stringify(['GD06|char ibo', 'GD06|mobile fighter']), [await favsLocal(), await favsCloud()]);

  await abrir(390, 844, { cloud: { missingFav: true }, store: { msa_comp_favs: JSON.stringify([{ id: 'GD06|mobile fighter', season: 'GD06', name: 'Mobile Fighter', addedAt: 1 }]) } });
  await ev(`window.__login(); 1`); await sleep(1800);
  check('migración sin aplicar: la app sigue, los favoritos locales intactos y se ven', (await count('.gd-fav')) === 1 && JSON.stringify(await favsLocal()) === JSON.stringify(['GD06|mobile fighter']));
  await click(star('Char IBO')); await sleep(1800);
  const llamadas = await favCalls();
  check('seguir otro funciona en local y no insiste contra una tabla que no existe', (await favsLocal()).length === 2 && llamadas <= 2, llamadas);
  check('el diagnóstico explica que falta aplicar el SQL', /falta aplicar supabase\/favorites\.sql/.test(await diag()), await diag());
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
