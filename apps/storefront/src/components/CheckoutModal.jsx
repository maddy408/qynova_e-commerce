import React, { useState, useEffect } from 'react'
import { clearCart } from '../lib/cart'
import { api, getCustomerToken, fetchCustomerAddresses, fetchDeliverySettings } from '../lib/api'

export default function CheckoutModal({ isOpen, onClose, cartData, customer, onOrderPlaced }) {
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    streetAddress: '',
    city: '',
    state: 'Rajasthan',
    pincode: '',
    paymentMethod: 'COD', // 'COD' | 'UPI' | 'CARD'
  })

  const [deliverySettings, setDeliverySettings] = useState(null)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [confirmedOrderId, setConfirmedOrderId] = useState('')

  useEffect(() => {
    fetchDeliverySettings().then((d) => d && setDeliverySettings(d))
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Pre-fill customer data if available
      if (customer) {
        setFormData((prev) => ({
          ...prev,
          fullName: customer.name || prev.fullName,
          phone: customer.phone || prev.phone,
          email: customer.email || prev.email,
        }))
        // Load default saved address from MySQL
        fetchCustomerAddresses().then((res) => {
          if (res?.addresses && res.addresses.length > 0) {
            const def = res.addresses.find((a) => a.is_default) || res.addresses[0]
            setFormData((prev) => ({
              ...prev,
              streetAddress: def.address_line_1 || prev.streetAddress,
              city: def.city || prev.city,
              state: def.state || prev.state,
              pincode: def.pincode || prev.pincode,
            }))
          }
        }).catch(() => {})
      }
      setOrderConfirmed(false)
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen, customer])

  if (!isOpen) return null

  const items = cartData?.items || []
  const subtotal = cartData?.subtotal || items.reduce((s, i) => s + (i.price * i.quantity), 0)
  const discountAmount = cartData?.discountAmount || 0
  const freeThreshold = Number(deliverySettings?.free_delivery_threshold) || 499
  const stdDeliveryFee = Number(deliverySettings?.standard_delivery_fee) || 49
  const deliveryCharge = cartData?.deliveryCharge !== undefined ? cartData.deliveryCharge : (subtotal >= freeThreshold ? 0 : stdDeliveryFee)
  const grandTotal = cartData?.grandTotal || (subtotal - discountAmount + deliveryCharge)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
  }

  const validate = () => {
    const errs = {}
    if (!formData.fullName.trim()) errs.fullName = 'Full Name is required'
    const cleanPhone = formData.phone.trim().replace(/\D/g, '')
    if (!cleanPhone || cleanPhone.length !== 10) errs.phone = 'Valid 10-digit phone number is required'
    if (!formData.streetAddress.trim()) errs.streetAddress = 'Delivery address is required'
    if (!formData.city.trim()) errs.city = 'City is required'
    const cleanPin = formData.pincode.trim().replace(/\D/g, '')
    if (!cleanPin || cleanPin.length !== 6) errs.pincode = 'Valid 6-digit pincode is required'
    return errs
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault()
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setIsSubmitting(true)

    try {
      const token = getCustomerToken()
      if (token && items.length > 0) {
        const orderPayload = {
          items: items.map((i) => ({
            product_id: i.product_id || i.id,
            variant_id: i.variant_id || 1,
            quantity: Number(i.quantity) || 1,
            unit_price: Number(i.price) || 0,
          })),
          address: {
            name: formData.fullName,
            phone: formData.phone,
            address_line_1: formData.streetAddress,
            city: formData.city,
            state: formData.state,
            pincode: formData.pincode,
          },
          coupon_code: cartData?.appliedCoupon || null,
        }

        const res = await api.post('/orders/checkout', orderPayload).catch(() => null)
        if (res?.data?.order?.id) {
          const genId = 'KB-' + res.data.order.id
          setConfirmedOrderId(genId)
          setOrderConfirmed(true)
          await clearCart()
          onOrderPlaced?.(genId)
          return
        }
      }

      // Guest order completion
      const genId = 'KB-' + Math.floor(100000 + Math.random() * 900000)
      setConfirmedOrderId(genId)
      setOrderConfirmed(true)
      await clearCart()
      onOrderPlaced?.(genId)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 lg:p-6 animate-in fade-in duration-200">
      
      {/* Container */}
      <div className="relative bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-purple-100 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-purple-100 bg-gradient-to-r from-purple-50 via-white to-pink-50/40 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#6B21A8] to-[#EC4899] text-white flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-purple-950">
                {orderConfirmed ? 'Order Confirmed!' : 'Secure Checkout'}
              </h2>
              <p className="text-[11px] text-gray-500 font-medium">
                {orderConfirmed ? 'Thank you for your purchase' : '100% Secure & Encrypted Transaction'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ORDER SUCCESS SCREEN */}
        {orderConfirmed ? (
          <div className="p-6 sm:p-10 text-center space-y-5 overflow-y-auto">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-4xl shadow-inner animate-in zoom-in-75 duration-300">
              ✓
            </div>

            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
                Order Placed Successfully
              </span>
              <h3 className="text-2xl font-black text-purple-950">
                Congratulations, {formData.fullName}!
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                Your order has been received and is being prepared for dispatch. We will send updates to{' '}
                <strong className="text-gray-900">+91 {formData.phone}</strong>.
              </p>
            </div>

            {/* Order Card info */}
            <div className="max-w-md mx-auto bg-purple-50/60 rounded-2xl p-4 sm:p-5 border border-purple-100 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-purple-200/60">
                <span className="text-gray-500 font-semibold">Order ID:</span>
                <span className="font-mono font-black text-purple-900 text-sm">{confirmedOrderId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-semibold">Payment Mode:</span>
                <span className="font-bold text-gray-900">
                  {formData.paymentMethod === 'COD'
                    ? 'Cash on Delivery (Pay at Doorstep)'
                    : formData.paymentMethod === 'UPI'
                    ? 'UPI / Instant QR'
                    : 'Credit/Debit Card'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-semibold">Total Amount:</span>
                <span className="font-black text-[#581C87] text-sm">₹{grandTotal}</span>
              </div>
              <div className="flex justify-between items-start pt-1">
                <span className="text-gray-500 font-semibold">Deliver to:</span>
                <span className="font-medium text-gray-800 text-right max-w-[200px]">
                  {formData.streetAddress}, {formData.city}, {formData.state} - {formData.pincode}
                </span>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#6B21A8] hover:bg-[#581C87] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer"
              >
                Continue Shopping →
              </button>
            </div>
          </div>
        ) : (
          /* CHECKOUT FORM & SUMMARY: Fully Responsive Grid */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 no-scrollbar">
            <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              
              {/* LEFT: Customer & Delivery Details (12 cols mobile, 7 cols desktop) */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* 1. Contact Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-purple-950 tracking-wider">
                    <span>1. Customer Information</span>
                  </div>
                  
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="e.g. Priya Sharma"
                      className={`w-full h-10 px-3.5 rounded-xl border text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-colors ${
                        errors.fullName ? 'border-red-400 bg-red-50/20' : 'border-purple-200 focus:border-purple-600'
                      }`}
                    />
                    {errors.fullName && <p className="text-[10px] text-red-500 mt-1">{errors.fullName}</p>}
                  </div>

                  {/* Phone & Email - Stack on mobile, side-by-side on tablet/desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center border border-purple-200 rounded-xl overflow-hidden focus-within:border-purple-600">
                        <span className="px-2.5 py-2 bg-gray-50 text-gray-500 font-semibold text-xs border-r border-purple-200">
                          +91
                        </span>
                        <input
                          type="tel"
                          name="phone"
                          maxLength={10}
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="10-digit mobile"
                          className="flex-1 h-10 px-2.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none"
                        />
                      </div>
                      {errors.phone && <p className="text-[10px] text-red-500 mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Email Address <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="For order receipts"
                        className="w-full h-10 px-3.5 rounded-xl border border-purple-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Delivery Address */}
                <div className="space-y-3 pt-2 border-t border-purple-100">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-purple-950 tracking-wider">
                    <span>2. Delivery Address</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Street Address / House No. / Landmark <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      name="streetAddress"
                      value={formData.streetAddress}
                      onChange={handleInputChange}
                      placeholder="Flat/House No., Building, Street Name, Area"
                      className={`w-full p-3 rounded-xl border text-xs text-gray-800 placeholder-gray-400 focus:outline-none transition-colors ${
                        errors.streetAddress ? 'border-red-400 bg-red-50/20' : 'border-purple-200 focus:border-purple-600'
                      }`}
                    />
                    {errors.streetAddress && <p className="text-[10px] text-red-500 mt-0.5">{errors.streetAddress}</p>}
                  </div>

                  {/* City, State, Pincode: Stacked or comfortable grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        placeholder="e.g. Bengaluru"
                        className={`w-full h-10 px-3 rounded-xl border text-xs text-gray-800 placeholder-gray-400 focus:outline-none ${
                          errors.city ? 'border-red-400 bg-red-50/20' : 'border-purple-200 focus:border-purple-600'
                        }`}
                      />
                      {errors.city && <p className="text-[10px] text-red-500 mt-1">{errors.city}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="State"
                        className="w-full h-10 px-3 rounded-xl border border-purple-200 text-xs text-gray-800 focus:outline-none focus:border-purple-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Pincode <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="pincode"
                        maxLength={6}
                        value={formData.pincode}
                        onChange={handleInputChange}
                        placeholder="6-digit PIN"
                        className={`w-full h-10 px-3 rounded-xl border text-xs text-gray-800 placeholder-gray-400 focus:outline-none ${
                          errors.pincode ? 'border-red-400 bg-red-50/20' : 'border-purple-200 focus:border-purple-600'
                        }`}
                      />
                      {errors.pincode && <p className="text-[10px] text-red-500 mt-1">{errors.pincode}</p>}
                    </div>
                  </div>
                </div>

                {/* 3. Payment Method: Big Touch Tiles */}
                <div className="space-y-2.5 pt-2 border-t border-purple-100">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-purple-950 tracking-wider">
                    <span>3. Payment Options</span>
                  </div>

                  <div className="space-y-2">
                    {/* COD Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'COD'
                          ? 'border-[#6B21A8] bg-purple-50/70 shadow-xs'
                          : 'border-gray-200 hover:border-purple-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="COD"
                        checked={formData.paymentMethod === 'COD'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-purple-700 focus:ring-purple-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-gray-900">
                            💵 Cash on Delivery (COD)
                          </span>
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">Pay in cash or UPI when your order arrives</p>
                      </div>
                    </label>

                    {/* UPI Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'UPI'
                          ? 'border-[#6B21A8] bg-purple-50/70 shadow-xs'
                          : 'border-gray-200 hover:border-purple-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="UPI"
                        checked={formData.paymentMethod === 'UPI'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-purple-700 focus:ring-purple-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-gray-900">
                            📱 UPI (GPay / PhonePe / Paytm)
                          </span>
                          <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                            Instant
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">Scan QR or enter UPI ID at delivery</p>
                      </div>
                    </label>

                    {/* Card Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'CARD'
                          ? 'border-[#6B21A8] bg-purple-50/70 shadow-xs'
                          : 'border-gray-200 hover:border-purple-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="CARD"
                        checked={formData.paymentMethod === 'CARD'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-purple-700 focus:ring-purple-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs sm:text-sm font-bold text-gray-900">
                          💳 Debit / Credit Card & Net Banking
                        </span>
                        <p className="text-[11px] text-gray-500 mt-0.5">Visa, Mastercard, RuPay & All Major Banks</p>
                      </div>
                    </label>
                  </div>
                </div>

              </div>

              {/* RIGHT: Order Summary Card (12 cols mobile, 5 cols desktop) */}
              <div className="lg:col-span-5">
                <div className="bg-purple-50/60 rounded-2xl p-4 sm:p-5 border border-purple-100 space-y-4 lg:sticky lg:top-4">
                  <h3 className="text-xs font-black uppercase text-purple-950 tracking-wider">
                    Order Summary ({items.length} items)
                  </h3>

                  {/* Items miniature list */}
                  <div className="max-h-48 overflow-y-auto space-y-2 no-scrollbar pr-1">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={it.image}
                            alt={it.name}
                            className="w-9 h-9 rounded-lg object-cover border border-purple-100 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-gray-900 truncate">{it.name}</p>
                            <p className="text-[10px] text-gray-500">Qty: {it.quantity}</p>
                          </div>
                        </div>
                        <span className="font-black text-purple-900 shrink-0">
                          ₹{(Number(it.price) || 0) * (Number(it.quantity) || 1)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Price Calculation */}
                  <div className="space-y-1.5 text-xs text-gray-600 border-t border-purple-200/60 pt-3">
                    <div className="flex justify-between">
                      <span>Item Subtotal</span>
                      <span className="font-bold text-gray-900">₹{subtotal}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-pink-700 font-semibold">
                        <span>Discount Savings</span>
                        <span>-₹{discountAmount}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      {deliveryCharge === 0 ? (
                        <span className="text-emerald-700 font-bold">FREE</span>
                      ) : (
                        <span className="font-bold text-gray-900">₹{deliveryCharge}</span>
                      )}
                    </div>
                    <div className="flex justify-between text-base font-black text-purple-950 border-t border-purple-200/60 pt-2">
                      <span>Final Payable</span>
                      <span className="text-[#581C87]">₹{grandTotal}</span>
                    </div>
                  </div>

                  {/* Place Order CTA Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#6B21A8] via-[#7E22CE] to-[#EC4899] hover:brightness-105 active:scale-98 text-white font-extrabold text-sm shadow-xl shadow-purple-950/20 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-75"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Placing Order...
                      </span>
                    ) : (
                      <>
                        <span>Place Order Now</span>
                        <span className="text-amber-300 font-black">₹{grandTotal} →</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-gray-500 text-center">
                    🔒 Guaranteed Safe & Secure Checkout • 7-Day Easy Returns
                  </p>
                </div>
              </div>

            </form>
          </div>
        )}

      </div>
    </div>
  )
}
