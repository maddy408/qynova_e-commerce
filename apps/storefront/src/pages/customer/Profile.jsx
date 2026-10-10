import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getCustomerToken, clearCustomerToken, clearCustomerSession, setCustomerSession } from '../../lib/api'

export default function Profile() {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [referral, setReferral] = useState(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      clearCustomerSession()
      navigate('/login')
      return
    }

    // Fetch authenticated customer profile directly from backend (Backend JWT is truth)
    api
      .get('/customers/me')
      .then((res) => {
        if (res.data?.customer) {
          setCustomer(res.data.customer)
          setReferral(res.data.referral || null)
          setCustomerSession(token, res.data.customer)
        } else {
          clearCustomerSession()
          setError('Failed to load profile')
        }
        setIsLoading(false)
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          clearCustomerSession()
          navigate('/login')
        } else {
          setError('Unable to load profile from server')
        }
        setIsLoading(false)
      })
  }, [navigate])

  const handleLogout = () => {
    clearCustomerSession()
    navigate('/')
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8FF] text-[#27213A] font-sans selection:bg-[#EDE5FF] selection:text-[#27213A]">
      
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-[#E8E0F5] sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 min-h-14 py-2 sm:py-0 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#7042D2] flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#EDE5FF" stroke="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#27213A]">Qynova</span>
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#8B5CF6]">.</span>
              </div>
              <p className="text-[8px] sm:text-[9px] font-bold tracking-wider text-[#716A82] uppercase">
                Customer Profile
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              to="/"
              className="text-xs font-bold text-[#7042D2] hover:text-[#27213A] flex items-center gap-1 px-2.5 sm:px-3.5 py-2 rounded-full hover:bg-[#F5F0FF] transition-colors"
            >
              <span>← Store</span>
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-bold text-red-600 hover:bg-red-50 px-2.5 sm:px-3.5 py-2 rounded-full transition-colors cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Profile Container */}
      <main className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-10">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-[#716A82] mb-4 sm:mb-6">
          <Link to="/" className="text-[#8B5CF6] hover:underline">Home</Link>
          <span>/</span>
          <span className="text-[#27213A]">My Profile</span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-3xl p-10 text-center border border-[#E8E0F5] shadow-sm space-y-4">
            <div className="w-12 h-12 border-4 border-[#EDE5FF] border-t-[#8B5CF6] rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-[#27213A]">Loading profile data from database...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-white rounded-3xl p-8 text-center border border-red-200 shadow-sm space-y-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <Link
              to="/"
              className="inline-block px-5 py-2.5 bg-[#8B5CF6] text-white font-bold text-xs rounded-full hover:bg-[#7042D2] min-h-[44px]"
            >
              Back to Home
            </Link>
          </div>
        )}

        {/* Profile Content */}
        {!isLoading && customer && (
          <div className="space-y-5 sm:space-y-6">
            
            {/* Profile Overview Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-8 border border-[#E8E0F5] shadow-[0_10px_35px_rgba(139,92,246,0.05)] relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-[#EDE5FF]/60 to-[#F5F0FF]/60 pointer-events-none blur-2xl" />

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative z-10">
                
                {/* Prominent Profile Photo */}
                <div className="relative shrink-0">
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name || 'Customer Profile'}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-[#EDE5FF] shadow-md ring-4 ring-[#F5F0FF]"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7042D2] text-white font-black text-2xl sm:text-4xl items-center justify-center shadow-md ring-4 ring-[#F5F0FF] uppercase ${
                      customer.profile_photo_path ? 'hidden' : 'flex'
                    }`}
                  >
                    {customer.name?.trim().charAt(0) || 'C'}
                  </div>
                  
                  {customer.profile_photo_path && (
                    <span className="absolute bottom-0 right-0 bg-emerald-500 border-2 border-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white shadow-xs" title="Google Verified Account">
                      ✓
                    </span>
                  )}
                </div>

                {/* Name, Type & Quick Summary */}
                <div className="flex-1 text-center sm:text-left space-y-1.5 w-full">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <h1 className="text-xl sm:text-3xl font-black text-[#27213A] tracking-tight break-words">
                      {customer.name || 'Customer'}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-[#EDE5FF] text-[#7042D2] border border-[#E8E0F5]">
                      {customer.customer_type || 'RETAIL'}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-[#716A82] font-medium break-all">
                    {customer.email || 'No email linked'}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] sm:text-xs text-[#716A82]">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F5F0FF] rounded-full border border-[#E8E0F5]">
                      <span>📅</span>
                      <span>Member since <strong>{formatDate(customer.created_at)}</strong></span>
                    </span>
                    {customer.profile_photo_path && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 rounded-full border border-blue-200 font-medium text-[11px]">
                        <span>🌐</span>
                        <span>Google Linked</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Quick Access Tiles: Orders, Wishlist, Addresses */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              <Link
                to="/orders"
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[#E8E0F5] shadow-xs hover:border-[#8B5CF6]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-[#F5F0FF] text-[#8B5CF6] flex items-center justify-center text-lg mb-1.5 group-hover:scale-110 transition-transform">
                  📦
                </div>
                <span className="text-xs font-bold text-[#27213A]">My Orders</span>
                <span className="text-[10px] text-[#716A82]">Track & history</span>
              </Link>

              <Link
                to="/"
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[#E8E0F5] shadow-xs hover:border-[#8B5CF6]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center text-lg mb-1.5 group-hover:scale-110 transition-transform">
                  ❤️
                </div>
                <span className="text-xs font-bold text-[#27213A]">Wishlist</span>
                <span className="text-[10px] text-[#716A82]">Saved items</span>
              </Link>

              <Link
                to="/"
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[#E8E0F5] shadow-xs hover:border-[#8B5CF6]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg mb-1.5 group-hover:scale-110 transition-transform">
                  📍
                </div>
                <span className="text-xs font-bold text-[#27213A]">Addresses</span>
                <span className="text-[10px] text-[#716A82]">Manage delivery</span>
              </Link>
            </div>

            {/* Account Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              
              {/* Card 1: Contact & Identification */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E8E0F5] shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-[#F5F0FF] text-[#8B5CF6] flex items-center justify-center font-bold text-sm">
                    🪪
                  </div>
                  <h2 className="text-sm font-extrabold text-[#27213A]">Personal Information</h2>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[#716A82] font-semibold block mb-0.5">Full Name</span>
                    <p className="font-bold text-[#27213A] text-sm">{customer.name || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[#716A82] font-semibold block mb-0.5">Email Address</span>
                    <p className="font-bold text-[#27213A] text-sm break-all">{customer.email || 'Not provided'}</p>
                  </div>

                  <div>
                    <span className="text-[#716A82] font-semibold block mb-0.5">Mobile Number</span>
                    <p className="font-bold text-[#27213A] text-sm">
                      {customer.phone ? `+91 ${customer.phone}` : 'Not provided'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[#716A82] font-semibold block mb-0.5">Customer Type</span>
                    <p className="font-bold text-[#27213A]">{customer.customer_type || 'RETAIL'}</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Referral & Rewards Summary */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E8E0F5] shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center font-bold text-sm">
                    🎁
                  </div>
                  <h2 className="text-sm font-extrabold text-[#27213A]">Referral Program</h2>
                </div>

                {referral ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[#716A82] font-semibold block mb-0.5">Your Referral Code</span>
                      <div className="inline-flex items-center gap-2">
                        <div className="px-3 py-1.5 bg-[#FAF8FF] border border-[#E8E0F5] rounded-xl text-[#27213A] font-black text-sm tracking-wider">
                          {referral.referral_code || 'Generating...'}
                        </div>
                        {referral.referral_code && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(referral.referral_code)
                              setCopiedCode(true)
                              setTimeout(() => setCopiedCode(false), 2000)
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#EDE5FF] hover:bg-[#E0D6FF] text-[#7042D2] text-xs font-bold transition-colors cursor-pointer"
                          >
                            {copiedCode ? '✓ Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-3 bg-[#FAF8FF] rounded-xl border border-[#E8E0F5]">
                        <span className="text-[11px] text-[#716A82] font-semibold block">Total Referrals</span>
                        <span className="text-lg font-black text-[#8B5CF6]">{referral.total_referrals || 0}</span>
                      </div>
                      <div className="p-3 bg-pink-50 rounded-xl border border-pink-100">
                        <span className="text-[11px] text-pink-700 font-semibold block">Reward Rate</span>
                        <span className="text-lg font-black text-pink-900">
                          {referral.reward_percent !== undefined && referral.reward_percent !== null ? `${referral.reward_percent}% OFF` : '—'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-[#716A82] leading-relaxed pt-1">
                      Share your code with friends to give them {referral.referred_discount_percent ?? referral.reward_percent ?? ''}% OFF on their first purchase, and you'll earn {referral.referrer_discount_percent ?? referral.reward_percent ?? ''}% OFF too!
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-[#716A82] py-4">
                    Referral rewards will appear here when active.
                  </div>
                )}
              </div>

            </div>

            {/* Quick Navigation Footer */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <Link
                to="/"
                className="min-h-[44px] flex items-center justify-center px-6 py-3 rounded-full bg-[#8B5CF6] hover:bg-[#7042D2] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-purple-900/20 active:scale-98"
              >
                Continue Shopping
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] flex items-center justify-center px-6 py-3 rounded-full border border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs transition-colors cursor-pointer active:scale-98"
              >
                Sign Out
              </button>
            </div>

          </div>
        )}

      </main>
    </div>
  )
}
