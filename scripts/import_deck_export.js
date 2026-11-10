/* Añade UNA lista a data/competition_events.json a partir de una exportación de texto (WinDecks, WhiteBase, ExBurst, Limitless…).
 * No descarga nada de ninguna web: el texto lo aporta una persona (copiar mazo / exportar) y este script solo lo valida y lo guarda.
 *
 *   node scripts/import_deck_export.js lista.txt --origin tournament --placement 1 --set GD06 --source WinDecks --url <página de la lista> \
 *        (--event <id del torneo ya existente> | --event-id windecks:<id> --date 2026-11-03 [--name … --venue … --players N --country Japan --format Standard --event-url <url>]) \
 *        [--archetype "X" --colors Blue,Green] [--dry]
 *   node scripts/import_deck_export.js lista.txt --origin community --set GD06 --source WhiteBase [--archetype "X" --colors …] [--dry]
 *
 * Antes de guardar comprueba y muestra: que suma 50 con máximo 4 por código · que todos los códigos existen en el catálogo · las reglas de
 * construcción vigentes (legality.js + data/rulesets.json, a la fecha del torneo) · si la lista o el torneo ya existen · y no guarda nada si algo falla.
 * "set" es el entorno competitivo (la temporada del torneo), NO el set de las cartas: una lista GD06 puede llevar cartas de cualquier expansión legal.
 * Si el torneo ya existe y ya hay un resultado en ese puesto (p. ej. cargado desde otra fuente), la composición se AÑADE a ese resultado
 * (no se crea otro): la presencia de arquetipos no cambia, solo gana la composición. Nunca se guardan nombres de personas. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('../comp_stats.js');
const Legality = require('../legality.js');
const ROOT = path.join(__dirname, '..');

function loadCatalog() {
  const map = {};
  fs.readdirSync(path.join(ROOT, 'data')).filter((f) => /^(ST|GD|EB)\d+\.json$/.test(f)).forEach((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); (Array.isArray(d) ? d : d.cards || []).forEach((c) => { map[c.number] = c; });
  });
  return map;
}
function loadRulesets() { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'rulesets.json'), 'utf8')).rulesets; }

const cleanUrl = (u) => { try { const x = new URL(String(u)); x.search = ''; x.hash = ''; return x.protocol === 'https:' ? x.toString().replace(/\/+$/, '') : ''; } catch (e) { return ''; } };
const cardsKey = (c) => crypto.createHash('sha1').update(JSON.stringify(Object.keys(c).sort().map((k) => [k, c[k]]))).digest('hex');

/* ctx = { catalog: {numero: carta}, rulesets, legality }  (inyectable para las pruebas) */
function build(text, o, existing, ctx) {
  const checks = [], fail = (name, detail) => { checks.push({ name, ok: false, detail }); return { error: name + ': ' + detail, checks }; }, pass = (name, detail) => checks.push({ name, ok: true, detail });
  const origin = o.origin === 'community' ? 'community' : 'tournament';
  const p = S.parseDeckExport(text);
  if (p.errors.length) return fail('Texto', 'líneas que no se entienden: ' + p.errors.map((e) => e.line + ' «' + e.text + '»').join('; '));
  if (p.total !== 50) return fail('Suma de cartas', p.total + ' cartas; hacen falta exactamente 50');
  if (Object.keys(p.cards).some((c) => p.cards[c] > 4)) return fail('Copias por código', 'hay códigos con más de 4 copias: ' + Object.keys(p.cards).filter((c) => p.cards[c] > 4).join(', '));
  pass('Suma de cartas', '50 cartas, ' + Object.keys(p.cards).length + ' códigos distintos');
  const unknown = Object.keys(p.cards).filter((c) => !ctx.catalog[c]);
  if (unknown.length) return fail('Catálogo', unknown.length + ' códigos no existen en el catálogo de Gundaneo: ' + unknown.join(', ') + ' (no se sustituyen ni se adivinan)');
  pass('Catálogo', 'los ' + Object.keys(p.cards).length + ' códigos existen en el catálogo');
  const when = o.date ? new Date(o.date + 'T12:00:00Z') : new Date();
  const rs = ctx.legality.getActiveRuleset(ctx.rulesets, when, 'EN'), v = ctx.legality.validateDeck(p.cards, rs, ctx.catalog);
  if (v.status !== 'legal') return fail('Reglas de construcción (' + (rs && rs.id) + ')', v.status + ': ' + v.errors.map((e) => e.ruleType + (e.cardNumbers && e.cardNumbers.length ? ' [' + e.cardNumbers.join(', ') + ']' : '')).join('; '));
  pass('Reglas de construcción', 'legal según ' + rs.id + (o.date ? ' a fecha ' + o.date : ' (a fecha de hoy: no se indicó la del torneo)'));

  const url = o.url ? cleanUrl(o.url) : '';
  if (o.url && !url) return fail('URL', 'la URL de la lista no es https válida');
  const events = existing.events.slice(), results = existing.results.slice();
  let eventId = null, newEvent = null, attachTo = null, merged = [], review = [];
  if (origin === 'tournament') {
    if (!(Number(o.placement) >= 1)) return fail('Posición', 'falta --placement (1 = primer puesto)');
    if (o.event) {
      if (!events.some((e) => e.id === o.event)) return fail('Torneo', 'el torneo ' + o.event + ' no existe en el archivo');
      eventId = o.event; pass('Torneo', 'ya existe: ' + eventId);
    } else {
      if (!o.eventId || !/^[a-z0-9]+:.+/i.test(o.eventId) || !/^\d{4}-\d{2}-\d{2}$/.test(o.date || '')) return fail('Torneo nuevo', 'indica --event-id proveedor:id y --date AAAA-MM-DD (o --event de un torneo existente)');
      const prov = o.eventId.split(':')[0].toLowerCase(), pid = o.eventId.slice(o.eventId.indexOf(':') + 1);
      newEvent = { id: prov + ':' + pid, date: o.date, name: o.name || '', venue: o.venue || '', country: o.country || '', format: o.format || '', set: o.set || '', type: S.eventType(o.name),
        playersTotal: o.players ? Number(o.players) : null, listsPublished: null, dataQuality: 'single_deck', notes: '',
        sources: [{ provider: prov, id: pid, url: cleanUrl(o.eventUrl) || url, label: o.source || prov, primary: true }] };
      const ev = S.dedupeEvents(events.concat([newEvent]));
      merged = ev.merged; review = ev.review.filter((r) => r.b === newEvent.id);
      const hit = merged.find((m) => m.dropped === newEvent.id);
      if (hit) { eventId = hit.kept; pass('Torneo', 'ya existía como ' + eventId + ': se suma esta fuente, no se duplica'); }
      else { eventId = newEvent.id; pass('Torneo', 'torneo nuevo ' + eventId + (review.length ? ' · POSIBLE DUPLICADO de ' + review.map((r) => r.a).join(', ') + ' (falta la sede para asegurarlo): revisa antes de seguir' : '')); }
    }
    const same = results.filter((r) => r.eventId === eventId && r.placement === Number(o.placement));
    if (same.some((r) => S.deckStatus(r) === 'complete')) return fail('Lista', 'ese puesto del torneo ya tiene una composición verificada (' + same.find((r) => S.deckStatus(r) === 'complete').id + ')');
    if (same.length) { attachTo = same[0].id; pass('Lista', 'ya hay un resultado en ese puesto (' + same[0].archetype + '): se le añade la composición; la presencia de arquetipos no cambia'); }
    else pass('Lista', 'resultado nuevo en el puesto ' + o.placement + ': suma 1 a la muestra de listas publicadas de ese torneo');
  }
  const key = cardsKey(p.cards);
  const twin = results.find((r) => r.cards && cardsKey(r.cards) === key);
  if (twin && (origin === 'community' || twin.eventId === eventId)) return fail('Duplicado', 'esta misma composición ya está guardada (' + twin.id + ')');
  if (twin) pass('Duplicado', 'la misma composición existe en otro torneo (' + twin.id + '): no es un duplicado, pero conviene saberlo');
  const id = o.id || ((o.source || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '') + ':' + key.slice(0, 12));
  if (results.some((r) => r.id === id) && !attachTo) return fail('Duplicado', 'ya existe una lista con el id ' + id);
  pass('Duplicado', 'no existe otra lista igual en este torneo');
  const result = S.sanitizeResult({
    id, eventId: origin === 'tournament' ? eventId : null, placement: origin === 'tournament' ? Number(o.placement) : null, archetype: o.archetype || null,
    colors: String(o.colors || '').split(',').map((x) => x.trim()).filter(Boolean), set: o.set || '', country: '', origin, sourceUrl: '', decklistUrl: url || null, cards: p.cards,
  });
  return { result, newEvent: newEvent && !merged.some((m) => m.dropped === newEvent.id) ? newEvent : null, mergedEvent: merged.find((m) => newEvent && m.dropped === newEvent.id) ? newEvent : null, attachTo, review, checks };
}

/* Aplica el resultado de build() sobre el contenido del archivo y devuelve el contenido nuevo */
function apply(existing, b, updated) {
  const { merge } = require('./import_competition_batch.js');
  let results = existing.results.slice(), events = existing.events.slice();
  if (b.attachTo) results = results.map((r) => (r.id === b.attachTo ? Object.assign({}, r, { cards: b.result.cards, decklistUrl: b.result.decklistUrl || r.decklistUrl || null, colors: r.colors && r.colors.length ? r.colors : b.result.colors }) : r));
  else results.push(b.result);
  if (b.newEvent) events.push(b.newEvent);
  else if (b.mergedEvent) events.push(b.mergedEvent);   // dedupeEvents lo funde con el existente y suma la fuente
  return merge({ events: [], results: [] }, { events, results }, updated).out;
}

function main() {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
  const file = a.find((x, i) => !x.startsWith('--') && !(a[i - 1] || '').startsWith('--'));
  if (!file) { console.error('Uso: node scripts/import_deck_export.js lista.txt --origin tournament|community … (ver la cabecera del script)'); process.exit(2); }
  const out = path.resolve(opt('out') || path.join(ROOT, 'data', 'competition_events.json'));
  const existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { events: [], results: [] };
  const o = { origin: opt('origin'), event: opt('event'), eventId: opt('event-id'), eventUrl: opt('event-url'), date: opt('date'), name: opt('name'), venue: opt('venue'), players: opt('players'), country: opt('country'), format: opt('format'),
    placement: opt('placement'), archetype: opt('archetype'), colors: opt('colors'), set: opt('set'), source: opt('source'), url: opt('url'), id: opt('id') };
  const b = build(fs.readFileSync(file, 'utf8'), o, existing, { catalog: loadCatalog(), rulesets: loadRulesets(), legality: Legality });
  b.checks.forEach((c) => console.log((c.ok ? '  OK    ' : '  FALLA ') + c.name + ': ' + c.detail));
  if (b.error) { console.error('\nNO SE GUARDA NADA.'); process.exit(1); }
  if (b.review && b.review.length && !a.includes('--accept-review')) { console.error('\nNO SE GUARDA: posible duplicado de torneo. Si es otro torneo distinto, repite con --accept-review.'); process.exit(1); }
  if (a.includes('--dry')) { console.log('\n(--dry: no se escribe nada)'); return; }
  const next = apply(existing, b, existing.updatedAt || new Date().toISOString().slice(0, 10));
  if (fs.existsSync(out)) { const dir = path.join(ROOT, 'data', 'meta', 'backup'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'competition_events-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), fs.readFileSync(out)); }
  fs.writeFileSync(out, JSON.stringify(next, null, 1) + '\n'); console.log('\nEscrito ' + path.relative(ROOT, out));
}
if (require.main === module) main();
module.exports = { build, apply, loadCatalog, loadRulesets };
