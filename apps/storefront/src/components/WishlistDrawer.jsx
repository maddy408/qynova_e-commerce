import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiX, FiHeart, FiShoppingBag, FiTrash2, FiShoppingCart, FiArrowRight } from 'react-icons/fi'
import { fetchWishlist, toggleWishlist } from '../lib/wishlist'
import { addToCart } from '../lib/cart'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'

export default function WishlistDrawer({ isOpen, onClose, onShowToast }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [addingId, setAddingId] = useState(null)

  const refreshItems = () => {
    fetchWishlist(true).then((w) => setItems(w.items || []))
  }

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      fetchWishlist(true)
        .then((w) => setItems(w.items || []))
        .finally(() => setLoading(false))
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    const handleWishlistUpdate = (e) => {
      if (e?.detail?.items) {
        setItems(e.detail.items)
      } else {
        refreshItems()
      }
    }
    window.addEventListener('wishlist-updated', handleWishlistUpdate)
    return () => window.removeEventListener('wishlist-updated', handleWishlistUpdate)
  }, [])

  if (!isOpen) return null

  const handleRemove = async (productId, e) => {
    e.stopPropagation()
    try {
      await toggleWishlist(productId)
    } catch {
      // ignore
    }
  }

  const handleAddToCart = async (item, e) => {
    e.stopPropagation()
    setAddingId(item.product_id)
    try {
      await addToCart({ id: item.product_id, variant_id: item.variant_id || null }, 1)
      if (onShowToast) {
        onShowToast(`Added "${item.name}" to cart!`)
      }
    } catch {
      // ignore
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Dark backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer Panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-250">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-gradient-to-r from-white to-[var(--color-bg-main)]">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center shadow-xs">
                <FiHeart className="w-5 h-5 fill-current" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-[var(--color-text-main)] leading-tight">
                  My Wishlist
                </h2>
                <p className="text-[11px] text-[var(--color-text-muted)] font-semibold">
                  {items.length} saved item{items.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center transition-all cursor-pointer font-bold text-sm shadow-xs"
              title="Close Wishlist"
              aria-label="Close Wishlist"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>

          {/* Body: Items List or Empty State */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-10 h-10 border-3 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-gray-500">Loading your wishlist…</p>
              </div>
            ) : items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-16 text-center space-y-3 px-4">
                <div className="w-16 h-16 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center text-2xl shadow-inner mb-2">
                  <FiHeart className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-[var(--color-text-main)]">
                  Your wishlist is empty
                </h3>
                <p className="text-xs text-gray-500 max-w-xs">
                  Save items you love so you can easily find and order them anytime.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    navigate(ROUTES.PRODUCTS)
                  }}
                  className="mt-4 px-6 py-2.5 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs font-bold shadow-md cursor-pointer transition-all active:scale-95"
                >
                  Explore Products
                </button>
              </div>
            ) : (
              items.map((item) => {
                const imageSrc = item.primary_image ? resolveImageUrl(item.primary_image) : null
                const price = item.min_price || item.mrp || '—'

                return (
                  <div
                    key={item.wishlist_id || item.product_id}
                    onClick={() => {
                      onClose()
                      navigate(ROUTES.PRODUCT_DETAIL(item.product_id))
                    }}
                    className="group relative flex items-center gap-3 p-3 rounded-2xl border border-[var(--color-border-subtle)] bg-white hover:border-[var(--color-brand)] hover:shadow-xs transition-all cursor-pointer"
                  >
                    {/* Thumbnail Image */}
                    <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {imageSrc ? (
                        <img src={imageSrc} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <FiShoppingBag className="w-6 h-6 text-gray-300" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 truncate">
                        {item.brand_name || 'In Stock'}
                      </p>
                      <h4 className="text-xs font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-brand)] truncate">
                        {item.name}
                      </h4>
                      <p className="text-xs font-black text-[var(--color-brand)]">
                        ₹{price}
                      </p>
                    </div>

                    {/* Actions: Add to Cart + Remove */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleRemove(item.product_id, e)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Remove from wishlist"
                        aria-label="Remove from wishlist"
                      >
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={addingId === item.product_id}
                        onClick={(e) => handleAddToCart(item, e)}
                        className="px-3 py-1.5 rounded-xl bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] active:scale-95 text-white text-[11px] font-bold shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
                        title="Add to cart"
                      >
                        <FiShoppingCart className="w-3 h-3" />
                        <span>{addingId === item.product_id ? 'Adding…' : 'Add'}</span>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="p-4 border-t border-[var(--color-border-subtle)] bg-slate-50 space-y-2">
              <button
                type="button"
                onClick={() => {
                  onClose()
                  navigate(ROUTES.PRODUCTS)
                }}
                className="w-full py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-[var(--color-text-main)] text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Continue Shopping</span>
                <FiArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
