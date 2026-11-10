/* Taxonomía de arquetipos: aplica data/archetype_aliases.json a data/competition_events.json.
 *
 *   node scripts/migrate_archetypes.js [--seed] [--dry]
 *
 * Cada resultado conserva `archetype` (compatibilidad con enlaces y favoritos) y gana `archetypeOriginal` (lo que dio la fuente) y `archetypeId`
 * (identidad canónica según la tabla, o null si el nombre no está en ella). La asignación es solo por coincidencia EXACTA con un nombre o alias de la
 * tabla: nunca por parecido, por colores ni por una palabra suelta (p. ej. «Kshatriya»). Idempotente: ejecutarlo otra vez no cambia nada.
 * --seed añade a la tabla los nombres que aún no estén, cada uno como identidad propia SIN alias: es un inventario para revisar, no una fusión. */
const fs = require('fs');
const path = require('path');
const S = require('../comp_stats.js');
const ROOT = path.join(__dirname, '..');
const TABLE = path.join(ROOT, 'data', 'archetype_aliases.json'), DATA = path.join(ROOT, 'data', 'competition_events.json');

const slug = (s) => S.normText(s).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'sin-nombre';
function loadTable() { return fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : { version: 1, archetypes: [], pendingReview: [] }; }

function seed(table, results, sourceOf) {
  const out = JSON.parse(JSON.stringify(table)); let added = 0;
  results.forEach((r) => {
    const name = String(r.archetypeOriginal != null ? r.archetypeOriginal : r.archetype || '').trim();
    if (!name || S.resolveArchetype(name, out).id) return;
    let id = slug(name); while (out.archetypes.some((a) => a.id === id)) id += '-2';
    out.archetypes.push({ id, name, aliases: [], source: sourceOf(r) }); added++;
  });
  out.archetypes.sort((a, b) => a.id.localeCompare(b.id));
  return { table: out, added };
}

function main() {
  const a = process.argv.slice(2);
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8')); let table = loadTable();
  if (a.includes('--seed')) {
    const evs = {}; data.events.forEach((e) => { evs[e.id] = e; });
    const r = seed(table, data.results, (x) => (evs[x.eventId] && evs[x.eventId].sources[0] && evs[x.eventId].sources[0].provider) || 'desconocida');
    table = r.table; console.log('Tabla: ' + r.added + ' arquetipos añadidos como identidad propia (sin alias).');
  }
  const migrated = S.applyArchetypes(data.results, table).map(S.sanitizeResult);
  const out = Object.assign({}, data, { results: migrated });
  const text = JSON.stringify(out, null, 1) + '\n', tableText = JSON.stringify(table, null, 1) + '\n';
  const noId = migrated.filter((r) => r.archetypeId === null).length;
  console.log('Resultados: ' + migrated.length + ' · con identidad canónica: ' + (migrated.length - noId) + ' · sin asignar (etiqueta original): ' + noId);
  if (a.includes('--dry')) { console.log('(--dry: no se escribe nada)'); return; }
  const before = fs.readFileSync(DATA, 'utf8'), beforeT = fs.existsSync(TABLE) ? fs.readFileSync(TABLE, 'utf8') : '';
  if (before === text && beforeT === tableText) { console.log('Sin cambios: ya estaba migrado.'); return; }
  const dir = path.join(ROOT, 'data', 'meta', 'backup'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'competition_events-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'), before);
  fs.writeFileSync(TABLE, tableText); fs.writeFileSync(DATA, text); console.log('Escrito data/archetype_aliases.json y data/competition_events.json (copia previa en data/meta/backup/).');
}
if (require.main === module) main();
module.exports = { seed, slug };
