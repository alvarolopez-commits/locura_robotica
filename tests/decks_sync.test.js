/* Pruebas de la sincronización de mazos con Supabase (spec User Deck Persistence V1 §81). Ejecutar:  node tests/decks_sync.test.js
 * Usa un servidor Supabase FALSO en memoria que imita las reglas del esquema: dueño por usuario, revisión que sube en cada
 * cambio, PT409 si la revisión esperada no coincide, borrado lógico, create_deck idempotente por p_temp_id. */
const DeckSync = require('../decks_sync.js');

let passed = 0, failed = 0;
function norm(v) { if (Array.isArray(v)) return v.map(norm); if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = norm(v[k]); }); return o; } return v; }
function eq(a, b, msg) { a = norm(a); b = norm(b); if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'valor') + ': esperado ' + JSON.stringify(b) + ' y salió ' + JSON.stringify(a)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'condición falsa'); }
async function test(name, fn) { try { await fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

const { makeServer } = require('./fake_supabase.js');

/* ---------- dispositivo falso: el modelo local de la página ---------- */
function makeDevice(server, userId, opts) {
  opts = opts || {};
  const store = new Map();
  const dev = { decks: {}, archived: {}, activeId: null, states: [], timers: [], persisted: 0, storage: store };
  const host = {
    client: () => server.client(userId),
    get: () => ({ decks: dev.decks, archived: dev.archived, activeId: dev.activeId }),
    setActive: (id) => { dev.activeId = id; },
    rekey: (o, n) => { const src = dev.decks[o] ? dev.decks : dev.archived; src[n] = src[o]; delete src[o]; if (dev.activeId === o) dev.activeId = n; },
    replaceDeck: (id, d, arch) => { delete dev.decks[id]; delete dev.archived[id]; (arch ? dev.archived : dev.decks)[id] = d; },
    removeLocal: (id) => { delete dev.decks[id]; delete dev.archived[id]; if (dev.activeId === id) dev.activeId = Object.keys(dev.decks)[0] || null; },
    persist: () => { dev.persisted++; },
    onState: (s) => { dev.states.push(s.phase); },
    storage: { get: (k) => store.get(k), set: (k, v) => store.set(k, v) },
    now: () => 1700000000000,
    setTimeout: (fn, ms) => { const t = { fn, ms, on: true }; dev.timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.on = false; },
  };
  dev.sync = DeckSync.create(host);
  dev.run = async () => { for (let i = 0; i < 5; i++) { const ts = dev.timers.filter((t) => t.on); dev.timers = []; ts.forEach((t) => { t.on = false; t.fn(); }); await new Promise((r) => setImmediate(r)); if (dev.sync.state().phase !== 'saving') break; } await dev.sync.flush(); };
  dev.user = { id: userId };
  return dev;
}
const cards = (o) => Object.assign({}, o);
const serverCards = (S, id) => { const o = {}; S.cards.filter((c) => c.deck_id === id && c.board === 'main').forEach((c) => { o[c.card_number] = c.quantity; }); return o; };

(async () => {
  console.log('Migración del borrador local');
  await test('Test B: el borrador local de 31 cartas se guarda en la cuenta sin perder ninguna', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    const c31 = {}; for (let i = 1; i <= 8; i++) c31['ST01-0' + String(i).padStart(2, '0')] = 4; c31['GD01-001'] = 3;
    d.decks.d123 = { name: 'Zaku Damage', cards: cards(c31) }; d.activeId = 'd123';
    await d.sync.start(d.user);
    eq(S.decks.length, 1); eq(S.decks[0].name, 'Zaku Damage');
    eq(serverCards(S, S.decks[0].id), c31);
    ok(DeckSync.isUuid(d.activeId), 'el mazo local pasa a usar el id del servidor');
    ok(!d.decks.d123, 'el id local desaparece');
    eq(d.sync.state().phase, 'saved');
  });
  await test('la migración es idempotente: repetirla no duplica el mazo', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.d9 = { name: 'X', cards: { 'ST01-001': 4 } }; d.activeId = 'd9';
    // simula que la respuesta del primer intento se perdió: el servidor creó el mazo pero el cliente sigue con su id local
    await S.client('u1').rpc('create_deck', { p_name: 'X', p_description: null, p_cards: [{ cardNumber: 'ST01-001', quantity: 4, board: 'main' }], p_temp_id: 'd9' });
    await d.sync.start(d.user);
    eq(S.decks.length, 1, 'un solo mazo en el servidor');
    ok(DeckSync.isUuid(d.activeId));
  });
  await test('un mazo vacío con nombre por defecto no se crea en el servidor', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.d1 = { name: 'Mazo 1', cards: {} }; d.activeId = 'd1';
    await d.sync.start(d.user);
    eq(S.decks.length, 0);
    d.decks.d1.cards['ST01-001'] = 1; d.sync.touch(); await d.run();
    eq(S.decks.length, 1, 'al añadir una carta ya se guarda (1/50 es guardable)');
  });
  await test('Test C/E: se guardan mazos incompletos e ilegales (guardar nunca depende de la legalidad)', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Incompleto', cards: { 'ST01-001': 4 } }; d.decks.b = { name: 'Corsica x3', cards: { 'GD01-050': 3 } };
    for (let i = 0; i < 12; i++) d.decks.b.cards['ST02-0' + String(i + 10)] = 4; d.decks.b.cards['GD01-050'] = 2;   // 50 cartas
    d.activeId = 'a'; await d.sync.start(d.user);
    eq(S.decks.length, 2);
    eq(S.decks.find((x) => x.name === 'Incompleto').status, 'draft');
    eq(S.decks.find((x) => x.name === 'Corsica x3').status, 'complete');
  });

  console.log('Autosave');
  await test('Test F: añadir una carta se guarda aparte, sube la revisión y queda "saved"', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Zaku', cards: { 'ST01-001': 4 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId, rev0 = d.decks[id].remote.revision;
    d.decks[id].cards['ST01-002'] = 1; d.sync.touch();
    eq(d.sync.state().phase, 'pending', 'cambio pendiente antes del debounce');
    await d.run();
    eq(serverCards(S, id)['ST01-002'], 1); ok(d.decks[id].remote.revision > rev0, 'revisión sube');
    eq(d.sync.state().phase, 'saved');
  });
  await test('el debounce agrupa varias pulsaciones rápidas en un solo guardado', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Zaku', cards: { 'ST01-001': 1 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId; S.calls.length = 0;
    for (let q = 2; q <= 4; q++) { d.decks[id].cards['ST01-001'] = q; d.sync.touch(); }
    await d.run();
    eq(S.calls.filter((c) => c === 'rpc.replace_deck_cards').length, 1, 'un único guardado agregado');
    eq(serverCards(S, id)['ST01-001'], 4);
  });
  await test('cantidad 0 borra la fila (no se guarda quantity = 0)', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 4, 'ST01-002': 2 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId; delete d.decks[id].cards['ST01-002']; d.sync.touch(); await d.run();
    eq(serverCards(S, id), { 'ST01-001': 4 }); ok(!S.cards.some((c) => c.quantity <= 0));
  });
  await test('renombrar, descripción y favorito se guardan sin tocar las cartas', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 4 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId; S.calls.length = 0;
    d.decks[id].name = 'Zaku Damage'; d.decks[id].description = 'Aggro'; d.decks[id].favorite = true; d.sync.touch(); await d.run();
    const row = S.decks[0]; eq([row.name, row.description, row.is_favorite], ['Zaku Damage', 'Aggro', true]);
    ok(S.calls.indexOf('rpc.replace_deck_cards') === -1, 'no reenvía las cartas');
  });
  await test('Test J: archivar saca el mazo de la lista normal y lo marca en el servidor', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 4 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId; d.archived[id] = d.decks[id]; delete d.decks[id]; d.activeId = null; d.sync.touch(); await d.run();
    eq(S.decks[0].is_archived, true);
    const d2 = makeDevice(S, 'u1'); await d2.sync.start(d2.user);
    ok(d2.archived[id] && !d2.decks[id], 'en otro dispositivo aparece como archivado');
    // restaurar
    d.decks[id] = d.archived[id]; delete d.archived[id]; d.sync.touch(); await d.run();
    eq(S.decks[0].is_archived, false);
  });
  await test('eliminar es un borrado lógico y desaparece en los demás dispositivos', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1'), e = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 4 } }; d.activeId = 'a'; await d.sync.start(d.user);
    await e.sync.start(e.user); const id = d.activeId; ok(e.decks[id]);
    delete d.decks[id]; d.activeId = null; d.sync.touch(); await d.run();
    ok(S.decks[0].deleted_at, 'deleted_at relleno, la fila sigue en la base');
    await e.sync.start(e.user); ok(!e.decks[id], 'ya no aparece');
  });

  console.log('Red, sesión y conflictos');
  await test('Test G: sin red el cambio local se conserva, queda pendiente y se envía al volver', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 1 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId; S.offline = true;
    d.decks[id].cards['ST01-001'] = 3; d.sync.touch(); await d.run();
    eq(d.sync.state().phase, 'offline'); eq(d.decks[id].cards['ST01-001'], 3, 'el cambio local sigue ahí');
    ok(d.sync.isDirtyDeck(id), 'sigue marcado como pendiente'); eq(serverCards(S, id)['ST01-001'], 1, 'el servidor aún no lo tiene');
    S.offline = false; await d.sync.retry();
    eq(serverCards(S, id)['ST01-001'], 3); eq(d.sync.state().phase, 'saved');
  });
  await test('sesión caducada: no se pierde nada y el estado pide iniciar sesión', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 1 } }; d.activeId = 'a'; await d.sync.start(d.user);
    const id = d.activeId; S.authFail = true; d.decks[id].cards['ST01-001'] = 2; d.sync.touch(); await d.run();
    eq(d.sync.state().phase, 'signedout'); eq(d.decks[id].cards['ST01-001'], 2);
  });
  await test('Test M: dos dispositivos, el segundo no pisa la revisión del primero (409)', async () => {
    const S = makeServer(), A = makeDevice(S, 'u1'), B = makeDevice(S, 'u1');
    A.decks.a = { name: 'Z', cards: { 'ST01-001': 4 } }; A.activeId = 'a'; await A.sync.start(A.user);
    const id = A.activeId; await B.sync.start(B.user);
    B.decks[id].cards['ST01-001'] = 2; B.sync.touch(); await B.run();            // B guarda primero
    A.decks[id].cards['ST01-001'] = 1; A.decks[id].cards['ST01-009'] = 1; A.sync.touch(); await A.run();
    eq(A.sync.state().phase, 'conflict', 'conflicto detectado');
    eq(serverCards(S, id), { 'ST01-001': 2 }, 'el servidor conserva lo de B, no se sobrescribe');
    eq(A.decks[id].cards['ST01-001'], 1, 'lo local de A no se descarta solo');
    await A.sync.reloadDeck(id);
    eq(A.decks[id].cards, { 'ST01-001': 2 }, 'recargar última versión adopta la del servidor');
    eq(A.sync.state().phase, 'saved');
  });
  await test('Test H: entrar desde otro dispositivo muestra el mismo mazo y se propaga un cambio', async () => {
    const S = makeServer(), PC = makeDevice(S, 'u1'), MOV = makeDevice(S, 'u1');
    PC.decks.a = { name: 'Zaku', cards: { 'ST01-001': 4, 'ST01-002': 2 } }; PC.activeId = 'a'; await PC.sync.start(PC.user);
    await MOV.sync.start(MOV.user);
    const id = PC.activeId; eq(MOV.decks[id].cards, { 'ST01-001': 4, 'ST01-002': 2 }); eq(MOV.decks[id].name, 'Zaku');
    MOV.decks[id].cards['ST01-003'] = 1; MOV.sync.touch(); await MOV.run();
    await PC.sync.start(PC.user); eq(PC.decks[id].cards['ST01-003'], 1, 'el PC lo ve al sincronizar');
  });
  await test('Test K: un usuario no puede leer ni modificar el mazo de otro', async () => {
    const S = makeServer(), A = makeDevice(S, 'uA'), B = makeDevice(S, 'uB');
    A.decks.a = { name: 'Privado', cards: { 'ST01-001': 4 } }; A.activeId = 'a'; await A.sync.start(A.user);
    const id = A.activeId; await B.sync.start(B.user);
    ok(!B.decks[id], 'B no ve el mazo de A');
    const r = await S.client('uB').rpc('replace_deck_cards', { p_deck: id, p_cards: [], p_expected_revision: null });
    eq(r.error.code, 'PT404'); eq(serverCards(S, id), { 'ST01-001': 4 }, 'sin cambios');
  });
  await test('el mazo activo se recuerda entre dispositivos y no se restaura uno borrado', async () => {
    const S = makeServer(), A = makeDevice(S, 'u1');
    A.decks.a = { name: 'Uno', cards: { 'ST01-001': 1 } }; A.decks.b = { name: 'Dos', cards: { 'ST01-002': 1 } }; A.activeId = 'b';
    await A.sync.start(A.user);
    const dos = Object.keys(A.decks).find((k) => A.decks[k].name === 'Dos'); A.activeId = dos; A.sync.touch(); await A.run();
    const B = makeDevice(S, 'u1'); await B.sync.start(B.user); eq(B.activeId, dos, 'B abre el último mazo activo');
  });
  await test('al cerrar sesión se puede limpiar y el estado vuelve a signedout', async () => {
    const S = makeServer(), d = makeDevice(S, 'u1');
    d.decks.a = { name: 'Z', cards: { 'ST01-001': 1 } }; d.activeId = 'a'; await d.sync.start(d.user);
    d.sync.stop(); eq(d.sync.state().phase, 'signedout'); d.sync.touch();                      // tocar sin sesión no hace nada ni lanza
    eq(S.calls.filter((c) => c === 'rpc.replace_deck_cards').length, 0);
  });
  await test('clasificación de errores', async () => {
    eq(DeckSync.classify({ code: 'PT409', message: 'revision_conflict' }), 'conflict');
    eq(DeckSync.classify({ code: 'PT404', message: 'deck_not_found' }), 'gone');
    eq(DeckSync.classify({ message: 'JWT expired', status: 401 }), 'auth');
    eq(DeckSync.classify({ message: 'TypeError: Failed to fetch' }), 'offline');
    eq(DeckSync.classify({ code: '23514', message: 'check violation' }), 'error');
  });

  console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
  process.exit(failed ? 1 : 0);
})();
