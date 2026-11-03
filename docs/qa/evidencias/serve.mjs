// Servidor estático de pruebas con compresión brotli (como Vercel para HTML/JS/JSON) para medir cargas parecidas a producción.
// Uso: node docs/qa/evidencias/serve.mjs <carpeta> <puerto>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const root = path.resolve(process.argv[2]), port = +process.argv[3];
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const compressible = /\.(html|js|json|css|svg|webmanifest)$/;
const cache = new Map();
http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/dashboard.html';
  const p = path.join(root, u);
  if (!p.startsWith(root) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end(); }
  const h = { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'public, max-age=0, must-revalidate' };
  if (compressible.test(p) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
    const mt = fs.statSync(p).mtimeMs; let c = cache.get(p);
    if (!c || c.mt !== mt) { c = { mt, b: zlib.brotliCompressSync(fs.readFileSync(p), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }) }; cache.set(p, c); }   // la caché se invalida si el archivo cambia
    const b = c.b;
    res.writeHead(200, { ...h, 'content-encoding': 'br', 'content-length': b.length, vary: 'accept-encoding' }); return res.end(b);
  }
  res.writeHead(200, h); fs.createReadStream(p).pipe(res);
}).listen(port);
