// ─── MySpeedCoach Service Worker ─────────────────────────────────────────────
// Handles:
//   • Web Push notifications (new announcements)
//   • Notification click → open the app at /announcements
//
// This file must live at /public/sw.js so it is served from the root scope.
// next-pwa will NOT overwrite it because we reference it explicitly.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ─── Push received ────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nieuw bericht', body: event.data ? event.data.text() : '' };
  }

  const title   = data.title   || 'MySpeedCoach';
  const options = {
    body:    data.body    || 'Je hebt een nieuw bericht ontvangen.',
    icon:    data.icon    || '/icons/icon-192.png',
    badge:   data.badge   || '/icons/icon-192.png',
    tag:     data.tag     || 'msc-announcement',   // replaces previous notification with same tag
    renotify: true,
    data: {
      url: data.url || '/announcements',
    },
    actions: [
      { action: 'open',    title: 'Bekijken' },
      { action: 'dismiss', title: 'Sluiten'  },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/announcements';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
