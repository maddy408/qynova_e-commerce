/**
 * Re-exports the real API client (src/api/axiosInstance.ts) and base URL
 * (src/config/env.ts) under this app's original import path, so the ~40
 * existing `import { api, apiErrorMessage } from '../lib/api'` call
 * sites don't all need touching. New code should prefer importing
 * directly from '../api/axiosInstance' and '../config/env'.
 */
import { env } from '../config/env'

export { api, apiErrorMessage, clearToken, getToken, setToken, getRefreshToken, setRefreshToken, clearRefreshToken } from '../api/axiosInstance'

export function getApiBaseUrl(): string {
  return env.API_BASE_URL
}

export function getApiOrigin(): string {
  return env.API_ORIGIN
}
