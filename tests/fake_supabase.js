/* Servidor Supabase FALSO en memoria (solo para pruebas): imita las reglas del esquema supabase/schema.sql.
 * Se usa en Node (tests/decks_sync.test.js) y se inyecta en el navegador de pruebas para probar la interfaz sin claves reales. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.FakeSupabase = factory(); })(typeof self !== 'undefined' ? self : this, function () {
'use strict';
function makeServer() {
  const S = { decks: [], cards: [], prefs: {}, collections: {}, noCollectionTable: false, seq: 0, calls: [], offline: false, authFail: false };
  const uuid = () => { S.seq++; const h = String(S.seq).padStart(12, '0'); return '00000000-0000-4000-8000-' + h; };
  const mainCount = (id) => S.cards.filter((c) => c.deck_id === id && c.board === 'main').reduce((s, c) => s + c.quantity, 0);
  const touchStatus = (d) => { d.status = mainCount(d.id) >= 50 ? 'complete' : 'draft'; d.revision++; d.updated_at = new Date(1700000000000 + S.seq * 1000 + d.revision).toISOString(); };
  const err = (code, message, status) => ({ code, message, status });
  function client(userId) {
    const guard = () => { if (S.offline) return { error: { message: 'TypeError: Failed to fetch', status: 0 } }; if (S.authFail) return { error: { code: 'PT401', message: 'JWT expired', status: 401 } }; return null; };
    function builder(table) {
      const st = { table, op: 'select', filters: [], payload: null, order: null, ret: false };
      const b = {
        select(cols) { if (st.op === 'update') st.ret = true; return b; },
        update(p) { st.op = 'update'; st.payload = p; return b; },
        upsert(p) { st.op = 'upsert'; st.payload = p; return b; },
        eq(k, v) { st.filters.push((r) => r[k] === v); return b; },
        is(k, v) { st.filters.push((r) => (r[k] === undefined ? null : r[k]) === v); return b; },
        in(k, vs) { st.filters.push((r) => vs.indexOf(r[k]) !== -1); return b; },
        order() { return b; },
        limit() { return b; },
        then(res, rej) {
          S.calls.push(table + '.' + st.op);
          const g = guard(); if (g) return Promise.resolve(g).then(res, rej);
          let out;
          if (table === 'decks') {
            const mine = S.decks.filter((d) => d.user_id === userId);
            const rows = mine.filter((r) => st.filters.every((f) => f(r)));
            if (st.op === 'select') out = { data: rows.map((r) => Object.assign({}, r)), error: null };
            else if (st.op === 'update') { rows.forEach((r) => { Object.assign(r, st.payload); touchStatus(r); }); out = { data: st.ret ? rows.map((r) => ({ revision: r.revision, updated_at: r.updated_at })) : null, error: null }; }
          } else if (table === 'deck_cards') {
            const mineIds = S.decks.filter((d) => d.user_id === userId).map((d) => d.id);
            out = { data: S.cards.filter((c) => mineIds.indexOf(c.deck_id) !== -1 && st.filters.every((f) => f(c))).map((c) => Object.assign({}, c)), error: null };
          } else if (table === 'user_collection') {
            if (S.noCollectionTable) out = { data: null, error: err('PGRST205', 'Could not find the table', 404) };
            else { const row = S.collections[userId]; out = { data: row ? [{ cards: row.cards, revision: row.revision }] : [], error: null }; }
          } else if (table === 'user_preferences') {
            if (st.op === 'upsert') { if (st.payload.user_id !== userId) out = { data: null, error: err('42501', 'rls') }; else { S.prefs[userId] = st.payload.active_deck_id; out = { data: null, error: null }; } }
            else out = { data: S.prefs[userId] !== undefined ? [{ active_deck_id: S.prefs[userId] }] : [], error: null };
          }
          return Promise.resolve(out).then(res, rej);
        },
      };
      return b;
    }
    function replaceCards(id, cards) {
      S.cards = S.cards.filter((c) => c.deck_id !== id);
      cards.forEach((c) => { if (c.quantity > 0) S.cards.push({ deck_id: id, card_number: c.cardNumber, quantity: c.quantity, board: c.board || 'main' }); });
    }
    return {
      from: builder,
      rpc(name, a) {
        S.calls.push('rpc.' + name);
        return new Promise((resolve) => {
          const g = guard(); if (g) return resolve(g);
          if (name === 'create_deck') {
            let d = a.p_temp_id ? S.decks.find((x) => x.user_id === userId && x.migrated_from_temp_id === a.p_temp_id) : null;
            if (!d) {
              d = { id: uuid(), user_id: userId, name: (a.p_name || '').trim() || 'Mazo sin nombre', description: a.p_description || null, status: 'draft', is_favorite: false, is_archived: false, revision: 1, migrated_from_temp_id: a.p_temp_id || null, updated_at: new Date(1700000000000 + S.seq * 1000).toISOString(), deleted_at: null };
              S.decks.push(d); replaceCards(d.id, a.p_cards || []); touchStatus(d); d.revision = 2;
            }
            return resolve({ data: [{ deck_id: d.id, revision: d.revision, updated_at: d.updated_at, main_count: mainCount(d.id) }], error: null });
          }
          if (name === 'replace_deck_cards') {
            const d = S.decks.find((x) => x.id === a.p_deck && x.user_id === userId && !x.deleted_at);
            if (!d) return resolve({ data: null, error: err('PT404', 'deck_not_found', 404) });
            if (a.p_expected_revision != null && a.p_expected_revision !== d.revision) return resolve({ data: null, error: err('PT409', 'revision_conflict', 409) });
            replaceCards(d.id, a.p_cards || []); touchStatus(d);
            return resolve({ data: [{ revision: d.revision, updated_at: d.updated_at, main_count: mainCount(d.id) }], error: null });
          }
          if (name === 'save_collection') {
            if (S.noCollectionTable) return resolve({ data: null, error: err('PGRST202', 'function not found', 404) });
            const cur = S.collections[userId] ? S.collections[userId].revision : 0;
            if (a.p_expected_revision != null && a.p_expected_revision !== cur) return resolve({ data: null, error: err('PT409', 'revision_conflict', 409) });
            S.collections[userId] = { cards: JSON.parse(JSON.stringify(a.p_cards || {})), revision: cur + 1 };
            return resolve({ data: [{ new_revision: cur + 1, saved_at: new Date(1700000000000 + S.seq * 1000).toISOString() }], error: null });
          }
          resolve({ data: null, error: err('42883', 'función desconocida ' + name) });
        });
      },
    };
  }
  S.client = client;
  return S;
}


return { makeServer: makeServer };
});
