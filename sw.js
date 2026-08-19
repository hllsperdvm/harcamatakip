/* YUVAM SW v7 — CSS/JS'ye dokunmaz (stil bozulmasını önler) */
const CACHE = 'yuvam-shell-v7';
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/loading-gate.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.all(PRECACHE.map(function(u) {
        return cache.add(new Request(u, { cache: 'reload' })).catch(function() {});
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // CSS, JS, font, worker — hiçbir şekilde SW üzerinden geçirme
  if (/\.(css|js|mjs|map|woff2?|ttf|otf)(\?.*)?$/i.test(url.pathname)) {
    return; // tarayıcı normal ağ isteği yapsın
  }

  // Sadece HTML navigasyon için offline yedek
  const isNav = req.mode === 'navigate' ||
    ((req.headers.get('accept') || '').indexOf('text/html') >= 0);
  if (!isNav) return;

  event.respondWith(
    fetch(req).then(function(res) {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(function(c) { c.put('./index.html', copy); }).catch(function() {});
      }
      return res;
    }).catch(function() {
      return caches.match('./index.html');
    })
  );
});
