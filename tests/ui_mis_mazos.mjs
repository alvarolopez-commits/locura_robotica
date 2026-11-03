// Prueba de interfaz: Mis mazos (ventana del mazo y detalle) — orden de las filas, selección de cartas para "Copiar lista",
// botón + (azul / lleno), "Guardado" y "COLORES" fuera, y "Comparar →" unificado.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_mis_mazos.mjs
import fs from 'node:fs';
const fake = fs.readFileSync(new URL('./fake_supabase.js', import.meta.url), 'utf8');
const all = JSON.parse(fs.readFileSync(new URL('../data/all_cards.json', import.meta.url), 'utf8'));
const byNum = Object.fromEntries(all.map((c) => [c.number, c]));
const dig = (v) => { const m = String(v ?? '').match(/\d+/); return m ? parseInt(m[0], 10) : -1; };
const numAsc = (x, y) => { const a = dig(x), b = dig(y); if (a < 0 || b < 0) return a < 0 && b < 0 ? 0 : (a < 0 ? 1 : -1); return a - b; };
const orden = (a, b) => numAsc(byNum[a].lv, byNum[b].lv) || numAsc(byNum[a].ap, byNum[b].ap) || a.localeCompare(b, undefined, { numeric: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push(d.params.exceptionDetails.exception?.description?.slice(0, 160)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: r.result.exceptionDetails.exception?.description?.slice(0, 160) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: fake + `;
(function(){
  var S = FakeSupabase.makeServer(); window.__S = S; var session = null, listeners = [];
  Object.defineProperty(window, 'SUPABASE_CONFIG', { value: { url: 'https://fake.supabase.co', anonKey: 'fake' }, writable: false });
  window.supabase = { createClient: function(){ var c = S.client('u1'); c.auth = {
    getSession: function(){ return Promise.resolve({ data: { session: session } }); },
    onAuthStateChange: function(cb){ listeners.push(cb); return { data: { subscription: {} } }; },
    signInWithOtp: function(){ return Promise.resolve({ error: null }); }, signInWithPassword: function(){ return Promise.resolve({ error: null }); },
    signOut: function(){ session = null; listeners.forEach(function(cb){ cb('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); } }; return c; } };
  window.__login = function(){ session = { user: { id: 'u1', email: 'prueba@example.com' } }; listeners.forEach(function(cb){ cb('SIGNED_IN', session); }); };
})();` });

// mazo de prueba con cartas reales: niveles repetidos, ataques iguales y cartas sin ataque ("-")
const D1 = { 'ST08-009': 2, 'ST01-008': 3, 'ST05-003': 1, 'ST03-005': 4, 'ST06-008': 2, 'GD02-011': 1, 'GD05-107': 1, 'ST03-013': 2, 'ST01-012': 1, 'ST03-012': 3, 'ST01-016': 2, 'ST07-015': 1, 'ST01-010': 2, 'ST01-011': 3, 'ST02-010': 1 };
const c50 = {}; for (let i = 1; i <= 12; i++) c50['ST01-' + String(i).padStart(3, '0')] = 4; c50['ST01-013'] = 2;
const TIPO = { Unidades: 'UNIT', Pilotos: 'PILOT', Bases: 'BASE', Comandos: 'COMMAND' };
async function abrir(W, H, decks, active) {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`localStorage.clear(); sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); localStorage.setItem('msa_decks', JSON.stringify(${JSON.stringify(decks)})); localStorage.setItem('msa_active_deck','${active || 'd1'}'); localStorage.setItem('msa_building','1'); 1`);
  await send('Page.reload'); await sleep(4500);
}
const abrirMazo = async () => { await ev(`document.getElementById('deckCount').click(); 1`); await sleep(1400); };
const filas = () => ev(`(function(){ var out = {}; document.querySelectorAll('#deckView section.dv-color').forEach(function(s){ out[s.querySelector('.dv-cname').textContent] = [].map.call(s.querySelectorAll('.dv-row'), function(r){ return r.querySelector('.dv-pick').dataset.key.split('|')[0] }) }); return out })()`);
const tecla = async (key, code, vk, text) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk }); };
const btn = (n, k) => `document.querySelector('#deckView [data-key="${n}|${k}"]')`;
const stubCopiar = () => ev(`window.__c = null; navigator.clipboard.writeText = function(t){ window.__c = t; return Promise.resolve() }; 1`);

console.log('\n== 390×844 · orden de las filas ==');
await abrir(390, 844, { d1: { name: 'Prueba', cards: D1 } });
await abrirMazo();
let f = await filas();
const esperado = (tipo) => Object.keys(D1).filter((n) => byNum[n].type === tipo).sort(orden);
for (const [rot, tipo] of Object.entries(TIPO)) check('"' + rot + '": nivel de menor a mayor, después ataque y después número de carta', JSON.stringify(f[rot]) === JSON.stringify(esperado(tipo)), { dom: f[rot], esperado: esperado(tipo) });
check('las cartas sin ataque ("-") van detrás de las que tienen ataque en el mismo nivel', f.Unidades.indexOf('ST01-008') < f.Unidades.indexOf('ST05-003') && f.Unidades.indexOf('ST03-005') < f.Unidades.indexOf('ST08-009'), f.Unidades);
check('el nivel 10 va después del 2 (orden numérico, no de texto)', f.Comandos.indexOf('ST03-012') < f.Comandos.indexOf('GD05-107') && f.Comandos[f.Comandos.length - 1] === 'GD05-107', f.Comandos);
check('cada carta sigue en una sola fila con su cantidad real', (await ev(`[].map.call(document.querySelectorAll('#deckView .dv-row'), function(r){ return r.querySelector('.dv-qty').textContent }).join(',')`)).split(',').length === 15);
const totalAntes = await ev(`document.getElementById('dvCountTxt').textContent`);
await ev(`${btn('ST03-005', 'm')}.click(); ${btn('ST01-008', 'p')}.click(); 1`); await sleep(500);
f = await filas();
check('los tipos van en este orden: Unidades, Pilotos, Comandos, Bases', JSON.stringify(Object.keys(f)) === JSON.stringify(['Unidades', 'Pilotos', 'Comandos', 'Bases']), Object.keys(f));
check('tras sumar y quitar copias el orden se conserva en todos los tipos', Object.entries(TIPO).every(([rot, tipo]) => JSON.stringify(f[rot]) === JSON.stringify(esperado(tipo))), f);
await ev(`${btn('GD05-107', 'm')}.click(); 1`); await sleep(500);
f = await filas();
check('al quitar la última copia de una carta su fila desaparece y los demás siguen ordenados', !f.Comandos.includes('GD05-107') && JSON.stringify(f.Comandos) === JSON.stringify(esperado('COMMAND').filter((n) => n !== 'GD05-107')), f.Comandos);
await send('Page.reload'); await sleep(4500); await abrirMazo(); f = await filas();
check('tras recargar el orden es el mismo', JSON.stringify(f.Unidades) === JSON.stringify(esperado('UNIT')), f.Unidades);

console.log('\n== "COLORES", "Guardado" y "Comparar →" ==');
const NOMBRE = { Blue: 'Azul', Green: 'Verde', Red: 'Rojo', Purple: 'Morado', White: 'Blanco' };
const cuentaColores = (mazo) => { const o = {}; for (const [n, q] of Object.entries(mazo)) o[byNum[n].color] = (o[byNum[n].color] || 0) + q; return o; };
const mazoAhora = JSON.parse(await ev(`localStorage.getItem('msa_decks')`)).d1.cards;   // ya se sumaron y quitaron copias
const esperadoColores = Object.entries(cuentaColores(mazoAhora)).map(([c, q]) => NOMBRE[c] + ' · ' + q).sort();
const col = await ev(`(function(){ var h=document.getElementById('dvColors'), pips=h ? [].slice.call(h.querySelectorAll('.dd-pip')) : [], hr=h ? h.getBoundingClientRect() : null, tt=document.getElementById('dvName').getBoundingClientRect();
  return { rotulo: !!document.querySelector('#deckView .dv-sub'), viejo: !!document.querySelector('#deckView .dp-chip, #deckView .dv-split'), visible: !!h && !h.hidden, texto: h ? h.textContent.trim() : null, n: pips.length, aria: pips.map(function(p){ return p.getAttribute('aria-label') }), titles: pips.map(function(p){ return p.title }), lado: !!hr && hr.left >= tt.right - 2 && Math.abs((hr.top + hr.bottom) / 2 - (tt.top + tt.bottom) / 2) < 30, w: pips[0] ? Math.round(pips[0].getBoundingClientRect().width) : 0, h: pips[0] ? Math.round(pips[0].getBoundingClientRect().height) : 0, bgs: pips.map(function(p){ return getComputedStyle(p).backgroundColor }), grupo: h && h.getAttribute('role') } })()`);
check('los colores del mazo van junto al título como cuadrados, sin texto, uno por color', col.visible && col.texto === '' && col.n === esperadoColores.length && col.w >= 14 && col.w === col.h && col.lado, col);
check('cada cuadrado tiene el color de las cartas y conserva su nombre y cantidad en la etiqueta y el tooltip', JSON.stringify([...col.aria].sort()) === JSON.stringify(esperadoColores) && JSON.stringify([...col.titles].sort()) === JSON.stringify(esperadoColores) && new Set(col.bgs).size === col.n && col.grupo === 'group', col);
check('el rótulo "COLORES" y los chips con texto ya no existen', col.rotulo === false && col.viejo === false, col);

console.log('\n== selección de cartas para "Copiar lista" ==');
await stubCopiar();
const decksJson = () => ev(`localStorage.getItem('msa_decks')`);
const base = { decks: await decksJson(), total: await ev(`document.getElementById('dvCountTxt').textContent`), pill: await ev(`document.getElementById('deckPillCount').textContent`) };
const picks = await ev(`[].map.call(document.querySelectorAll('#deckView .dv-pick'), function(b){ return b.getAttribute('aria-pressed') })`);
const pick0 = await ev(`(function(){ var b=document.querySelector('#deckView .dv-pick'), cs=getComputedStyle(b); return { bg: cs.backgroundColor, borde: cs.borderTopStyle, forma: cs.borderRadius, w: Math.round(b.getBoundingClientRect().width) } })()`);
check('seleccionada (por defecto) se ve rellena en el azul de acento, como el resto de controles redondos de la fila', pick0.bg === 'rgb(139, 205, 255)' && pick0.borde === 'solid' && pick0.w === 32, pick0);
check('por defecto todas las cartas están seleccionadas (aria-pressed=true) en todos los tipos', picks.length === 14 && picks.every((p) => p === 'true'), picks);
await ev(`document.getElementById('dvCopy').click(); 1`); await sleep(300);
const copiaTodo = await ev(`window.__c`);
const nombres = (n) => byNum[n].name;
const incluida = (txt, n, q) => txt.includes(`${q}x ${nombres(n)} (${n})`);
check('con todas seleccionadas se copia la lista entera con las cantidades reales', Object.keys(D1).filter((n) => n !== 'GD05-107').every((n) => incluida(copiaTodo, n, n === 'ST03-005' ? 3 : n === 'ST01-008' ? 4 : D1[n])), copiaTodo && copiaTodo.slice(0, 120));
await sleep(1600);
await ev(`${btn('ST03-005', 's')}.click(); 1`); await sleep(200);
const p1 = await ev(`(function(){ var b=${btn('ST03-005', 's')}; return { pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('is-on'), texto: b.textContent.trim(), title: b.title, aria: b.getAttribute('aria-label'), borde: getComputedStyle(b).borderTopStyle, bg: getComputedStyle(b).backgroundColor, icono: !!b.querySelector('.ico-select') } })()`);
check('el botón de seleccionar es solo el icono (sin texto) y, al deseleccionar, cambia de relleno a borde discontinuo y se anuncia con el nombre de la carta', p1.pressed === 'false' && p1.on === false && p1.texto === '' && p1.icono && p1.borde === 'dashed' && p1.bg === 'rgba(0, 0, 0, 0)' && /Fuera de la lista/.test(p1.title) && p1.aria.includes(nombres('ST03-005')), p1);
check('seleccionar no toca el mazo: ni el guardado local, ni el contador, ni la cabecera', (await decksJson()) === base.decks && (await ev(`document.getElementById('dvCountTxt').textContent`)) === base.total && (await ev(`document.getElementById('deckPillCount').textContent`)) === base.pill);
await stubCopiar(); await ev(`document.getElementById('dvCopy').click(); 1`); await sleep(300);
const copia2 = await ev(`window.__c`);
check('la carta deseleccionada (3 copias) queda fuera de la lista copiada por completo y el resto sigue con sus cantidades', !copia2.includes(byNum['ST03-005'].name + ' (ST03-005)') && incluida(copia2, 'ST01-008', 4) && incluida(copia2, 'ST03-012', 3), copia2.slice(0, 200));
check('el total del texto copiado refleja solo lo copiado', new RegExp('/50$').test(copia2) && /(\d+)\/50$/.exec(copia2)[1] === String(Object.keys(D1).filter((n) => n !== 'GD05-107' && n !== 'ST03-005').reduce((a, n) => a + (n === 'ST01-008' ? 4 : D1[n]), 0)), copia2.slice(-30));
check('y la carta sigue en el mazo con sus copias (el contador no cambia)', (await ev(`${btn('ST03-005', 'm')}.closest('.dv-row').querySelector('.dv-qty').textContent`)) === '3');
await ev(`${btn('ST03-005', 's')}.click(); 1`); await sleep(200); await stubCopiar(); await sleep(1600); await ev(`document.getElementById('dvCopy').click(); 1`); await sleep(300);
check('volver a seleccionarla la incluye con su cantidad real', incluida(await ev(`window.__c`), 'ST03-005', 3));
// teclado
await ev(`${btn('ST01-016', 's')}.focus(); 1`); await tecla('Enter', 'Enter', 13, '\r'); await sleep(200);
check('el botón de selección funciona con el teclado (Intro)', (await ev(`${btn('ST01-016', 's')}.getAttribute('aria-pressed')`)) === 'false');
await ev(`${btn('ST01-016', 's')}.focus(); 1`); await tecla(' ', 'Space', 32, ' '); await sleep(200);
check('y con la barra espaciadora', (await ev(`${btn('ST01-016', 's')}.getAttribute('aria-pressed')`)) === 'true');
// sin ninguna carta seleccionada
await ev(`[].forEach.call(document.querySelectorAll('#deckView .dv-pick'), function(b){ if(b.getAttribute('aria-pressed') === 'true') b.click(); }); 1`); await sleep(200);
await sleep(1500); await stubCopiar(); await ev(`document.getElementById('dvCopy').click(); 1`); await sleep(400);
const nada = await ev(`({ copiado: window.__c, nota: document.getElementById('dvCopyNote').textContent, visible: !document.getElementById('dvCopyNote').hidden, live: document.getElementById('deckLive').textContent })`);
check('sin ninguna carta seleccionada no se copia nada y se avisa: "Selecciona al menos una carta"', nada.copiado === null && nada.nota === 'Selecciona al menos una carta' && nada.visible && nada.live === 'Selecciona al menos una carta', nada);
await ev(`[].forEach.call(document.querySelectorAll('#deckView .dv-pick'), function(b){ if(b.getAttribute('aria-pressed') === 'false') b.click(); }); 1`); await sleep(200);
// quitar una carta del mazo y volver a añadirla: vuelve seleccionada
await ev(`${btn('ST01-012', 's')}.click(); ${btn('ST01-012', 'm')}.click(); 1`); await sleep(500);
check('una carta quitada del mazo deja de figurar entre las seleccionables', (await ev(`!${btn('ST01-012', 's')}`)) === true);
await ev(`document.getElementById('dvBack').click(); 1`); await sleep(800);
await ev(`(function(){ var e=document.getElementById('searchMain'); e.value='ST01-012'; e.dispatchEvent(new Event('input',{bubbles:true})) })()`); await sleep(900);
await ev(`document.querySelector('#grid .adder[data-number="ST01-012"] .ad-plus').click(); 1`); await sleep(400);
await abrirMazo();
check('al volver a añadirla aparece seleccionada por defecto', (await ev(`${btn('ST01-012', 's')}.getAttribute('aria-pressed')`)) === 'true');
// selecciones separadas por mazo
await abrir(390, 844, { d1: { name: 'Uno', cards: { 'ST01-008': 2, 'ST01-011': 1 } }, d2: { name: 'Dos', cards: { 'ST01-008': 3, 'ST01-011': 2 } } });
await abrirMazo(); await ev(`${btn('ST01-008', 's')}.click(); 1`); await sleep(200);
await ev(`(function(){ var s=document.getElementById('dvSelect'); s.value='d2'; s.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(900);
check('al cambiar de mazo la selección de uno no pasa al otro', (await ev(`${btn('ST01-008', 's')}.getAttribute('aria-pressed')`)) === 'true');
await ev(`(function(){ var s=document.getElementById('dvSelect'); s.value='d1'; s.dispatchEvent(new Event('change',{bubbles:true})) })()`); await sleep(900);
check('y al volver al primero se conserva lo que había seleccionado', (await ev(`${btn('ST01-008', 's')}.getAttribute('aria-pressed')`)) === 'false');

console.log('\n== botón + ==');
await abrir(390, 844, { d1: { name: 'Prueba', cards: D1 } }); await abrirMazo();
const mas = (n) => ev(`(function(){ var b=${btn(n, 'p')}, cs=getComputedStyle(b); return { dis: b.disabled, lleno: b.classList.contains('is-full'), icono: !!b.querySelector('.ico-full'), bg: cs.backgroundColor, color: cs.color, borde: cs.borderTopColor, aria: b.getAttribute('aria-label'), title: b.title } })()`);
let m3 = await mas('ST01-008');
check('con 3 copias y sitio en el mazo el + está habilitado y usa el azul de acento (no el verde)', m3.dis === false && m3.lleno === false && m3.bg === 'rgb(139, 205, 255)' && m3.aria === 'Añadir una copia de ' + nombres('ST01-008'), m3);
let m4 = await mas('ST03-005');
check('con 4 copias el + queda bloqueado con el icono y el color de "lleno", y explica el motivo', m4.dis === true && m4.lleno && m4.icono && m4.color === 'rgb(155, 227, 180)' && /Límite alcanzado/.test(m4.title) && /Límite alcanzado/.test(m4.aria), m4);
await ev(`${btn('ST03-005', 'p')}.click(); 1`); await sleep(300);
check('pulsarlo deshabilitado no cambia el mazo', (await ev(`${btn('ST03-005', 'm')}.closest('.dv-row').querySelector('.dv-qty').textContent`)) === '4');
const minus = await ev(`(function(){ var b=${btn('ST03-005', 'm')}; return { aria: b.getAttribute('aria-label'), dis: b.disabled } })()`);
const sinPick = await ev(`(function(){ var b=${btn('ST03-005', 'd')}; return b.getAttribute('aria-label') })()`);
check('− y papelera conservan su función y sus etiquetas', minus.aria === 'Quitar una copia de ' + nombres('ST03-005') && minus.dis === false && /\S/.test(sinPick), [minus, sinPick]);
await abrir(390, 844, { d1: { name: 'Lleno', cards: c50 } }); await abrirMazo();
const l50 = await mas('ST01-013');
check('con 50 cartas el + de una carta con 2 copias también queda bloqueado como "mazo lleno"', l50.dis === true && l50.lleno && l50.icono && /Mazo lleno/.test(l50.title), l50);
await ev(`${btn('ST01-013', 'p')}.click(); 1`); await sleep(300);
check('y no se puede superar 50 / 50', (await ev(`document.getElementById('dvCountTxt').textContent`)) === '50 / 50');
const cmp = await ev(`(function(){ function d(id){ var b=document.getElementById(id), cs=getComputedStyle(b), r=b.getBoundingClientRect(); return b ? { clase: b.className, texto: b.querySelector('.lblCompare').textContent, flecha: !!b.querySelector('svg.cmp-arrow'), bg: cs.backgroundColor, color: cs.color, alto: Math.round(r.height), visible: !b.hidden && r.width > 0 } : null } return { dv: d('dvCompare'), bb: d('bbCompare') } })()`);
check('"Comparar →" en la ventana del mazo es el botón claro (blanco, texto navy, flecha) de 44 px', cmp.dv.visible && /cmp-btn/.test(cmp.dv.clase) && cmp.dv.texto === 'Comparar' && cmp.dv.flecha && cmp.dv.bg === 'rgb(255, 255, 255)' && cmp.dv.alto >= 44, cmp.dv);
check('y es el mismo componente que el de la barra del mazo (misma clase, color y flecha)', /cmp-btn/.test(cmp.bb.clase) && cmp.bb.flecha && cmp.bb.bg === cmp.dv.bg && cmp.bb.color === cmp.dv.color, cmp.bb);
check('hay un solo "Comparar" en la ventana del mazo', (await ev(`document.querySelectorAll('#deckView .lblCompare').length`)) === 1);
await ev(`document.getElementById('dvCompare').click(); 1`); await sleep(1500);
check('al pulsarlo se abre Comparar mazos con este mazo', (await ev(`!document.getElementById('metaPage').hidden`)) === true);

console.log('\n== detalle del mazo en Mis mazos ==');
await abrir(390, 844, { d1: { name: 'Lleno', cards: c50 }, d2: { name: 'Prueba', cards: D1 } });
await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(1300);
await ev(`document.querySelector('#dpGrid .dp-deck').click(); 1`); await sleep(1200);
const dpb = await ev(`(function(){ function d(id){ var b=document.getElementById(id), r=b.getBoundingClientRect(); return { texto: b.textContent.replace(/\\s+/g,' ').trim(), aria: b.getAttribute('aria-label'), title: b.title, icono: !!b.querySelector('.ico, svg'), w: Math.round(r.width), h: Math.round(r.height) } } return { copiar: d('dpCopy'), eliminar: d('dpDelete'), comparar: d('dpCompare'), anadir: d('dpAddCards'), pick: document.querySelectorAll('#dpRows .dv-pick').length } })()`);
check('"Copiar lista" del detalle es solo el icono, con su etiqueta accesible y 44 px o más', dpb.copiar.texto === '' && dpb.copiar.icono && dpb.copiar.aria === 'Copiar lista' && dpb.copiar.title === 'Copiar lista' && dpb.copiar.w >= 44 && dpb.copiar.h >= 44, dpb.copiar);
const dpCol = await ev(`(function(){ var h=document.getElementById('dpColors'), pips=h ? [].slice.call(h.querySelectorAll('.dd-pip')) : [], hr=h.getBoundingClientRect(), nm=document.getElementById('dpName').getBoundingClientRect(); return { n: pips.length, texto: h.textContent.trim(), aria: pips.map(function(p){ return p.getAttribute('aria-label') }), lado: hr.left >= nm.right - 2 && Math.abs((hr.top + hr.bottom) / 2 - (nm.top + nm.bottom) / 2) < 30, meta: document.getElementById('dpDeckMeta').textContent.trim() } })()`);
check('en el detalle de Mis mazos los colores también van junto al título, como cuadrados sin texto, y la línea de cartas ya no repite "2 colores"', dpCol.n === Object.keys(cuentaColores(c50)).length && dpCol.texto === '' && dpCol.lado && /^50\/50 cartas$/.test(dpCol.meta) && JSON.stringify([...dpCol.aria].sort()) === JSON.stringify(Object.entries(cuentaColores(c50)).map(([c, q]) => NOMBRE[c] + ' · ' + q).sort()), dpCol);
check('"Eliminar mazo" del detalle es solo el icono, con su etiqueta accesible y 44 px o más', dpb.eliminar.texto === '' && dpb.eliminar.icono && dpb.eliminar.aria === 'Eliminar mazo' && dpb.eliminar.w >= 44 && dpb.eliminar.h >= 44, dpb.eliminar);
check('el detalle también lleva el botón de seleccionar en cada fila y "Comparar →" claro', dpb.pick > 5 && /Comparar/.test(dpb.comparar.texto) && (await ev(`/cmp-btn/.test(document.getElementById('dpCompare').className) && getComputedStyle(document.getElementById('dpCompare')).backgroundColor`)) === 'rgb(255, 255, 255)', dpb);
await stubCopiar(); await ev(`document.getElementById('dpCopy').click(); 1`); await sleep(400);
const dpc = await ev(`({ txt: window.__c, aria: document.getElementById('dpCopy').getAttribute('aria-label'), check: !!document.querySelector('#dpCopy svg') })`);
check('copiar desde el detalle copia la lista y el icono confirma con el check', (dpc.txt || '').length > 100 && /Lleno/.test(dpc.txt) && dpc.check && /opiad/.test(dpc.aria), dpc);
await sleep(1700);
const sinDp = await ev(`(function(){ var k=document.querySelector('#dpRows .dv-pick').dataset.key.split('|')[0]; [].forEach.call(document.querySelectorAll('#dpRows .dv-pick'), function(b){ if(b.getAttribute('aria-pressed') === 'true') b.click(); }); window.__c = null; document.getElementById('dpCopy').click(); return { copiado: window.__c, nota: document.getElementById('dpCopyNote').textContent, visible: !document.getElementById('dpCopyNote').hidden, total: document.getElementById('dpCount') ? document.getElementById('dpCount').textContent : null } })()`);
check('en el detalle, sin ninguna carta seleccionada no se copia y avisa "Selecciona al menos una carta"', sinDp.copiado === null && sinDp.nota === 'Selecciona al menos una carta' && sinDp.visible, sinDp);

console.log('\n== "Guardado" (sesión simulada) ==');
await abrir(390, 844, { d1: { name: 'Prueba', cards: D1 } });
await ev(`window.__login(); 1`); await sleep(2500);
await abrirMazo(); await sleep(500);
const gs = await ev(`(function(){ var dv=document.querySelector('#deckView .save-state'), bb=document.querySelector('#buildBar .save-state, .buildBar .save-state'); return { dvQuiet: dv ? dv.dataset.quiet : null, dvEstado: dv ? dv.dataset.state : null, dvOculto: dv ? dv.hidden : null, dvVisible: dv ? getComputedStyle(dv).display !== 'none' : null, bbVisible: bb ? !bb.hidden : null } })()`);
const todos = await ev(`[].map.call(document.querySelectorAll('.save-state'), function(e){ return e.hidden || getComputedStyle(e).display === 'none' })`);
check('con la sesión iniciada y todo guardado, el "Guardado" no se ve en la ventana del mazo', gs.dvEstado === 'saved' && gs.dvOculto === true && gs.dvVisible === false, gs);
check('ni en ningún otro sitio de la app (barra del mazo, ficha, Mis mazos)', todos.length >= 3 && todos.every(Boolean), todos);
await ev(`window.__S.offline = true; ${btn('ST01-008', 'p')}.click(); 1`); await sleep(1800);
const gErr = await ev(`(function(){ var dv=document.querySelector('#deckView .save-state'); return { estado: dv.dataset.state, oculto: dv.hidden, texto: dv.textContent.trim() } })()`);
check('si el guardado falla, el aviso de error sí aparece (no se oculta una incidencia)', gErr.oculto === false && /offline|error/.test(gErr.estado), gErr);
await ev(`window.__S.offline = false; document.querySelector('#deckView .save-state').click(); 1`); await sleep(2500);
check('y cuando se recupera y se guarda, vuelve a ocultarse', (await ev(`document.querySelector('#deckView .save-state').hidden`)) === true);

console.log('\n== anchuras de móvil y escritorio ==');
for (const [W, H] of [[320, 700], [375, 812], [390, 844], [430, 932], [1280, 900]]) {
  await abrir(W, H, { d1: { name: 'Prueba', cards: D1 } }); await abrirMazo();
  const m = await ev(`(function(){
    function eff(e){ var r=e.getBoundingClientRect(), w=r.width, h=r.height, a=getComputedStyle(e,'::after'); if(a.content !== 'none' && a.position === 'absolute'){ var l=parseFloat(a.left), tp=parseFloat(a.top), rt=parseFloat(a.right), b=parseFloat(a.bottom); if(l<0) w-=l; if(rt<0) w-=rt; if(tp<0) h-=tp; if(b<0) h-=b; return { l:r.left-(l<0?-l:0), r:r.right+(rt<0?-rt:0), t:r.top-(tp<0?-tp:0), b:r.bottom+(b<0?-b:0), w:w, h:h } } return { l:r.left, r:r.right, t:r.top, b:r.bottom, w:w, h:h } }
    var row=document.querySelector('#deckView .dv-row'), cs=['dv-pick','dv-sbtn'].length, btns=[].slice.call(row.querySelectorAll('.dv-pick, .dv-sbtn')).map(eff), open=row.querySelector('.dv-open').getBoundingClientRect(), step=row.querySelector('.dv-step').getBoundingClientRect();
    var solape=false; for(var i=0;i<btns.length;i++) for(var j=i+1;j<btns.length;j++){ if(btns[i].l < btns[j].r - .5 && btns[j].l < btns[i].r - .5 && btns[i].t < btns[j].b - .5 && btns[j].t < btns[i].b - .5) solape = true; }
    return { n: btns.length, minW: Math.round(Math.min.apply(null, btns.map(function(b){ return b.w }))), minH: Math.round(Math.min.apply(null, btns.map(function(b){ return b.h }))), solape: solape, dosNiveles: step.top >= open.bottom - 2, scrollW: document.documentElement.scrollWidth, ancho: innerWidth, nombre: Math.round(open.width) } })()`);
  check(W + ' px: selección, −, + y papelera de 44×44 como mínimo, sin solaparse y sin desborde horizontal', m.n === 4 && m.minW >= 44 && m.minH >= 44 && !m.solape && m.scrollW <= m.ancho, m);
  check(W + ' px: ' + (W < 600 ? 'dos niveles (carta arriba, controles debajo)' : 'una sola línea'), W < 600 ? m.dosNiveles : !m.dosNiveles, m);
}
for (const W of [320, 375, 390]) {
  await abrir(W, 800, { d1: { name: 'Amuración', cards: D1 } }); await abrirMazo();
  const nm = await ev(`(function(){ var n=document.getElementById('dvName'), c=document.getElementById('dvColors').getBoundingClientRect(), r=n.getBoundingClientRect(), tools=document.querySelector('#deckView .dv-tools').getBoundingClientRect(); return { recortado: n.scrollWidth > n.clientWidth + 1, ancho: Math.round(r.width), colorAlLado: c.left >= r.right - 2 && Math.abs((c.top + c.bottom) / 2 - (r.top + r.bottom) / 2) < 30, scrollW: document.documentElement.scrollWidth, vw: innerWidth, estrellaYLapizJuntos: Math.abs(document.getElementById('dvStar').getBoundingClientRect().top - document.getElementById('dvPencil').getBoundingClientRect().top) < 2 } })()`);
  check(W + ' px: el nombre del mazo se lee entero ("Amuración"), los cuadrados de color van a su lado (en 320 px, justo debajo) y estrella y lápiz van juntos, sin desbordar', !nm.recortado && (W < 360 || nm.colorAlLado) && nm.estrellaYLapizJuntos && nm.scrollW <= nm.vw, nm);   // a 320 px con cinco colores no caben junto al nombre y bajan a su línea
}
for (const W of [320, 375]) {
  await abrir(W, 800, { d1: { name: 'Amuración', cards: D1 } });
  await ev(`document.getElementById('tbDecks').click(); 1`); await sleep(1300);
  await ev(`document.querySelector('#dpGrid .dp-deck').click(); 1`); await sleep(1200);
  const dn = await ev(`(function(){ var n=document.getElementById('dpName'), c=document.getElementById('dpColors').getBoundingClientRect(); return { recortado: n.scrollWidth > n.clientWidth + 1, coloresVisibles: c.width > 0 && c.right <= innerWidth, scrollW: document.documentElement.scrollWidth, vw: innerWidth } })()`);
  check(W + ' px: en el detalle el nombre ("Amuración") se lee entero con los cuadrados de color, sin desbordar', !dn.recortado && dn.coloresVisibles && dn.scrollW <= dn.vw, dn);
}
check('sin errores de consola', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
