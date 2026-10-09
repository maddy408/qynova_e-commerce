import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Guest session ID management (ensures MySQL carts and wishlists persist without storing business data in localStorage)
let memorySessionId = null

export function getSessionId() {
  if (memorySessionId) return memorySessionId
  try {
    const match = document.cookie.match(/(?:^|;\s*)storefront_session_id=([^;]+)/)
    if (match && match[1]) {
      memorySessionId = decodeURIComponent(match[1])
      return memorySessionId
    }
  } catch {
    // ignore
  }

  // Generate a random 32-character hexadecimal session identifier
  const array = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
  } else {
    for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256)
  }
  memorySessionId = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')

  try {
    // Store in session cookie (expires when browser is closed, no persistent business storage)
    document.cookie = `storefront_session_id=${encodeURIComponent(memorySessionId)}; path=/; SameSite=Lax`
  } catch {
    // ignore
  }

  return memorySessionId
}

// Customer Auth token management (JWT token only; no customer business data stored in storage)
export function setCustomerToken(token) {
  if (token) {
    try {
      sessionStorage.setItem('customer_jwt', token)
    } catch {
      window.__customer_jwt = token
    }
  }
}

export function getCustomerToken() {
  try {
    return sessionStorage.getItem('customer_jwt') || window.__customer_jwt || null
  } catch {
    return window.__customer_jwt || null
  }
}

export function clearCustomerSession() {
  try {
    sessionStorage.removeItem('customer_jwt')
  } catch {
    // ignore
  }
  delete window.__customer_jwt
}

export function clearCustomerToken() {
  clearCustomerSession()
}

export function setCustomerSession(token) {
  if (token) {
    setCustomerToken(token)
  }
}

// Axios Request Interceptor: Attach JWT token and Session ID to all requests
api.interceptors.request.use((config) => {
  const token = getCustomerToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const sessionId = getSessionId()
  if (sessionId) {
    config.headers['X-Session-ID'] = sessionId
  }
  return config
})

// Centralized error message extractor
export function getErrorMessage(err, fallback = 'Something went wrong') {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message || err.response?.data?.error || fallback
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallback
}

// --- DATABASE DATA PROVIDERS ---

let cachedStoreSettings = null
export async function fetchStoreSettings(forceRefresh = false) {
  if (cachedStoreSettings && !forceRefresh) return cachedStoreSettings
  try {
    const res = await api.get('/settings/store')
    cachedStoreSettings = res.data?.settings || null
    return cachedStoreSettings
  } catch {
    return null
  }
}

let cachedDeliverySettings = null
export async function fetchDeliverySettings(forceRefresh = false) {
  if (cachedDeliverySettings && !forceRefresh) return cachedDeliverySettings
  try {
    const res = await api.get('/settings/delivery')
    cachedDeliverySettings = res.data?.delivery_settings || null
    return cachedDeliverySettings
  } catch {
    return null
  }
}

export function resolveImageUrl(path) {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path
  }
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api'
  const origin = apiBase.replace(/\/api\/?$/, '')
  return `${origin}/${path.replace(/^\//, '')}`
}

export async function fetchBanners(position = 'HOME_HERO') {
  try {
    const res = await api.get(`/banners?position=${encodeURIComponent(position)}&is_active=1`)
    return res.data?.banners || []
  } catch {
    return []
  }
}

export async function fetchActiveOffers() {
  try {
    const res = await api.get('/offers')
    return res.data?.offers || []
  } catch {
    return []
  }
}

export async function fetchFlashDeal() {
  try {
    const res = await api.get('/offers/flash-deal')
    return res.data?.flash_deal || null
  } catch {
    return null
  }
}

export async function fetchReferralSettings() {
  try {
    const res = await api.get('/referral-settings')
    return res.data?.settings || null
  } catch {
    return null
  }
}

export async function fetchHomeSections() {
  try {
    const res = await api.get('/home-sections')
    return res.data?.sections || []
  } catch {
    return []
  }
}

export async function fetchPages() {
  try {
    const res = await api.get('/pages')
    return res.data?.pages || []
  } catch {
    return []
  }
}

export async function fetchPage(slug) {
  try {
    const res = await api.get(`/pages/${slug}`)
    return res.data?.page || null
  } catch {
    return null
  }
}

export async function fetchCustomerAddresses() {
  try {
    const res = await api.get('/customer/addresses')
    return res.data?.addresses || []
  } catch {
    return []
  }
}

export async function saveCustomerAddress(data) {
  const res = await api.post('/customer/addresses', data)
  return res.data
}

export async function deleteCustomerAddress(id) {
  const res = await api.delete(`/customer/addresses/${id}`)
  return res.data
}

