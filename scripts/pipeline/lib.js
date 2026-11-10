/* Pipeline local de resultados competitivos (Fase 6A). Sin red, sin scraping, sin dependencias: Node estándar + comp_stats.js + legality.js.
 *
 *   entrada (JSON del lote, JSON canónico o texto de mazo)
 *     → normalizar (lista blanca de campos: se descarta todo dato personal y solo se cuenta)
 *     → validar (fecha, cobertura, fuentes, cantidades, 50 cartas + catálogo + legalidad)
 *     → deduplicar contra lo publicado y dentro del lote (clasifica: new · duplicate · enrich · needs_review)
 *     → cola de revisión local (data/meta/pipeline, ignorada por git)  received → validated|rejected → ready|needs_review → approved|dismissed → published
 *     → aprobación explícita de quien opera → publicación atómica (backup + archivo temporal + rename + checksum) → bitácora sin datos personales
 *
 * Este módulo no escribe en data/competition_events.json salvo en publish() con apply:true. Todo lo demás (preview, stage, review, approve, dismiss) solo toca la cola. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../../comp_stats.js');

const STATES = ['received', 'validated', 'rejected', 'needs_review', 'ready', 'approved', 'dismissed', 'published'];
const QUALITIES = ['top_cut_only', 'single_deck'];
const EVENT_FIELDS = ['id', 'date', 'name', 'venue', 'country', 'format', 'set', 'type', 'typeSource', 'playersTotal', 'listsPublished', 'dataQuality', 'notes', 'sources'];
const SOURCE_FIELDS = ['provider', 'id', 'url', 'label', 'retrievedAt', 'license', 'canonicalUrl', 'primary'];
const PERSONAL_KEYS = /^(player|players?_?name|playername|name_?of_?player|nickname|nick|handle|username|user_?name|profile|profile_?url|player_?slug|slug|email|e-?mail|twitter|discord|instagram|owner|author|deck_?owner)$/i;
const PERSONAL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+|\/(player|players|profile|profiles|user|users|u)\//i;

const scrubStrings = (o) => { if (Array.isArray(o)) return o.map(scrubStrings); if (o && typeof o === 'object') { const r = {}; Object.keys(o).forEach((k) => { r[k] = scrubStrings(o[k]); }); return r; } return typeof o === 'string' && PERSONAL_VALUE.test(o) ? '[eliminado]' : o; };
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const isoDate = (s) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const nonNegInt = (v) => v == null || (Number.isInteger(v) && v >= 0);
const slug = (s) => S.normText(s).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'x';
const clone = (o) => JSON.parse(JSON.stringify(o));
const stable = (o) => JSON.stringify(o, null, 1) + '\n';

/* ---------------------------------------------------------------- normalización ---------------------------------------------------------------- */
/* Cuenta (sin guardar el valor) los campos personales que traía la entrada. */
function countPersonal(obj, acc) {
  acc = acc || { keys: 0, values: 0 };
  if (Array.isArray(obj)) obj.forEach((x) => countPersonal(x, acc));
  else if (obj && typeof obj === 'object') Object.keys(obj).forEach((k) => { if (PERSONAL_KEYS.test(k)) acc.keys++; else countPersonal(obj[k], acc); });
  else if (typeof obj === 'string' && PERSONAL_VALUE.test(obj)) acc.values++;
  return acc;
}
function normSource(s) {
  const o = {}; SOURCE_FIELDS.forEach((k) => { if (s && s[k] !== undefined && s[k] !== null && s[k] !== '') o[k] = s[k]; });
  return o;
}
function normEvent(e) {
  const o = {}; EVENT_FIELDS.forEach((k) => { if (e[k] !== undefined) o[k] = e[k]; });
  ['venue', 'country', 'format', 'set', 'name'].forEach((k) => { o[k] = o[k] == null ? '' : String(o[k]).trim(); });
  // procedencia del tipo: lo declara la fuente, o solo se deduce del nombre (incierto hasta que alguien lo confirme)
  if (o.type) o.typeSource = o.typeSource || 'declared'; else { o.type = S.eventType(o.name); o.typeSource = 'inferred_from_name'; }
  o.playersTotal = o.playersTotal == null ? null : o.playersTotal; o.listsPublished = o.listsPublished == null ? null : o.listsPublished;
  o.dataQuality = o.dataQuality || null; o.notes = o.notes ? String(o.notes).slice(0, 240) : '';
  o.sources = (Array.isArray(o.sources) ? o.sources : []).map(normSource);
  if (o.sources.length && !o.sources.some((s) => s.primary)) o.sources[0].primary = true;
  return o;
}
/* batch = {tournaments, results} (formato del lote); canonical = {events, results}; devuelve { events, results, personal } */
function normalizeInput(raw) {
  const personal = countPersonal(raw), cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
  let events, results;
  if (raw && Array.isArray(raw.tournaments)) {
    events = raw.tournaments.map((t) => {
      const [provider, ...rest] = String(t.id).split(':');
      return normEvent({ id: t.id, date: t.date, name: t.name, venue: t.venue, country: t.country, format: t.format, set: t.set, type: t.type, typeSource: t.typeSource, playersTotal: t.playersTotal, listsPublished: t.listsPublished,
        dataQuality: t.dataQuality, notes: '', sources: [{ provider, id: rest.join(':'), url: t.sourceUrl || '', label: t.sourceProvider || provider, primary: true }] });
    });
    results = (raw.results || []).map((r) => S.sanitizeResult({ id: r.id, eventId: r.tournamentId, placement: r.placement, archetype: r.archetype || null, colors: (r.colors || []).map(cap), set: r.set || '', country: r.country || '',
      sourceUrl: r.resultSourceUrl || '', decklistUrl: r.decklistUrl || null, cards: r.cards && typeof r.cards === 'object' ? r.cards : null, origin: r.origin }));
  } else if (raw && Array.isArray(raw.events)) {
    events = raw.events.map(normEvent); results = (raw.results || []).map((r) => S.sanitizeResult(r));
  } else throw new Error('Formato de entrada no reconocido: se esperaba { tournaments, results } o { events, results }.');
  return { events, results, personal };
}

/* ---------------------------------------------------------------- validación ---------------------------------------------------------------- */
/* Devuelve { errors:[código], review:[código], detail:{} }. errors = se rechaza; review = hace falta una persona. */
function validateEvent(e, ctx) {
  const errors = [], review = [], detail = {};
  if (!e.id) errors.push('event_no_id');
  if (!isoDate(e.date)) errors.push('event_bad_date');
  if (!e.set || !/^(GD|ST|EB)\d+(\.\d+)?$/i.test(e.set)) errors.push('event_bad_set');
  if (!nonNegInt(e.playersTotal) || !nonNegInt(e.listsPublished)) errors.push('event_bad_counts');
  if (e.playersTotal != null && e.listsPublished != null && e.listsPublished > e.playersTotal) errors.push('event_lists_exceed_players');
  if (!e.sources.length || !e.sources.some((s) => s.id || s.url)) review.push('event_no_source');
  if (e.dataQuality && QUALITIES.indexOf(e.dataQuality) < 0) { errors.push('event_unknown_quality'); detail.dataQuality = e.dataQuality; }
  if (PERSONAL_VALUE.test([e.name, e.venue, e.notes].join(' ')) || e.sources.some((s) => PERSONAL_VALUE.test(String(s.url || '') + ' ' + String(s.canonicalUrl || '')))) errors.push('event_personal_data');
  return { errors, review, detail };
}
/* Una composición solo es completa si suma 50, cantidades enteras 1-4, códigos del catálogo y legalidad a la fecha del torneo. */
function validateCards(cards, date, ctx) {
  const st = S.deckStatus({ cards }, (n) => !!ctx.catalog[n]);
  if (st !== 'complete') {
    const total = Object.keys(cards || {}).reduce((a, k) => a + (Number(cards[k]) || 0), 0), unknown = Object.keys(cards || {}).filter((k) => !ctx.catalog[k]);
    return { ok: false, code: unknown.length ? 'cards_unknown_code' : (total === 50 ? 'cards_invalid_quantity' : 'cards_not_50'), detail: { status: st, total, unknown } };
  }
  const when = isoDate(date) ? new Date(date + 'T12:00:00Z') : new Date();
  const v = ctx.legality.validateDeck(cards, ctx.legality.getActiveRuleset(ctx.rulesets, when, 'EN'), ctx.catalog);
  return v.status === 'legal' ? { ok: true } : { ok: false, code: 'cards_illegal', detail: { rules: v.errors.map((x) => x.ruleType) } };
}
function validateResult(r, ctx, eventDate) {
  const errors = [], review = []; let cardsDetail = null;
  if (!r.id) errors.push('result_no_id');
  if (!(r.placement == null || (Number.isInteger(r.placement) && r.placement >= 1))) errors.push('result_bad_placement');
  if (S.originOf(r) === 'tournament' && !r.eventId) errors.push('result_no_event');
  if (PERSONAL_VALUE.test([r.archetype, r.sourceUrl, r.decklistUrl].join(' '))) errors.push('result_personal_data');
  if (!r.archetype) review.push('result_no_archetype');
  if (r.cards) { const c = validateCards(r.cards, eventDate, ctx); if (!c.ok) { review.push(c.code); cardsDetail = c.detail; } }
  return { errors, review, cardsDetail };
}

/* ---------------------------------------------------------------- deduplicación ---------------------------------------------------------------- */
/* Huella de un evento: fecha + sede + país + formato + set. SIN el tipo ni el nombre: dos «tipos» distintos el mismo día en la misma sede pueden ser el mismo evento mal etiquetado. null si falta la sede. */
function fingerprint(e) {
  if (!S.normText(e.venue)) return null;
  return [e.date, S.normText(e.venue), S.normText(e.country), S.normText(e.format), S.normText(e.set)].join('|');
}
function sharesSource(a, b) {
  return (a.sources || []).some((x) => (b.sources || []).some((y) => (x.id && y.id && x.provider === y.provider && x.id === y.id) || (S.canonUrl(x.canonicalUrl || x.url) && S.canonUrl(x.canonicalUrl || x.url) === S.canonUrl(y.canonicalUrl || y.url))));
}
/* new · duplicate (seguro: mismo id o misma fuente → se suman las fuentes) · review (misma huella con otros ids, o sin sede para compararlo) */
function classifyEvent(existing, cand) {
  const hit = existing.find((e) => e.id === cand.id || sharesSource(e, cand));
  if (hit) {   // el id o la fuente oficial mandan, pero si el tipo se contradice no se fusiona en silencio
    const ta = S.normText(hit.type), tb = S.normText(cand.type);
    if (ta && tb && ta !== tb) return { action: 'review', matchId: hit.id, reason: 'type_conflict' };
    return { action: 'duplicate', matchId: hit.id, reason: 'same_id_or_source' };
  }
  const fp = fingerprint(cand), same = fp && existing.find((e) => fingerprint(e) === fp);
  if (same) return { action: 'review', matchId: same.id, reason: 'fingerprint' };
  const open = existing.find((e) => e.date === cand.date && S.normText(e.name) === S.normText(cand.name) && S.normText(e.country) === S.normText(cand.country) && S.normText(e.set) === S.normText(cand.set) && (!S.normText(e.venue) || !S.normText(cand.venue)));
  if (open) return { action: 'review', matchId: open.id, reason: 'no_venue_to_compare' };
  return { action: 'new', matchId: null, reason: null };
}
/* new · duplicate · enrich (el resultado ya existe y gana cartas: conserva SU id y su aparición) · review */
function classifyResult(existing, cand, targetEventId) {
  const byId = existing.find((r) => r.id === cand.id || (cand.decklistUrl && r.decklistUrl && S.canonUrl(r.decklistUrl) === S.canonUrl(cand.decklistUrl)));
  const pool = byId ? [byId] : existing.filter((r) => r.eventId === targetEventId && cand.placement != null && r.placement === cand.placement);
  if (!pool.length) return { action: 'new', matchId: null, reason: null };
  const hit = pool[0], sameArch = !hit.archetype || !cand.archetype || S.normText(hit.archetype) === S.normText(cand.archetype);
  if (!byId && !sameArch) return { action: 'review', matchId: hit.id, reason: 'same_placement_other_archetype' };   // puede ser un empate real
  if (cand.cards && !hit.cards) return { action: 'enrich', matchId: hit.id, reason: null };
  if (cand.cards && hit.cards) return JSON.stringify(Object.keys(cand.cards).sort().map((k) => [k, cand.cards[k]])) === JSON.stringify(Object.keys(hit.cards).sort().map((k) => [k, hit.cards[k]])) ? { action: 'duplicate', matchId: hit.id, reason: 'same_cards' } : { action: 'review', matchId: hit.id, reason: 'different_cards' };
  return { action: 'duplicate', matchId: hit.id, reason: 'same_result' };
}
/* cobertura del evento: la declarada; con un solo mazo se propone single_deck; si no, hace falta que alguien la indique */
function coverageOf(e, nResults) {
  if (e.dataQuality) return { value: e.dataQuality, inferred: false };
  if (nResults === 1) return { value: 'single_deck', inferred: true };
  return { value: null, inferred: false };
}

/* ---------------------------------------------------------------- cola de revisión ---------------------------------------------------------------- */
function store(dir) {
  const file = path.join(dir, 'queue.json'), logFile = path.join(dir, 'log.jsonl');
  return {
    dir, file, logFile,
    load() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { version: 1, candidates: {} }; } },
    save(q) { fs.mkdirSync(dir, { recursive: true }); atomicWrite(file, stable(q)); },
    log(entry) { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(logFile, JSON.stringify(entry) + '\n'); },
    readLog() { try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } },
  };
}
function atomicWrite(file, text) {
  const tmp = file + '.tmp-' + process.pid; fs.writeFileSync(tmp, text); fs.renameSync(tmp, file);
}

/* Analiza una entrada contra lo publicado y devuelve los candidatos con su estado propuesto (no escribe nada). */
function analyze(raw, base, ctx, now) {
  const norm = normalizeInput(raw), cands = [], at = now || new Date().toISOString();
  const evOf = {}; norm.events.forEach((e) => { evOf[e.id] = e; });
  const resByEvent = {}; norm.results.forEach((r) => { (resByEvent[r.eventId] = resByEvent[r.eventId] || []).push(r); });
  const fpIds = {}; norm.events.forEach((e) => { const k = fingerprint(e); if (k) (fpIds[k] = fpIds[k] || {})[e.id] = 1; });
  const evPlan = {}, seenEv = {}, seenRes = {};   // id de evento del lote → { action, id destino }
  norm.events.forEach((e) => {
    const v = validateEvent(e, ctx), c = classifyEvent(base.events, e), cov = coverageOf(e, (resByEvent[e.id] || []).length), reasons = v.errors.slice();
    const review = v.review.slice();
    if (!reasons.length) {
      if (c.action === 'review') review.push('event_' + c.reason);
      if (!cov.value) review.push('coverage_unknown'); else if (cov.inferred) review.push('coverage_inferred');
    }
    if (seenEv[e.id]) reasons.push('event_duplicate_in_batch'); seenEv[e.id] = true;
    const fpk = fingerprint(e); if (!reasons.length && c.action !== 'duplicate' && fpk && Object.keys(fpIds[fpk]).length > 1) review.push('event_fingerprint_in_batch');
    if (!reasons.length && (c.action === 'new' || c.action === 'review') && e.typeSource === 'inferred_from_name') review.push('event_type_inferred');
    let payload = Object.assign({}, e, { dataQuality: cov.value || e.dataQuality });
    if (reasons.some((x) => /personal_data/.test(x))) payload = scrubStrings(payload);
    const evStatus = reasons.length ? 'rejected' : (review.length ? 'needs_review' : 'ready');
    evPlan[e.id] = { action: c.action, target: c.matchId || e.id, status: evStatus };
    cands.push({ cid: 'E:' + e.id, kind: 'event', status: evStatus, reasons: reasons.length ? reasons : review, plan: { action: c.action, matchId: c.matchId, reason: c.reason }, payload, history: [{ at, status: 'received' }] });
  });
  norm.results.forEach((r) => {
    const ev = evOf[r.eventId], plan = evPlan[r.eventId];
    const v = validateResult(r, ctx, ev ? ev.date : null); let payload = clone(r);
    if (seenRes[r.id]) v.errors.push('result_duplicate_in_batch'); seenRes[r.id] = true;
    if (v.errors.some((x) => /personal_data/.test(x))) payload = scrubStrings(payload);
    if (v.review.some((c) => /^cards_/.test(c))) { payload.cards = null; payload.cardsRejected = v.review.filter((c) => /^cards_/.test(c))[0]; }   // nunca se publica una composición dudosa como completa
    const target = plan ? plan.target : r.eventId, c = classifyResult(base.results, payload, target);
    const reasons = v.errors.slice(), review = v.review.slice();
    if (!ev && S.originOf(r) === 'tournament' && !base.events.some((e) => e.id === r.eventId)) reasons.push('result_event_missing');
    if (!reasons.length && c.action === 'review') review.push('result_' + c.reason);
    if (!reasons.length && plan && (plan.action === 'review' || plan.status !== 'ready')) review.push('event_pending_review');   // el resultado no avanza si su evento aún no está listo
    payload.eventId = target;
    cands.push({ cid: 'R:' + r.id, kind: 'result', status: reasons.length ? 'rejected' : (review.length ? 'needs_review' : 'ready'), reasons: reasons.length ? reasons : review, plan: { action: c.action, matchId: c.matchId, eventSource: r.eventId }, payload, history: [{ at, status: 'received' }] });
  });
  return { candidates: cands, personal: norm.personal };
}

/* Guarda los candidatos en la cola. Reimportar el mismo lote no duplica ni retrocede estados (la identidad es el cid). */
function stage(st, analysis, now) {
  const q = st.load(), at = now || new Date().toISOString(), out = { added: 0, kept: 0 };
  analysis.candidates.forEach((c) => {
    const prev = q.candidates[c.cid];
    if (prev && ['approved', 'dismissed', 'published'].indexOf(prev.status) >= 0) { out.kept++; return; }   // lo ya decidido no se pisa
    if (prev && JSON.stringify([prev.payload, prev.plan, prev.reasons, prev.status]) === JSON.stringify([c.payload, c.plan, c.reasons, c.status])) { out.kept++; return; }
    c.history = (prev ? prev.history : []).concat([{ at, status: c.status, reasons: c.reasons }]);
    q.candidates[c.cid] = c; out.added++;
  });
  st.save(q); return out;
}

/* Aprobación explícita. `by` es un identificador interno (no un nombre ni un correo). Un fingerprint exige decidir: as = 'new' (otra sesión del mismo sitio) o 'merge' (es el mismo evento). */
function decide(st, ids, opts, now) {
  if (!/^[a-z0-9_-]{2,24}$/i.test(opts.by || '')) throw new Error('--by debe ser un identificador interno de 2 a 24 caracteres (letras, números, - o _): no un nombre ni un correo.');
  const q = st.load(), at = now || new Date().toISOString(), done = [], skipped = [];
  ids.forEach((id) => {
    const c = q.candidates[id];
    if (!c) { skipped.push([id, 'no_existe']); return; }
    if (opts.action === 'approve') {
      if (['ready', 'needs_review'].indexOf(c.status) < 0) { skipped.push([id, 'estado_' + c.status]); return; }
      const plan = clone(c.plan), payload = clone(c.payload);   // se trabaja sobre copias: si algo falla, el candidato queda como estaba
      if (plan.action === 'review') {
        if (['new', 'merge'].indexOf(opts.as) < 0) { skipped.push([id, 'falta_--as_new|merge']); return; }
        if (opts.as === 'new' && plan.reason === 'type_conflict') { skipped.push([id, 'id_existente:_solo_--as_merge']); return; }
        plan.decision = opts.as; plan.action = opts.as === 'merge' ? 'duplicate' : 'new';
      }
      if (c.reasons.indexOf('coverage_unknown') >= 0 && QUALITIES.indexOf(opts.coverage) < 0) { skipped.push([id, 'falta_--coverage']); return; }
      if (opts.coverage && c.kind === 'event') payload.dataQuality = opts.coverage;
      if (c.reasons.indexOf('coverage_unknown') >= 0 && !payload.dataQuality) { skipped.push([id, 'falta_--coverage']); return; }
      if (c.kind === 'event' && plan.action === 'new' && c.reasons.indexOf('event_type_inferred') >= 0) {   // el tipo solo se dedujo del nombre: hay que confirmarlo
        if (!opts.confirmType) { skipped.push([id, 'falta_--confirm-type']); return; }
        if (opts.type) payload.type = String(opts.type).trim().slice(0, 60);
        payload.typeSource = 'operator_confirmed';
      }
      c.plan = plan; c.payload = payload; c.status = 'approved';
    } else { if (['published'].indexOf(c.status) >= 0) { skipped.push([id, 'ya_publicado']); return; } c.status = 'dismissed'; }
    c.history.push({ at, status: c.status, operator: opts.by, note: opts.note ? String(opts.note).slice(0, 200) : undefined });
    done.push(id);
  });
  st.save(q);
  st.log({ at, action: opts.action, operator: opts.by, ids: done, note: opts.note ? String(opts.note).slice(0, 200) : undefined });
  return { done, skipped };
}

/* ---------------------------------------------------------------- publicación ---------------------------------------------------------------- */
function mergeSources(a, b) {
  const seen = {}, out = [];
  (a || []).concat(b || []).forEach((s) => { const k = S.canonUrl(s.canonicalUrl || s.url) || s.provider + ':' + s.id; if (!seen[k]) { seen[k] = 1; out.push(Object.assign({}, s, { primary: out.length === 0 ? true : false })); } });
  return out;
}
/* Aplica sobre `base` los candidatos aprobados. Devuelve { data, applied:[cid], skipped:[[cid, motivo]], counts }. */
function applyApproved(base, q, table) {
  const data = clone(base), applied = [], skipped = [], counts = { eventsNew: 0, eventsMerged: 0, resultsNew: 0, resultsEnriched: 0, resultsNoop: 0 };
  const cands = Object.values(q.candidates).filter((c) => c.status === 'approved').sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'event' ? -1 : 1) || x.cid.localeCompare(y.cid));
  const evTarget = {};   // id del lote → id publicado
  cands.filter((c) => c.kind === 'event').forEach((c) => {
    const p = c.payload;
    if (c.plan.action === 'duplicate') {
      const e = data.events.find((x) => x.id === c.plan.matchId); if (!e) { skipped.push([c.cid, 'destino_inexistente']); return; }
      e.sources = mergeSources(e.sources, p.sources); evTarget[p.id] = e.id; counts.eventsMerged++; applied.push(c.cid); return;
    }
    if (c.plan.action !== 'new') { skipped.push([c.cid, 'sin_decision']); return; }
    if (data.events.some((x) => x.id === p.id)) { skipped.push([c.cid, 'id_ya_existe']); return; }
    data.events.push(clone(p)); evTarget[p.id] = p.id; counts.eventsNew++; applied.push(c.cid);
  });
  cands.filter((c) => c.kind === 'result').forEach((c) => {
    const p = clone(c.payload); delete p.cardsRejected;
    const evId = evTarget[c.plan.eventSource] || (data.events.some((e) => e.id === p.eventId) ? p.eventId : null);
    if (S.originOf(p) === 'tournament' && !evId) { skipped.push([c.cid, 'evento_sin_publicar']); return; }
    if (evId) p.eventId = evId;
    if (c.plan.action === 'enrich' || (c.plan.matchId && c.plan.action === 'duplicate')) {
      const hit = data.results.find((r) => r.id === c.plan.matchId);
      if (!hit) { skipped.push([c.cid, 'destino_inexistente']); return; }
      if (c.plan.action === 'enrich' && p.cards && !hit.cards) { hit.cards = p.cards; if (p.decklistUrl && !hit.decklistUrl) hit.decklistUrl = p.decklistUrl; counts.resultsEnriched++; } else counts.resultsNoop++;
      applied.push(c.cid); return;
    }
    if (data.results.some((r) => r.id === p.id)) { skipped.push([c.cid, 'id_ya_existe']); return; }
    data.results.push(p); counts.resultsNew++; applied.push(c.cid);
  });
  data.results = S.dedupeResults(S.applyArchetypes(data.results, table || { archetypes: [] }).map(S.sanitizeResult)).results;
  data.events.sort((a, b) => String(b.date).localeCompare(a.date) || a.id.localeCompare(b.id));
  data.results.sort((a, b) => a.eventId.localeCompare(b.eventId) || (a.placement || 0) - (b.placement || 0) || a.id.localeCompare(b.id));
  return { data, applied, skipped, counts };
}
/* Invariantes que debe cumplir cualquier archivo antes de publicarse */
function invariants(d, ctx) {
  const bad = [], ids = {}, rids = {};
  d.events.forEach((e) => { if (ids[e.id]) bad.push('evento_repetido:' + e.id); ids[e.id] = 1; if (!isoDate(e.date)) bad.push('fecha:' + e.id); if (e.dataQuality && QUALITIES.indexOf(e.dataQuality) < 0) bad.push('calidad:' + e.id); if (!e.sources || !e.sources.length) bad.push('sin_fuente:' + e.id); });
  d.results.forEach((r) => {
    if (rids[r.id]) bad.push('lista_repetida:' + r.id); rids[r.id] = 1;
    if (S.originOf(r) === 'tournament' && !ids[r.eventId]) bad.push('lista_sin_evento:' + r.id);
    if (Object.keys(r).some((k) => S.RESULT_FIELDS.indexOf(k) < 0)) bad.push('campo_no_permitido:' + r.id);
    if (r.cards) { const c = validateCards(r.cards, (d.events.find((e) => e.id === r.eventId) || {}).date, ctx); if (!c.ok) bad.push('cartas_invalidas:' + r.id + ':' + c.code); }
  });
  d.events.forEach((e) => { if (e.typeSource === 'inferred_from_name') bad.push('tipo_sin_confirmar:' + e.id); });
  if (/"player"|"profile"|"email"|"slug"/i.test(JSON.stringify(d))) bad.push('dato_personal');
  return bad;
}
function stats(d, ctx, set) {
  set = set || 'GD06';
  const p = S.presence(d.results, d.events, { set }), pa = S.presence(d.results, d.events, { set, coverage: 'all' }), inc = S.inclusion(d.results, d.events, { set }, (n) => !!ctx.catalog[n]);
  const top = p.rows[0];
  return { eventos: d.events.length, resultados: d.results.length, muestra_n: p.n, muestra_eventos: p.events, primero: top ? top.archetype + ' ' + top.lists + '/' + p.n + ' = ' + (top.pct).toFixed(1) + '%' : null,
    mezcla_n: pa.n, cartas_n: inc.n, minimo_cartas: S.MIN_LISTS_FOR_CARDS, listas_completas: d.results.filter((r) => S.deckStatus(r) === 'complete').length };
}
/* publica (apply:true) o simula (por defecto) */
function publish(paths, ctx, opts) {
  const st = store(paths.dir), q = st.load(), now = opts.now || new Date().toISOString();
  const rawBase = fs.readFileSync(paths.data, 'utf8'), base = JSON.parse(rawBase);
  const table = (() => { try { return JSON.parse(fs.readFileSync(paths.aliases, 'utf8')); } catch (e) { return { archetypes: [] }; } })();
  const res = applyApproved(base, q, table); res.data.updatedAt = (res.applied.length ? now.slice(0, 10) : base.updatedAt);
  const before = stats(base, ctx), after = stats(res.data, ctx), bad = invariants(res.data, ctx);
  const report = { applied: res.applied, skipped: res.skipped, counts: res.counts, antes: before, despues: after, invariantes: bad };
  if (!res.applied.length) return Object.assign(report, { wrote: false, note: 'No hay candidatos aprobados nuevos: nada que publicar.' });
  if (bad.length) return Object.assign(report, { wrote: false, error: 'La publicación se aborta: el resultado no cumple las invariantes.' });
  if (!opts.apply) return Object.assign(report, { wrote: false, note: 'Simulación (dry-run): no se ha escrito nada. Repite con --apply para publicar.' });
  if (!/^[a-z0-9_-]{2,24}$/i.test(opts.by || '')) throw new Error('--by debe ser un identificador interno de 2 a 24 caracteres.');
  const text = stable(res.data), tmp = paths.data + '.tmp-' + process.pid;
  fs.mkdirSync(paths.backups, { recursive: true });
  const backup = path.join(paths.backups, 'competition_events-' + now.replace(/[:.]/g, '-') + '-pre-publish.json');
  fs.writeFileSync(backup, rawBase); fs.writeFileSync(backup + '.sha256', sha256(rawBase) + '\n');
  fs.writeFileSync(tmp, text);
  try {   // se comprueba el archivo temporal ANTES de colocarlo: si algo falla, el original sigue intacto
    const back = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    if (sha256(fs.readFileSync(tmp, 'utf8')) !== sha256(text) || invariants(back, ctx).length) throw new Error('verificación del archivo temporal fallida');
    fs.renameSync(tmp, paths.data);
  } catch (e) { try { fs.unlinkSync(tmp); } catch (e2) { /* nada */ } throw e; }
  Object.values(q.candidates).forEach((c) => { if (res.applied.indexOf(c.cid) >= 0) { c.status = 'published'; c.history.push({ at: now, status: 'published', operator: opts.by }); } });
  st.save(q);
  const entry = { at: now, action: 'publish', operator: opts.by, applied: res.applied, counts: res.counts, checksumBefore: sha256(rawBase), checksumAfter: sha256(text), backup: path.basename(backup), antes: before, despues: after };
  st.log(entry);
  return Object.assign(report, { wrote: true, backup, checksum: entry.checksumAfter });
}
/* Reversión segura: solo si el archivo actual es EXACTAMENTE el que dejó la última publicación (si hubo cambios posteriores, se niega salvo force) */
function rollback(paths, opts) {
  const st = store(paths.dir), log = st.readLog().filter((l) => l.action === 'publish'), last = log[log.length - 1];
  if (!last) return { ok: false, error: 'No hay ninguna publicación registrada en la bitácora.' };
  const backup = path.join(paths.backups, last.backup);
  if (!fs.existsSync(backup)) return { ok: false, error: 'No se encuentra la copia ' + last.backup };
  const cur = fs.readFileSync(paths.data, 'utf8'), curSum = sha256(cur);
  const info = { backup: last.backup, checksumActual: curSum, checksumTrasPublicar: last.checksumAfter, checksumCopia: sha256(fs.readFileSync(backup, 'utf8')), candidatos: last.applied };
  if (curSum !== last.checksumAfter && !opts.force) return Object.assign({ ok: false, error: 'El archivo actual NO es el que dejó la última publicación: hay cambios posteriores (otra importación o edición). No se revierte a ciegas; revisa el diff o usa --force sabiendo que se perderán.' }, info);
  if (!opts.apply) return Object.assign({ ok: true, wrote: false, note: 'Simulación: se restauraría la copia y los candidatos volverían a «approved». Repite con --apply.' }, info);
  fs.mkdirSync(paths.backups, { recursive: true });
  const safety = path.join(paths.backups, 'competition_events-' + (opts.now || new Date().toISOString()).replace(/[:.]/g, '-') + '-pre-rollback.json'); fs.writeFileSync(safety, cur);
  atomicWrite(paths.data, fs.readFileSync(backup, 'utf8'));
  const q = st.load(); (last.applied || []).forEach((cid) => { if (q.candidates[cid] && q.candidates[cid].status === 'published') { q.candidates[cid].status = 'approved'; q.candidates[cid].history.push({ at: opts.now || new Date().toISOString(), status: 'approved', note: 'rollback' }); } }); st.save(q);
  st.log({ at: opts.now || new Date().toISOString(), action: 'rollback', operator: opts.by, restored: last.backup, safetyCopy: path.basename(safety) });
  return Object.assign({ ok: true, wrote: true, safetyCopy: safety }, info);
}

module.exports = { STATES, QUALITIES, PERSONAL_KEYS, sha256, isoDate, normalizeInput, validateEvent, validateResult, validateCards, fingerprint, classifyEvent, classifyResult, coverageOf, store, analyze, stage, decide, applyApproved, invariants, stats, publish, rollback, atomicWrite, countPersonal };
