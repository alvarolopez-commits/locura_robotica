/* Importa torneos, resultados y listas completas de DigiLab (https://digilab.cards/docs, host de Gundam) a data/competition_events.json.
 *
 *   DIGILAB_API_KEY=… node scripts/import_digilab.js --set GD06 --from 2026-11-01 --to 2026-11-03 [--country JP] [--max-requests 200] [--dry]
 *
 * Condiciones de DigiLab que este script respeta:
 *   · La clave la emiten sus administradores (canal #api de su Discord) y se muestra una sola vez. Va SOLO en la variable de entorno
 *     DIGILAB_API_KEY: nunca en el repositorio ni en la web. Sin clave el script no hace ninguna petición y explica cómo conseguirla.
 *   · Límites: 60 peticiones/min por IP y 300/min por clave. Aquí: una petición cada 1,2 s, parada ante un 429 (respeta Retry-After) y tope
 *     de peticiones por ejecución (--max-requests, 200 por defecto). Sin paralelismo y sin reintentos infinitos.
 *   · Atribución: la web enseña "Datos de torneos aportados por digilab.cards" con enlace, y este script marca cada evento con su fuente "digilab".
 *   · Uso: herramienta comunitaria sin ánimo de lucro. Si la web llegara a monetizarse hay que pedir permiso a DigiLab antes.
 * Privacidad: se guarda el arquetipo, el puesto, los colores y las cartas. NUNCA el nombre del jugador, su slug, perfil ni la URL de su lista
 * (esas URLs pueden llevar el perfil). La lista se identifica por "digilab:<result_id>".
 * Veracidad: la documentación de DigiLab no describe cómo llegan las cartas de Gundam, solo la forma genérica (decklist con matrices de
 * { card_id, count }). Se leen todas las matrices que tengan esa forma y la lista solo se da por completa si suma exactamente 50 cartas con
 * códigos que existen en el catálogo. Cualquier otra forma, o una lista sin analizar (decklist: null), queda pendiente. No se inventa nada.
 * El torneo no trae set: se indica con --set y se aplica a todo el rango de fechas dado. Los eventos nuevos se unen a los existentes con la
 * deduplicación habitual (si no se puede asegurar que sean el mismo, quedan marcados para revisión y no se borra ninguno). */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');
const { merge } = require('./import_competition_batch.js');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://gundam.digilab.cards';
const GAP_MS = 1200;

/* ---------- partes puras (se prueban con respuestas de ejemplo) ---------- */
/* Recoge { carta: copias } de cualquier matriz de objetos { card_id, count } dentro de `decklist`. null si no hay ninguna. */
function cardsOfDecklist(decklist) {
  if (!decklist || typeof decklist !== 'object') return null;
  const cards = {}; let found = false;
  Object.keys(decklist).forEach((k) => {
    const v = decklist[k];
    if (!Array.isArray(v)) return;
    v.forEach((x) => {
      if (!x || typeof x !== 'object' || typeof x.card_id !== 'string' || !(Number(x.count) > 0)) return;
      found = true; const code = x.card_id.trim().toUpperCase(); cards[code] = (cards[code] || 0) + Number(x.count);
    });
  });
  return found ? cards : null;
}
const COLORS = { blue: 'Blue', green: 'Green', red: 'Red', purple: 'Purple', white: 'White' };
const colorOf = (c) => (c && COLORS[String(c).toLowerCase()]) || null;

function mapTournament(t, set) {
  const id = String(t.id != null ? t.id : t.tournament_id);
  return {
    id: 'digilab:' + id, date: String(t.date || t.start_date || '').slice(0, 10), name: t.name || t.title || '', venue: (t.store && t.store.name) || t.store_name || t.venue || '',
    country: t.country || '', format: t.format || '', set, type: S.eventType(t.name || t.title), playersTotal: t.player_count != null ? t.player_count : (t.players != null ? t.players : null), listsPublished: null,
    dataQuality: 'api', notes: '',
    sources: [{ provider: 'digilab', id, url: HOST + '/tournaments/' + id, label: 'DigiLab', primary: true }],
  };
}
/* Una fila de clasificación + su detalle de lista (si lo hay) -> lista publicada, sin ningún dato personal */
function mapStanding(eventId, set, country, row, detail, catalogHas) {
  const rid = String(row.result_id != null ? row.result_id : row.id);
  const cards = detail ? cardsOfDecklist(detail.decklist) : null;
  const out = {
    id: 'digilab:' + rid, eventId, placement: row.placement == null ? null : row.placement, archetype: row.deck || row.archetype_name || null,
    colors: [colorOf(row.primary_color)].filter(Boolean), set, country, origin: 'tournament', sourceUrl: '', decklistUrl: null, cards: null,
  };
  if (cards && S.deckStatus({ cards }, catalogHas) === 'complete') out.cards = cards;   // solo con las 50 cartas verificadas
  return S.sanitizeResult(out);
}

/* ---------- red (solo con clave) ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeClient(key, maxRequests, fetchImpl) {
  let n = 0, last = 0;
  const doFetch = fetchImpl || fetch;
  return async function get(pathAndQuery) {
    if (n >= maxRequests) throw new Error('límite de peticiones de esta ejecución alcanzado (' + maxRequests + ')');
    const wait = last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
    n++; last = Date.now();
    const r = await doFetch(HOST + pathAndQuery, { headers: { 'X-API-Key': key, 'Accept': 'application/json', 'User-Agent': 'LocuraRobotica/1.0 (comunidad, sin ánimo de lucro)' } });
    if (r.status === 429) { const ra = r.headers && r.headers.get ? r.headers.get('retry-after') : null; throw new Error('429 de DigiLab (Retry-After ' + (ra || '?') + ' s): se para aquí, vuelve a ejecutarlo más tarde'); }
    if (r.status === 401 || r.status === 403) throw new Error(r.status + ' de DigiLab: la clave no es válida o no tiene permiso');
    if (!r.ok) throw new Error('DigiLab respondió ' + r.status + ' en ' + pathAndQuery);
    return r.json();
  };
}
async function importRange(get, o) {
  const events = [], results = []; const report = { tournaments: 0, standings: 0, decklistsFetched: 0, complete: 0 };
  let page = 1, totalPages = 1;
  const q = (x) => Object.keys(x).filter((k) => x[k]).map((k) => k + '=' + encodeURIComponent(x[k])).join('&');
  while (page <= totalPages) {
    const list = await get('/api/tournaments?' + q({ date_from: o.from, date_to: o.to, country: o.country, format: o.format, per_page: 100, page }));
    totalPages = (list.pagination && list.pagination.total_pages) || 1;
    for (const t of (list.tournaments || list.data || [])) {
      const ev = mapTournament(t, o.set); report.tournaments++;
      const det = await get('/api/tournament/' + encodeURIComponent(t.id));
      const rows = (det.standings || []).filter((r) => r.placement != null);
      for (const row of rows) {
        report.standings++;
        let detail = null;
        if (row.has_decklist && row.result_id != null) { detail = await get('/api/decklist/' + encodeURIComponent(row.result_id)); report.decklistsFetched++; }
        const res = mapStanding(ev.id, o.set, ev.country, row, detail, o.catalogHas);
        if (res.cards) report.complete++;
        results.push(res);
      }
      ev.listsPublished = results.filter((r) => r.eventId === ev.id).length || null;
      events.push(ev);
    }
    page++;
  }
  return { events, results, report };
}

function loadCatalog() {
  const have = new Set();
  fs.readdirSync(path.join(ROOT, 'data')).filter((f) => /^(ST|GD|EB)\d+\.json$/.test(f)).forEach((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
    (Array.isArray(d) ? d : d.cards || []).forEach((c) => have.add(c.number));
  });
  return (n) => have.has(n);
}

async function main() {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  const key = process.env.DIGILAB_API_KEY;
  if (!key) {
    console.log('Falta DIGILAB_API_KEY: no se ha hecho ninguna petición.\n' +
      '  1. Pide una clave en el canal #api del Discord de DigiLab (https://digilab.cards/docs): proyecto, volumen esperado, contacto y si genera ingresos.\n' +
      '  2. Se muestra una sola vez. Guárdala fuera del repositorio.\n' +
      '  3. Ejecuta:  DIGILAB_API_KEY=… node scripts/import_digilab.js --set GD06 --from 2026-11-01 --to 2026-11-03');
    process.exit(2);
  }
  const set = opt('set'), from = opt('from'), to = opt('to');
  if (!set || !from || !to) { console.error('Indica --set, --from y --to (el torneo no trae el set: lo pones tú para ese rango de fechas).'); process.exit(2); }
  const get = makeClient(key, Number(opt('max-requests', 200)));
  const r = await importRange(get, { set, from, to, country: opt('country'), format: opt('format'), catalogHas: loadCatalog() });
  const out = path.resolve(opt('out', path.join(ROOT, 'data', 'competition_events.json')));
  const existing = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { events: [], results: [] };
  const m = merge(existing, { events: r.events, results: r.results }, new Date().toISOString().slice(0, 10));
  console.log('DigiLab: ' + r.report.tournaments + ' torneos, ' + r.report.standings + ' resultados, ' + r.report.decklistsFetched + ' listas pedidas, ' + r.report.complete + ' completas y verificadas.');
  console.log('Total tras unir: ' + m.out.events.length + ' eventos, ' + m.out.results.length + ' listas · fundidos: ' + m.report.mergedEvents.length + ' · a revisar: ' + m.report.review.length);
  m.report.review.forEach((x) => console.log('  REVISAR ' + x.a + ' ~ ' + x.b + ': ' + x.reason));
  if (a.includes('--dry')) { console.log('(--dry: no se escribe nada)'); return; }
  const text = JSON.stringify(m.out, null, 1) + '\n';
  if (fs.existsSync(out)) {
    const dir = path.join(ROOT, 'data', 'meta', 'backup'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'competition_events-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), fs.readFileSync(out));
  }
  fs.writeFileSync(out, text); console.log('Escrito ' + path.relative(ROOT, out));
}

if (require.main === module) main().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
module.exports = { cardsOfDecklist, mapTournament, mapStanding, makeClient, importRange };
