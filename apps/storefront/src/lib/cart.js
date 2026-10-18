// Authoritative Cart Management for Customer Storefront
// Handles:
// 1. Guest users: Cart is persistently maintained in localStorage ('adams_guest_cart') so it NEVER clears unexpectedly.
// 2. Logged-in customers: Authoritative cart is stored in MySQL database tables ('carts' & 'cart_items').
// 3. Login transition: Guest cart is automatically merged into customer's database cart table upon login.
// 4. Logout transition: Customer's cart remains safely preserved in MySQL table.

import { api, getSessionId, getCustomerToken, getStoredCustomer } from './api'

const GUEST_CART_STORAGE_KEY = 'adams_guest_cart'

function getCustomerStorageKey() {
  const customer = getStoredCustomer()
  return customer?.id ? `adams_customer_cart_${customer.id}` : null
}

function getLocalGuestCart() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(GUEST_CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalGuestCart(items) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(items || []))
  } catch (err) {
    console.warn('Failed to save guest cart to localStorage:', err)
  }
}

function clearLocalGuestCart() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(GUEST_CART_STORAGE_KEY)
  } catch {
    // ignore
  }
}

function saveCustomerCartBackup(items) {
  const key = getCustomerStorageKey()
  if (!key || typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(items || []))
  } catch {
    // ignore
  }
}

function getCustomerCartBackup() {
  const key = getCustomerStorageKey()
  if (!key || typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function calculateTotals(items) {
  let subtotal = 0
  let count = 0
  for (const item of items) {
    const qty = Number(item.quantity) || 1
    const price = Number(item.price ?? item.unit_price) || 0
    subtotal += price * qty
    count += qty
  }
  return {
    subtotal: subtotal.toFixed(2),
    item_count: count,
  }
}

// Initial in-memory state
let memoryCart = {
  items: [],
  subtotal: '0.00',
  item_count: 0,
}

// Pre-hydrate in-memory cart synchronously from local storage if available
if (typeof window !== 'undefined') {
  const isAuth = Boolean(getCustomerToken())
  const initialItems = isAuth ? getCustomerCartBackup() : getLocalGuestCart()
  if (initialItems.length > 0) {
    const totals = calculateTotals(initialItems)
    memoryCart = {
      items: initialItems,
      subtotal: totals.subtotal,
      item_count: totals.item_count,
    }
  }
}

let isFetching = false
let initialFetchPromise = null

function notifyCartUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('cart-updated', {
      detail: {
        items: memoryCart.items,
        totalCount: memoryCart.item_count,
        subtotal: memoryCart.subtotal,
      },
    })
  )
}

/** Fetches current authoritative cart state from MySQL via PHP API */
export async function fetchCart(force = false) {
  if (isFetching && initialFetchPromise && !force) return initialFetchPromise

  isFetching = true
  initialFetchPromise = api
    .get('/cart')
    .then((res) => {
      const data = res.data || {}
      const isAuth = Boolean(getCustomerToken())
      let items = Array.isArray(data.items) ? data.items : []

      // If guest user and server cart is empty but local storage has items, recover local items
      if (!isAuth && items.length === 0) {
        const localItems = getLocalGuestCart()
        if (localItems.length > 0) {
          items = localItems
        }
      }

      const totals = calculateTotals(items)
      memoryCart = {
        items,
        subtotal: String(data.subtotal || totals.subtotal),
        item_count: Number(data.item_count) || totals.item_count,
      }

      if (isAuth) {
        saveCustomerCartBackup(items)
      } else {
        saveLocalGuestCart(items)
      }

      notifyCartUpdated()
      return memoryCart
    })
    .catch((err) => {
      console.warn('Network cart fetch fallback to local cache:', err)
      const isAuth = Boolean(getCustomerToken())
      const cached = isAuth ? getCustomerCartBackup() : getLocalGuestCart()
      if (cached.length > 0) {
        const totals = calculateTotals(cached)
        memoryCart = {
          items: cached,
          subtotal: totals.subtotal,
          item_count: totals.item_count,
        }
        notifyCartUpdated()
      }
      return memoryCart
    })
    .finally(() => {
      isFetching = false
    })

  return initialFetchPromise
}

/** Returns current in-memory cart items (triggers fetch if not yet initialized) */
export function getCartItems() {
  if (memoryCart.items.length === 0 && !isFetching && !initialFetchPromise) {
    fetchCart()
  }
  return memoryCart.items
}

/** Returns current in-memory cart items count */
export function getCartCount() {
  if (memoryCart.item_count === 0 && !isFetching && !initialFetchPromise) {
    fetchCart()
  }
  return memoryCart.item_count
}

/** Returns current in-memory cart subtotal */
export function getCartSubtotal() {
  return memoryCart.subtotal
}

/** Adds an item to the cart (stores locally for guest and syncs to database table) */
export async function addToCart(product, quantity = 1) {
  if (!product) return memoryCart

  const isAuth = Boolean(getCustomerToken())
  const prodId = Number(product.id || product.product_id) || null
  const varId = Number(product.variant_id) || null
  const qty = Math.max(1, Number(quantity) || 1)

  // 1. Optimistically update local cart immediately so it NEVER clears
  const existingIndex = memoryCart.items.findIndex(
    (item) => (varId && item.variant_id === varId) || (prodId && item.product_id === prodId)
  )

  let updatedItems = [...memoryCart.items]
  if (existingIndex >= 0) {
    const existing = updatedItems[existingIndex]
    const newQty = (Number(existing.quantity) || 1) + qty
    const unitPrice = Number(existing.price ?? existing.unit_price) || 0
    updatedItems[existingIndex] = {
      ...existing,
      quantity: newQty,
      line_total: (unitPrice * newQty).toFixed(2),
    }
  } else {
    const unitPrice = Number(product.retail_price ?? product.price ?? product.unit_price) || 0
    const newItem = {
      id: varId || prodId || Date.now(),
      cart_item_id: varId || prodId || Date.now(),
      product_id: prodId,
      variant_id: varId,
      name: product.name || product.product_name || 'Grocery Item',
      product_name: product.name || product.product_name || 'Grocery Item',
      sku: product.sku || '',
      brand: product.brand || null,
      image: product.primary_image || product.image || '/images/products/amul_butter_500g.jpg',
      quantity: qty,
      price: String(unitPrice.toFixed(2)),
      unit_price: String(unitPrice.toFixed(2)),
      mrp: String(product.mrp || unitPrice.toFixed(2)),
      originalPrice: String(product.mrp || unitPrice.toFixed(2)),
      line_total: (unitPrice * qty).toFixed(2),
      purchasable: true,
      available: '100',
    }
    updatedItems.unshift(newItem)
  }

  const totals = calculateTotals(updatedItems)
  memoryCart = {
    items: updatedItems,
    subtotal: totals.subtotal,
    item_count: totals.item_count,
  }

  if (isAuth) {
    saveCustomerCartBackup(updatedItems)
  } else {
    saveLocalGuestCart(updatedItems)
  }
  notifyCartUpdated()

  // 2. Sync to MySQL database cart table
  try {
    const res = await api.post('/cart/items', {
      product_id: prodId,
      variant_id: varId,
      quantity: qty,
    })

    if (res.data?.cart && Array.isArray(res.data.cart.items)) {
      const data = res.data.cart
      const serverTotals = calculateTotals(data.items)
      memoryCart = {
        items: data.items,
        subtotal: String(data.subtotal || serverTotals.subtotal),
        item_count: Number(data.item_count) || serverTotals.item_count,
      }
      if (isAuth) {
        saveCustomerCartBackup(data.items)
      } else {
        saveLocalGuestCart(data.items)
      }
      notifyCartUpdated()
    }
    return memoryCart
  } catch (err) {
    console.warn('Cart API sync error, maintained locally:', err)
    return memoryCart
  }
}

/** Updates item quantity in cart */
export async function updateCartQuantity(cartItemId, newQuantity) {
  const qty = Number(newQuantity) || 0
  const isAuth = Boolean(getCustomerToken())

  if (qty <= 0) {
    return removeFromCart(cartItemId)
  }

  // Optimistic local update
  const updatedItems = memoryCart.items.map((item) => {
    if (item.id === cartItemId || item.cart_item_id === cartItemId || item.variant_id === cartItemId) {
      const unitPrice = Number(item.price ?? item.unit_price) || 0
      return {
        ...item,
        quantity: qty,
        line_total: (unitPrice * qty).toFixed(2),
      }
    }
    return item
  })

  const totals = calculateTotals(updatedItems)
  memoryCart = {
    items: updatedItems,
    subtotal: totals.subtotal,
    item_count: totals.item_count,
  }

  if (isAuth) {
    saveCustomerCartBackup(updatedItems)
  } else {
    saveLocalGuestCart(updatedItems)
  }
  notifyCartUpdated()

  try {
    const res = await api.put(`/cart/items/${cartItemId}`, { quantity: qty })
    if (res.data && Array.isArray(res.data.items)) {
      memoryCart = {
        items: res.data.items,
        subtotal: String(res.data.subtotal || totals.subtotal),
        item_count: Number(res.data.item_count) || totals.item_count,
      }
      if (isAuth) saveCustomerCartBackup(res.data.items)
      else saveLocalGuestCart(res.data.items)
      notifyCartUpdated()
    }
    return memoryCart
  } catch (err) {
    console.warn('Database cart update warning, kept local:', err)
    return memoryCart
  }
}

/** Removes an item from the cart */
export async function removeFromCart(cartItemId) {
  const isAuth = Boolean(getCustomerToken())

  // Optimistic local update
  const updatedItems = memoryCart.items.filter(
    (item) => item.id !== cartItemId && item.cart_item_id !== cartItemId && item.variant_id !== cartItemId
  )
  const totals = calculateTotals(updatedItems)
  memoryCart = {
    items: updatedItems,
    subtotal: totals.subtotal,
    item_count: totals.item_count,
  }

  if (isAuth) {
    saveCustomerCartBackup(updatedItems)
  } else {
    saveLocalGuestCart(updatedItems)
  }
  notifyCartUpdated()

  try {
    const res = await api.delete(`/cart/items/${cartItemId}`)
    if (res.data && Array.isArray(res.data.items)) {
      memoryCart = {
        items: res.data.items,
        subtotal: String(res.data.subtotal || totals.subtotal),
        item_count: Number(res.data.item_count) || totals.item_count,
      }
      if (isAuth) saveCustomerCartBackup(res.data.items)
      else saveLocalGuestCart(res.data.items)
      notifyCartUpdated()
    }
    return memoryCart
  } catch (err) {
    console.warn('Database cart remove warning, kept local:', err)
    return memoryCart
  }
}

/** Clears all items from cart */
export async function clearCart() {
  const isAuth = Boolean(getCustomerToken())
  clearLocalGuestCart()
  if (isAuth) {
    const key = getCustomerStorageKey()
    if (key) localStorage.removeItem(key)
  }

  memoryCart = {
    items: [],
    subtotal: '0.00',
    item_count: 0,
  }
  notifyCartUpdated()

  try {
    await api.delete('/cart')
  } catch (err) {
    console.warn('Failed to clear database cart on server:', err)
  }
  return memoryCart
}

/** Merge guest session & localStorage cart into logged-in customer cart table in MySQL */
export async function mergeGuestCart() {
  const guestItems = getLocalGuestCart()
  const sessionId = getSessionId()

  try {
    const res = await api.post('/cart/merge', {
      session_id: sessionId,
      items: guestItems,
    })

    const data = res.data || {}
    const items = Array.isArray(data.items) ? data.items : []
    const totals = calculateTotals(items)

    memoryCart = {
      items,
      subtotal: String(data.subtotal || totals.subtotal),
      item_count: Number(data.item_count) || totals.item_count,
    }

    // Successfully merged into database cart table — clear guest cart
    clearLocalGuestCart()
    saveCustomerCartBackup(items)
    notifyCartUpdated()
    return memoryCart
  } catch (err) {
    console.warn('Failed to merge guest cart into customer database table:', err)
    // Even if merge call fails, fetch the customer's authoritative cart
    return fetchCart(true)
  }
}

/** Resets in-memory cart state (used on logout/session switch) */
export function resetCartMemory() {
  const localGuest = getLocalGuestCart()
  const totals = calculateTotals(localGuest)
  memoryCart = {
    items: localGuest,
    subtotal: totals.subtotal,
    item_count: totals.item_count,
  }
  notifyCartUpdated()
}

// Global session listener
if (typeof window !== 'undefined') {
  fetchCart()

  window.addEventListener('customer-session-changed', (event) => {
    if (event.detail?.customer) {
      // Customer logged in! Merge guest cart into database table
      mergeGuestCart()
    } else {
      // Customer logged out — preserve their database cart safely in MySQL, reset client view
      resetCartMemory()
    }
  })
}
