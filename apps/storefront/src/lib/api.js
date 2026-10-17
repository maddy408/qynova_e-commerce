import { api } from '../api/axiosInstance'
import { ENDPOINTS } from '../api/endpoints'
import { env } from '../config/env'

export { api, getErrorMessage } from '../api/axiosInstance'
/** @deprecated import `env` from '../config/env' instead. */
export const API_BASE_URL = env.API_BASE_URL

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

export function resetSessionId() {
  memorySessionId = null
  try {
    document.cookie = 'storefront_session_id=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
  } catch {
    // ignore
  }
  return getSessionId()
}

// Customer Auth token management (Multi-tier persistence: Memory, LocalStorage, SessionStorage & Cookie)
let memoryCustomerToken = null

export function isTokenExpired(token) {
  if (!token || typeof token !== 'string') return true
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const payload = JSON.parse(jsonPayload)
    if (!payload.exp) return false
    // Buffer by 10 seconds
    return Date.now() >= (payload.exp - 10) * 1000
  } catch {
    return false
  }
}

export function setCustomerToken(token) {
  if (token) {
    memoryCustomerToken = token
    if (typeof window !== 'undefined') {
      window.__customer_jwt = token
    }
    try {
      localStorage.setItem('storefront_customer_jwt', token)
      sessionStorage.setItem('storefront_customer_jwt', token)
    } catch {
      // ignore
    }
    try {
      // Persist for 1 year (365 days)
      document.cookie = `storefront_customer_jwt=${encodeURIComponent(token)}; path=/; max-age=31536000; SameSite=Lax`
    } catch {
      // ignore
    }
  }
}

export function getCustomerToken() {
  if (memoryCustomerToken && !isTokenExpired(memoryCustomerToken)) {
    return memoryCustomerToken
  }
  if (typeof window !== 'undefined' && window.__customer_jwt && !isTokenExpired(window.__customer_jwt)) {
    memoryCustomerToken = window.__customer_jwt
    return memoryCustomerToken
  }
  try {
    const localToken = localStorage.getItem('storefront_customer_jwt') || localStorage.getItem('customer_jwt')
    if (localToken && !isTokenExpired(localToken)) {
      memoryCustomerToken = localToken
      if (typeof window !== 'undefined') window.__customer_jwt = localToken
      return memoryCustomerToken
    }
  } catch {
    // ignore
  }
  try {
    const sessionToken = sessionStorage.getItem('storefront_customer_jwt') || sessionStorage.getItem('customer_jwt')
    if (sessionToken && !isTokenExpired(sessionToken)) {
      memoryCustomerToken = sessionToken
      if (typeof window !== 'undefined') window.__customer_jwt = sessionToken
      return memoryCustomerToken
    }
  } catch {
    // ignore
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)storefront_customer_jwt=([^;]+)/)
    if (match && match[1]) {
      const cookieToken = decodeURIComponent(match[1])
      if (cookieToken && !isTokenExpired(cookieToken)) {
        memoryCustomerToken = cookieToken
        if (typeof window !== 'undefined') window.__customer_jwt = memoryCustomerToken
        return memoryCustomerToken
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function getStoredCustomer() {
  try {
    const raw = localStorage.getItem('customer_data')
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return null
}

export function clearCustomerSession() {
  memoryCustomerToken = null
  try {
    localStorage.removeItem('storefront_customer_jwt')
    localStorage.removeItem('customer_jwt')
    localStorage.removeItem('customer_data')
    sessionStorage.removeItem('storefront_customer_jwt')
    sessionStorage.removeItem('customer_jwt')
  } catch {
    // ignore
  }
  try {
    document.cookie = 'storefront_customer_jwt=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax'
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    delete window.__customer_jwt
  }
  resetSessionId()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('customer-session-changed', { detail: { customer: null } }))
  }
}

export function clearCustomerToken() {
  clearCustomerSession()
}

export function setCustomerSession(token, customer = null) {
  if (token) {
    setCustomerToken(token)
    if (customer) {
      try {
        localStorage.setItem('customer_data', JSON.stringify(customer))
      } catch {
        // ignore
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('customer-session-changed', { detail: { customer } }))
    }
  }
}

// Axios Request Interceptor: Attach JWT token and Session ID to all requests
api.interceptors.request.use((config) => {
  const token = getCustomerToken()
  if (token) {
    if (config.headers?.set) {
      config.headers.set('Authorization', `Bearer ${token}`)
      config.headers.set('X-Authorization', `Bearer ${token}`)
      config.headers.set('X-Customer-Token', token)
    } else {
      config.headers.Authorization = `Bearer ${token}`
      config.headers['X-Authorization'] = `Bearer ${token}`
      config.headers['X-Customer-Token'] = token
    }
  }
  const sessionId = getSessionId()
  if (sessionId) {
    if (config.headers?.set) {
      config.headers.set('X-Session-ID', sessionId)
    } else {
      config.headers['X-Session-ID'] = sessionId
    }
  }
  return config
})

// --- DATABASE DATA PROVIDERS ---

let cachedStoreSettings = null
export async function fetchStoreSettings(forceRefresh = false) {
  if (cachedStoreSettings && !forceRefresh) return cachedStoreSettings
  try {
    const res = await api.get(ENDPOINTS.SETTINGS.STORE)
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
    const res = await api.get(ENDPOINTS.SETTINGS.DELIVERY)
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
  return `${env.API_ORIGIN}/${path.replace(/^\//, '')}`
}

export async function fetchBanners(position = 'HOME_HERO') {
  try {
    const res = await api.get(ENDPOINTS.BANNERS.BY_POSITION(position))
    return res.data?.banners || []
  } catch {
    return []
  }
}

export async function fetchActiveOffers() {
  try {
    const res = await api.get(ENDPOINTS.OFFERS.LIST)
    return res.data?.offers || []
  } catch {
    return []
  }
}

export async function fetchFlashDeal() {
  try {
    const res = await api.get(ENDPOINTS.OFFERS.FLASH_DEAL)
    return res.data?.flash_deal || null
  } catch {
    return null
  }
}

export async function fetchReferralSettings() {
  try {
    const res = await api.get(ENDPOINTS.REFERRAL.SETTINGS)
    return res.data?.settings || null
  } catch {
    return null
  }
}

export async function fetchHomeSections() {
  try {
    const res = await api.get(ENDPOINTS.HOME_SECTIONS)
    return res.data?.sections || []
  } catch {
    return []
  }
}

export async function fetchPages() {
  try {
    const res = await api.get(ENDPOINTS.PAGES.LIST)
    return res.data?.pages || []
  } catch {
    return []
  }
}

export async function fetchPage(slug) {
  try {
    const res = await api.get(ENDPOINTS.PAGES.BY_SLUG(slug))
    return res.data?.page || null
  } catch {
    return null
  }
}

export async function fetchCustomerAddresses() {
  try {
    const res = await api.get(ENDPOINTS.CUSTOMER.ADDRESSES)
    return res.data?.addresses || []
  } catch {
    return []
  }
}

export async function saveCustomerAddress(data) {
  const res = await api.post(ENDPOINTS.CUSTOMER.ADDRESSES, data)
  return res.data
}

export async function updateCustomerAddress(id, data) {
  const res = await api.put(ENDPOINTS.CUSTOMER.ADDRESS_BY_ID(id), data)
  return res.data
}

export async function deleteCustomerAddress(id) {
  const res = await api.delete(ENDPOINTS.CUSTOMER.ADDRESS_BY_ID(id))
  return res.data
}

let cachedCategories = null
export async function fetchCategories(forceRefresh = false) {
  if (cachedCategories && !forceRefresh) return cachedCategories
  try {
    const res = await api.get(ENDPOINTS.CATEGORIES)
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
    const res = await api.get(ENDPOINTS.SUBCATEGORIES)
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
    const res = await api.get(ENDPOINTS.BRANDS)
    cachedBrands = res.data?.brands || []
    return cachedBrands
  } catch {
    return []
  }
}

export async function fetchAvailableCoupons() {
  try {
    const res = await api.get(ENDPOINTS.COUPONS.AVAILABLE)
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
