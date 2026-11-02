/* Reglas de DESIGN.md y de la auditoría convertidas en pruebas sobre el CSS y el HTML. Ejecutar:  node tests/design_rules.test.js */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
function none(list, what) { if (list.length) throw new Error(what + ': ' + list.slice(0, 5).join(' | ')); }

/* reglas CSS con su selector, para poder decir dónde está el problema y saber si están dentro de un @media */
function rules() {
  const out = []; let depth = 0, media = [], buf = '', i = 0;
  for (; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      const sel = buf.trim(); buf = '';
      if (sel.startsWith('@')) { media.push(sel); depth++; continue; }
      const end = css.indexOf('}', i);
      out.push({ sel, body: css.slice(i + 1, end), media: media.slice() });
      i = end;
    } else if (ch === '}') { if (media.length) media.pop(); buf = ''; }
    else buf += ch;
  }
  return out;
}
const R = rules();

test('el catálogo no va incrustado en el HTML y el HTML pesa menos de 700 KB', () => {
  if (/var CARDS_DATA = \[/.test(html)) throw new Error('CARDS_DATA sigue dentro de dashboard.html');
  if (!/<script src="data\/cards\.js"><\/script>/.test(html)) throw new Error('falta <script src="data/cards.js">');
  const kb = Buffer.byteLength(html) / 1024; if (kb > 700) throw new Error(kb.toFixed(0) + ' KB');
});
test('data/cards.js tiene las 1086 cartas y es igual que data/all_cards.json', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'data', 'cards.js'), 'utf8');
  const a = JSON.parse(js.slice(js.indexOf('= ') + 2, js.lastIndexOf(';')));
  const b = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'all_cards.json'), 'utf8'));
  if (a.length !== 1086 || JSON.stringify(a) !== JSON.stringify(b)) throw new Error('distintos');
});
test('el service worker precarga data/cards.js', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  if (sw.indexOf("'/data/cards.js'") === -1) throw new Error('no está en PRECACHE');
});
test('no hay easing con rebote (cubic-bezier con valores mayores que 1)', () => {
  none((css.match(/cubic-bezier\([^)]*\)/g) || []).filter((c) => c.slice(13, -1).split(',').map(Number).some((v, k) => (k % 2 === 1) && (v > 1 || v < 0))), 'rebote');
});
test('no se anima width, height ni padding', () => {
  none(R.filter((r) => /transition:[^;]*\b(width|height|padding)\b/.test(r.body)).map((r) => r.sel), 'transición de tamaño');
});
test('ningún texto por debajo de 12 px', () => {
  none(R.filter((r) => (r.body.match(/font-size:\s*([\d.]+)px/g) || []).some((f) => parseFloat(f.split(':')[1]) < 12)).map((r) => r.sel), 'texto < 12 px');
});
test('!important solo en [hidden] y en los bloques de "reducir movimiento"', () => {
  none(R.filter((r) => /!important/.test(r.body) && r.sel !== '[hidden]' && !r.media.some((m) => /prefers-reduced-motion/.test(m))).map((r) => r.sel), '!important fuera de lugar');
});
test('las capas flotantes (z-index ≥ 30) usan las variables --z-*', () => {
  none(R.filter((r) => (r.body.match(/z-index:\s*(\d+)/g) || []).some((z) => parseInt(z.split(':')[1], 10) >= 30)).map((r) => r.sel), 'z-index suelto');
  if (/style="[^"]*z-index:\s*\d{2,}/.test(html)) throw new Error('z-index suelto en un style="" del HTML');
});
test('las capas definidas existen todas en :root', () => {
  const used = new Set((html.match(/var\(--z-[\w-]+\)/g) || []).map((v) => v.slice(4, -1)));
  const root = css.slice(css.indexOf(':root{'), css.indexOf('}', css.indexOf(':root{')));
  none([...used].filter((v) => root.indexOf(v + ':') === -1), 'capa sin definir');
});
test('sin bordes laterales gruesos en cajas (solo se permiten en adornos ::before/::after)', () => {
  none(R.filter((r) => /border-(left|right)\s*:\s*[2-9]px/.test(r.body) && !/::?(before|after)/.test(r.sel)).map((r) => r.sel), 'borde lateral');
});
test('los colores más repetidos usan sus tokens (#fff, navy, sky, rose, azul, gris suave)', () => {
  const bad = R.filter((r) => !/^:root/.test(r.sel)).flatMap((r) => r.body.split(';').filter((d) => !/^\s*--/.test(d) && !/url\(/.test(d) && /#(fff|ffffff|221e41|8bcdff|f4a6a6|1a4d7a|dce5ed|d86565)\b/i.test(d)).map((d) => r.sel + ' {' + d.trim() + '}'));
  none(bad, 'hex suelto');
});

console.log('\n' + passed + ' pasan · ' + failed + ' fallan');
process.exit(failed ? 1 : 0);
