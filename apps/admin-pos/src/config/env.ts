/**
 * The only file in this app allowed to read import.meta.env or contain a
 * URL string. Change VITE_API_BASE_URL in .env and the whole app follows
 * — nothing else should read an env var directly or build a URL by hand.
 */
function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined' && localStorage.getItem('api_base_url')) {
    return localStorage.getItem('api_base_url')!
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl && !envUrl.includes('localhost') && envUrl.trim() !== '') {
    return envUrl
  }
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost') {
    return `http://${window.location.hostname}:8080/api`
  }
  return 'http://192.168.1.103:8080/api'
}

export const env = {
  /** e.g. http://localhost:8080/api */
  get API_BASE_URL(): string {
    return resolveApiBaseUrl()
  },
  /** API_BASE_URL with the trailing /api stripped — the origin uploaded
   * images/files are served from. */
  get API_ORIGIN(): string {
    return resolveApiBaseUrl().replace(/\/api\/?$/, '')
  },

  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY || '',
  FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID || '',
  FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
  FIREBASE_VAPID_KEY: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',

  RAZORPAY_KEY_ID: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
}
