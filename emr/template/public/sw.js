const CACHE_NAME = 'better-kids-emr-v2';
const STATIC_CACHE = 'better-kids-static-v2';
const API_CACHE = 'better-kids-api-v2';
const CURRENT_CACHES = new Set([CACHE_NAME, STATIC_CACHE, API_CACHE]);

const APP_SHELL = [
  '/site.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((error) => console.warn('Service worker precache failed:', error))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

/**
 * Cache strategies:
 * 1. Static assets (js/css/images/fonts): cache-first
 * 2. HTML pages: network-first, fallback to cache
 * 3. Firestore/Firebase API calls: stale-while-revalidate
 * 4. Everything else: network-first
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  if (/\.(js|css|png|jpg|jpeg|gif|webp|svg|woff|woff2)$/i.test(url.pathname) || url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200 && response.type !== 'error') {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => caches.match(event.request) || Response.error());
      })
    );
    return;
  }

  if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request) || Response.error())
    );
    return;
  }

  if (url.hostname.includes('firebaseio.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((response) => {
            if (response && response.status === 200 && response.type !== 'error') {
              const clone = response.clone();
              caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => cachedResponse || Response.error());

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request) || Response.error())
  );
});
