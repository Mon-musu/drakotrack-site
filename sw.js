/* ============================================================
   DrakoTrack — service worker (Prompt 8)

   Estrategias:
   - Navegación: network-first. Si falla, shell cacheado y, como
     último recurso, offline.html.
   - Recursos versionados (?v=, iconos, manifest): cache-first.
   - Resto de estáticos propios: stale-while-revalidate.
   - /api/ y /apk/: siempre red, nunca caché (datos privados/feed).
   - Peticiones no GET, cross-origin y respuestas private/no-store:
     nunca se cachean.

   La actualización NO se fuerza sola: la página avisa y el usuario
   decide. Así una versión nueva no interrumpe un entrenamiento.
   ============================================================ */
'use strict';

const VERSION = 'drakotrack-v38';
const CACHE_PREFIX = 'drakotrack-';
const OFFLINE_URL = './offline.html';

const ESSENTIAL = ['./index.html', './app.js?v=63', './styles.css?v=43', './offline.html'];

const SHELL = [
  './',
  './index.html',
  './offline.html',
  './styles.css?v=43',
  './landing.js?v=4',
  './vendor/swiper/swiper-bundle.min.css?v=12',
  './vendor/swiper/swiper-bundle.min.js?v=11',
  './sync.js?v=3',
  './offline.js?v=2',
  './app.js?v=63',
  './data/muscles.json?v=3',
  './progress.js?v=1',
  './planner.js?v=1',
  './analytics.js?v=1',
  './activity.js?v=1',
  './supabase.js?v=5',
  './boostcamp.js?v=3',
  './share.js?v=4',
  './sounds/rest-alarm.mp3',
  './sounds/rest-digital.mp3',
  './sounds/rest-timer.mp3',
  './update-check.js?v=2',
  './legal.html',
  './legal.js',
  './logo.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* Los assets esenciales deben estar completos antes de activar esta
       versión. Si falla uno, la instalación se rechaza y el Service Worker
       anterior (con su caché) sigue funcionando: nunca se reemplaza una app
       que abre por una shell incompleta. */
    const loaded = await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).then(() => true).catch(() => false)
    ));
    const missing = ESSENTIAL.filter(url => !loaded[SHELL.indexOf(url)]);
    if (missing.length) throw new Error('incomplete_shell:' + missing.join(','));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    /* Solo se borran cachés de DrakoTrack. Otras apps del mismo origen no se tocan. */
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isOwnGet(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin;
}
function isPrivatePath(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/apk/');
}
function isAppShell(url) {
  return url.pathname === '/' || url.pathname.endsWith('/index.html');
}
function isVersionedStatic(url) {
  if (url.searchParams.has('v')) return true;
  return /\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.endsWith('manifest.webmanifest');
}
function isCacheable(response) {
  if (!response || !response.ok || response.type !== 'basic') return false;
  const control = response.headers.get('Cache-Control') || '';
  return !/no-store|private/i.test(control);
}
async function putInCache(request, response) {
  if (!isCacheable(response)) return response;
  try {
    const cache = await caches.open(VERSION);
    await cache.put(request, response.clone());
  } catch (_) { /* cuota llena: se sirve la respuesta sin cachear */ }
  return response;
}
async function cached(request) {
  const cache = await caches.open(VERSION);
  return cache.match(request, { ignoreSearch: false });
}

async function cacheFirst(request) {
  const hit = await cached(request);
  if (hit) return hit;
  try {
    return await putInCache(request, await fetch(request));
  } catch (_) {
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request, event) {
  const hit = await cached(request);
  const network = fetch(request).then(response => putInCache(request, response)).catch(() => null);
  if (hit) {
    event.waitUntil(network);
    return hit;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

/* Navegación: red primero para no quedar atrapado en una versión vieja. */
async function networkFirstNavigation(request) {
  const url = new URL(request.url);
  let timer = null;
  let controller = null;
  try { if (typeof AbortController !== 'undefined') controller = new AbortController(); } catch (_) {}
  try {
    if (controller) timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(request, controller ? { signal: controller.signal } : undefined);
    if (response && response.ok) {
      try {
        const cache = await caches.open(VERSION);
        /* Solo la portada actualiza el shell. Nunca guardar legal.html ni otra
           navegación como index.html: rompería la app offline. */
        if (isAppShell(url)) await cache.put('./index.html', response.clone());
      } catch (_) {}
      return response;
    }
  } catch (_) { /* se usa el shell cacheado */ } finally {
    if (timer) clearTimeout(timer);
  }
  const cache = await caches.open(VERSION);
  if (!isAppShell(url)) {
    const own = await cache.match(request);
    if (own) return own;
  }
  return (await cache.match('./index.html')) ||
    (await cache.match('./')) ||
    (await cache.match(OFFLINE_URL)) ||
    new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!isOwnGet(request)) return;                 // red directa: no se intercepta
  const url = new URL(request.url);
  if (isPrivatePath(url.pathname)) return;        // API y APK: red directa
  if (request.headers.get('range')) return;       // descargas parciales: red

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (isVersionedStatic(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, event));
});

self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'GET_VERSION' && event.source) {
    event.source.postMessage({ type: 'SW_VERSION', version: VERSION });
  }
});

/* Background Sync: si el navegador lo soporta, despierta a las pestañas para
   que procesen la cola. La app mantiene siempre el reintento al abrir/volver. */
self.addEventListener('sync', event => {
  if (event.tag !== 'draktrack-sync') return;
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      .then(clients => clients.forEach(client => client.postMessage({ type: 'PROCESS_QUEUE' })))
  );
});
