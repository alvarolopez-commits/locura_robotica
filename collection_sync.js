/* Sincronización de Mi colección con la cuenta (Supabase). Sin DOM y sin supabase-js propio: recibe el cliente ya creado.
 *
 * La nube guarda UNA fila por persona: user_collection(cards = { "ST01-001": { q, t } }, revision). Cada dispositivo recuerda la última
 * colección que sabía que tenía la nube (la "base"). Al sincronizar se hace una mezcla de tres vías (base · local · nube):
 *   · lo que cambió en un solo lado gana (también quitar una carta, así borrar se propaga a los demás dispositivos);
 *   · si cambió en los dos de forma distinta se conserva el mayor número de copias (no se pierde nada);
 *   · la primera vez (sin base) las dos colecciones simplemente se unen.
 * Se envía con la revisión esperada: si otro dispositivo guardó antes, el servidor responde PT409 y se vuelve a mezclar.
 * Sin conexión o con errores, la colección local sigue intacta y se reintenta; si la tabla aún no existe, no se reintenta. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CollectionSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEBOUNCE_MS = 800, RETRY_MS = 6000, RETRY_MAX = 60000, KEY = 'msa_collsync_v1';

  function qOf(m, n) { return m && m[n] && m[n].q > 0 ? m[n].q : 0; }
  function keys(a, b, c) { var s = {}; [a, b, c].forEach(function (m) { Object.keys(m || {}).forEach(function (k) { s[k] = 1; }); }); return Object.keys(s).sort(); }
  function sameQty(a, b) { var ks = keys(a, b); return ks.every(function (n) { return qOf(a, n) === qOf(b, n); }); }

  /* mezcla de tres vías; devuelve { carta: { q, t } } */
  function merge(base, local, remote) {
    var out = {};
    keys(base, local, remote).forEach(function (n) {
      var l = qOf(local, n), r = qOf(remote, n), b = qOf(base, n), src;
      if (l === r) src = local && local[n] ? local[n] : remote[n];
      else if (l === b) src = remote[n];
      else if (r === b) src = local[n];
      else src = l >= r ? local[n] : remote[n];
      if (!src || !(src.q > 0)) return;
      var ts = [local && local[n] && local[n].t, remote && remote[n] && remote[n].t, src.t].filter(function (x) { return x > 0; });
      out[n] = { q: src.q, t: ts.length ? Math.min.apply(null, ts) : 0 };
    });
    return out;
  }

  function errText(e) { return String((e && (e.message || e.error_description || e.msg)) || e || ''); }
  function classify(err) {
    var code = String((err && err.code) || ''), msg = errText(err);
    if (code === 'PT409' || /revision_conflict/.test(msg)) return 'conflict';
    if (code === 'PT401' || /not_authenticated|jwt|invalid.*token|refresh.token/i.test(msg) || (err && err.status === 401)) return 'auth';
    if (/failed to fetch|networkerror|network request|load failed|fetch|timeout|offline/i.test(msg) || (err && err.status === 0)) return 'offline';
    if (code === 'PGRST205' || code === 'PGRST202' || code === '42P01' || code === '42883' || /could not find the (table|function)|does not exist/i.test(msg)) return 'unavailable';
    return 'error';
  }

  function create(host) {
    var user = null, started = false, running = null, timer = null, retryTimer = null, retryMs = RETRY_MS;
    var base = {}, revision = null;          // lo último que sabemos que tiene la nube (revision null = aún no se ha leído)
    var st = { phase: 'signedout', message: '' };

    function setT(fn, ms) { return (host.setTimeout || setTimeout)(fn, ms); }
    function clearT(t) { (host.clearTimeout || clearTimeout)(t); }
    function emit(phase, extra) { st = { phase: phase, message: '' }; if (extra) for (var k in extra) st[k] = extra[k]; if (host.onState) host.onState(st); }
    function persist() { if (host.storage) host.storage.set(KEY, JSON.stringify({ userId: user && user.id, base: base, revision: revision })); }
    function load() {
      base = {}; revision = null;
      try {
        var o = JSON.parse((host.storage && host.storage.get(KEY)) || 'null');
        if (o && user && o.userId === user.id && o.base && typeof o.revision === 'number') { base = o.base; revision = o.revision; }
      } catch (e) { base = {}; revision = null; }
    }
    function dirty() { return !sameQty(host.snapshot(), base); }

    function readRemote() {
      return host.client().from('user_collection').select('cards,revision').limit(1).then(function (r) {
        if (!r || r.error) throw (r && r.error) || new Error('sin respuesta');
        var row = r.data && r.data[0];
        return row ? { cards: row.cards || {}, revision: row.revision } : { cards: {}, revision: 0 };
      });
    }
    function push(cards, expected) {
      return host.client().rpc('save_collection', { p_cards: cards, p_expected_revision: expected }).then(function (r) {
        if (!r || r.error) throw (r && r.error) || new Error('sin respuesta');
        var row = r.data && r.data[0]; if (!row) throw new Error('save_collection sin respuesta');
        return row.new_revision;
      });
    }
    /* lee la nube, mezcla, aplica lo que falte en local y sube lo que falte en la nube */
    function full(attempt) {
      return readRemote().then(function (rem) {
        var local = host.snapshot(), merged = merge(base, local, rem.cards);
        if (!sameQty(merged, local)) host.replaceAll(merged);
        var needPush = !sameQty(merged, rem.cards);
        if (!needPush) { base = merged; revision = rem.revision; persist(); return; }
        return push(merged, rem.revision).then(function (rev) { base = merged; revision = rev; persist(); }, function (e) {
          if (classify(e) === 'conflict' && attempt < 4) return full(attempt + 1);
          throw e;
        });
      });
    }
    /* cambio local sencillo: se intenta enviar directamente con la revisión conocida; si otro dispositivo guardó antes, se mezcla */
    function quick() {
      var local = host.snapshot();
      return push(local, revision).then(function (rev) { base = local; revision = rev; persist(); }, function (e) {
        if (classify(e) === 'conflict') return full(0);
        throw e;
      });
    }
    function failed(err) {
      var kind = classify(err);
      if (kind === 'auth') { emit('signedout', { message: 'session_expired', pending: true }); return; }
      if (kind === 'unavailable') { emit('unavailable', { message: errText(err) }); return; }   // la tabla no existe todavía: sin reintentos
      emit(kind === 'offline' ? 'offline' : 'error', { message: errText(err) });
      if (retryTimer) clearT(retryTimer);
      retryTimer = setT(function () { retryTimer = null; flush(); }, retryMs);
      retryMs = Math.min(RETRY_MAX, retryMs * 2);
    }
    function flush(force) {
      if (!started || !user) return Promise.resolve();
      if (timer) { clearT(timer); timer = null; }
      if (running) return running;
      if (!force && revision !== null && !dirty()) { emit('saved'); return Promise.resolve(); }
      emit('saving');
      running = (revision === null || force ? full(0) : quick()).then(function () {
        retryMs = RETRY_MS; emit('saved');
      }, failed).then(function () {
        running = null;
        if (started && user && st.phase === 'saved' && dirty()) return flush();   // se tocó algo mientras se enviaba
      });
      return running;
    }
    function schedule() {
      if (!started || !user || st.phase === 'unavailable') return;
      if (timer) clearT(timer);
      if (dirty() && st.phase !== 'saving') emit('pending');
      timer = setT(function () { timer = null; flush(); }, DEBOUNCE_MS);
    }

    return {
      /* Tras iniciar sesión: trae la nube, la une con la colección de este dispositivo y sube lo que falte. */
      start: function (u) { user = u; started = true; retryMs = RETRY_MS; load(); return flush(true); },
      stop: function () {
        started = false; user = null; if (timer) clearT(timer); if (retryTimer) clearT(retryTimer); timer = retryTimer = null;
        base = {}; revision = null; if (host.storage) host.storage.set(KEY, ''); emit('signedout');
      },
      touch: schedule,
      flush: flush,
      retry: function () { if (retryTimer) { clearT(retryTimer); retryTimer = null; } retryMs = RETRY_MS; return flush(true); },   // siempre lee la nube: así se ponen al día los cambios hechos en otro dispositivo
      state: function () { return st; },
      DEBOUNCE_MS: DEBOUNCE_MS
    };
  }

  return { create: create, merge: merge, classify: classify };
});
