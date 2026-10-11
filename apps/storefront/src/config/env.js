/**
 * The only file in this app allowed to read import.meta.env or contain a
 * URL string. Change VITE_API_BASE_URL in .env and the whole app follows
 * — nothing else should read an env var directly or build a URL by hand.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:8080/api'

export const env = {
  /** e.g. http://localhost:8080/api */
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
  /** API_BASE_URL with the trailing /api stripped — the origin product/
   * category/banner images are served from. */
  API_ORIGIN: (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/api\/?$/, ''),
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
}
