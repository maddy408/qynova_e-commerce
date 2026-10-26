import axios, { type InternalAxiosRequestConfig } from 'axios'
import { env } from '../config/env'
import { ROUTES } from '../routes/routes'

const TOKEN_KEY = 'admin_pos_token'
const REFRESH_TOKEN_KEY = 'admin_pos_refresh_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_TOKEN_KEY)
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
  const refreshToken = getRefreshToken()
  const response = await axios.post(
    `${env.API_BASE_URL}/auth/refresh`,
    { refresh_token: refreshToken },
    { withCredentials: true },
  )
  const newToken = response.data?.token as string | undefined
  const newRefreshToken = response.data?.refresh_token as string | undefined
  if (!newToken) {
    throw new Error('Refresh response had no token')
  }
  setToken(newToken)
  if (newRefreshToken) {
    setRefreshToken(newRefreshToken)
  }
  return newToken
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const config = error.config as RetriableConfig | undefined

    if (status !== 401 || !config || config._retry) {
      if (status === 401 && (config?.url?.includes('/auth/refresh') || config?.url?.includes('/auth/login'))) {
        redirectToLogin()
      }
      return Promise.reject(error)
    }

    // If the 401 itself is on refresh or login, don't retry - redirect to login
    if (config.url?.includes('/auth/refresh') || config.url?.includes('/auth/login')) {
      redirectToLogin()
      return Promise.reject(error)
    }

    // If there is no token at all, redirect to login
    if (!getToken() && !getRefreshToken()) {
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
    if (err.response?.status === 413) {
      return 'File size is too large for the server (HTTP 413 Request Entity Too Large). Please upload an image under 10MB or use compressed format.'
    }
    const data = err.response?.data as { error?: string } | undefined
    return data?.error ?? fallback
  }
  return fallback
}
