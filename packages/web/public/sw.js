// Service Worker for OmniLink Messenger — Push Notifications

self.addEventListener('install', (event) => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(self.clients.claim());
});

// Handle push events
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = { title: 'OmniLink', body: 'New notification', data: {} };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data?.text() || 'New notification';
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'default',
    renotify: true,
    requireInteraction: data.data?.type === 'incoming_call', // Keep call notifications visible
    vibrate: data.data?.type === 'incoming_call' ? [200, 100, 200, 100, 200] : [200, 100, 200],
    data: data.data || {},
    actions: data.data?.type === 'incoming_call'
      ? [
          { action: 'answer', title: 'Answer' },
          { action: 'decline', title: 'Decline' },
        ]
      : [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();

  const data = event.notification.data || {};
  const urlToOpen = data.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already an open tab, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if (data.type === 'incoming_call') {
            // The call modal will auto-appear via the pending call check on socket connect
            client.navigate('/');
          } else if (data.conversationId) {
            client.navigate(`/chat/${data.conversationId}`);
          }
          return;
        }
      }
      // No existing tab — open a new one
      return self.clients.openWindow(self.location.origin + urlToOpen);
    })
  );
});

// Handle notification close (user dismissed)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification dismissed');
});
