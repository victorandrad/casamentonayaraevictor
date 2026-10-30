/* global self, URL */
// Service worker of the site: only shows the notices a guest asked for on the order's page (an
// open Pix, the payment's outcome). It doesn't cache or intercept anything.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener('push', (evento) => {
  let aviso = {};
  try {
    aviso = evento.data ? evento.data.json() : {};
  } catch {
    // not ours
  }
  if (!aviso.titulo) return;
  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.corpo,
      icon: '/icon-192.png',
      badge: '/favicon-32.png',
      tag: aviso.tag,
      renotify: true,
      data: { url: aviso.url || '/' },
    }),
  );
});

// Opens the page the notice is about: in a tab of the site already open, or a new one.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = new URL(evento.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      const aba = abas.find((a) => new URL(a.url).origin === url.origin);
      if (aba) return aba.navigate(url.href).then((a) => (a || aba).focus());
      return self.clients.openWindow(url.href);
    }),
  );
});
