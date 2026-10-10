import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, getCustomerToken, fetchCustomerAddresses, resolveImageUrl } from '../lib/api'
import { clearCart } from '../lib/cart'

export default function CheckoutModal({ isOpen, onClose, cartData }) {
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    streetAddress: '',
    city: '',
    state: 'Karnataka',
    pincode: '',
    paymentMethod: 'COD',
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [confirmedOrderId, setConfirmedOrderId] = useState(null)
  const [submissionError, setSubmissionError] = useState('')

  // Prefill authenticated customer details from MySQL
  useEffect(() => {
    if (isOpen && getCustomerToken()) {
      try {
        const stored = localStorage.getItem('customer_data')
        if (stored) {
          const user = JSON.parse(stored)
          setFormData((prev) => ({
            ...prev,
            fullName: user.name || prev.fullName,
            phone: user.phone || prev.phone,
            email: user.email || prev.email,
          }))
        }
      } catch {
        // ignore
      }

      fetchCustomerAddresses()
        .then((res) => {
          const addresses = res.addresses || res.data || []
          if (Array.isArray(addresses) && addresses.length > 0) {
            const def = addresses.find((a) => a.is_default) || addresses[0]
            setFormData((prev) => ({
              ...prev,
              fullName: def.name || def.recipient_name || prev.fullName,
              phone: def.phone || prev.phone,
              streetAddress: def.street_address || def.address_line1 || prev.streetAddress,
              city: def.city || prev.city,
              state: def.state || prev.state,
              pincode: def.pincode || def.postal_code || prev.pincode,
            }))
          }
        })
        .catch(() => {})
    }
  }, [isOpen])

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setOrderConfirmed(false)
      setConfirmedOrderId(null)
      setSubmissionError('')
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  const items = cartData?.items || []
  const subtotal = Number(cartData?.subtotal) || 0
  const discountAmount = Number(cartData?.discountAmount) || 0
  const deliveryCharge = Number(cartData?.deliveryCharge) || 0
  const grandTotal = Number(cartData?.grandTotal) || Math.max(0, subtotal - discountAmount + deliveryCharge)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const errs = {}
    if (!formData.fullName.trim()) errs.fullName = 'Full Name is required'
    if (!formData.phone.trim()) {
      errs.phone = 'Mobile number is required'
    } else if (!/^[0-9]{10}$/.test(formData.phone.replace(/[^0-9]/g, ''))) {
      errs.phone = 'Please enter a valid 10-digit mobile number'
    }
    if (!formData.streetAddress.trim()) errs.streetAddress = 'Delivery address is required'
    if (!formData.city.trim()) errs.city = 'City is required'
    if (!formData.pincode.trim()) {
      errs.pincode = 'Pincode is required'
    } else if (!/^[0-9]{6}$/.test(formData.pincode.trim())) {
      errs.pincode = 'Please enter a valid 6-digit pincode'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setSubmissionError('')

    try {
      // 1. Prepare production order payload
      const orderPayload = {
        customer_name: formData.fullName,
        customer_phone: formData.phone.replace(/[^0-9]/g, ''),
        customer_email: formData.email || null,
        shipping_address: `${formData.streetAddress}, ${formData.city}, ${formData.state} - ${formData.pincode}`,
        billing_address: `${formData.streetAddress}, ${formData.city}, ${formData.state} - ${formData.pincode}`,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        payment_method: formData.paymentMethod,
        coupon_code: cartData?.appliedCoupon || null,
        items: items.map((item) => ({
          variant_id: item.variant_id || item.variantId || item.id,
          product_id: item.product_id || item.productId || item.id,
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
        })),
      }

      // 2. Post order directly to MySQL via PHP REST API
      const response = await api.post('/orders', orderPayload)
      const orderId =
        response.data?.order?.order_no ||
        response.data?.order_no ||
        response.data?.order?.id ||
        `ORD-${Date.now().toString().slice(-6)}`

      setConfirmedOrderId(orderId)
      setOrderConfirmed(true)

      // 3. Clear shopping cart in local storage and database
      clearCart()
      window.dispatchEvent(new CustomEvent('cart-updated'))
    } catch (err) {
      console.error('Failed to place order:', err)
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Unable to process order. Please verify your stock availability and try again.'
      setSubmissionError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 lg:p-6 animate-in fade-in duration-200">
      
      {/* Container */}
      <div className="relative bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-[#E8E0E5] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#601D49] text-white flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[#2D252B]">
                {orderConfirmed ? 'Order Confirmed!' : !getCustomerToken() ? 'Sign In Required' : 'Secure Checkout'}
              </h2>
              <p className="text-[11px] text-[#6B5E68] font-medium">
                {orderConfirmed ? 'Thank you for your purchase' : !getCustomerToken() ? 'Please authenticate to complete checkout' : '100% Secure & Encrypted Transaction'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-gray-100 border border-[#E8E0E5] text-gray-600 flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
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
              <h3 className="text-2xl font-black text-[#2D252B]">
                Congratulations, {formData.fullName}!
              </h3>
              <p className="text-xs sm:text-sm text-[#6B5E68] max-w-md mx-auto leading-relaxed">
                Your order has been received and is being prepared for dispatch. We will send updates to{' '}
                <strong className="text-[#2D252B]">+91 {formData.phone}</strong>.
              </p>
            </div>

            {/* Order Card info */}
            <div className="max-w-md mx-auto bg-[#F8F3F6] rounded-2xl p-4 sm:p-5 border border-[#E8E0E5] text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[#E8E0E5]">
                <span className="text-[#6B5E68] font-semibold">Order ID:</span>
                <span className="font-mono font-black text-[#2D252B] text-sm">{confirmedOrderId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B5E68] font-semibold">Payment Mode:</span>
                <span className="font-bold text-[#2D252B]">
                  {formData.paymentMethod === 'COD'
                    ? 'Cash on Delivery (Pay at Doorstep)'
                    : formData.paymentMethod === 'UPI'
                    ? 'UPI / Instant QR'
                    : 'Credit/Debit Card'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#6B5E68] font-semibold">Total Amount:</span>
                <span className="font-black text-[#601D49] text-sm">₹{grandTotal}</span>
              </div>
              <div className="flex justify-between items-start pt-1">
                <span className="text-[#6B5E68] font-semibold">Deliver to:</span>
                <span className="font-medium text-[#2D252B] text-right max-w-[200px]">
                  {formData.streetAddress}, {formData.city}, {formData.state} - {formData.pincode}
                </span>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#601D49] hover:bg-[#4D153A] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer"
              >
                Continue Shopping →
              </button>
            </div>
          </div>
        ) : !getCustomerToken() ? (
          <div className="p-8 sm:p-12 text-center space-y-6 overflow-y-auto">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-[#F2DDE9] text-[#601D49] flex items-center justify-center text-3xl shadow-inner">
              🔒
            </div>
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#601D49] bg-[#F2DDE9] px-3 py-1 rounded-full">
                Authentication Required
              </span>
              <h3 className="text-2xl font-black text-[#2D252B]">
                Please Sign In to Checkout
              </h3>
              <p className="text-xs sm:text-sm text-[#6B5E68] max-w-md mx-auto leading-relaxed">
                Log in or create an account to complete your order, apply your discounts, and track delivery progress.
              </p>
            </div>
            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center items-center max-w-sm mx-auto">
              <Link
                to="/login"
                onClick={onClose}
                className="w-full sm:w-auto flex-1 px-8 py-3.5 rounded-full bg-[#601D49] hover:bg-[#4D153A] text-white font-extrabold text-xs uppercase tracking-wider shadow-lg hover:shadow-xl transition-all text-center cursor-pointer"
              >
                Sign In / Register →
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3.5 rounded-full border border-[#E8E0E5] text-[#2D252B] font-bold text-xs uppercase tracking-wider hover:bg-[#F2DDE9] transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* CHECKOUT FORM & SUMMARY: Fully Responsive Grid */
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 no-scrollbar">
            {submissionError && (
              <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-semibold flex items-center justify-between shadow-xs">
                <span className="flex items-center gap-2">
                  <span className="text-base">⚠️</span> {submissionError}
                </span>
                <button
                  type="button"
                  onClick={() => setSubmissionError('')}
                  className="text-red-500 hover:text-red-700 text-sm font-bold ml-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}
            <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              
              {/* LEFT: Customer & Delivery Details (12 cols mobile, 7 cols desktop) */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* 1. Contact Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[#2D252B] tracking-wider">
                    <span>1. Customer Information</span>
                  </div>
                  
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-[#2D252B] mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="e.g. Priya Sharma"
                      className={`w-full h-10 px-3.5 rounded-xl border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                        errors.fullName ? 'border-red-400 bg-red-50/20' : 'border-[#E8E0E5] focus:border-[#601D49]'
                      }`}
                    />
                    {errors.fullName && <p className="text-[10px] text-red-500 mt-1">{errors.fullName}</p>}
                  </div>

                  {/* Phone & Email - Stack on mobile, side-by-side on tablet/desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#2D252B] mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center border border-[#E8E0E5] rounded-xl overflow-hidden focus-within:border-[#601D49]">
                        <span className="px-2.5 py-2 bg-[#F7F5F7] text-[#6B5E68] font-semibold text-xs border-r border-[#E8E0E5]">
                          +91
                        </span>
                        <input
                          type="tel"
                          name="phone"
                          maxLength={10}
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="10-digit mobile"
                          className="flex-1 h-10 px-2.5 text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none"
                        />
                      </div>
                      {errors.phone && <p className="text-[10px] text-red-500 mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#2D252B] mb-1">
                        Email Address <span className="text-[#6B5E68] font-normal">(Optional)</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="For order receipts"
                        className="w-full h-10 px-3.5 rounded-xl border border-[#E8E0E5] text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none focus:border-[#601D49]"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Delivery Address */}
                <div className="space-y-3 pt-2 border-t border-[#E8E0E5]">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[#2D252B] tracking-wider">
                    <span>2. Delivery Address</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#2D252B] mb-1">
                      Street Address / House No. / Landmark <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      name="streetAddress"
                      value={formData.streetAddress}
                      onChange={handleInputChange}
                      placeholder="Flat/House No., Building, Street Name, Area"
                      className={`w-full p-3 rounded-xl border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                        errors.streetAddress ? 'border-red-400 bg-red-50/20' : 'border-[#E8E0E5] focus:border-[#601D49]'
                      }`}
                    />
                    {errors.streetAddress && <p className="text-[10px] text-red-500 mt-0.5">{errors.streetAddress}</p>}
                  </div>

                  {/* City, State, Pincode: Stacked or comfortable grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#2D252B] mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        placeholder="e.g. Bengaluru"
                        className={`w-full h-10 px-3 rounded-xl border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none ${
                          errors.city ? 'border-red-400 bg-red-50/20' : 'border-[#E8E0E5] focus:border-[#601D49]'
                        }`}
                      />
                      {errors.city && <p className="text-[10px] text-red-500 mt-1">{errors.city}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#2D252B] mb-1">State</label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="State"
                        className="w-full h-10 px-3 rounded-xl border border-[#E8E0E5] text-xs text-[#2D252B] focus:outline-none focus:border-[#601D49]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#2D252B] mb-1">
                        Pincode <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="pincode"
                        maxLength={6}
                        value={formData.pincode}
                        onChange={handleInputChange}
                        placeholder="6-digit PIN"
                        className={`w-full h-10 px-3 rounded-xl border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none ${
                          errors.pincode ? 'border-red-400 bg-red-50/20' : 'border-[#E8E0E5] focus:border-[#601D49]'
                        }`}
                      />
                      {errors.pincode && <p className="text-[10px] text-red-500 mt-1">{errors.pincode}</p>}
                    </div>
                  </div>
                </div>

                {/* 3. Payment Method: Big Touch Tiles */}
                <div className="space-y-2.5 pt-2 border-t border-[#E8E0E5]">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[#2D252B] tracking-wider">
                    <span>3. Payment Options</span>
                  </div>

                  <div className="space-y-2">
                    {/* COD Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'COD'
                          ? 'border-[#601D49] bg-[#F2DDE9]/40 shadow-xs'
                          : 'border-[#E8E0E5] hover:border-[#601D49]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="COD"
                        checked={formData.paymentMethod === 'COD'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-[#601D49] focus:ring-[#601D49]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-[#2D252B]">
                            💵 Cash on Delivery (COD)
                          </span>
                          <span className="text-[10px] font-bold text-[#601D49] bg-[#F2DDE9] px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-[#6B5E68] mt-0.5">Pay in cash or UPI when your order arrives</p>
                      </div>
                    </label>

                    {/* UPI Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'UPI'
                          ? 'border-[#601D49] bg-[#F2DDE9]/40 shadow-xs'
                          : 'border-[#E8E0E5] hover:border-[#601D49]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="UPI"
                        checked={formData.paymentMethod === 'UPI'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-[#601D49] focus:ring-[#601D49]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-[#2D252B]">
                            📱 UPI (GPay / PhonePe / Paytm)
                          </span>
                          <span className="text-[10px] font-bold text-[#601D49] bg-[#F2DDE9] px-2 py-0.5 rounded">
                            Instant
                          </span>
                        </div>
                        <p className="text-[11px] text-[#6B5E68] mt-0.5">Scan QR or enter UPI ID at delivery</p>
                      </div>
                    </label>

                    {/* Card Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'CARD'
                          ? 'border-[#601D49] bg-[#F2DDE9]/40 shadow-xs'
                          : 'border-[#E8E0E5] hover:border-[#601D49]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="CARD"
                        checked={formData.paymentMethod === 'CARD'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-[#601D49] focus:ring-[#601D49]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs sm:text-sm font-bold text-[#2D252B]">
                          💳 Debit / Credit Card & Net Banking
                        </span>
                        <p className="text-[11px] text-[#6B5E68] mt-0.5">Visa, Mastercard, RuPay & All Major Banks</p>
                      </div>
                    </label>
                  </div>
                </div>

              </div>

              {/* RIGHT: Order Summary Card (12 cols mobile, 5 cols desktop) */}
              <div className="lg:col-span-5">
                <div className="bg-[#F8F3F6] rounded-2xl p-4 sm:p-5 border border-[#E8E0E5] space-y-4 lg:sticky lg:top-4">
                  <h3 className="text-xs font-black uppercase text-[#2D252B] tracking-wider">
                    Order Summary ({items.length} items)
                  </h3>

                  {/* Items miniature list */}
                  <div className="max-h-48 overflow-y-auto space-y-2 no-scrollbar pr-1">
                    {items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={resolveImageUrl(it.image) || '/placeholder-product.svg'}
                            alt={it.name}
                            onError={(e) => {
                              e.currentTarget.src = '/placeholder-product.svg'
                            }}
                            className="w-9 h-9 rounded-lg object-cover border border-[#E8E0E5] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-[#2D252B] truncate">{it.name}</p>
                            <p className="text-[10px] text-[#6B5E68]">Qty: {it.quantity}</p>
                          </div>
                        </div>
                        <span className="font-black text-[#2D252B] shrink-0">
                          ₹{(Number(it.price) || 0) * (Number(it.quantity) || 1)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Price Calculation */}
                  <div className="space-y-1.5 text-xs text-[#6B5E68] border-t border-[#E8E0E5] pt-3">
                    <div className="flex justify-between">
                      <span>Item Subtotal</span>
                      <span className="font-bold text-[#2D252B]">₹{subtotal}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[#601D49] font-semibold">
                        <span>Discount Savings</span>
                        <span>-₹{discountAmount}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      {deliveryCharge === 0 ? (
                        <span className="text-emerald-700 font-bold">FREE</span>
                      ) : (
                        <span className="font-bold text-[#2D252B]">₹{deliveryCharge}</span>
                      )}
                    </div>
                    <div className="flex justify-between text-base font-black text-[#2D252B] border-t border-[#E8E0E5] pt-2">
                      <span>Final Payable</span>
                      <span className="text-[#601D49]">₹{grandTotal}</span>
                    </div>
                  </div>

                  {/* Place Order CTA Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 rounded-2xl bg-[#601D49] hover:bg-[#4D153A] active:scale-98 text-white font-extrabold text-sm shadow-xl shadow-black/15 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-75"
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
                        <span className="text-white/90 font-black">₹{grandTotal} →</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-[#6B5E68] text-center">
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
