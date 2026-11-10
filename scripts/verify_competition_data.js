/* Verificador de datos de Competición (sin red, sin navegador):  node scripts/verify_competition_data.js [--json]
 * Comprueba data/competition_events.json y data/archetype_aliases.json contra las reglas del producto y el catálogo real. Sale con código 1 si algo falla.
 *   · conteos y calidad de cobertura de cada evento · ids únicos y sin huérfanos · ningún dato personal (lista blanca de campos)
 *   · listas completas: 50 cartas, códigos del catálogo y legalidad (legality.js + data/rulesets.json a la fecha del torneo)
 *   · muestra homogénea: n, porcentajes y que el evento de un solo mazo no entra salvo que se pida · taxonomía de arquetipos (sin fusiones por parecido) */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');
const Legality = require('../legality.js');
const { loadCatalog, loadRulesets } = require('./import_deck_export.js');
const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'competition_events.json'), 'utf8'));
const table = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'archetype_aliases.json'), 'utf8'));
const catalog = loadCatalog(), rulesets = loadRulesets();
const out = []; let bad = 0;
const check = (name, ok, detail) => { out.push({ name, ok: !!ok, detail }); if (!ok) bad++; };

const ids = {}; data.events.forEach((e) => { ids[e.id] = (ids[e.id] || 0) + 1; });
check('ids de evento únicos', Object.values(ids).every((n) => n === 1));
const rids = {}; data.results.forEach((r) => { rids[r.id] = (rids[r.id] || 0) + 1; });
check('ids de lista únicos', Object.values(rids).every((n) => n === 1));
check('ninguna lista de torneo apunta a un evento inexistente', data.results.every((r) => S.originOf(r) === 'community' || ids[r.eventId]));
check('conteos: ' + data.events.length + ' eventos, ' + data.results.length + ' resultados', data.events.length === 6 && data.results.length === 57, [data.events.length, data.results.length]);
const quality = {}; data.events.forEach((e) => { quality[e.dataQuality || '—'] = (quality[e.dataQuality || '—'] || 0) + 1; });
check('cobertura: 5 eventos top_cut_only y 1 single_deck', quality.top_cut_only === 5 && quality.single_deck === 1, quality);
check('privacidad: solo campos permitidos y ningún nombre de jugador', data.results.every((r) => Object.keys(r).every((k) => S.RESULT_FIELDS.indexOf(k) >= 0)) && !/"player"|slug|profile/i.test(JSON.stringify(data).replace(/playersTotal/g, '')));

const sample = S.presence(data.results, data.events, { set: 'GD06' }, null), all = S.presence(data.results, data.events, { set: 'GD06', coverage: 'all' }, null);
const mf = sample.rows.find((r) => r.archetype === 'Mobile Fighter');
check('muestra principal GD06: n = 56 en 5 eventos', sample.n === 56 && sample.events === 5, [sample.n, sample.events]);
check('Mobile Fighter = 16/56 = 28,6 %', mf && mf.lists === 16 && (Math.round(mf.pct * 10) / 10) === 28.6, mf);
check('con coverage "all" (mezcla) n = 57 y solo si se pide', all.n === 57 && all.events === 6, [all.n, all.events]);
check('los 6 eventos y los 57 resultados siguen consultables', S.filterEvents(data.events, { set: 'GD06' }).length === 6 && S.filterResults(data.results, data.events, { set: 'GD06', coverage: 'all' }).length === 57);

const complete = data.results.filter((r) => S.deckStatus(r) === 'complete');
check('listas completas verificadas: ' + complete.length, complete.length === 1, complete.map((r) => r.id));
complete.forEach((r) => {
  const e = data.events.find((x) => x.id === r.eventId), codes = Object.keys(r.cards);
  check('lista ' + r.id + ': 50 cartas, ' + codes.length + ' códigos en el catálogo', Object.values(r.cards).reduce((a, b) => a + b, 0) === 50 && codes.every((c) => catalog[c]), codes.filter((c) => !catalog[c]));
  const v = Legality.validateDeck(r.cards, Legality.getActiveRuleset(rulesets, new Date(e.date + 'T12:00:00Z'), 'EN'), catalog);
  check('lista ' + r.id + ': legal a fecha del torneo (' + e.date + ')', v.status === 'legal', v.errors.map((x) => x.ruleType));
});
const cards = S.inclusion(data.results, data.events, { set: 'GD06' }, (n) => !!catalog[n]);
check('cartas populares: n = 1 < mínimo ' + S.MIN_LISTS_FOR_CARDS + ' (no se publican porcentajes)', cards.n === 1 && cards.n < S.MIN_LISTS_FOR_CARDS, cards.n);

check('taxonomía: todos los resultados tienen archetypeId y archetypeOriginal, sin cambiar archetype', data.results.every((r) => 'archetypeId' in r && 'archetypeOriginal' in r && r.archetypeOriginal === r.archetype));
check('taxonomía: ids únicos en la tabla', new Set(table.archetypes.map((a) => a.id)).size === table.archetypes.length);
const kb = S.resolveArchetype('Kshatriya Banshee', table), ks = S.resolveArchetype('Kshatriya + Strike Freedom Gundam', table);
check('taxonomía: Kshatriya Banshee y Kshatriya + Strike Freedom Gundam NO están fusionados', kb.id && ks.id && kb.id !== ks.id && (table.pendingReview || []).length >= 1, [kb.id, ks.id]);
check('taxonomía: ningún alias apunta a dos arquetipos', (() => { const seen = {}; let ok = true; table.archetypes.forEach((a) => [a.name].concat(a.aliases || []).forEach((n) => { const k = S.normText(n); if (seen[k] && seen[k] !== a.id) ok = false; seen[k] = a.id; })); return ok; })());

if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else out.forEach((c) => console.log((c.ok ? '  OK    ' : '  FALLA ') + c.name + (c.ok ? '' : '  → ' + JSON.stringify(c.detail))));
console.log('\n' + (out.length - bad) + ' correctas · ' + bad + ' con problemas');
process.exit(bad ? 1 : 0);
