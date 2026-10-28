/* Sincronización de mazos con Supabase (User Deck Persistence V1). Sin DOM y sin supabase-js propio:
 * recibe el cliente ya creado, así se prueba en Node con un cliente falso (tests/decks_sync.test.js).
 *
 * Modelo local (lo que ya usa la página):  decks = { id: { name, cards:{num:qty}, description?, favorite?, sideCards?, remote?:{revision,updatedAt}, updatedAt? } }
 * Los mazos archivados viven en `archived` (misma forma), así los selectores y el comparador solo ven los activos.
 * La verdad es el servidor; el estado local es caché optimista. Cada cambio local marca el mazo como sucio, se espera
 * ~600 ms (debounce) y se envía un guardado agregado con la revisión esperada: si otro dispositivo guardó antes, el servidor
 * devuelve PT409 y NO se sobrescribe nada (estado `conflict`). Los fallos de red conservan el cambio local y reintentan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DeckSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEBOUNCE_MS = 600, RETRY_MS = 6000, CHUNK = 10, DEFAULT_NAME_RE = /^(mazo|deck)\s*\d*$/i;

  function isUuid(s) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || '')); }
  function sortedPairs(o) { return Object.keys(o || {}).filter(function (k) { return Number(o[k]) > 0; }).sort().map(function (k) { return [k, Number(o[k])]; }); }
  function cardsKey(d) { return JSON.stringify([sortedPairs(d.cards), sortedPairs(d.sideCards)]); }
  function metaKey(d, archived) { return JSON.stringify([String(d.name || ''), d.description || null, !!d.favorite, !!archived]); }
  function cardsPayload(d) {
    var out = [];
    sortedPairs(d.cards).forEach(function (p) { out.push({ cardNumber: p[0], quantity: p[1], board: 'main' }); });
    sortedPairs(d.sideCards).forEach(function (p) { out.push({ cardNumber: p[0], quantity: p[1], board: 'side' }); });
    return out;
  }
  function count(d) { var n = 0; Object.keys(d.cards || {}).forEach(function (k) { n += Number(d.cards[k]) || 0; }); return n; }
  function errText(e) { return String((e && (e.message || e.error_description || e.msg)) || e || ''); }
  function classify(err) {
    var code = String((err && err.code) || ''), msg = errText(err);
    if (code === 'PT409' || /revision_conflict/.test(msg)) return 'conflict';
    if (code === 'PT404' || /deck_not_found/.test(msg)) return 'gone';
    if (code === 'PT401' || /not_authenticated|jwt|invalid.*token|refresh.token/i.test(msg) || err && err.status === 401) return 'auth';
    if (/failed to fetch|networkerror|network request|load failed|fetch|timeout|offline/i.test(msg) || (err && err.status === 0)) return 'offline';
    return 'error';
  }

  function create(host) {
    var user = null, started = false, running = false, again = false, timer = null, retryTimer = null;
    var synced = {};              // id -> { cards, meta, revision }   (lo último que sabemos que tiene el servidor)
    var conflicts = {};           // id -> true: el servidor tiene una revisión más nueva; no se pisa
    var lastActive;               // último mazo activo enviado al servidor
    var st = { phase: 'signedout', dirty: 0, conflictId: null, message: '' };

    function now() { return host.now ? host.now() : Date.now(); }
    function setT(fn, ms) { return (host.setTimeout || setTimeout)(fn, ms); }
    function clearT(t) { (host.clearTimeout || clearTimeout)(t); }
    function emit(phase, extra) {
      st = { phase: phase, dirty: dirtyList().length, conflictId: st.conflictId, message: '' };
      if (extra) for (var k in extra) st[k] = extra[k];
      if (host.onState) host.onState(st);
    }
    function client() { return host.client(); }
    function live() { return host.get(); }
    function tracked() {
      var m = live(), out = [];
      Object.keys(m.decks).forEach(function (id) { out.push({ id: id, d: m.decks[id], archived: false }); });
      Object.keys(m.archived || {}).forEach(function (id) { out.push({ id: id, d: m.archived[id], archived: true }); });
      return out;
    }
    function persistSynced() { if (host.storage) host.storage.set('msa_sync_v1', JSON.stringify({ userId: user && user.id, synced: synced })); }
    function loadSynced() {
      try {
        var raw = host.storage && host.storage.get('msa_sync_v1'), o = raw ? JSON.parse(raw) : null;
        synced = o && user && o.userId === user.id && o.synced ? o.synced : {};
      } catch (e) { synced = {}; }
    }

    /* ---------- qué está pendiente ---------- */
    function needsCreate(t) { return !t.d.remote && !isUuid(t.id) ? (count(t.d) > 0 || !DEFAULT_NAME_RE.test(String(t.d.name || '').trim())) : false; }
    function isDirty(t) {
      if (!t.d.remote) return needsCreate(t);
      var s = synced[t.id];
      return !s || s.cards !== cardsKey(t.d) || s.meta !== metaKey(t.d, t.archived);
    }
    function dirtyList() {
      if (!user) return [];
      var out = tracked().filter(function (t) { return !conflicts[t.id] && isDirty(t); }).map(function (t) { return t.id; });
      var present = {}; tracked().forEach(function (t) { present[t.id] = true; });
      Object.keys(synced).forEach(function (id) { if (!present[id] && !conflicts[id]) out.push(id); });   // borrados localmente: falta el borrado en el servidor
      var act = live().activeId;
      if (act && isUuid(act) && act !== lastActive && !conflicts[act]) out.push('active');
      return out;
    }

    /* ---------- lectura del servidor ---------- */
    function fetchAll() {
      var c = client();
      return c.from('decks').select('id,name,description,status,is_favorite,is_archived,revision,updated_at')
        .is('deleted_at', null).order('updated_at', { ascending: false }).then(function (r) {
          if (r.error) throw r.error;
          var rows = r.data || [], byId = {}, ids = rows.map(function (x) { return x.id; }), chunks = [];
          rows.forEach(function (x) { byId[x.id] = { row: x, cards: {}, side: {} }; });
          for (var i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
          return chunks.reduce(function (p, ch) {
            return p.then(function () {
              return c.from('deck_cards').select('deck_id,card_number,quantity,board').in('deck_id', ch).then(function (q) {
                if (q.error) throw q.error;
                (q.data || []).forEach(function (x) { var b = byId[x.deck_id]; if (b) (x.board === 'side' ? b.side : b.cards)[x.card_number] = x.quantity; });
              });
            });
          }, Promise.resolve()).then(function () { return ids.map(function (id) { return byId[id]; }); });
        });
    }
    function toLocal(b) {
      var r = b.row;
      return { name: r.name, description: r.description || '', favorite: !!r.is_favorite, cards: b.cards, sideCards: b.side,
        remote: { revision: r.revision, updatedAt: r.updated_at }, updatedAt: Date.parse(r.updated_at) || now() };
    }
    function adopt(b) {
      var d = toLocal(b), arch = !!b.row.is_archived;
      host.replaceDeck(b.row.id, d, arch);
      synced[b.row.id] = { cards: cardsKey(d), meta: metaKey(d, arch), revision: b.row.revision };
    }

    /* ---------- reconciliación al iniciar sesión ---------- */
    function pull() {
      return fetchAll().then(function (remote) {
        var m = live(), seen = {};
        remote.forEach(function (b) {
          var id = b.row.id, loc = m.decks[id] || (m.archived || {})[id], snap = synced[id];
          seen[id] = true;
          if (!loc) { adopt(b); return; }
          var locDirty = snap ? (snap.cards !== cardsKey(loc) || snap.meta !== metaKey(loc, !!(m.archived || {})[id])) : false;
          if (!locDirty) { adopt(b); return; }
          if (snap && snap.revision === b.row.revision) { loc.remote = { revision: b.row.revision, updatedAt: b.row.updated_at }; return; }   // solo cambió lo local: se enviará
          conflicts[id] = true; st.conflictId = id;                                                                                          // cambió en los dos lados
        });
        tracked().forEach(function (t) {
          if (t.d.remote && !seen[t.id] && isUuid(t.id)) {                       // borrado desde otro dispositivo
            var s = synced[t.id];
            if (!s || (s.cards === cardsKey(t.d) && s.meta === metaKey(t.d, t.archived))) { host.removeLocal(t.id); delete synced[t.id]; }
            else { delete t.d.remote; delete synced[t.id]; }                      // tenía cambios sin enviar: se vuelve a crear como mazo nuevo
          }
        });
        persistSynced();
        return c2prefs(remote);
      });
    }
    function c2prefs(remote) {
      return client().from('user_preferences').select('active_deck_id').eq('user_id', user.id).then(function (r) {
        if (r.error) throw r.error;
        var id = r.data && r.data[0] && r.data[0].active_deck_id, m = live();
        if (id && m.decks[id]) { host.setActive(id); lastActive = id; }
        else lastActive = undefined;
      });
    }

    /* ---------- escritura ---------- */
    function createRemote(t) {
      return client().rpc('create_deck', { p_name: t.d.name, p_description: t.d.description || null, p_cards: cardsPayload(t.d), p_temp_id: t.id }).then(function (r) {
        if (r.error) throw r.error;
        var row = r.data && r.data[0]; if (!row) throw new Error('create_deck sin respuesta');
        var newId = row.deck_id, wasArchived = t.archived;
        host.rekey(t.id, newId);
        var m = live(), d = m.decks[newId] || (m.archived || {})[newId];
        d.remote = { revision: row.revision, updatedAt: row.updated_at };
        // la creación ya guardó cartas y nombre; el archivado/favorito se envían en la vuelta siguiente
        synced[newId] = { cards: cardsKey(d), meta: metaKey({ name: d.name, description: d.description, favorite: false }, false), revision: row.revision };
        if (wasArchived || d.favorite) synced[newId].meta = JSON.stringify([String(d.name || ''), d.description || null, false, false]);
      });
    }
    function pushCards(t) {
      var s = synced[t.id];
      return client().rpc('replace_deck_cards', { p_deck: t.id, p_cards: cardsPayload(t.d), p_expected_revision: t.d.remote.revision }).then(function (r) {
        if (r.error) throw r.error;
        var row = r.data && r.data[0]; if (!row) throw new Error('replace_deck_cards sin respuesta');
        t.d.remote = { revision: row.revision, updatedAt: row.updated_at };
        s.cards = cardsKey(t.d); s.revision = row.revision;
      });
    }
    function pushMeta(t) {
      var s = synced[t.id];
      return client().from('decks').update({ name: t.d.name || 'Mazo sin nombre', description: t.d.description || null, is_favorite: !!t.d.favorite, is_archived: !!t.archived })
        .eq('id', t.id).eq('revision', t.d.remote.revision).is('deleted_at', null).select('revision,updated_at').then(function (r) {
          if (r.error) throw r.error;
          var row = r.data && r.data[0];
          if (!row) { var e = new Error('revision_conflict'); e.code = 'PT409'; throw e; }
          t.d.remote = { revision: row.revision, updatedAt: row.updated_at };
          s.meta = metaKey(t.d, t.archived); s.revision = row.revision;
        });
    }
    function softDelete(id) {
      return client().from('decks').update({ deleted_at: new Date(now()).toISOString() }).eq('id', id).then(function (r) {
        if (r.error) throw r.error;
        delete synced[id]; delete conflicts[id];
      });
    }
    function pushActive() {
      var id = live().activeId;
      return client().from('user_preferences').upsert({ user_id: user.id, active_deck_id: isUuid(id) ? id : null, updated_at: new Date(now()).toISOString() }, { onConflict: 'user_id' }).then(function (r) {
        if (r.error) throw r.error;
        lastActive = id;
      });
    }

    function step() {
      var list = tracked(), i, t;
      for (i = 0; i < list.length; i++) {
        t = list[i];
        if (conflicts[t.id]) continue;
        if (!t.d.remote && needsCreate(t)) return createRemote(t).then(function () { return true; });
        if (t.d.remote) {
          var s = synced[t.id] || (synced[t.id] = { cards: '', meta: '', revision: t.d.remote.revision });
          if (s.cards !== cardsKey(t.d)) return pushCards(t).then(function () { return true; });
          if (s.meta !== metaKey(t.d, t.archived)) return pushMeta(t).then(function () { return true; });
        }
      }
      var present = {}; list.forEach(function (x) { present[x.id] = true; });
      var gone = Object.keys(synced).filter(function (id) { return !present[id] && !conflicts[id]; })[0];
      if (gone) return softDelete(gone).then(function () { return true; });
      var act = live().activeId;
      if (act && isUuid(act) && act !== lastActive && !conflicts[act]) return pushActive().then(function () { return true; });
      return Promise.resolve(false);
    }
    function failed(err) {
      var kind = classify(err);
      if (kind === 'conflict') {
        // el mazo cuyo guardado falló: el primero sucio
        var bad = tracked().filter(function (t) { return t.d.remote && isDirty(t); })[0];
        if (bad) { conflicts[bad.id] = true; st.conflictId = bad.id; }
        emit('conflict', { conflictId: bad ? bad.id : null });
      } else if (kind === 'gone') {
        var g = tracked().filter(function (t) { return t.d.remote && isDirty(t); })[0];
        if (g) { delete g.d.remote; delete synced[g.id]; }                      // el servidor ya no lo tiene: se vuelve a crear
        emit('error', { message: errText(err) });
        schedule(0);
      } else if (kind === 'auth') {
        emit('signedout', { message: 'session_expired', pending: true });
      } else {
        emit(kind === 'offline' ? 'offline' : 'error', { message: errText(err) });
        if (retryTimer) clearT(retryTimer);
        retryTimer = setT(function () { retryTimer = null; flush(); }, RETRY_MS);
      }
      persistSynced(); if (host.persist) host.persist();
    }
    /* sin nada pendiente: "conflict" si algún mazo espera decisión del usuario, si no "saved" */
    function settle() {
      var ids = Object.keys(conflicts);
      st.conflictId = ids.length ? ids[0] : null;
      emit(ids.length ? 'conflict' : 'saved');
    }
    function flush() {
      if (!started || !user) return Promise.resolve();
      if (timer) { clearT(timer); timer = null; }
      if (running) { again = true; return running; }
      if (!dirtyList().length) { settle(); return Promise.resolve(); }
      emit('saving');
      var failedFlag = false;
      running = (function loop() {
        return step().then(function (did) {
          if (did) return loop();
        });
      })().catch(function (e) { failedFlag = true; failed(e); }).then(function () {
        running = null; persistSynced(); if (host.persist) host.persist();
        if (!failedFlag) {
          if (again || dirtyList().length) { again = false; return flush(); }
          settle();
        }
        again = false;
      });
      return running;
    }
    function schedule(ms) {
      if (!started || !user) return;
      if (timer) clearT(timer);
      if (dirtyList().length && st.phase !== 'saving') emit('pending');
      timer = setT(function () { timer = null; flush(); }, ms == null ? DEBOUNCE_MS : ms);
    }

    return {
      /* Tras iniciar sesión: trae lo del servidor, reconcilia con lo local y sube los mazos que solo existían aquí. */
      start: function (u) {
        user = u; started = true; conflicts = {}; loadSynced(); emit('saving');
        return pull().then(function () { return flush(); }).catch(function (e) { failed(e); });
      },
      stop: function () {
        started = false; user = null; if (timer) clearT(timer); if (retryTimer) clearT(retryTimer); timer = retryTimer = null;
        synced = {}; conflicts = {}; lastActive = undefined; persistSynced(); emit('signedout');
      },
      touch: function () { schedule(); },
      flush: flush,
      retry: function () { if (retryTimer) { clearT(retryTimer); retryTimer = null; } return flush(); },
      /* Conflicto: descarta lo local de ese mazo y adopta la última versión del servidor. */
      reloadDeck: function (id) {
        return fetchAll().then(function (remote) {
          var b = remote.filter(function (x) { return x.row.id === id; })[0];
          if (b) adopt(b); else { host.removeLocal(id); delete synced[id]; }
          delete conflicts[id]; st.conflictId = null; persistSynced(); if (host.persist) host.persist();
          settle();
        }).catch(failed);
      },
      state: function () { return st; },
      user: function () { return user; },
      isDirtyDeck: function (id) { return dirtyList().indexOf(id) !== -1; },
      DEBOUNCE_MS: DEBOUNCE_MS
    };
  }

  return { create: create, isUuid: isUuid, classify: classify, cardsPayload: cardsPayload };
});
