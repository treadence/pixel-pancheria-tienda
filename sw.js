// Service worker de Pixel Panchería — notificaciones push del seguimiento de pedido

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || '🌭 Pixel Panchería', {
      body: data.body || 'Hay novedades de tu pedido',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      tag: 'pixel-pedido' // reemplaza la notificación anterior en vez de apilar
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === url && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
