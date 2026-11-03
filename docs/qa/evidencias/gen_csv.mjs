// Fase 4 · genera docs/qa/FASE_4_RESULTADOS.csv a partir de perf_antes.json, perf_despues.json, matrix_antes.json y matrix_despues.json.
// Uso: node docs/qa/evidencias/gen_csv.mjs
import fs from 'node:fs';
const dir = new URL('./', import.meta.url);
const rd = (f) => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
const A = rd('perf_antes.json'), D = rd('perf_despues.json'), MA = rd('matrix_antes.json'), MD = rd('matrix_despues.json');
const med = (a) => { const s = a.filter((x) => typeof x === 'number' && !isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const fmt = (x, d = 1) => (x === null ? 'N/A' : String(+x.toFixed(d)));
const rng = (a, d = 0) => { const s = a.slice().sort((x, y) => x - y); return fmt(s[0], d) + '–' + fmt(s[s.length - 1], d); };
const rows = [['scenario', 'device', 'viewport', 'network', 'cache', 'metric', 'before', 'after', 'unit', 'iterations', 'notes']];
const DEV = 'Chromium-156-emulado-movil(CPU4x)', VP = '390x844@2x', NET = '4G-lenta(150ms,1.6Mbps)';
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
function add(scenario, net, cache, metric, bef, aft, unit, notes, d = 1, viewport = VP, device = DEV) {
  const b = bef.length ? fmt(med(bef), d) : 'N/A', a = aft.length ? fmt(med(aft), d) : 'N/A';
  rows.push([scenario, device, viewport, net, cache, metric, b, a, unit, Math.max(bef.length, aft.length), q((notes || '') + (bef.length ? ` rango antes ${rng(bef, d)}; después ${rng(aft, d)}` : ''))]);
}
const col = (O, k, f) => O.runs[k].map((x) => x[f]);
for (const [k, net, cache] of [['cold', NET, 'cold'], ['warm', NET, 'warm'], ['offline', 'offline', 'warm']]) {
  const sc = 'load-' + k;
  add(sc, net, cache, 'FCP', col(A, k, 'fcp'), col(D, k, 'fcp'), 'ms', '', 0);
  add(sc, net, cache, 'LCP', col(A, k, 'lcp'), col(D, k, 'lcp'), 'ms', 'NO comparable: con el título más pequeño el elemento LCP cambia (texto del título → imagen de carta en algunas repeticiones)', 0);
  add(sc, net, cache, 'first-card-image-in-DOM', col(A, k, 'firstTile'), col(D, k, 'firstTile'), 'ms', 'primera <img> del catálogo creada', 0);
  add(sc, net, cache, 'CLS', col(A, k, 'cls'), col(D, k, 'cls'), 'score', '', 3);
  add(sc, net, cache, 'long-tasks-count', col(A, k, 'long'), col(D, k, 'long'), 'count', '', 0);
  add(sc, net, cache, 'long-tasks-duration', col(A, k, 'longMs'), col(D, k, 'longMs'), 'ms', '', 0);
  add(sc, net, cache, 'dom-nodes', col(A, k, 'domNodes'), col(D, k, 'domNodes'), 'count', '', 0);
  add(sc, net, cache, 'transfer', col(A, k, 'kbTransfer'), col(D, k, 'kbTransfer'), 'KB', 'servidor local con brotli (como Vercel)', 0);
  add(sc, net, cache, 'requests', col(A, k, 'requests'), col(D, k, 'requests'), 'count', '', 0);
}
const NAMES = { search: 'buscar "zaku" (22 resultados)', clearSearch: 'borrar la búsqueda (vuelta a 1086)', chip: 'filtro rápido de color', add: 'añadir carta desde la rejilla', openSheet: 'abrir ficha', addInSheet: 'añadir copia en la ficha', openDeck: 'abrir ventana del mazo' };
for (const k of Object.keys(NAMES)) add('interaction-' + k, NET, 'warm', 'interaction-latency', col({ runs: { i: A.runs.interact } }, 'i', k), col({ runs: { i: D.runs.interact } }, 'i', k), 'ms', NAMES[k] + ' · toque→siguiente pintado con el cambio hecho', 0);
const M = (O, f) => O.runs.memory.map(f);
add('memory-20-open-close-sheets', 'none', 'warm', 'js-heap-after-gc-before', M(A, (x) => x.before.heapMB), M(D, (x) => x.before.heapMB), 'MB', 'CPU sin frenar', 2);
add('memory-20-open-close-sheets', 'none', 'warm', 'js-heap-after-gc-after-20', M(A, (x) => x.after20.heapMB), M(D, (x) => x.after20.heapMB), 'MB', '', 2);
add('memory-20-open-close-sheets', 'none', 'warm', 'dom-nodes-growth', M(A, (x) => x.after20.nodes - x.before.nodes), M(D, (x) => x.after20.nodes - x.before.nodes), 'count', 'nodos tras 20 ciclos menos nodos antes', 0);
add('memory-20-open-close-sheets', 'none', 'warm', 'event-listeners-growth', M(A, (x) => x.after20.listeners - x.before.listeners), M(D, (x) => x.after20.listeners - x.before.listeners), 'count', '', 0);
add('memory-20-open-close-sheets', 'none', 'warm', 'cycles-with-wait-timeout', M(A, (x) => x.timeouts), M(D, (x) => x.timeouts), 'count', 'veces que una hoja no terminó de abrirse/cerrarse en 5 s', 0);
// matriz visual: por anchura, suma sobre las 9 pantallas auditadas
const pages = (O, w) => Object.entries(O.widths[w]).filter(([k]) => k !== 'erroresConsola').map(([, v]) => v);
for (const w of Object.keys(MD.widths)) {
  const vp = w + 'px';
  const one = (metric, f, unit, notes) => rows.push(['visual-matrix', 'Chromium-156-emulado', vp, 'local', 'cold', metric, String(f(MA, w)), String(f(MD, w)), unit, 1, q(notes)]);
  one('pages-with-horizontal-overflow', (O, x) => pages(O, x).filter((p) => p.overflow).length, 'count', 'de 9 pantallas auditadas');
  one('text-elements-below-12px', (O, x) => pages(O, x).reduce((a, p) => a + p.nSmallText, 0), 'count', 'suma sobre las 9 pantallas');
  one('tap-targets-below-44px-deck-view', (O, x) => O.widths[x].mazo.nSmallTargets, 'count', 'ventana del mazo; incluye los del catálogo que siguen debajo (chips 40 px por diseño)');
  one('tap-targets-below-44px-catalog', (O, x) => O.widths[x].catalogo.nSmallTargets, 'count', 'catálogo; chips de filtro, selector de orden y Limpiar filtros miden 40 px por decisión de diseño');
  one('console-errors', (O, x) => (O.widths[x].erroresConsola || []).length + (O.widths[x].metaLab.erroresConsola || []).length, 'count', 'incluye Meta Lab');
}
fs.writeFileSync(new URL('../FASE_4_RESULTADOS.csv', dir), rows.map((r) => r.join(',')).join('\n') + '\n');
console.log(rows.length - 1, 'filas');
const show = rows.filter((r) => /interaction|load-cold|load-warm|memory|CLS/.test(r[0] + r[5])).filter((r) => !/requests|dom-nodes|transfer|long-tasks/.test(r[5]));
show.forEach((r) => console.log(r.slice(0, 1).concat(r.slice(5, 9)).join(' | ')));
