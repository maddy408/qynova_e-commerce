import axios, { type InternalAxiosRequestConfig } from 'axios'
import { env } from '../config/env'
import { ROUTES } from '../routes/routes'

const TOKEN_KEY = 'admin_pos_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export const api = axios.create({
  baseURL: env.API_BASE_URL,
  timeout: 20000,
  // The refresh token lives in an httpOnly cookie (see AuthController) —
  // every request must carry credentials for /auth/refresh and
  // /auth/logout to be able to read/clear it.
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  config.baseURL = env.API_BASE_URL
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

// Silent-refresh queue: if several requests 401 with an expired access
// token at once, only the first triggers POST /auth/refresh — the rest
// wait on the same in-flight promise and retry with whatever token it
// resolves to, instead of each firing its own redundant refresh call.
let refreshPromise: Promise<string> | null = null

function redirectToLogin() {
  clearToken()
  if (window.location.pathname !== ROUTES.LOGIN) {
    window.location.href = ROUTES.LOGIN
  }
}

async function refreshAccessToken(): Promise<string> {
  const response = await axios.post(
    `${env.API_BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true },
  )
  const newToken = response.data?.token as string | undefined
  if (!newToken) {
    throw new Error('Refresh response had no token')
  }
  setToken(newToken)
  return newToken
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const config = error.config as RetriableConfig | undefined

    if (status !== 401 || !config || config._retry) {
      if (status === 401) {
        redirectToLogin()
      }
      return Promise.reject(error)
    }

    // Only "Token expired" is worth a silent-refresh attempt — "Invalid
    // token" (bad signature, malformed) or no refresh cookie at all can
    // never succeed, so go straight to a full logout instead of wasting
    // a round trip and showing a confusing flash of retried requests.
    const serverMessage = error.response?.data?.error
    if (serverMessage !== 'Token expired') {
      redirectToLogin()
      return Promise.reject(error)
    }

    config._retry = true

    try {
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null
        })
      }
      const newToken = await refreshPromise
      config.headers.Authorization = `Bearer ${newToken}`
      return api(config)
    } catch (refreshError) {
      redirectToLogin()
      return Promise.reject(refreshError)
    }
  },
)

/** Extracts a user-facing message from a failed API call — the backend always returns {error: string}. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined
    return data?.error ?? fallback
  }
  return fallback
}
