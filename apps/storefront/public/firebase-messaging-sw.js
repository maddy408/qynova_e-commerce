// Firebase Cloud Messaging background service worker — placeholder.
//
// TODO: implement background push notifications (order status, delivery
// tracking, promotional alerts — see docs/DOCUMENTATION.md's Firebase
// push section).
//
// Note: this file is served as a static asset (not processed by Vite),
// so it cannot import src/config/env.js. Firebase's web config values
// are not secret (they're safe to ship to the browser), so the usual
// pattern is to paste the same values from .env's VITE_FIREBASE_*
// here directly, e.g.:
//
// importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js')
// importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-messaging-compat.js')
//
// firebase.initializeApp({
//   apiKey: '...',
//   authDomain: '...',
//   projectId: '...',
//   storageBucket: '...',
//   messagingSenderId: '...',
//   appId: '...',
// })
//
// const messaging = firebase.messaging()
// messaging.onBackgroundMessage((payload) => { /* show notification */ })
