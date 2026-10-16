// Firebase Cloud Messaging background service worker — handles push
// notifications (new orders, cancellations, low stock) while this app
// is not the focused tab. Foreground messages are instead handled by
// src/services/firebase/firebaseMessaging.js's onForegroundMessage() —
// the two are mutually exclusive by Firebase's own design (a message
// only ever reaches one or the other depending on tab focus), so no
// extra guard is needed here to avoid a duplicate notification.
//
// This file is served as a static asset (not processed by Vite), so it
// cannot import src/config/env.ts — these Firebase web config values are
// not secret (safe to ship to any browser; see firebaseConfig.ts), so
// they're simply duplicated here from .env.development's VITE_FIREBASE_*
// values. If you rotate the Firebase project, update both places.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyCVG9mrIN4SK-aWOX3FnmVTbYkpbUK-lSY',
  authDomain: 'e-commerce-cda55.firebaseapp.com',
  projectId: 'e-commerce-cda55',
  storageBucket: 'e-commerce-cda55.firebasestorage.app',
  messagingSenderId: '571728115329',
  appId: '1:571728115329:web:14a8e7515a231b4722bf80',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'Unified POS'
  const body = payload.notification?.body || payload.data?.body || ''

  self.registration.showNotification(title, {
    body,
    icon: '/favicon.ico',
    data: payload.data || {},
    tag: payload.data?.reference_id ? `${payload.data?.type || 'notification'}-${payload.data.reference_id}` : undefined,
  })
})

// Clicking the notification focuses an existing tab if one is open,
// otherwise opens a new one — and routes to the referenced order when
// the payload names one, instead of always landing on the dashboard.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  const path = data.reference_type === 'ORDER' && data.order_id ? `/orders/${data.order_id}` : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(path)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(path)
      }
    })
  )
})
