import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setCustomerSession, clearCustomerSession, getErrorMessage } from '../../lib/api'
import { mergeGuestCart } from '../../lib/cart'
import { mergeGuestWishlist } from '../../lib/wishlist'

export default function Login() {
  const navigate = useNavigate()

  const [mobileNumber, setMobileNumber] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Google Authentication State
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const googleBtnRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

  // Clear previous session on mount so no stale customer data lingers
  useEffect(() => {
    clearCustomerSession()
  }, [])

  // OTP Modal State
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [otpError, setOtpError] = useState('')
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [debugOtp, setDebugOtp] = useState(null)

  useEffect(() => {
    let timer
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [cooldown])

  // Handle Google Identity Services credential response
  const handleGoogleCredentialResponse = async (response) => {
    if (!response || !response.credential) {
      setError('Google authentication failed. No credential received.')
      return
    }

    // Always clear old session before processing new Google login
    clearCustomerSession()
    setIsGoogleLoading(true)
    setError('')

    try {
      const res = await api.post('/customers/google-login', {
        credential: response.credential,
      })

      if (res.data?.token && res.data?.customer) {
        setCustomerSession(res.data.token, res.data.customer)
        await Promise.allSettled([mergeGuestCart(), mergeGuestWishlist()])
      }

      setIsGoogleLoading(false)
      setSuccessMessage(`Welcome back, ${res.data.customer?.name || 'Customer'}!`)

      setTimeout(() => {
        navigate('/', { replace: true })
      }, 700)
    } catch (err) {
      setIsGoogleLoading(false)
      setError(getErrorMessage(err, 'Google authentication failed. Please try again.'))
    }
  }

  // Initialize Google Identity Services button
  useEffect(() => {
    if (!googleClientId) return

    const initGsi = () => {
      if (window.google?.accounts?.id && googleBtnRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          })

          googleBtnRef.current.innerHTML = ''
          const containerWidth = googleBtnRef.current.parentElement?.clientWidth || window.innerWidth - 64
          const buttonWidth = Math.min(360, Math.max(220, Math.floor(containerWidth)))

          window.google.accounts.id.renderButton(googleBtnRef.current, {
            type: 'standard',
            shape: 'rectangular',
            theme: 'outline',
            text: 'continue_with',
            size: 'large',
            logo_alignment: 'left',
            width: buttonWidth,
          })
        } catch (e) {
          console.error('Google Sign-In initialization failed:', e)
        }
      }
    }

    if (window.google?.accounts?.id) {
      initGsi()
    } else {
      const interval = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(interval)
          initGsi()
        }
      }, 200)
      return () => clearInterval(interval)
    }

    const handleResize = () => {
      initGsi()
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [googleClientId])

  const handleMobileChange = (e) => {
    const val = e.target.value.replace(/\D/g, '')
    setMobileNumber(val)
    if (error) setError('')
  }

  // Step 1: Send Login OTP
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const cleanMobile = mobileNumber.trim().replace(/\D/g, '')

    if (!cleanMobile) {
      setError('Please enter your mobile number')
      return
    }

    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Enter a valid 10-digit Indian mobile number')
      return
    }

    setIsSubmitting(true)

    try {
      const response = await api.post('/customers/otp/send', {
        phone: cleanMobile,
        purpose: 'LOGIN',
      })

      setIsSubmitting(false)
      setShowOtpModal(true)
      setOtpError('')
      setOtpValue('')
      setCooldown(response.data.cooldown_seconds || 60)
      if (response.data.debug_otp) {
        setDebugOtp(response.data.debug_otp)
      }
    } catch (err) {
      setIsSubmitting(false)
      setError(getErrorMessage(err, 'Failed to send OTP. Please try again.'))
    }
  }

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0) return
    const cleanMobile = mobileNumber.trim().replace(/\D/g, '')
    setOtpError('')

    try {
      const response = await api.post('/customers/otp/send', {
        phone: cleanMobile,
        purpose: 'LOGIN',
      })
      setCooldown(response.data.cooldown_seconds || 60)
      if (response.data.debug_otp) {
        setDebugOtp(response.data.debug_otp)
      }
    } catch (err) {
      setOtpError(getErrorMessage(err, 'Failed to resend OTP'))
    }
  }

  // Step 2: Verify Login OTP and authenticates customer
  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    const cleanMobile = mobileNumber.trim().replace(/\D/g, '')
    const cleanOtp = otpValue.trim()

    if (!cleanOtp || cleanOtp.length !== 6) {
      setOtpError('Please enter the 6-digit OTP')
      return
    }

    setIsVerifyingOtp(true)
    setOtpError('')

    try {
      const response = await api.post('/customers/otp/login', {
        phone: cleanMobile,
        otp: cleanOtp,
      })

      if (response.data?.token && response.data?.customer) {
        setCustomerSession(response.data.token, response.data.customer)
        await Promise.allSettled([mergeGuestCart(), mergeGuestWishlist()])
      }

      setIsVerifyingOtp(false)
      setShowOtpModal(false)
      setSuccessMessage(`Welcome back, ${response.data.customer?.name || 'Customer'}!`)

      setTimeout(() => {
        navigate('/')
      }, 1200)
    } catch (err) {
      setIsVerifyingOtp(false)
      setOtpError(getErrorMessage(err, 'Invalid or expired OTP. Please try again.'))
    }
  }

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen bg-[#FAF7F2] text-[#1E293B] relative overflow-y-auto lg:overflow-hidden flex flex-col justify-center selection:bg-emerald-100 selection:text-emerald-900 font-sans">
      {/* Decorative leafy & tomato accents */}
      <div className="absolute -top-4 -right-4 pointer-events-none select-none z-10 hidden md:block opacity-90">
        <svg width="150" height="150" viewBox="0 0 200 200" fill="none">
          <circle cx="150" cy="50" r="38" fill="#EF4444" />
          <circle cx="156" cy="45" r="38" fill="#DC2626" opacity="0.4" />
          <path d="M142 35 Q150 18 160 32 Q152 42 142 35Z" fill="#16A34A" />
          <circle cx="105" cy="40" r="32" fill="#E11D48" />
          <circle cx="108" cy="38" r="32" fill="#BE123C" opacity="0.3" />
          <path d="M96 24 Q104 12 114 26 Q106 34 96 24Z" fill="#15803D" />
          <path d="M125 15 C135 -5 170 10 160 30 C145 25 135 25 125 15 Z" fill="#22C55E" />
        </svg>
      </div>

      <div className="absolute -bottom-6 -right-6 pointer-events-none select-none z-10 hidden lg:block opacity-85">
        <svg width="160" height="160" viewBox="0 0 200 200" fill="none">
          <path d="M130 190 C120 130 180 120 200 170 C170 190 145 195 130 190 Z" fill="#15803D" />
          <path d="M160 140 C140 90 200 80 210 130 C190 145 175 145 160 140 Z" fill="#22C55E" />
          <circle cx="185" cy="185" r="28" fill="#DC2626" />
        </svg>
      </div>

      {/* Floating subtle leaves on the left */}
      <div className="absolute top-1/4 left-3 pointer-events-none select-none opacity-80 hidden md:block">
        <svg width="35" height="35" viewBox="0 0 100 100" fill="none" className="rotate-[-25deg]">
          <path d="M20 70 C10 40 50 10 80 25 C85 55 50 85 20 70 Z" fill="#16A34A" opacity="0.85" />
          <path d="M30 65 Q50 45 75 30" stroke="#86EFAC" strokeWidth="3" />
        </svg>
      </div>
      <div className="absolute top-2/3 left-6 pointer-events-none select-none opacity-60 hidden md:block">
        <svg width="30" height="30" viewBox="0 0 100 100" fill="none" className="rotate-[15deg]">
          <path d="M20 70 C10 40 50 10 80 25 C85 55 50 85 20 70 Z" fill="#15803D" opacity="0.8" />
        </svg>
      </div>

      {/* Bottom left organic wave background */}
      <div className="absolute bottom-0 left-0 w-72 h-28 pointer-events-none select-none z-0">
        <svg viewBox="0 0 400 180" fill="none" className="w-full h-full">
          <path d="M-40 180 C80 180 120 120 220 140 C280 152 320 180 380 180 L-40 180 Z" fill="#2E7D32" />
          <path d="M-50 180 C50 170 90 140 190 160 C240 170 300 180 340 180 L-50 180 Z" fill="#1B5E20" opacity="0.6" />
        </svg>
      </div>

      {/* Main Container - Compact viewport layout */}
      <div className="relative z-10 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 lg:py-2 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* LEFT SECTION (~45% - 5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-4 lg:space-y-5">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-green-700 flex items-center justify-center shadow-sm text-white shrink-0">
                <svg className="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#F97316" stroke="none" />
                </svg>
              </div>
              <div>
                <div className="flex items-baseline leading-none">
                  <span className="text-2xl font-black tracking-tight text-[#14532D]">Kirana</span>
                  <span className="text-2xl font-black tracking-tight text-[#E16B19]">Bazaar</span>
                </div>
                <p className="text-[10px] font-medium tracking-wide text-gray-500 uppercase mt-0.5">
                  Freshness at Your Doorstep
                </p>
              </div>
            </div>

            {/* Main Headline */}
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-[36px] font-extrabold text-[#14532D] leading-[1.18] tracking-tight">
                Welcome back!<br />
                <span className="text-[#15803D]">Fresh groceries are just a few clicks away.</span>
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-gray-600 leading-snug max-w-sm">
                Login with your mobile number to view orders, cart items and exclusive member deals.
              </p>
            </div>

            {/* 3 Key Feature Badges */}
            <div className="grid grid-cols-3 gap-2 pt-1 max-w-md">
              <div className="flex flex-col items-start">
                <div className="w-8.5 h-8.5 rounded-full bg-[#E8F5E9] text-[#16A34A] flex items-center justify-center mb-1.5 shadow-xs border border-emerald-100">
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                  </svg>
                </div>
                <h4 className="text-xs font-bold text-gray-900 leading-tight">Fresh Products</h4>
                <p className="text-[10px] text-gray-500 leading-tight">Handpicked daily</p>
              </div>

              <div className="flex flex-col items-start">
                <div className="w-8.5 h-8.5 rounded-full bg-[#E8F5E9] text-[#16A34A] flex items-center justify-center mb-1.5 shadow-xs border border-emerald-100">
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="1" y="3" width="15" height="13" rx="1" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <h4 className="text-xs font-bold text-gray-900 leading-tight">Fast Delivery</h4>
                <p className="text-[10px] text-gray-500 leading-tight">Right to your door</p>
              </div>

              <div className="flex flex-col items-start">
                <div className="w-8.5 h-8.5 rounded-full bg-[#E8F5E9] text-[#16A34A] flex items-center justify-center mb-1.5 shadow-xs border border-emerald-100">
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h4 className="text-xs font-bold text-gray-900 leading-tight">Best Prices</h4>
                <p className="text-[10px] text-gray-500 leading-tight">More value, always</p>
              </div>
            </div>

            {/* Grocery Crate Image & Slogan Stamp */}
            <div className="relative pt-1 max-w-sm">
              <div className="relative rounded-2xl overflow-hidden shadow-md border border-amber-100/60 bg-amber-50/20">
                <img
                  src="/images/grocery-crate.jpg"
                  alt="Fresh groceries in wooden crate"
                  className="w-full h-36 sm:h-44 lg:h-46 object-cover object-bottom"
                />
              </div>

              <div className="absolute -top-1.5 right-2 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-lg shadow-sm border border-emerald-100/80 rotate-[2deg] flex flex-col items-center">
                <span className="text-[11px] font-extrabold text-[#15803D] tracking-tight">
                  Good Food <span className="text-red-500">♡</span> Better Life
                </span>
                <div className="w-8 h-0.5 bg-emerald-500 rounded-full mt-0.5"></div>
              </div>
            </div>
          </div>

          {/* RIGHT SECTION (~55% - 7 cols) */}
          <div className="lg:col-span-7 flex justify-center lg:justify-end">
            <div className="w-full max-w-[460px] bg-white rounded-3xl p-4.5 sm:p-8 shadow-[0_15px_40px_rgba(20,83,45,0.06)] border border-stone-100 relative">
              
              {/* Form Header */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-13 h-13 rounded-full bg-[#EBF7EE] text-[#16A34A] flex items-center justify-center shrink-0">
                  <svg className="w-6.5 h-6.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-tight">
                    Welcome back
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    Login to continue shopping with KiranaBazaar.
                  </p>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
                  <svg className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="font-medium">{error}</p>
                </div>
              )}

              {/* Success Notification */}
              {successMessage && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <svg className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold">{successMessage}</p>
                    <p className="text-emerald-700 mt-0.5">Redirecting to home...</p>
                  </div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                
                {/* Mobile Number Field */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl border border-gray-200 bg-gray-50/50 flex items-center justify-center text-gray-500 shrink-0">
                      <svg className="w-4.5 h-4.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-emerald-600 focus-within:ring-1 focus-within:ring-emerald-600 transition-colors">
                        <span className="px-3 py-2 bg-gray-50/80 text-gray-500 font-semibold text-xs border-r border-gray-200 select-none">
                          +91
                        </span>
                        <input
                          type="tel"
                          maxLength="10"
                          disabled={isSubmitting || isGoogleLoading}
                          value={mobileNumber}
                          onChange={handleMobileChange}
                          placeholder="Enter 10 digit mobile number"
                          className="flex-1 h-10 px-3 text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:bg-gray-50"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2 relative">
                  <button
                    type="submit"
                    disabled={isSubmitting || isGoogleLoading}
                    className="w-full h-11.5 rounded-xl bg-[#1E824C] hover:bg-[#166534] active:bg-[#14532D] text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-sm shadow-emerald-800/15 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2 text-xs sm:text-sm">
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending OTP...
                      </span>
                    ) : (
                      <>
                        <span>Continue with OTP</span>
                        <svg className="w-4 h-4 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>

                  {/* Sparkle rays accent */}
                  <div className="absolute -top-1 -right-1 pointer-events-none select-none text-[#F59E0B]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" opacity="0.9" />
                      <circle cx="21" cy="4" r="1.5" />
                    </svg>
                  </div>
                </div>

                {/* Secure OTP badge */}
                <div className="flex items-center justify-center gap-1.5 text-gray-500 text-[11px] pt-1">
                  <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Secure OTP login • No password required</span>
                </div>

                {/* Divider */}
                <div className="relative my-3 pt-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-white text-gray-400 font-medium uppercase tracking-wider text-[11px]">
                      Or continue with
                    </span>
                  </div>
                </div>

                {/* Google Sign-in */}
                <div className="w-full">
                  {isGoogleLoading ? (
                    <div className="w-full h-11.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Authenticating with Google...</span>
                    </div>
                  ) : (
                    <div className="w-full flex justify-center">
                      {googleClientId ? (
                        <div
                          ref={googleBtnRef}
                          id="googleSignInDiv"
                          className="w-full flex justify-center min-h-[44px]"
                        ></div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setError('Google Sign-In requires VITE_GOOGLE_CLIENT_ID to be configured in apps/storefront/.env')}
                          disabled={isSubmitting || isGoogleLoading}
                          className="w-full h-11.5 rounded-xl border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-xs sm:text-sm flex items-center justify-center gap-3 transition-all cursor-pointer shadow-xs bg-white"
                        >
                          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
                            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" />
                            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z" />
                            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                          </svg>
                          <span>Continue with Google</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Register Redirect */}
                <div className="text-center pt-2 border-t border-gray-100">
                  <p className="text-xs sm:text-sm text-gray-600 font-medium">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-[#16A34A] hover:text-[#15803D] font-bold hover:underline">
                      Register
                    </Link>
                  </p>
                </div>

                {/* Terms and Privacy Policy */}
                <div className="text-center pt-1">
                  <p className="text-[10px] text-gray-400">
                    By logging in, you agree to our{' '}
                    <a href="#terms" className="underline hover:text-gray-600">
                      Terms & Privacy Policy
                    </a>
                    .
                  </p>
                </div>

              </form>
            </div>
          </div>

        </div>
      </div>

      {/* OTP Verification Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 sm:p-7 shadow-2xl border border-stone-100 relative">
            
            {/* Close Button */}
            <button
              onClick={() => setShowOtpModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors touch-target cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Modal Header */}
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-[#EBF7EE] text-[#16A34A] mx-auto flex items-center justify-center mb-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-extrabold text-gray-900">Verify Login OTP</h3>
              <p className="text-xs text-gray-500 mt-1">
                Enter the 6-digit code sent to <span className="font-semibold text-gray-800">+91 {mobileNumber}</span>
              </p>

              {/* Dev convenience badge */}
              {debugOtp && (
                <div className="mt-2 inline-block px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-mono">
                  🔑 Dev OTP: <strong>{debugOtp}</strong>
                </div>
              )}
            </div>

            {/* Modal Error */}
            {otpError && (
              <div className="mb-4 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{otpError}</span>
              </div>
            )}

            {/* OTP Form */}
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 text-center mb-2">
                  Enter 6-Digit Code
                </label>
                <input
                  type="text"
                  maxLength="6"
                  autoFocus
                  value={otpValue}
                  onChange={(e) => {
                    setOtpValue(e.target.value.replace(/\D/g, ''))
                    if (otpError) setOtpError('')
                  }}
                  placeholder="• • • • • •"
                  className="w-full h-12 text-center text-xl sm:text-2xl font-bold tracking-[0.2em] sm:tracking-[0.4em] rounded-xl border border-gray-200 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 text-gray-900 transition-all placeholder-gray-300"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingOtp || otpValue.length !== 6}
                className="w-full h-12 rounded-xl bg-[#1E824C] hover:bg-[#166534] active:bg-[#14532D] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-800/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifyingOtp ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying OTP & Logging In...
                  </span>
                ) : (
                  <span>Verify OTP</span>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer min-h-[40px] flex items-center"
                >
                  Edit mobile number
                </button>
                {cooldown > 0 ? (
                  <span className="text-gray-400 font-medium">
                    Resend code in <strong className="text-gray-600 font-semibold">{cooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-[#16A34A] hover:text-[#15803D] font-bold hover:underline cursor-pointer min-h-[40px] flex items-center"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
