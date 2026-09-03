const CACHE = 'zenith-v23';
const URLS = [
  '/',
  '/app',
  '/admin',
  '/static/manifest.json?v=2',
  '/static/icons/favicon-16-v2.png',
  '/static/icons/favicon-32-v2.png',
  '/static/icons/apple-touch-icon-v2.png',
  '/static/icons/icon-192-v2.png',
  '/static/icons/icon-512-v2.png',
  '/static/css/style.css',
  '/static/css/vault.css',
  '/static/js/api.js',
  '/static/js/app.js',
  '/static/js/auth.js',
  '/static/js/chat.js',
  '/static/js/settings.js',
  '/static/js/confirm.js',
  '/static/js/admin.js',
  '/static/js/vault.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Zenith', body: 'New notification' };
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/static/icons/icon-192.png', badge: '/static/icons/icon-192.png', tag: data.tag || 'zenith', requireInteraction: true, renotify: true, silent: false }));
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
  const url = e.request.url;
  // Network-first for pages and app code so updates are always fresh
  if (url.includes('/static/') || url === self.location.origin + '/' || url.includes('/app') || url.includes('/admin')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && url.includes('/static/')) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/')))
    );
  }
});
