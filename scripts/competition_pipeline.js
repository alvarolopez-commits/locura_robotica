/* Pipeline local de resultados competitivos (Fase 6A). Sin red, sin scraping, sin credenciales.
 *
 *   node scripts/competition_pipeline.js preview  <entrada> [opciones]      analiza y enseña qué pasaría; NO escribe nada
 *   node scripts/competition_pipeline.js stage    <entrada> [opciones]      lo mismo y guarda los candidatos en la cola local (data/meta/pipeline); NO toca los datos publicados
 *   node scripts/competition_pipeline.js review   [--status needs_review] [--json]
 *   node scripts/competition_pipeline.js approve  --ids E:..,R:.. --by op-1 [--as new|merge] [--coverage top_cut_only|single_deck] [--confirm-type [--type "…"]] [--note "…"]
 *   node scripts/competition_pipeline.js dismiss  --ids … --by op-1 [--note "…"]
 *   node scripts/competition_pipeline.js publish  [--apply] --by op-1                        sin --apply es una simulación (dry-run)
 *   node scripts/competition_pipeline.js rollback [--apply] [--force] --by op-1              revierte solo si nadie ha cambiado el archivo después
 *   node scripts/competition_pipeline.js status
 *
 * <entrada>: JSON del lote ({ tournaments, results }), JSON canónico ({ events, results }) o texto de una lista (--kind text) con:
 *   --event <id de un torneo ya publicado>  o  --event-id proveedor:id --date AAAA-MM-DD [--name --venue --country --format --players --event-url --coverage]
 *   --placement N --set GD06 --archetype "…" --colors Red,Blue --source Etiqueta --url <página de la lista> --id <id estable de la lista>
 * Opciones globales: --data ruta · --dir carpeta de la cola · --backups carpeta de copias · --aliases ruta · --json
 * `--by` es un identificador interno de quien opera (2-24 caracteres), nunca un nombre ni un correo: queda solo en la cola y la bitácora locales. */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');
const Legality = require('../legality.js');
const P = require('./pipeline/lib.js');
const { loadCatalog, loadRulesets } = require('./import_deck_export.js');

const ROOT = path.join(__dirname, '..');
function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) o[k] = true; else { o[k] = n; i++; } } else o._.push(a);
  }
  return o;
}
function pathsOf(o) {
  return { data: path.resolve(o.data || path.join(ROOT, 'data', 'competition_events.json')), aliases: path.resolve(o.aliases || path.join(ROOT, 'data', 'archetype_aliases.json')),
    dir: path.resolve(o.dir || path.join(ROOT, 'data', 'meta', 'pipeline')), backups: path.resolve(o.backups || path.join(ROOT, 'data', 'meta', 'backup')) };
}
function makeCtx() { return { catalog: loadCatalog(), rulesets: loadRulesets(), legality: Legality }; }
function readJson(f) { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); }

/* texto de una lista → { events, results } canónico (o un rechazo completo si el texto no se entiende: nunca se guarda parcialmente) */
function textToCanonical(text, o) {
  const p = S.parseDeckExport(text);
  if (p.errors.length) return { rejected: 'text_unparseable', detail: p.errors.map((e) => e.line) };
  const source = String(o.source || 'export'), id = o.id || (source.toLowerCase().replace(/[^a-z0-9]+/g, '') + ':' + P.sha256(JSON.stringify(Object.keys(p.cards).sort().map((k) => [k, p.cards[k]]))).slice(0, 12));
  const url = o.url ? String(o.url).replace(/[?#].*$/, '') : '';
  const canonical = { events: [], results: [] };
  let eventId = o.event;
  if (!eventId) {
    if (!o['event-id'] || !o.date) return { rejected: 'event_missing', detail: ['indica --event o --event-id y --date'] };
    const [prov, ...rest] = String(o['event-id']).split(':');
    eventId = String(o['event-id']);
    canonical.events.push({ id: eventId, date: o.date, name: o.name || '', venue: o.venue || '', country: o.country || '', format: o.format || '', set: o.set || '', playersTotal: o.players ? Number(o.players) : null, listsPublished: null,
      dataQuality: o.coverage || null, sources: [{ provider: prov.toLowerCase(), id: rest.join(':'), url: String(o['event-url'] || url || '').replace(/[?#].*$/, ''), label: source, primary: true }] });
  }
  canonical.results.push({ id, eventId, placement: o.placement ? Number(o.placement) : null, archetype: o.archetype || null, colors: String(o.colors || '').split(',').map((x) => x.trim()).filter(Boolean), set: o.set || '', country: o.country || '', origin: 'tournament', sourceUrl: '', decklistUrl: url || null, cards: p.cards });
  return { canonical };
}
function loadEntry(file, o) {
  const kind = o.kind || (/\.(txt|deck)$/i.test(file) ? 'text' : 'json');
  if (kind === 'text') { const t = textToCanonical(fs.readFileSync(file, 'utf8'), o); if (t.rejected) return { rejected: t }; return { raw: t.canonical }; }
  return { raw: readJson(file) };
}
/* simula qué pasaría si se aprobaran los candidatos «ready» (para enseñar el efecto en las estadísticas) */
function simulate(base, analysis, ctx, aliases) {
  const q = { candidates: {} }; analysis.candidates.forEach((c) => { q.candidates[c.cid] = Object.assign({}, c, { status: c.status === 'ready' ? 'approved' : c.status }); });
  const r = P.applyApproved(base, q, aliases); return { antes: P.stats(base, ctx), despues: P.stats(r.data, ctx), counts: r.counts, invariantes: P.invariants(r.data, ctx) };
}
const REASONS = {
  event_bad_date: 'la fecha no es una fecha ISO real', event_bad_set: 'el set no es válido (p. ej. GD06)', event_bad_counts: 'participantes o listas publicadas no son números enteros no negativos', event_lists_exceed_players: 'hay más listas publicadas que participantes',
  event_no_source: 'ninguna fuente identifica el evento con fiabilidad', event_unknown_quality: 'cobertura desconocida (solo top_cut_only o single_deck)', event_personal_data: 'el evento trae datos personales (correo o perfil)', event_no_id: 'el evento no tiene id',
  event_fingerprint: 'misma huella (fecha + sede + país + formato + set, sin contar el tipo) con otro id: puede ser el mismo evento o otra sesión del mismo sitio', event_type_conflict: 'el id o la fuente ya existe pero el tipo se contradice: no se fusiona sin revisarlo', event_type_inferred: 'el tipo se dedujo solo del nombre (no lo da la fuente): confírmalo con --confirm-type [--type …]', event_no_venue_to_compare: 'mismo nombre y fecha pero falta la sede para compararlos', event_fingerprint_in_batch: 'misma huella (fecha + sede + país + formato + set) que otro evento del propio lote: pueden ser el mismo',
  event_duplicate_in_batch: 'el id del evento está repetido en el lote', coverage_unknown: 'no se indica la cobertura y no se puede deducir: elige top_cut_only o single_deck', coverage_inferred: 'cobertura deducida (un solo mazo → single_deck): confírmala',
  event_pending_review: 'su evento está pendiente de revisión',
  result_no_id: 'el resultado no tiene id', result_bad_placement: 'puesto no válido', result_no_event: 'el resultado no indica su torneo', result_personal_data: 'el resultado trae datos personales (correo o perfil)', result_no_archetype: 'sin arquetipo',
  result_event_missing: 'su torneo no está ni en el lote ni publicado', result_same_placement_other_archetype: 'mismo puesto y torneo con otro arquetipo: puede ser un empate real', result_different_cards: 'ya existe ese resultado con otra composición',
  result_duplicate_in_batch: 'el id del resultado está repetido en el lote', cards_not_50: 'la composición no suma 50 cartas', cards_unknown_code: 'hay códigos que no existen en el catálogo', cards_invalid_quantity: 'cantidades no válidas (1 a 4 por código)', cards_illegal: 'la composición no cumple las reglas de construcción',
};
const why = (r) => REASONS[r] || r;
function printCandidates(cs) {
  const order = ['rejected', 'needs_review', 'ready', 'approved', 'dismissed', 'published'];
  order.forEach((s) => {
    const l = cs.filter((c) => c.status === s); if (!l.length) return;
    console.log('\n' + s.toUpperCase() + ' (' + l.length + ')');
    l.forEach((c) => console.log('  ' + c.cid + '  [' + c.plan.action + (c.plan.matchId ? ' → ' + c.plan.matchId : '') + ']' + (c.reasons && c.reasons.length ? '\n      · ' + c.reasons.map(why).join('\n      · ') : '')));
  });
}
function printStats(a, b) {
  const row = (k, l) => console.log('  ' + l.padEnd(38) + String(a[k]).padEnd(28) + '→ ' + b[k]);
  console.log('\nEstadísticas GD06 (antes → después):');
  row('eventos', 'eventos publicados'); row('resultados', 'resultados publicados'); row('muestra_n', 'muestra de presencia (denominador n)'); row('muestra_eventos', 'eventos en la muestra'); row('primero', 'arquetipo más presente'); row('mezcla_n', 'n si se mezclan coberturas'); row('listas_completas', 'listas completas verificadas'); row('cartas_n', 'cartas populares: n (mínimo ' + a.minimo_cartas + ')');
}
function main(argv) {
  const o = parseArgs(argv), cmd = o._[0], paths = pathsOf(o), ctx = makeCtx(), st = P.store(paths.dir);
  const aliases = fs.existsSync(paths.aliases) ? readJson(paths.aliases) : { archetypes: [] };
  const out = (x) => { if (o.json) console.log(JSON.stringify(x, null, 1)); };
  if (cmd === 'preview' || cmd === 'stage') {
    const file = o._[1]; if (!file) { console.error('Falta el archivo de entrada.'); return 2; }
    const entry = loadEntry(file, o), base = readJson(paths.data);
    if (entry.rejected) { console.log('RECHAZADO sin guardar nada: ' + entry.rejected.rejected + ' ' + JSON.stringify(entry.rejected.detail)); return 1; }
    const an = P.analyze(entry.raw, base, ctx, o.now), sim = simulate(base, an, ctx, aliases);
    const by = {}; an.candidates.forEach((c) => { by[c.status] = (by[c.status] || 0) + 1; });
    const cnt = (f) => an.candidates.filter(f).length;
    const summary = { detectados: an.candidates.length, nuevos: cnt((c) => c.plan.action === 'new' && c.status !== 'rejected'), enriquecimientos: cnt((c) => c.plan.action === 'enrich'), duplicados: cnt((c) => c.plan.action === 'duplicate'), rechazados: by.rejected || 0, en_revision: by.needs_review || 0, listos: by.ready || 0, campos_personales_descartados: an.personal.keys + an.personal.values };
    if (o.json) { out({ summary, candidatos: an.candidates, simulacion: sim, staged: cmd === 'stage' }); } else {
      console.log((cmd === 'stage' ? 'COLA' : 'PREVISUALIZACIÓN') + ' · ' + file + ' · ' + (cmd === 'stage' ? 'se guardan los candidatos en la cola local' : 'no se escribe nada'));
      console.log('detectados ' + summary.detectados + ' · nuevos ' + summary.nuevos + ' · enriquecimientos ' + summary.enriquecimientos + ' · duplicados ' + summary.duplicados + ' · rechazados ' + summary.rechazados + ' · en revisión ' + summary.en_revision + ' · listos ' + summary.listos);
      if (summary.campos_personales_descartados) console.log('Se descartaron ' + summary.campos_personales_descartados + ' campos o valores personales de la entrada (no se guardan ni se muestran).');
      printCandidates(an.candidates);
      console.log('\nSi se aprobaran los candidatos «ready» (los «needs_review» quedan fuera hasta decidirlos):'); printStats(sim.antes, sim.despues);
      if (sim.invariantes.length) console.log('¡Invariantes no cumplidas!: ' + sim.invariantes.join(', '));
    }
    if (cmd === 'stage') { const r = P.stage(st, an, o.now); st.log({ at: o.now || new Date().toISOString(), action: 'stage', file: path.basename(file), added: r.added, kept: r.kept, resumen: summary }); if (!o.json) console.log('\nEn la cola: ' + r.added + ' candidatos nuevos o cambiados, ' + r.kept + ' sin cambios. Los datos publicados no se han tocado.'); }
    return 0;
  }
  if (cmd === 'review' || cmd === 'status') {
    const q = st.load(), l = Object.values(q.candidates).filter((c) => !o.status || c.status === o.status);
    if (o.json) { out(l); return 0; }
    if (cmd === 'status') { const by = {}; Object.values(q.candidates).forEach((c) => { by[c.status] = (by[c.status] || 0) + 1; }); console.log('Cola: ' + (Object.keys(by).length ? Object.entries(by).map((x) => x[0] + ' ' + x[1]).join(' · ') : 'vacía')); return 0; }
    if (!l.length) { console.log('La cola está vacía' + (o.status ? ' con ese estado' : '') + '.'); return 0; }
    printCandidates(l); return 0;
  }
  if (cmd === 'approve' || cmd === 'dismiss') {
    if (!o.ids || o.ids === true) { console.error('Indica --ids con los candidatos (E:… / R:…) separados por comas: la aprobación es siempre explícita.'); return 2; }
    try { const r = P.decide(st, String(o.ids).split(',').map((x) => x.trim()).filter(Boolean), { action: cmd, by: o.by, as: o.as, coverage: o.coverage, confirmType: !!o['confirm-type'], type: typeof o.type === 'string' ? o.type : undefined, note: o.note }, o.now); console.log((cmd === 'approve' ? 'Aprobados: ' : 'Descartados: ') + r.done.length + (r.skipped.length ? ' · omitidos: ' + r.skipped.map((x) => x[0] + ' (' + x[1] + ')').join(', ') : '')); return r.skipped.length && !r.done.length ? 1 : 0; }
    catch (e) { console.error('ERROR: ' + e.message); return 2; }
  }
  if (cmd === 'publish') {
    try {
      const r = P.publish(paths, ctx, { apply: !!o.apply, by: o.by, now: o.now });
      if (o.json) { out(r); return r.error ? 1 : 0; }
      console.log(r.wrote ? 'PUBLICADO' : (o.apply ? 'NO PUBLICADO' : 'SIMULACIÓN (dry-run)'));
      if (r.note) console.log(r.note); if (r.error) console.log('ERROR: ' + r.error);
      if (r.applied.length) { console.log('Candidatos aplicados: ' + r.applied.join(', ')); console.log('Cambios: ' + JSON.stringify(r.counts)); printStats(r.antes, r.despues); }
      if (r.skipped.length) console.log('Omitidos: ' + r.skipped.map((x) => x[0] + ' (' + x[1] + ')').join(', '));
      if (r.invariantes.length) console.log('Invariantes incumplidas: ' + r.invariantes.join(', '));
      if (r.wrote) console.log('Copia previa: ' + r.backup + '\nChecksum: ' + r.checksum + '\nPara deshacer: node scripts/competition_pipeline.js rollback --apply --by <id>');
      return r.error ? 1 : 0;
    } catch (e) { console.error('ERROR: ' + e.message); return 2; }
  }
  if (cmd === 'rollback') {
    const r = P.rollback(paths, { apply: !!o.apply, force: !!o.force, by: o.by, now: o.now });
    if (o.json) { out(r); return r.ok ? 0 : 1; }
    console.log(r.ok ? (r.wrote ? 'REVERTIDO' : 'SIMULACIÓN (dry-run)') : 'NO SE REVIERTE'); console.log(r.error || r.note || '');
    if (r.backup) console.log('Copia: ' + r.backup + ' · checksum actual ' + String(r.checksumActual).slice(0, 12) + ' · tras publicar ' + String(r.checksumTrasPublicar).slice(0, 12));
    if (r.safetyCopy) console.log('Copia de seguridad previa a revertir: ' + r.safetyCopy);
    return r.ok ? 0 : 1;
  }
  console.error('Uso: node scripts/competition_pipeline.js preview|stage|review|approve|dismiss|publish|rollback|status … (ver la cabecera del script)'); return 2;
}
if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { main, parseArgs, textToCanonical, loadEntry, simulate, REASONS };
