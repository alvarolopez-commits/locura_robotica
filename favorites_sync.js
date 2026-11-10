/* Sincronización de los arquetipos favoritos con la cuenta (Supabase). Sin DOM y sin supabase-js propio: recibe el cliente ya creado.
 *
 * La nube guarda UNA fila por persona: user_archetype_favorites(favorites = [{ id, season, name, addedAt }], revision).
 * Misma idea que collection_sync.js: cada dispositivo recuerda lo último que sabía que tenía la nube (la "base") y al sincronizar mezcla
 * a tres bandas (base · local · nube) por id de favorito:
 *   · lo que se añadió en un lado se conserva; lo que se quitó en un lado (y estaba en la base) se quita, así dejar de seguir se propaga;
 *   · la primera vez (sin base) las dos listas simplemente se unen.
 * Se envía con la revisión esperada: si otro dispositivo guardó antes, el servidor responde PT409 y se vuelve a mezclar.
 * Sin conexión o con errores, los favoritos locales siguen intactos y se reintenta. Si la tabla aún no existe (migración sin aplicar), la app
 * funciona igual solo en este dispositivo y no se reintenta. Un invitado (sin sesión) nunca llega aquí: sus favoritos son solo locales. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FavoritesSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEBOUNCE_MS = 800, RETRY_MS = 6000, RETRY_MAX = 60000, KEY = 'msa_favsync_v1', MAX_FAVS = 200;

  function byId(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id) m[x.id] = x; }); return m; }
  function ids(list) { return Object.keys(byId(list)).sort(); }
  function sameSet(a, b) { return JSON.stringify(ids(a)) === JSON.stringify(ids(b)); }

  /* mezcla de tres vías por id; devuelve la lista ordenada por fecha de alta */
  function merge(base, local, remote) {
    var b = byId(base), l = byId(local), r = byId(remote), out = {}, all = {};
    [b, l, r].forEach(function (m) { Object.keys(m).forEach(function (k) { all[k] = 1; }); });
    Object.keys(all).forEach(function (k) {
      var inB = !!b[k], inL = !!l[k], inR = !!r[k], keep;
      if (inL && inR) keep = true;
      else if (!inB) keep = true;          // añadido en un solo lado
      else keep = false;                   // estaba en la base y falta en un lado: se quitó
      if (keep) { var src = l[k] || r[k], t = [l[k] && l[k].addedAt, r[k] && r[k].addedAt].filter(function (x) { return x > 0; }); out[k] = { id: src.id, season: src.season, name: src.name, addedAt: t.length ? Math.min.apply(null, t) : (src.addedAt || 0) }; }
    });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (x, y) { return (x.addedAt - y.addedAt) || x.id.localeCompare(y.id); }).slice(0, MAX_FAVS);
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
    var base = [], revision = null;
    var st = { phase: 'signedout', message: '' };

    function setT(fn, ms) { return (host.setTimeout || setTimeout)(fn, ms); }
    function clearT(t) { (host.clearTimeout || clearTimeout)(t); }
    function emit(phase, extra) { st = { phase: phase, message: '' }; if (extra) for (var k in extra) st[k] = extra[k]; if (host.onState) host.onState(st); }
    function persist() { if (host.storage) host.storage.set(KEY, JSON.stringify({ userId: user && user.id, base: base, revision: revision })); }
    function load() {
      base = []; revision = null;
      try {
        var o = JSON.parse((host.storage && host.storage.get(KEY)) || 'null');
        if (o && user && o.userId === user.id && Array.isArray(o.base) && typeof o.revision === 'number') { base = o.base; revision = o.revision; }
      } catch (e) { base = []; revision = null; }
    }
    function dirty() { return !sameSet(host.snapshot(), base); }

    function readRemote() {
      return host.client().from('user_archetype_favorites').select('favorites,revision').limit(1).then(function (r) {
        if (!r || r.error) throw (r && r.error) || new Error('sin respuesta');
        var row = r.data && r.data[0];
        return row ? { favorites: Array.isArray(row.favorites) ? row.favorites : [], revision: row.revision } : { favorites: [], revision: 0 };
      });
    }
    function push(list, expected) {
      return host.client().rpc('save_favorites', { p_favorites: list, p_expected_revision: expected }).then(function (r) {
        if (!r || r.error) throw (r && r.error) || new Error('sin respuesta');
        var row = r.data && r.data[0]; if (!row) throw new Error('save_favorites sin respuesta');
        return row.new_revision;
      });
    }
    function full(attempt) {
      return readRemote().then(function (rem) {
        var local = host.snapshot(), merged = merge(base, local, rem.favorites);
        if (!sameSet(merged, local)) host.replaceAll(merged);
        if (sameSet(merged, rem.favorites)) { base = merged; revision = rem.revision; persist(); return; }
        return push(merged, rem.revision).then(function (rev) { base = merged; revision = rev; persist(); }, function (e) {
          if (classify(e) === 'conflict' && attempt < 4) return full(attempt + 1);
          throw e;
        });
      });
    }
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
      if (kind === 'unavailable') { emit('unavailable', { message: errText(err) }); return; }   // migración sin aplicar: sin reintentos
      emit(kind === 'offline' ? 'offline' : 'error', { message: errText(err) });
      if (retryTimer) clearT(retryTimer);
      retryTimer = setT(function () { retryTimer = null; flush(); }, retryMs);
      retryMs = Math.min(RETRY_MAX, retryMs * 2);
    }
    function flush(force) {
      if (!started || !user) return Promise.resolve();
      if (timer) { clearT(timer); timer = null; }
      if (running) return running;
      if (st.phase === 'unavailable' && !force) return Promise.resolve();
      if (!force && revision !== null && !dirty()) { emit('saved'); return Promise.resolve(); }
      emit('saving');
      running = (revision === null || force ? full(0) : quick()).then(function () {
        retryMs = RETRY_MS; emit('saved');
      }, failed).then(function () {
        running = null;
        if (started && user && st.phase === 'saved' && dirty()) return flush();
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
      start: function (u) { user = u; started = true; retryMs = RETRY_MS; load(); return flush(true); },
      stop: function () {
        started = false; user = null; if (timer) clearT(timer); if (retryTimer) clearT(retryTimer); timer = retryTimer = null;
        base = []; revision = null; if (host.storage) host.storage.set(KEY, ''); emit('signedout');
      },
      touch: schedule, flush: flush,
      retry: function () { if (retryTimer) { clearT(retryTimer); retryTimer = null; } retryMs = RETRY_MS; return flush(true); },
      state: function () { return st; },
      DEBOUNCE_MS: DEBOUNCE_MS
    };
  }

  return { create: create, merge: merge, classify: classify, MAX_FAVS: MAX_FAVS };
});
