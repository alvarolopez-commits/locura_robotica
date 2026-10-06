/* Service worker de Locura robótica.
 * - Página: red primero (así los cambios llegan en cuanto despliegas), con caché si no hay red.
 * - Imágenes de cartas: caché primero (no cambian) y se guardan al verlas.
 * - Fuentes de Google: caché primero.
 * Sube SHELL_VERSION si cambias la lista de PRECACHE. */
const SHELL_VERSION = 'v1';
const SHELL = 'locura-shell-' + SHELL_VERSION;
const IMAGES = 'locura-images';
const FONTS = 'locura-fonts';
const KEEP = [SHELL, IMAGES, FONTS];
const PRECACHE = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];
const PAGE_KEY = '/';
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

const store = async (cacheName, key, response) => {
  if (!(response.ok || response.type === 'opaque')) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(key, response);
  } catch (e) { /* cuota llena u otro fallo: se ignora */ }
};

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(PAGE_KEY);
  try {
    const fresh = fetch(request).then((res) => { store(SHELL, PAGE_KEY, res.clone()); return res; });
    return cached ? await withTimeout(fresh, NETWORK_TIMEOUT) : await fresh;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  store(cacheName, request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then((res) => { store(cacheName, request, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'fonts.googleapis.com') return event.respondWith(staleWhileRevalidate(request, FONTS));
  if (url.hostname === 'fonts.gstatic.com') return event.respondWith(cacheFirst(request, FONTS));
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/dashboard.html') {
    return event.respondWith(networkFirstPage(request));
  }
  if (url.pathname.startsWith('/images/')) return event.respondWith(cacheFirst(request, IMAGES));
  if (url.pathname === '/sw.js') return;
  event.respondWith(staleWhileRevalidate(request, SHELL));
});
