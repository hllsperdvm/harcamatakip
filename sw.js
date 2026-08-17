/* YUVAM service worker — statik kabuk önbelleği + çevrimdışı açılış */
const CACHE = 'yuvam-shell-v3';
const ASSETS = [
  './',
  './index.html',
  './tw.css',
  './style.css',
  './js/01-core.js',
  './js/02-family-gold-calendar.js',
  './js/03-sync-vehicle.js',
  './js/04-expenses-ai.js',
  './js/05-settings-boot.js',
  './eyvah-maymun.png',
  './loading-gate.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS.map(function(u) { return new Request(u, { cache: 'reload' }); })).catch(function() {
        // tek tek dene
        return Promise.all(ASSETS.map(function(u) {
          return cache.add(u).catch(function() {});
        }));
      });
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase / API — ağa bırak (Firestore kendi offline katmanı)
  if (url.hostname.indexOf('googleapis.com') >= 0 ||
      url.hostname.indexOf('firebaseio.com') >= 0 ||
      url.hostname.indexOf('firestore.googleapis.com') >= 0 ||
      url.hostname.indexOf('gstatic.com') >= 0 ||
      url.hostname.indexOf('google.com') >= 0 ||
      url.hostname.indexOf('jsdelivr.net') >= 0 ||
      url.hostname.indexOf('fonts.googleapis.com') >= 0 ||
      url.hostname.indexOf('fonts.gstatic.com') >= 0) {
    return;
  }
  event.respondWith(
    caches.match(req).then(function(cached) {
      const fetched = fetch(req).then(function(res) {
        if (res && res.status === 200 && (url.origin === self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then(function(c) { c.put(req, copy); }).catch(function() {});
        }
        return res;
      }).catch(function() {
        return cached || caches.match('./index.html');
      });
      return cached || fetched;
    })
  );
});
