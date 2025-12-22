self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Réception d’un push (plus tard on affichera vraiment le message)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'LNJP', body: 'Notification' };

  event.waitUntil(
    self.registration.showNotification(data.title || 'LNJP', {
      body: data.body || 'Notification',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: data.url ? { url: data.url } : {}
    })
  );
});

// Clic sur la notification → ouvrir l’app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
