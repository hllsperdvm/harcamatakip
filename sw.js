/* YUVAM service worker — asset-safe caching */
const CACHE = 'yuvam-shell-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
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
  './images/loading-gate.png',
  './images/icon.svg',
  './images/icon-192.png',
  './images/icon-512.png'
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
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) {
          return caches.delete(k);
        })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.indexOf('text/html') >= 0) return true;
  const p = url.pathname || '';
  return p.endsWith('/') || p.endsWith('.html');
}

function isStaticAsset(url) {
  const p = url.pathname || '';
  return /\.(css|js|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|json|ico)(\?.*)?$/i.test(p);
}

self.addEventListener('fetch', function(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Cross-origin (Firebase, fonts, CDN) — SW karışmasın
  if (url.origin !== self.location.origin) return;

  // CSS / JS / görseller: ASLA index.html fallback yok
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(function(cached) {
        const net = fetch(req).then(function(res) {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(function(c) { c.put(req, copy); }).catch(function() {});
          }
          return res;
        }).catch(function() {
          return cached || Response.error();
        });
        // Önce ağ (güncel CSS), yoksa cache
        return net.then(function(res) {
          if (res && res.ok) return res;
          return cached || res;
        }).catch(function() {
          return cached || Response.error();
        });
      })
    );
    return;
  }

  // HTML navigasyon
  if (isHtmlRequest(req, url)) {
    event.respondWith(
      fetch(req).then(function(res) {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(function(c) {
            c.put('./index.html', copy);
            c.put(req, res.clone());
          }).catch(function() {});
        }
        return res;
      }).catch(function() {
        return caches.match('./index.html').then(function(c) {
          return c || caches.match(req);
        });
      })
    );
  }
});
