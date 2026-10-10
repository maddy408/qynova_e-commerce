import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  api,
  getCustomerToken,
  clearCustomerSession,
  setCustomerSession,
  fetchStoreSettings,
  fetchDeliverySettings,
  fetchActiveOffers,
  fetchAvailableCoupons,
  fetchReferralSettings,
  fetchCategories,
  fetchSubcategories,
  fetchCustomerAddresses,
  resolveImageUrl,
} from '../lib/api'
import { getCartCount, getCartSubtotal, fetchCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist } from '../lib/wishlist'
import BottomCartBar from './BottomCartBar'

function getCategoryIcon(cat) {
  if (!cat) return '🛍️'
  if (cat.icon) return cat.icon
  const slug = (cat.slug || cat.name || '').toLowerCase()
  if (slug.includes('hair')) return '🎀'
  if (slug.includes('jewel') || slug.includes('fashion')) return '💍'
  if (slug.includes('gift')) return '🎁'
  if (slug.includes('toy')) return '🧸'
  if (slug.includes('bag') || slug.includes('pouch')) return '👜'
  if (slug.includes('beauty')) return '💄'
  if (slug.includes('storage') || slug.includes('utility')) return '📦'
  if (slug.includes('combo') || slug.includes('offer')) return '🏷️'
  if (slug.includes('luxury') || slug.includes('living') || slug.includes('home')) return '🛋️'
  if (slug.includes('grocery') || slug.includes('food')) return '🛒'
  if (slug.includes('electr')) return '📱'
  return '✨'
}

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

  // State: Customer Auth & Data
  const [customer, setCustomer] = useState(null)
  const [customerAddress, setCustomerAddress] = useState(null)
  const [cartCount, setCartCount] = useState(() => getCartCount())
  const [cartSubtotal, setCartSubtotal] = useState(() => getCartSubtotal())
  const [wishlistCount, setWishlistCount] = useState(() => getWishlistIds().length)

  // State: Settings from MySQL
  const [storeSettings, setStoreSettings] = useState(null)
  const [deliverySettings, setDeliverySettings] = useState(null)
  const [referralSettings, setReferralSettings] = useState(null)
  const [promoOffer, setPromoOffer] = useState(null)

  // State: Navigation & Modals
  const [isAccountDropdownOpen, setIsAccountDropdownOpen] = useState(false)
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [allProductsCache, setAllProductsCache] = useState([])

  // Category Mega Menu State
  const [categoryList, setCategoryList] = useState(categories)
  const [subcategoryList, setSubcategoryList] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false)
  const [expandedMobileCatId, setExpandedMobileCatId] = useState(null)

  // Refs
  const accountDropdownRef = useRef(null)
  const locationDropdownRef = useRef(null)
  const searchContainerRef = useRef(null)
  const megaMenuRef = useRef(null)
  const allCategoriesBtnRef = useRef(null)

  const referralPercentText = referralSettings?.referrer_discount_percent
    ? `${Number(referralSettings.referrer_discount_percent)}% OFF`
    : 'Rewards'
  const isReferralActive = referralSettings ? Boolean(referralSettings.is_enabled) : true

  // Fetch store, delivery, promo, and referral settings from MySQL
  useEffect(() => {
    let mounted = true

    const loadNavbarData = (force = false) => {
      fetchStoreSettings(force).then((s) => {
        if (mounted && s) setStoreSettings(s)
      })
      fetchDeliverySettings(force).then((d) => {
        if (mounted && d) setDeliverySettings(d)
      })
      fetchReferralSettings().then((ref) => {
        if (mounted && ref) setReferralSettings(ref)
      })
      fetchActiveOffers().then((res) => {
        const offers = Array.isArray(res) ? res : (res?.offers || [])
        if (mounted && offers.length > 0) {
          setPromoOffer(offers[0])
        } else {
          // Dynamic fallback to active Admin coupon if no dedicated offer banner configured
          fetchAvailableCoupons().then((coupons) => {
            if (mounted && Array.isArray(coupons) && coupons.length > 0) {
              const topCoupon = coupons[0]
              setPromoOffer({
                title: topCoupon.name,
                code: topCoupon.code,
                badge_text: topCoupon.discount_type === 'PERCENTAGE'
                  ? `${Math.round(Number(topCoupon.discount_value))}% OFF`
                  : `₹${Math.round(Number(topCoupon.discount_value))} OFF`,
              })
            }
          }).catch(() => {})
        }
      })
      fetchCategories(force).then((cats) => {
        if (mounted && Array.isArray(cats) && cats.length > 0) {
          setCategoryList((prev) => (prev && prev.length > 0 ? prev : cats))
          setSelectedCategoryId((prev) => prev || cats[0]?.id)
        }
      })
      fetchSubcategories(force).then((subs) => {
        if (mounted && Array.isArray(subs)) {
          setSubcategoryList(subs)
        }
      })
    }

    loadNavbarData()

    // Listen for cross-tab or revalidation events when admin updates configuration
    const handleRevalidate = () => loadNavbarData(true)
    window.addEventListener('storefront-revalidate', handleRevalidate)

    return () => {
      mounted = false
      window.removeEventListener('storefront-revalidate', handleRevalidate)
    }
  }, [])

  // Ensure selectedCategoryId defaults to first category
  useEffect(() => {
    if (categoryList.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(categoryList[0].id)
    }
  }, [categoryList, selectedCategoryId])

  // Cache products for instant search preview and category fallback items
  useEffect(() => {
    let mounted = true
    api
      .get('/products?channel=ecommerce&is_active=1&limit=60')
      .then((res) => {
        if (mounted) {
          const items = res.data?.items || res.data?.data || []
          setAllProductsCache(items)
        }
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  // Live search filtering
  useEffect(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q || q.length < 2 || allProductsCache.length === 0) {
      setSearchSuggestions([])
      return
    }
    const matched = allProductsCache
      .filter((p) => {
        const nameMatch = p.name && p.name.toLowerCase().includes(q)
        const descMatch = p.short_description && p.short_description.toLowerCase().includes(q)
        const codeMatch = p.product_code && p.product_code.toLowerCase().includes(q)
        const brandMatch = p.brand_name && p.brand_name.toLowerCase().includes(q)
        return nameMatch || descMatch || codeMatch || brandMatch
      })
      .slice(0, 5)
    setSearchSuggestions(matched)
  }, [localSearch, allProductsCache])

  // Active Category Object in Mega Menu
  const activeCategoryObj = useMemo(() => {
    if (!categoryList || categoryList.length === 0) return null
    if (!selectedCategoryId) return categoryList[0]
    return categoryList.find((c) => String(c.id) === String(selectedCategoryId)) || categoryList[0] || null
  }, [selectedCategoryId, categoryList])

  // Subcategories belonging to the active category
  const selectedCategorySubcategories = useMemo(() => {
    if (!activeCategoryObj) return []
    return subcategoryList.filter((s) => {
      const catIds = Array.isArray(s.category_ids)
        ? s.category_ids.map(Number)
        : s.category_id ? [Number(s.category_id)] : []
      return catIds.includes(Number(activeCategoryObj.id))
    })
  }, [activeCategoryObj, subcategoryList])

  // Real products belonging to the active category (used when subcategories are empty)
  const activeCategoryProducts = useMemo(() => {
    if (!activeCategoryObj || allProductsCache.length === 0) return []
    return allProductsCache
      .filter((p) => Number(p.category_id) === Number(activeCategoryObj.id))
      .slice(0, 8)
  }, [activeCategoryObj, allProductsCache])

  // Sync cart count & subtotal via DB API & window event
  useEffect(() => {
    fetchCart().then((c) => {
      setCartCount(c.item_count || 0)
      setCartSubtotal(c.subtotal || '0.00')
    })
    const handleCartSync = (e) => {
      if (e?.detail) {
        setCartCount(e.detail.totalCount ?? getCartCount())
        setCartSubtotal(e.detail.subtotal ?? getCartSubtotal())
      } else {
        setCartCount(getCartCount())
        setCartSubtotal(getCartSubtotal())
      }
    }
    window.addEventListener('cart-updated', handleCartSync)
    return () => window.removeEventListener('cart-updated', handleCartSync)
  }, [])

  // Sync wishlist count via DB API & window event
  useEffect(() => {
    fetchWishlist().then((res) => {
      const ids = res?.productIds || (Array.isArray(res) ? res : [])
      setWishlistCount(ids.length)
    })
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
      setCustomerAddress(null)
      return
    }

    api
      .get('/customers/me')
      .then((res) => {
        if (res.data?.customer) {
          setCustomer(res.data.customer)
          setCustomerSession(token, res.data.customer)
          // Fetch saved customer address for location badge
          fetchCustomerAddresses()
            .then((addrRes) => {
              const addresses = addrRes?.addresses || (Array.isArray(addrRes) ? addrRes : [])
              if (addresses.length > 0) {
                const def = addresses.find((a) => a.is_default) || addresses[0]
                setCustomerAddress(def)
              }
            })
            .catch(() => {})
        } else {
          clearCustomerSession()
          setCustomer(null)
          setCustomerAddress(null)
        }
      })
      .catch(() => {
        clearCustomerSession()
        setCustomer(null)
        setCustomerAddress(null)
      })
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target)) {
        setIsAccountDropdownOpen(false)
      }
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setIsLocationModalOpen(false)
      }
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchFocused(false)
      }
      if (
        megaMenuRef.current &&
        !megaMenuRef.current.contains(e.target) &&
        allCategoriesBtnRef.current &&
        !allCategoriesBtnRef.current.contains(e.target)
      ) {
        setIsMegaMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close menus on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsMegaMenuOpen(false)
        setIsAccountDropdownOpen(false)
        setIsLocationModalOpen(false)
        setIsSearchFocused(false)
        setIsMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close all open menus on route navigation
  useEffect(() => {
    setIsMegaMenuOpen(false)
    setIsMobileMenuOpen(false)
    setIsAccountDropdownOpen(false)
    setIsLocationModalOpen(false)
    setIsSearchFocused(false)
  }, [location.pathname, location.search])

  // Search submission handler
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault()
    setIsSearchFocused(false)
    const q = localSearch.trim()
    if (onSearchChange) {
      onSearchChange(q)
    }
    navigate(`/products?search=${encodeURIComponent(q)}`)
  }

  const handleLogout = () => {
    clearCustomerSession()
    setCustomer(null)
    setCustomerAddress(null)
    setIsAccountDropdownOpen(false)
    navigate('/')
  }

  const handleCartClick = () => {
    if (onOpenCart) {
      onOpenCart()
    } else {
      window.dispatchEvent(new CustomEvent('open-cart'))
    }
  }

  const storeName = storeSettings?.store_name || 'Qynova'
  const storeTagline = storeSettings?.tagline || 'Supermarket & Essentials'
  const storeLogo = storeSettings?.logo ? resolveImageUrl(storeSettings.logo) : null
  const whatsappClean = (storeSettings?.whatsapp_number || storeSettings?.phone || '').replace(/[^0-9]/g, '')
  const whatsappUrl = whatsappClean ? `https://wa.me/${whatsappClean}` : '#'
  const helplineText = storeSettings?.phone ? `📞 ${storeSettings.phone}` : null
  const freeThreshold = deliverySettings?.free_delivery_threshold != null ? Number(deliverySettings.free_delivery_threshold) : null
  const estDeliveryText = deliverySettings?.estimated_delivery_text || '2–4 Business Days'

  // Delivery Location display string
  const deliveryLocationDisplay = useMemo(() => {
    if (customerAddress) {
      const city = customerAddress.city_district || customerAddress.city || ''
      const pin = customerAddress.pincode || ''
      if (city && pin) return `${city} ${pin}`
      if (city) return city
      if (pin) return pin
    }
    if (storeSettings?.city && storeSettings?.pincode) {
      return `${storeSettings.city} ${storeSettings.pincode}`
    }
    return storeSettings?.city || 'Select Location'
  }, [customerAddress, storeSettings])

  return (
    <div className="sticky top-0 z-40 w-full shadow-xs bg-white">
      {/* 1. TOP PROMOTIONAL STRIP (Burgundy Theme) */}
      <div className="bg-[#F2DDE9] text-[#2D252B] text-[11px] sm:text-xs py-1.5 px-3 sm:px-6 lg:px-8 xl:px-12 border-b border-[#E8E0E5]">
        <div className="w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 truncate">
            {promoOffer ? (
              <>
                <span className="bg-[#601D49] text-white text-[9px] sm:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 shadow-xs">
                  {promoOffer.badge_text || 'Offer'}
                </span>
                <span className="font-medium text-[#2D252B] truncate text-[10px] sm:text-xs">
                  {promoOffer.title}{' '}
                  {promoOffer.code ? (
                    <>
                      Code: <strong className="text-[#601D49] font-black tracking-wide">{promoOffer.code}</strong>
                    </>
                  ) : null}
                </span>
              </>
            ) : freeThreshold !== null && freeThreshold > 0 ? (
              <span className="font-medium text-[#2D252B] truncate text-[10px] sm:text-xs">
                ✨ Free Express Shipping on orders above{' '}
                <strong className="text-[#601D49] font-black">₹{freeThreshold}</strong>
              </span>
            ) : (
              <span className="font-medium text-[#2D252B] truncate text-[10px] sm:text-xs">
                🚚 Express Delivery: <strong className="text-[#601D49] font-black">{estDeliveryText}</strong>
              </span>
            )}
          </div>
          <div className="hidden md:flex items-center gap-4 lg:gap-6 text-[#6B5E68] text-xs shrink-0 font-medium">
            {freeThreshold !== null && freeThreshold > 0 && (
              <span className="flex items-center gap-1.5">
                <span>🚚 Free Delivery on ₹{freeThreshold}+</span>
              </span>
            )}
            {helplineText && (
              <>
                {freeThreshold !== null && freeThreshold > 0 && <span>•</span>}
                <span className="flex items-center gap-1.5 font-bold text-[#2D252B]">
                  <span>{helplineText}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. FIRST ROW: JIOMART-INSPIRED MAIN NAVBAR */}
      <header className="bg-white border-b border-[#E8E0E5]">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-2.5 sm:py-3.5 flex items-center justify-between gap-2.5 sm:gap-6">
          {/* LEFT: Logo + Location Selection */}
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {/* Brand Logo & Name */}
            <Link to="/" className="flex items-center gap-2 sm:gap-2.5 group select-none">
              {storeLogo ? (
                <img
                  src={storeLogo}
                  alt={storeName}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl object-cover shadow-xs group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#601D49] to-[#601D49] flex items-center justify-center text-white shadow-md shadow-black/15 group-hover:scale-105 transition-transform">
                  <svg
                    className="w-5 h-5 sm:w-6 sm:h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="8" cy="21" r="1" />
                    <circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                    <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#F2DDE9" stroke="none" />
                  </svg>
                </div>
              )}
              <div>
                <div className="flex items-baseline leading-none">
                  <span className="text-lg sm:text-2xl font-black tracking-tight text-[#601D49]">
                    {storeName}
                  </span>
                </div>
                {storeTagline && (
                  <p className="text-[8px] sm:text-[10px] font-bold tracking-wider text-[#6B5E68] uppercase mt-0.5 truncate max-w-[140px] sm:max-w-[200px]">
                    {storeTagline}
                  </p>
                )}
              </div>
            </Link>

            {/* JioMart Delivery Location Widget */}
            <div className="relative" ref={locationDropdownRef}>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen((prev) => !prev)}
                className="hidden sm:flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl hover:bg-[#F8F3F6] border border-transparent hover:border-[#E8E0E5] transition-all cursor-pointer text-left select-none group"
                title="Delivery Location & Estimates"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#F2DDE9] text-[#601D49] flex items-center justify-center shrink-0 group-hover:bg-[#601D49] group-hover:text-white transition-colors">
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="leading-tight">
                  <span className="block text-[9px] sm:text-[10px] font-bold text-[#6B5E68] uppercase tracking-wider">
                    Deliver to
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs sm:text-[13px] font-extrabold text-[#2D252B] truncate max-w-[120px] lg:max-w-[160px]">
                      {deliveryLocationDisplay}
                    </span>
                    <span className="text-[9px] text-[#601D49] transition-transform duration-200">
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {/* Location Details Popover */}
              {isLocationModalOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-[#E8E0E5] p-4 z-50 animate-in fade-in zoom-in-95 duration-150 text-[#2D252B]">
                  <div className="flex items-start justify-between pb-2 border-b border-[#E8E0E5]">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📍</span>
                      <div>
                        <h4 className="text-xs font-black text-[#2D252B]">Delivery Location</h4>
                        <p className="text-[11px] font-semibold text-[#601D49]">{deliveryLocationDisplay}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLocationModalOpen(false)}
                      className="text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-[#6B5E68]">
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F3F6] border border-[#E8E0E5]">
                      <span className="text-base">🚚</span>
                      <div>
                        <p className="font-bold text-[#2D252B] text-[11px]">Estimated Timeline</p>
                        <p className="text-[10px] text-[#6B5E68]">{estDeliveryText}</p>
                      </div>
                    </div>

                    {freeThreshold !== null && freeThreshold > 0 && (
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[#F8F3F6] border border-[#E8E0E5]">
                        <span className="text-base">✨</span>
                        <div>
                          <p className="font-bold text-[#2D252B] text-[11px]">Free Shipping</p>
                          <p className="text-[10px] text-[#6B5E68]">Eligible on orders above ₹{freeThreshold}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-[#E8E0E5]">
                    {customer ? (
                      <Link
                        to="/profile"
                        onClick={() => setIsLocationModalOpen(false)}
                        className="block w-full py-1.5 px-3 rounded-xl bg-[#F2DDE9] text-[#601D49] text-[11px] font-bold text-center hover:bg-[#F2DDE9] transition-colors"
                      >
                        Manage Addresses in Profile →
                      </Link>
                    ) : (
                      <Link
                        to="/login"
                        onClick={() => setIsLocationModalOpen(false)}
                        className="block w-full py-1.5 px-3 rounded-xl bg-[#F2DDE9] text-[#601D49] text-[11px] font-bold text-center hover:bg-[#F2DDE9] transition-colors"
                      >
                        Sign In to Save Delivery Address →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: JioMart-Style Wide Search Bar (Desktop / Tablet) */}
          <div className="flex-1 max-w-2xl mx-2 lg:mx-6 hidden md:block" ref={searchContainerRef}>
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="relative flex items-center">
                <button
                  type="submit"
                  className="absolute left-3.5 text-[#6B5E68] hover:text-[#601D49] transition-colors cursor-pointer"
                  title="Search"
                  aria-label="Search"
                >
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>

                <input
                  type="text"
                  value={localSearch}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setLocalSearch(e.target.value)
                    if (onSearchChange) onSearchChange(e.target.value)
                  }}
                  placeholder="Search products, jewellery, accessories, gifts, toys..."
                  className="w-full h-10.5 pl-11 pr-10 rounded-full bg-[#F8F3F6] hover:bg-[#F7F5F7]/40 border border-[#E8E0E5] text-xs sm:text-sm text-[#2D252B] placeholder-[#6B5E68] focus:outline-none focus:border-[#601D49] focus:bg-white focus:ring-2 focus:ring-[#601D49]/15 transition-all shadow-2xs"
                />

                {localSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalSearch('')
                      if (onSearchChange) onSearchChange('')
                    }}
                    className="absolute right-3.5 text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-200 cursor-pointer"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Instant Search Suggestions Dropdown */}
              {isSearchFocused && searchSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-[#E8E0E5] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="p-2 border-b border-gray-100 flex items-center justify-between bg-[#F8F3F6]">
                    <span className="text-[10px] font-black uppercase text-[#601D49] tracking-wider px-2">
                      Matching Products
                    </span>
                    <button
                      type="button"
                      onClick={handleSearchSubmit}
                      className="text-[11px] font-bold text-[#601D49] hover:underline px-2 cursor-pointer"
                    >
                      View all results →
                    </button>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                    {searchSuggestions.map((prod) => (
                      <Link
                        key={prod.id}
                        to={`/product/${prod.id}`}
                        onClick={() => setIsSearchFocused(false)}
                        className="flex items-center gap-3 p-2.5 hover:bg-[#F7F5F7] transition-colors"
                      >
                        <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                          {prod.primary_image ? (
                            <img
                              src={resolveImageUrl(prod.primary_image)}
                              alt={prod.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                              🛍️
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#2D252B] truncate">{prod.name}</p>
                          <p className="text-[10px] text-gray-400 truncate">
                            {prod.brand_name || 'In Stock'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-[#601D49]">
                            ₹{prod.min_price || prod.mrp || '—'}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>

          {/* RIGHT: JioMart-Style Standalone Icons (Offers, Wishlist, Cart, Account, Mobile Toggle) */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {/* 1. Offers / Rewards Standalone Button */}
            {onOpenReferral && isReferralActive && (
              <button
                type="button"
                onClick={onOpenReferral}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#2D252B] hover:text-[#601D49] transition-colors cursor-pointer"
                title={`Offers & Rewards (${referralPercentText})`}
                aria-label="Offers and Rewards"
              >
                <div className="w-5.5 h-5.5 rounded-full border-[1.8px] border-current flex items-center justify-center font-black text-[11px] leading-none">
                  %
                </div>
              </button>
            )}

            {/* 2. Standalone Wishlist Icon with Live Count Badge */}
            <Link
              to="/products?wishlist=1"
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#2D252B] hover:text-[#601D49] transition-colors cursor-pointer group"
              title="Saved Wishlist"
              aria-label="Saved Wishlist"
            >
              <svg
                className="w-5.5 h-5.5 sm:w-6 sm:h-6 transition-transform group-hover:scale-105"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              {wishlistCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 bg-[#601D49] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs leading-none">
                  {wishlistCount}
                </span>
              )}
            </Link>

            {/* 3. Standalone Shopping Cart Icon with Live Count Badge */}
            <button
              type="button"
              onClick={handleCartClick}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#2D252B] hover:text-[#601D49] transition-colors cursor-pointer group select-none"
              title="Shopping Cart"
              aria-label="Shopping Cart"
            >
              <svg
                className="w-5.5 h-5.5 sm:w-6 sm:h-6 transition-transform group-hover:scale-105"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[17px] h-[17px] px-1 bg-[#601D49] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-xs leading-none">
                  {cartCount}
                </span>
              )}
            </button>

            {/* 4. Standalone Customer Account Icon & Dropdown */}
            {customer ? (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#2D252B] hover:text-[#601D49] transition-colors cursor-pointer select-none"
                  title={`Account (${customer.name || 'Customer'})`}
                  aria-label="Customer Account Menu"
                >
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name || 'Customer'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-[#E8E0E5]"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#601D49] text-white font-black text-xs uppercase shadow-xs items-center justify-center ${
                      customer.profile_photo_path ? 'hidden' : 'flex'
                    }`}
                  >
                    {customer.name?.trim().charAt(0) || 'C'}
                  </div>
                </button>

                {/* Account Dropdown Menu */}
                {isAccountDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-[#E8E0E5] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
                      {customer.profile_photo_path ? (
                        <img
                          src={customer.profile_photo_path}
                          alt={customer.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-[#E8E0E5] shadow-xs"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#601D49] text-white flex items-center justify-center font-black text-sm uppercase shadow-xs">
                          {customer.name?.trim().charAt(0) || 'C'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[#2D252B] truncate">{customer.name}</p>
                        <p className="text-[11px] text-[#6B5E68] truncate">
                          {customer.email || (customer.phone ? `+91 ${customer.phone}` : 'Store Customer')}
                        </p>
                      </div>
                    </div>

                    <Link
                      to="/profile"
                      onClick={() => setIsAccountDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-[#2D252B] hover:bg-[#F7F5F7] hover:text-[#601D49] transition-colors"
                    >
                      <span>👤</span>
                      <span>My Profile</span>
                    </Link>

                    <Link
                      to="/orders"
                      onClick={() => setIsAccountDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-[#2D252B] hover:bg-[#F7F5F7] hover:text-[#601D49] transition-colors"
                    >
                      <span>📦</span>
                      <span>My Orders</span>
                    </Link>

                    {onOpenReferral && isReferralActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAccountDropdownOpen(false)
                          onOpenReferral()
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-pink-600 hover:bg-pink-50 transition-colors text-left cursor-pointer"
                      >
                        <span>🎁</span>
                        <span>Refer & Earn ({referralPercentText})</span>
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
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-[#2D252B] hover:text-[#601D49] transition-colors cursor-pointer select-none"
                title="Customer Sign In"
                aria-label="Customer Sign In"
              >
                <svg className="w-5.5 h-5.5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </Link>
            )}

            {/* 5. Mobile Hamburger Toggle (< 768px) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="md:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-50 hover:bg-gray-100 text-[#2D252B] border border-[#E8E0E5] flex items-center justify-center transition-colors cursor-pointer active:scale-95"
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

        {/* 2B. MOBILE SEARCH BAR (Accessible on < 768px) */}
        <div className="md:hidden px-3 sm:px-6 pb-2.5 pt-0.5">
          <form onSubmit={handleSearchSubmit} className="relative">
            <input
              type="text"
              value={localSearch}
              onChange={(e) => {
                setLocalSearch(e.target.value)
                if (onSearchChange) onSearchChange(e.target.value)
              }}
              placeholder="Search products, jewellery, gifts..."
              className="w-full h-10 pl-10 pr-9 rounded-full bg-[#F8F3F6] border border-[#E8E0E5] text-xs text-[#2D252B] placeholder-[#6B5E68] focus:outline-none focus:border-[#601D49] focus:bg-white focus:ring-1 focus:ring-[#601D49]/20 transition-all"
            />
            <button
              type="submit"
              className="absolute left-3.5 top-3 text-[#6B5E68] hover:text-[#601D49] cursor-pointer"
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

        {/* 3. SECOND ROW: JIOMART HORIZONTAL NAVIGATION ROW (Navigation on left, All Categories on far right) */}
        <nav className="hidden md:block bg-white text-[#2D252B] border-t border-[#E8E0E5] shadow-xs relative z-30">
          <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 flex items-center justify-between py-1.5 sm:py-2">
            {/* LEFT: Horizontal Navigation Links */}
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 text-xs sm:text-sm font-bold flex-wrap">
              {/* Home */}
              <Link
                to="/"
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  location.pathname === '/' && activeNav === 'home'
                    ? 'bg-[#F2DDE9] text-[#601D49] shadow-xs font-extrabold'
                    : 'text-[#2D252B] hover:text-[#601D49] hover:bg-[#F8F3F6]'
                }`}
              >
                <span>🏠 Home</span>
              </Link>

              {/* All Products */}
              <Link
                to="/products"
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                  location.pathname === '/products' && !location.search
                    ? 'bg-[#F2DDE9] text-[#601D49] shadow-xs font-extrabold'
                    : 'text-[#2D252B] hover:text-[#601D49] hover:bg-[#F8F3F6]'
                }`}
              >
                <span>🛍️ All Products</span>
              </Link>

              {/* Best Sellers */}
              <Link
                to="/products?section=best_sellers"
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  location.search.includes('best_sellers')
                    ? 'bg-[#F2DDE9] text-[#601D49] shadow-xs font-extrabold'
                    : 'text-[#2D252B] hover:text-[#601D49] hover:bg-[#F8F3F6]'
                }`}
              >
                ⭐ Best Sellers
              </Link>

              {/* New Arrivals */}
              <Link
                to="/products?section=new_arrivals"
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  location.search.includes('new_arrivals')
                    ? 'bg-[#F2DDE9] text-[#601D49] shadow-xs font-extrabold'
                    : 'text-[#2D252B] hover:text-[#601D49] hover:bg-[#F8F3F6]'
                }`}
              >
                ✨ New Arrivals
              </Link>

              {/* Featured Products */}
              <Link
                to="/products?section=featured"
                className={`px-3 py-1.5 rounded-xl transition-all ${
                  location.search.includes('featured')
                    ? 'bg-[#F2DDE9] text-[#601D49] shadow-xs font-extrabold'
                    : 'text-[#2D252B] hover:text-[#601D49] hover:bg-[#F8F3F6]'
                }`}
              >
                💎 Featured Products
              </Link>

              {/* Offers & Deals */}
              <Link
                to="/products?section=deals"
                className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                  location.search.includes('deals')
                    ? 'bg-[#F2DDE9] text-[#601D49] shadow-xs font-extrabold'
                    : 'text-[#2D252B] hover:text-[#601D49] hover:bg-[#F8F3F6]'
                }`}
              >
                <span>🔥 Offers & Deals</span>
              </Link>

              {/* WhatsApp Support */}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl text-[#6B5E68] hover:text-[#25D366] transition-colors text-xs flex items-center gap-1 font-semibold"
              >
                <span>💬 WhatsApp Support</span>
              </a>
            </div>

            {/* FAR RIGHT: ALL CATEGORIES BUTTON (JioMart Style Mega Menu Trigger) */}
            <div className="relative shrink-0 ml-4">
              <button
                ref={allCategoriesBtnRef}
                type="button"
                onClick={() => setIsMegaMenuOpen((prev) => !prev)}
                className={`px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer font-black shadow-xs select-none text-xs sm:text-sm ${
                  isMegaMenuOpen
                    ? 'bg-[#601D49] text-white shadow-md'
                    : 'bg-[#F2DDE9] hover:bg-[#F2DDE9] text-[#601D49] hover:shadow-xs'
                }`}
                aria-haspopup="true"
                aria-expanded={isMegaMenuOpen}
                aria-label="All Categories Navigation"
              >
                <svg className="w-4 h-4 text-current shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                </svg>
                <span>All Categories</span>
                <svg
                  className={`w-3.5 h-3.5 text-current transition-transform duration-200 shrink-0 ${
                    isMegaMenuOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </nav>

        {/* 🌟 JIOMART-INSPIRED CATEGORY MEGA MENU DROPDOWN PANEL */}
        {isMegaMenuOpen && (
          <>
            {/* Backdrop Dimmer overlay */}
            <div
              className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px] z-40 transition-opacity"
              onClick={() => setIsMegaMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Mega Menu Dropdown */}
            <div
              ref={megaMenuRef}
              className="absolute top-full left-0 right-0 z-50 px-2 sm:px-6 lg:px-8 xl:px-12 pt-2 pb-4"
              role="region"
              aria-label="Category mega menu"
            >
              <div className="w-full mx-auto bg-white rounded-3xl shadow-2xl border border-[#E8E0E5] overflow-hidden flex flex-col md:flex-row min-h-[460px] max-h-[580px] animate-in fade-in slide-in-from-top-2 duration-150">
                {/* LEFT SIDE: Vertical list of categories (JioMart vertical tabs) */}
                <div className="w-full md:w-36 lg:w-44 bg-[#F8F3F6] border-r border-[#E8E0E5] flex flex-col shrink-0">
                  <div className="px-3 py-2.5 border-b border-[#E8E0E5] flex items-center justify-between bg-[#F7F5F7]/60">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#601D49]">
                      Departments
                    </span>
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[#F2DDE9] text-[#601D49]">
                      {categoryList.length}
                    </span>
                  </div>

                  {/* Vertical scrollable list of categories */}
                  <div className="overflow-y-auto flex-1 divide-y divide-[#E8E0E5]/40 py-1">
                    {categoryList.map((cat) => {
                      const isSelected = String(cat.id) === String(selectedCategoryId)
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(cat.id)}
                          onMouseEnter={() => setSelectedCategoryId(cat.id)}
                          className={`w-full px-2 py-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative group select-none ${
                            isSelected
                              ? 'bg-white text-[#601D49] font-black shadow-xs'
                              : 'text-[#6B5E68] hover:text-[#2D252B] hover:bg-white/60 font-semibold'
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#601D49] rounded-r-full" />
                          )}
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl overflow-hidden mb-1.5 transition-transform group-hover:scale-105 ${
                              isSelected
                                ? 'bg-[#F2DDE9] text-[#601D49]'
                                : 'bg-white text-gray-600 border border-[#E8E0E5]'
                            }`}
                          >
                            {cat.image_path ? (
                              <img
                                src={resolveImageUrl(cat.image_path)}
                                alt={cat.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{getCategoryIcon(cat)}</span>
                            )}
                          </div>
                          <span className="text-[11px] leading-tight px-1 line-clamp-2 max-w-[120px]">
                            {cat.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>

                  <div className="p-2 border-t border-[#E8E0E5] bg-white text-center">
                    <Link
                      to="/products"
                      onClick={() => setIsMegaMenuOpen(false)}
                      className="text-[10px] font-black text-[#601D49] hover:text-[#601D49] hover:underline"
                    >
                      All Catalog →
                    </Link>
                  </div>
                </div>

                {/* RIGHT SIDE: Subcategories belonging to the selected category (JioMart Card Grid) */}
                <div className="flex-1 min-w-0 bg-white flex flex-col overflow-hidden">
                  {activeCategoryObj ? (
                    <>
                      {/* Category Header */}
                      <div className="p-4 sm:p-5 border-b border-[#E8E0E5] bg-gradient-to-r from-white to-[#F8F3F6] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-black text-[#2D252B] truncate">
                              {activeCategoryObj.name}
                            </h3>
                            {activeCategoryObj.product_count !== undefined && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[#F2DDE9] text-[#601D49] border border-[#601D49]/20 shrink-0">
                                {activeCategoryObj.product_count} Items
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {activeCategoryObj.description ||
                              `Explore subcategories and collections in ${activeCategoryObj.name}`}
                          </p>
                        </div>

                        <Link
                          to={`/products?category_id=${activeCategoryObj.id}`}
                          onClick={() => setIsMegaMenuOpen(false)}
                          className="shrink-0 px-4 py-2 rounded-full bg-[#601D49] hover:bg-[#601D49] text-white text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <span>View All in {activeCategoryObj.name}</span>
                          <span>→</span>
                        </Link>
                      </div>

                      {/* Subcategories Grid or Direct Browse */}
                      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        {selectedCategorySubcategories.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between mb-3.5">
                              <span className="text-[11px] font-black uppercase tracking-wider text-[#601D49]">
                                Subcategories ({selectedCategorySubcategories.length})
                              </span>
                              <span className="text-xs text-gray-400">
                                Click a subcategory to browse targeted items
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                              {selectedCategorySubcategories.map((subcat) => (
                                <Link
                                  key={subcat.id}
                                  to={`/products?category_id=${activeCategoryObj.id}&subcategory_id=${subcat.id}`}
                                  onClick={() => setIsMegaMenuOpen(false)}
                                  className="group p-3 rounded-2xl border border-[#E8E0E5] hover:border-[#601D49] bg-white hover:bg-[#F8F3F6] transition-all flex flex-col items-center text-center shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                                >
                                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-2 group-hover:scale-105 transition-transform border border-gray-100">
                                    {subcat.image_path ? (
                                      <img
                                        src={resolveImageUrl(subcat.image_path)}
                                        alt={subcat.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#F2DDE9] text-[#601D49]">
                                        <span className="text-2xl font-black">{getCategoryIcon(activeCategoryObj)}</span>
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-bold text-[#2D252B] group-hover:text-[#601D49] line-clamp-2">
                                    {subcat.name}
                                  </h4>
                                  {subcat.product_count !== undefined && (
                                    <span className="text-[10px] text-gray-400 mt-0.5">
                                      {subcat.product_count} products
                                    </span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : activeCategoryProducts.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between mb-3.5">
                              <span className="text-[11px] font-black uppercase tracking-wider text-[#601D49]">
                                Popular in {activeCategoryObj.name}
                              </span>
                              <Link
                                to={`/products?category_id=${activeCategoryObj.id}`}
                                onClick={() => setIsMegaMenuOpen(false)}
                                className="text-xs font-extrabold text-[#601D49] hover:text-[#601D49] hover:underline"
                              >
                                Browse All Products →
                              </Link>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                              {activeCategoryProducts.map((prod) => (
                                <Link
                                  key={prod.id}
                                  to={`/product/${prod.id}`}
                                  onClick={() => setIsMegaMenuOpen(false)}
                                  className="group p-2.5 rounded-2xl border border-[#E8E0E5] hover:border-[#601D49] bg-white hover:bg-[#F8F3F6] transition-all flex flex-col items-center text-center shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                                >
                                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-2 group-hover:scale-105 transition-transform border border-gray-100">
                                    {prod.primary_image ? (
                                      <img
                                        src={resolveImageUrl(prod.primary_image)}
                                        alt={prod.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <span className="text-2xl">{getCategoryIcon(activeCategoryObj)}</span>
                                    )}
                                  </div>
                                  <h4 className="text-[11px] font-bold text-[#2D252B] group-hover:text-[#601D49] line-clamp-2">
                                    {prod.name}
                                  </h4>
                                  <span className="text-xs font-black text-[#601D49] mt-1">
                                    ₹{prod.min_price || prod.mrp || '—'}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center py-10 px-4 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-[#F2DDE9] text-[#601D49] flex items-center justify-center text-3xl font-black mb-3 shadow-xs">
                              {getCategoryIcon(activeCategoryObj)}
                            </div>
                            <h4 className="text-base font-black text-[#2D252B]">
                              Explore {activeCategoryObj.name}
                            </h4>
                            <p className="text-xs text-gray-500 max-w-md mt-1 mb-5">
                              Browse all available products in this category from our store catalog.
                            </p>
                            <Link
                              to={`/products?category_id=${activeCategoryObj.id}`}
                              onClick={() => setIsMegaMenuOpen(false)}
                              className="px-6 py-2.5 rounded-full bg-[#601D49] hover:bg-[#601D49] text-white text-xs font-black shadow-xs transition-all flex items-center gap-2"
                            >
                              <span>Browse All {activeCategoryObj.name} Products</span>
                              <span>→</span>
                            </Link>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-400 text-xs">
                      Select a category to view subcategories
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </header>

      {/* 4. MOBILE SLIDE-OUT DRAWER */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Body */}
          <div className="fixed inset-y-0 left-0 w-[84%] max-w-[340px] bg-white shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-250">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#E8E0E5] flex items-center justify-between bg-gradient-to-r from-[#F8F3F6] to-[#F2DDE9]">
              <div className="flex items-center gap-2.5">
                {storeLogo ? (
                  <img src={storeLogo} alt={storeName} className="w-8 h-8 rounded-xl object-cover shadow-xs" />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-[#601D49] text-white flex items-center justify-center font-black text-sm shadow-xs">
                    {storeName ? storeName.charAt(0) : 'Q'}
                  </div>
                )}
                <div>
                  <h3 className="font-black text-sm text-[#2D252B] truncate max-w-[180px]">
                    {storeName}
                  </h3>
                  <p className="text-[10px] text-[#601D49] font-semibold">{deliveryLocationDisplay}</p>
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
                <div className="p-3 mb-2 rounded-2xl bg-[#F7F5F7] border border-[#E8E0E5] flex items-center gap-3">
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-[#E8E0E5] shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[#601D49] text-white flex items-center justify-center font-black text-sm uppercase shadow-xs shrink-0">
                      {customer.name?.trim().charAt(0) || 'C'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-[#2D252B] truncate">
                      Hello, {customer.name?.split(' ')[0]} 👋
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Link
                        to="/profile"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="text-[11px] text-[#601D49] hover:underline"
                      >
                        Profile
                      </Link>
                      <span className="text-gray-300">•</span>
                      <Link
                        to="/orders"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="text-[11px] text-[#601D49] font-bold hover:underline"
                      >
                        My Orders →
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 mb-2 rounded-2xl bg-[#F7F5F7] border border-[#E8E0E5] flex items-center justify-between">
                  <div>
                    <p className="font-extrabold text-[#2D252B]">Welcome, Guest</p>
                    <p className="text-[10px] text-[#6B5E68]">Sign in to track orders & rewards</p>
                  </div>
                  <Link
                    to="/login"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="px-3 py-1.5 rounded-full bg-[#601D49] hover:bg-[#601D49] text-white text-[11px] font-black shadow-xs"
                  >
                    Login
                  </Link>
                </div>
              )}

              {/* Navigation Links */}
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F2DDE9] transition-colors"
              >
                <span>🏠</span>
                <span>Home Catalog</span>
              </Link>

              <Link
                to="/products"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F2DDE9] transition-colors"
              >
                <span>🛍️</span>
                <span>All Products</span>
              </Link>

              <Link
                to="/products?section=best_sellers"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F2DDE9] transition-colors"
              >
                <span>⭐</span>
                <span>Best Sellers</span>
              </Link>

              <Link
                to="/products?section=new_arrivals"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F2DDE9] transition-colors"
              >
                <span>✨</span>
                <span>New Arrivals</span>
              </Link>

              <Link
                to="/products?section=featured"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F2DDE9] transition-colors"
              >
                <span>💎</span>
                <span>Featured Selections</span>
              </Link>

              <Link
                to="/products?section=deals"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[#F2DDE9] transition-colors text-pink-700"
              >
                <span>🔥</span>
                <span>Flash Deals & Offers</span>
              </Link>

              {/* Expandable Mobile Category Menu */}
              {categoryList.length > 0 && (
                <div className="pt-2 border-t border-[#E8E0E5]">
                  <div className="flex items-center justify-between px-3.5 mb-1.5">
                    <span className="text-[10px] font-black uppercase text-[#601D49] tracking-wider">
                      Shop by Category
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F2DDE9] text-[#601D49]">
                      {categoryList.length}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {categoryList.map((cat) => {
                      const catSubs = subcategoryList.filter((s) => s.category_ids?.includes(Number(cat.id)))
                      const isExpanded = expandedMobileCatId === cat.id
                      return (
                        <div key={cat.id} className="rounded-xl border border-[#E8E0E5]/80 overflow-hidden bg-white">
                          <div className="flex items-center justify-between p-2.5">
                            <Link
                              to={`/products?category_id=${cat.id}`}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className="flex items-center gap-2.5 flex-1 min-w-0"
                            >
                              <div className="w-7 h-7 rounded-lg bg-[#F2DDE9] text-[#601D49] flex items-center justify-center shrink-0 overflow-hidden text-xs">
                                {cat.image_path ? (
                                  <img
                                    src={resolveImageUrl(cat.image_path)}
                                    alt={cat.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <span>{cat.icon || '✨'}</span>
                                )}
                              </div>
                              <span className="text-xs font-bold text-[#2D252B] truncate">
                                {cat.name}
                              </span>
                            </Link>

                            {catSubs.length > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setExpandedMobileCatId(isExpanded ? null : cat.id)
                                }}
                                className="p-1 rounded-lg text-gray-400 hover:text-[#601D49] hover:bg-[#F8F3F6] transition-colors"
                                aria-label={`Toggle ${cat.name} subcategories`}
                              >
                                <svg
                                  className={`w-4 h-4 transition-transform ${
                                    isExpanded ? 'rotate-180 text-[#601D49]' : ''
                                  }`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            )}
                          </div>

                          {/* Subcategories list when expanded */}
                          {catSubs.length > 0 && isExpanded && (
                            <div className="bg-[#F8F3F6] px-3 py-2 border-t border-[#E8E0E5] space-y-1">
                              <Link
                                to={`/products?category_id=${cat.id}`}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block py-1 px-2 text-[11px] font-extrabold text-[#601D49] hover:underline"
                              >
                                View All in {cat.name} →
                              </Link>
                              {catSubs.map((subcat) => (
                                <Link
                                  key={subcat.id}
                                  to={`/products?category_id=${cat.id}&subcategory_id=${subcat.id}`}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center justify-between py-1 px-2 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-[#F2DDE9] hover:text-[#601D49] transition-colors"
                                >
                                  <span>• {subcat.name}</span>
                                  {subcat.product_count !== undefined && (
                                    <span className="text-[10px] text-gray-400">({subcat.product_count})</span>
                                  )}
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Bottom Quick Tools */}
              <div className="border-t border-gray-100 my-2 pt-2 space-y-1">
                {onOpenReferral && isReferralActive && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false)
                      onOpenReferral()
                    }}
                    className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-pink-50 text-[#DB2777] font-bold"
                  >
                    <span>🎁</span>
                    <span>Refer & Earn ({referralPercentText})</span>
                  </button>
                )}

                <Link
                  to="/products?wishlist=1"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#F2DDE9] font-bold"
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
                    handleCartClick()
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-[#F2DDE9] font-bold text-[#2D252B]"
                >
                  <span className="flex items-center gap-3">
                    <span>🛍️</span>
                    <span>Shopping Cart</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#F2DDE9] text-[#601D49] text-xs font-black">
                    {cartCount} items
                  </span>
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-[#E8E0E5] bg-[#F8F3F6] text-xs text-gray-500 space-y-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-[#25D366] text-white font-extrabold flex items-center justify-center gap-2 shadow-xs"
              >
                <span>💬 WhatsApp Support</span>
              </a>
              <div className="flex items-center justify-between text-[11px] pt-1 text-[#601D49] font-semibold">
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

      {/* 5. JIOMART BOTTOM CART BAR (renders when cart has items) */}
      <BottomCartBar onOpenCart={handleCartClick} />
    </div>
  )
}
