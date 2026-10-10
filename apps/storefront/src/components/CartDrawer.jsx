import React, { useState, useEffect } from 'react'
import {
  getCartItems,
  fetchCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
} from '../lib/cart'
import { fetchDeliverySettings, resolveImageUrl, api } from '../lib/api'

export default function CartDrawer({ isOpen, onClose, onProceedToCheckout, onShowToast }) {
  const [cartItems, setCartItems] = useState([])
  const [deliverySettings, setDeliverySettings] = useState(null)
  const [couponCode, setCouponCode] = useState('')
  const [appliedCoupon, setAppliedCoupon] = useState('')
  const [couponDiscountAmount, setCouponDiscountAmount] = useState(0)
  const [couponError, setCouponError] = useState('')
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false)

  const refreshItems = () => {
    fetchCart().then((c) => setCartItems(c.items || []))
  }

  useEffect(() => {
    fetchDeliverySettings().then((d) => d && setDeliverySettings(d))
    api
      .get('/coupons/available')
      .then((res) => setAvailableCoupons(res.data?.coupons || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isOpen) {
      refreshItems()
      // Lock body scroll on mobile
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    const handleCartUpdate = () => refreshItems()
    window.addEventListener('cart-updated', handleCartUpdate)
    return () => window.removeEventListener('cart-updated', handleCartUpdate)
  }, [])

  if (!isOpen) return null

  const freeThreshold = deliverySettings?.free_delivery_threshold != null ? Number(deliverySettings.free_delivery_threshold) : null
  const stdDeliveryFee = Number(deliverySettings?.delivery_charge ?? deliverySettings?.standard_delivery_fee ?? 0)

  const subtotal = cartItems.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1),
    0
  )
  const discountAmount = appliedCoupon ? couponDiscountAmount : 0
  const deliveryCharge = (freeThreshold !== null && subtotal >= freeThreshold) || subtotal === 0 ? 0 : stdDeliveryFee
  const grandTotal = Math.max(0, subtotal - discountAmount + deliveryCharge)

  const applyCouponCode = async (codeToApply) => {
    const code = (codeToApply || couponCode).trim().toUpperCase()
    setCouponError('')

    if (!code) {
      setCouponError('Please enter a coupon code')
      return
    }

    setIsApplyingCoupon(true)
    try {
      const res = await api.post('/coupons/validate', {
        code,
        items: cartItems.map((ci) => ({
          variant_id: ci.variant_id,
          product_id: ci.product_id,
          quantity: ci.quantity,
          price: ci.price,
          line_total: ci.line_total,
        })),
      })
      const discount = Number(res.data?.discount_amount) || 0
      setCouponDiscountAmount(discount)
      setAppliedCoupon(code)
      setCouponCode(code)
      onShowToast?.(`Coupon "${code}" applied! Saved ₹${discount.toFixed(2)} 🎉`)
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Invalid coupon code'
      setCouponError(msg)
      setAppliedCoupon('')
      setCouponDiscountAmount(0)
    } finally {
      setIsApplyingCoupon(false)
    }
  }

  const handleApplyCoupon = (e) => {
    e.preventDefault()
    applyCouponCode(couponCode)
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon('')
    setCouponDiscountAmount(0)
    setCouponCode('')
    setCouponError('')
    onShowToast?.('Coupon removed.')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Cart Drawer Container */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#E8E0E5] bg-gradient-to-r from-[#F8F3F6] to-[#F7F5F7] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#601D49] text-white flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[#2D252B]">
                Shopping Cart
              </h2>
              <p className="text-[11px] text-[#6B5E68] font-medium">
                {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in your bag
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#F2DDE9] border border-[#E8E0E5] text-[#6B5E68] hover:text-[#2D252B] flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
            title="Close Cart"
          >
            ✕
          </button>
        </div>

        {/* Free Shipping Progress (Database Driven) */}
        {freeThreshold !== null && freeThreshold > 0 && (
          <div className="px-4 sm:px-6 py-2.5 bg-[#F7F5F7] border-b border-[#E8E0E5] shrink-0">
            {subtotal >= freeThreshold ? (
              <p className="text-[11px] sm:text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <span>🎉</span>
                <span><strong>Congratulations!</strong> You get FREE Delivery</span>
              </p>
            ) : (
              <div className="space-y-1">
                <p className="text-[11px] text-[#2D252B] font-semibold flex items-center justify-between">
                  <span>Add <strong>₹{Math.max(0, freeThreshold - subtotal)}</strong> more for <strong>FREE Delivery</strong></span>
                  <span className="text-[10px] text-[#601D49] font-bold">{Math.round((subtotal / freeThreshold) * 100)}%</span>
                </p>
                <div className="w-full h-1.5 bg-[#F2DDE9] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#601D49] rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((subtotal / freeThreshold) * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cart Content: Items List or Empty State */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3.5 no-scrollbar">
          {cartItems.length === 0 ? (
            <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-6 space-y-4">
              <div className="w-20 h-20 rounded-full bg-[#F2DDE9] text-[#601D49] flex items-center justify-center text-3xl shadow-inner">
                🛍️
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-[#2D252B]">Your Cart is Empty</h3>
                <p className="text-xs text-[#6B5E68] max-w-xs">
                  Looks like you haven't added anything to your cart yet. Explore our fresh collection!
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-full bg-[#601D49] hover:bg-[#4D153A] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                Start Shopping Now →
              </button>
            </div>
          ) : (
            cartItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-[#E8E0E5] hover:border-[#601D49]/40 shadow-xs transition-all"
              >
                {/* Product Image */}
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-gray-50 overflow-hidden shrink-0 border border-gray-100">
                  <img
                    src={resolveImageUrl(item.image) || '/placeholder-product.svg'}
                    alt={item.name}
                    onError={(e) => {
                      e.currentTarget.src = '/placeholder-product.svg'
                    }}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>

                {/* Info & Quantity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <h4 className="text-xs sm:text-[13px] font-bold text-[#2D252B] leading-snug line-clamp-2">
                      {item.name}
                    </h4>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-gray-400 hover:text-red-500 p-1 rounded-md transition-colors text-xs font-bold cursor-pointer shrink-0"
                      title="Remove item"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="flex items-baseline gap-1.5 mt-1">
                    <span className="text-xs sm:text-sm font-black text-[#601D49]">
                      ₹{item.price}
                    </span>
                    {item.originalPrice > item.price && (
                      <span className="text-[10px] text-gray-400 line-through">
                        ₹{item.originalPrice}
                      </span>
                    )}
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-gray-50">
                    <div className="flex items-center border border-[#E8E0E5] rounded-lg bg-[#F8F3F6]">
                      <button
                        onClick={() => updateCartQuantity(item.id, Number(item.quantity) - 1)}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[#2D252B] font-bold hover:bg-[#F2DDE9] rounded-l-lg transition-colors cursor-pointer text-sm"
                        title="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="w-7 sm:w-8 text-center text-xs font-black text-[#2D252B]">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateCartQuantity(item.id, Number(item.quantity) + 1)}
                        className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-[#2D252B] font-bold hover:bg-[#F2DDE9] rounded-r-lg transition-colors cursor-pointer text-sm"
                        title="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <span className="text-xs font-extrabold text-[#601D49]">
                      ₹{(Number(item.price) || 0) * (Number(item.quantity) || 1)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Coupon, Summary & Checkout Button */}
        {cartItems.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-[#E8E0E5] bg-[#F8F3F6] shrink-0 space-y-3">
            
            {/* Coupon Section */}
            <div>
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>🏷️</span>
                    <span>Coupon <strong>{appliedCoupon}</strong> Applied (-₹{discountAmount.toFixed(2)})</span>
                  </div>
                  <button
                    onClick={handleRemoveCoupon}
                    className="text-red-500 hover:text-red-700 font-bold text-[11px] underline cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <form onSubmit={handleApplyCoupon} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="Enter coupon code..."
                        className="flex-1 h-9 px-3 rounded-xl border border-[#E8E0E5] text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none focus:border-[#601D49] bg-white"
                      />
                      <button
                        type="submit"
                        disabled={isApplyingCoupon}
                        className="h-9 px-4 rounded-xl bg-[#601D49] hover:bg-[#4D153A] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {isApplyingCoupon ? '...' : 'Apply'}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-[10px] text-red-500 font-semibold">{couponError}</p>
                    )}
                  </form>

                  {/* Available Database Coupons */}
                  {availableCoupons.length > 0 && (
                    <div className="pt-0.5">
                      <p className="text-[10px] font-bold text-[#6B5E68] uppercase tracking-wider mb-1">
                        Available Coupons:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {availableCoupons.map((c) => (
                          <button
                            key={c.id || c.code}
                            type="button"
                            onClick={() => applyCouponCode(c.code)}
                            disabled={isApplyingCoupon}
                            className="px-2 py-0.5 rounded-md bg-[#F7F5F7] hover:bg-[#F2DDE9] border border-[#E8E0E5] text-[#2D252B] font-extrabold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                            title={`Apply ${c.code}: ${c.description || c.name}`}
                          >
                            <span>🏷️ {c.code}</span>
                            <span className="text-[#601D49] font-medium">
                              ({c.discount_type === 'PERCENTAGE' ? `${c.discount_value}%` : `₹${c.discount_value}`})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Order Summary breakdown */}
            <div className="space-y-1.5 text-xs text-[#6B5E68] border-t border-[#E8E0E5] pt-2.5">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-bold text-[#2D252B]">₹{subtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-pink-700 font-semibold">
                  <span>Coupon Discount ({appliedCoupon})</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Delivery Charges</span>
                {deliveryCharge === 0 ? (
                  <span className="text-emerald-700 font-bold">FREE</span>
                ) : (
                  <span className="font-bold text-[#2D252B]">₹{deliveryCharge.toFixed(2)}</span>
                )}
              </div>
              <div className="flex justify-between text-sm sm:text-base font-black text-[#2D252B] border-t border-[#E8E0E5] pt-2">
                <span>Total Payable</span>
                <span className="text-[#601D49]">₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Checkout CTA Button */}
            <button
              onClick={() => {
                onClose()
                onProceedToCheckout?.({
                  items: cartItems,
                  subtotal,
                  discountAmount,
                  appliedCoupon,
                  deliveryCharge,
                  grandTotal,
                })
              }}
              className="w-full h-12 rounded-2xl bg-[#601D49] hover:bg-[#4D153A] active:scale-98 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-black/15 flex items-center justify-center gap-2 cursor-pointer transition-all"
            >
              <span>Proceed to Checkout</span>
              <span className="text-[#F2DDE9] font-black">₹{grandTotal} →</span>
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
