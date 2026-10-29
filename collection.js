/* Mi colección: las cartas que la persona tiene en su poder. Sin DOM y sin cantidades (o la tienes o no).
 * La persistencia la pone quien lo usa:  host = { load(): string|null, save(text: string): void }.
 * Se guarda como una lista JSON ordenada de números de carta; un valor ilegible equivale a una colección vacía. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Collection = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KEY = 'msa_collection';

  function parse(text) {
    try {
      var v = JSON.parse(text);
      if (!Array.isArray(v)) return [];
      return v.filter(function (x) { return typeof x === 'string' && x; });
    } catch (e) { return []; }
  }

  function create(host) {
    var set = new Set(parse(host && host.load ? host.load() : null));
    var listeners = [];

    function list() { return Array.from(set).sort(); }
    function commit(changed) {
      if (!changed) return;
      try { if (host && host.save) host.save(JSON.stringify(list())); } catch (e) { /* sin almacenamiento: sigue en memoria */ }
      listeners.forEach(function (fn) { fn(); });
    }
    function addMany(nums) {
      var changed = false;
      nums.forEach(function (n) { if (!set.has(n)) { set.add(n); changed = true; } });
      commit(changed);
    }
    function removeMany(nums) {
      var changed = false;
      nums.forEach(function (n) { if (set.delete(n)) changed = true; });
      commit(changed);
    }
    return {
      has: function (n) { return set.has(n); },
      add: function (n) { addMany([n]); },
      remove: function (n) { removeMany([n]); },
      addMany: addMany,
      removeMany: removeMany,
      size: function () { return set.size; },
      exists: function () { return set.size > 0; },
      list: list,
      isMissing: function (n) { return set.size > 0 && !set.has(n); },
      hasAll: function (nums) { return nums.length > 0 && nums.every(function (n) { return set.has(n); }); },
      onChange: function (fn) { listeners.push(fn); }
    };
  }

  return { KEY: KEY, create: create };
});
