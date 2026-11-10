/* Importa un lote de resultados de torneos (JSON) a data/competition_events.json, que lee la pestaña Competición.
 *
 *   node scripts/import_competition_batch.js ruta/al/lote.json [--out data/competition_events.json] [--dry]
 *
 * - No sobrescribe: une el lote con lo que ya hay. Los eventos repetidos (misma fuente o distinta) se funden en un registro canónico
 *   con todas sus fuentes; los dudosos quedan en `review` sin borrar nada. Volver a ejecutarlo con el mismo lote no cambia el archivo.
 * - Antes de escribir guarda una copia del archivo actual en data/meta/backup/ (carpeta local, ignorada por git): para deshacer, copiarla de vuelta.
 * - No inventa nada: la composición de 50 cartas solo entra si el lote la trae (cards con códigos y cantidades); si no, la lista queda pendiente.
 * - No descarga nada de ninguna web. */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const outArg = args.indexOf('--out');
const OUT = path.resolve(outArg >= 0 ? args[outArg + 1] : path.join(ROOT, 'data', 'competition_events.json'));
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/* lote -> modelo canónico. Un id "proveedor:código" pasa a ser la fuente principal del evento. */
function mapBatch(batch) {
  const events = (batch.tournaments || []).map((t) => {
    const [provider, ...rest] = String(t.id).split(':');
    return {
      id: t.id, date: t.date, name: t.name, venue: t.venue || '', country: t.country || '', format: t.format || '', set: t.set || '',
      type: S.eventType(t.name), playersTotal: t.playersTotal == null ? null : t.playersTotal, listsPublished: t.listsPublished == null ? null : t.listsPublished,
      dataQuality: t.dataQuality || null, notes: t.notes || '',
      sources: [{ provider, id: rest.join(':'), url: t.sourceUrl || '', label: t.sourceProvider || provider, primary: true }],
    };
  });
  const results = (batch.results || []).map((r) => ({
    id: r.id, eventId: r.tournamentId, placement: r.placement, archetype: r.archetype || null,
    colors: (r.colors || []).map(cap), set: r.set || '', country: r.country || '', sourceUrl: r.resultSourceUrl || '',
    decklistUrl: r.decklistUrl || null, cards: r.cards && typeof r.cards === 'object' ? r.cards : null, origin: 'tournament',
  })).map(S.sanitizeResult);   // el lote trae nombres de jugador: no entran en lo que se guarda
  return { events, results };
}

/* tabla de identidades de arquetipo (data/archetype_aliases.json): si no existe, no se asigna ninguna */
function archetypeTable() { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'archetype_aliases.json'), 'utf8')); } catch (e) { return { archetypes: [] }; } }

function merge(existing, incoming, snapshotDate) {
  const ev = S.dedupeEvents(existing.events.concat(incoming.events));
  const remap = {};   // id de cada registro entrante o antiguo -> id canónico
  existing.events.concat(incoming.events).forEach((e) => { const hit = ev.events.find((c) => S.sameEvent(c, e)); remap[e.id] = hit ? hit.id : e.id; });
  const all = existing.results.concat(incoming.results).map((r) => S.sanitizeResult(Object.assign({}, r, { eventId: remap[r.eventId] || r.eventId })));   // también limpia lo que ya hubiera guardado
  const rs = S.dedupeResults(S.applyArchetypes(all, archetypeTable()).map(S.sanitizeResult));   // archetypeOriginal = lo que dio la fuente; archetypeId = identidad de la tabla o null
  const events = ev.events.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.id.localeCompare(b.id));
  const results = rs.results.slice().sort((a, b) => a.eventId.localeCompare(b.eventId) || a.placement - b.placement);
  return {
    out: {
      version: 1, updatedAt: snapshotDate,
      methodology: 'Presencia = listas publicadas del arquetipo / listas publicadas de la muestra filtrada. No son todos los inscritos, ni tasa de victorias.',
      events, results, review: ev.review,
    },
    report: { mergedEvents: ev.merged, review: ev.review, droppedResults: rs.dropped },
  };
}

function main() {
  if (!input) { console.error('Uso: node scripts/import_competition_batch.js lote.json [--out archivo] [--dry]'); process.exit(2); }
  const batch = JSON.parse(fs.readFileSync(input, 'utf8'));
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { events: [], results: [] };
  const { out, report } = merge(existing, mapBatch(batch), batch.snapshotDate || new Date().toISOString().slice(0, 10));
  const text = JSON.stringify(out, null, 1) + '\n';
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
  console.log(`Eventos: ${out.events.length} · listas: ${out.results.length} · eventos fundidos: ${report.mergedEvents.length} · a revisar: ${report.review.length} · listas repetidas descartadas: ${report.droppedResults.length}`);
  report.review.forEach((r) => console.log(`  REVISAR ${r.a}  ~  ${r.b}: ${r.reason}`));
  if (dry) { console.log('(--dry: no se escribe nada)'); return; }
  if (before === text) { console.log('Sin cambios: el archivo ya estaba al día.'); return; }
  if (before !== null) {
    const dir = path.join(ROOT, 'data', 'meta', 'backup'); fs.mkdirSync(dir, { recursive: true });
    const bak = path.join(dir, 'competition_events-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'); fs.writeFileSync(bak, before);
    console.log('Copia de seguridad: ' + path.relative(ROOT, bak));
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, text);
  console.log('Escrito ' + path.relative(ROOT, OUT));
}

if (require.main === module) main();
module.exports = { mapBatch, merge };
