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

// Customer Auth token management (Session cookie and memory only; NO localStorage or sessionStorage)
let memoryCustomerToken = null

export function setCustomerToken(token) {
  if (token) {
    memoryCustomerToken = token
    try {
      document.cookie = `storefront_customer_jwt=${encodeURIComponent(token)}; path=/; SameSite=Lax`
    } catch {
      // ignore
    }
    window.__customer_jwt = token
  }
}

export function getCustomerToken() {
  if (memoryCustomerToken) return memoryCustomerToken
  try {
    const match = document.cookie.match(/(?:^|;\s*)storefront_customer_jwt=([^;]+)/)
    if (match && match[1]) {
      memoryCustomerToken = decodeURIComponent(match[1])
      return memoryCustomerToken
    }
  } catch {
    // ignore
  }
  return window.__customer_jwt || null
}

export function clearCustomerSession() {
  memoryCustomerToken = null
  try {
    document.cookie = 'storefront_customer_jwt=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
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

let cachedCategories = null
export async function fetchCategories(forceRefresh = false) {
  if (cachedCategories && !forceRefresh) return cachedCategories
  try {
    const res = await api.get('/categories')
    cachedCategories = res.data?.categories || []
    return cachedCategories
  } catch {
    return []
  }
}

let cachedSubcategories = null
export async function fetchSubcategories(forceRefresh = false) {
  if (cachedSubcategories && !forceRefresh) return cachedSubcategories
  try {
    const res = await api.get('/subcategories')
    cachedSubcategories = res.data?.subcategories || []
    return cachedSubcategories
  } catch {
    return []
  }
}

let cachedBrands = null
export async function fetchBrands(forceRefresh = false) {
  if (cachedBrands && !forceRefresh) return cachedBrands
  try {
    const res = await api.get('/brands')
    cachedBrands = res.data?.brands || []
    return cachedBrands
  } catch {
    return []
  }
}

export async function fetchAvailableCoupons() {
  try {
    const res = await api.get('/coupons/available')
    return res.data?.coupons || []
  } catch {
    return []
  }
}

/** Clear all in-memory API caches to force fresh GET requests on next read */
export function clearApiCache() {
  cachedStoreSettings = null
  cachedDeliverySettings = null
  cachedCategories = null
  cachedSubcategories = null
  cachedBrands = null
}

/** Invalidate cache and broadcast a revalidation event across the storefront */
export function revalidateStorefront() {
  clearApiCache()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('storefront-revalidate'))
  }
}

// Window focus & tab visibility change listener to auto-revalidate when switching back from Admin Panel
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => {
    revalidateStorefront()
  })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        revalidateStorefront()
      }
    })
  }
  window.addEventListener('storage', (e) => {
    if (e.key?.includes('admin') || e.key?.includes('token') || e.key?.includes('setting') || e.key?.includes('catalog')) {
      revalidateStorefront()
    }
  })
}

