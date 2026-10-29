// Prueba del sistema tipográfico: tokens, uso exclusivo de la tipografía Display en títulos protagonistas (MAYÚSCULAS) y roles de la escala en Inter.
// Uso: Chrome con --remote-debugging-port=9333 y la carpeta servida en http://localhost:8766/ ;  node tests/ui_typography_system.mjs
import fs from 'node:fs';
const decklists = JSON.parse(fs.readFileSync(new URL('../data/decklists.json', import.meta.url), 'utf8'));
const topDeck = decklists.archetypes[0].decks[0].cards;
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

const TOKENS = ['--font-display', '--font-sans', '--text-display-xl', '--text-display-lg', '--text-display-md', '--text-page-title', '--text-section-title', '--text-card-title', '--text-body', '--text-body-sm', '--text-caption', '--text-label', '--text-kpi'];
// Elementos a los que se les permite usar la tipografía Display (títulos protagonistas)
const PERMITIDOS = ".pageTitle h1, .dp-title:not(.dv-title), .sp-word";
const FUGAS = `(function(){ var ok = document.querySelectorAll(${JSON.stringify(PERMITIDOS)}); var set = new Set(ok); var malos = [];
  document.querySelectorAll('body *').forEach(function(e){ var cs = getComputedStyle(e); if(cs.display==='none' || e.getBoundingClientRect().width===0) return; if(!/Big Shoulders/.test(cs.fontFamily)) return;
    var dentro = false; for(var p=e; p; p=p.parentElement){ if(set.has(p)){ dentro = true; break; } }
    if(!dentro) malos.push((e.id? '#'+e.id : '') + '.' + String(e.className).split(' ').slice(0,2).join('.') + ' <' + e.tagName.toLowerCase() + '> "' + (e.textContent||'').trim().slice(0,22) + '"');
    else if(cs.textTransform !== 'uppercase') malos.push('SIN MAYÚSCULAS: ' + String(e.className).split(' ')[0] + ' "' + (e.textContent||'').trim().slice(0,22) + '"'); });
  return malos.slice(0, 12) })()`;
const rol = (sel) => ev(`(function(){ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var cs=getComputedStyle(e); var px=parseFloat(cs.fontSize); var lh = cs.lineHeight==='normal' ? 1.2 : parseFloat(cs.lineHeight)/px;
  return { fam:cs.fontFamily, peso:+cs.fontWeight, px:px, lh:Math.round(lh*100)/100, mayus:cs.textTransform, num:cs.fontVariantNumeric } })()`);
const esInter = (r) => r && /^"?Inter"?,/.test(r.fam) && r.fam.indexOf('Big Shoulders') === -1;
const enRango = (v, a, b) => v >= a && v <= b;

async function abrir(seed) {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200);
  await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(800);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','es'); ${seed} 1`);
  await send('Page.reload'); await sleep(3500);
}
const SEED = `localStorage.setItem('msa_decks', JSON.stringify({d1:{name:'GP Control',cards:${JSON.stringify(topDeck)}}})); localStorage.setItem('msa_active_deck','d1'); localStorage.setItem('msa_collection','["ST01-001","ST01-002","GD01-001"]');`;

for (const W of [390, 1280]) {
  console.log('\n== ancho ' + W + ' ==');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: 900, deviceScaleFactor: 1, mobile: W < 900 });
  await abrir(SEED);

  const tok = await ev(`${JSON.stringify(TOKENS)}.map(function(n){ return [n, getComputedStyle(document.documentElement).getPropertyValue(n).trim()] })`);
  check('existen los tokens del sistema tipográfico', tok.every((x) => x[1].length > 0), tok.filter((x) => !x[1]).map((x) => x[0]));
  const body = await rol('body');
  check('Body: Inter 400 con interlineado 1,5–1,65', esInter(body) && body.peso === 400 && enRango(body.lh, 1.5, 1.65), body);

  // pantalla de inicio
  const h1 = await rol('.pageTitle h1');
  check('Título de portada: Display en MAYÚSCULAS, 40–64 px, interlineado 1,0–1,15', h1 && /Big Shoulders/.test(h1.fam) && h1.mayus === 'uppercase' && enRango(h1.px, 34, 64) && enRango(h1.lh, 1.0, 1.15), h1);
  check('la tipografía Display no se usa fuera de los títulos protagonistas', JSON.stringify(await ev(FUGAS)) === '[]', await ev(FUGAS));
  const btn = await rol('.pa-btn'), nav = await rol('#tabbar .tb-item');
  check('Botones: Inter 600, 14–15 px', esInter(btn) && btn.peso >= 600 && enRango(btn.px, 14, 16), btn);
  check('Navegación (barra inferior): Inter 500–600, 11–15 px', esInter(nav) && enRango(nav.peso, 500, 700) && enRango(nav.px, 11, 15), nav);

  // ventana del mazo
  await ev(`document.getElementById('deckCount').click(); 1`); await sleep(1100);
  const seg = await rol('.dv-cname'), nm = await rol('.dv-name'), meta = await rol('.dv-meta'), dn = await rol('#dvName');
  check('Título de sección ("Unidades"): Inter 700, 20–24 px', esInter(seg) && seg.peso === 700 && enRango(seg.px, 20, 24) && enRango(seg.lh, 1.2, 1.35), seg);
  check('Título de carta: Inter 600, 14–18 px', esInter(nm) && enRango(nm.peso, 600, 700) && enRango(nm.px, 14, 18), nm);
  check('Metadatos: Inter 400–500, 11–13 px', esInter(meta) && enRango(meta.peso, 400, 500) && enRango(meta.px, 11, 13), meta);
  check('Título de página funcional (nombre del mazo): Inter 700, 26–38 px', esInter(dn) && dn.peso === 700 && enRango(dn.px, 26, 38), dn);
  check('la tipografía Display no se usa fuera de los títulos protagonistas (mazo)', JSON.stringify(await ev(FUGAS)) === '[]', await ev(FUGAS));
  const qty = await rol('.dv-qty'), cnt = await rol('#dvCount');
  check('Números (copias y contador): Inter con cifras tabulares', esInter(qty) && /tabular/.test(qty.num) && esInter(cnt) && /tabular/.test(cnt.num), [qty, cnt]);

  // Meta Lab (tabla)
  await ev(`document.getElementById('dvCompare').click(); 1`); await sleep(3000);
  const th = await rol('.ml-table th'), td = await rol('.ml-table td'), big = await rol('.ml-big b');
  check('Cabeceras de tabla: Inter 600, 12–13 px', th && esInter(th) && th.peso === 600 && enRango(th.px, 12, 13), th);
  check('Celdas de tabla: Inter 400–500, 13–14 px, cifras tabulares', td && esInter(td) && enRango(td.peso, 400, 500) && enRango(td.px, 13, 14) && /tabular/.test(td.num), td);
  check('KPI principal (porcentaje): Inter 700–800, 32–48 px, tabular', big && esInter(big) && enRango(big.peso, 700, 800) && enRango(big.px, 32, 48) && /tabular/.test(big.num), big);
  check('la tipografía Display no se usa fuera de los títulos protagonistas (Meta Lab)', JSON.stringify(await ev(FUGAS)) === '[]', await ev(FUGAS));

  // ficha
  await abrir(SEED);
  await ev(`document.querySelector('.dz-inner').click(); 1`); await sleep(1200);
  const lab = await rol('.d-field .fl, .d-kpi .kl'), kv = await rol('.d-kpi .kv'), dnm = await rol('.d-name');
  check('Labels: Inter 500, 12–14 px', lab && esInter(lab) && lab.peso === 500 && enRango(lab.px, 12, 14), lab);
  check('Valores de la ficha: Inter 700, tabulares', kv && esInter(kv) && kv.peso >= 700 && /tabular/.test(kv.num), kv);
  check('Nombre de la carta en la ficha: Inter 700, 28–32 px', dnm && esInter(dnm) && dnm.peso === 700 && enRango(dnm.px, 28, 32), dnm);
  check('la tipografía Display no se usa fuera de los títulos protagonistas (ficha)', JSON.stringify(await ev(FUGAS)) === '[]', await ev(FUGAS));

  // Mis mazos, Competición y Mi colección
  await abrir(SEED);
  await ev(`document.getElementById('${W < 900 ? 'tbDecks' : 'btnMyDecks'}').click(); 1`); await sleep(900);
  const dpt = await rol('.dp-title');
  check('Título de pantalla ("Mis mazos"): Display en MAYÚSCULAS', dpt && /Big Shoulders/.test(dpt.fam) && dpt.mayus === 'uppercase' && enRango(dpt.lh, 1.0, 1.15), dpt);
  check('la tipografía Display no se usa fuera de los títulos protagonistas (Mis mazos)', JSON.stringify(await ev(FUGAS)) === '[]', await ev(FUGAS));
  await send('Page.navigate', { url: 'http://localhost:8766/#competicion' }); await sleep(400); await send('Page.reload'); await sleep(4500);
  const tab = await rol('#compTabs .comp-tab'), ch = await rol('.comp-chip, .tag.chip');
  check('Pestañas de navegación: Inter 500–600, 13–15 px', tab && esInter(tab) && enRango(tab.peso, 500, 600) && enRango(tab.px, 13, 15), tab);
  for (let i = 0; i < 6; i++) {
    await ev(`document.querySelectorAll('#compTabs .comp-tab')[${i}].click(); 1`); await sleep(1300);
    const fg = await ev(FUGAS);
    check('Competición, pestaña ' + (i + 1) + ': Display solo en el título de pantalla', JSON.stringify(fg) === '[]', fg);
  }
  await send('Page.navigate', { url: 'http://localhost:8766/#coleccion' }); await sleep(400); await send('Page.reload'); await sleep(4000);
  check('la tipografía Display no se usa fuera de los títulos protagonistas (Mi colección)', JSON.stringify(await ev(FUGAS)) === '[]', await ev(FUGAS));
  check('sin errores de consola', errs.length === 0, errs);
}
console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
ws.close(); process.exit(failed ? 1 : 0);
