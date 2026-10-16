import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiCalendar, FiGlobe, FiBox, FiHeart, FiMapPin, FiUser, FiGift, FiCheck, FiEdit2, FiX } from 'react-icons/fi'
import { api, getCustomerToken, clearCustomerToken, clearCustomerSession, setCustomerSession, fetchStoreSettings, resolveImageUrl } from '../../lib/api'
import { ROUTES } from '../../routes/routes'

export default function Profile() {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState(null)
  const [referral, setReferral] = useState(null)
  const [storeSettings, setStoreSettings] = useState(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Edit Profile modal state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  const handleOpenEdit = () => {
    setEditName(customer?.name || '')
    setEditEmail(customer?.email || '')
    setSaveError('')
    setSaveSuccess('')
    setIsEditing(true)
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    if (!editName.trim()) {
      setSaveError('Name cannot be empty')
      return
    }
    setIsSaving(true)
    setSaveError('')
    try {
      const res = await api.put('/customers/me', {
        name: editName.trim(),
        email: editEmail.trim() || null,
      })
      if (res.data?.customer) {
        setCustomer(res.data.customer)
        setCustomerSession(getCustomerToken(), res.data.customer)
        setSaveSuccess('Profile updated successfully!')
        setTimeout(() => {
          setIsEditing(false)
          setSaveSuccess('')
        }, 800)
      }
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to update profile. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      clearCustomerSession()
      navigate(ROUTES.LOGIN)
      return
    }

    fetchStoreSettings().then((s) => s && setStoreSettings(s))

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
          navigate(ROUTES.LOGIN)
        } else {
          setError('Unable to load profile from server')
        }
        setIsLoading(false)
      })
  }, [navigate])

  const handleLogout = () => {
    clearCustomerSession()
    navigate(ROUTES.HOME)
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
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans selection:bg-[var(--color-primary-tint)] selection:text-[var(--color-text-main)]">
      
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-[var(--color-border-subtle)] sticky top-0 z-30 shadow-xs">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 min-h-14 py-2 sm:py-0 flex items-center justify-between gap-2">
          <Link to={ROUTES.HOME} className="flex items-center gap-2 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[var(--color-brand)] flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="var(--color-primary-tint)" stroke="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-lg sm:text-xl font-black tracking-tight text-[var(--color-text-main)]">
                  {storeSettings?.store_name || 'Store'}
                </span>
              </div>
              <p className="text-[8px] sm:text-[9px] font-bold tracking-wider text-[var(--color-text-muted)] uppercase">
                Customer Profile
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              to={ROUTES.HOME}
              className="text-xs font-bold text-[var(--color-brand)] hover:text-[var(--color-text-main)] flex items-center gap-1 px-2.5 sm:px-3.5 py-2 rounded-full hover:bg-[var(--color-bg-alt)] transition-colors"
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
      <main className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 xl:px-12 py-5 sm:py-10">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text-muted)] mb-4 sm:mb-6">
          <Link to={ROUTES.HOME} className="text-[var(--color-brand)] hover:underline">Home</Link>
          <span>/</span>
          <span className="text-[var(--color-text-main)]">My Profile</span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-3xl p-10 text-center border border-[var(--color-border-subtle)] shadow-sm space-y-4">
            <div className="w-12 h-12 border-4 border-[var(--color-primary-tint)] border-t-[var(--color-brand)] rounded-full animate-spin mx-auto" />
            <p className="text-sm font-bold text-[var(--color-text-main)]">Loading profile data from database...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="bg-white rounded-3xl p-8 text-center border border-red-200 shadow-sm space-y-3">
            <p className="text-sm font-bold text-red-600">{error}</p>
            <Link
              to={ROUTES.HOME}
              className="inline-block px-5 py-2.5 bg-[var(--color-brand)] text-white font-bold text-xs rounded-full hover:bg-[var(--color-brand-hover)] min-h-[44px]"
            >
              Back to Home
            </Link>
          </div>
        )}

        {/* Profile Content */}
        {!isLoading && customer && (
          <div className="space-y-5 sm:space-y-6">
            
            {/* Profile Overview Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-8 border border-[var(--color-border-subtle)] shadow-[var(--shadow-profile-card)] relative overflow-hidden">
              <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-gradient-to-br from-[var(--color-primary-tint)]/60 to-[var(--color-bg-alt)]/60 pointer-events-none blur-2xl" />

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative z-10">
                
                {/* Prominent Profile Photo */}
                <div className="relative shrink-0">
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name || 'Customer Profile'}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 sm:w-28 sm:h-28 rounded-full object-cover border-4 border-[var(--color-primary-tint)] shadow-md ring-4 ring-[var(--color-bg-alt)]"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-[var(--color-brand)] text-white font-black text-2xl sm:text-4xl items-center justify-center shadow-md ring-4 ring-[var(--color-bg-alt)] uppercase ${
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
                    <h1 className="text-xl sm:text-3xl font-black text-[var(--color-text-main)] tracking-tight break-words">
                      {customer.name || 'Customer'}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider bg-[var(--color-primary-tint)] text-[var(--color-brand)] border border-[var(--color-border-subtle)]">
                      {customer.customer_type || 'RETAIL'}
                    </span>
                    <button
                      type="button"
                      onClick={handleOpenEdit}
                      className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 hover:bg-purple-100 text-[var(--color-brand)] border border-purple-200 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer ml-auto sm:ml-0"
                      title="Edit Profile Details"
                    >
                      <FiEdit2 className="w-3.5 h-3.5" />
                      <span>Edit Profile</span>
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm text-[var(--color-text-muted)] font-medium break-all">
                    {customer.email || 'No email linked'}
                  </p>

                  <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-[11px] sm:text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[var(--color-bg-alt)] rounded-full border border-[var(--color-border-subtle)]">
                      <FiCalendar className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                      <span>Member since <strong>{formatDate(customer.created_at)}</strong></span>
                    </span>
                    {customer.profile_photo_path && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-800 rounded-full border border-blue-200 font-medium text-[11px]">
                        <FiGlobe className="w-3.5 h-3.5 text-blue-600" />
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
                to={ROUTES.ORDERS}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--color-bg-alt)] text-[var(--color-brand)] flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FiBox className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-main)]">My Orders</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Track & history</span>
              </Link>

              <Link
                to={ROUTES.HOME}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FiHeart className="w-5 h-5 fill-pink-500" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-main)]">Wishlist</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Saved items</span>
              </Link>

              <Link
                to={ROUTES.HOME}
                className="bg-white p-3 sm:p-4 rounded-2xl border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/50 hover:shadow-md transition-all flex flex-col items-center text-center group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
                  <FiMapPin className="w-5 h-5 text-amber-600" />
                </div>
                <span className="text-xs font-bold text-[var(--color-text-main)]">Addresses</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">Manage delivery</span>
              </Link>
            </div>

            {/* Account Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              
              {/* Card 1: Contact & Identification */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-[var(--color-bg-alt)] text-[var(--color-brand)] flex items-center justify-center font-bold text-sm">
                    <FiUser className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-extrabold text-[var(--color-text-main)]">Personal Information</h2>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Full Name</span>
                    <p className="font-bold text-[var(--color-text-main)] text-sm">{customer.name || '—'}</p>
                  </div>

                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Email Address</span>
                    <p className="font-bold text-[var(--color-text-main)] text-sm break-all">{customer.email || 'Not provided'}</p>
                  </div>

                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Mobile Number</span>
                    <p className="font-bold text-[var(--color-text-main)] text-sm">
                      {customer.phone ? `+91 ${customer.phone}` : 'Not provided'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Customer Type</span>
                    <p className="font-bold text-[var(--color-text-main)]">{customer.customer_type || 'RETAIL'}</p>
                  </div>
                </div>
              </div>

              {/* Card 2: Referral & Rewards Summary */}
              <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center font-bold text-sm">
                    <FiGift className="w-4 h-4 text-pink-600" />
                  </div>
                  <h2 className="text-sm font-extrabold text-[var(--color-text-main)]">Referral Program</h2>
                </div>

                {referral ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-[var(--color-text-muted)] font-semibold block mb-0.5">Your Referral Code</span>
                      <div className="inline-flex items-center gap-2">
                        <div className="px-3 py-1.5 bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] rounded-xl text-[var(--color-text-main)] font-black text-sm tracking-wider">
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
                            className="px-3 py-1.5 rounded-xl bg-[var(--color-primary-tint)] hover:bg-[var(--color-extra-040)] text-[var(--color-brand)] text-xs font-bold transition-colors cursor-pointer"
                          >
                            {copiedCode ? (
                              <span className="flex items-center gap-1">
                                <FiCheck className="w-3.5 h-3.5" />
                                <span>Copied</span>
                              </span>
                            ) : (
                              'Copy'
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-3 bg-[var(--color-bg-main)] rounded-xl border border-[var(--color-border-subtle)]">
                        <span className="text-[11px] text-[var(--color-text-muted)] font-semibold block">Total Referrals</span>
                        <span className="text-lg font-black text-[var(--color-brand)]">{referral.total_referrals || 0}</span>
                      </div>
                      <div className="p-3 bg-pink-50 rounded-xl border border-pink-100">
                        <span className="text-[11px] text-pink-700 font-semibold block">Reward Rate</span>
                        <span className="text-lg font-black text-pink-900">
                          {referral.reward_percent !== undefined && referral.reward_percent !== null ? `${referral.reward_percent}% OFF` : '—'}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed pt-1">
                      Share your code with friends to give them {referral.referred_discount_percent ?? referral.reward_percent ?? ''}% OFF on their first purchase, and you'll earn {referral.referrer_discount_percent ?? referral.reward_percent ?? ''}% OFF too!
                    </p>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--color-text-muted)] py-4">
                    Referral rewards will appear here when active.
                  </div>
                )}
              </div>

            </div>

            {/* Quick Navigation Footer */}
            <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <Link
                to={ROUTES.HOME}
                className="min-h-[44px] flex items-center justify-center px-6 py-3 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-extrabold text-xs uppercase tracking-wider transition-all shadow-md shadow-black/10 active:scale-98"
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

        {/* Edit Profile Modal */}
        {isEditing && customer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[var(--color-border-subtle)] relative animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-5">
                <div>
                  <h3 className="text-lg font-black text-[var(--color-text-main)]">
                    Edit Profile
                  </h3>
                  <p className="text-xs text-gray-400">
                    Update your account name and email address
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              {saveError && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold">
                  {saveError}
                </div>
              )}

              {saveSuccess && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{saveSuccess}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:outline-none focus:border-[var(--color-brand)] focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    Mobile Phone Number
                  </label>
                  <input
                    type="text"
                    disabled
                    value={customer.phone ? `+91 ${customer.phone}` : 'Verified via Google / OTP'}
                    className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-medium text-gray-500 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Phone number is bound to authentication and cannot be changed here.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2.5 rounded-full border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-full bg-[var(--color-brand)] hover:bg-[#6d28d9] text-white text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
