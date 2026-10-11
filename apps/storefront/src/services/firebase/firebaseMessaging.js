/**
 * Firebase Cloud Messaging (push notifications) — initialization only.
 * TODO: implement requestNotificationPermission(), getDeviceToken()
 * (registering it against the backend's `device_tokens` table — see
 * docs/DB_ANALYSIS.md), and onForegroundMessage(), each as a named
 * export. Pair with public/firebase-messaging-sw.js for background
 * notifications (e.g. order status updates, delivery tracking).
 */
import { getMessaging, isSupported } from 'firebase/messaging'
import { firebaseApp } from './firebase'

export async function getFirebaseMessaging() {
  if (!(await isSupported())) return null
  return getMessaging(firebaseApp)
}

// TODO: export requestNotificationPermission(), getDeviceToken(),
// onForegroundMessage()
