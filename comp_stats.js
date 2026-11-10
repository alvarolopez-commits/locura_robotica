/* Estadísticas de Competición: deduplicación de torneos y listas, presencia de arquetipos e inclusión de cartas.
 * Funciones puras y sin DOM (se usan en la web y en scripts/import_competition_batch.js).
 *
 * Reglas del producto:
 *  - Presencia de arquetipo = listas publicadas del arquetipo / listas publicadas de la muestra filtrada (nunca los inscritos del torneo).
 *  - Inclusión de carta = listas con las 50 cartas verificadas que la llevan / listas con las 50 cartas verificadas analizadas.
 *  - Media de copias = copias totales de la carta / listas con composición completa que la llevan (no cuenta las que no la llevan).
 *  - Tasa de victorias: no disponible sin partidas verificables; nunca se deduce de los puestos.
 *  - Una lista sin arquetipo identificable cuenta como "Sin clasificar" dentro del denominador. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var UNCLASSIFIED = 'Sin clasificar';
  var DECK_SIZE = 50;
  var MIN_LISTS_FOR_CARDS = 10;   // por debajo no se enseñan cartas populares (mismo umbral de evidencia que el motor de COMPARAR)
  var CODE_RE = /^[A-Z0-9]{2,6}-\d{3}[A-Z]?$/;

  /* ---------- normalización ---------- */
  function normText(s) {
    return String(s == null ? '' : s).normalize('NFKC').toLowerCase()
      .replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function canonUrl(u) {
    if (!u) return '';
    try {
      var x = new URL(String(u).trim());
      return x.hostname.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '');
    } catch (e) { return String(u).trim().toLowerCase().replace(/\/+$/, ''); }
  }
  function sourcesOf(e) { return Array.isArray(e.sources) ? e.sources : []; }
  function source(s, primary) { var o = { provider: s.provider, id: s.id, url: s.url }; if (s.label) o.label = s.label; if (s.retrievedAt) o.retrievedAt = s.retrievedAt; if (s.license) o.license = s.license; if (s.canonicalUrl) o.canonicalUrl = s.canonicalUrl; o.primary = !!primary; return o; }   // orden de claves fijo: el archivo no cambia al reimportar

  /* ---------- eventos ---------- */
  function eventType(name) { return /new\s*type challenge/i.test(name || '') ? 'Newtype Challenge' : /serial card challenge/i.test(name || '') ? 'Serial Card Challenge' : /regional/i.test(name || '') ? 'Regional' : /qualifier/i.test(name || '') ? 'Qualifier' : 'Otro'; }
  /* Clave alternativa: fecha + sede + nombre/formato + set + país (todo normalizado). Sin sede no hay clave: no se adivina. */
  function altKey(e) {
    if (!normText(e.venue)) return null;
    return [e.date || '', normText(e.venue), normText(e.name), normText(e.format), normText(e.set), normText(e.country)].join('|');
  }
  /* La misma fuente les da ids distintos: son dos eventos aunque coincidan tienda y día (p. ej. turno de mañana y de tarde). */
  function distinctIds(a, b) {
    return sourcesOf(a).some(function (x) { return x.id && sourcesOf(b).some(function (y) { return y.id && x.provider === y.provider && x.id !== y.id; }); });
  }
  function sameEvent(a, b) {
    var sa = sourcesOf(a), sb = sourcesOf(b);
    for (var i = 0; i < sa.length; i++) for (var j = 0; j < sb.length; j++) {
      if ((sa[i].id && sa[i].provider && sa[i].id === sb[j].id && sa[i].provider === sb[j].provider) ||
          (canonUrl(sa[i].url) && canonUrl(sa[i].url) === canonUrl(sb[j].url))) return true;
    }
    if (distinctIds(a, b)) return false;
    var ka = altKey(a), kb = altKey(b);
    return !!ka && ka === kb;
  }
  /* Misma fecha, nombre, set y país pero sin poder comparar la sede (falta en alguno): puede ser el mismo evento o dos tiendas distintas. */
  function needsReview(a, b) {
    if (distinctIds(a, b)) return false;
    if (a.date !== b.date || normText(a.name) !== normText(b.name) || normText(a.set) !== normText(b.set) || normText(a.country) !== normText(b.country)) return false;
    return !normText(a.venue) || !normText(b.venue);
  }
  function mergeInto(base, extra) {
    var out = Object.assign({}, base);
    var seen = {};
    out.sources = sourcesOf(base).map(function (s) { seen[canonUrl(s.url) || s.provider + ':' + s.id] = 1; return source(s, s.primary); });
    sourcesOf(extra).forEach(function (s) {
      var k = canonUrl(s.url) || s.provider + ':' + s.id;
      if (!seen[k]) { seen[k] = 1; out.sources.push(source(s, false)); }
    });
    ['venue', 'country', 'type', 'format', 'set', 'name'].forEach(function (k) { if (!out[k] && extra[k]) out[k] = extra[k]; });
    ['playersTotal', 'listsPublished'].forEach(function (k) { if ((out[k] == null) && extra[k] != null) out[k] = extra[k]; });
    return out;
  }
  /* Une los eventos repetidos (misma fuente o distinta) en un registro canónico. Nunca borra: lo dudoso se devuelve en `review`.
   * Entrada: eventos con { id, date, name, venue, country, format, set, sources:[{provider,id,url,primary}] }.
   * Salida: { events, merged:[{kept, dropped}], review:[{a, b, reason}] }. Idempotente: pasar la salida otra vez no cambia nada. */
  function dedupeEvents(list) {
    var events = [], merged = [], review = [];
    list.forEach(function (ev) {
      var hit = -1;
      for (var i = 0; i < events.length; i++) if (sameEvent(events[i], ev)) { hit = i; break; }
      if (hit >= 0) { merged.push({ kept: events[hit].id, dropped: ev.id }); events[hit] = mergeInto(events[hit], ev); return; }
      events.forEach(function (o) { if (needsReview(o, ev)) review.push({ a: o.id, b: ev.id, reason: 'misma fecha, nombre, set y país; falta la sede para compararlos' }); });
      var copy = Object.assign({}, ev); copy.sources = sourcesOf(ev).map(function (s, i) { return source(s, i === 0); });
      events.push(copy);
    });
    return { events: events, merged: merged, review: review };
  }

  /* ---------- listas ---------- */
  function cardsTotal(cards) { var t = 0; Object.keys(cards || {}).forEach(function (k) { t += Number(cards[k]) || 0; }); return t; }
  /* 'complete' = 50 cartas con códigos y cantidades válidos (y, si se da el catálogo, todos los códigos existen);
   * 'invalid' = hay composición pero con códigos desconocidos o cantidades imposibles; 'incomplete' = no suma 50; 'pending' = sin composición. */
  function deckStatus(r, catalogHas) {
    var c = r && r.cards;
    if (!c || typeof c !== 'object' || !Object.keys(c).length) return 'pending';
    var bad = Object.keys(c).some(function (k) { var q = c[k]; return !CODE_RE.test(k) || !(q >= 1 && q <= 4 && Math.floor(q) === q) || (catalogHas && !catalogHas(k)); });
    if (bad) return 'invalid';
    return cardsTotal(c) === DECK_SIZE ? 'complete' : 'incomplete';
  }
  /* Una lista = su id estable en la fuente o, si no, evento canónico + puesto + arquetipo. No se guardan ni se comparan nombres de jugadores.
   * Si hay dos copias, se queda la que trae la composición. */
  function resultKey(r) { return [r.eventId, r.placement, normText(archetypeOf(r))].join('|'); }
  /* Solo estos campos de una lista se guardan y se publican: nada de nombres, perfiles ni enlaces personales. */
  var RESULT_FIELDS = ['id', 'eventId', 'placement', 'archetype', 'archetypeId', 'archetypeOriginal', 'colors', 'set', 'country', 'origin', 'sourceUrl', 'decklistUrl', 'cards'];
  function sanitizeResult(r) {
    var o = {}; RESULT_FIELDS.forEach(function (k) { var v = k === 'origin' ? originOf(r) : r[k]; if (v !== undefined) o[k] = v; });   // siempre en el mismo orden: el archivo no cambia al reimportar
    return o;
  }
  /* 'tournament' = lista jugada en un torneo; 'community' = mazo creado por la comunidad. Nunca se mezclan en las estadísticas. */
  function originOf(r) { return r && r.origin === 'community' ? 'community' : 'tournament'; }
  function dedupeResults(list) {
    var byKey = {}, order = [], dropped = [], seenId = {}, comp = {};
    list.forEach(function (r) {
      var ns = r.id && String(r.id).indexOf(':') > 0 ? String(r.id).split(':')[0] : '', ik = r.id ? 'id:' + r.id : null, ck = resultKey(r), key = null;
      if (ik && seenId[ik]) key = seenId[ik];                                   // el mismo id estable de la fuente
      else if (comp[ck] && (!ik || !comp[ck].hasId || (ns && comp[ck].ns && comp[ck].ns !== ns))) key = comp[ck].key;   // lo mismo (evento + puesto + arquetipo) contado por otra fuente
      if (key === null) {
        key = ik || ck; if (byKey[key]) key = key + '#' + order.length;       // mismo id de proveedor distinto = otra lista (empate de puesto)
        byKey[key] = r; order.push(key); if (ik) seenId[ik] = key; if (!comp[ck]) comp[ck] = { key: key, ns: ns, hasId: !!ik };
        return;
      }
      dropped.push(r.id);
      if (deckStatus(byKey[key]) !== 'complete' && deckStatus(r) === 'complete') byKey[key] = r;
    });
    return { results: order.map(function (k) { return byKey[k]; }), dropped: dropped };
  }

  /* ---------- filtros ---------- */
  /* f = { set, country, from, to, format, sizeMin, sizeMax, type, eventId } para eventos; además { topN, archetype } para listas. Un filtro vacío no filtra. El denominador se recalcula siempre sobre lo filtrado. */
  /* Cobertura de la muestra. Por defecto la presencia usa solo eventos de corte completo (dataQuality 'top_cut_only'); los eventos con otra
   * calidad declarada (p. ej. 'single_deck': solo el ganador) siguen consultables pero no entran en el porcentaje salvo que se pida expresamente
   * (f.coverage === 'all'). Un evento sin dataQuality (datos antiguos) se trata como homogéneo. */
  var HOMOGENEOUS_QUALITY = 'top_cut_only';
  function inMainSample(e) { return !e.dataQuality || e.dataQuality === HOMOGENEOUS_QUALITY; }
  /* `sample` = true solo al calcular porcentajes: un torneo fuera de la muestra principal sigue siendo consultable (Torneos, fichas, listas completas) */
  function eventMatches(e, f, sample) {
    if (sample && f.coverage !== 'all' && !inMainSample(e)) return false;
    if (f.set && e.set !== f.set) return false;
    if (f.country && e.country !== f.country) return false;
    if (f.type && e.type !== f.type) return false;
    if (f.format && e.format !== f.format) return false;
    if (f.eventId && e.id !== f.eventId) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if ((f.sizeMin || f.sizeMax) && !(e.playersTotal != null && e.playersTotal >= (f.sizeMin || 0) && e.playersTotal <= (f.sizeMax || Infinity))) return false;
    return true;
  }
  function filterEvents(events, f) { f = f || {}; return events.filter(function (e) { return eventMatches(e, f, false); }); }
  function filterResults(results, events, f) {
    f = f || {};
    var byId = {}, arch = f.archetype ? normText(f.archetype) : '', want = f.origin === 'community' ? 'community' : 'tournament'; events.forEach(function (e) { byId[e.id] = e; });
    return results.filter(function (r) {
      if (originOf(r) !== want) return false;
      if (want === 'community') {   // un mazo de la comunidad no pertenece a ningún torneo: solo cuentan temporada y arquetipo
        if (f.set && r.set !== f.set) return false;
        return !(arch || f.archetypeId) || (f.archetypeId && r.archetypeId === f.archetypeId) || (arch && normText(archetypeOf(r)) === arch);
      }
      var e = byId[r.eventId]; if (!e || !eventMatches(e, f, true)) return false;
      if (f.set && r.set && r.set !== f.set) return false;
      if (f.country && r.country && r.country !== f.country) return false;
      if (f.topN && !(r.placement >= 1 && r.placement <= f.topN)) return false;
      if ((arch || f.archetypeId) && !((f.archetypeId && r.archetypeId === f.archetypeId) || (arch && normText(archetypeOf(r)) === arch))) return false;
      return true;
    });
  }

  /* ---------- presencia de arquetipos ---------- */
  /* Taxonomía: tabla explícita y revisable (data/archetype_aliases.json). Solo se asigna identidad por coincidencia EXACTA (normalizada) con un nombre o
   * alias de la tabla; nunca por parecido, por colores ni por una palabra suelta. Lo que no está en la tabla queda con su etiqueta original y archetypeId null. */
  function resolveArchetype(label, table) {
    var key = normText(label), list = (table && table.archetypes) || [];
    if (!key) return { id: null, name: UNCLASSIFIED };
    for (var i = 0; i < list.length; i++) {
      var a = list[i], names = [a.name].concat(a.aliases || []);
      for (var j = 0; j < names.length; j++) if (normText(names[j]) === key) return { id: a.id, name: a.name };
    }
    return { id: null, name: String(label).trim() };
  }
  /* Migración idempotente: archetypeOriginal = lo que dio la fuente (se conserva si ya estaba) y archetypeId = identidad canónica o null. 'archetype' no cambia. */
  function applyArchetypes(results, table) {
    return results.map(function (r) {
      var original = r.archetypeOriginal != null ? r.archetypeOriginal : r.archetype;
      var res = resolveArchetype(original, table);
      return Object.assign({}, r, { archetypeOriginal: original == null ? null : original, archetypeId: res.id });
    });
  }
  function archetypeOf(r) { return r.archetype && String(r.archetype).trim() ? String(r.archetype).trim() : UNCLASSIFIED; }
  function presence(results, events, f, table) {
    var list = filterResults(results, events, f), counts = {}, names = {}, ev = {};
    list.forEach(function (r) { var a = archetypeOf(r), k = r.archetypeId ? 'id:' + r.archetypeId : normText(a); names[k] = names[k] || (r.archetypeId && table && table.byId && table.byId[r.archetypeId]) || a; counts[names[k]] = (counts[names[k]] || 0) + 1; ev[r.eventId] = 1; });
    var out = presenceFromCounts(counts); out.events = Object.keys(ev).length;
    return out;
  }
  /* Misma cuenta cuando la fuente solo da totales por arquetipo: { 'BG Aggro': 404, … } */
  function presenceFromCounts(counts) {
    var n = 0; Object.keys(counts).forEach(function (a) { n += counts[a]; });
    var rows = Object.keys(counts).filter(function (a) { return counts[a] > 0; }).map(function (a) { return { archetype: a, lists: counts[a], pct: n ? counts[a] / n * 100 : 0 }; })
      .sort(function (x, y) { return (y.lists - x.lists) || x.archetype.localeCompare(y.archetype); });
    return { n: n, events: null, rows: rows };
  }
  /* Cambios entre dos periodos: solo si tienen la misma segmentación (misma fuente, territorio y corte) y muestra suficiente en ambos.
   * cur/prev = { label, seg, counts }. Sin periodo anterior o no comparable: { comparable:false, reason } y ninguna subida ni bajada. */
  function compareShares(cur, prev, minN) {
    if (!cur || !prev) return { comparable: false, reason: 'single' };
    if (cur.seg !== prev.seg) return { comparable: false, reason: 'segment' };
    var a = presenceFromCounts(cur.counts), b = presenceFromCounts(prev.counts);
    if (a.n < (minN || 1) || b.n < (minN || 1)) return { comparable: false, reason: 'sample' };
    var old = {}; b.rows.forEach(function (r) { old[r.archetype] = r.pct; });
    var rows = a.rows.map(function (r) { return { archetype: r.archetype, pct: r.pct, prevPct: old[r.archetype] || 0, delta: r.pct - (old[r.archetype] || 0), isNew: !(r.archetype in old) }; })
      .sort(function (x, y) { return Math.abs(y.delta) - Math.abs(x.delta) || x.archetype.localeCompare(y.archetype); });
    return { comparable: true, n: a.n, prevN: b.n, label: cur.label, prevLabel: prev.label, rows: rows };
  }

  /* ---------- inclusión de cartas (solo listas completas y verificadas) ---------- */
  function inclusion(results, events, f, catalogHas) {
    var base = filterResults(results, events, Object.assign({}, f, { coverage: 'all' })), all = base.length, usable = base.filter(function (r) { return deckStatus(r, catalogHas) === 'complete'; });
    var rows = {}, n = usable.length;
    usable.forEach(function (r) { Object.keys(r.cards).forEach(function (c) { var x = rows[c] || (rows[c] = { number: c, lists: 0, totalCopies: 0 }); x.lists++; x.totalCopies += r.cards[c]; }); });
    var out = Object.keys(rows).map(function (c) { var x = rows[c]; return { number: c, lists: x.lists, totalCopies: x.totalCopies, pct: x.lists / n * 100, avgCopies: x.totalCopies / x.lists }; })
      .sort(function (a, b) { return (b.lists - a.lists) || a.number.localeCompare(b.number); });
    return { n: n, published: all, rows: out };
  }

  /* Tasa de victorias: no se calcula con puestos. Solo existiría con partidas verificadas, que este conjunto no trae. */
  function winRate() { return { available: false, reason: 'sin partidas verificables' }; }

  /* ---------- comparación de un mazo propio con una lista competitiva (multiconjunto de copias, por código exacto) ----------
   * coinciden = min(propio, lista) · añadir = max(0, lista − propio) · retirar = max(0, propio − lista).
   * La colección es un cálculo APARTE: faltanEnColección = max(0, lista − copias que tengo), independiente de lo que haya que añadir al mazo.
   * collectionKnown = false (colección sin configurar): no se calcula nada de colección (no es un cero). */
  function compareDecks(target, own, ownedOf, collectionKnown) {
    var codes = {}; Object.keys(target || {}).concat(Object.keys(own || {})).forEach(function (k) { codes[k] = 1; });
    var totals = { target: 0, own: 0, match: 0, add: 0, remove: 0, missingInCollection: collectionKnown ? 0 : null };
    var rows = Object.keys(codes).sort().map(function (c) {
      var t = (target && target[c]) || 0, o = (own && own[c]) || 0, row = { number: c, target: t, own: o, match: Math.min(t, o), add: Math.max(0, t - o), remove: Math.max(0, o - t) };
      totals.target += t; totals.own += o; totals.match += row.match; totals.add += row.add; totals.remove += row.remove;
      if (collectionKnown) { var h = Number(ownedOf(c)) || 0; row.owned = h; row.missingInCollection = Math.max(0, t - h); totals.missingInCollection += row.missingInCollection; }
      return row;
    });
    return { rows: rows, totals: totals, collection: collectionKnown ? 'configured' : 'unknown', balanced: totals.target === totals.own ? totals.add === totals.remove : null };
  }
  /* copia independiente de las cartas de un mazo (solo códigos con cantidad entera positiva) */
  function cloneCards(cards) { var o = {}; Object.keys(cards || {}).forEach(function (k) { var q = cards[k]; if (q >= 1 && Math.floor(q) === q) o[k] = q; }); return o; }

  /* ---------- exportaciones de texto de otros sitios (WhiteBase, ExBurst, Limitless…) ----------
   * Una carta por línea: "4 GD01-001", "4x GD01-001", "4 x GD01-001", "GD01-001 x4", "GD01-001,4" o "GD01-001 4"; se admite un nombre detrás.
   * Líneas vacías, encabezados entre corchetes y comentarios (#, //) se ignoran. Cualquier otra línea hace que la lista NO se acepte:
   * no se adivina nada. El resultado se da por completo solo si suma 50 con cantidades válidas (lo comprueba deckStatus). */
  var LINE_RES = [/^(\d+)\s*[x×]?\s+([A-Z0-9]{2,6}-\d{3}[A-Z]?)\b/i, /^([A-Z0-9]{2,6}-\d{3}[A-Z]?)\s*(?:[x×,;:]|\s)\s*(\d+)\s*$/i];
  function parseDeckExport(text) {
    var cards = {}, errors = [];
    String(text || '').split(/\r?\n/).forEach(function (raw, i) {
      var line = raw.trim();
      if (!line || /^[#/]/.test(line) || /^\[.*\]$/.test(line) || /^(deck|main|sideboard|total)\b/i.test(line)) return;
      var m = LINE_RES[0].exec(line), code, qty;
      if (m) { qty = Number(m[1]); code = m[2].toUpperCase(); }
      else if ((m = LINE_RES[1].exec(line))) { code = m[1].toUpperCase(); qty = Number(m[2]); }
      else { errors.push({ line: i + 1, text: line.slice(0, 60) }); return; }
      cards[code] = (cards[code] || 0) + qty;
    });
    return { cards: cards, total: cardsTotal(cards), errors: errors, status: errors.length ? 'invalid' : deckStatus({ cards: cards }) };
  }

  /* ---------- favoritos (identidad estable: temporada + nombre normalizado; no depende del idioma ni de mayúsculas) ---------- */
  function favId(season, name) { return String(season) + '|' + normText(name); }
  function parseFavs(text) {
    var out = [], seen = {};
    try {
      var v = JSON.parse(text);
      if (Array.isArray(v)) v.forEach(function (x) { if (x && x.id && x.name && x.season && !seen[x.id]) { seen[x.id] = 1; out.push({ id: x.id, season: x.season, name: x.name, addedAt: x.addedAt || 0 }); } });
    } catch (e) { /* ilegible: sin favoritos */ }
    return out;
  }
  function toggleFav(list, season, name, now) {
    var id = favId(season, name);
    if (list.some(function (x) { return x.id === id; })) return list.filter(function (x) { return x.id !== id; });
    return list.concat([{ id: id, season: season, name: name, addedAt: now || 0 }]);
  }

  /* ---------- novedades: foto de lo que se vio por contexto comparable (temporada y filtros) ---------- */
  function shortId(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function contextKey(f) { f = f || {}; return ['set', 'country', 'from', 'to', 'format', 'sizeMin', 'sizeMax', 'topN'].map(function (k) { return f[k] || ''; }).join('|'); }
  function snapshotOf(key, version, counts, eventIds, resultIds) {
    var n = 0; Object.keys(counts).forEach(function (a) { n += counts[a]; });
    return { key: key, version: version || '', n: n, counts: counts, events: (eventIds || []).map(shortId), results: (resultIds || []).map(shortId) };
  }
  /* Qué ha cambiado de verdad: ids canónicos nuevos y presencia antes → ahora de los arquetipos pedidos, con la n de cada foto.
   * Sin foto anterior del mismo contexto no hay comparación. */
  function diffSnapshots(prev, cur, names) {
    if (!prev || !cur || prev.key !== cur.key) return { comparable: false, reason: 'first' };
    function fresh(a, b) { var s = {}; (a || []).forEach(function (x) { s[x] = 1; }); return (b || []).filter(function (x) { return !s[x]; }).length; }
    var newEvents = fresh(prev.events, cur.events), newLists = fresh(prev.results, cur.results);
    if (!(cur.results || []).length) newLists = Math.max(0, cur.n - prev.n);   // la fuente solo da totales
    var rows = (names || []).map(function (name) {
      var bk = 0, ak = 0, key = normText(name);
      Object.keys(prev.counts).forEach(function (a) { if (normText(a) === key) bk += prev.counts[a]; });
      Object.keys(cur.counts).forEach(function (a) { if (normText(a) === key) ak += cur.counts[a]; });
      var before = prev.n ? bk / prev.n * 100 : 0, after = cur.n ? ak / cur.n * 100 : 0;
      return { name: name, before: before, after: after, delta: after - before, beforeLists: bk, afterLists: ak };
    });
    var changed = newEvents > 0 || newLists > 0 || prev.n !== cur.n || prev.version !== cur.version;
    return { comparable: true, changed: changed, newEvents: newEvents, newLists: newLists, prevN: prev.n, n: cur.n, rows: changed ? rows : [] };
  }

  /* ---------- cobertura de una lista completa con la colección ----------
   * need = copias de la lista; owned = copias conocidas; covered = min(need, owned); missing = max(0, need − owned). Por código de carta exacto.
   * collectionKnown = false: la colección no está configurada y no se calcula nada (no es un cero). */
  function coverage(cards, ownedOf, collectionKnown) {
    if (!collectionKnown) return { state: 'unknown' };
    var required = 0, covered = 0, missing = [];
    Object.keys(cards || {}).forEach(function (c) {
      var need = cards[c], owned = Number(ownedOf(c)) || 0, have = Math.min(need, owned);
      required += need; covered += have;
      if (need > owned) missing.push({ number: c, need: need, owned: owned, missing: need - owned });
    });
    return { state: 'configured', requiredCopies: required, coveredCopies: covered, missingCopies: required - covered, coveragePct: required ? covered / required * 100 : 0, missingByCard: missing };
  }

  return {
    UNCLASSIFIED: UNCLASSIFIED, DECK_SIZE: DECK_SIZE, MIN_LISTS_FOR_CARDS: MIN_LISTS_FOR_CARDS,
    normText: normText, canonUrl: canonUrl, altKey: altKey, sameEvent: sameEvent, dedupeEvents: dedupeEvents,
    deckStatus: deckStatus, resultKey: resultKey, sanitizeResult: sanitizeResult, originOf: originOf, parseDeckExport: parseDeckExport, RESULT_FIELDS: RESULT_FIELDS, dedupeResults: dedupeResults,
    eventType: eventType, filterEvents: filterEvents, filterResults: filterResults, presence: presence, presenceFromCounts: presenceFromCounts,
    compareShares: compareShares, inclusion: inclusion, winRate: winRate, compareDecks: compareDecks, cloneCards: cloneCards, resolveArchetype: resolveArchetype, applyArchetypes: applyArchetypes, inMainSample: inMainSample,
    favId: favId, parseFavs: parseFavs, toggleFav: toggleFav, contextKey: contextKey, snapshotOf: snapshotOf, diffSnapshots: diffSnapshots, coverage: coverage
  };
});
