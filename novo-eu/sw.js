// Novo Eu — service worker: offline + notificações
const CACHE = 'novo-eu-v35';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/badge-96.png',
  './intro-poster.jpg',
  './intro.webp',
  './fonts/BarlowCondensed-Bold.ttf',
  './fonts/BarlowCondensed-SemiBold.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(CORE.map((u) => cache.add(u).catch(() => null))))
  );
});

self.addEventListener('message', (event) => { if (event.data && event.data.type === 'skip') self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('novo-eu-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('.mp4')) return;
  // Nunca guardar respostas da API (dados, login e clima)
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('open-meteo.com')) return;
  if (req.mode === 'navigate') {
    // Rede primeiro; se a internet estiver lenta (2,5 s), abre a cópia guardada e atualiza por trás
    const net = fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin' })).then((res) => {
      if (!res || !res.ok) throw new Error('nav');
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    });
    event.respondWith(new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => { caches.match('./index.html').then((c) => { if (c && !done) { done = true; resolve(c); } }); }, 2500);
      net.then((r) => { if (!done) { done = true; clearTimeout(t); resolve(r); } })
        .catch(() => caches.match('./index.html').then((c) => { if (!done) { done = true; clearTimeout(t); resolve(c || Response.error()); } }));
    }));
    event.waitUntil(net.catch(() => null));
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Novo Eu', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Novo Eu';
  const opts = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    tag: data.tag || 'novo-eu',
    renotify: true,
    data: { url: data.url || './' }
  };
  const jobs = [self.registration.showNotification(title, opts)];
  if (typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) jobs.push(data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge());
  event.waitUntil(Promise.all(jobs).catch(() => null));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.postMessage({ type: 'open', url: target });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
