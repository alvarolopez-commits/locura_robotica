/* Pruebas del importador de DigiLab y de exportaciones. Usan respuestas de EJEMPLO inventadas para la prueba (no son datos de DigiLab):
 * la forma real de las listas de Gundam no está documentada por DigiLab y no se ha podido comprobar sin clave.  node tests/digilab_import.test.js */
const fs = require('fs');
const path = require('path');
const D = require('../scripts/import_digilab.js');
const X = require('../scripts/import_deck_export.js');
const S = require('../comp_stats.js');
const { merge } = require('../scripts/import_competition_batch.js');

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };

const have = (n) => /^GD06-0(0[1-9]|1[0-9]|2[0-9])$/.test(n);
const deck50 = () => { const d = []; for (let i = 1; i <= 12; i++) d.push({ card_id: 'GD06-' + String(i).padStart(3, '0'), name: 'x', count: 4, color: 'red' }); d.push({ card_id: 'GD06-013', name: 'x', count: 2, color: 'red' }); return d; };
const resp = (body, status = 200, headers = {}) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] || null }, json: async () => body });

(async () => {
  console.log('\n== lectura de la lista ==');
  await test('suma todas las matrices { card_id, count } y se queda con 50 cartas', async () => { const c = D.cardsOfDecklist({ main: deck50(), total_cards: 50 }); eq(Object.values(c).reduce((a, b) => a + b, 0), 50); });
  await test('decklist null o sin matrices con esa forma: sin cartas (queda pendiente)', async () => { eq(D.cardsOfDecklist(null), null); eq(D.cardsOfDecklist({ otra: [{ x: 1 }] }), null); });
  const row = (o) => Object.assign({ result_id: 77, placement: 2, player: { name: 'Persona Real', slug: 'persona-real' }, player_name: 'Persona Real', player_slug: 'persona-real', deck: 'BG Aggro', primary_color: 'blue', has_decklist: true, decklist_url: 'https://gundam.digilab.cards/u/persona-real/deck/1' }, o || {});
  await test('lista completa y verificada: guarda las cartas y NADA personal', async () => {
    const r = D.mapStanding('digilab:5', 'GD06', 'JP', row(), { decklist: { main: deck50() } }, have);
    eq(r.id, 'digilab:77'); eq(r.colors, ['Blue']); eq(S.deckStatus(r), 'complete'); eq(r.origin, 'tournament');
    ok(!/Persona|persona-real|digilab\.cards\/u/.test(JSON.stringify(r)), 'quedan datos personales');
  });
  await test('con un código que no existe en el catálogo: pendiente, no se adivina', async () => {
    const d = deck50(); d[0].card_id = 'ZZ99-999'; eq(D.mapStanding('digilab:5', 'GD06', 'JP', row(), { decklist: { main: d } }, have).cards, null);
  });
  await test('con 49 cartas: pendiente', async () => { const d = deck50(); d[0].count = 3; eq(D.mapStanding('digilab:5', 'GD06', 'JP', row(), { decklist: { main: d } }, have).cards, null); });
  await test('jugador anónimo (sin lista): resultado conservado para presencia, sin cartas', async () => {
    const r = D.mapStanding('digilab:5', 'GD06', 'JP', row({ has_decklist: false, decklist_url: null }), null, have); eq(r.cards, null); eq(r.placement, 2);
  });

  console.log('\n== cliente: clave, límites y errores ==');
  await test('envía la clave en X-API-Key y nunca en la URL', async () => {
    let seen; const get = D.makeClient('CLAVE-DE-PRUEBA', 5, async (u, o) => { seen = { u, o }; return resp({}); });
    await get('/api/tournaments?per_page=1'); eq(seen.o.headers['X-API-Key'], 'CLAVE-DE-PRUEBA'); ok(seen.u.indexOf('CLAVE') < 0); ok(seen.u.startsWith('https://gundam.digilab.cards/'));
  });
  await test('un 429 detiene la ejecución e indica Retry-After, sin reintentar', async () => {
    let n = 0; const get = D.makeClient('k', 5, async () => { n++; return resp({}, 429, { 'retry-after': '30' }); });
    let msg = ''; try { await get('/api/x'); } catch (e) { msg = e.message; } ok(/429/.test(msg) && /30/.test(msg)); eq(n, 1);
  });
  await test('un 401 explica que la clave no vale', async () => { const get = D.makeClient('k', 5, async () => resp({}, 401)); let m = ''; try { await get('/api/x'); } catch (e) { m = e.message; } ok(/clave/.test(m)); });
  await test('el tope de peticiones corta la ejecución', async () => { const get = D.makeClient('k', 1, async () => resp({})); await get('/a'); let m = ''; try { await get('/b'); } catch (e) { m = e.message; } ok(/límite/.test(m)); });

  console.log('\n== importación completa con respuestas de ejemplo ==');
  await test('torneo + clasificación + listas: eventos y resultados sin datos personales, 1 completa de 3', async () => {
    const routes = {
      '/api/tournaments': { pagination: { total_pages: 1 }, tournaments: [{ id: 5, name: 'Newtype Challenge de prueba', date: '2026-11-02', country: 'JP', format: 'Standard', store: { name: 'Tienda de prueba' }, player_count: 32 }] },
      '/api/tournament/5': { standings: [row({ result_id: 1, placement: 1 }), row({ result_id: 2, placement: 2, has_decklist: false }), row({ result_id: 3, placement: 3 })] },
      '/api/decklist/1': { decklist: { main: deck50() } }, '/api/decklist/3': { decklist: null },
    };
    const get = async (p) => { const k = p.split('?')[0]; if (!routes[k]) throw new Error('ruta inesperada ' + p); return routes[k]; };
    const r = await D.importRange(get, { set: 'GD06', from: '2026-11-01', to: '2026-11-03', catalogHas: have });
    eq([r.events.length, r.results.length, r.report.complete, r.report.decklistsFetched], [1, 3, 1, 2]);
    eq(r.events[0].sources[0].provider, 'digilab'); eq(r.events[0].listsPublished, 3);
    ok(!/Persona|persona-real/.test(JSON.stringify(r)), 'quedan datos personales');
    const m = merge({ events: [], results: [] }, { events: r.events, results: r.results }, '2026-11-04');
    eq(merge(m.out, { events: r.events, results: r.results }, '2026-11-04').out, m.out, 'no es idempotente');
  });

  console.log('\n== exportaciones de texto (WinDecks, WhiteBase, ExBurst…) ==');
  const fakeCatalog = {}; for (let i = 1; i <= 29; i++) fakeCatalog['GD06-' + String(i).padStart(3, '0')] = { number: 'GD06-' + String(i).padStart(3, '0') };
  const legalOk = { getActiveRuleset: () => ({ id: 'r-prueba' }), validateDeck: () => ({ status: 'legal', errors: [] }) };
  const ctx = { catalog: fakeCatalog, rulesets: [], legality: legalOk };
  const txt = (o) => { const rows = []; for (let i = 1; i <= 12; i++) rows.push('4 GD06-' + String(i).padStart(3, '0')); rows.push('2 GD06-013'); return rows.join('\n') + (o || ''); };
  const base = () => ({ events: [{ id: 'metasheep:1', date: '2026-11-02', name: 'Newtype Challenge', venue: 'Tienda A', country: 'Japan', format: 'Standard', set: 'GD06', sources: [{ provider: 'metasheep', id: '1', url: 'https://m/1', primary: true }] }],
    results: [{ id: 'metasheep:1:position:1', eventId: 'metasheep:1', placement: 1, archetype: 'BG OYW', colors: ['Blue', 'Green'], set: 'GD06', country: 'Japan', origin: 'tournament', sourceUrl: '', decklistUrl: null, cards: null }] });
  const T = (o) => Object.assign({ origin: 'tournament', event: 'metasheep:1', placement: 3, archetype: 'A', colors: 'Red', set: 'GD06', source: 'WinDecks' }, o || {});
  await test('lista de torneo válida: pasa todas las comprobaciones y se guarda verificada', async () => {
    const b = X.build(txt(), T(), base(), ctx); ok(b.result, b.error); eq(S.deckStatus(b.result), 'complete'); ok(b.checks.every((c) => c.ok));
    ['Suma de cartas', 'Catálogo', 'Reglas de construcción', 'Torneo', 'Lista', 'Duplicado'].forEach((n) => ok(b.checks.some((c) => c.name === n), 'falta la comprobación ' + n));
  });
  await test('lista de la comunidad: sin torneo ni puesto, marcada como comunidad', async () => { const b = X.build(txt(), { origin: 'community', archetype: 'A', set: 'GD06', source: 'ExBurst' }, base(), ctx); eq([b.result.origin, b.result.eventId, b.result.placement], ['community', null, null]); });
  await test('el resultado ya existente en ese puesto recibe la composición: no se crea otro y la presencia no cambia', async () => {
    const e = base(), b = X.build(txt(), T({ placement: 1, url: 'https://gcg-win-decks.jp/season/GD06/event/AAA/deck/BBB?x=1#y' }), e, ctx); ok(b.attachTo === 'metasheep:1:position:1', b.error);
    const out = X.apply(e, b, '2026-11-04'); eq(out.results.length, 1); eq(out.results[0].archetype, 'BG OYW'); eq(S.deckStatus(out.results[0]), 'complete'); eq(out.results[0].decklistUrl, 'https://gcg-win-decks.jp/season/GD06/event/AAA/deck/BBB');
    eq(S.presence(out.results, out.events, { set: 'GD06' }).n, 1);
  });
  await test('un puesto que ya tiene composición verificada no se pisa', async () => {
    const e = base(); e.results[0].cards = { 'GD06-001': 4, 'GD06-002': 4, 'GD06-003': 4, 'GD06-004': 4, 'GD06-005': 4, 'GD06-006': 4, 'GD06-007': 4, 'GD06-008': 4, 'GD06-009': 4, 'GD06-010': 4, 'GD06-011': 4, 'GD06-012': 4, 'GD06-013': 2 };
    ok(/ya tiene una composición/.test(X.build(txt(), T({ placement: 1 }), e, ctx).error));
  });
  await test('torneo nuevo de otra fuente con otra sede: se crea, suma 1 resultado y se registra su fuente', async () => {
    const e = base(), b = X.build(txt(), T({ event: undefined, eventId: 'windecks:ABC', date: '2026-11-03', name: 'Torneo X', venue: 'Tienda B', country: 'Japan', format: 'Standard', placement: 1, url: 'https://w.test/e/ABC/deck/1' }), e, ctx); ok(b.result, b.error);
    const out = X.apply(e, b, '2026-11-04'); eq(out.events.length, 2); eq(out.results.length, 2); eq(out.events.find((x) => x.id === 'windecks:ABC').sources[0].provider, 'windecks');
    eq(S.presence(out.results, out.events, { set: 'GD06' }).n, 1, 'un torneo con un solo mazo (single_deck) no entra en la presencia por defecto');
    eq(S.presence(out.results, out.events, { set: 'GD06', coverage: 'all' }).n, 2, 'sí si se pide expresamente mezclar coberturas');
  });
  await test('el mismo torneo ya cargado desde otra fuente (misma fecha, sede, nombre y país) se reconoce y no se duplica', async () => {
    const e = base(), b = X.build(txt(), T({ event: undefined, eventId: 'windecks:ZZZ', date: '2026-11-02', name: 'Newtype Challenge', venue: 'Tienda A', country: 'Japan', format: 'Standard', placement: 1 }), e, ctx); ok(b.result, b.error);
    const out = X.apply(e, b, '2026-11-04'); eq(out.events.length, 1); eq(out.events[0].sources.length, 2); eq(out.results.length, 1);
  });
  await test('sin sede para compararlo con uno existente de mismo nombre y día: avisa de posible duplicado', async () => {
    const b = X.build(txt(), T({ event: undefined, eventId: 'windecks:Q', date: '2026-11-02', name: 'Newtype Challenge', country: 'Japan', format: 'Standard', placement: 2 }), base(), ctx); eq(b.review.length, 1);
  });
  await test('torneo inexistente, sin puesto o sin datos del torneo nuevo: no se guarda', async () => {
    ok(/no existe/.test(X.build(txt(), T({ event: 'nada' }), base(), ctx).error));
    ok(/--placement/.test(X.build(txt(), T({ placement: undefined }), base(), ctx).error));
    ok(/--event-id/.test(X.build(txt(), T({ event: undefined }), base(), ctx).error));
  });
  await test('una línea ilegible, 49 cartas, 5 copias o un código fuera del catálogo: no se guarda nada', async () => {
    ok(/no se entienden/.test(X.build(txt('\nbasura'), T(), base(), ctx).error));
    ok(/49 cartas/.test(X.build(txt().replace('4 GD06-001', '3 GD06-001'), T(), base(), ctx).error));
    ok(/más de 4/.test(X.build(txt().replace('4 GD06-001', '5 GD06-001').replace('4 GD06-002', '3 GD06-002'), T(), base(), ctx).error));
    ok(/no existen en el catálogo.*ZZ99-001/.test(X.build(txt().replace('4 GD06-001', '4 ZZ99-001'), T(), base(), ctx).error));
  });
  await test('una lista ilegal según las reglas de construcción no se guarda', async () => {
    const ilegal = { getActiveRuleset: () => ({ id: 'r' }), validateDeck: () => ({ status: 'illegal', errors: [{ ruleType: 'deck_colors', cardNumbers: [] }] }) };
    ok(/Reglas de construcción.*deck_colors/.test(X.build(txt(), T(), base(), { catalog: fakeCatalog, rulesets: [], legality: ilegal }).error));
  });
  await test('con el catálogo y las reglas reales: una lista legal conocida pasa y una con tres colores no', async () => {
    const L = require('../legality.js'), real = { catalog: X.loadCatalog(), rulesets: X.loadRulesets(), legality: L };
    const dl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'decklists.json'), 'utf8')), cards = dl.archetypes[0].decks[0].cards;
    const asText = (c) => Object.keys(c).map((k) => c[k] + ' ' + k).join('\n');
    const e = { events: [{ id: 'e', date: '2026-11-02', name: 'N', set: 'GD06', sources: [] }], results: [] };
    const good = X.build(asText(cards), { origin: 'tournament', event: 'e', placement: 1, set: 'GD06', date: '2026-11-02' }, e, real); ok(good.result, good.error);
    const byColor = {}; Object.keys(real.catalog).forEach((n) => { const c = real.catalog[n]; if (c.color && !c.token) (byColor[c.color] = byColor[c.color] || []).push(n); });
    const mix = {}; let left = 50; ['Blue', 'Red', 'Green'].forEach((col) => (byColor[col] || []).slice(0, 5).forEach((n) => { const q = Math.min(4, left); if (q > 0) { mix[n] = q; left -= q; } }));
    eq(Object.values(mix).reduce((a, b) => a + b, 0), 50);
    const bad = X.build(asText(mix), { origin: 'tournament', event: 'e', placement: 1, set: 'GD06', date: '2026-11-02' }, e, real);
    ok(bad.error && /Reglas de construcción/.test(bad.error), bad.error || 'se aceptó una lista de tres colores');
  });
  await test('la misma composición ya guardada en el mismo torneo se detecta como duplicada', async () => {
    const e = base(), b1 = X.build(txt(), T({ placement: 3 }), e, ctx), out = X.apply(e, b1, '2026-11-04');
    ok(/misma composición ya está guardada/.test(X.build(txt(), T({ placement: 4 }), out, ctx).error));
  });
  await test('la URL de la lista se limpia (sin parámetros ni #) y debe ser https', async () => {
    eq(X.build(txt(), T({ url: 'https://a.test/x/y?u=persona#z' }), base(), ctx).result.decklistUrl, 'https://a.test/x/y');
    ok(/https/.test(X.build(txt(), T({ url: 'http://a.test/x' }), base(), ctx).error));
  });
  await test('sin clave, el importador de DigiLab no hace peticiones y avisa', async () => {
    const { spawnSync } = require('child_process'); const env = Object.assign({}, process.env); delete env.DIGILAB_API_KEY;
    const r = spawnSync('node', [path.join(__dirname, '..', 'scripts', 'import_digilab.js'), '--set', 'GD06', '--from', '2026-11-01', '--to', '2026-11-03'], { env, encoding: 'utf8', timeout: 20000 });
    eq(r.status, 2); ok(/Falta DIGILAB_API_KEY/.test(r.stdout) && /#api/.test(r.stdout));
  });

  console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
  process.exit(failed ? 1 : 0);
})();
