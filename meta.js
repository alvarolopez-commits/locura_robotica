/* Motor de comparación de mazos con el meta (COMPARAR). Determinista y sin DOM:
 * mismo mazo + mismo perfil de arquetipos + mismo catálogo => mismo resultado.
 * No genera puntuaciones opacas: devuelve hechos (copias, adopción, muestra) y etiquetas explicables.
 * Los textos para el usuario NO viven aquí: la interfaz traduce roles, estados y evidencias.
 *
 * Perfil de arquetipo:  { id, name, colors:['B','P'], deckCount, cutoff, sourceUrl, cards:{ 'ST11-009': {adoption:0.93, avgCopies:3.97} } }
 * (adoption en 0–1; `cutoff` = adopción de la última carta listada: lo que no aparece en el perfil está por debajo). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Meta = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    roleCore: 0.75, roleCommon: 0.5, roleFlex: 0.2,         // umbrales del diseño (spec §14)
    evidence: { high: 100, medium: 30, low: 10 },
    clearArchetype: 0.30,                                    // calibrado 28 oct 2026: 40 mazos aleatorios ≤0,11; listas reales de torneo ≥0,39 (mediana 0,77)
    missingMinAdoption: 0.5, maxMissing: 12, maxCandidates: 4
  };
  var COLOR_LETTER = { Blue: 'B', Green: 'G', Red: 'R', Purple: 'P', White: 'W' };

  function cfgOf(cfg) { return Object.assign({}, DEFAULTS, cfg || {}, { evidence: Object.assign({}, DEFAULTS.evidence, (cfg || {}).evidence || {}) }); }
  function letter(c) { return COLOR_LETTER[c] || String(c || '').charAt(0).toUpperCase(); }
  function copiesOf(user) { var t = 0; Object.keys(user).forEach(function (n) { t += Number(user[n]) || 0; }); return t; }

  /* ---------- evidencia ---------- */
  function evidenceLevel(deckCount, cfg) {
    var e = cfgOf(cfg).evidence, n = Number(deckCount) || 0;
    return n >= e.high ? 'high' : n >= e.medium ? 'medium' : n >= e.low ? 'low' : 'insufficient';
  }

  /* ---------- similitud (Jaccard ponderado sobre el perfil) ----------
   * Por cada carta del perfil: w = adopción, e = copias esperadas (adopción × copias medias), u = copias del usuario.
   * valor = Σ w·min(u,e) / Σ w·max(u,e).  Las cartas del usuario fuera del perfil no entran: se informa su `coverage`. */
  function similarity(user, archetype) {
    var cards = (archetype && archetype.cards) || {}, num = 0, den = 0, matched = 0, covered = 0, total = copiesOf(user);
    Object.keys(cards).forEach(function (n) {
      var c = cards[n], w = Number(c.adoption) || 0, e = w * (Number(c.avgCopies) || 0), u = Number(user[n]) || 0;
      num += w * Math.min(u, e); den += w * Math.max(u, e);
      if (u > 0) { matched++; covered += u; }
    });
    return { value: den > 0 && isFinite(num / den) ? num / den : 0, coverage: total > 0 ? covered / total : 0, matchedCards: matched };
  }

  function rankArchetypes(user, archetypes, cfg) {
    var c = cfgOf(cfg);
    var all = (archetypes || []).map(function (a) {
      var s = similarity(user, a);
      return { archetypeId: a.id, similarity: s.value, coverage: s.coverage, evidence: evidenceLevel(a.deckCount, c) };
    }).sort(function (a, b) { return (b.similarity - a.similarity) || (String(a.archetypeId) < String(b.archetypeId) ? -1 : String(a.archetypeId) > String(b.archetypeId) ? 1 : 0); });
    var top = all.slice(0, c.maxCandidates);
    return { top: top, clear: !!top.length && top[0].similarity >= c.clearArchetype };
  }

  /* ---------- perfiles combinados (mismo color / todo el meta), ponderados por nº de listas ---------- */
  function mergeProfiles(archetypes, id, label) {
    var total = 0, acc = {}, cutoff = null;
    (archetypes || []).forEach(function (a) {
      var dc = Number(a.deckCount) || 0; total += dc;
      if (a.cutoff != null) cutoff = Math.max(cutoff == null ? 0 : cutoff, a.cutoff);
      Object.keys(a.cards || {}).forEach(function (n) {
        var c = a.cards[n], inc = (Number(c.adoption) || 0) * dc, r = acc[n] || (acc[n] = { inc: 0, copies: 0 });
        r.inc += inc; r.copies += inc * (Number(c.avgCopies) || 0);
      });
    });
    var cards = {};
    Object.keys(acc).forEach(function (n) {
      if (total > 0 && acc[n].inc > 0) cards[n] = { adoption: acc[n].inc / total, avgCopies: acc[n].copies / acc[n].inc };
    });
    return { id: id, name: label, colors: [], deckCount: total, cutoff: cutoff, cards: cards, merged: true };
  }
  function globalAdoption(archetypes) {
    var m = mergeProfiles(archetypes, 'all', 'all'), out = {};
    Object.keys(m.cards).forEach(function (n) { out[n] = m.cards[n].adoption; });
    return out;
  }

  /* ---------- rol de cada carta ---------- */
  function releaseOf(setDates, set) { var d = setDates && setDates[set]; return d && (d.releaseDate || (typeof d === 'string' ? d : null)); }
  function roleOf(number, ctx) {
    var c = cfgOf(ctx.cfg), a = ctx.archetype || { cards: {}, deckCount: 0 }, card = (ctx.cardMap || {})[number];
    var ev = evidenceLevel(a.deckCount, c), entry = (a.cards || {})[number], rel = card && releaseOf(ctx.setDates, card.set);
    var base = { adoption: entry ? entry.adoption : null, avgCopies: entry ? entry.avgCopies : null, upperBound: null, sampleSize: Number(a.deckCount) || 0, evidence: ev };
    if (rel && ctx.snapshotDate && rel > ctx.snapshotDate) return Object.assign(base, { role: 'new' });
    if (ev === 'insufficient') return Object.assign(base, { role: 'insufficient_data' });
    if (entry) {
      var p = entry.adoption;
      return Object.assign(base, { role: p >= c.roleCore ? 'core' : p >= c.roleCommon ? 'common' : p >= c.roleFlex ? 'flex' : 'flex_low' });
    }
    return Object.assign(base, { role: 'off_meta', upperBound: a.cutoff != null ? a.cutoff : null });
  }

  /* ---------- composición: tu mazo frente al perfil ----------
   * El perfil solo cubre las cartas más jugadas, así que cada fila lleva `userInProfile` (tus copias de cartas del perfil)
   * y `meta` (copias esperadas del perfil): son comparables entre sí; `user` es el total real de tu mazo. */
  function composition(user, archetype, cardMap) {
    var prof = (archetype && archetype.cards) || {}, rows = [];
    function row(key, test, weight) {
      var u = 0, up = 0, m = 0, inProf = 0;
      Object.keys(user).forEach(function (n) { var card = cardMap[n], q = Number(user[n]) || 0; if (card && test(card)) { u += weight ? q * weight(card) : q; if (prof[n]) up += weight ? q * weight(card) : q; } });
      Object.keys(prof).forEach(function (n) { var card = cardMap[n]; if (card && test(card)) { inProf++; m += prof[n].adoption * prof[n].avgCopies * (weight ? weight(card) : 1); } });
      rows.push({ key: key, user: u, userInProfile: up, meta: inProf ? m : null });
    }
    ['UNIT', 'PILOT', 'COMMAND', 'BASE'].forEach(function (t) { row({ UNIT: 'units', PILOT: 'pilots', COMMAND: 'commands', BASE: 'bases' }[t], function (c) { return c.type === t; }); });
    row('unitsLv5', function (c) { return c.type === 'UNIT' && Number(c.lv) >= 5; });
    row('earlyUnits', function (c) { return c.type === 'UNIT' && Number(c.cost) <= 2; });
    var tags = {};
    Object.keys(user).forEach(function (n) { var card = cardMap[n]; if (card) (card.tags || []).forEach(function (t) { if (t !== 'vanilla') tags[t] = true; }); });
    Object.keys(tags).sort().forEach(function (t) { row('tag:' + t, function (c) { return (c.tags || []).indexOf(t) !== -1; }); });
    // coste medio de las Unidades
    var uq = 0, uc = 0, mq = 0, mc = 0, up = 0, upc = 0;
    Object.keys(user).forEach(function (n) { var card = cardMap[n], q = Number(user[n]) || 0; if (card && card.type === 'UNIT') { uq += q; uc += q * Number(card.cost); if (prof[n]) { up += q; upc += q * Number(card.cost); } } });
    Object.keys(prof).forEach(function (n) { var card = cardMap[n], e = prof[n].adoption * prof[n].avgCopies; if (card && card.type === 'UNIT') { mq += e; mc += e * Number(card.cost); } });
    rows.push({ key: 'avgUnitCost', user: uq ? uc / uq : null, userInProfile: up ? upc / up : null, meta: mq ? mc / mq : null });
    return rows;
  }

  /* ---------- cartas habituales que no juegas ---------- */
  function missingCommon(user, archetype, cfg) {
    var c = cfgOf(cfg), prof = (archetype && archetype.cards) || {}, out = [];
    Object.keys(prof).forEach(function (n) {
      var p = prof[n], have = Number(user[n]) || 0;
      if (p.adoption >= c.missingMinAdoption && have < Math.round(p.avgCopies)) out.push({ number: n, adoption: p.adoption, avgCopies: p.avgCopies, userCopies: have });
    });
    return out.sort(function (a, b) { return b.adoption - a.adoption || (a.number < b.number ? -1 : 1); }).slice(0, c.maxMissing);
  }

  /* ---------- paquetes: Unidad + Piloto enlazado, y grupos de rasgo ---------- */
  function nameOf(s) { return String(s || '').trim().toLowerCase(); }
  function traitsOf(card) { var out = [], re = /\(([^)]+)\)/g, m; while ((m = re.exec(card.trait || ''))) out.push(m[1].trim()); return out; }
  function detectPackages(user, cardMap) {
    var nums = Object.keys(user).filter(function (n) { return cardMap[n] && Number(user[n]) > 0; }), out = [];
    var pilots = nums.filter(function (n) { return cardMap[n].type === 'PILOT'; });
    nums.filter(function (n) { return cardMap[n].type === 'UNIT' && cardMap[n].link && cardMap[n].link !== '-'; }).forEach(function (u) {
      var names = [], re = /\[([^\]]+)\]/g, m, link = cardMap[u].link;
      while ((m = re.exec(link))) names.push(nameOf(m[1]));
      var wantTraits = []; re = /\(([^)]+)\)/g; while ((m = re.exec(link))) wantTraits.push(nameOf(m[1]));
      pilots.forEach(function (p) {
        var pc = cardMap[p], ok = names.indexOf(nameOf(pc.name)) !== -1 || traitsOf(pc).some(function (t) { return wantTraits.indexOf(nameOf(t)) !== -1; });
        if (ok) out.push({ id: 'link:' + u + '+' + p, name: cardMap[u].name + ' + ' + pc.name, cards: [u, p], reason: 'link' });
      });
    });
    var byTrait = {};
    nums.forEach(function (n) { traitsOf(cardMap[n]).forEach(function (t) { (byTrait[t] = byTrait[t] || []).push(n); }); });
    Object.keys(byTrait).sort().forEach(function (t) { if (byTrait[t].length >= 3) out.push({ id: 'trait:' + t, name: t, cards: byTrait[t].slice().sort(), reason: 'trait' }); });
    return out;
  }

  /* ---------- elecciones poco habituales (nunca recomiendan quitar nada) ---------- */
  function unusual(user, archetype, ctx, packages) {
    var out = [];
    Object.keys(user).forEach(function (n) {
      var q = Number(user[n]) || 0; if (q <= 0 || !ctx.cardMap[n]) return;
      var r = roleOf(n, Object.assign({}, ctx, { archetype: archetype }));
      if (r.role !== 'flex_low' && r.role !== 'off_meta') return;
      var pk = (packages || []).filter(function (p) { return p.cards.indexOf(n) !== -1; })[0];
      out.push({ number: n, copies: q, role: r.role, packageId: pk ? pk.id : null });
    });
    return out;
  }

  function setBoundary(user, cardMap, setDates, snapshotDate) {
    var sets = {}, cards = [];
    Object.keys(user).forEach(function (n) {
      var card = cardMap[n], rel = card && releaseOf(setDates, card.set);
      if (rel && snapshotDate && rel > snapshotDate && Number(user[n]) > 0) { sets[card.set] = true; cards.push(n); }
    });
    return { crossed: cards.length > 0, sets: Object.keys(sets).sort(), cards: cards.sort() };
  }

  /* ---------- análisis completo ----------
   * deck = { name, cards:{num:qty} }, mode = { type:'closest'|'colors'|'archetype'|'all', archetypeId? }
   * opts = { meta:{ snapshot:{dataDate, windowLabel, ...}, archetypes:[perfil] }, cardMap, setDates, legality?, cfg? } */
  function compare(deck, mode, opts) {
    var cfg = cfgOf(opts.cfg), cardMap = opts.cardMap || {}, meta = opts.meta || {}, archetypes = meta.archetypes || [];
    var snapshotDate = meta.snapshot && meta.snapshot.dataDate, user = {}, ignored = [];
    Object.keys((deck && deck.cards) || {}).forEach(function (n) {
      var q = Number(deck.cards[n]) || 0; if (q <= 0) return;
      if (cardMap[n]) user[n] = q; else ignored.push(n);
    });
    var result = { snapshot: meta.snapshot || null, mode: mode, legality: opts.legality || null, state: 'ok', ranking: { top: [], clear: false }, selected: null,
      composition: [], cardAnalysis: [], missingCommon: [], unusual: [], packages: [], boundary: setBoundary(user, cardMap, opts.setDates, snapshotDate), ignoredCards: ignored.sort() };
    if (!archetypes.length) { result.state = 'no_data'; return result; }
    result.ranking = rankArchetypes(user, archetypes, cfg);

    var deckColors = {}; Object.keys(user).forEach(function (n) { deckColors[letter(cardMap[n].color)] = true; });
    var wanted = Object.keys(deckColors).sort(), selected = null;
    function byId(id) { return archetypes.filter(function (a) { return String(a.id) === String(id); })[0] || null; }
    if (mode.type === 'archetype') selected = byId(mode.archetypeId);
    else if (mode.type === 'all') selected = mergeProfiles(archetypes, 'all', 'all');
    else if (mode.type === 'colors') {
      var same = archetypes.filter(function (a) { var cs = (a.colors || []).map(letter).sort(); return wanted.length && cs.length === wanted.length && cs.every(function (x, i) { return x === wanted[i]; }); });
      if (!same.length) same = archetypes.filter(function (a) { return wanted.length === 1 && (a.colors || []).map(letter).indexOf(wanted[0]) !== -1; });
      selected = same.length ? mergeProfiles(same, 'colors:' + wanted.join(''), wanted.join('/')) : null;
    } else if (result.ranking.top.length) selected = byId(result.ranking.top[0].archetypeId);
    if (!selected) { result.state = 'no_data'; return result; }
    if (mode.type === 'closest' && !result.ranking.clear) result.state = 'no_clear';

    result.selected = { id: selected.id, name: selected.name, deckCount: selected.deckCount, evidence: evidenceLevel(selected.deckCount, cfg), windowLabel: meta.snapshot && meta.snapshot.windowLabel, sourceUrl: selected.sourceUrl || null };
    var ctx = { archetype: selected, cardMap: cardMap, setDates: opts.setDates, snapshotDate: snapshotDate, cfg: cfg };
    var glob = globalAdoption(archetypes);
    Object.keys(user).sort().forEach(function (n) {
      var r = roleOf(n, ctx);
      result.cardAnalysis.push({ number: n, userCopies: user[n], role: r.role, adoption: r.adoption, avgCopies: r.avgCopies, globalAdoption: glob[n] != null ? glob[n] : null, upperBound: r.upperBound, sampleSize: r.sampleSize, evidence: r.evidence });
    });
    result.packages = detectPackages(user, cardMap);
    result.unusual = unusual(user, selected, ctx, result.packages);
    result.missingCommon = missingCommon(user, selected, cfg);
    result.composition = composition(user, selected, cardMap);
    return result;
  }

  return { DEFAULTS: DEFAULTS, evidenceLevel: evidenceLevel, similarity: similarity, rankArchetypes: rankArchetypes, mergeProfiles: mergeProfiles,
    globalAdoption: globalAdoption, roleOf: roleOf, composition: composition, missingCommon: missingCommon, detectPackages: detectPackages,
    unusual: unusual, setBoundary: setBoundary, compare: compare };
});
