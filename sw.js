// M2028 service worker.
// Purpose right now: let the app show an ongoing, updating notification
// (registration.showNotification, tag 'm2028-live') for the Pomodoro timer +
// today's tasks, and make tapping any notification bring the app back to
// the foreground instead of doing nothing.
//
// Note on background limits: a website (even installed as a PWA) does not get
// guaranteed background execution the way a native app does. This worker does
// NOT run its own independent countdown — it only displays whatever the page
// last told it to show. The page (index.html) refreshes that notification
// every ~20s while it's alive and immediately on start/pause/complete. If the
// browser fully suspends or kills the page after a long time with the screen
// off, the notification will stop updating until the app is reopened — that's
// a platform limit, not a bug in this file.

const CACHE_NAME = 'm2028-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping the live notification (or any notification) should open the app
// if it's closed, or just focus the existing tab if it's already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

// Allow the page to explicitly ask the worker to update or clear the live
// notification via postMessage, as a fallback path alongside the direct
// registration.showNotification() calls made from index.html.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_LIVE_NOTIF') {
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: 'm2028-live',
      renotify: false,
      silent: true,
      icon: data.icon,
      badge: data.icon,
    });
  } else if (data.type === 'CLOSE_LIVE_NOTIF') {
    self.registration.getNotifications({ tag: 'm2028-live' }).then((list) => {
      list.forEach((n) => n.close());
    });
  }
});
