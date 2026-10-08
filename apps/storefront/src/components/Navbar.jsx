import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  api,
  getCustomerToken,
  clearCustomerSession,
  setCustomerSession,
  fetchStoreSettings,
  fetchDeliverySettings,
  fetchActiveOffers,
} from '../lib/api'
import { getCartCount, fetchCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist } from '../lib/wishlist'

export default function Navbar({
  onOpenCart,
  onOpenReferral,
  searchQuery = '',
  onSearchChange,
  categories = [],
  activeNav = 'home',
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [customer, setCustomer] = useState(null)
  const [cartCount, setCartCount] = useState(() => getCartCount())
  const [wishlistCount, setWishlistCount] = useState(() => getWishlistIds().length)
  const [storeSettings, setStoreSettings] = useState(null)
  const [deliverySettings, setDeliverySettings] = useState(null)
  const [promoOffer, setPromoOffer] = useState(null)
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const accountDropdownRef = useRef(null)

  // Fetch store, delivery, and promo settings from MySQL
  useEffect(() => {
    let mounted = true
    fetchStoreSettings().then((s) => {
      if (mounted && s) setStoreSettings(s)
    })
    fetchDeliverySettings().then((d) => {
      if (mounted && d) setDeliverySettings(d)
    })
    fetchActiveOffers().then((res) => {
      if (mounted && res && res.offers && res.offers.length > 0) {
        setPromoOffer(res.offers[0])
      }
    })
    return () => {
      mounted = false
    }
  }, [])

  // Sync cart count via DB API & window event
  useEffect(() => {
    fetchCart().then((c) => setCartCount(c.total_items))
    const handleCartSync = () => setCartCount(getCartCount())
    window.addEventListener('cart-updated', handleCartSync)
    return () => window.removeEventListener('cart-updated', handleCartSync)
  }, [])

  // Sync wishlist count via DB API & window event
  useEffect(() => {
    fetchWishlist().then((items) => setWishlistCount(items.length))
    const handleWishlistSync = () => setWishlistCount(getWishlistIds().length)
    window.addEventListener('wishlist-updated', handleWishlistSync)
    return () => window.removeEventListener('wishlist-updated', handleWishlistSync)
  }, [])

  // Keep local search in sync with prop
  useEffect(() => {
    setLocalSearch(searchQuery)
  }, [searchQuery])

  // Customer authentication from backend (JWT is truth)
  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      setCustomer(null)
      return
    }

    api
      .get('/customers/me')
      .then((res) => {
        if (res.data?.customer) {
          setCustomer(res.data.customer)
          setCustomerSession(token, res.data.customer)
        } else {
          clearCustomerSession()
          setCustomer(null)
        }
      })
      .catch(() => {
        clearCustomerSession()
        setCustomer(null)
      })
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) {
        setIsAccountDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search submission handler
  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const q = localSearch.trim()
    if (onSearchChange) {
      onSearchChange(q)
    }
    if (location.pathname !== '/products') {
      navigate(`/products?search=${encodeURIComponent(q)}`)
    }
  }

  const handleLogout = () => {
    clearCustomerSession()
    setCustomer(null)
    setIsAccountDropdownOpen(false)
    navigate('/')
  }

  const whatsappClean = (storeSettings?.whatsapp_number || storeSettings?.phone || '').replace(/[^0-9]/g, '')
  const whatsappUrl = whatsappClean ? `https://wa.me/${whatsappClean}` : '#'
  const helplineText = storeSettings?.phone ? `📞 Helpline: ${storeSettings.phone}` : null
  const freeThreshold = Number(deliverySettings?.free_delivery_threshold) || 499

  return (
    <div className="sticky top-0 z-40 w-full shadow-xs">
      
      {/* 1. TOP PROMOTIONAL STRIP */}
      <div className="bg-[#2E1065] text-white text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4 border-b border-purple-900/60">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 truncate">
            {promoOffer ? (
              <>
                <span className="bg-pink-500 text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 shadow-xs">
                  {promoOffer.badge_text || 'Offer'}
                </span>
                <span className="font-medium text-purple-100 truncate text-[10px] sm:text-xs">
                  {promoOffer.title} {promoOffer.code ? <>Code: <strong className="text-amber-300 font-extrabold tracking-wide">{promoOffer.code}</strong></> : null}
                </span>
              </>
            ) : (
              <span className="font-medium text-purple-100 truncate text-[10px] sm:text-xs">
                ✨ Free Express Shipping on orders above <strong className="text-amber-300 font-extrabold">₹{freeThreshold}</strong>
              </span>
            )}
          </div>
          <div className="hidden md:flex items-center gap-4 lg:gap-6 text-purple-200 text-xs shrink-0">
            <span className="flex items-center gap-1.5">
              <span>🚚 Free Delivery on ₹{freeThreshold}+</span>
            </span>
            {helplineText && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <span>{helplineText}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. MAIN HEADER (White with Purple Accents) */}
      <header className="bg-white border-b border-purple-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex items-center justify-between gap-2 sm:gap-6">
          
          {/* Brand Logo & Name */}
          <Link to="/" className="flex items-center gap-2 sm:gap-3 shrink-0 group">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#6B21A8] to-[#9333EA] flex items-center justify-center text-white shadow-md shadow-purple-950/20 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#EC4899" stroke="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-lg sm:text-2xl font-black tracking-tight text-[#4C1D95]">Kirana</span>
                <span className="text-lg sm:text-2xl font-black tracking-tight text-[#EC4899]">Bazaar</span>
              </div>
              <p className="text-[8px] sm:text-[10px] font-bold tracking-wider text-purple-900/60 uppercase mt-0.5">
                Accessories & Gifts Hub
              </p>
            </div>
          </Link>

          {/* Desktop Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-xl mx-2 hidden lg:block">
            <div className="relative">
              <input
                type="text"
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value)
                  if (onSearchChange) onSearchChange(e.target.value)
                }}
                placeholder="Search accessories, jewellery, gifts, toys, pouches..."
                className="w-full h-11 pl-11 pr-10 rounded-full bg-purple-50/40 border border-purple-200 text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-600/15 transition-all"
              />
              <button
                type="submit"
                className="absolute left-4 top-3.5 text-purple-400 hover:text-purple-700 cursor-pointer"
                aria-label="Search"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
              {localSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('')
                    if (onSearchChange) onSearchChange('')
                  }}
                  className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </form>

          {/* Right Actions: Account, Wishlist, Cart & Mobile Hamburger */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            
            {/* Customer Account Dropdown */}
            {customer ? (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                  className="flex items-center gap-1 sm:gap-2 p-1 sm:pl-1 sm:pr-3 sm:py-1 rounded-full bg-purple-50 hover:bg-purple-100/70 border border-purple-200 transition-all cursor-pointer shadow-xs active:scale-98 select-none"
                  title="Customer Account Menu"
                >
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name || 'Customer'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-purple-200 shadow-xs"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#6B21A8] text-white font-black text-xs uppercase shadow-xs items-center justify-center ${
                      customer.profile_photo_path ? 'hidden' : 'flex'
                    }`}
                  >
                    {customer.name?.trim().charAt(0) || 'C'}
                  </div>
                  <div className="hidden sm:flex items-center gap-1 text-left">
                    <span className="text-xs font-black text-gray-900 leading-tight">
                      {customer.name?.split(' ')[0] || 'Customer'}
                    </span>
                    <span className={`text-[10px] text-purple-700 transition-transform duration-200 ${isAccountDropdownOpen ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </div>
                </button>

                {/* Account Dropdown Menu */}
                {isAccountDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-purple-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
                      {customer.profile_photo_path ? (
                        <img
                          src={customer.profile_photo_path}
                          alt={customer.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-purple-200 shadow-xs"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#6B21A8] text-white flex items-center justify-center font-black text-sm uppercase shadow-xs">
                          {customer.name?.trim().charAt(0) || 'C'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-gray-900 truncate">
                          {customer.name}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {customer.email || (customer.phone ? `+91 ${customer.phone}` : 'Store Customer')}
                        </p>
                      </div>
                    </div>

                    <Link
                      to="/profile"
                      onClick={() => setIsAccountDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-purple-50 hover:text-purple-900 transition-colors"
                    >
                      <span>👤</span>
                      <span>My Profile</span>
                    </Link>

                    {onOpenReferral && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountDropdownOpen(false)
                          onOpenReferral()
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-pink-600 hover:bg-pink-50 transition-colors text-left cursor-pointer"
                      >
                        <span>🎁</span>
                        <span>Refer & Earn (10% OFF)</span>
                      </button>
                    )}

                    <div className="border-t border-gray-100 my-1"></div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                    >
                      <span>🚪</span>
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-purple-200 text-xs font-bold text-purple-800 hover:border-purple-600 hover:bg-purple-50 transition-all shadow-xs"
                title="Customer Login"
              >
                <svg className="w-4 h-4 text-purple-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="hidden xs:inline">Sign In</span>
              </Link>
            )}

            {/* Refer & Earn Button (Desktop/Tablet) */}
            {customer && onOpenReferral && (
              <button
                type="button"
                onClick={onOpenReferral}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pink-50 border border-pink-200 text-[#DB2777] hover:bg-pink-100 hover:border-pink-300 text-xs font-black transition-all shadow-xs cursor-pointer active:scale-95"
                title="Refer & Earn 10% OFF"
              >
                <span>🎁</span>
                <span className="hidden md:inline">Refer & Earn</span>
              </button>
            )}

            {/* Wishlist Link */}
            <Link
              to="/products?wishlist=1"
              className="hidden xs:flex relative p-2 rounded-full hover:bg-purple-50 text-gray-700 transition-colors cursor-pointer"
              title="Saved Wishlist"
            >
              <svg
                className="w-5.5 h-5.5 sm:w-6 sm:h-6 transition-transform hover:scale-110"
                viewBox="0 0 24 24"
                fill={wishlistCount > 0 ? '#EC4899' : 'none'}
                stroke={wishlistCount > 0 ? '#EC4899' : 'currentColor'}
                strokeWidth="2"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              {wishlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 sm:w-4.5 sm:h-4.5 bg-pink-500 text-white text-[9px] sm:text-[10px] font-black rounded-full flex items-center justify-center shadow-xs">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* Cart Button with Count Badge */}
            <button
              type="button"
              onClick={onOpenCart}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full bg-[#6B21A8] hover:bg-[#581C87] text-white active:scale-95 transition-all shadow-md shadow-purple-950/20 cursor-pointer"
              title="Shopping Cart"
            >
              <div className="relative">
                <svg className="w-4.5 h-4.5 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-amber-400 text-purple-950 font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-bold hidden md:inline">
                {cartCount > 0 ? `${cartCount} Items` : 'Cart'}
              </span>
            </button>

            {/* Hamburger Button on Mobile / Tablet (< 1024px) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="lg:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#4C1D95] border border-purple-200 flex items-center justify-center transition-colors cursor-pointer active:scale-95"
              title="Toggle Menu"
              aria-label="Navigation menu"
            >
              {isMobileMenuOpen ? (
                <span className="text-base font-black">✕</span>
              ) : (
                <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>

          </div>
        </div>

        {/* 2B. MOBILE SEARCH BAR (Accessible on < 1024px) */}
        <div className="lg:hidden px-3 sm:px-6 pb-2.5 pt-0.5">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value)
                if (onSearchChange) onSearchChange(e.target.value)
              }}
              placeholder="Search accessories, jewellery, gifts..."
              className="w-full h-10 pl-10 pr-9 rounded-full bg-purple-50/50 border border-purple-200 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-600 focus:bg-white focus:ring-1 focus:ring-purple-600/20 transition-all"
            />
            <button
              type="submit"
              className="absolute left-3.5 top-3 text-purple-400 hover:text-purple-700 cursor-pointer"
              aria-label="Search"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            {localSearch && (
              <button
                type="button"
                onClick={() => {
                  setLocalSearch('')
                  if (onSearchChange) onSearchChange('')
                }}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 cursor-pointer"
              >
                ✕
              </button>
            )}
          </form>
        </div>

        {/* 2C. DESKTOP NAVIGATION BAR (>= 1024px) */}
        <nav className="hidden lg:block bg-[#4C1D95] text-white border-t border-purple-800/60 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-2">
            
            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 text-xs sm:text-sm font-bold">
              {/* Home */}
              <Link
                to="/"
                className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  location.pathname === '/' && activeNav === 'home'
                    ? 'bg-white text-[#4C1D95] shadow-sm font-extrabold'
                    : 'text-purple-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>🏠 Home</span>
              </Link>

              {/* All Products / Shop */}
              <Link
                to="/products"
                className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  location.pathname === '/products' && !location.search
                    ? 'bg-white text-[#4C1D95] shadow-sm font-extrabold'
                    : 'text-purple-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>🛍️ All Products</span>
              </Link>

              {/* Best Sellers */}
              <Link
                to="/products?section=best_sellers"
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  location.search.includes('best_sellers')
                    ? 'bg-white text-[#4C1D95] shadow-sm font-extrabold'
                    : 'text-purple-100 hover:text-white hover:bg-white/10'
                }`}
              >
                Best Sellers
              </Link>

              {/* New Arrivals */}
              <Link
                to="/products?section=new_arrivals"
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  location.search.includes('new_arrivals')
                    ? 'bg-white text-[#4C1D95] shadow-sm font-extrabold'
                    : 'text-purple-100 hover:text-white hover:bg-white/10'
                }`}
              >
                New Arrivals
              </Link>

              {/* Featured */}
              <Link
                to="/products?section=featured"
                className={`px-3.5 py-1.5 rounded-xl transition-all ${
                  location.search.includes('featured')
                    ? 'bg-white text-[#4C1D95] shadow-sm font-extrabold'
                    : 'text-purple-100 hover:text-white hover:bg-white/10'
                }`}
              >
                Featured Products
              </Link>

              {/* Offers & Deals */}
              <Link
                to="/products?section=deals"
                className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                  location.search.includes('deals')
                    ? 'bg-white text-[#4C1D95] shadow-sm font-extrabold'
                    : 'text-purple-100 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>🔥 Offers & Deals</span>
              </Link>
            </div>

            {/* Quick Contact Right */}
            <div className="flex items-center gap-3 text-xs text-purple-200">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-emerald-300 hover:text-white font-bold transition-colors"
              >
                <span>💬 WhatsApp Support</span>
              </a>
            </div>

          </div>
        </nav>
      </header>

      {/* 3. MOBILE SLIDE-OUT DRAWER */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Body */}
          <div className="fixed inset-y-0 left-0 w-[84%] max-w-[340px] bg-white shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-250">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-purple-100 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#6B21A8] text-white flex items-center justify-center font-black text-sm shadow-xs">
                  KB
                </div>
                <div>
                  <h3 className="font-black text-sm text-purple-950">KiranaBazaar Hub</h3>
                  <p className="text-[10px] text-purple-700/80 font-semibold">Store Navigation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-white text-gray-500 flex items-center justify-center text-sm shadow-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Drawer Menu Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-bold text-gray-700">
              {/* Customer Greeting / Auth */}
              {customer ? (
                <div className="p-3 mb-2 rounded-2xl bg-purple-50/70 border border-purple-100 flex items-center gap-3">
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-purple-200 shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#6B21A8] text-white flex items-center justify-center font-black text-sm uppercase shadow-xs shrink-0">
                      {customer.name?.trim().charAt(0) || 'C'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-gray-900 truncate">
                      Hello, {customer.name?.split(' ')[0]} 👋
                    </p>
                    <Link
                      to="/profile"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="text-[11px] text-[#6B21A8] hover:underline"
                    >
                      View Profile →
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="p-3 mb-2 rounded-2xl bg-purple-50/80 border border-purple-100 flex items-center justify-between">
                  <div>
                    <p className="font-extrabold text-purple-950">Welcome, Guest</p>
                    <p className="text-[10px] text-gray-500">Sign in to track orders & rewards</p>
                  </div>
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="px-3 py-1.5 rounded-full bg-[#6B21A8] text-white text-[11px] font-black shadow-xs"
                  >
                    Login
                  </Link>
                </div>
              )}

              {/* Navigation Links */}
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-purple-50 transition-colors"
              >
                <span>🏠</span>
                <span>Home Catalog</span>
              </Link>

              <Link
                to="/products"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-purple-50 transition-colors"
              >
                <span>🛍️</span>
                <span>All Products</span>
              </Link>

              <Link
                to="/products?section=best_sellers"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-purple-50 transition-colors"
              >
                <span>⭐</span>
                <span>Best Sellers</span>
              </Link>

              <Link
                to="/products?section=new_arrivals"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-purple-50 transition-colors"
              >
                <span>✨</span>
                <span>New Arrivals</span>
              </Link>

              <Link
                to="/products?section=featured"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-purple-50 transition-colors"
              >
                <span>💎</span>
                <span>Featured Selections</span>
              </Link>

              <Link
                to="/products?section=deals"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-purple-50 transition-colors text-pink-700"
              >
                <span>🔥</span>
                <span>Flash Deals & Offers</span>
              </Link>

              {/* Categories Sub-list if available */}
              {categories.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-[10px] font-black uppercase text-gray-400 px-3.5">
                    Browse Categories
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {categories.slice(0, 6).map((cat) => (
                      <Link
                        key={cat.id}
                        to={`/products?category_id=${cat.id}`}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="w-full text-left px-3.5 py-2 rounded-xl flex items-center gap-2 hover:bg-purple-50 text-[11px] text-gray-600"
                      >
                        <span className="text-purple-600">•</span>
                        <span>{cat.name}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Bottom Quick Tools */}
              <div className="border-t border-gray-100 my-2 pt-2 space-y-1">
                {onOpenReferral && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      onOpenReferral()
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-pink-50 text-[#DB2777] font-bold"
                  >
                    <span>🎁</span>
                    <span>Refer & Earn (10% OFF)</span>
                  </button>
                )}

                <Link
                  to="/products?wishlist=1"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-purple-50 font-bold"
                >
                  <span className="flex items-center gap-3">
                    <span>❤️</span>
                    <span>Saved Wishlist</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-black">
                    {wishlistCount}
                  </span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    onOpenCart()
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-purple-50 font-bold text-purple-900"
                >
                  <span className="flex items-center gap-3">
                    <span>🛍️</span>
                    <span>Shopping Cart</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 text-xs font-black">
                    {cartCount} items
                  </span>
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-purple-100 bg-purple-50/40 text-xs text-gray-500 space-y-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-[#25D366] text-white font-extrabold flex items-center justify-center gap-2 shadow-xs"
              >
                <span>💬 WhatsApp Support</span>
              </a>
              <div className="flex items-center justify-between text-[11px] pt-1 text-purple-900 font-semibold">
                <span>🛡️ 100% Quality</span>
                <span>•</span>
                <span>📦 7-Day Return</span>
                <span>•</span>
                <span>💵 COD Available</span>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
