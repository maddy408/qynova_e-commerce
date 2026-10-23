import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  FiLock,
  FiAlertCircle,
  FiX,
  FiArrowRight,
  FiDollarSign,
  FiSmartphone,
  FiCreditCard,
  FiMapPin,
  FiNavigation,
  FiCheck,
} from 'react-icons/fi'
import { api, getCustomerToken, fetchCustomerAddresses, saveCustomerAddress, resolveImageUrl } from '../lib/api'
import {
  getCurrentCoordinates,
  reverseGeocode,
  getStoredLocation,
  saveStoredLocation,
} from '../services/locationService'
import { clearCart } from '../lib/cart'
import { ROUTES } from '../routes/routes'
import { ENDPOINTS } from '../api/endpoints'
import { lookupPostalPincode } from '../services/pincodeService'

export default function CheckoutModal({ isOpen, onClose, cartData }) {
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    streetAddress: '',
    city: '',
    state: 'Rajasthan',
    pincode: '',
    paymentMethod: 'COD',
  })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orderConfirmed, setOrderConfirmed] = useState(false)
  const [confirmedOrderId, setConfirmedOrderId] = useState(null)
  const [submissionError, setSubmissionError] = useState('')

  // Saved Addresses and GPS state
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState(null)
  const [isDetectingGps, setIsDetectingGps] = useState(false)
  const [gpsSuccessBadge, setGpsSuccessBadge] = useState(null)
  const [saveAddressToProfile, setSaveAddressToProfile] = useState(false)

  // Delivery Management: real distance/weight-based quote for the
  // entered pincode + actual cart, once the pincode is a valid 6
  // digits — see DeliveryCalculationService on the backend. Replaces
  // the flat estimate CartDrawer seeded cartData.deliveryCharge with.
  const [deliveryQuote, setDeliveryQuote] = useState(null)
  const [isCheckingDelivery, setIsCheckingDelivery] = useState(false)
  const [deliveryCheckError, setDeliveryCheckError] = useState('')

  // Postal PIN Code Lookup & Auto-fill State
  const [isPincodeLookupLoading, setIsPincodeLookupLoading] = useState(false)
  const [pincodeLookupFeedback, setPincodeLookupFeedback] = useState(null)
  const [availablePostOffices, setAvailablePostOffices] = useState([])
  const [selectedPostOffice, setSelectedPostOffice] = useState('')

  // Prefill authenticated customer details from MySQL or stored GPS location
  useEffect(() => {
    if (isOpen) {
      const storedLocation = getStoredLocation()

      if (getCustomerToken()) {
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
              setSavedAddresses(addresses)
              const def = addresses.find((a) => a.is_default) || addresses[0]
              setSelectedAddressId(def.id)
              setFormData((prev) => ({
                ...prev,
                fullName: def.name || def.recipient_name || prev.fullName,
                phone: def.phone || prev.phone,
                streetAddress: def.line1 || def.street_address || def.address_line1 || prev.streetAddress,
                city: def.city_district || def.city || prev.city,
                state: def.state || prev.state,
                pincode: def.pincode || def.postal_code || prev.pincode,
              }))
            } else if (storedLocation) {
              // Fallback to active GPS/stored location if no saved addresses exist
              setFormData((prev) => ({
                ...prev,
                streetAddress: storedLocation.streetAddress || prev.streetAddress,
                city: storedLocation.city || prev.city,
                state: storedLocation.state || prev.state,
                pincode: storedLocation.pincode || prev.pincode,
              }))
              if (storedLocation.isGps && storedLocation.latitude) {
                setGpsSuccessBadge({
                  latitude: storedLocation.latitude,
                  longitude: storedLocation.longitude,
                  shortDisplay: storedLocation.shortDisplay,
                })
              }
            }
          })
          .catch(() => {})
      } else if (storedLocation) {
        // Guest user: prefill from stored GPS location if available
        setFormData((prev) => ({
          ...prev,
          streetAddress: storedLocation.streetAddress || prev.streetAddress,
          city: storedLocation.city || prev.city,
          state: storedLocation.state || prev.state,
          pincode: storedLocation.pincode || prev.pincode,
        }))
        if (storedLocation.isGps && storedLocation.latitude) {
          setGpsSuccessBadge({
            latitude: storedLocation.latitude,
            longitude: storedLocation.longitude,
            shortDisplay: storedLocation.shortDisplay,
          })
        }
      }
    }
  }, [isOpen])

  // GPS Current Location Detection Handler
  const handleUseCurrentLocation = async () => {
    setIsDetectingGps(true)
    setSubmissionError('')
    try {
      const coords = await getCurrentCoordinates()
      const result = await reverseGeocode(coords.latitude, coords.longitude)
      setSelectedAddressId('gps')
      setGpsSuccessBadge({
        latitude: coords.latitude,
        longitude: coords.longitude,
        shortDisplay: result.shortDisplay,
      })
      setFormData((prev) => ({
        ...prev,
        streetAddress: result.streetAddress || result.road || prev.streetAddress,
        city: result.city || prev.city,
        state: result.state || prev.state,
        pincode: result.pincode || prev.pincode,
      }))
      setErrors((prev) => ({
        ...prev,
        streetAddress: '',
        city: '',
        pincode: '',
      }))
      // Save to localStorage so top nav stays synchronized
      saveStoredLocation({
        latitude: coords.latitude,
        longitude: coords.longitude,
        city: result.city,
        state: result.state,
        pincode: result.pincode,
        streetAddress: result.streetAddress,
        formattedAddress: result.formattedAddress,
        displayTitle: result.displayTitle,
        displaySubtitle: result.displaySubtitle,
        shortDisplay: result.shortDisplay,
        isGps: true,
      })
    } catch (err) {
      setSubmissionError(err.message || 'Unable to retrieve your GPS location. Please check browser permissions.')
    } finally {
      setIsDetectingGps(false)
    }
  }

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

  // Real delivery quote (distance/type/ETA/₹ charge) for the entered
  // pincode + actual cart — debounced so it doesn't fire on every
  // keystroke, and only once the pincode looks like a real 6-digit PIN.
  useEffect(() => {
    if (!isOpen) return
    const pincode = formData.pincode.trim()
    const cartItems = cartData?.items || []

    if (!/^[0-9]{6}$/.test(pincode) || cartItems.length === 0) {
      setDeliveryQuote(null)
      setDeliveryCheckError('')
      return
    }

    const timer = setTimeout(() => {
      setIsCheckingDelivery(true)
      setDeliveryCheckError('')
      api
        .post(ENDPOINTS.ORDERS.PREVIEW, {
          items: cartItems.map((item) => ({
            variant_id: item.variant_id || item.variantId || item.id,
            quantity: Number(item.quantity) || 1,
          })),
          pincode,
        })
        .then((res) => setDeliveryQuote(res.data))
        .catch((err) => {
          setDeliveryQuote(null)
          setDeliveryCheckError(err.response?.data?.error || 'Could not check delivery for this pincode.')
        })
        .finally(() => setIsCheckingDelivery(false))
    }, 500)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, formData.pincode, cartData?.items])

  if (!isOpen) return null

  const items = cartData?.items || []
  const subtotal = Number(cartData?.subtotal) || 0
  const discountAmount = Number(cartData?.discountAmount) || 0
  // Once a real quote has come back for the entered pincode, it replaces
  // the flat estimate CartDrawer seeded cartData.deliveryCharge with.
  const deliveryCharge = deliveryQuote ? Number(deliveryQuote.shipping_total) || 0 : Number(cartData?.deliveryCharge) || 0
  const grandTotal = deliveryQuote
    ? Number(deliveryQuote.grand_total) || Math.max(0, subtotal - discountAmount + deliveryCharge)
    : Number(cartData?.grandTotal) || Math.max(0, subtotal - discountAmount + deliveryCharge)

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  // Postal PIN Code Lookup Handler (India Post API)
  const triggerPincodeLookup = async (pin) => {
    const cleanPin = String(pin !== undefined ? pin : formData.pincode || '').trim()
    if (!cleanPin || cleanPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(cleanPin)) {
      setErrors((prev) => ({
        ...prev,
        pincode: 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.',
      }))
      setPincodeLookupFeedback(null)
      return
    }

    setIsPincodeLookupLoading(true)
    setErrors((prev) => ({ ...prev, pincode: '' }))

    try {
      const res = await lookupPostalPincode(cleanPin)
      if (!res.valid) {
        setErrors((prev) => ({
          ...prev,
          pincode: res.error || 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.',
        }))
        setPincodeLookupFeedback(null)
        setAvailablePostOffices([])
        return
      }

      // Populate State and City/District without overwriting user's manually entered street address
      setFormData((prev) => ({
        ...prev,
        state: res.state || prev.state,
        city: res.city || prev.city,
      }))

      setAvailablePostOffices(res.postOffices || [])
      setSelectedPostOffice(res.postOffice || (res.postOffices && res.postOffices[0]) || '')

      setPincodeLookupFeedback({
        valid: true,
        location: res.formattedLocation,
        district: res.district,
        state: res.state,
        city: res.city,
      })
    } catch {
      setErrors((prev) => ({
        ...prev,
        pincode: 'Unable to verify PIN code right now. You can enter your address manually.',
      }))
    } finally {
      setIsPincodeLookupLoading(false)
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
    } else if (!/^[1-9][0-9]{5}$/.test(formData.pincode.trim())) {
      errs.pincode = 'Invalid PIN code. Please enter a valid 6-digit Indian PIN code.'
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
      // 1. Prepare the order payload in the shape OrderController::checkout()
      // / OrderService::checkout() actually read: top-level `items` +
      // `address` (nested — name/phone/line1/city_district/state/pincode,
      // not flat shipping_address/city strings) + `coupon_code`. The
      // backend re-resolves price/stock/tax from `items[].variant_id` and
      // `.quantity` itself — product_id/price here are display-only and
      // ignored server-side, never trusted.
      const orderPayload = {
        items: items.map((item) => ({
          variant_id: item.variant_id || item.variantId || item.id,
          product_id: item.product_id || item.productId || item.id,
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
        })),
        address: {
          name: formData.fullName,
          phone: formData.phone.replace(/[^0-9]/g, ''),
          line1: formData.streetAddress,
          city_district: formData.city,
          state: formData.state,
          pincode: formData.pincode,
        },
        coupon_code: cartData?.appliedCoupon || null,
        // Not yet persisted by the backend (OrderService::checkout has no
        // payment-method parameter) — kept here for when that's added.
        payment_method: formData.paymentMethod,
      }

      // 2. Post order directly to MySQL via PHP REST API
      const response = await api.post(ENDPOINTS.ORDERS.CHECKOUT, orderPayload)
      const orderId =
        response.data?.order?.order_no ||
        response.data?.order_no ||
        response.data?.order?.id ||
        `ORD-${Date.now().toString().slice(-6)}`

      setConfirmedOrderId(orderId)
      setOrderConfirmed(true)

      // Optionally persist this new/GPS address to customer profile
      if (saveAddressToProfile && getCustomerToken() && formData.streetAddress && formData.city && formData.pincode) {
        saveCustomerAddress({
          name: formData.fullName,
          phone: formData.phone.replace(/[^0-9]/g, ''),
          line1: formData.streetAddress,
          line2: '',
          city_district: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          address_type: 'HOME',
          is_default: 0,
        }).catch((e) => console.warn('Could not save address to profile:', e))
      }

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
      <div className="relative bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 sm:px-8 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-main)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-brand)] text-white flex items-center justify-center shadow-xs">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-[var(--color-text-main)]">
                {orderConfirmed ? 'Order Confirmed!' : !getCustomerToken() ? 'Sign In Required' : 'Secure Checkout'}
              </h2>
              <p className="text-[11px] text-[var(--color-text-muted)] font-medium">
                {orderConfirmed ? 'Thank you for your purchase' : !getCustomerToken() ? 'Please authenticate to complete checkout' : '100% Secure & Encrypted Transaction'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-gray-100 border border-[var(--color-border-subtle)] text-gray-600 flex items-center justify-center transition-colors cursor-pointer text-sm font-bold"
            title="Close"
          >
            <FiX className="w-4 h-4" />
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
              <h3 className="text-2xl font-black text-[var(--color-text-main)]">
                Congratulations, {formData.fullName}!
              </h3>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                Your order has been received and is being prepared for dispatch. We will send updates to{' '}
                <strong className="text-[var(--color-text-main)]">+91 {formData.phone}</strong>.
              </p>
            </div>

            {/* Order Card info */}
            <div className="max-w-md mx-auto bg-[var(--color-bg-main)] rounded-2xl p-4 sm:p-5 border border-[var(--color-border-subtle)] text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[var(--color-border-subtle)]">
                <span className="text-[var(--color-text-muted)] font-semibold">Order ID:</span>
                <span className="font-mono font-black text-[var(--color-text-main)] text-sm">{confirmedOrderId}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)] font-semibold">Payment Mode:</span>
                <span className="font-bold text-[var(--color-text-main)]">
                  {formData.paymentMethod === 'COD'
                    ? 'Cash on Delivery (Pay at Doorstep)'
                    : formData.paymentMethod === 'UPI'
                    ? 'UPI / Instant QR'
                    : 'Credit/Debit Card'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[var(--color-text-muted)] font-semibold">Total Amount:</span>
                <span className="font-black text-[var(--color-brand)] text-sm">₹{grandTotal}</span>
              </div>
              <div className="flex justify-between items-start pt-1">
                <span className="text-[var(--color-text-muted)] font-semibold">Deliver to:</span>
                <span className="font-medium text-[var(--color-text-main)] text-right max-w-[200px]">
                  {formData.streetAddress}, {formData.city}, {formData.state} - {formData.pincode}
                </span>
              </div>
            </div>

            <div className="pt-3">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-lg cursor-pointer flex items-center justify-center gap-1.5 mx-auto"
              >
                <span>Continue Shopping</span>
                <FiArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : !getCustomerToken() ? (
          <div className="p-8 sm:p-12 text-center space-y-6 overflow-y-auto">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-[var(--color-primary-tint)] text-[var(--color-brand)] flex items-center justify-center text-3xl shadow-inner">
              <FiLock className="w-8 h-8 text-[var(--color-brand)]" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-3 py-1 rounded-full">
                Authentication Required
              </span>
              <h3 className="text-2xl font-black text-[var(--color-text-main)]">
                Please Sign In to Checkout
              </h3>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                Log in or create an account to complete your order, apply your discounts, and track delivery progress.
              </p>
            </div>
            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center items-center max-w-sm mx-auto">
              <Link
                to={ROUTES.LOGIN}
                onClick={onClose}
                className="w-full sm:w-auto flex-1 px-8 py-3.5 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-extrabold text-xs uppercase tracking-wider shadow-lg hover:shadow-xl transition-all text-center cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Sign In / Register</span>
                <FiArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-3.5 rounded-full border border-[var(--color-border-subtle)] text-[var(--color-text-main)] font-bold text-xs uppercase tracking-wider hover:bg-[var(--color-primary-tint)] transition-colors cursor-pointer"
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
                  <FiAlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{submissionError}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSubmissionError('')}
                  className="text-red-500 hover:text-red-700 text-sm font-bold ml-2 cursor-pointer"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            )}
            <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
              
              {/* LEFT: Customer & Delivery Details (12 cols mobile, 7 cols desktop) */}
              <div className="lg:col-span-7 space-y-5">
                
                {/* 1. Contact Info */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--color-text-main)] tracking-wider">
                    <span>1. Customer Information</span>
                  </div>
                  
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">
                      Full Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleInputChange}
                      placeholder="e.g. Priya Sharma"
                      className={`w-full h-10 px-3.5 rounded-xl border text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/60 focus:outline-none transition-colors ${
                        errors.fullName ? 'border-red-400 bg-red-50/20' : 'border-[var(--color-border-subtle)] focus:border-[var(--color-brand)]'
                      }`}
                    />
                    {errors.fullName && <p className="text-[10px] text-red-500 mt-1">{errors.fullName}</p>}
                  </div>

                  {/* Phone & Email - Stack on mobile, side-by-side on tablet/desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center border border-[var(--color-border-subtle)] rounded-xl overflow-hidden focus-within:border-[var(--color-brand)]">
                        <span className="px-2.5 py-2 bg-[var(--color-bg-alt)] text-[var(--color-text-muted)] font-semibold text-xs border-r border-[var(--color-border-subtle)]">
                          +91
                        </span>
                        <input
                          type="tel"
                          name="phone"
                          maxLength={10}
                          value={formData.phone}
                          onChange={handleInputChange}
                          placeholder="10-digit mobile"
                          className="flex-1 h-10 px-2.5 text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/60 focus:outline-none"
                        />
                      </div>
                      {errors.phone && <p className="text-[10px] text-red-500 mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">
                        Email Address <span className="text-[var(--color-text-muted)] font-normal">(Optional)</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="For order receipts"
                        className="w-full h-10 px-3.5 rounded-xl border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/60 focus:outline-none focus:border-[var(--color-brand)]"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Delivery Address */}
                <div className="space-y-3 pt-2 border-t border-[var(--color-border-subtle)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--color-text-main)] tracking-wider">
                      <FiMapPin className="text-[#6C4EFF]" />
                      <span>2. Delivery Address</span>
                    </div>

                    {/* USE CURRENT GPS LOCATION BUTTON */}
                    <button
                      type="button"
                      disabled={isDetectingGps}
                      onClick={handleUseCurrentLocation}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FAF8FF] hover:bg-[#6C4EFF] hover:text-white text-[#6C4EFF] border border-[#E9DFFF] text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-60"
                      title="Auto-fill address using your current GPS coordinates"
                    >
                      {isDetectingGps ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span>Detecting GPS...</span>
                        </>
                      ) : (
                        <>
                          <FiNavigation className="w-3.5 h-3.5" />
                          <span>Use Current Location</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* GPS Live Feedback Badge */}
                  {gpsSuccessBadge && (
                    <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="font-bold">GPS Location Applied:</span>
                      </div>
                      <span>
                        Lat: {gpsSuccessBadge.latitude.toFixed(4)}, Lng: {gpsSuccessBadge.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}

                  {/* Saved Customer Addresses Quick Pills */}
                  {savedAddresses.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                        Or select a saved address:
                      </p>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {savedAddresses.map((addr) => {
                          const isSelected = selectedAddressId === addr.id
                          return (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={() => {
                                setSelectedAddressId(addr.id)
                                setGpsSuccessBadge(null)
                                setFormData((prev) => ({
                                  ...prev,
                                  fullName: addr.name || prev.fullName,
                                  phone: addr.phone || prev.phone,
                                  streetAddress: addr.line1 || addr.street_address || prev.streetAddress,
                                  city: addr.city_district || addr.city || prev.city,
                                  state: addr.state || prev.state,
                                  pincode: addr.pincode || prev.pincode,
                                }))
                                setErrors((prev) => ({
                                  ...prev,
                                  streetAddress: '',
                                  city: '',
                                  pincode: '',
                                }))
                              }}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                                isSelected
                                  ? 'border-[#6C4EFF] bg-[#FAF8FF] text-[#6C4EFF] shadow-xs'
                                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              <FiMapPin className="w-3 h-3 shrink-0" />
                              <span className="font-bold">{addr.address_type || 'Address'}:</span>
                              <span className="text-[11px] truncate max-w-[150px]">
                                {addr.line1}, {addr.city_district || addr.city}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">
                      Street Address / House No. / Landmark <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      name="streetAddress"
                      value={formData.streetAddress}
                      onChange={handleInputChange}
                      placeholder="Flat/House No., Building, Street Name, Area"
                      className={`w-full p-3 rounded-xl border text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/60 focus:outline-none transition-colors ${
                        errors.streetAddress ? 'border-red-400 bg-red-50/20' : 'border-[var(--color-border-subtle)] focus:border-[var(--color-brand)]'
                      }`}
                    />
                    {errors.streetAddress && <p className="text-[10px] text-red-500 mt-0.5">{errors.streetAddress}</p>}
                  </div>

                  {/* City, State, Pincode: Stacked or comfortable grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        placeholder="e.g. Bengaluru"
                        className={`w-full h-10 px-3 rounded-xl border text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/60 focus:outline-none ${
                          errors.city ? 'border-red-400 bg-red-50/20' : 'border-[var(--color-border-subtle)] focus:border-[var(--color-brand)]'
                        }`}
                      />
                      {errors.city && <p className="text-[10px] text-red-500 mt-1">{errors.city}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">State</label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        placeholder="State"
                        className="w-full h-10 px-3 rounded-xl border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-brand)]"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[var(--color-text-main)]">
                          Pincode <span className="text-red-500">*</span>
                        </label>
                        {isPincodeLookupLoading && (
                          <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-1">
                            <span className="w-2.5 h-2.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                            Detecting location...
                          </span>
                        )}
                      </div>
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          name="pincode"
                          maxLength={6}
                          value={formData.pincode}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                            setFormData((prev) => ({ ...prev, pincode: val }))
                            if (errors.pincode) setErrors((prev) => ({ ...prev, pincode: '' }))
                            if (val.length === 6) {
                              triggerPincodeLookup(val)
                            } else if (pincodeLookupFeedback) {
                              setPincodeLookupFeedback(null)
                              setAvailablePostOffices([])
                            }
                          }}
                          placeholder="6-digit PIN"
                          className={`w-full h-10 pl-3 pr-16 rounded-xl border text-xs text-[var(--color-text-main)] placeholder-[var(--color-text-muted)]/60 focus:outline-none ${
                            errors.pincode ? 'border-red-400 bg-red-50/20' : 'border-[var(--color-border-subtle)] focus:border-[var(--color-brand)]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => triggerPincodeLookup(formData.pincode)}
                          disabled={isPincodeLookupLoading || (formData.pincode || '').length !== 6}
                          className="absolute right-1.5 px-2.5 py-1 text-[11px] font-bold text-[var(--color-brand)] bg-gray-100 hover:bg-[var(--color-primary-tint)] rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {isPincodeLookupLoading ? '...' : 'Check'}
                        </button>
                      </div>
                      {errors.pincode && <p className="text-[10px] text-red-500 mt-1">{errors.pincode}</p>}
                    </div>
                  </div>

                  {/* Postal Lookup Success Feedback */}
                  {pincodeLookupFeedback?.valid && (
                    <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                      <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div className="flex-1 text-[11px]">
                        <span className="font-bold">Location Auto-Filled:</span>{' '}
                        <span className="font-semibold text-emerald-800">{pincodeLookupFeedback.location}</span>
                      </div>
                    </div>
                  )}

                  {/* Multiple Post Offices Selection */}
                  {availablePostOffices.length > 1 && (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-text-main)] mb-1">
                        Select Post Office / Locality ({availablePostOffices.length} options for PIN {formData.pincode})
                      </label>
                      <select
                        value={selectedPostOffice}
                        onChange={(e) => {
                          const selected = e.target.value
                          setSelectedPostOffice(selected)
                          if (selected) {
                            setFormData((prev) => ({
                              ...prev,
                              city: `${selected}${pincodeLookupFeedback?.district ? `, ${pincodeLookupFeedback.district}` : ''}`,
                            }))
                          }
                        }}
                        className="w-full h-10 px-3 rounded-xl border border-[var(--color-border-subtle)] bg-white text-xs text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-brand)]"
                      >
                        {availablePostOffices.map((po) => (
                          <option key={po} value={po}>
                            {po} (Post Office)
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        Choose your exact locality/village post office from this PIN code.
                      </p>
                    </div>
                  )}

                  {/* Delivery Management: real distance/weight-based quote for this pincode */}
                  {isCheckingDelivery && (
                    <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Checking delivery for this pincode…
                    </p>
                  )}
                  {!isCheckingDelivery && deliveryCheckError && (
                    <p className="text-[11px] text-red-500">{deliveryCheckError}</p>
                  )}
                  {!isCheckingDelivery && deliveryQuote && (
                    <div
                      className={`rounded-xl border px-3 py-2.5 text-xs ${
                        deliveryQuote.delivery_type === 'OWN_DELIVERY'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-[var(--color-bg-main)] border-[var(--color-border-subtle)] text-[var(--color-text-main)]'
                      }`}
                    >
                      <p className="font-bold">
                        {deliveryQuote.delivery_type === 'OWN_DELIVERY'
                          ? `Delivered by the shop — ${deliveryQuote.delivery_days} day${deliveryQuote.delivery_days === 1 ? '' : 's'}`
                          : `India Post — ${deliveryQuote.delivery_days ? `up to ${deliveryQuote.delivery_days}` : '2-3'} days`}
                        {deliveryQuote.delivery_distance_km != null && (
                          <span className="font-normal text-[var(--color-text-muted)]"> ({deliveryQuote.delivery_distance_km} km away)</span>
                        )}
                      </p>
                      <p className="mt-0.5">
                        {Number(deliveryQuote.shipping_total) === 0 ? (
                          <span className="font-bold text-emerald-700">
                            Free delivery{deliveryQuote.is_first_order_delivery ? ' — your first order!' : ''}
                          </span>
                        ) : (
                          <span>
                            Delivery charge: <span className="font-bold">₹{deliveryQuote.shipping_total}</span>
                            {deliveryQuote.delivery_breakdown?.reason === 'weight_based' && (
                              <span className="text-[var(--color-text-muted)]">
                                {' '}
                                ({deliveryQuote.delivery_breakdown.total_weight_kg}kg × ₹{deliveryQuote.delivery_breakdown.price_per_kg}/kg)
                              </span>
                            )}
                            {deliveryQuote.delivery_breakdown?.reason === 'flat_fallback_no_weight_data' && (
                              <span className="text-[var(--color-text-muted)]"> (flat rate — weight not available)</span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Save to Profile Checkbox (If Authenticated) */}
                  {getCustomerToken() && (
                    <div className="pt-1">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-gray-700">
                        <input
                          type="checkbox"
                          checked={saveAddressToProfile}
                          onChange={(e) => setSaveAddressToProfile(e.target.checked)}
                          className="w-4 h-4 rounded text-[#6C4EFF] focus:ring-[#6C4EFF]"
                        />
                        <span>Save this delivery address to my account profile</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* 3. Payment Method: Big Touch Tiles */}
                <div className="space-y-2.5 pt-2 border-t border-[var(--color-border-subtle)]">
                  <div className="flex items-center gap-2 text-xs font-black uppercase text-[var(--color-text-main)] tracking-wider">
                    <span>3. Payment Options</span>
                  </div>

                  <div className="space-y-2">
                    {/* COD Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'COD'
                          ? 'border-[var(--color-brand)] bg-[var(--color-primary-tint)]/40 shadow-xs'
                          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand)]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="COD"
                        checked={formData.paymentMethod === 'COD'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-[var(--color-text-main)] flex items-center gap-1.5">
                            <FiDollarSign className="w-4 h-4 text-emerald-600" />
                            <span>Cash on Delivery (COD)</span>
                          </span>
                          <span className="text-[10px] font-bold text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-2 py-0.5 rounded">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Pay in cash or UPI when your order arrives</p>
                      </div>
                    </label>

                    {/* UPI Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'UPI'
                          ? 'border-[var(--color-brand)] bg-[var(--color-primary-tint)]/40 shadow-xs'
                          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand)]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="UPI"
                        checked={formData.paymentMethod === 'UPI'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs sm:text-sm font-bold text-[var(--color-text-main)] flex items-center gap-1.5">
                            <FiSmartphone className="w-4 h-4 text-blue-600" />
                            <span>UPI (GPay / PhonePe / Paytm)</span>
                          </span>
                          <span className="text-[10px] font-bold text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-2 py-0.5 rounded">
                            Instant
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Scan QR or enter UPI ID at delivery</p>
                      </div>
                    </label>

                    {/* Card Option */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        formData.paymentMethod === 'CARD'
                          ? 'border-[var(--color-brand)] bg-[var(--color-primary-tint)]/40 shadow-xs'
                          : 'border-[var(--color-border-subtle)] hover:border-[var(--color-brand)]/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="CARD"
                        checked={formData.paymentMethod === 'CARD'}
                        onChange={handleInputChange}
                        className="w-4 h-4 text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs sm:text-sm font-bold text-[var(--color-text-main)] flex items-center gap-1.5">
                          <FiCreditCard className="w-4 h-4 text-purple-600" />
                          <span>Debit / Credit Card & Net Banking</span>
                        </span>
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Visa, Mastercard, RuPay & All Major Banks</p>
                      </div>
                    </label>
                  </div>
                </div>

              </div>

              {/* RIGHT: Order Summary Card (12 cols mobile, 5 cols desktop) */}
              <div className="lg:col-span-5">
                <div className="bg-[var(--color-bg-main)] rounded-2xl p-4 sm:p-5 border border-[var(--color-border-subtle)] space-y-4 lg:sticky lg:top-4">
                  <h3 className="text-xs font-black uppercase text-[var(--color-text-main)] tracking-wider">
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
                            className="w-9 h-9 rounded-lg object-cover border border-[var(--color-border-subtle)] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--color-text-main)] truncate">{it.name}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)]">Qty: {it.quantity}</p>
                          </div>
                        </div>
                        <span className="font-black text-[var(--color-text-main)] shrink-0">
                          ₹{(Number(it.price) || 0) * (Number(it.quantity) || 1)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Price Calculation */}
                  <div className="space-y-1.5 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border-subtle)] pt-3">
                    <div className="flex justify-between">
                      <span>Item Subtotal</span>
                      <span className="font-bold text-[var(--color-text-main)]">₹{subtotal}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-[var(--color-brand)] font-semibold">
                        <span>Discount Savings</span>
                        <span>-₹{discountAmount}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      {deliveryCharge === 0 ? (
                        <span className="text-emerald-700 font-bold">FREE</span>
                      ) : (
                        <span className="font-bold text-[var(--color-text-main)]">₹{deliveryCharge}</span>
                      )}
                    </div>
                    <div className="flex justify-between text-base font-black text-[var(--color-text-main)] border-t border-[var(--color-border-subtle)] pt-2">
                      <span>Final Payable</span>
                      <span className="text-[var(--color-brand)]">₹{grandTotal}</span>
                    </div>
                  </div>

                  {/* Place Order CTA Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 rounded-2xl bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] active:scale-98 text-white font-extrabold text-sm shadow-xl shadow-black/15 flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-75"
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
                        <span className="text-white/90 font-black flex items-center gap-1">
                          <span>₹{grandTotal}</span>
                          <FiArrowRight className="w-4 h-4" />
                        </span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-[var(--color-text-muted)] text-center flex items-center justify-center gap-1">
                    <FiLock className="w-3 h-3 text-emerald-600 inline" />
                    <span>Guaranteed Safe & Secure Checkout • 7-Day Easy Returns</span>
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
