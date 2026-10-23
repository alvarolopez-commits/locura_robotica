/* Motor de legalidad de mazos (Gundam Card Game).
 * Determinista y sin dependencias del DOM: recibe un mazo, un ruleset (data/rulesets.json) y la base de cartas.
 * Los textos para el usuario NO viven aquí: cada problema lleva `ruleType`, `data` y acciones de arreglo
 * y la interfaz los traduce. La estrategia ("deck analysis") queda fuera a propósito. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Legality = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function norm(n) { return String(n || '').trim().toUpperCase(); }

  /* ---------- rulesets ---------- */
  function getActiveRuleset(rulesets, date, region) {
    var d = date ? new Date(date) : new Date();
    var day = d.toISOString().slice(0, 10);
    var list = (rulesets || []).filter(function (r) {
      return (!region || r.region === region) && r.effectiveFrom <= day && (!r.effectiveTo || day <= r.effectiveTo);
    }).sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? 1 : -1; });
    if (list.length) return list[0];
    var any = (rulesets || []).slice().sort(function (a, b) { return a.effectiveFrom < b.effectiveFrom ? 1 : -1; });
    return any[0] || null;
  }

  /* ---------- helpers de reglas ---------- */
  function bannedMap(rs) { var m = {}; (rs.bannedCards || []).forEach(function (r) { m[norm(r.cardNumber)] = r; }); return m; }
  function restrictedMap(rs) { var m = {}; (rs.restrictedCards || []).forEach(function (r) { m[norm(r.cardNumber)] = r; }); return m; }

  function matchesCriteria(card, c) {
    if (!card || !c) return false;
    var noEffect = !String(card.effect || '').trim() || String(card.effect).trim() === '-';
    return (!c.type || card.type === c.type) &&
      (c.level === undefined || Number(card.lv) === c.level) &&
      (c.cost === undefined || Number(card.cost) === c.cost) &&
      (c.ap === undefined || Number(card.ap) === c.ap) &&
      (c.hp === undefined || Number(card.hp) === c.hp) &&
      (!c.noEffect || noEffect);
  }

  /* Miembros de un grupo exclusivo: los listados oficialmente + (si la regla lo pide) los detectados por sus características. */
  var memberCache = typeof WeakMap === 'function' ? new WeakMap() : null;   // grupo (objeto) -> base de cartas -> miembros
  function groupMembers(group, cardsByNumber) {
    var perCards = memberCache && cardsByNumber ? memberCache.get(group) : null;
    if (memberCache && cardsByNumber) {
      if (!perCards) { perCards = new WeakMap(); memberCache.set(group, perCards); }
      var hit = perCards.get(cardsByNumber);
      if (hit) return hit;
    }
    var res = buildMembers(group, cardsByNumber);
    if (perCards) perCards.set(cardsByNumber, res);
    return res;
  }
  function buildMembers(group, cardsByNumber) {
    var listed = {}, detected = {};
    (group.cardNumbers || []).forEach(function (n) { listed[norm(n)] = true; });
    if (group.detectByCriteria && group.criteria && cardsByNumber) {
      Object.keys(cardsByNumber).forEach(function (n) {
        if (!listed[n] && matchesCriteria(cardsByNumber[n], group.criteria)) detected[n] = true;
      });
    }
    return { listed: listed, detected: detected, has: function (n) { n = norm(n); return !!(listed[n] || detected[n]); } };
  }

  function presentCards(deck) {
    var out = {};
    Object.keys(deck || {}).forEach(function (n) { var q = Number(deck[n]) || 0; if (q > 0) out[norm(n)] = (out[norm(n)] || 0) + q; });
    return out;
  }

  /* ---------- validación ---------- */
  /* deck: { "ST01-001": 3, ... }  ·  opts.tournament = true exige 50 cartas exactas (error si faltan). */
  function validateDeck(deck, ruleset, cardsByNumber, opts) {
    opts = opts || {};
    var cfg = ruleset.deck, errors = [], info = [];
    var counts = presentCards(deck);
    var numbers = Object.keys(counts);
    var total = numbers.reduce(function (s, n) { return s + counts[n]; }, 0);
    var banned = bannedMap(ruleset), restricted = restrictedMap(ruleset);

    function card(n) { return (cardsByNumber && cardsByNumber[n]) || null; }

    // 1-3. tamaño
    if (total > cfg.size) {
      errors.push({ id: 'deck_size', severity: 'error', ruleType: 'deck_size', currentValue: total, allowedValue: cfg.size, cardNumbers: [] });
    } else if (total < cfg.size && opts.tournament) {
      errors.push({ id: 'deck_size', severity: 'error', ruleType: 'deck_size', currentValue: total, allowedValue: cfg.size, cardNumbers: [], data: { missing: true } });
    }

    // 4. colores
    var colorSet = {};
    numbers.forEach(function (n) { var c = card(n); if (c && c.color) colorSet[c.color] = true; });
    var colors = Object.keys(colorSet).sort();
    if (colors.length > cfg.maxColors) {
      var fixes = colors.map(function (col) {
        return { type: 'remove_color', color: col, numbers: numbers.filter(function (n) { return card(n) && card(n).color === col; }) };
      });
      errors.push({ id: 'color_limit', severity: 'error', ruleType: 'color_limit', currentValue: colors.length, allowedValue: cfg.maxColors, data: { colors: colors }, cardNumbers: [], fixActions: fixes });
    } else if (colors.length) {
      info.push({ id: 'info_colors', severity: 'info', ruleType: 'info_colors', data: { colors: colors }, currentValue: colors.length });
    }

    // 5-7. copias, baneadas y restringidas
    numbers.forEach(function (n) {
      var q = counts[n];
      if (banned[n]) {
        errors.push({ id: 'banned_card:' + n, severity: 'error', ruleType: 'banned_card', cardNumbers: [n], currentValue: q, allowedValue: 0,
          fixActions: [{ type: 'remove_all', number: n }] });
      } else if (restricted[n] && q > restricted[n].maxCopies) {
        errors.push({ id: 'restricted_card:' + n, severity: 'error', ruleType: 'restricted_card', cardNumbers: [n], currentValue: q, allowedValue: restricted[n].maxCopies,
          fixActions: [{ type: 'remove_excess', number: n, qty: q - restricted[n].maxCopies }] });
      } else if (!restricted[n] && q > cfg.maxCopies) {
        errors.push({ id: 'copy_limit:' + n, severity: 'error', ruleType: 'copy_limit', cardNumbers: [n], currentValue: q, allowedValue: cfg.maxCopies,
          fixActions: [{ type: 'remove_excess', number: n, qty: q - cfg.maxCopies }] });
      }
    });

    // 8. parejas prohibidas
    (ruleset.bannedPairs || []).forEach(function (p) {
      var a = norm(p.cardA), b = norm(p.cardB);
      if (counts[a] > 0 && counts[b] > 0) {
        errors.push({ id: 'banned_pair:' + p.id, severity: 'error', ruleType: 'banned_pair', cardNumbers: [a, b], data: { pairId: p.id },
          fixActions: [{ type: 'remove_all', number: a }, { type: 'remove_all', number: b }] });
      }
    });

    // 9. grupos exclusivos
    (ruleset.exclusiveGroups || []).forEach(function (g) {
      var members = groupMembers(g, cardsByNumber);
      var present = numbers.filter(function (n) { return members.has(n); });
      if (present.length > g.maxDistinctCardNumbers) {
        errors.push({ id: 'exclusive_group:' + g.id, severity: 'error', ruleType: 'exclusive_group', cardNumbers: present, currentValue: present.length,
          allowedValue: g.maxDistinctCardNumbers, data: { groupId: g.id, detected: present.filter(function (n) { return !!members.detected[n]; }) },
          fixActions: present.map(function (keep) { return { type: 'keep_only', keep: keep, remove: present.filter(function (x) { return x !== keep; }) }; }) });
      }
    });

    var status = errors.length ? 'illegal' : (total < cfg.size ? 'incomplete' : 'legal');
    return { status: status, rulesetId: ruleset.id, errors: errors, warnings: [], info: info,
      summary: { total: total, size: cfg.size, colors: colors, issues: errors.length } };
  }

  function signature(r) { return r.errors.map(function (e) { return e.id + '|' + (e.currentValue == null ? '' : e.currentValue); }); }

  /* ¿Cuántas copias de `number` (hasta `wanted`) se pueden añadir sin crear un problema nuevo?
   * Devuelve { max, blockedBy } donde blockedBy es el primer problema que aparecería al añadir una más. */
  /* ctx (opcional, { known }) permite reutilizar la firma del mazo actual al consultar muchas cartas seguidas. */
  function context(deck, ruleset, cardsByNumber) {
    var res = validateDeck(deck, ruleset, cardsByNumber), known = {};
    signature(res).forEach(function (s) { known[s] = true; });
    return { known: known, errors: res.errors };
  }
  function knownSignatures(deck, ruleset, cardsByNumber) { return context(deck, ruleset, cardsByNumber).known; }
  function freshErrors(deck, n, k, ruleset, cardsByNumber, known) {
    var copy = Object.assign({}, deck); copy[n] = (Number(deck[n]) || 0) + k;
    return validateDeck(copy, ruleset, cardsByNumber).errors.filter(function (e) { return !known[e.id + '|' + (e.currentValue == null ? '' : e.currentValue)]; });
  }
  function maxAddable(deck, number, wanted, ruleset, cardsByNumber, ctx) {
    var n = norm(number);
    ctx = ctx || context(deck, ruleset, cardsByNumber);
    var known = ctx.known;
    // si la carta ya forma parte de una pareja prohibida o de un conflicto de grupo del mazo, no se añaden más copias hasta arreglarlo
    var involved = (ctx.errors || []).filter(function (e) {
      return (e.ruleType === 'banned_pair' || e.ruleType === 'exclusive_group') && e.cardNumbers.indexOf(n) !== -1;
    })[0];
    if (involved) return { max: 0, blockedBy: involved };
    if (!freshErrors(deck, n, wanted, ruleset, cardsByNumber, known).length) return { max: wanted, blockedBy: null };
    var max = 0, blockedBy = null;
    for (var k = 1; k <= wanted; k++) {
      var fresh = freshErrors(deck, n, k, ruleset, cardsByNumber, known);
      if (fresh.length) { blockedBy = fresh[0]; break; }
      max = k;
    }
    return { max: max, blockedBy: blockedBy };
  }

  /* Insignias de una carta: BANNED / RESTRICTED n / BANNED PAIR / RESTRICTED GROUP. */
  function cardRules(number, ruleset, cardsByNumber) {
    var n = norm(number), out = [];
    var banned = bannedMap(ruleset), restricted = restrictedMap(ruleset);
    if (banned[n]) out.push({ kind: 'banned', max: 0 });
    if (restricted[n]) out.push({ kind: 'restricted', max: restricted[n].maxCopies });
    (ruleset.bannedPairs || []).forEach(function (p) {
      var a = norm(p.cardA), b = norm(p.cardB);
      if (n === a || n === b) out.push({ kind: 'banned_pair', pairId: p.id, partner: n === a ? b : a });
    });
    (ruleset.exclusiveGroups || []).forEach(function (g) {
      var m = groupMembers(g, cardsByNumber);
      if (m.has(n)) out.push({ kind: 'exclusive_group', groupId: g.id, detected: !!m.detected[n] });
    });
    return out;
  }

  /* Insignias que importan ahora: las de carta prohibida o restringida siempre; las de pareja prohibida y grupo exclusivo
   * solo cuando el mazo ya contiene la otra carta de la pareja o ya llega al máximo de cartas distintas del grupo. */
  function activeRules(number, deck, ruleset, cardsByNumber) {
    var n = norm(number), have = {};
    Object.keys(deck || {}).forEach(function (k) { if (Number(deck[k]) > 0) have[norm(k)] = true; });
    return cardRules(number, ruleset, cardsByNumber).filter(function (r) {
      if (r.kind === 'banned_pair') return !!have[r.partner];
      if (r.kind === 'exclusive_group') {
        var g = (ruleset.exclusiveGroups || []).filter(function (x) { return x.id === r.groupId; })[0];
        var members = groupMembers(g, cardsByNumber);
        var others = Object.keys(have).filter(function (x) { return x !== n && members.has(x); }).length;
        return others + 1 > g.maxDistinctCardNumbers;
      }
      return true;
    });
  }

  /* Aplica una acción de arreglo y devuelve el mazo nuevo (no muta el original). */
  function applyFix(deck, fix) {
    var d = Object.assign({}, deck);
    function drop(n) { delete d[norm(n)]; delete d[n]; }
    if (fix.type === 'remove_all') drop(fix.number);
    else if (fix.type === 'remove_excess') { var left = (Number(d[norm(fix.number)]) || 0) - fix.qty; if (left > 0) d[norm(fix.number)] = left; else drop(fix.number); }
    else if (fix.type === 'keep_only') (fix.remove || []).forEach(drop);
    else if (fix.type === 'remove_color') (fix.numbers || []).forEach(drop);
    return d;
  }

  return { getActiveRuleset: getActiveRuleset, validateDeck: validateDeck, maxAddable: maxAddable, cardRules: cardRules,
    groupMembers: groupMembers, applyFix: applyFix, matchesCriteria: matchesCriteria, activeRules: activeRules, knownSignatures: knownSignatures, context: context };
});
