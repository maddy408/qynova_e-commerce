/**
 * The only file in this app allowed to read import.meta.env or contain a
 * URL string. Change VITE_API_BASE_URL in .env and the whole app follows
 * — nothing else should read an env var directly or build a URL by hand.
 */
function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined' && localStorage.getItem('api_base_url')) {
    return localStorage.getItem('api_base_url')!
  }
  if (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim() !== '') {
    return import.meta.env.VITE_API_BASE_URL
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:8080/api`
  }
  return 'http://localhost:8080/api'
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
}
