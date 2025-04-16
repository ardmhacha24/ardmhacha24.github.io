const CACHE_NAME = 'gnc-clg-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/assets/IMG_9120-WHITE.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});

self.addEventListener('push', event => {
  const options = {
    body: event.data.text(),
    icon: '/assets/IMG_9120-WHITE.png',
    badge: '/assets/IMG_9120-WHITE.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View Match'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Grange Naomh Colmcille CLG', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'view') {
    clients.openWindow('/');
  }
}); 