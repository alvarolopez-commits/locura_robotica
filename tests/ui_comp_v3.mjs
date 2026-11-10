// Prueba de interfaz: Competición V3 (Meta y Torneos, fichas de arquetipo y de torneo) a 360/390/430/768/1440.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_comp_v3.mjs
import fs from 'node:fs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

const real = JSON.parse(fs.readFileSync(new URL('./fixtures/comp_lote_inicial.json', import.meta.url), 'utf8'));
const deck50 = JSON.parse(fs.readFileSync('data/decklists.json', 'utf8')).archetypes[0].decks[0].cards;
let hookId = null;
async function abrir(W, H, { data, lang = 'es', hash = '#competicion', fail = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  if (hookId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hookId });
  hookId = null;
  {
    const body = JSON.stringify(data || real);
    hookId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(function(){ var of = window.fetch; window.fetch = function(u){ if (String(u).indexOf('competition_events.json') >= 0) { ${fail ? 'return Promise.resolve(new Response("", {status:404}));' : `return Promise.resolve(new Response(${JSON.stringify(body)}, {status:200, headers:{'content-type':'application/json'}}));`} } return of.apply(this, arguments); }; })();` })).result.identifier;
  }
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/' + hash }); await sleep(400); await send('Page.reload'); await sleep(4200);
}
const txt = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); return e ? e.textContent.trim().replace(/\\s+/g,' ') : null })()`);
const count = (sel) => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const panel = () => ev(`document.getElementById('compPanel').textContent.replace(/\\s+/g,' ')`);
const click = async (sel, w = 500) => { const r = await ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true })()`); await sleep(w); return r; };
const clickTxt = async (sel, re, w = 500) => { const r = await ev(`(function(){ var e=Array.from(document.querySelectorAll(${JSON.stringify(sel)})).filter(function(x){ return ${re}.test(x.textContent) })[0]; if(!e) return false; e.click(); return true })()`); await sleep(w); return r; };
const setSel = async (id, v) => { await ev(`(function(){ var s=document.getElementById(${JSON.stringify(id)}); s.value=${JSON.stringify(String(v))}; s.dispatchEvent(new Event('change', {bubbles:true})) })()`); await sleep(350); };
const noHScroll = () => ev(`document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('compPage').scrollWidth <= document.getElementById('compPage').clientWidth + 1`);
const tabs = () => ev(`Array.from(document.querySelectorAll('#compTabs .comp-tab')).map(function(b){ return b.textContent.trim() })`);
const small = (sel) => ev(`Array.from(document.querySelectorAll(${JSON.stringify(sel)})).filter(function(e){ return e.offsetParent && !e.disabled }).map(function(e){ var r=e.getBoundingClientRect(); return { h:Math.round(r.height), t:(e.id||e.className||'').slice(0,30) } }).filter(function(x){ return x.h < 44 })`);
const INTER = '#compPanel button, #compPanel select, #compPanel input, #compScope button, #compTabs button';
const title = () => txt('.gd-share-title');

for (const [W, H] of [[360, 760], [390, 844], [430, 900], [768, 1024], [1440, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H);
  check('dos pestañas: Meta y Torneos, sin pestaña de Listas', JSON.stringify(await tabs()) === JSON.stringify(['Meta', 'Torneos']), await tabs());
  check('aria-selected en la pestaña activa', (await ev(`document.getElementById('compTab-meta').getAttribute('aria-selected')`)) === 'true');
  check('GD06 por defecto, con GD05 aparte', (await ev(`document.getElementById('gdSeason-GD06').getAttribute('aria-pressed')`)) === 'true' && (await count('#gdSeason-GD05')) === 1);
  check('ámbito visible: GD06 · Japón · periodo · 5 torneos · 56 listas', /^GD06 · Japón · 1 nov 2026 – 3 nov 2026 · 5 torneos · 56 listas publicadas$/.test(await txt('.gd-scope')), await txt('.gd-scope'));
  check('etiqueta con el denominador', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 56$/.test(await txt('.gd-share-title')), await title());
  check('ranking limitado a 7 con "Ver todos (14)"', (await count('.gd-rows .gd-arow')) === 7 && /Ver todos \(14\)/.test(await txt('#gdAll')));
  check('primera fila: Mobile Fighter, 28,6 %, 16 de 56', /Mobile Fighter/.test(await txt('.gd-rows .gd-arow .cr-name')) && (await txt('.gd-rows .gd-arow .cr-val')) === '28,6 %' && (await txt('.gd-rows .gd-arow .cr-meta')) === '16 de 56 listas');
  check('la fila es accesible por lector de pantalla', /Mobile Fighter: 28,6 %, 16 de 56 listas publicadas/.test(await ev(`document.querySelector('.gd-arow').getAttribute('aria-label')`)));
  check('barras horizontales: la primera ocupa el ancho completo', (await ev(`document.querySelector('.gd-arow .cr-track i').style.width`)) === '100%');
  check('un solo periodo: sin subidas ni bajadas y con mensaje informativo', /un solo periodo/.test(await txt('.gd-notrend')) && (await count('.gd-mover')) === 0);
  check('sin tasa de victorias con valor', !/win rate|\d\s*%\s*(de )?victorias/i.test(await panel()));
  check('torneos recientes con enlace a Torneos', (await count('.comp-sec .gd-event')) === 3 && (await count('#gdToEvents')) === 1);
  check('sin scroll horizontal; objetivos de 44 px', (await noHScroll()) && (await small(INTER)).length === 0, await small(INTER));
  if (W < 768) check('el ranking empieza dentro de la primera pantalla', (await ev(`(function(){ var a=document.querySelector('.gd-arow').getBoundingClientRect(); return a.bottom <= innerHeight - 60 })()`)) === true, await ev(`Math.round(document.querySelector('.gd-arow').getBoundingClientRect().bottom)`));
  check('el título no parte "n = 56" en dos líneas', (await ev(`document.querySelector('.gd-share-title').textContent.indexOf('n\\u00a0=\\u00a056') >= 0`)) === true);
  check('ningún texto del panel se parte a mitad de palabra por falta de sitio', (await ev(`Array.from(document.querySelectorAll('#compPanel b, #compPanel .gd-facts span')).every(function(e){ return e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).display === 'inline' })`)) === true);
  await click('#gdAll'); check('"Ver todos" enseña los 14', (await count('.gd-rows .gd-arow')) === 14); await click('#gdAll');
  check('Más filtros está plegado', (await count('#gdMore')) === 0 && (await count('#gdTop')) === 0);
  await click('#gdMoreBtn');
  check('Más filtros: formato, tamaño y Top N', (await count('#gdFormat')) === 1 && (await count('#gdSize')) === 1 && (await count('#gdTop')) === 1);
  await setSel('gdTop', 8);
  check('Top 8 recalcula n = 40 y aparece como chip', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 40$/.test(await txt('.gd-share-title')) && /Top 8/.test(await txt('.gd-chips')), await title());
  await setSel('gdTop', 0); await setSel('gdSize', 's');
  check('torneos de hasta 32: n = 24', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 24$/.test(await txt('.gd-share-title')), await title());
  await setSel('gdSize', '');
  await ev(`(function(){ var i=document.getElementById('gdFrom'); i.value='2026-11-03'; i.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(350);
  check('desde el 3 de nov.: 1 torneo, n = 8', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 8$/.test(await txt('.gd-share-title')) && /· 1 torneo ·/.test(await txt('.gd-scope')), await txt('.gd-scope'));
  await ev(`(function(){ var i=document.getElementById('gdFrom'); i.value='2026-12-01'; i.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(350);
  const vacio = await panel();
  check('sin resultados: n = 0, mensaje de vacío y ningún NaN', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 0$/.test(await txt('.gd-share-title')) && /No hay listas publicadas con estos filtros/.test(vacio) && !/NaN|Infinity|undefined/.test(vacio));
  await click('#gdClear'); check('"Limpiar" vuelve a n = 56', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 56$/.test(await txt('.gd-share-title')));
  await click('#gdMoreBtn');

  // Torneos
  await click('#gdToEvents');
  check('Torneos: la pestaña cambia y hay 5 tarjetas en orden de fecha', (await ev(`document.getElementById('compTab-torneos').getAttribute('aria-selected')`)) === 'true' && (await count('.gd-event')) === 5 && /カードラボ所沢店/.test(await txt('.gd-event .dl-etitle')));
  const sedes = await ev(`Array.from(document.querySelectorAll('.gd-event')).filter(function(c){ return /^2 nov/.test(c.querySelector('.dl-edate').textContent) }).map(function(c){ return c.querySelector('.dl-etitle').textContent })`);
  check('Torneos: mismo día y nombre, sedes distintas, tarjetas distintas', sedes.length === 3 && new Set(sedes).size === 3, sedes);
  check('Torneos: participantes, listas publicadas y corte', /64 participantes.*16 listas publicadas.*Solo Top 16/.test(await ev(`Array.from(document.querySelectorAll('.gd-event')).filter(function(c){ return /吉祥寺/.test(c.textContent) })[0].textContent`)));
  await ev(`(function(){ var i=document.getElementById('gdQ'); i.value='吉祥寺'; i.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(350);
  check('Torneos: la búsqueda filtra por sede', (await count('.gd-event')) === 1);
  await click('#gdClear');
  check('Torneos: sin scroll horizontal; objetivos de 44 px', (await noHScroll()) && (await small(INTER)).length === 0, await small(INTER));

  // ficha de torneo
  await clickTxt('.gd-event', '/吉祥寺/');
  check('ficha de torneo: sin pestañas ni selector de temporada, con botón de volver', (await ev(`document.getElementById('compTabs').hidden && document.getElementById('compScope').hidden`)) === true && (await count('#gdBack')) === 1);
  check('ficha de torneo: 16 posiciones, fuente con enlace y participantes como contexto', (await count('.gd-res')) === 16 && (await ev(`document.querySelector('.gd-sources a').href.indexOf('https://metasheep.gg/')`)) === 0 && /no se usan como denominador/.test(await panel()));
  check('ficha de torneo: sin composición no ofrece copiar ni comparar, ni botones desactivados', /Composición de cartas no disponible/.test(await txt('.gd-res')) && (await count('.gd-res button:disabled')) === 0 && !/Copiar|Comparar/.test(await ev(`Array.from(document.querySelectorAll('#compPanel button')).map(function(b){ return b.textContent }).join('|')`)));
  check('ficha de torneo: un solo botón de volver', (await ev(`document.getElementById('compBack').hidden`)) === true);
  check('ficha de torneo: sin scroll horizontal; objetivos de 44 px', (await noHScroll()) && (await small(INTER)).length === 0, await small(INTER));
  await click('#gdBack', 400);
  check('al volver reaparece el botón Catálogo', (await ev(`document.getElementById('compBack').hidden`)) === false);
  check('volver lleva a Torneos', (await ev(`document.getElementById('compTab-torneos').getAttribute('aria-selected')`)) === 'true' && (await count('.gd-event')) === 5);

  // Meta -> Arquetipo -> Torneo -> volver, sin perder filtros ni scroll
  await click('#compTab-meta');
  await click('#gdMoreBtn'); await setSel('gdTop', 16);
  await ev(`(function(){ var i=document.getElementById('gdTo'); i.value='2026-11-03'; i.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(350);
  await ev(`document.getElementById('compPage').scrollTop = 260; 1`); await sleep(150);
  const antes = await ev(`({ scroll: document.getElementById('compPage').scrollTop, hash: location.hash })`);
  await click('.gd-rows .gd-arow');
  check('ficha de arquetipo: nombre, %, n y total', /Mobile Fighter/.test(await txt('.gd-title')) && (await txt('.gd-metric .comp-big')) === '28,6 %' && /16 de 56 listas publicadas/.test(await txt('.gd-metric-n')), await txt('.gd-metric'));
  check('la URL describe la ficha y conserva los filtros', /^#competicion\/arquetipo\/Mobile%20Fighter\?.*top=16/.test(await ev(`location.hash`)), await ev(`location.hash`));
  const f = await panel();
  check('ficha de arquetipo: filtros activos visibles', /Top 16/.test(await txt('.gd-scope')));
  check('ficha de arquetipo: una sola muestra temporal, sin histórico inventado', /un solo periodo/.test(await txt('.gd-notrend')));
  check('ficha de arquetipo: mejores resultados con aviso', (await count('.gd-best')) === 5 && /no equivale a una tasa de victorias/.test(f));
  check('ficha de arquetipo: sin cartas populares porque no hay listas completas', /Aún no hay suficientes listas completas para analizar cartas \(0/.test(await txt('.gd-pending')) && (await count('.gd-cards .ml-row')) === 0);
  check('ficha de arquetipo: 12 resultados de 16 con estado', (await count('.gd-res')) === 12 && /Resultados publicados \(16\)/.test(f) && /Composición de cartas no disponible/.test(await txt('.gd-res')));
  check('ficha de arquetipo: sin scroll horizontal; objetivos de 44 px', (await noHScroll()) && (await small(INTER)).length === 0, await small(INTER));
  await click('.gd-best');
  check('de ahí a la ficha del torneo', (await count('.gd-res')) >= 8 && /^#competicion\/torneo\//.test(await ev(`location.hash`)));
  await click('#gdBack', 500);
  check('volver: a la ficha de arquetipo', /Mobile Fighter/.test(await txt('.gd-title')));
  await click('#gdBack', 500);
  const luego = await ev(`({ scroll: document.getElementById('compPage').scrollTop, hash: location.hash })`);
  check('volver: a Meta con filtros y scroll intactos', luego.hash === antes.hash && Math.abs(luego.scroll - antes.scroll) <= 2 && (await count('.gd-chips .tag, .gd-chips button')) >= 2, { antes, luego });
  await click('#gdClear');

  // GD05 (Side-6)
  await click('#gdSeason-GD05', 1500);
  check('GD05: mismas dos pestañas y n de Side-6, sin mezclar GD06', JSON.stringify(await tabs()) === JSON.stringify(['Meta', 'Torneos']) && /n = 8\.?219/.test(await title()) && /^GD05 · Side-6/.test(await txt('.gd-scope')), [await title(), await txt('.gd-scope')]);
  check('GD05: el ranking no ofrece filtros que la fuente no permite y lo explica', (await count('#gdCountry')) === 0 && /solo da totales/.test(await panel()));
  check('GD05: cambios frente a GD04 con la n de cada periodo', (await count('.gd-mover')) > 0 && /GD05 \(n = 8\.?219\) frente a GD04 \(n = 3\.?907\)/.test(await panel()));
  await click('.gd-rows .gd-arow', 700);
  check('GD05: ficha de arquetipo con evolución por periodo y cartas populares con su propio n', (await count('.gd-era')) === 3 && (await count('.gd-cards .ml-row')) > 0 && /Sobre \d+ listas con las 50 cartas verificadas/.test(await panel()), await count('.gd-cards .ml-row'));
  const conLista = await clickTxt('.gd-res .gd-open', '/Ver lista/', 500);
  check('GD05: una lista completa se abre con copiar y ver cartas (función existente)', conLista && /Copiar mazo/.test(await txt('.gd-deck .dl-actions')) && (await count('.gd-deck .dl-cards')) === 1);
  check('GD05: ficha sin scroll horizontal', await noHScroll());
  await click('#gdBack', 400); await click('#compTab-torneos', 500);
  check('GD05 Torneos: se distinguen los torneos por su id (más de 100 en la muestra)', /· 400 torneos/.test(await txt('.gd-scope')) && (await count('.gd-event')) === 10, await txt('.gd-scope'));
  check('GD05 Torneos: sin scroll horizontal; objetivos de 44 px', (await noHScroll()) && (await small(INTER)).length === 0, await small(INTER));
  check('sin errores de consola (' + W + ')', errs.length === 0, errs);
}

console.log('\n== listas completas, sin clasificar, datos ausentes, enlaces e idioma ==');
{
  const data = JSON.parse(JSON.stringify(real)); const r0 = data.results.find((r) => r.archetype === 'Mobile Fighter');
  r0.cards = deck50; const sc = data.results.find((r) => r.archetype === 'Aggro Orb'); sc.archetype = null;
  await abrir(390, 844, { data });
  check('una lista sin arquetipo sigue en el denominador como "Sin clasificar"', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 56$/.test(await txt('.gd-share-title')) && /Sin clasificar/.test(await ev(`(document.getElementById('gdAll').click(), new Promise(function(r){ setTimeout(function(){ r(document.querySelector('.gd-rows').textContent) }, 300) }))`)));
  await click('.gd-rows .gd-arow');
  check('con 1 lista completa: distingue su estado, y sigue sin cartas populares (mínimo 10)', (await count('.gd-res[data-status="complete"]')) === 1 && (await count('.gd-res[data-status="pending"]')) >= 1 && /\(1 con las 50 cartas verificadas\)/.test(await txt('.gd-pending')));
  await clickTxt('.gd-res .gd-open', '/Ver lista/');
  check('la lista completa se abre y se puede copiar; las demás no', /Copiar mazo/.test(await txt('.gd-res[data-status="complete"]')) && (await ev(`Array.from(document.querySelectorAll('.gd-res[data-status="pending"]')).every(function(x){ return !x.querySelector('button.gd-open') && !/Copiar/.test(x.textContent) })`)) === true);
  const mf = await ev(`document.querySelector('.gd-res[data-status="complete"] a.comp-link') ? document.querySelector('.gd-res[data-status="complete"] a.comp-link').href : ''`);
  check('el enlace de la lista va a su fuente, no a otra web', mf === '' || mf.indexOf('https://metasheep.gg/') === 0, mf);

  await abrir(390, 844, { data: { version: 1, updatedAt: '2026-11-04', events: [], results: [], review: [] } });
  check('sin torneos en el archivo: se abre GD05 de Side-6, con una sola temporada no hay selector', (await ev(`document.getElementById('compScope').hidden`)) === true && /^GD05/.test(await txt('.gd-scope')), await txt('.gd-scope'));

  await abrir(390, 844, { fail: true });
  await sleep(800);
  check('error del archivo: mensaje con reintento, GD05 sigue disponible y no hay bucle de peticiones', /No se pudieron cargar los torneos/.test(await txt('.gd-error')) && (await count('.gd-retry')) === 1 && /^GD05/.test(await txt('.gd-scope')), await txt('.gd-error'));

  await abrir(390, 844, { hash: '#competicion/arquetipo/Mobile%20Fighter?top=8' });
  check('enlace directo a una ficha con filtros: la abre y calcula con ellos (n = 40)', /Mobile Fighter/.test(await txt('.gd-title')) && /de 40 listas publicadas/.test(await txt('.gd-metric-n')), await txt('.gd-metric-n'));
  await click('#gdBack', 500);
  check('al volver desde un enlace directo se queda en Meta con el filtro', /^Presencia entre listas publicadas( Top [\d\/]+)? · n = 40$/.test(await txt('.gd-share-title')) && /^#competicion\?top=8/.test(await ev(`location.hash`)), await ev(`location.hash`));

  await abrir(390, 844, { hash: '#competicion/torneos' });
  check('enlace directo a Torneos', (await ev(`document.getElementById('compTab-torneos').getAttribute('aria-selected')`)) === 'true' && (await count('.gd-event')) === 5);
  await click('#compBack', 600);
  check('el botón Catálogo cierra Competición', (await ev(`document.getElementById('compPage').hidden`)) === true);

  await abrir(390, 844, { hash: '#competicion/torneo/no-existe' });
  check('un torneo que no existe da un mensaje, no un error', /no está en la temporada/.test(await txt('.gd-empty')));

  await abrir(390, 844, { lang: 'en' });
  check('en inglés: textos traducidos', /Presence among published( Top [\d\/]+)? lists · n = 56/.test(await title()) && JSON.stringify(await tabs()) === JSON.stringify(['Meta', 'Tournaments']) && /28\.6%/.test(await txt('.gd-arow .cr-val')), [await title(), await tabs()]);
  check('sin errores de consola', errs.length === 0, errs);
}

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
await ev(`localStorage.clear(); sessionStorage.clear(); 1`);
await fetch('http://127.0.0.1:9333/json/close/' + t.id).catch(() => {}); await sleep(100);
process.exit(failed ? 1 : 0);
