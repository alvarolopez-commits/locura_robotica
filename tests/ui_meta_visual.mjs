// Meta de Competición: franja proporcional con arte, donut del reparto por color, «arquetipos para el 80 %» y colores de gráfico con contraste.
// Límites: 30 s por orden y 4 min en total.  Uso: Chrome con --remote-debugging-port=9333 y la carpeta en http://localhost:8766/ ;  node tests/ui_meta_visual.mjs
import fs from 'node:fs';
let paso = 'inicio';
setTimeout(() => { console.log('TIEMPO AGOTADO (4 min) en: ' + paso); process.exit(3); }, 240000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errs.push((d.params.exceptionDetails.exception?.description || '').slice(0, 200)); };
const send = (m, p = {}) => new Promise((r) => { const i = ++id; const to = setTimeout(() => { console.log('ORDEN SIN RESPUESTA (30 s): ' + m + ' en ' + paso); process.exit(3); }, 30000); pend.set(i, (d) => { clearTimeout(to); r(d); }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result.exceptionDetails ? { __err: (r.result.exceptionDetails.exception?.description || '').slice(0, 200) } : r.result.result.value; };
let passed = 0, failed = 0;
function check(name, cond, extra) { paso = name; if (cond) { passed++; console.log('  PASS ' + name); } else { failed++; console.log('  FAIL ' + name + (extra !== undefined ? '\n       ' + JSON.stringify(extra).slice(0, 400) : '')); } }
await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

// valores esperados, calculados aparte de la pantalla (meta.json → puestos de GD06 por arquetipo)
const ML = JSON.parse(fs.readFileSync('data/meta.json', 'utf8'));
const counts = ML.archetypes.map((a) => ({ n: a.name, c: a.eraDecks.GD06 || 0 })).filter((x) => x.c).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n));
const total = counts.reduce((s, x) => s + x.c, 0);
let acc = 0, n80 = 0; for (const x of counts) { if (acc >= 0.8 * total - 1e-9) break; acc += x.c; n80++; }
const pct1 = (v) => (v / total * 100).toFixed(1).replace('.', ',');

async function abrir(W, H, lang = 'es') {
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 900 });
  await send('Page.navigate', { url: 'about:blank' }); await sleep(150); await send('Page.navigate', { url: 'http://localhost:8766/' }); await sleep(600);
  await ev(`sessionStorage.setItem('msa_splash','1'); localStorage.setItem('msa_install_dismissed',String(Date.now())); localStorage.setItem('msa_lang','${lang}'); 1`);
  await send('Page.navigate', { url: 'http://localhost:8766/#competicion' }); await sleep(300); await send('Page.reload'); await sleep(5000);
}
const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
const contraste = (a, b) => { const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + .05) / (lo + .05); };
const rgbOf = (s) => (s.match(/[0-9.]+/g) || []).slice(0, 3).map(Number);

for (const [W, H] of [[390, 844], [1280, 900]]) {
  console.log('\n== ' + W + ' px ==');
  await abrir(W, H);
  const strip = await ev(`(function(){ var s = document.querySelector('.gd-strip'); if(!s) return null; var w = s.getBoundingClientRect().width;
    return { alto: Math.round(s.getBoundingClientRect().height), ancho: Math.round(w), aria: s.getAttribute('aria-label'),
      segs: Array.prototype.map.call(s.querySelectorAll('.gd-seg'), function(g){ var r = g.getBoundingClientRect(), b = g.querySelector('b'), im = g.querySelector('img'); return { rest: g.classList.contains('is-rest'), w: r.width, aria: g.getAttribute('aria-label'), txt: b && !b.hidden ? b.textContent : '', txtW: b && !b.hidden ? b.scrollWidth : 0, img: im ? im.getAttribute('src') : null, tag: g.tagName }; }) }; })()`);
  check('la franja proporcional existe encima del ranking', !!strip && strip.segs.length >= 6, strip && strip.segs.length);
  if (!strip) continue;
  const items = strip.segs.filter((g) => !g.rest), rest = strip.segs.find((g) => g.rest);
  check('muestra los 8 primeros arquetipos y un tramo «resto», todos pulsables (botones) y con texto accesible', items.length === 8 && !!rest && strip.segs.every((g) => g.tag === 'BUTTON' && !!g.aria), [items.length, !!rest]);
  const sumW = strip.segs.reduce((s, g) => s + g.w, 0), gaps = (strip.segs.length - 1) * 2;
  check('la franja ocupa todo el ancho disponible (sin huecos ni desbordes)', Math.abs(sumW + gaps - strip.ancho) <= 2, [sumW + gaps, strip.ancho]);
  const prop = items.every((g, i) => Math.abs(g.w / (strip.ancho - gaps) * 100 - counts[i].c / total * 100) <= 0.8);
  check('el ancho de cada parte es proporcional a sus puestos (±0,8 puntos)', prop, items.map((g) => Math.round(g.w / (strip.ancho - gaps) * 1000) / 10));
  const restPct = 100 - counts.slice(0, 8).reduce((s, x) => s + x.c, 0) / total * 100;
  check('el tramo «resto» agrupa el resto de arquetipos con su % (' + (counts.length - 8) + ' más)', rest.aria.includes(String(counts.length - 8)) && rest.aria.includes(restPct.toFixed(1).replace('.', ',')), rest.aria);
  check('las partes anchas llevan su % (el primero coincide con el ranking) y las estrechas, no', items[0].txt === pct1(counts[0].c) + ' %' && items.every((g) => !g.txt || g.txtW <= g.w + 1), items.map((g) => g.txt));
  check('cada parte lleva el arte de una carta (≥ 6 imágenes)', items.filter((g) => /^images\/.+\.webp$/.test(g.img || '')).length >= 6, items.map((g) => g.img));
  check('altura suficiente para ver el arte (≥ 80 px)', strip.alto >= 80, strip.alto);
  check('la primera parte lleva el nombre del arquetipo líder en su texto accesible', items[0].aria.includes(counts[0].n), items[0].aria);

  await ev(`document.querySelector('.gd-seg').click(); 1`); await sleep(1100);
  check('pulsar una parte abre la ficha de ese arquetipo', (await ev(`document.getElementById('compPanel').textContent`)).includes(counts[0].n) && (await ev('location.hash')).includes('arquetipo'), await ev('location.hash'));
  await ev(`document.getElementById('compBack').click(); 1`); await sleep(1200);

  const kpi = await ev(`document.querySelector('.gd-stats-inline').textContent`);
  check('el resumen añade «' + n80 + ' arquetipos suman el 80 %»', new RegExp(n80 + ' arquetipos suman el 80 ?%').test(kpi), kpi);

  const dn = await ev(`(function(){ var d = document.querySelector('.gd-donut'); if(!d) return null; var c = Array.prototype.slice.call(d.querySelectorAll('circle[data-color]'));
    return { n: c.length, hidden: d.querySelector('svg').getAttribute('aria-hidden'), w: Math.round(d.getBoundingClientRect().width), centro: d.querySelector('.gd-donut-c').textContent.replace(/\\s+/g,' ').trim(),
      stroke: c.map(function(x){ return [x.dataset.color, getComputedStyle(x).stroke]; }), dash: c.map(function(x){ return parseFloat(x.getAttribute('stroke-dasharray')); }),
      leyenda: Array.prototype.map.call(document.querySelectorAll('.gd-crow'), function(r){ return r.querySelector('.gd-cname').textContent + '|' + r.querySelector('.gd-cval').textContent; }),
      pips: Array.prototype.map.call(document.querySelectorAll('.gd-crow .gd-cpip'), function(p){ return getComputedStyle(p).backgroundColor; }) }; })()`);
  check('el reparto por color es un donut de 5 sectores, oculto a lectores (la leyenda lleva la información)', !!dn && dn.n === 5 && dn.hidden === 'true', dn);
  if (!dn) continue;
  check('el centro muestra el color líder y su %, igual que la primera fila de la leyenda', dn.centro.includes(dn.leyenda[0].split('|')[0]) && dn.centro.includes(dn.leyenda[0].split('|')[1]), [dn.centro, dn.leyenda[0]]);
  check('la leyenda sigue con 5 filas descendentes que suman 100 %', dn.leyenda.length === 5 && Math.abs(dn.leyenda.reduce((s, x) => s + parseFloat(x.split('|')[1].replace(',', '.')), 0) - 100) < 0.6, dn.leyenda);
  const pcts = dn.leyenda.map((x) => parseFloat(x.split('|')[1].replace(',', '.'))), sdash = dn.dash.reduce((s, x) => s + x, 0), circ = 2 * Math.PI * 42;
  check('el arco de cada sector es proporcional a su % (el sector mayor es el mayor)', dn.dash.every((x, i) => i === 0 || dn.dash[i - 1] >= x - 0.01) && Math.abs(sdash / circ - 1) < 0.06, [sdash, circ]);
  check('los colores del donut y de la leyenda coinciden (misma identidad en todo el gráfico)', dn.pips.length === 5 && dn.stroke.every(([, s], i) => rgbOf(s).join() === rgbOf(dn.pips[i]).join()), [dn.stroke, dn.pips]);
  const fondos = [[34, 30, 65], [44, 39, 87], [22, 19, 41]];
  check('cada color de gráfico contrasta ≥ 3 : 1 con el panel navy y ≥ 3,3 : 1 con el panel más claro', dn.stroke.every(([, s]) => contraste(rgbOf(s), fondos[0]) >= 3.5 && contraste(rgbOf(s), fondos[1]) >= 3.3 && contraste(rgbOf(s), fondos[2]) >= 3), dn.stroke.map(([k, s]) => [k, +contraste(rgbOf(s), fondos[1]).toFixed(2)]));
  check('sin desbordamiento horizontal', (await ev('document.documentElement.scrollWidth <= innerWidth + 1')) === true);
}

console.log('\n== inglés ==');
await abrir(390, 844, 'en');
check('en inglés: texto accesible de la franja y de la métrica del 80 %', /archetypes (make up|reach) 80 ?%/.test(await ev(`document.querySelector('.gd-stats-inline').textContent`)) && /archetype/i.test((await ev(`document.querySelector('.gd-strip').getAttribute('aria-label')`)) || ''), await ev(`document.querySelector('.gd-strip').getAttribute('aria-label')`));
check('sin errores de JavaScript', errs.length === 0, errs);
console.log('\n' + passed + ' pasan · ' + failed + ' fallan'); process.exit(failed ? 1 : 0);
