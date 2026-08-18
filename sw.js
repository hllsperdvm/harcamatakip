/* YUVAM service worker — statik kabuk + Firebase SDK (çevrimdışı) */
const CACHE = 'yuvam-shell-v4';
const ASSETS = [
  './',
  './index.html',
  './css/tw.css',
  './css/style.css',
  './sw.js',
  './js/01-core.js',
  './js/02-family-gold-calendar.js',
  './js/03-sync-vehicle.js',
  './js/04-expenses-ai.js',
  './js/05-settings-boot.js',
  './vendor/firebase-app-compat.js',
  './vendor/firebase-firestore-compat.js',
  './vendor/firebase-auth-compat.js',
  './images/eyvah-maymun.png',
  './images/loading-gate.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.all(ASSETS.map(function(u) {
        return cache.add(new Request(u, { cache: 'reload' })).catch(function(err) {
          console.warn('SW cache miss', u, err);
        });
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) {
        return caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Firebase / Google API ağ istekleri — Firestore kendi offline katmanı
  if (url.hostname.indexOf('googleapis.com') >= 0 ||
      url.hostname.indexOf('firebaseio.com') >= 0 ||
      url.hostname.indexOf('firestore.googleapis.com') >= 0 ||
      url.hostname.indexOf('identitytoolkit.googleapis.com') >= 0 ||
      url.hostname.indexOf('securetoken.googleapis.com') >= 0 ||
      url.hostname.indexOf('google.com') >= 0 ||
      url.hostname.indexOf('jsdelivr.net') >= 0 ||
      url.hostname.indexOf('fonts.googleapis.com') >= 0 ||
      url.hostname.indexOf('fonts.gstatic.com') >= 0) {
    return;
  }

  // Aynı origin: önce önbellek, yoksa ağ, yoksa index
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        const network = fetch(req).then(function(res) {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(function(c) { c.put(req, copy); }).catch(function() {});
          }
          return res;
        }).catch(function() {
          return cached || caches.match('./index.html');
        });
        // Stale-while-revalidate: önbellek varsa hemen ver
        return cached || network;
      })
    );
  }
});
