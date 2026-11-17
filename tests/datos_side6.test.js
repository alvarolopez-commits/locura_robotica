/* Validación de los datos de Side-6 (data/decklists.json, data/meta.json, data/decklists_hist.json): detecta duplicados entre ventanas, porcentajes que no cuadran,
 * arquetipos mal asociados, cambios de identificadores, caídas de cobertura, perfiles ausentes y diferencias con el histórico.  Uso: node tests/datos_side6.test.js */
const fs = require('fs'), path = require('path');
const S = require('../comp_stats.js');
const R = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));
const DL = R('decklists.json'), ML = R('meta.json'), HIST = fs.existsSync(path.join(__dirname, '..', 'data', 'decklists_hist.json')) ? R('decklists_hist.json') : null, CARDS = R('all_cards.json');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'side6_2026-11-17.json'), 'utf8'));
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'falso'); };
const near = (a, b, tol, m) => ok(Math.abs(a - b) <= (tol || 1e-9), (m || 'valor') + ': ' + a + ' ≠ ' + b);
const eras = ML.snapshot.eras, cur = ML.snapshot.era, win = ML.snapshot.windows;
const decks = DL.archetypes.flatMap((a) => a.decks.map((d) => ({ a, d })));
const cardColor = {}; CARDS.forEach((c) => { cardColor[c.number] = c.color; });
const L = { Blue: 'B', Green: 'G', Red: 'R', Purple: 'P', White: 'W' };
const pair = (cards) => { const t = {}; Object.keys(cards).forEach((n) => { const c = L[cardColor[n]]; if (c) t[c] = (t[c] || 0) + cards[n]; }); return Object.keys(t).sort((x, y) => t[y] - t[x]).slice(0, 2).sort().join(''); };
const colorsKey = (a) => a.colors.map((c) => (L[c] || c)).sort().join('');   // decklists.json usa nombres (Blue); meta.json, letras (B)

console.log('\n== ventanas y puestos: sin duplicados y con denominadores coherentes ==');
test('los puestos de los arquetipos nunca superan el total de su ventana (no hay ventanas sumadas dos veces)', () => {
  Object.keys(win).forEach((st) => { const used = ML.archetypes.reduce((s, a) => s + (a.eraDecks[st] || 0), 0); ok(used <= win[st].total, st + ': ' + used + ' > ' + win[st].total); });
});
test('los puestos sin arquetipo son pocos en las temporadas que se enseñan (GD05 ≤ 5 %, GD06 ≤ 2 %)', () => {
  [['GD05', 0.05], ['GD06', 0.02]].forEach(([st, max]) => { const used = ML.archetypes.reduce((s, a) => s + (a.eraDecks[st] || 0), 0), un = (win[st].total - used) / win[st].total; ok(un <= max, st + ': ' + (un * 100).toFixed(1) + ' % sin arquetipo'); });
});
test('la presencia suma 100 % en cada temporada y cada arquetipo coincide con puestos / suma de puestos', () => {
  ['GD05', 'GD06'].forEach((st) => {
    const counts = {}; ML.archetypes.forEach((a) => { if (a.eraDecks[st]) counts[a.name] = a.eraDecks[st]; });
    const p = S.presenceFromCounts(counts), tot = Object.values(counts).reduce((s, x) => s + x, 0);
    near(p.rows.reduce((s, r) => s + r.pct, 0), 100, 1e-6, st + ' suma'); near(p.n, tot, 0, st + ' n');
    p.rows.forEach((r) => near(r.pct, counts[r.archetype] / tot * 100, 1e-6, st + ' ' + r.archetype));
  });
});
test('las claves de eraDecks son sets reales (GDnn/STnn/EBnn) y la era actual es la mayor', () => {
  ML.archetypes.forEach((a) => Object.keys(a.eraDecks).forEach((k) => ok(/^(GD|ST|EB)\d+$/.test(k), a.id + ': ' + k)));
  ok(cur === eras.slice().sort().pop(), 'era actual ' + cur);
});

console.log('\n== arquetipos y listas: bien asociados, sin mezclar ==');
test('ids y nombres de arquetipo únicos y los mismos en decklists.json y meta.json', () => {
  const ids = ML.archetypes.map((a) => a.id), names = ML.archetypes.map((a) => a.name.toLowerCase());
  ok(new Set(ids).size === ids.length && new Set(names).size === names.length, 'repetidos');
  DL.archetypes.forEach((a) => { const m = ML.archetypes.find((x) => x.id === a.id); ok(m && m.name === a.name, a.id + ' no coincide con meta.json'); });
});
test('ninguna lista está en dos arquetipos y todas suman 50 cartas', () => {
  const hs = decks.map((x) => x.d.h); ok(new Set(hs).size === hs.length, 'hashes repetidos');
  decks.forEach((x) => ok(Object.values(x.d.cards).reduce((s, q) => s + q, 0) === 50, x.a.id + ' ' + x.d.h.slice(0, 8)));
});
test('el par de colores de cada lista (por sus cartas) es el de su arquetipo: ninguna mal asociada', () => {
  const mal = decks.filter((x) => pair(x.d.cards) !== colorsKey(x.a));
  ok(mal.length === 0, mal.length + ' listas con otro par de colores: ' + mal.slice(0, 3).map((x) => x.a.name).join(', '));
});
test('cada lista lleva su set y su fecha dentro de la ventana de ese set', () => {
  const sets = DL.snapshot.sets;
  decks.forEach((x) => { const st = x.d.set, w = sets[st]; ok(w, x.a.id + ' set ' + st); ok(x.d.event.date >= w.from && x.d.event.date <= (w.dataTo || w.to), x.a.id + ' ' + st + ' ' + x.d.event.date); });
});
test('sin nombres de jugador en ningún dato', () => { ['decklists.json', 'meta.json'].concat(HIST ? ['decklists_hist.json'] : []).forEach((f) => ok(!/playerName/.test(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8')), f)); });

console.log('\n== identificadores y cobertura frente a la referencia del 17 nov 2026 ==');
test('los identificadores de arquetipo no cambian en bloque (≥ 90 % siguen y ≥ 90 % de los actuales estaban)', () => {
  const now = new Set(ML.archetypes.map((a) => a.id)), before = new Set(FX.ids), kept = FX.ids.filter((i) => now.has(i)).length, known = [...now].filter((i) => before.has(i)).length;
  ok(kept / before.size >= 0.9 && known / now.size >= 0.9, 'siguen ' + kept + '/' + before.size + ', conocidos ' + known + '/' + now.size + ' (si el cambio es intencionado, actualiza tests/fixtures)');
});
test('la cobertura no cae de forma anómala: totales de ventana ≥ 90 % de la referencia y listas ≥ 80 %', () => {
  Object.keys(FX.ventanas).forEach((st) => ok(win[st] && win[st].total >= FX.ventanas[st] * 0.9, st + ' ' + (win[st] || {}).total + ' < ' + FX.ventanas[st] * 0.9));
  ok(decks.length >= FX.listas * 0.8, decks.length + ' listas < ' + FX.listas * 0.8);
});

console.log('\n== perfiles de cartas ==');
test('cada temporada tiene perfil propio para ≥ 80 % de sus puestos (GD05 ≥ 95 %) y se distingue consenso de listas de ejemplo', () => {
  [['GD05', 0.95], ['GD06', 0.8]].forEach(([st, min]) => {
    let t = 0, c = 0; ML.archetypes.forEach((a) => { const n = a.eraDecks[st] || 0; t += n; if (a.profiles && a.profiles[st]) c += n; });
    ok(c / t >= min, st + ': ' + (c / t * 100).toFixed(1) + ' % con perfil propio');
  });
  ML.archetypes.forEach((a) => Object.keys(a.profiles || {}).forEach((st) => ok(['consensus', 'sample'].indexOf(a.profiles[st].basis) >= 0, a.id + ' ' + st + ' sin base')));
});
test('los perfiles son válidos: adopción en (0,1], copias medias 1–4, corte coherente y solo de los sets recientes', () => {
  const recent = Object.keys(win).sort().slice(-2);
  ML.archetypes.forEach((a) => Object.keys(a.profiles || {}).forEach((st) => {
    ok(recent.indexOf(st) >= 0, a.id + ' perfil de ' + st); const p = a.profiles[st]; ok(p.deckCount > 0 && Object.keys(p.cards).length, a.id + ' ' + st + ' vacío');
    Object.keys(p.cards).forEach((n) => { const c = p.cards[n]; ok(c.adoption > 0 && c.adoption <= 1 && c.avgCopies >= 1 && c.avgCopies <= 4, a.id + ' ' + n); });
    near(p.cutoff, Math.min.apply(null, Object.values(p.cards).map((c) => c.adoption)), 1e-9, a.id + ' corte');
  }));
});
test('un perfil de consenso nunca se presenta como lista: las listas no llevan adopción ni consenso y los perfiles no llevan listas', () => {
  ML.archetypes.forEach((a) => ok(!('decks' in a), a.id));
  decks.forEach((x) => ok(!x.d.adoption && !x.d.consensus, x.a.id));
});

console.log('\n== histórico (importaciones anteriores) ==');
test('el histórico existe, no repite listas de la fuente actual y cada lista dice su set y de cuándo es', () => {
  ok(HIST && HIST.archetypes.length, 'falta data/decklists_hist.json');
  const now = new Set(decks.map((x) => x.d.h)), hs = HIST.archetypes.flatMap((a) => a.decks.map((d) => d.h));
  ok(new Set(hs).size === hs.length, 'hashes repetidos en el histórico'); ok(hs.every((h) => !now.has(h)), 'listas repetidas respecto a la fuente actual');
  HIST.archetypes.forEach((a) => a.decks.forEach((d) => ok(d.set && /^\d{4}-\d\d-\d\d$/.test(d.importedFrom) && Object.values(d.cards).reduce((s, q) => s + q, 0) === 50, a.id)));
});
test('las listas del histórico siguen bien asociadas a su arquetipo de entonces (par de colores)', () => {
  const mal = HIST.archetypes.flatMap((a) => a.decks.filter((d) => pair(d.cards) !== colorsKey(a)).map(() => a.name));
  ok(mal.length === 0, mal.length + ' listas del histórico con otro par de colores');
});
test('los nombres del histórico no chocan con los de la clasificación actual (no se mezclan arquetipos distintos)', () => {
  const now = new Set(ML.archetypes.map((a) => a.name.toLowerCase())); HIST.archetypes.forEach((a) => ok(!now.has(a.name.toLowerCase()), a.name));
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
