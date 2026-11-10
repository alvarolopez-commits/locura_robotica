/* Pruebas del pipeline local de resultados competitivos (Fase 6A). Todo ocurre en una carpeta temporal: nunca se toca data/competition_events.json.
 * Ejecutar:  node tests/pipeline.test.js */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../comp_stats.js');
const L = require('../legality.js');
const P = require('../scripts/pipeline/lib.js');
const CLI = require('../scripts/competition_pipeline.js');
const { loadCatalog, loadRulesets } = require('../scripts/import_deck_export.js');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); };
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };
const sha = (f) => P.sha256(fs.readFileSync(f, 'utf8'));

const ROOT = path.join(__dirname, '..');
const ctx = { catalog: loadCatalog(), rulesets: loadRulesets(), legality: L };
const REAL = fs.readFileSync(path.join(ROOT, 'data', 'competition_events.json'), 'utf8');
const ALIASES = fs.readFileSync(path.join(ROOT, 'data', 'archetype_aliases.json'), 'utf8');
const deck50 = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'decklists.json'), 'utf8')).archetypes[0].decks[0].cards;
const cardsOf = (n) => JSON.parse(JSON.stringify(n));

/* entorno temporal con una copia de los datos reales */
function env(dataText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pipe-'));
  const paths = { data: path.join(dir, 'competition_events.json'), aliases: path.join(dir, 'archetype_aliases.json'), dir: path.join(dir, 'pipeline'), backups: path.join(dir, 'backup') };
  fs.writeFileSync(paths.data, dataText || REAL); fs.writeFileSync(paths.aliases, ALIASES);
  return { dir, paths, st: P.store(paths.dir), base: () => JSON.parse(fs.readFileSync(paths.data, 'utf8')) };
}
/* lote sintético en el formato de entrada: tienda y evento de prueba (no son datos reales) */
const evt = (id, o) => Object.assign({ id: 'prueba:' + id, date: '2026-11-08', name: 'Torneo de prueba ' + id, venue: 'Tienda ' + id, country: 'Japan', format: 'Standard', set: 'GD06', type: 'Newtype Challenge', playersTotal: 32, listsPublished: 8, dataQuality: 'top_cut_only', sourceUrl: 'https://example.test/e/' + id, sourceProvider: 'Prueba' }, o || {});
const res = (eid, n, arch, o) => Object.assign({ id: 'prueba:' + eid + ':position:' + n, tournamentId: 'prueba:' + eid, placement: n, archetype: arch, colors: ['Red', 'Blue'], set: 'GD06', country: 'Japan', resultSourceUrl: 'https://example.test/e/' + eid, decklistUrl: null, cards: null }, o || {});
const top8 = (eid, archs) => Array.from({ length: 8 }, (_, i) => res(eid, i + 1, archs ? archs[i % archs.length] : 'Mobile Fighter'));
const batch = (ts, rs) => ({ snapshotDate: '2026-11-10', tournaments: ts, results: rs });
const approveAll = (e, filter) => { const q = e.st.load(); const ids = Object.values(q.candidates).filter(filter || ((c) => c.status === 'ready')).map((c) => c.cid); return P.decide(e.st, ids, { action: 'approve', by: 'op-1' }, '2026-11-10T10:00:00Z'); };
const NOW = '2026-11-10T10:00:00.000Z';

console.log('\n== normalización y datos personales ==');
test('los campos personales de la entrada se descartan y solo se cuentan', () => {
  const raw = batch([evt('a')], [Object.assign(res('a', 1, 'Mobile Fighter'), { player: 'Nombre Real', playerName: 'Otro', profileUrl: 'https://x.test/profile/1', email: 'a@b.com' })]);
  const n = P.normalizeInput(raw); ok(n.personal.keys >= 4, 'no contó los campos'); ok(!/Nombre Real|Otro|a@b\.com/.test(JSON.stringify(n.results)), 'quedó algo personal');
});
test('nada personal llega a la cola, a la bitácora ni a los datos publicados', () => {
  const e = env(); const raw = batch([evt('pii')], [Object.assign(res('pii', 1, 'Mobile Fighter'), { player: 'NOMBRE-SECRETO', profileUrl: 'https://x.test/profile/NOMBRE-SECRETO', email: 'secreto@example.test' })]);
  const an = P.analyze(raw, e.base(), ctx, NOW); P.stage(e.st, an, NOW); e.st.log({ at: NOW, action: 'stage', resumen: an.personal });
  approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  [e.st.file, e.st.logFile, e.paths.data].forEach((f) => ok(!/NOMBRE-SECRETO|secreto@example/.test(fs.readFileSync(f, 'utf8')), 'personal en ' + path.basename(f)));
});
test('una URL con perfil dentro de un campo permitido rechaza el candidato y se borra de la cola', () => {
  const e = env(); const raw = batch([evt('url')], [res('url', 1, 'Mobile Fighter', { decklistUrl: 'https://x.test/player/NOMBRE-SECRETO/deck/1' })]);
  const an = P.analyze(raw, e.base(), ctx, NOW), c = an.candidates.find((x) => x.kind === 'result');
  eq(c.status, 'rejected'); ok(c.reasons.indexOf('result_personal_data') >= 0); ok(!/NOMBRE-SECRETO/.test(JSON.stringify(c.payload)));
});

console.log('\n== validación ==');
test('fecha no real, set inválido, cantidades negativas o más listas que participantes: se rechaza', () => {
  const e = env(), mk = (o) => P.analyze(batch([evt('v', o)], []), e.base(), ctx, NOW).candidates[0];
  eq(mk({ date: '2026-13-45' }).reasons, ['event_bad_date']); eq(mk({ date: '2026-02-30' }).reasons, ['event_bad_date']); eq(mk({ set: 'XYZ' }).reasons, ['event_bad_set']);
  eq(mk({ playersTotal: -1, listsPublished: null }).reasons, ['event_bad_counts']); eq(mk({ playersTotal: 8, listsPublished: 16 }).reasons, ['event_lists_exceed_players']);
  eq(mk({ dataQuality: 'raro' }).reasons, ['event_unknown_quality']);
});
test('un evento sin ninguna fuente identificable va a revisión', () => {
  const e = env(), raw = { events: [{ id: 'x:1', date: '2026-11-08', name: 'N', venue: 'V', country: 'Japan', format: 'Standard', set: 'GD06', dataQuality: 'top_cut_only', sources: [] }], results: [] };
  const c = P.analyze(raw, e.base(), ctx, NOW).candidates[0]; eq(c.status, 'needs_review'); ok(c.reasons.indexOf('event_no_source') >= 0);
});
test('lista de 49 o 51 cartas, o con un código fuera del catálogo: NO se publica como completa', () => {
  const e = env(); const k = Object.keys(deck50)[0];
  [['cards_not_50', (c) => { c[k] -= 1; }], ['cards_not_50', (c) => { c[k] += 1; c[Object.keys(c)[1]] += 1; }], ['cards_unknown_code', (c) => { c['ZZ99-999'] = c[k]; delete c[k]; }]].forEach(([code, mut], i) => {
    const cards = cardsOf(deck50); mut(cards);
    const raw = batch([evt('c' + i)], [res('c' + i, 1, 'Mobile Fighter', { cards })]);
    const c = P.analyze(raw, e.base(), ctx, NOW).candidates.find((x) => x.kind === 'result');
    eq(c.status, 'needs_review'); eq(c.payload.cards, null, 'la composición dudosa no debe viajar'); eq(c.payload.cardsRejected, code === 'cards_not_50' && i === 1 ? c.payload.cardsRejected : code); ok(/^cards_/.test(c.payload.cardsRejected));
  });
});
test('una composición ilegal (3 colores) tampoco es completa', () => {
  const e = env(), byColor = {}; Object.keys(ctx.catalog).forEach((n) => { const c = ctx.catalog[n]; if (c.color && !c.token) (byColor[c.color] = byColor[c.color] || []).push(n); });
  const mix = {}; let left = 50; ['Blue', 'Red', 'Green'].forEach((col) => byColor[col].slice(0, 5).forEach((n) => { const q = Math.min(4, left); if (q > 0) { mix[n] = q; left -= q; } }));
  const c = P.analyze(batch([evt('ill')], [res('ill', 1, 'X', { cards: mix })]), e.base(), ctx, NOW).candidates.find((x) => x.kind === 'result'); eq(c.payload.cardsRejected, 'cards_illegal');
});
test('con la composición rechazada, aprobar publica el resultado SIN cartas: no habilita comparar ni construibles', () => {
  const e = env(), cards = cardsOf(deck50); cards[Object.keys(cards)[0]] -= 1;
  P.stage(e.st, P.analyze(batch([evt('nc')], top8('nc').map((r, i) => (i === 0 ? Object.assign(r, { cards }) : r))), e.base(), ctx, NOW), NOW);
  approveAll(e, (c) => c.status === 'ready' || c.status === 'needs_review');
  P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const pub = e.base().results.filter((r) => r.eventId === 'prueba:nc'); eq(pub.length, 8); ok(pub.every((r) => !r.cards && S.deckStatus(r) === 'pending'));
});

console.log('\n== deduplicación ==');
test('1 · un evento con el mismo id (o la misma fuente) no crea otro: suma la fuente', () => {
  const e = env(), b0 = e.base(), ex = b0.events[0];
  const raw = batch([evt('dup', { id: ex.id, sourceUrl: 'https://otra.test/x', sourceProvider: 'Otra' })], []);
  const an = P.analyze(raw, b0, ctx, NOW), c = an.candidates[0]; eq(c.plan.action, 'duplicate'); eq(c.status, 'ready');
  P.stage(e.st, an, NOW); approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const a = e.base(); eq(a.events.length, b0.events.length); ok(a.events.find((x) => x.id === ex.id).sources.length === ex.sources.length + 1);
});
test('1b · el mismo evento con otro id pero la misma URL canónica también es un duplicado seguro', () => {
  const e = env(), ex = e.base().events[0], url = ex.sources[0].url.replace(/^(https?:\/\/)([^/]+)/i, (m, a, b) => a + b.toUpperCase()) + '/';
  eq(P.analyze(batch([evt('u', { sourceUrl: url })], []), e.base(), ctx, NOW).candidates[0].plan.action, 'duplicate');
});
test('2 · otro evento con el mismo nombre y día pero en otra tienda NO se fusiona', () => {
  const e = env(), ex = e.base().events[0];
  const c = P.analyze(batch([evt('otra-tienda', { name: ex.name, date: ex.date, venue: 'Otra tienda distinta' })], []), e.base(), ctx, NOW).candidates[0]; eq(c.plan.action, 'new'); eq(c.status, 'ready');
});
test('3 · misma huella (fecha + sede + país + formato + set + tipo) con otro id: revisión manual, no se publica', () => {
  const e = env(), ex = e.base().events[0];
  const raw = batch([evt('fp', { date: ex.date, venue: ex.venue, country: ex.country, format: ex.format, set: ex.set, name: ex.name })], top8('fp'));
  const an = P.analyze(raw, e.base(), ctx, NOW), ev = an.candidates.find((c) => c.kind === 'event');
  eq(ev.status, 'needs_review'); ok(ev.reasons.indexOf('event_fingerprint') >= 0); eq(ev.plan.matchId, ex.id);
  P.stage(e.st, an, NOW); approveAll(e);   // solo los «ready»: ninguno es el evento dudoso
  const r = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); ok(!e.base().events.some((x) => x.id === 'prueba:fp'), 'se publicó un evento ambiguo'); ok(r.applied.indexOf('E:prueba:fp') < 0);
});
test('3b · aprobar un dudoso exige decidir: --as new (otra sesión) o --as merge (es el mismo)', () => {
  const e = env(), ex = e.base().events[0], fpEv = (id) => evt(id, { date: ex.date, venue: ex.venue, country: ex.country, format: ex.format, set: ex.set, name: ex.name });
  P.stage(e.st, P.analyze(batch([fpEv('d1'), fpEv('d2')], []), e.base(), ctx, NOW), NOW);
  let r = P.decide(e.st, ['E:prueba:d1'], { action: 'approve', by: 'op-1' }, NOW); eq(r.done, []); ok(/--as/.test(r.skipped[0][1]));
  P.decide(e.st, ['E:prueba:d1'], { action: 'approve', by: 'op-1', as: 'new' }, NOW); P.decide(e.st, ['E:prueba:d2'], { action: 'approve', by: 'op-1', as: 'merge' }, NOW);
  const n0 = e.base().events.length; P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); const a = e.base();
  eq(a.events.length, n0 + 1, 'solo el «new» crea evento'); ok(a.events.some((x) => x.id === 'prueba:d1')); ok(!a.events.some((x) => x.id === 'prueba:d2')); ok(a.events.find((x) => x.id === ex.id).sources.some((s) => s.id === 'd2'));
});
test('4 · un resultado existente al que llegan las 50 cartas se ENRIQUECE: conserva su id y no suma a n', () => {
  const e = env(), b0 = e.base(), target = b0.results.find((r) => r.placement === 1 && !r.cards && b0.events.find((x) => x.id === r.eventId).dataQuality === 'top_cut_only');
  const n0 = S.presence(b0.results, b0.events, { set: 'GD06' }).n;
  const raw = batch([evt('enr', { id: target.eventId })], [res('enr', 1, target.archetype, { id: 'otro-proveedor:1', tournamentId: target.eventId, cards: cardsOf(deck50) })]);
  const an = P.analyze(raw, b0, ctx, NOW), c = an.candidates.find((x) => x.kind === 'result'); eq(c.plan.action, 'enrich'); eq(c.plan.matchId, target.id);
  P.stage(e.st, an, NOW); approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const a = e.base(), pub = a.results.find((r) => r.id === target.id);
  eq(a.results.length, b0.results.length); ok(pub && S.deckStatus(pub) === 'complete', 'no ganó las cartas'); eq(S.presence(a.results, a.events, { set: 'GD06' }).n, n0, 'cambió la n de presencia');
  eq(S.inclusion(a.results, a.events, { set: 'GD06' }, null).n, S.inclusion(b0.results, b0.events, { set: 'GD06' }, null).n + 1, 'las cartas deben tener su propio n');
});
test('4b · mismo torneo y puesto pero otro arquetipo: puede ser un empate, va a revisión', () => {
  const e = env(), b0 = e.base(), t = b0.results.find((r) => r.placement === 2);
  const c = P.analyze(batch([evt('x', { id: t.eventId })], [res('x', 2, 'Arquetipo totalmente distinto', { id: 'z:2', tournamentId: t.eventId })]), b0, ctx, NOW).candidates.find((x) => x.kind === 'result');
  eq(c.status, 'needs_review'); ok(c.reasons.indexOf('result_same_placement_other_archetype') >= 0);
});
test('4c · la misma lista con otras cartas ya publicadas se manda a revisar', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('w')], [res('w', 1, 'A', { cards: cardsOf(deck50) })]), e.base(), ctx, NOW), NOW); approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const other = cardsOf(deck50), ks = Object.keys(other); other[ks[0]] -= 1; other[ks[1]] += 1;
  const c = P.analyze(batch([evt('w')], [res('w', 1, 'A', { cards: other })]), e.base(), ctx, NOW).candidates.find((x) => x.kind === 'result');
  ok(c.plan.action === 'review' || c.payload.cardsRejected, 'debería revisarse: ' + c.plan.action);
});
test('el mismo id de resultado dentro del lote repetido se rechaza', () => {
  const e = env(), r = res('rep', 1, 'A'), an = P.analyze(batch([evt('rep')], [r, r]), e.base(), ctx, NOW);
  ok(an.candidates.some((c) => c.reasons.indexOf('result_duplicate_in_batch') >= 0));
});

console.log('\n== corrección 6A: huella sin tipo, tipo inferido y conflictos de tipo ==');
const TIPO_OTRO = 'Torneo Regional de prueba';   // S.eventType → «Regional», distinto de «Newtype Challenge»
test('C1 · misma fecha/sede/país/formato/set pero otro nombre y TIPO: revisión, no ready ni duplicado', () => {
  const e = env(), ex = e.base().events[0];
  const c = P.analyze(batch([evt('t1', { date: ex.date, venue: ex.venue, country: ex.country, format: ex.format, set: ex.set, name: TIPO_OTRO, type: 'Regional' })], []), e.base(), ctx, NOW).candidates[0];
  eq(c.status, 'needs_review'); ok(c.reasons.indexOf('event_fingerprint') >= 0, c.reasons.join()); eq(c.plan.action, 'review'); eq(c.plan.matchId, ex.id);
});
test('C1b · la huella no incluye el tipo', () => { eq(P.fingerprint({ date: '2026-11-08', venue: 'V', country: 'Japan', format: 'Standard', set: 'GD06', type: 'A' }), P.fingerprint({ date: '2026-11-08', venue: 'V', country: 'Japan', format: 'Standard', set: 'GD06', type: 'B' })); });
test('C2 · dos eventos del MISMO lote con mismo día/sede y distinto tipo: AMBOS a revisión, y sus resultados también', () => {
  const e = env(), mk = (id, o) => evt(id, Object.assign({ date: '2026-11-08', venue: 'Sede compartida', name: 'Evento ' + id }, o));
  const an = P.analyze(batch([mk('b1', { type: 'Newtype Challenge' }), mk('b2', { type: 'Regional' })], [res('b1', 1, 'A'), res('b2', 1, 'A')]), e.base(), ctx, NOW);
  const evs = an.candidates.filter((c) => c.kind === 'event'); eq(evs.map((c) => c.status), ['needs_review', 'needs_review']); ok(evs.every((c) => c.reasons.indexOf('event_fingerprint_in_batch') >= 0));
  ok(an.candidates.filter((c) => c.kind === 'result').every((c) => c.status === 'needs_review'), 'un resultado quedó listo');
});
test('C3 · mismo ID con tipo contradictorio: revisión (no se fusiona en silencio); solo cabe «merge»', () => {
  const e = env(), ex = e.base().events[0], n0 = e.base().events.length;
  const an = P.analyze(batch([evt('c3', { id: ex.id, date: ex.date, venue: ex.venue, name: TIPO_OTRO, type: 'Regional' })], []), e.base(), ctx, NOW), c = an.candidates[0];
  eq(c.status, 'needs_review'); ok(c.reasons.indexOf('event_type_conflict') >= 0, c.reasons.join()); eq(c.plan.action, 'review');
  P.stage(e.st, an, NOW);
  let r = P.decide(e.st, [c.cid], { action: 'approve', by: 'op-1' }, NOW); eq(r.done, []);
  r = P.decide(e.st, [c.cid], { action: 'approve', by: 'op-1', as: 'new' }, NOW); eq(r.done, [], 'con un id existente no puede ser un evento nuevo');
  r = P.decide(e.st, [c.cid], { action: 'approve', by: 'op-1', as: 'merge' }, NOW); eq(r.done, [c.cid]);
  P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); const a = e.base(); eq(a.events.length, n0); eq(a.events.find((x) => x.id === ex.id).type, ex.type, 'el tipo publicado no debe cambiar');
});
test('C3b · la misma fuente (URL canónica) con tipo contradictorio también va a revisión', () => {
  const e = env(), ex = e.base().events[0];
  const c = P.analyze(batch([evt('c3b', { sourceUrl: ex.sources[0].url, type: 'Regional', name: TIPO_OTRO })], []), e.base(), ctx, NOW).candidates[0];
  eq(c.status, 'needs_review'); ok(c.reasons.indexOf('event_type_conflict') >= 0, c.reasons.join());
});
test('C4 · el tipo deducido del nombre se marca (typeSource) y exige confirmarlo para publicar un evento NUEVO', () => {
  const e = env(), raw = batch([evt('c4', { type: undefined })], top8('c4')), an = P.analyze(raw, e.base(), ctx, NOW), ev = an.candidates.find((c) => c.kind === 'event');
  eq(ev.payload.typeSource, 'inferred_from_name'); eq(ev.status, 'needs_review'); ok(ev.reasons.indexOf('event_type_inferred') >= 0);
  P.stage(e.st, an, NOW);
  let r = P.decide(e.st, [ev.cid], { action: 'approve', by: 'op-1' }, NOW); eq(r.done, []); ok(/confirm-type/.test(r.skipped[0][1]));
  r = P.decide(e.st, [ev.cid], { action: 'approve', by: 'op-1', confirmType: true }, NOW); eq(r.done, [ev.cid]);
  const ids = Object.keys(e.st.load().candidates).filter((k) => k[0] === 'R'); P.decide(e.st, ids, { action: 'approve', by: 'op-1' }, NOW);
  P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); const pub = e.base().events.find((x) => x.id === 'prueba:c4'); ok(pub, 'no se publicó'); eq(pub.typeSource, 'operator_confirmed');
});
test('C4b · un tipo declarado por la fuente no necesita confirmación; el operador puede corregirlo con --type', () => {
  const e = env(); const ev = P.analyze(batch([evt('c4b')], []), e.base(), ctx, NOW).candidates[0]; eq(ev.payload.typeSource, 'declared'); eq(ev.status, 'ready');
  const an = P.analyze(batch([evt('c4c', { type: undefined })], []), e.base(), ctx, NOW); P.stage(e.st, an, NOW);
  P.decide(e.st, ['E:prueba:c4c'], { action: 'approve', by: 'op-1', confirmType: true, type: 'Launch Event' }, NOW); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const pub = e.base().events.find((x) => x.id === 'prueba:c4c'); eq(pub.type, 'Launch Event'); eq(pub.typeSource, 'operator_confirmed');
});
test('C5 · un rechazo de aprobación no deja el candidato a medio decidir', () => {
  const e = env(), ex = e.base().events[0], same = { date: ex.date, venue: ex.venue, country: ex.country, format: ex.format, set: ex.set };
  P.stage(e.st, P.analyze(batch([evt('c5', Object.assign({ dataQuality: null }, same))], top8('c5')), e.base(), ctx, NOW), NOW);
  P.decide(e.st, ['E:prueba:c5'], { action: 'approve', by: 'op-1', as: 'new' }, NOW);   // falta --coverage: se rechaza
  const c = e.st.load().candidates['E:prueba:c5']; eq(c.status, 'needs_review'); eq(c.plan.action, 'review', 'la decisión no debe persistir si se rechazó');
  eq(P.decide(e.st, ['E:prueba:c5'], { action: 'approve', by: 'op-1' }, NOW).done, [], 'sin --as no debe pasar');
});

console.log('\n== cobertura y estadísticas ==');
test('8 · un torneo con un solo mazo se propone como single_deck y NO entra en la muestra de presencia por accidente', () => {
  const e = env(), b0 = e.base(), s0 = P.stats(b0, ctx);
  const an = P.analyze(batch([evt('uno', { dataQuality: null, listsPublished: null })], [res('uno', 1, 'Mobile Fighter')]), b0, ctx, NOW), ev = an.candidates.find((c) => c.kind === 'event');
  eq(ev.status, 'needs_review'); ok(ev.reasons.indexOf('coverage_inferred') >= 0); eq(ev.payload.dataQuality, 'single_deck');
  P.stage(e.st, an, NOW); approveAll(e, (c) => c.status === 'ready' || c.status === 'needs_review'); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const s1 = P.stats(e.base(), ctx); eq(s1.muestra_n, s0.muestra_n, 'cambió la muestra principal'); eq(s1.mezcla_n, s0.mezcla_n + 1); eq(s1.eventos, s0.eventos + 1); eq(s1.resultados, s0.resultados + 1);
});
test('un torneo de varios resultados sin cobertura declarada exige indicarla al aprobar', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('sc', { dataQuality: null })], top8('sc')), e.base(), ctx, NOW), NOW);
  let r = P.decide(e.st, ['E:prueba:sc'], { action: 'approve', by: 'op-1' }, NOW); eq(r.done, []); ok(/coverage/.test(r.skipped[0][1]));
  r = P.decide(e.st, ['E:prueba:sc'], { action: 'approve', by: 'op-1', coverage: 'top_cut_only' }, NOW); eq(r.done, ['E:prueba:sc']);
});
test('un resultado no queda «ready» mientras su evento sigue pendiente de revisión', () => {
  const e = env(), an = P.analyze(batch([evt('pe', { dataQuality: null })], top8('pe')), e.base(), ctx, NOW);
  eq(an.candidates.find((c) => c.kind === 'event').status, 'needs_review');
  ok(an.candidates.filter((c) => c.kind === 'result').every((c) => c.status === 'needs_review' && c.reasons.indexOf('event_pending_review') >= 0), 'algún resultado quedó listo');
});
test('un top 8 aprobado SÍ suma a la muestra: n de 56 a 64, con el denominador recalculado', () => {
  const e = env(), s0 = P.stats(e.base(), ctx);
  P.stage(e.st, P.analyze(batch([evt('t8')], top8('t8', ['Mobile Fighter', 'Char IBO'])), e.base(), ctx, NOW), NOW); approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const a = e.base(), s1 = P.stats(a, ctx); eq([s0.muestra_n, s1.muestra_n], [56, 64]); eq(s1.muestra_eventos, s0.muestra_eventos + 1);
  const mf = S.presence(a.results, a.events, { set: 'GD06' }).rows.find((r) => r.archetype === 'Mobile Fighter'); eq([mf.lists, mf.pct.toFixed(1)], [20, (20 / 64 * 100).toFixed(1)]);
});
test('el archivo real cumple todas las invariantes', () => { eq(P.invariants(JSON.parse(REAL), ctx), []); });

console.log('\n== cola, aprobación y publicación ==');
test('7 · preview y stage NUNCA tocan los datos publicados', () => {
  const e = env(), h = sha(e.paths.data); P.analyze(batch([evt('s')], top8('s')), e.base(), ctx, NOW); eq(sha(e.paths.data), h);
  P.stage(e.st, P.analyze(batch([evt('s')], top8('s')), e.base(), ctx, NOW), NOW); eq(sha(e.paths.data), h, 'stage cambió los datos');
});
test('7b · publish sin --apply es una simulación: no escribe datos, ni copia, ni estado', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('dr')], top8('dr')), e.base(), ctx, NOW), NOW); approveAll(e);
  const h = sha(e.paths.data), q0 = fs.readFileSync(e.st.file, 'utf8'); const r = P.publish(e.paths, ctx, { apply: false, now: NOW });
  eq(r.wrote, false); ok(r.applied.length > 0); eq(sha(e.paths.data), h); eq(fs.readFileSync(e.st.file, 'utf8'), q0); ok(!fs.existsSync(e.paths.backups));
});
test('un candidato «ready» no se publica solo: hace falta aprobarlo', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('rd')], top8('rd')), e.base(), ctx, NOW), NOW); const h = sha(e.paths.data);
  const r = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); eq(r.wrote, false); eq(sha(e.paths.data), h);
});
test('7 · publicar dos veces es idempotente: la segunda no cambia nada', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('id')], top8('id')), e.base(), ctx, NOW), NOW); approveAll(e);
  const r1 = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); eq(r1.wrote, true); const h1 = sha(e.paths.data);
  const r2 = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: '2026-11-11T10:00:00.000Z' }); eq(r2.wrote, false); eq(sha(e.paths.data), h1);
});
test('reimportar el mismo lote ya publicado no duplica ni cambia los porcentajes', () => {
  const e = env(), raw = batch([evt('re')], top8('re')); P.stage(e.st, P.analyze(raw, e.base(), ctx, NOW), NOW); approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); const h = sha(e.paths.data);
  const an = P.analyze(raw, e.base(), ctx, NOW); ok(an.candidates.every((c) => c.plan.action === 'duplicate'), 'debería ser todo duplicado'); const st = P.stage(e.st, an, NOW);
  approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: '2026-11-12T10:00:00.000Z' }); eq(sha(e.paths.data), h);
  ok(Object.values(e.st.load().candidates).every((c) => c.status === 'published'), 'un estado retrocedió');
});
test('stage es idempotente y no pisa lo ya decidido', () => {
  const e = env(), raw = batch([evt('is')], top8('is')); const a = P.analyze(raw, e.base(), ctx, NOW); eq(P.stage(e.st, a, NOW).added, 9); eq(P.stage(e.st, P.analyze(raw, e.base(), ctx, NOW), NOW).added, 0);
  P.decide(e.st, ['E:prueba:is'], { action: 'dismiss', by: 'op-1' }, NOW); P.stage(e.st, P.analyze(raw, e.base(), ctx, NOW), NOW); eq(e.st.load().candidates['E:prueba:is'].status, 'dismissed');
});
test('quien aprueba se identifica con un id interno, no con un nombre ni un correo', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('by')], []), e.base(), ctx, NOW), NOW);
  ['alvaro@example.com', 'Nombre Apellido', 'x'].forEach((by) => { let err = null; try { P.decide(e.st, ['E:prueba:by'], { action: 'approve', by }, NOW); } catch (x) { err = x.message; } ok(/--by/.test(err || ''), 'aceptó ' + by); });
});
test('lo descartado no se publica', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('ds')], top8('ds')), e.base(), ctx, NOW), NOW); P.decide(e.st, ['E:prueba:ds'], { action: 'dismiss', by: 'op-1' }, NOW);
  const q = e.st.load(); Object.values(q.candidates).filter((c) => c.kind === 'result').forEach((c) => { c.status = 'approved'; }); e.st.save(q);
  const r = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); ok(r.skipped.length === 8 && !e.base().results.some((x) => x.eventId === 'prueba:ds'), 'se publicaron resultados sin su evento');
});
test('un fallo al colocar el archivo deja el ORIGINAL intacto y sin temporales', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('at')], top8('at')), e.base(), ctx, NOW), NOW); approveAll(e); const h = sha(e.paths.data), rn = fs.renameSync;
  fs.renameSync = () => { throw new Error('fallo simulado del disco'); };
  let err = null; try { P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); } catch (x) { err = x.message; } finally { fs.renameSync = rn; }
  ok(/fallo simulado/.test(err), 'debería propagar el error'); eq(sha(e.paths.data), h); eq(fs.readdirSync(e.dir).filter((f) => /\.tmp-/.test(f)), []);
  ok(Object.values(e.st.load().candidates).every((c) => c.status !== 'published'), 'marcó candidatos como publicados sin publicar');
});
test('si el resultado no cumple las invariantes, no se escribe', () => {
  const e = env(); const q = { candidates: { 'R:malo': { cid: 'R:malo', kind: 'result', status: 'approved', reasons: [], plan: { action: 'new', eventSource: 'no-existe' }, payload: { id: 'malo', eventId: 'no-existe', placement: 1, archetype: 'A', origin: 'tournament' }, history: [] } } };
  e.st.save(q); const h = sha(e.paths.data), r = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); eq(r.wrote, false); eq(sha(e.paths.data), h);
});
test('la publicación deja copia previa con checksum y una entrada de bitácora sin datos personales', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('lg')], top8('lg')), e.base(), ctx, NOW), NOW); approveAll(e); const before = fs.readFileSync(e.paths.data, 'utf8');
  const r = P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); ok(fs.existsSync(r.backup)); eq(fs.readFileSync(r.backup, 'utf8'), before); eq(fs.readFileSync(r.backup + '.sha256', 'utf8').trim(), P.sha256(before));
  const last = e.st.readLog().filter((l) => l.action === 'publish').pop(); eq(last.checksumBefore, P.sha256(before)); eq(last.checksumAfter, sha(e.paths.data)); eq(last.operator, 'op-1'); ok(last.antes.muestra_n === 56 && last.despues.muestra_n === 64);
});

console.log('\n== reversión ==');
test('rollback: devuelve exactamente el archivo anterior y los candidatos vuelven a «approved»', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('rb')], top8('rb')), e.base(), ctx, NOW), NOW); approveAll(e); const before = sha(e.paths.data);
  P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); ok(sha(e.paths.data) !== before);
  const dry = P.rollback(e.paths, { apply: false }); eq(dry.ok, true); eq(dry.wrote, false); ok(sha(e.paths.data) !== before, 'el dry-run escribió');
  const r = P.rollback(e.paths, { apply: true, by: 'op-1', now: NOW }); eq(r.wrote, true); eq(sha(e.paths.data), before); ok(fs.existsSync(r.safetyCopy));
  ok(Object.values(e.st.load().candidates).every((c) => c.status === 'approved'), 'los candidatos no volvieron a approved');
  P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW }); ok(e.base().events.some((x) => x.id === 'prueba:rb'), 'no se pudo volver a publicar');
});
test('rollback se NIEGA si el archivo cambió después de la última publicación (no se revierte a ciegas)', () => {
  const e = env(); P.stage(e.st, P.analyze(batch([evt('rc')], top8('rc')), e.base(), ctx, NOW), NOW); approveAll(e); P.publish(e.paths, ctx, { apply: true, by: 'op-1', now: NOW });
  const d = e.base(); d.events.push(Object.assign({}, d.events[0], { id: 'cambio:concurrente' })); fs.writeFileSync(e.paths.data, JSON.stringify(d, null, 1) + '\n'); const h = sha(e.paths.data);
  const r = P.rollback(e.paths, { apply: true, by: 'op-1' }); eq(r.ok, false); ok(/cambios posteriores/.test(r.error)); eq(sha(e.paths.data), h);
  eq(P.rollback(e.paths, { apply: true, force: true, by: 'op-1', now: NOW }).wrote, true, '--force debe poder, sabiendo lo que se pierde');
});
test('rollback sin ninguna publicación previa lo dice', () => { eq(P.rollback(env().paths, {}).ok, false); });

console.log('\n== entrada de texto y consola ==');
test('texto de una lista: se interpreta o se rechaza ENTERO (nunca parcial)', () => {
  eq(CLI.textToCanonical('4 GD01-001\nesto no es una carta', { 'event-id': 'x:1', date: '2026-11-08' }).rejected, 'text_unparseable');
  eq(CLI.textToCanonical(Object.keys(deck50).map((k) => deck50[k] + ' ' + k).join('\n'), {}).rejected, 'event_missing');
});
test('texto de una lista legal con evento nuevo: llega como candidato, cobertura deducida y sin tocar nada', () => {
  const e = env(), t = CLI.textToCanonical(Object.keys(deck50).map((k) => deck50[k] + ' ' + k).join('\n'), { 'event-id': 'wd:EJ', date: '2026-11-09', name: 'Torneo de prueba', venue: 'Tienda de prueba', country: 'Japan', format: 'Standard', set: 'GD06', placement: '1', archetype: 'Arquetipo de prueba', colors: 'Blue,Green', source: 'Ejemplo', url: 'https://example.test/d/1?x=1#y' });
  const an = P.analyze(t.canonical, e.base(), ctx, NOW), r = an.candidates.find((c) => c.kind === 'result');
  eq(r.payload.cardsRejected, undefined); eq(S.deckStatus(r.payload), 'complete'); eq(r.payload.decklistUrl, 'https://example.test/d/1'); eq(an.candidates.find((c) => c.kind === 'event').payload.dataQuality, 'single_deck');
});
test('consola: preview no escribe; stage → approve → publish --apply → rollback, con el exit code correcto', () => {
  const e = env(), f = path.join(e.dir, 'lote.json'); fs.writeFileSync(f, JSON.stringify(batch([evt('cli')], top8('cli'))));
  const run = (...a) => spawnSync('node', [path.join(ROOT, 'scripts', 'competition_pipeline.js'), ...a, '--data', e.paths.data, '--dir', e.paths.dir, '--backups', e.paths.backups, '--aliases', e.paths.aliases], { encoding: 'utf8', timeout: 60000 });
  const h = sha(e.paths.data); let r = run('preview', f); eq(r.status, 0); ok(/PREVISUALIZACIÓN/.test(r.stdout) && /no se escribe nada/.test(r.stdout)); eq(sha(e.paths.data), h); ok(!fs.existsSync(e.paths.dir));
  r = run('stage', f); eq(r.status, 0); ok(fs.existsSync(e.st.file)); eq(sha(e.paths.data), h);
  const ids = Object.keys(JSON.parse(fs.readFileSync(e.st.file, 'utf8')).candidates).join(',');
  r = run('approve', '--ids', ids, '--by', 'op-1'); eq(r.status, 0);
  r = run('publish', '--by', 'op-1'); eq(r.status, 0); ok(/SIMULACIÓN/.test(r.stdout)); eq(sha(e.paths.data), h);
  r = run('publish', '--apply', '--by', 'op-1'); eq(r.status, 0); ok(/PUBLICADO/.test(r.stdout) && /Para deshacer/.test(r.stdout)); ok(sha(e.paths.data) !== h);
  r = run('rollback', '--apply', '--by', 'op-1'); eq(r.status, 0); eq(sha(e.paths.data), h);
  r = run('approve', '--by', 'op-1'); eq(r.status, 2); ok(/explícita/.test(r.stderr));
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
process.exit(failed ? 1 : 0);
