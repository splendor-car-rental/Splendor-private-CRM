const CACHE_NAME = 'splendor-crm-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || event.request.mode === 'navigate') {
    return;
  }

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // Network-first keeps the CRM current while allowing previously cached
  // assets to remain available when a transient network error occurs.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});
