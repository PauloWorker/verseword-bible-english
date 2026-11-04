const CACHE = 'verseword-v7';
const ASSETS = ['/', '/styles.css', '/core.js', '/app.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('verseword-') && key !== CACHE).map(key => caches.delete(key))
  )));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const cached = caches.match(request);
  const network = fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      return caches.open(CACHE).then(cache => cache.put(request, copy)).then(() => response);
    }
    return response;
  });
  event.waitUntil(cached.then(value => value ? network.catch(() => undefined) : undefined));
  event.respondWith(cached.then(value => value || network.catch(() => request.mode === 'navigate' ? caches.match('/') : Response.error())));
});
