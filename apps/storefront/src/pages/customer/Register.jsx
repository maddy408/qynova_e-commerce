import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, setCustomerSession, clearCustomerSession, getErrorMessage } from '../../lib/api'
import { mergeGuestCart } from '../../lib/cart'
import { mergeGuestWishlist } from '../../lib/wishlist'

export default function Register() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    fullName: '',
    mobileNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
  })

  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [referralPopupData, setReferralPopupData] = useState(null)

  // OTP Modal State
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpValue, setOtpValue] = useState('')
  const [otpError, setOtpError] = useState('')
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [debugOtp, setDebugOtp] = useState(null)

  useEffect(() => {
    clearCustomerSession()
  }, [])

  useEffect(() => {
    let timer
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((prev) => prev - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [cooldown])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }))
    }
    if (apiError) setApiError('')
  }

  const validate = () => {
    const newErrors = {}

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters'
    }

    const cleanMobile = formData.mobileNumber.trim().replace(/\D/g, '')
    if (!cleanMobile) {
      newErrors.mobileNumber = 'Mobile number is required'
    } else if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      newErrors.mobileNumber = 'Enter a valid 10-digit Indian mobile number'
    }

    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = 'Please enter a valid email address'
      }
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    return newErrors
  }

  // Step 1: Send OTP to mobile
  const handleInitiateSignup = async (e) => {
    e.preventDefault()
    setApiError('')
    const validationErrors = validate()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    const cleanMobile = formData.mobileNumber.trim().replace(/\D/g, '')
    setIsSubmitting(true)

    try {
      const response = await api.post('/customers/otp/send', {
        phone: cleanMobile,
        purpose: 'SIGNUP',
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
      const msg = getErrorMessage(err, 'Failed to send OTP. Please check your connection.')
      setApiError(msg)
    }
  }

  // Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0) return
    const cleanMobile = formData.mobileNumber.trim().replace(/\D/g, '')
    setOtpError('')

    try {
      const response = await api.post('/customers/otp/send', {
        phone: cleanMobile,
        purpose: 'SIGNUP',
      })
      setCooldown(response.data.cooldown_seconds || 60)
      if (response.data.debug_otp) {
        setDebugOtp(response.data.debug_otp)
      }
    } catch (err) {
      setOtpError(getErrorMessage(err, 'Failed to resend OTP'))
    }
  }

  // Step 2 & 3: Verify OTP then create customer record
  const handleVerifyAndRegister = async (e) => {
    e.preventDefault()
    const cleanMobile = formData.mobileNumber.trim().replace(/\D/g, '')
    const cleanOtp = otpValue.trim()

    if (!cleanOtp || cleanOtp.length !== 6) {
      setOtpError('Please enter the 6-digit OTP')
      return
    }

    setIsVerifyingOtp(true)
    setOtpError('')

    try {
      // 1. Verify OTP
      await api.post('/customers/otp/verify', {
        phone: cleanMobile,
        otp: cleanOtp,
        purpose: 'SIGNUP',
      })

      // 2. Complete Signup
      const signupPayload = {
        name: formData.fullName.trim(),
        phone: cleanMobile,
        email: formData.email.trim() ? formData.email.trim() : null,
        password: formData.password,
        confirm_password: formData.confirmPassword,
        referral_code: formData.referralCode ? formData.referralCode.trim() : null,
      }

      const signupRes = await api.post('/customers/signup', signupPayload)

      // Store JWT token and customer data
      if (signupRes.data?.token && signupRes.data?.customer) {
        setCustomerSession(signupRes.data.token, signupRes.data.customer)
        await Promise.allSettled([mergeGuestCart(), mergeGuestWishlist()])
      }

      setIsVerifyingOtp(false)
      setShowOtpModal(false)

      if (signupRes.data?.referral_applied && signupRes.data?.referral) {
        setReferralPopupData(signupRes.data.referral)
      } else {
        setSuccessMessage(`Account created successfully! Welcome, ${signupRes.data.customer?.name || formData.fullName}!`)
        // Redirect to home after 1.5 seconds
        setTimeout(() => {
          navigate('/')
        }, 1500)
      }
    } catch (err) {
      setIsVerifyingOtp(false)
      setOtpError(getErrorMessage(err, 'Verification or registration failed'))
    }
  }

  return (
    <div className="min-h-screen lg:h-screen lg:max-h-screen bg-[#F8F3F6] text-[#2D252B] relative overflow-y-auto lg:overflow-hidden flex flex-col justify-center selection:bg-[#F2DDE9] selection:text-[#2D252B] font-sans">
      {/* Subtle background ambient blur */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#F2DDE9]/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#F2DDE9]/30 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-3 lg:py-2 flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          
          {/* LEFT SECTION (~45% - 5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-3.5 lg:space-y-4">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#601D49] flex items-center justify-center shadow-sm text-white shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="21" r="1" />
                  <circle cx="19" cy="21" r="1" />
                  <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#F2DDE9" stroke="none" />
                </svg>
              </div>
              <div>
                <div className="flex items-baseline leading-none">
                  <span className="text-xl font-black tracking-tight text-[#2D252B]">Qynova</span>
                  <span className="text-xl font-black tracking-tight text-[#601D49]">.</span>
                </div>
                <p className="text-[10px] font-medium tracking-wide text-[#6B5E68] uppercase mt-0.5">
                  Curated Lifestyle Store
                </p>
              </div>
            </div>

            {/* Main Headline */}
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold text-[#2D252B] leading-[1.16] tracking-tight">
                Curated lifestyle,<br />
                <span className="text-[#601D49]">delivered to your doorstep.</span>
              </h1>
              <p className="mt-1.5 text-xs sm:text-sm text-[#6B5E68] leading-snug max-w-sm">
                Create your account and start shopping curated gifts, daily essentials and more.
              </p>
            </div>

            {/* 3 Key Feature Badges */}
            <div className="grid grid-cols-3 gap-2 pt-0.5 max-w-md">
              <div className="flex flex-col items-start">
                <div className="w-8 h-8 rounded-full bg-[#F7F5F7] text-[#601D49] flex items-center justify-center mb-1 shadow-xs border border-[#E8E0E5]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                    <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                  </svg>
                </div>
                <h4 className="text-[11px] font-bold text-[#2D252B] leading-tight">Curated Daily</h4>
                <p className="text-[9px] text-[#6B5E68] leading-tight">Quality you can trust</p>
              </div>

              <div className="flex flex-col items-start">
                <div className="w-8 h-8 rounded-full bg-[#F7F5F7] text-[#601D49] flex items-center justify-center mb-1 shadow-xs border border-[#E8E0E5]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="1" y="3" width="15" height="13" rx="1" />
                    <polygon points="16 8 20 8 23 11 23 16 16 16 8" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <h4 className="text-[11px] font-bold text-[#2D252B] leading-tight">Fast Delivery</h4>
                <p className="text-[9px] text-[#6B5E68] leading-tight">Right to your door</p>
              </div>

              <div className="flex flex-col items-start">
                <div className="w-8 h-8 rounded-full bg-[#F7F5F7] text-[#601D49] flex items-center justify-center mb-1 shadow-xs border border-[#E8E0E5]">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h4 className="text-[11px] font-bold text-[#2D252B] leading-tight">Best Prices</h4>
                <p className="text-[9px] text-[#6B5E68] leading-tight">More value, always</p>
              </div>
            </div>

            {/* Grocery Crate Image & Slogan Stamp */}
            <div className="relative pt-1 max-w-sm">
              <div className="relative rounded-2xl overflow-hidden shadow-md border border-amber-100/60 bg-amber-50/20">
                <img
                  src="/images/grocery-crate.jpg"
                  alt="Fresh groceries in wooden crate"
                  className="w-full h-36 sm:h-40 lg:h-42 object-cover object-bottom"
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
            <div className="w-full max-w-[490px] bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-6 shadow-[0_15px_35px_rgba(139,92,246,0.08)] border border-[#E8E0E5] relative">
              
              {/* Form Header */}
              <div className="flex items-center gap-3 mb-3.5">
                <div className="w-11 h-11 rounded-full bg-[#F7F5F7] text-[#601D49] flex items-center justify-center shrink-0">
                  <svg className="w-5.5 h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl sm:text-[22px] font-extrabold text-[#2D252B] tracking-tight leading-tight">
                    Create your account
                  </h2>
                  <p className="text-xs text-[#6B5E68] mt-0.5">
                    Join Qynova and start shopping today.
                  </p>
                </div>
              </div>

              {/* API Error Notification */}
              {apiError && (
                <div className="mb-2.5 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                  <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <p className="font-medium">{apiError}</p>
                </div>
              )}

              {/* Success Notification */}
              {successMessage && (
                <div className="mb-2.5 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="font-semibold">{successMessage}</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">Redirecting to shop...</p>
                  </div>
                </div>
              )}

              {/* Registration Form */}
              <form onSubmit={handleInitiateSignup} className="space-y-2.5">
                
                {/* 1. Full Name */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg border border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-center text-[#6B5E68] shrink-0">
                      <svg className="w-4 h-4 text-[#6B5E68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-[#2D252B] mb-0.5">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        className={`w-full h-9 px-3 rounded-lg border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                          errors.fullName
                            ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                            : 'border-[#E8E0E5] focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49]'
                        }`}
                      />
                    </div>
                  </div>
                  {errors.fullName && (
                    <p className="text-red-500 text-[10px] mt-0.5 ml-11">{errors.fullName}</p>
                  )}
                </div>

                {/* 2. Mobile Number */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg border border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-center text-[#6B5E68] shrink-0">
                      <svg className="w-4 h-4 text-[#6B5E68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-[#2D252B] mb-0.5">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          name="mobileNumber"
                          maxLength="10"
                          value={formData.mobileNumber}
                          onChange={handleChange}
                          placeholder="Enter 10 digit mobile number"
                          className={`w-full h-9 px-3 pr-24 rounded-lg border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                            errors.mobileNumber
                              ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                              : 'border-[#E8E0E5] focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49]'
                          }`}
                        />
                        <span className="absolute right-2.5 top-2.5 text-[10px] text-gray-400 pointer-events-none select-none">
                          e.g. 9876543210
                        </span>
                      </div>
                    </div>
                  </div>
                  {errors.mobileNumber && (
                    <p className="text-red-500 text-[10px] mt-0.5 ml-11">{errors.mobileNumber}</p>
                  )}
                </div>

                {/* 3. Email Address (Optional) */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg border border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-center text-[#6B5E68] shrink-0">
                      <svg className="w-4 h-4 text-[#6B5E68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-[#2D252B] mb-0.5">
                        Email Address <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="Enter your email address"
                        className={`w-full h-9 px-3 rounded-lg border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                          errors.email
                            ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                            : 'border-[#E8E0E5] focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49]'
                        }`}
                      />
                    </div>
                  </div>
                  {errors.email && (
                    <p className="text-red-500 text-[10px] mt-0.5 ml-11">{errors.email}</p>
                  )}
                </div>

                {/* 4. Password */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg border border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-center text-[#6B5E68] shrink-0">
                      <svg className="w-4 h-4 text-[#6B5E68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-[#2D252B] mb-0.5">
                        Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={formData.password}
                          onChange={handleChange}
                          placeholder="Enter your password (min. 6 characters)"
                          className={`w-full h-9 px-3 pr-9 rounded-lg border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                            errors.password
                              ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                              : 'border-[#E8E0E5] focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                        >
                          {showPassword ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  {errors.password && (
                    <p className="text-red-500 text-[10px] mt-0.5 ml-11">{errors.password}</p>
                  )}
                </div>

                {/* 5. Confirm Password */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg border border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-center text-[#6B5E68] shrink-0">
                      <svg className="w-4 h-4 text-[#6B5E68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-[#2D252B] mb-0.5">
                        Confirm Password <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleChange}
                          placeholder="Confirm your password"
                          className={`w-full h-9 px-3 pr-9 rounded-lg border text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none transition-colors ${
                            errors.confirmPassword
                              ? 'border-red-400 bg-red-50/20 focus:border-red-500'
                              : 'border-[#E8E0E5] focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49]'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                        >
                          {showConfirmPassword ? (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-red-500 text-[10px] mt-0.5 ml-11">{errors.confirmPassword}</p>
                  )}
                </div>

                {/* 6. Referral Code (Optional) */}
                <div>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg border border-[#E8E0E5] bg-[#F8F3F6] flex items-center justify-center text-[#6B5E68] shrink-0">
                      <svg className="w-4 h-4 text-[#6B5E68]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 12 20 22 4 22 4 12" />
                        <rect x="2" y="7" width="20" height="5" />
                        <line x1="12" y1="22" x2="12" y2="7" />
                        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[11px] font-semibold text-[#2D252B] mb-0.5">
                        Referral Code <span className="text-gray-400 font-normal">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        name="referralCode"
                        value={formData.referralCode}
                        onChange={handleChange}
                        placeholder="Enter referral code (if any)"
                        className="w-full h-9 px-3 rounded-lg border border-[#E8E0E5] text-xs text-[#2D252B] placeholder-[#6B5E68]/60 focus:outline-none focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49] transition-colors uppercase tracking-wider"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-1 relative">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[44px] h-11 rounded-xl bg-[#601D49] hover:bg-[#4D153A] active:bg-[#601D49] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-sm shadow-black/10 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending Verification OTP...
                      </span>
                    ) : (
                      <>
                        <span>Create Account</span>
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>

                {/* Login Redirect */}
                <div className="text-center pt-0.5">
                  <p className="text-xs text-[#6B5E68] font-medium">
                    Already have an account?{' '}
                    <Link to="/login" className="text-[#601D49] hover:text-[#4D153A] font-bold hover:underline">
                      Login
                    </Link>
                  </p>
                </div>

                {/* Terms and Privacy Policy */}
                <div className="text-center pt-0">
                  <p className="text-[10px] text-[#6B5E68]">
                    By creating an account, you agree to our{' '}
                    <Link to="/policy/terms" className="underline hover:text-[#2D252B]">
                      Terms & Privacy Policy
                    </Link>
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
              <div className="w-12 h-12 rounded-full bg-[#F7F5F7] text-[#601D49] mx-auto flex items-center justify-center mb-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-extrabold text-[#2D252B]">Verify Mobile Number</h3>
              <p className="text-xs text-[#6B5E68] mt-1">
                Enter the 6-digit OTP sent to <span className="font-semibold text-[#2D252B]">+91 {formData.mobileNumber}</span>
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
            <form onSubmit={handleVerifyAndRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2D252B] text-center mb-2">
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
                  className="w-full h-12 text-center text-xl sm:text-2xl font-bold tracking-[0.2em] sm:tracking-[0.4em] rounded-xl border border-[#E8E0E5] focus:outline-none focus:border-[#601D49] focus:ring-2 focus:ring-[#601D49]/20 text-[#2D252B] transition-all placeholder-gray-300"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingOtp || otpValue.length !== 6}
                className="w-full min-h-[44px] h-12 rounded-xl bg-[#601D49] hover:bg-[#4D153A] active:bg-[#601D49] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-black/10 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isVerifyingOtp ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying & Creating Account...
                  </span>
                ) : (
                  <span>Verify & Create Account</span>
                )}
              </button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="text-[#6B5E68] hover:text-[#2D252B] cursor-pointer min-h-[40px] flex items-center"
                >
                  Edit details
                </button>
                {cooldown > 0 ? (
                  <span className="text-gray-400 font-medium">
                    Resend code in <strong className="text-gray-600 font-semibold">{cooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    className="text-[#601D49] hover:text-[#601D49] font-bold hover:underline cursor-pointer min-h-[40px] flex items-center"
                  >
                    Resend OTP
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}



      {/* REFERRAL SUCCESS POPUP MODAL */}
      {referralPopupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-[#E8E0E5] overflow-hidden p-6 sm:p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-[#F7F5F7] text-[#601D49] flex items-center justify-center text-3xl shadow-inner">
              🎉
            </div>
            
            <div className="space-y-1">
              <span className="text-xs font-black uppercase tracking-wider text-[#601D49] bg-[#F2DDE9] px-3 py-1 rounded-full">
                Reward Activated
              </span>
              <h3 className="text-2xl font-black text-[#2D252B] pt-2">
                Referral Successful!
              </h3>
            </div>

            <div className="bg-[#F8F3F6] border border-[#E8E0E5] rounded-2xl p-4 sm:p-5 space-y-2 text-left shadow-xs">
              <div className="flex items-center gap-2 text-[#2D252B] font-extrabold text-sm sm:text-base">
                <span className="text-lg">✨</span>
                <span>You received <span className="text-[#601D49] font-black">{referralPopupData.referred_discount_percent}% OFF</span></span>
              </div>
              <div className="flex items-center gap-2 text-[#6B5E68] font-semibold text-xs sm:text-sm pt-1 border-t border-[#E8E0E5]">
                <span className="text-lg">🎁</span>
                <span>Your friend ({referralPopupData.referrer_name}) received <span className="text-[#601D49] font-bold">{referralPopupData.referrer_discount_percent}% OFF</span></span>
              </div>
            </div>

            <button
              onClick={() => navigate('/')}
              className="w-full py-3.5 rounded-full bg-[#601D49] hover:brightness-110 active:scale-98 text-white font-black text-sm tracking-wide shadow-lg shadow-black/10 cursor-pointer transition-all"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
