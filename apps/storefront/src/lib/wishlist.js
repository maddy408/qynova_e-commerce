// Database-driven wishlist management for customer storefront
// All wishlist additions and removals are stored in MySQL via PHP REST API.
// NO persistent application data is stored in localStorage or sessionStorage.

import { api, getSessionId } from './api'

let memoryWishlist = {
  items: [],
  productIds: [],
}

let isFetching = false
let initialFetchPromise = null

function notifyWishlistUpdated() {
  window.dispatchEvent(
    new CustomEvent('wishlist-updated', {
      detail: {
        items: memoryWishlist.items,
        productIds: memoryWishlist.productIds,
      },
    })
  )
}

/** Fetches current authoritative wishlist from MySQL via PHP API */
export async function fetchWishlist(force = false) {
  if (isFetching && initialFetchPromise && !force) return initialFetchPromise

  isFetching = true
  initialFetchPromise = api
    .get('/wishlist')
    .then((res) => {
      const data = res.data || {}
      memoryWishlist = {
        items: Array.isArray(data.items) ? data.items : [],
        productIds: Array.isArray(data.product_ids)
          ? data.product_ids.map(Number)
          : (Array.isArray(data.items) ? data.items.map((i) => Number(i.product_id)) : []),
      }
      notifyWishlistUpdated()
      return memoryWishlist
    })
    .catch((err) => {
      console.error('Failed to fetch database wishlist:', err)
      return memoryWishlist
    })
    .finally(() => {
      isFetching = false
    })

  return initialFetchPromise
}

/** Returns current in-memory wishlist product IDs */
export function getWishlistIds() {
  if (memoryWishlist.productIds.length === 0 && !isFetching && !initialFetchPromise) {
    fetchWishlist()
  }
  return memoryWishlist.productIds
}

/** Check if product ID is in wishlist */
export function isWishlisted(productId) {
  const numId = Number(productId)
  return memoryWishlist.productIds.includes(numId)
}

/** Toggles wishlist status of a product in MySQL */
export async function toggleWishlist(productId) {
  const numId = Number(productId)
  if (!numId) return memoryWishlist

  const alreadySaved = isWishlisted(numId)

  try {
    if (alreadySaved) {
      await api.delete(`/wishlist/${numId}`)
      memoryWishlist = {
        items: memoryWishlist.items.filter((item) => Number(item.product_id) !== numId),
        productIds: memoryWishlist.productIds.filter((id) => id !== numId),
      }
    } else {
      await api.post('/wishlist', { product_id: numId })
      memoryWishlist = {
        items: memoryWishlist.items,
        productIds: [...memoryWishlist.productIds, numId],
      }
      // Re-fetch to get complete product row
      fetchWishlist(true)
    }

    notifyWishlistUpdated()
    return {
      isSaved: !alreadySaved,
      productIds: memoryWishlist.productIds,
    }
  } catch (err) {
    console.error('Failed to toggle database wishlist:', err)
    throw err
  }
}

/** Merge guest session wishlist into logged-in customer account in MySQL */
export async function mergeGuestWishlist() {
  const sessionId = getSessionId()
  if (!sessionId) return
  try {
    await api.post('/wishlist/merge', { session_id: sessionId })
    await fetchWishlist(true)
  } catch {
    // ignore
  }
}

// Initial eager wishlist load from MySQL on script evaluation
if (typeof window !== 'undefined') {
  fetchWishlist()
}
