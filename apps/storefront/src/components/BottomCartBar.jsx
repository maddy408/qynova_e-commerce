import React, { useState, useEffect } from 'react'
import { getCartItems, getCartCount, getCartSubtotal, fetchCart } from '../lib/cart'

export default function BottomCartBar({ onOpenCart }) {
  const [items, setItems] = useState(() => getCartItems())
  const [count, setCount] = useState(() => getCartCount())
  const [subtotal, setSubtotal] = useState(() => getCartSubtotal())

  useEffect(() => {
    fetchCart().then((c) => {
      setItems(c.items || [])
      setCount(c.item_count || 0)
      setSubtotal(c.subtotal || '0.00')
    })

    const handleUpdate = (e) => {
      if (e?.detail) {
        setItems(e.detail.items || [])
        setCount(e.detail.totalCount || 0)
        setSubtotal(e.detail.subtotal || '0.00')
      } else {
        setItems(getCartItems())
        setCount(getCartCount())
        setSubtotal(getCartSubtotal())
      }
    }

    window.addEventListener('cart-updated', handleUpdate)
    return () => window.removeEventListener('cart-updated', handleUpdate)
  }, [])

  if (!count || count <= 0) {
    return null
  }

  // Calculate actual savings from database product MRP/originalPrice vs retail price
  const totalOriginal = items.reduce((sum, item) => {
    const orig = Number(item.original_price ?? item.originalPrice ?? item.mrp) || Number(item.price) || 0
    const qty = Number(item.quantity) || 1
    return sum + orig * qty
  }, 0)

  const numericSubtotal = Number(subtotal) || items.reduce((sum, item) => {
    return sum + (Number(item.price) || 0) * (Number(item.quantity) || 1)
  }, 0)

  const actualSavings = Math.max(0, totalOriginal - numericSubtotal)

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8E0E5] shadow-[0_-4px_20px_rgba(96,29,73,0.10)] transition-all animate-in slide-in-from-bottom-2 duration-200"
      role="region"
      aria-label="Cart summary"
    >
      <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-2.5 sm:py-3 flex items-center justify-between gap-3">
        {/* Left: Cart items info & live totals */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#F2DDE9] text-[#601D49] flex items-center justify-center shrink-0 border border-[#E8E0E5] shadow-xs">
            <svg
              className="w-5 h-5 sm:w-5.5 sm:h-5.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
          </div>

          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-black text-[#2D252B]">
                {count} {count === 1 ? 'item' : 'items'}
              </span>
              <span className="text-gray-300 hidden xs:inline">•</span>
              <span className="text-xs sm:text-sm font-black text-[#601D49]">
                ₹{numericSubtotal.toFixed(2)}
              </span>
              {actualSavings > 0 && (
                <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                  You save ₹{actualSavings.toFixed(2)}
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-[#6B5E68] truncate hidden sm:block">
              Free delivery and coupons calculated at checkout
            </p>
          </div>
        </div>

        {/* Right: View Cart Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="px-4 sm:px-6 py-2 sm:py-2.5 rounded-full bg-[#601D49] hover:bg-[#4D153A] text-white text-xs sm:text-sm font-black shadow-md shadow-black/10 active:scale-95 transition-all flex items-center gap-1.5 sm:gap-2 cursor-pointer"
          >
            <span>View Cart</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
