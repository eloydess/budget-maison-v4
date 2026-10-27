/* Budget Maison — service worker : l'application s'ouvre même hors connexion (données du dernier passage). */
var CACHE = 'bm-5.0.0';
var FILES = ['./', 'index.html', 'styles.css?v=5.0.0', 'config.js?v=5.0.0', 'engine.js?v=5.0.0', 'importer.js?v=5.0.0', 'charts.js?v=5.0.0', 'core.js?v=5.0.0', 'ui.js?v=5.0.0', 'ui2.js?v=5.0.0', 'app.js?v=5.0.0',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // l'API Google n'est jamais mise en cache
  // réseau d'abord (mises à jour immédiates), cache en secours
  e.respondWith(fetch(e.request).then(function (r) {
    var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: false }).then(function (r) { return r || caches.match('index.html'); }); }));
});
