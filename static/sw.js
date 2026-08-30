const CACHE = 'zenith-v16-2';
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
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Zenith', body: 'New notification' };
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/static/icons/icon-192.png', badge: '/static/icons/icon-192.png', tag: data.tag || 'zenith' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if (c.url.includes('/app')) return c.focus(); }
    return clients.openWindow('/app');
  }));
});
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
