// Database-driven cart management for customer storefront
// All cart lines, pricing, quantities, and totals are computed and stored in MySQL via PHP REST API.
// NO persistent application data is stored in localStorage or sessionStorage.

import { api, getSessionId } from './api'

let memoryCart = {
  items: [],
  subtotal: '0.00',
  item_count: 0,
}

let isFetching = false
let initialFetchPromise = null

function notifyCartUpdated() {
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
  if (isFetching && initialFetchPromise) return initialFetchPromise

  isFetching = true
  initialFetchPromise = api
    .get('/cart')
    .then((res) => {
      const data = res.data || {}
      memoryCart = {
        items: Array.isArray(data.items) ? data.items : [],
        subtotal: String(data.subtotal || '0.00'),
        item_count: Number(data.item_count) || (Array.isArray(data.items) ? data.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 0),
      }
      notifyCartUpdated()
      return memoryCart
    })
    .catch((err) => {
      console.error('Failed to fetch database cart:', err)
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

/** Adds an item to the database cart */
export async function addToCart(product, quantity = 1) {
  if (!product) return memoryCart

  const prodId = Number(product.id) || null
  const varId = Number(product.variant_id) || null
  const qty = Math.max(1, Number(quantity) || 1)

  try {
    const res = await api.post('/cart/items', {
      product_id: prodId,
      variant_id: varId,
      quantity: qty,
    })

    if (res.data?.cart) {
      const data = res.data.cart
      memoryCart = {
        items: Array.isArray(data.items) ? data.items : [],
        subtotal: String(data.subtotal || '0.00'),
        item_count: Number(data.item_count) || (Array.isArray(data.items) ? data.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0) : 0),
      }
    } else {
      await fetchCart(true)
    }

    notifyCartUpdated()
    return memoryCart
  } catch (err) {
    console.error('Failed to add to database cart:', err)
    throw err
  }
}

/** Updates item quantity in database cart */
export async function updateCartQuantity(cartItemId, newQuantity) {
  const qty = Number(newQuantity) || 0

  try {
    const res = await api.put(`/cart/items/${cartItemId}`, {
      quantity: qty,
    })

    if (res.data && Array.isArray(res.data.items)) {
      const data = res.data
      memoryCart = {
        items: data.items,
        subtotal: String(data.subtotal || '0.00'),
        item_count: Number(data.item_count) || data.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
      }
    } else {
      await fetchCart(true)
    }

    notifyCartUpdated()
    return memoryCart
  } catch (err) {
    console.error('Failed to update database cart item quantity:', err)
    throw err
  }
}

/** Removes an item from the database cart */
export async function removeFromCart(cartItemId) {
  try {
    const res = await api.delete(`/cart/items/${cartItemId}`)
    if (res.data && Array.isArray(res.data.items)) {
      const data = res.data
      memoryCart = {
        items: data.items,
        subtotal: String(data.subtotal || '0.00'),
        item_count: Number(data.item_count) || data.items.reduce((s, i) => s + (Number(i.quantity) || 1), 0),
      }
    } else {
      await fetchCart(true)
    }

    notifyCartUpdated()
    return memoryCart
  } catch (err) {
    console.error('Failed to remove item from database cart:', err)
    throw err
  }
}

/** Clears all items from the database cart */
export async function clearCart() {
  try {
    await api.delete('/cart')
    memoryCart = {
      items: [],
      subtotal: '0.00',
      item_count: 0,
    }
    notifyCartUpdated()
    return memoryCart
  } catch (err) {
    console.error('Failed to clear database cart:', err)
    throw err
  }
}

/** Merge guest session cart into logged-in customer cart in MySQL */
export async function mergeGuestCart() {
  const sessionId = getSessionId()
  if (!sessionId) return
  try {
    await api.post('/cart/merge', { session_id: sessionId })
    await fetchCart(true)
  } catch {
    // ignore merge error
  }
}

// Initial eager cart load from MySQL on script evaluation
if (typeof window !== 'undefined') {
  fetchCart()
}
