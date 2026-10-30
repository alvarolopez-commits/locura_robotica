/* Mi colección: las cartas que la persona tiene en su poder, con cuántas copias y cuándo las añadió. Sin DOM.
 * La persistencia la pone quien lo usa:  host = { load(): string|null, save(text: string): void }.
 * Se guarda como objeto JSON  { "ST01-001": { "q": 2, "t": 1730000000000 }, … }  (q = copias, t = fecha de alta en ms).
 * Se lee también el formato antiguo (lista de números = 1 copia, sin fecha); un valor ilegible equivale a una colección vacía. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Collection = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KEY = 'msa_collection';
  var MAX_QTY = 99;

  function validQty(q) { return typeof q === 'number' && isFinite(q) && Math.floor(q) >= 1; }
  function clampQty(q) { return Math.min(MAX_QTY, Math.floor(q)); }

  function parse(text) {
    var map = new Map();
    try {
      var v = JSON.parse(text);
      if (Array.isArray(v)) {
        v.forEach(function (x) { if (typeof x === 'string' && x) map.set(x, { q: 1, t: 0 }); });
      } else if (v && typeof v === 'object') {
        Object.keys(v).forEach(function (k) {
          var e = v[k], q = e && typeof e === 'object' ? e.q : e, t = e && typeof e === 'object' && typeof e.t === 'number' && isFinite(e.t) ? e.t : 0;
          if (k && validQty(q)) map.set(k, { q: clampQty(q), t: t });
        });
      }
    } catch (e) { /* ilegible: colección vacía */ }
    return map;
  }

  function create(host, opts) {
    var now = opts && opts.now ? opts.now : function () { return Date.now(); };
    var map = parse(host && host.load ? host.load() : null);
    var listeners = [];

    function list() { return Array.from(map.keys()).sort(); }
    function commit(changed) {
      if (!changed) return;
      try {
        if (host && host.save) {
          var out = {};
          list().forEach(function (k) { out[k] = { q: map.get(k).q, t: map.get(k).t }; });
          host.save(JSON.stringify(out));
        }
      } catch (e) { /* sin almacenamiento: sigue en memoria */ }
      listeners.forEach(function (fn) { fn(); });
    }
    function put(n, q) {   // devuelve true si algo cambió
      if (!validQty(q)) { return map.delete(n); }
      q = clampQty(q);
      var cur = map.get(n);
      if (cur) { if (cur.q === q) return false; cur.q = q; return true; }
      map.set(n, { q: q, t: now() }); return true;
    }
    function addMany(nums) {
      var changed = false;
      nums.forEach(function (n) { if (!map.has(n)) { put(n, 1); changed = true; } });
      commit(changed);
    }
    function removeMany(nums) {
      var changed = false;
      nums.forEach(function (n) { if (map.delete(n)) changed = true; });
      commit(changed);
    }
    function snapshot() { var out = {}; list().forEach(function (k) { out[k] = { q: map.get(k).q, t: map.get(k).t }; }); return out; }
    function replaceAll(obj) {   // sustituye toda la colección (lo usa la sincronización); solo avisa si algo cambió
      var next = parse(JSON.stringify(obj || {})), before = JSON.stringify(snapshot());
      map = next;
      commit(JSON.stringify(snapshot()) !== before);
    }
    function qty(n) { var e = map.get(n); return e ? e.q : 0; }
    function setQty(n, q) { commit(put(n, typeof q === 'number' ? q : 0)); }
    return {
      has: function (n) { return map.has(n); },
      add: function (n) { addMany([n]); },
      remove: function (n) { removeMany([n]); },
      addMany: addMany,
      removeMany: removeMany,
      qty: qty,
      snapshot: snapshot,
      replaceAll: replaceAll,
      setQty: setQty,
      inc: function (n, by) { setQty(n, qty(n) + (by || 1)); },
      dec: function (n) { if (map.has(n)) setQty(n, qty(n) - 1); },
      units: function () { var u = 0; map.forEach(function (e) { u += e.q; }); return u; },
      addedAt: function (n) { var e = map.get(n); return e ? e.t : 0; },
      hasDates: function () { var any = false; map.forEach(function (e) { if (e.t > 0) any = true; }); return any; },
      size: function () { return map.size; },
      exists: function () { return map.size > 0; },
      list: list,
      isMissing: function (n) { return map.size > 0 && !map.has(n); },
      hasAll: function (nums) { return nums.length > 0 && nums.every(function (n) { return map.has(n); }); },
      onChange: function (fn) { listeners.push(fn); }
    };
  }

  return { KEY: KEY, MAX_QTY: MAX_QTY, create: create };
});
