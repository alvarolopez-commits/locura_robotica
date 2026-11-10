/* Pruebas de las estadísticas de Competición (deduplicación, presencia, inclusión). Ejecutar:  node tests/comp_stats.test.js */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');
const { mapBatch, merge } = require('../scripts/import_competition_batch.js');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'condición falsa'); }
function near(a, b, msg) { if (Math.abs(a - b) > 1e-9) throw new Error((msg || 'valor') + ': esperado ' + b + ' y salió ' + a); }

const ev = (id, o) => Object.assign({ id, date: '2026-11-02', name: 'Newtype Challenge 2026 MISSION 5', venue: 'Tienda A', country: 'Japan', format: 'Standard', set: 'GD06', type: 'Newtype Challenge',
  sources: [{ provider: 'metasheep', id, url: 'https://metasheep.gg/t/' + id, primary: true }] }, o || {});
const res = (eventId, placement, player, archetype, o) => Object.assign({ id: eventId + ':' + placement, eventId, placement, player, archetype, set: 'GD06', country: 'Japan', cards: null }, o || {});
const full = (extra) => { const c = {}; for (let i = 1; i <= 12; i++) c['GD06-' + String(i).padStart(3, '0')] = 4; c['GD06-013'] = 2; return Object.assign(c, extra || {}); };   // 12×4 + 2 = 50

console.log('\n== eventos repetidos y distintos ==');
test('mismo evento con el mismo id dos veces: un solo registro', () => {
  const r = S.dedupeEvents([ev('a'), ev('a')]);
  eq(r.events.length, 1); eq(r.merged.length, 1);
});
test('mismo evento desde otro proveedor (otra URL, mismos fecha, sede, set y país): se funde y se guardan las dos fuentes', () => {
  const b = ev('b', { sources: [{ provider: 'bandai', id: '777', url: 'https://example.org/e/777' }] });
  const r = S.dedupeEvents([ev('a'), b]);
  eq(r.events.length, 1); eq(r.events[0].sources.length, 2); eq(r.events[0].sources[0].primary, true); eq(r.events[0].sources[1].primary, false);
  eq(r.events[0].id, 'a', 'la fuente principal manda en el id');
});
test('mismo evento con la misma URL canónica (mayúsculas, barra final, www): se funde aunque el resto difiera', () => {
  const b = ev('b', { venue: 'otra sede', sources: [{ provider: 'otro', id: 'x', url: 'HTTPS://WWW.metasheep.gg/t/a/' }] });
  eq(S.dedupeEvents([ev('a'), b]).events.length, 1);
});
test('variantes triviales de escritura (anchura completa, puntuación, espacios, mayúsculas) se funden', () => {
  const a = ev('a', { venue: 'Japan TCG Center 吉祥寺駅北口店' });
  const b = ev('b', { venue: 'JAPAN  TCG  Ｃｅｎｔｅｒ, 吉祥寺駅北口店.', sources: [{ provider: 'x', id: '1', url: 'https://x.test/1' }] });
  eq(S.dedupeEvents([a, b]).events.length, 1);
});
test('dos eventos distintos el mismo día con el mismo nombre genérico y sedes distintas NO se funden', () => {
  const r = S.dedupeEvents([ev('a', { venue: 'Tienda A' }), ev('b', { venue: 'Tienda B' })]);
  eq(r.events.length, 2); eq(r.merged.length, 0); eq(r.review.length, 0);
});
test('mismo nombre y fecha con otro país: son eventos distintos', () => {
  eq(S.dedupeEvents([ev('a'), ev('b', { country: 'Spain' })]).events.length, 2);
});
test('sin sede en uno de los dos: no se funde, no se borra y queda marcado para revisión', () => {
  const r = S.dedupeEvents([ev('a'), ev('b', { venue: '', sources: [{ provider: 'otra', id: '9', url: 'https://otra.test/9' }] })]);
  eq(r.events.length, 2); eq(r.review.length, 1); eq(r.review[0].a, 'a'); eq(r.review[0].b, 'b');
});
test('misma fuente con ids distintos, misma tienda y día (dos turnos): dos eventos, sin revisión', () => {
  const r = S.dedupeEvents([ev('a'), ev('b')]);
  eq(r.events.length, 2); eq(r.merged.length, 0); eq(r.review.length, 0);
});
test('misma fuente con ids distintos y sin sede (como Side-6): dos eventos, sin revisión', () => {
  const r = S.dedupeEvents([ev('a', { venue: '' }), ev('b', { venue: '' })]);
  eq(r.events.length, 2); eq(r.review.length, 0);
});
test('es idempotente: pasar la salida otra vez no cambia nada', () => {
  const once = S.dedupeEvents([ev('a'), ev('b', { sources: [{ provider: 'bandai', id: '7', url: 'https://e.org/7' }] }), ev('c', { venue: 'Tienda C' })]);
  const twice = S.dedupeEvents(once.events);
  eq(twice.events, once.events); eq(twice.review, once.review);
});

console.log('\n== listas repetidas (sin nombres de jugador) ==');
test('misma lista (evento + puesto + arquetipo) por dos fuentes: cuenta una vez; se queda la que trae las 50 cartas', () => {
  const a = res('e1', 1, null, 'Mobile Fighter', { id: 'metasheep:1' }), b = res('e1', 1, null, ' mobile  fighter ', { id: 'digilab:9', cards: full() });
  const r = S.dedupeResults([a, b]);
  eq(r.results.length, 1); eq(r.dropped.length, 1); eq(S.deckStatus(r.results[0]), 'complete');
});
test('el mismo puesto y arquetipo en dos eventos distintos cuenta dos veces', () => {
  eq(S.dedupeResults([res('e1', 1, null, 'X', { id: 'a' }), res('e2', 1, null, 'X', { id: 'b' })]).results.length, 2);
});
test('dos listas con el mismo puesto en el mismo evento: dos si tienen id distinto o distinto arquetipo', () => {
  eq(S.dedupeResults([res('e1', 3, null, 'X', { id: 'a' }), res('e1', 3, null, 'X', { id: 'b' })]).results.length, 2);
  eq(S.dedupeResults([res('e1', 3, null, 'X', { id: undefined }), res('e1', 3, null, 'Y', { id: undefined })]).results.length, 2);
});

console.log('\n== presencia de arquetipos ==');
const e16 = ev('e16', { playersTotal: 64, listsPublished: 16 }), e8 = ev('e8', { playersTotal: 32, listsPublished: 8, venue: 'Tienda B', date: '2026-11-03' });
const mk = (eid, n, arq) => Array.from({ length: n }, (_, i) => res(eid, i + 1, eid + '-' + arq + '-' + i, arq(i)));
const r16 = Array.from({ length: 16 }, (_, i) => res('e16', i + 1, 'p' + i, i < 4 ? 'Mobile Fighter' : i < 8 ? 'Char IBO' : 'Otros ' + (i % 4)));
const r8 = Array.from({ length: 8 }, (_, i) => res('e8', i + 1, 'q' + i, i < 2 ? 'Mobile Fighter' : 'Char IBO'));
test('muestra de 16: el denominador son las 16 listas, no los 64 inscritos', () => {
  const p = S.presence(r16, [e16], { set: 'GD06' });
  eq(p.n, 16); const mf = p.rows.find((x) => x.archetype === 'Mobile Fighter'); eq(mf.lists, 4); near(mf.pct, 25);
});
test('muestra de 8: el denominador son las 8 listas, no los 32 inscritos', () => {
  const p = S.presence(r8, [e8], {}); eq(p.n, 8); near(p.rows[0].pct, 75);
});
test('combinar 16 + 8: n=24 y los porcentajes salen de 24', () => {
  const p = S.presence(r16.concat(r8), [e16, e8], {}); eq(p.n, 24); eq(p.events, 2);
  near(p.rows.find((x) => x.archetype === 'Mobile Fighter').pct, 6 / 24 * 100);
  near(p.rows.reduce((s, x) => s + x.pct, 0), 100, 'los porcentajes suman 100');
});
test('Top 8 sobre una muestra de 16 recalcula el denominador (n=8)', () => {
  const p = S.presence(r16, [e16], { topN: 8 }); eq(p.n, 8);
  near(p.rows.find((x) => x.archetype === 'Mobile Fighter').pct, 50);
});
test('filtros por país y fechas recalculan el denominador', () => {
  const es = ev('es', { country: 'Spain', date: '2026-10-20', venue: 'Madrid' });
  const all = r16.concat([res('es', 1, 'z', 'Char IBO', { country: 'Spain' })]);
  const evs = [e16, es];
  eq(S.presence(all, evs, { country: 'Spain' }).n, 1);
  eq(S.presence(all, evs, { country: 'Japan' }).n, 16);
  eq(S.presence(all, evs, { from: '2026-11-01' }).n, 16);
  eq(S.presence(all, evs, { to: '2026-10-31' }).n, 1);
});
test('GD06, GD05.5 y GD05 no se mezclan: cada filtro de set tiene su propio n', () => {
  const eA = ev('a5', { set: 'GD05', venue: 'V5', date: '2026-09-01' }), eB = ev('b55', { set: 'GD05.5', venue: 'V55', date: '2026-10-01' });
  const rs = r16.concat([res('a5', 1, 'u', 'Z', { set: 'GD05' }), res('a5', 2, 'v', 'Z', { set: 'GD05' }), res('b55', 1, 'w', 'Y', { set: 'GD05.5' })]);
  const evs = [e16, eA, eB];
  eq(S.presence(rs, evs, { set: 'GD06' }).n, 16); eq(S.presence(rs, evs, { set: 'GD05' }).n, 2); eq(S.presence(rs, evs, { set: 'GD05.5' }).n, 1);
  eq(S.presence(rs, evs, { set: 'GD05' }).rows.map((x) => x.archetype), ['Z']);
});
test('caso vacío: n=0, sin filas y sin dividir entre cero', () => {
  const p = S.presence([], [e16], {}); eq(p.n, 0); eq(p.rows, []);
  const q = S.presence(r16, [e16], { country: 'Spain' }); eq(q.n, 0); eq(q.rows, []);
});
test('una lista sin arquetipo cuenta como "Sin clasificar" dentro del denominador', () => {
  const p = S.presence([res('e16', 1, 'a', 'X'), res('e16', 2, 'b', null), res('e16', 3, 'c', '  ')], [e16], {});
  eq(p.n, 3); eq(p.rows.find((x) => x.archetype === S.UNCLASSIFIED).lists, 2);
});
test('los resultados de un evento que no existe en la lista de eventos no entran', () => {
  eq(S.presence([res('fantasma', 1, 'a', 'X')], [e16], {}).n, 0);
});

console.log('\n== inclusión de cartas ==');
const cat = (n) => /^GD06-0(0[1-9]|1[0-3])$/.test(n);
test('solo cuentan las listas con las 50 cartas verificadas; las pendientes, incompletas e inválidas no', () => {
  const rs = [res('e16', 1, 'a', 'X', { cards: full() }), res('e16', 2, 'b', 'X', { cards: full({ 'GD06-001': 3, 'GD06-013': 3 }) }),
    res('e16', 3, 'c', 'X'), res('e16', 4, 'd', 'X', { cards: { 'GD06-001': 4, 'GD06-002': 4 } }), res('e16', 5, 'e', 'X', { cards: full({ 'ZZ99-999': 4 }) })];
  eq(rs.map((r) => S.deckStatus(r, cat)), ['complete', 'complete', 'pending', 'incomplete', 'invalid']);
  const inc = S.inclusion(rs, [e16], {}, cat);
  eq(inc.n, 2); eq(inc.published, 5);
});
test('frecuencia = listas completas que la llevan / listas completas analizadas; media = copias totales / listas que la llevan', () => {
  const dozen = (extra) => { const c = {}; for (let i = 1; i <= 12; i++) c['GD06-' + String(i).padStart(3, '0')] = 4; return Object.assign(c, extra); };   // 48 cartas + extra
  const a = res('e16', 1, 'a', 'X', { cards: dozen({ 'GD06-013': 2 }) });
  const b = res('e16', 2, 'b', 'X', { cards: dozen({ 'GD06-013': 1, 'GD06-014': 1 }) });
  const c = res('e16', 3, 'c', 'X', { cards: dozen({ 'GD06-013': 2 }) });
  const inc = S.inclusion([a, b, c], [e16], {}, null);
  eq(inc.n, 3);
  const r13 = inc.rows.find((x) => x.number === 'GD06-013'); eq(r13.lists, 3); near(r13.pct, 100); near(r13.avgCopies, 5 / 3);
  const r14 = inc.rows.find((x) => x.number === 'GD06-014'); eq(r14.lists, 1); near(r14.pct, 100 / 3); near(r14.avgCopies, 1);
});
test('con todas las listas pendientes no hay inclusión (n=0), nunca una lista vacía "válida"', () => {
  const inc = S.inclusion(r16, [e16], {}, cat); eq(inc.n, 0); eq(inc.rows, []); eq(inc.published, 16);
});
test('cantidades imposibles (0, 5, decimales) hacen la lista inválida', () => {
  eq(S.deckStatus({ cards: full({ 'GD06-001': 5 }) }), 'invalid');
  eq(S.deckStatus({ cards: full({ 'GD06-001': 0 }) }), 'invalid');
  eq(S.deckStatus({ cards: full({ 'GD06-001': 2.5 }) }), 'invalid');
});
test('la tasa de victorias no está disponible y no se deduce de los puestos', () => {
  eq(S.winRate(r16).available, false);
});
console.log('\n== identidad, nombres y filtros adicionales ==');
test('la misma lista con id estable de la fuente cuenta una vez aunque cambie el resto', () => {
  eq(S.dedupeResults([res('e1', 1, null, 'X', { id: 'fuente:1' }), res('e1', 2, null, 'Y', { id: 'fuente:1' })]).results.length, 1);
});
test('variantes triviales del arquetipo cuentan como el mismo', () => {
  const p = S.presence([res('e16', 1, 'a', 'BG OYW'), res('e16', 2, 'b', 'bg  oyw'), res('e16', 3, 'c', 'Otro')], [e16], {});
  eq(p.rows[0], { archetype: 'BG OYW', lists: 2, pct: 2 / 3 * 100 });
});
test('filtros de formato, tamaño de evento y arquetipo recalculan n', () => {
  const big = ev('big', { playersTotal: 128, venue: 'Grande', format: 'Limitado' });
  const rs = r16.concat([res('big', 1, 'z', 'Mobile Fighter')]), evs = [e16, big];
  eq(S.presence(rs, evs, { format: 'Limitado' }).n, 1);
  eq(S.presence(rs, evs, { sizeMax: 64 }).n, 16); eq(S.presence(rs, evs, { sizeMin: 65 }).n, 1);
  eq(S.filterResults(rs, evs, { archetype: 'mobile fighter' }).length, 5);
  eq(S.filterEvents(evs, { sizeMin: 65 }).map((e) => e.id), ['big']);
});
test('un evento sin participantes conocidos no entra en un filtro de tamaño', () => {
  eq(S.filterEvents([ev('x', { playersTotal: null })], { sizeMax: 64 }).length, 0);
});
test('presencia desde totales por arquetipo: mismo cálculo y sin dividir entre cero', () => {
  const p = S.presenceFromCounts({ A: 30, B: 10, C: 0 }); eq(p.n, 40); near(p.rows[0].pct, 75); eq(p.rows.length, 2);
  eq(S.presenceFromCounts({}).n, 0); eq(S.presenceFromCounts({}).rows, []);
});

console.log('\n== cambios entre periodos ==');
test('dos periodos con la misma segmentación: variación en puntos con la n de cada uno', () => {
  const c = S.compareShares({ label: 'GD05', seg: 's', counts: { A: 75, B: 25 } }, { label: 'GD04', seg: 's', counts: { A: 50, B: 50 } }, 30);
  eq(c.comparable, true); eq([c.n, c.prevN], [100, 100]); near(c.rows[0].delta, 25);
});
test('un arquetipo que no estaba antes se marca como nuevo, sin inventar una subida desde un dato', () => {
  const c = S.compareShares({ seg: 's', counts: { A: 50, N: 50 } }, { seg: 's', counts: { A: 40 } }, 30);
  eq(c.rows.find((r) => r.archetype === 'N').isNew, true);
});
test('una sola muestra: no hay comparación', () => {
  eq(S.compareShares({ seg: 's', counts: { A: 1 } }, null), { comparable: false, reason: 'single' });
});
test('dos periodos no comparables (otra fuente o territorio): no sugiere subidas ni bajadas', () => {
  const c = S.compareShares({ seg: 'jp-top', counts: { A: 40 } }, { seg: 'global', counts: { A: 40 } }, 30);
  eq(c, { comparable: false, reason: 'segment' });
});
test('muestra insuficiente en uno de los periodos: no hay comparación', () => {
  eq(S.compareShares({ seg: 's', counts: { A: 100 } }, { seg: 's', counts: { A: 5 } }, 30).reason, 'sample');
});

console.log('\n== favoritos ==');
test('seguir y dejar de seguir es reversible, con id estable ante mayúsculas y espacios', () => {
  let f = S.toggleFav([], 'GD06', 'BG OYW', 1); eq(f.length, 1); eq(f[0].id, S.favId('GD06', 'bg  oyw'));
  f = S.toggleFav(f, 'GD06', 'bg oyw', 2); eq(f, []);
});
test('el mismo arquetipo en otra temporada es otro favorito y no borra el anterior', () => {
  let f = S.toggleFav([], 'GD06', 'BG OYW', 1); f = S.toggleFav(f, 'GD05', 'BG OYW', 2); eq(f.length, 2);
});
test('favoritos guardados: se leen, sin duplicados, e ignoran lo ilegible', () => {
  const x = { id: 'GD06|a', season: 'GD06', name: 'A', addedAt: 1 };
  eq(S.parseFavs(JSON.stringify([x, x, { id: 'b' }, null])), [x]); eq(S.parseFavs('no es json'), []); eq(S.parseFavs(null), []);
});

console.log('\n== novedades desde la última visita ==');
const snapA = S.snapshotOf('k', 'v1', { A: 6, B: 2 }, ['e1'], ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
const snapB = S.snapshotOf('k', 'v2', { A: 6, B: 10 }, ['e1', 'e2'], ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15', 'r16']);
test('sin foto anterior: no hay comparación', () => { eq(S.diffSnapshots(null, snapA, ['A']), { comparable: false, reason: 'first' }); });
test('fotos de otro contexto (otros filtros): no se comparan', () => {
  eq(S.diffSnapshots(S.snapshotOf('otro', 'v1', { A: 1 }), snapA, ['A']).comparable, false);
});
test('misma foto: sin cambios y sin filas de subidas', () => {
  const d = S.diffSnapshots(snapA, S.snapshotOf('k', 'v1', { A: 6, B: 2 }, ['e1'], ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']), ['A']);
  eq(d.changed, false); eq(d.rows, []); eq([d.newEvents, d.newLists], [0, 0]);
});
test('ids realmente nuevos: 1 torneo y 8 resultados, y presencia antes → ahora en puntos con la n de cada foto', () => {
  const d = S.diffSnapshots(snapA, snapB, ['A']);
  eq(d.changed, true); eq([d.newEvents, d.newLists], [1, 8]); eq([d.prevN, d.n], [8, 16]);
  near(d.rows[0].before, 75); near(d.rows[0].after, 37.5); near(d.rows[0].delta, -37.5); eq([d.rows[0].beforeLists, d.rows[0].afterLists], [6, 6]);
});
test('una lista que desaparece no cuenta como novedad', () => {
  const d = S.diffSnapshots(snapB, snapA, []); eq([d.newEvents, d.newLists], [0, 0]); eq(d.changed, true);
});
test('fuente con solo totales: las listas nuevas salen de la diferencia de n, nunca negativa', () => {
  eq(S.diffSnapshots(S.snapshotOf('k', 'a', { A: 10 }), S.snapshotOf('k', 'b', { A: 15 }), []).newLists, 5);
  eq(S.diffSnapshots(S.snapshotOf('k', 'a', { A: 15 }), S.snapshotOf('k', 'b', { A: 10 }), []).newLists, 0);
});
test('la clave de contexto cambia con los filtros', () => {
  ok(S.contextKey({ set: 'GD06' }) !== S.contextKey({ set: 'GD06', topN: 8 })); ok(S.contextKey({ set: 'GD06' }) !== S.contextKey({ set: 'GD05' }));
});

console.log('\n== cobertura con la colección (datos de prueba) ==');
const lista = { 'GD06-001': 4, 'GD06-002': 2 };
test('colección sin configurar: estado desconocido, nunca cero', () => { eq(S.coverage(lista, () => 0, false), { state: 'unknown' }); });
test('colección configurada con 0 copias: cero válido', () => {
  const c = S.coverage(lista, () => 0, true); eq(c.state, 'configured'); eq([c.requiredCopies, c.coveredCopies, c.missingCopies], [6, 0, 6]); near(c.coveragePct, 0);
});
test('necesita 4 y tiene 3: falta 1', () => {
  const c = S.coverage({ 'GD06-001': 4 }, () => 3, true); eq(c.missingCopies, 1); eq(c.missingByCard, [{ number: 'GD06-001', need: 4, owned: 3, missing: 1 }]); near(c.coveragePct, 75);
});
test('tener más copias de las necesarias no compensa otras cartas', () => {
  const c = S.coverage(lista, (n) => (n === 'GD06-001' ? 9 : 0), true); eq([c.coveredCopies, c.missingCopies], [4, 2]);
});
test('dos cartas distintas con el mismo nombre no se funden: se cuenta por código', () => {
  const c = S.coverage({ 'GD01-001': 2, 'GD05-001': 2 }, (n) => (n === 'GD01-001' ? 2 : 0), true); eq(c.missingByCard.map((m) => m.number), ['GD05-001']);
});
test('todo cubierto: 0 faltan y 100 %', () => {
  const c = S.coverage(lista, () => 4, true); eq(c.missingCopies, 0); near(c.coveragePct, 100); eq(c.missingByCard, []);
});

console.log('\n== privacidad: nada de jugadores en lo que se guarda ==');
const conNombre = { id: 'r1', eventId: 'e1', placement: 1, player: 'Nombre Real', playerName: 'x', player_slug: 'slug', profileUrl: 'https://x/p/1', archetype: 'A', colors: ['Red'], set: 'GD06', country: 'Japan', origin: 'tournament', sourceUrl: 'https://x/t/1', decklistUrl: null, cards: null };
test('sanitizeResult conserva solo los campos permitidos y descarta nombres, perfiles y slugs', () => {
  const o = S.sanitizeResult(conNombre);
  eq(Object.keys(o), ['id', 'eventId', 'placement', 'archetype', 'colors', 'set', 'country', 'origin', 'sourceUrl', 'decklistUrl', 'cards']);
  ok(!/Nombre Real|slug|profile/.test(JSON.stringify(o)));
});
test('es idempotente y estable: limpiar dos veces da lo mismo y en el mismo orden', () => { eq(JSON.stringify(S.sanitizeResult(S.sanitizeResult(conNombre))), JSON.stringify(S.sanitizeResult(conNombre))); });
test('al importar se limpian los nombres del lote y también los que ya hubiera guardados', () => {
  const lote = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'comp_batch_mini.json'), 'utf8')); lote.results.forEach((r) => { r.player = 'Persona ' + r.placement; });
  const viejo = { events: [], results: [Object.assign({}, conNombre, { eventId: 'metasheep:viejo' })] };
  const m = merge(viejo, mapBatch(lote), lote.snapshotDate);
  ok(!/Persona|Nombre Real|slug|profile/.test(JSON.stringify(m.out)), 'quedan datos personales');
});
test('el archivo real de datos no contiene claves personales', () => {
  const p = path.join(__dirname, '..', 'data', 'competition_events.json');
  if (!fs.existsSync(p)) return;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  d.results.forEach((r) => eq(Object.keys(r).filter((k) => S.RESULT_FIELDS.indexOf(k) < 0), [], 'clave no permitida en ' + r.id));
  ok(!/"player"|slug|profile/i.test(JSON.stringify(d).replace(/playersTotal/g, '')));
});

console.log('\n== torneo frente a comunidad ==');
const com = (id, arq, o) => Object.assign({ id, eventId: null, placement: null, archetype: arq, colors: [], set: 'GD06', country: '', origin: 'community', cards: null }, o || {});
test('un mazo de la comunidad no entra en presencia, aunque tenga el mismo arquetipo y set', () => {
  const rs = r16.concat([com('c1', 'Mobile Fighter'), com('c2', 'Mobile Fighter')]);
  eq(S.presence(rs, [e16], { set: 'GD06' }).n, 16);
});
test('los mazos de la comunidad se cuentan aparte, con su propio filtro', () => {
  const rs = r16.concat([com('c1', 'Mobile Fighter'), com('c2', 'Char IBO'), com('c3', 'Mobile Fighter', { set: 'GD05' })]);
  eq(S.filterResults(rs, [e16], { set: 'GD06', origin: 'community' }).length, 2);
  eq(S.filterResults(rs, [e16], { set: 'GD06', origin: 'community', archetype: 'mobile fighter' }).length, 1);
});
test('la inclusión de cartas solo usa listas de torneo: una completa de la comunidad no suma', () => {
  const rs = [res('e16', 1, null, 'X', { cards: full() }), com('c1', 'X', { cards: full({ 'GD06-014': 0 }) })];
  eq(S.inclusion(rs, [e16], {}, null).n, 1);
});
test('sin origen cuenta como torneo; cualquier otro valor, también', () => {
  eq(S.originOf({}), 'tournament'); eq(S.originOf({ origin: 'raro' }), 'tournament'); eq(S.originOf({ origin: 'community' }), 'community');
});

console.log('\n== exportaciones de texto (WhiteBase, ExBurst, Limitless…) ==');
const l50 = (fmt) => { const rows = []; for (let i = 1; i <= 12; i++) rows.push(fmt(4, 'GD06-' + String(i).padStart(3, '0'))); rows.push(fmt(2, 'GD06-013')); return rows.join('\n'); };
test('"4 GD06-001", "4x GD06-001" y "4 x GD06-001" dan la misma lista de 50 cartas', () => {
  const a = S.parseDeckExport(l50((q, c) => q + ' ' + c)), b = S.parseDeckExport(l50((q, c) => q + 'x ' + c)), c = S.parseDeckExport(l50((q, c2) => q + ' x ' + c2));
  eq(a.status, 'complete'); eq(a.cards, b.cards); eq(a.cards, c.cards); eq(a.total, 50);
});
test('"GD06-001 x4", "GD06-001,4" y con el nombre detrás también se entienden', () => {
  eq(S.parseDeckExport(l50((q, c) => c + ' x' + q)).status, 'complete');
  eq(S.parseDeckExport(l50((q, c) => c + ',' + q)).status, 'complete');
  eq(S.parseDeckExport(l50((q, c) => q + ' ' + c + ' Gundam')).status, 'complete');
});
test('encabezados, comentarios y líneas vacías se ignoran', () => {
  eq(S.parseDeckExport('[Deck]\n# mi lista\n\n' + l50((q, c) => q + ' ' + c) + '\n').status, 'complete');
});
test('una línea que no se entiende rechaza la lista entera, sin adivinar', () => {
  const r = S.parseDeckExport(l50((q, c) => q + ' ' + c) + '\nesto no es una carta'); eq(r.status, 'invalid'); eq(r.errors.length, 1); eq(r.errors[0].line, 14);
});
test('menos de 50 cartas: incompleta; más de 4 copias o un código repetido que supere 4: inválida', () => {
  eq(S.parseDeckExport('4 GD06-001\n4 GD06-002').status, 'incomplete');
  eq(S.parseDeckExport('3 GD06-001\n3 GD06-001').status, 'invalid');
  eq(S.parseDeckExport('').status, 'pending');
});

console.log('\n== comparación con mi mazo (multiconjunto) ==');
const own = { A: 4, B: 3, C: 1 }, tgt = { A: 2, B: 3, D: 4 };
test('coinciden = min, añadir = max(0, lista − mío), retirar = max(0, mío − lista), por código', () => {
  const c = S.compareDecks(tgt, own, () => 0, false), by = (n) => c.rows.find((r) => r.number === n);
  eq([by('A').match, by('A').add, by('A').remove], [2, 0, 2]); eq([by('B').match, by('B').add, by('B').remove], [3, 0, 0]);
  eq([by('C').match, by('C').add, by('C').remove], [0, 0, 1]); eq([by('D').match, by('D').add, by('D').remove], [0, 4, 0]);
  eq([c.totals.match, c.totals.add, c.totals.remove], [5, 4, 3]);
});
test('con dos mazos de 50 cartas, lo que se añade es igual a lo que se retira', () => {
  const a = { X: 4, Y: 4, Z: 4, W: 4, V: 4, U: 4, T: 4, R: 4, Q: 4, P: 4, O: 4, N: 4, M: 2 }, b = Object.assign({}, a, { X: 2, Y: 3, K: 3 });
  const c = S.compareDecks(b, a, () => 0, false); eq([c.totals.target, c.totals.own], [50, 50]); eq(c.balanced, true); eq(c.totals.add, c.totals.remove);
});
test('mazos iguales: todo coincide y no hay nada que añadir ni retirar', () => {
  const c = S.compareDecks(tgt, tgt, () => 0, false); eq([c.totals.add, c.totals.remove, c.totals.match], [0, 0, 9]);
});
test('mi mazo vacío: hay que añadir toda la lista', () => { const c = S.compareDecks(tgt, {}, () => 0, false); eq([c.totals.add, c.totals.remove, c.totals.match], [9, 0, 0]); });
test('si mi mazo no tiene 50 cartas, "balanced" es null y no se afirma que añadir = retirar', () => { eq(S.compareDecks(tgt, own, () => 0, false).balanced, null); });
test('la colección es un cálculo aparte: una carta que hay que AÑADIR puede estar ya en mi colección', () => {
  const owned = { D: 4, A: 1 }, c = S.compareDecks(tgt, own, (n) => owned[n] || 0, true), by = (n) => c.rows.find((r) => r.number === n);
  eq([by('D').add, by('D').owned, by('D').missingInCollection], [4, 4, 0]);          // hay que añadirla al mazo y ya la tengo
  eq([by('A').add, by('A').owned, by('A').missingInCollection], [0, 1, 1]);          // no hay que añadirla (ya la tengo en el mazo) pero me falta en la colección
  eq(c.totals.missingInCollection, 1 + 3);   // A: 2−1, B: 3−0, D: 0  -> 1 + 3
});
test('colección sin configurar: no hay cifras de colección (no son cero)', () => {
  const c = S.compareDecks(tgt, own, () => 99, false); eq(c.collection, 'unknown'); eq(c.totals.missingInCollection, null); ok(c.rows.every((r) => r.owned === undefined && r.missingInCollection === undefined));
});
test('colección configurada vacía: cero válido, falta todo', () => { const c = S.compareDecks(tgt, own, () => 0, true); eq(c.collection, 'configured'); eq(c.totals.missingInCollection, 9); });
test('cloneCards: copia independiente que no comparte objeto con el original y descarta cantidades inválidas', () => {
  const o = { A: 4, B: 2 }, c = S.cloneCards(o); c.A = 1; eq(o.A, 4); eq(S.cloneCards({ A: 4, B: 0, C: 2.5, D: -1 }), { A: 4 });
});

console.log('\n== muestra homogénea de presencia (cobertura) ==');
const q = (id, quality, extra) => ev(id, Object.assign({ venue: 'V' + id, dataQuality: quality }, extra || {}));
const evTop1 = q('t1', 'top_cut_only', { listsPublished: 16 }), evTop2 = q('t2', 'top_cut_only', { listsPublished: 8 }), evOne = q('s1', 'single_deck');
const rTop = Array.from({ length: 24 }, (_, i) => res(i < 16 ? 't1' : 't2', (i % 16) + 1, null, i % 3 ? 'Mobile Fighter' : 'Char IBO', { id: 'metasheep:' + i })), rOne = [res('s1', 1, null, 'Otro Arquetipo', { id: 'windecks:1', cards: full() })];
const allR = rTop.concat(rOne), allE = [evTop1, evTop2, evOne];
test('por defecto la presencia usa solo eventos de corte completo (top_cut_only): n = 24 y el ganador suelto no entra', () => {
  const p = S.presence(allR, allE, { set: 'GD06' }); eq(p.n, 24); ok(!p.rows.some((r) => r.archetype === 'Otro Arquetipo'));
});
test('la selección se hace por dataQuality y no por nombre de fuente ni por un número fijo', () => {
  const mix = allE.map((e) => Object.assign({}, e, { sources: [{ provider: 'metasheep', id: e.id, url: 'u' + e.id, primary: true }] }));
  eq(S.presence(allR, mix, { set: 'GD06' }).n, 24);
  const otro = allE.map((e) => (e.id === 's1' ? Object.assign({}, e, { dataQuality: 'top_cut_only' }) : e)); eq(S.presence(allR, otro, { set: 'GD06' }).n, 25);
});
test('coverage: "all" mezcla los cortes solo si se pide expresamente (n = 25)', () => { eq(S.presence(allR, allE, { set: 'GD06', coverage: 'all' }).n, 25); });
test('el evento y la lista siguen consultables aunque no entren en el porcentaje', () => {
  eq(S.filterEvents(allE, { set: 'GD06', coverage: 'all' }).length, 3); eq(S.filterResults(allR, allE, { set: 'GD06', coverage: 'all' }).length, 25);
});
test('filterEvents NO aplica la cobertura: el torneo fuera de la muestra sigue en la lista de torneos', () => { eq(S.filterEvents(allE, { set: 'GD06' }).length, 3); eq(S.filterEvents(allE, { set: 'GD06' }).map((e) => e.id).sort(), ['s1', 't1', 't2']); });
test('sin dataQuality (datos antiguos) cuenta como homogéneo', () => { eq(S.presence(r16, [e16], { set: 'GD06' }).n, 16); });
test('las cartas populares usan listas completas de cualquier cobertura, con su propio n', () => {
  const inc = S.inclusion(allR, allE, { set: 'GD06' }, null); eq(inc.n, 1); ok(inc.n < S.MIN_LISTS_FOR_CARDS);
});
test('filtro sin muestra: n = 0 y sin división por cero', () => { const p = S.presence(allR, allE, { set: 'GD06', country: 'Spain' }); eq(p.n, 0); eq(p.rows, []); });

console.log('\n== taxonomía de arquetipos ==');
const tabla = { archetypes: [{ id: 'bg-oyw', name: 'BG OYW', aliases: ['B/G OYW'] }, { id: 'kshatriya-banshee', name: 'Kshatriya Banshee', aliases: [] }, { id: 'kshatriya-strike-freedom', name: 'Kshatriya + Strike Freedom Gundam', aliases: [] }] };
test('coincidencia exacta normalizada con nombre o alias asigna la identidad', () => {
  eq(S.resolveArchetype('bg  oyw', tabla), { id: 'bg-oyw', name: 'BG OYW' }); eq(S.resolveArchetype('B/G OYW', tabla), { id: 'bg-oyw', name: 'BG OYW' });
});
test('NO se fusiona por parecido ni por la palabra Kshatriya: cada nombre es su propia identidad', () => {
  eq(S.resolveArchetype('Kshatriya Banshee', tabla).id, 'kshatriya-banshee'); eq(S.resolveArchetype('Kshatriya + Strike Freedom Gundam', tabla).id, 'kshatriya-strike-freedom');
  eq(S.resolveArchetype('Kshatriya', tabla).id, null); eq(S.resolveArchetype('Kshatriya Unicorn', tabla).id, null);
});
test('un nombre sin asignar conserva su etiqueta original y archetypeId null', () => { eq(S.resolveArchetype('  Algo Nuevo ', tabla), { id: null, name: 'Algo Nuevo' }); });
test('applyArchetypes es idempotente, conserva archetype y guarda el original de la fuente', () => {
  const r0 = [{ id: 'a', archetype: 'B/G OYW' }, { id: 'b', archetype: 'Nuevo' }], r1 = S.applyArchetypes(r0, tabla), r2 = S.applyArchetypes(r1, tabla);
  eq(r1[0].archetypeId, 'bg-oyw'); eq(r1[0].archetypeOriginal, 'B/G OYW'); eq(r1[0].archetype, 'B/G OYW'); eq(r1[1].archetypeId, null); eq(r2, r1);
});
test('la presencia agrupa por identidad canónica: dos alias del mismo arquetipo son una fila, con el nombre canónico', () => {
  const t = { archetypes: tabla.archetypes, byId: { 'bg-oyw': 'BG OYW' } };
  const rs = S.applyArchetypes([res('e16', 1, null, 'BG OYW'), res('e16', 2, null, 'B/G OYW'), res('e16', 3, null, 'Otro')], tabla);
  const p = S.presence(rs, [e16], {}, t); eq(p.rows[0], { archetype: 'BG OYW', lists: 2, pct: 2 / 3 * 100 });
});
test('el archivo real de alias existe, no repite ids y no funde Kshatriya Banshee con Kshatriya + Strike Freedom Gundam', () => {
  const p = path.join(__dirname, '..', 'data', 'archetype_aliases.json'); if (!fs.existsSync(p)) throw new Error('falta data/archetype_aliases.json');
  const t = JSON.parse(fs.readFileSync(p, 'utf8')), ids = {}; t.archetypes.forEach((a) => { ok(!ids[a.id], 'id repetido ' + a.id); ids[a.id] = 1; });
  const kb = S.resolveArchetype('Kshatriya Banshee', t), ks = S.resolveArchetype('Kshatriya + Strike Freedom Gundam', t); ok(kb.id && ks.id && kb.id !== ks.id, 'se han fundido');
  ok((t.pendingReview || []).some((x) => /Kshatriya/.test(JSON.stringify(x))), 'la duda debe quedar anotada para revisión');
});
test('el archivo real de datos: cada resultado trae archetypeOriginal y archetypeId (o null si no está en la tabla)', () => {
  const p = path.join(__dirname, '..', 'data', 'competition_events.json'); const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  d.results.forEach((r) => { ok('archetypeOriginal' in r && 'archetypeId' in r, 'falta en ' + r.id); eq(r.archetypeOriginal, r.archetype, 'el original cambió en ' + r.id); });
});

console.log('\n== importación ==');
const batchPath = path.join(__dirname, 'fixtures', 'comp_batch_mini.json');
const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
test('la importación repetida es idempotente: el mismo lote dos veces da el mismo archivo', () => {
  const m1 = merge({ events: [], results: [] }, mapBatch(batch), batch.snapshotDate);
  const m2 = merge(m1.out, mapBatch(batch), batch.snapshotDate);
  eq(m2.out, m1.out); eq(m2.out.events.length, 2); eq(m2.out.results.length, 4);
});
test('importar no borra lo que ya había (otros sets y torneos se conservan)', () => {
  const old = { events: [ev('viejo', { set: 'GD05', date: '2026-09-01', venue: 'V' })], results: [res('viejo', 1, 'x', 'Z', { set: 'GD05' })] };
  const m = merge(old, mapBatch(batch), batch.snapshotDate);
  ok(m.out.events.some((e) => e.id === 'viejo') && m.out.results.some((r) => r.eventId === 'viejo'));
  eq(m.out.events.length, 3);
});
test('el lote mapea colores a mayúscula inicial, sin inventar composición ni URL de lista', () => {
  const m = mapBatch(batch);
  eq(m.results[0].colors, ['Blue', 'Green']); eq(m.results[0].cards, null); eq(m.results[0].decklistUrl, null);
  eq(m.events[0].type, 'Newtype Challenge');
});
test('el mismo evento del lote por otro proveedor se funde al importar y suma la fuente', () => {
  const dup = JSON.parse(JSON.stringify(batch));
  dup.tournaments = dup.tournaments.map((t) => Object.assign({}, t, { id: 'otro:' + t.id.split(':')[1], sourceUrl: 'https://otro.test/' + t.id.split(':')[1], sourceProvider: 'Otro' }));
  dup.results = dup.results.map((r) => Object.assign({}, r, { id: 'otro:' + r.id, tournamentId: 'otro:' + r.tournamentId.split(':')[1] }));
  const m = merge(merge({ events: [], results: [] }, mapBatch(batch), 'x').out, mapBatch(dup), 'x');
  eq(m.out.events.length, 2); eq(m.out.results.length, 4); ok(m.out.events.every((e) => e.sources.length === 2));
});
test('el archivo real de datos es coherente: ids únicos, eventos existentes, 50 cartas si hay composición', () => {
  const p = path.join(__dirname, '..', 'data', 'competition_events.json');
  if (!fs.existsSync(p)) return;
  const d = JSON.parse(fs.readFileSync(p, 'utf8')), ids = {};
  d.events.forEach((e) => { ok(!ids[e.id], 'id de evento repetido ' + e.id); ids[e.id] = 1; ok(e.sources.length && e.sources[0].primary, 'sin fuente principal ' + e.id); });
  const keys = {};
  d.results.forEach((r) => { ok(ids[r.eventId], 'lista de un evento inexistente ' + r.id); const k = S.resultKey(r); ok(!keys[k], 'lista repetida ' + k); keys[k] = 1; if (r.cards) eq(S.deckStatus(r), 'complete', 'composición no válida en ' + r.id); });
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
process.exit(failed ? 1 : 0);
