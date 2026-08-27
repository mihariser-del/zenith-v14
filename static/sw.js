const CACHE = 'zenith-v1';
const URLS = [
  '/',
  '/app',
  '/admin',
  '/static/manifest.json',
  '/static/css/style.css',
  '/static/js/api.js',
  '/static/js/app.js',
  '/static/js/auth.js',
  '/static/js/chat.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      if (res.ok && e.request.url.includes('/static/')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match('/')))
  );
});
