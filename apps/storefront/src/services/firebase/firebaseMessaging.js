/**
 * Firebase Cloud Messaging (push notifications) for customer-facing
 * order-status alerts. Paired with public/firebase-messaging-sw.js for
 * background notifications (e.g. order status updates, delivery
 * tracking).
 *
 * Every export here fails SAFE: unsupported browsers, denied/blocked
 * permission, a missing VAPID key, or a network error all resolve to
 * `null`/`false` rather than throwing, so a caller never needs its own
 * try/catch just to keep the rest of the storefront working.
 */
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { firebaseApp } from './firebase'
import { FIREBASE_VAPID_KEY } from '../../config/firebaseConfig'

async function getFirebaseMessaging() {
  if (!(await isSupported())) return null
  return getMessaging(firebaseApp)
}

/**
 * Must be called from a user gesture (a button click), not on page load —
 * browsers increasingly ignore or auto-deny permission prompts fired
 * without one, and silently asking on load is also just poor UX.
 * @returns {Promise<'granted'|'denied'|'unsupported'>}
 */
export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }

  try {
    const result = await Notification.requestPermission()
    return result === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'unsupported'
  }
}

/**
 * Registers the FCM service worker and retrieves this browser's device
 * token — only call after requestNotificationPermission() resolved to
 * 'granted'. Returns null (never throws) if messaging isn't supported in
 * this browser, no VAPID key is configured, or the token request fails
 * (e.g. offline, blocked by an extension).
 * @returns {Promise<string|null>}
 */
export async function getDeviceToken() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return null
  }

  if (!FIREBASE_VAPID_KEY) {
    console.warn('[firebaseMessaging] VITE_FIREBASE_VAPID_KEY is not set — cannot request an FCM token. See Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.')
    return null
  }

  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })
    return token || null
  } catch (err) {
    console.warn('[firebaseMessaging] Could not retrieve an FCM token:', err?.message || err)
    return null
  }
}

/**
 * Foreground message handler — background messages (tab not focused)
 * are instead handled by firebase-messaging-sw.js's onBackgroundMessage,
 * so the two must never both display a notification for the same
 * message (this one only runs while the tab is focused; the SW only
 * runs while it isn't — mutually exclusive by Firebase's own design).
 * @param {(payload: unknown) => void} callback
 * @returns {Promise<(() => void) | null>} unsubscribe function, or null if unsupported
 */
export async function onForegroundMessage(callback) {
  const messaging = await getFirebaseMessaging()
  if (!messaging) {
    return null
  }

  return onMessage(messaging, callback)
}
