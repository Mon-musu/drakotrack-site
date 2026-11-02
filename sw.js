/* ============================================================
   DrakoTrack — service worker
   Shell con stale-while-revalidate: abre sin red y se actualiza
   en segundo plano. Los datos NUNCA se cachean a ciegas: las
   llamadas a /api/ van siempre a la red y el estado de la app vive
   en localStorage, que el service worker no toca.
   ============================================================ */
'use strict';

const VERSION = 'drakotrack-v5';
/* Se cachea el shell por URL exacta (con su ?v=), así una versión nueva
   entra como entrada nueva y la vieja se borra al activar. */
const SHELL = [
  './',
  './index.html',
  './styles.css?v=24',
  './sync.js?v=1',
  './app.js?v=35',
  './supabase.js?v=4',
  './boostcamp.js?v=3',
  './share.js?v=4',
  './update-check.js?v=1',
  './legal.html',
  './legal.js',
  './logo.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* addAll aborta si un solo recurso falla; se guarda de uno en uno para
       que un asset opcional no deje la app sin shell offline. */
    await Promise.all(SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isOwnGet(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  /* El API y el feed de la APK son datos: siempre red, nunca caché. */
  if (url.pathname.startsWith('/api/')) return false;
  return true;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!isOwnGet(request)) return;      // deja pasar: red directa

  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(request, { ignoreSearch: false });

    /* Revalidación en segundo plano: se sirve lo cacheado y se refresca. */
    const network = fetch(request).then(response => {
      if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
      return response;
    }).catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const fresh = await network;
    if (fresh) return fresh;

    /* Sin red y sin caché: para navegaciones se devuelve el shell. */
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html') || await cache.match('./');
      if (shell) return shell;
    }
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
