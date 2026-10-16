import { api } from '../lib/api'
import { getDeviceToken } from '../services/firebase/firebaseMessaging'

const STORAGE_KEY = 'storefront_fcm_token'

/**
 * Registers (or refreshes) this browser's FCM device token against the
 * backend for the now-authenticated customer. Safe to call on every page
 * load / login — if permission was never granted or isn't currently
 * 'granted', this does nothing and never itself prompts (permission must
 * already have been requested via a user action — see NotificationBell).
 */
export async function syncDeviceToken() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return
  }

  try {
    const token = await getDeviceToken()
    if (!token) return

    await api.post('/device-tokens', { token, platform: 'WEB' })
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Best-effort — a failed registration just means this session won't
    // receive pushes; it must never block browsing or checkout.
  }
}

/** Removes this browser's last-registered token on logout, so a shared/public machine stops receiving this account's pushes once logged out. */
export async function removeDeviceToken() {
  const token = localStorage.getItem(STORAGE_KEY)
  if (!token) return

  try {
    await api.delete('/device-tokens', { data: { token } })
  } catch {
    // Best-effort — logout must proceed regardless.
  } finally {
    localStorage.removeItem(STORAGE_KEY)
  }
}
