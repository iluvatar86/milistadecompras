/* ---------------------------------------------------------------------------
   sw.js — Modo sin conexión.

   IMPORTANTE: al tocar cualquier archivo de la app hay que subir VERSION, o
   los teléfonos seguirán abriendo la copia guardada de la versión anterior.
   Y si se añade un archivo nuevo a js/, hay que añadirlo también a FILES o no
   funcionará sin conexión.
--------------------------------------------------------------------------- */

const VERSION = 'milistadecompras-v8';

const FILES = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/dom.js',
  './js/store.js',
  './js/precios.js',
  './js/comparar.js',
  './js/views.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Primero la red, y si no hay, la copia guardada. Así una versión nueva se ve
   en cuanto hay conexión, sin dejar de funcionar en el avión.

   Solo se toca lo que sale de esta misma dirección: las consultas de precios
   van al intermediario, y esas NO se guardan ni se sirven de la copia. Un
   precio de hace tres días servido como si fuera de ahora sería peor que no
   tener precio. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
