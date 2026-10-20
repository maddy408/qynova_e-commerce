import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  api,
  getCustomerToken,
  getStoredCustomer,
  isTokenExpired,
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
import { ROUTES } from '../routes/routes'
import { getCartCount, getCartSubtotal, fetchCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist } from '../lib/wishlist'
import { removeDeviceToken, syncDeviceToken } from '../hooks/useDeviceToken'
import { useDeliveryLocation } from '../hooks/useDeliveryLocation'
import { NotificationBell } from './NotificationBell'
import BottomCartBar from './BottomCartBar'
import WishlistDrawer from './WishlistDrawer'
import {
  FiShoppingBag,
  FiGift,
  FiBox,
  FiTag,
  FiShoppingCart,
  FiHeart,
  FiTruck,
  FiMapPin,
  FiPhone,
  FiUser,
  FiLogOut,
  FiX,
  FiHome,
  FiGrid,
  FiStar,
  FiNavigation,
  FiCheck,
  FiShield,
  FiRefreshCw,
  FiDollarSign,
  FiSmartphone,
  FiSmile,
  FiSearch,
  FiMenu,
  FiChevronDown,
  FiPercent,
} from 'react-icons/fi'
import { FaWhatsapp } from 'react-icons/fa6'
import { LuSparkles } from 'react-icons/lu'
import { TbSparkles } from 'react-icons/tb'

function getCategoryIcon(cat) {
  if (!cat) return <FiShoppingBag className="w-5 h-5" />
  const slug = (cat.slug || cat.name || '').toLowerCase()
  if (slug.includes('hair')) return <FiHeart className="w-5 h-5" />
  if (slug.includes('jewel') || slug.includes('fashion')) return <LuSparkles className="w-5 h-5" />
  if (slug.includes('gift')) return <FiGift className="w-5 h-5" />
  if (slug.includes('toy')) return <FiSmile className="w-5 h-5" />
  if (slug.includes('bag') || slug.includes('pouch')) return <FiShoppingBag className="w-5 h-5" />
  if (slug.includes('beauty')) return <LuSparkles className="w-5 h-5" />
  if (slug.includes('storage') || slug.includes('utility')) return <FiBox className="w-5 h-5" />
  if (slug.includes('combo') || slug.includes('offer')) return <FiTag className="w-5 h-5" />
  if (slug.includes('luxury') || slug.includes('living') || slug.includes('home')) return <FiHome className="w-5 h-5" />
  if (slug.includes('grocery') || slug.includes('food')) return <FiShoppingCart className="w-5 h-5" />
  if (slug.includes('electr')) return <FiSmartphone className="w-5 h-5" />
  return <LuSparkles className="w-5 h-5" />
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

  // Delivery Location Hook
  const {
    location: userDeliveryLocation,
    detectLocation,
    isLoading: isDetectingLocation,
    error: locationError,
    selectManualLocation,
  } = useDeliveryLocation()

  // State: Customer Auth & Data
  const [customer, setCustomer] = useState(() => (getCustomerToken() ? getStoredCustomer() : null))
  const [customerAddress, setCustomerAddress] = useState(null)
  const [savedAddresses, setSavedAddresses] = useState([])
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
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)
  const [localSearch, setLocalSearch] = useState(searchQuery)
  const [searchSuggestions, setSearchSuggestions] = useState({
    products: [],
    categories: [],
    subcategories: [],
  })
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

  // Live search filtering: supports 1-letter search across products, categories, and subcategories
  useEffect(() => {
    const q = localSearch.trim().toLowerCase()
    if (!q || q.length < 1) {
      setSearchSuggestions({ products: [], categories: [], subcategories: [] })
      return
    }

    const matchedCats = (categoryList || [])
      .filter((c) => {
        const name = (c.name || '').toLowerCase()
        const desc = (c.description || '').toLowerCase()
        return name.includes(q) || desc.includes(q)
      })
      .slice(0, 4)

    const matchedSubs = (subcategoryList || [])
      .filter((s) => {
        const name = (s.name || '').toLowerCase()
        const desc = (s.description || '').toLowerCase()
        return name.includes(q) || desc.includes(q)
      })
      .slice(0, 4)

    const matchedProds = (allProductsCache || [])
      .filter((p) => {
        const nameMatch = p.name && p.name.toLowerCase().includes(q)
        const descMatch = p.short_description && p.short_description.toLowerCase().includes(q)
        const codeMatch = p.product_code && p.product_code.toLowerCase().includes(q)
        const brandMatch = p.brand_name && p.brand_name.toLowerCase().includes(q)
        return nameMatch || descMatch || codeMatch || brandMatch
      })
      .slice(0, 5)

    setSearchSuggestions({
      products: matchedProds,
      categories: matchedCats,
      subcategories: matchedSubs,
    })
  }, [localSearch, allProductsCache, categoryList, subcategoryList])

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

  // Customer authentication from backend (JWT is truth) & live event synchronization
  useEffect(() => {
    let mounted = true
    let isFetchingCustomer = false

    const fetchFreshCustomer = () => {
      const token = getCustomerToken()
      if (!token) {
        if (mounted) {
          setCustomer(null)
          setCustomerAddress(null)
          setSavedAddresses([])
        }
        return
      }

      if (isFetchingCustomer) return
      isFetchingCustomer = true

      api
        .get('/customers/me')
        .then((res) => {
          if (!mounted) return
          if (res.data?.customer) {
            setCustomer(res.data.customer)
            try {
              localStorage.setItem('customer_data', JSON.stringify(res.data.customer))
            } catch {
              // ignore
            }
            syncDeviceToken()
            // Fetch saved customer address for location badge
            fetchCustomerAddresses()
              .then((addrRes) => {
                if (!mounted) return
                const addresses = addrRes?.addresses || (Array.isArray(addrRes) ? addrRes : [])
                setSavedAddresses(addresses)
                if (addresses.length > 0) {
                  const def = addresses.find((a) => a.is_default) || addresses[0]
                  setCustomerAddress(def)
                }
              })
              .catch(() => {})
          } else {
            setCustomer(null)
            setCustomerAddress(null)
            setSavedAddresses([])
          }
        })
        .catch((err) => {
          if (!mounted) return
          if (err.response?.status === 401 || err.response?.status === 403) {
            const currentToken = getCustomerToken()
            if (!currentToken || isTokenExpired(currentToken)) {
              clearCustomerSession()
              setCustomer(null)
              setCustomerAddress(null)
              setSavedAddresses([])
            }
          }
        })
        .finally(() => {
          isFetchingCustomer = false
        })
    }

    // Initialize with stored customer cache immediately
    const cached = getStoredCustomer()
    if (cached && mounted) {
      setCustomer(cached)
    }

    // Verify token & fetch fresh data from backend
    if (getCustomerToken()) {
      fetchFreshCustomer()
    }

    // Listen for customer login, register, profile update, or logout events
    const handleCustomerSessionChange = (e) => {
      if (!mounted) return
      if (e?.detail?.customer) {
        setCustomer(e.detail.customer)
        syncDeviceToken()
        fetchCustomerAddresses()
          .then((addrRes) => {
            if (!mounted) return
            const addresses = addrRes?.addresses || (Array.isArray(addrRes) ? addrRes : [])
            setSavedAddresses(addresses)
            if (addresses.length > 0) {
              const def = addresses.find((a) => a.is_default) || addresses[0]
              setCustomerAddress(def)
            }
          })
          .catch(() => {})
      } else if (e?.detail?.customer === null || !getCustomerToken()) {
        setCustomer(null)
        setCustomerAddress(null)
        setSavedAddresses([])
      }
    }

    window.addEventListener('customer-session-changed', handleCustomerSessionChange)
    return () => {
      mounted = false
      window.removeEventListener('customer-session-changed', handleCustomerSessionChange)
    }
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
    navigate(ROUTES.PRODUCTS_SEARCH(q))
  }

  const handleLogout = () => {
    removeDeviceToken()
    clearCustomerSession()
    setCustomer(null)
    setCustomerAddress(null)
    setIsAccountDropdownOpen(false)
    navigate(ROUTES.HOME)
  }

  const handleCartClick = () => {
    if (onOpenCart) {
      onOpenCart()
    } else {
      window.dispatchEvent(new CustomEvent('open-cart'))
    }
  }

  const storeName = storeSettings?.store_name || 'Shop with Adam'
  const storeTagline = storeSettings?.tagline || 'Fresh • Daily • Essentials'
  const storeLogo = storeSettings?.logo ? resolveImageUrl(storeSettings.logo) : '/images/logo.png'
  const whatsappClean = (storeSettings?.whatsapp_number || storeSettings?.phone || '').replace(/[^0-9]/g, '')
  const whatsappUrl = whatsappClean ? `https://wa.me/${whatsappClean}` : '#'
  const helplineText = storeSettings?.phone ? storeSettings.phone : null
  const freeThreshold = deliverySettings?.free_delivery_threshold != null ? Number(deliverySettings.free_delivery_threshold) : null
  const estDeliveryText = deliverySettings?.estimated_delivery_text || '2–4 Business Days'

  // Delivery Location display string
  const deliveryLocationDisplay = useMemo(() => {
    if (userDeliveryLocation) {
      if (userDeliveryLocation.shortDisplay) return userDeliveryLocation.shortDisplay
      if (userDeliveryLocation.city && userDeliveryLocation.pincode) return `${userDeliveryLocation.city} ${userDeliveryLocation.pincode}`
      if (userDeliveryLocation.city) return userDeliveryLocation.city
    }
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
  }, [userDeliveryLocation, customerAddress, storeSettings])

  return (
    <div className="sticky top-0 z-40 w-full shadow-[0_2px_15px_rgba(2,132,199,0.06)] bg-white">
      {/* 1. TOP ANNOUNCEMENT STRIP (Soft Sky/Cyan Tint matching KiranaBazaar image) */}
      <div className="bg-[var(--color-primary-tint)] text-[#0369A1] text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-6 lg:px-8 xl:px-12 border-b border-sky-200/60 select-none">
        <div className="max-w-[1320px] mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <FiTruck className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
            <span className="font-sans font-medium text-[#0369A1] truncate text-[11px] sm:text-xs tracking-tight">
              Free Delivery on orders above <span className="font-bold text-[var(--color-primary)]">₹{freeThreshold || 499}</span>
            </span>
          </div>
          <div className="flex items-center gap-3 text-[#0369A1] text-[11px] sm:text-xs shrink-0 font-sans">
            <button
              type="button"
              onClick={() => setIsLocationModalOpen((prev) => !prev)}
              className="flex items-center gap-1.5 hover:text-[var(--color-primary-hover)] transition-colors cursor-pointer bg-white/60 hover:bg-white px-2 py-0.5 rounded-full border border-sky-200/60"
              title="Click to view or detect delivery location"
            >
              <FiMapPin className="w-3.5 h-3.5 text-[var(--color-primary)] shrink-0" />
              <span className="truncate max-w-[120px] sm:max-w-none font-medium">
                {userDeliveryLocation?.shortDisplay
                  ? `Delivering Happiness to ${userDeliveryLocation.shortDisplay}`
                  : storeSettings?.city
                  ? `Delivering Happiness to ${storeSettings.city} and nearby`
                  : 'Delivering Happiness to Jaipur and nearby'}
              </span>
            </button>
            <span className="hidden sm:inline text-sky-300">|</span>
            <span className="hidden sm:flex font-medium text-[#0369A1] items-center gap-1.5">
              <FiPhone className="w-3 h-3 text-[var(--color-primary)] shrink-0" />
              <span>{helplineText || '+91 98765 01234'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. FIRST ROW: ETHEREAL GLASSMORPHIC MAIN NAVBAR */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 flex items-center justify-between gap-3 sm:gap-6">
          {/* LEFT: Logo + Location Selection */}
          <div className="flex items-center gap-3 sm:gap-5 shrink-0">
            {/* Brand Logo & Name */}
            <Link to={ROUTES.HOME} className="flex items-center gap-2.5 sm:gap-3 group select-none">
              <img
                src={storeLogo || '/images/logo.png'}
                alt={storeName || 'Shop with Adam'}
                title="Shop with Adam"
                className="h-10 sm:h-12 w-auto max-w-[190px] sm:max-w-[230px] object-contain group-hover:scale-105 transition-transform"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = '/images/logo.png'
                }}
              />
            </Link>

            {/* Delivery Location Widget */}
            <div className="relative" ref={locationDropdownRef}>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen((prev) => !prev)}
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[var(--color-primary)] transition-all cursor-pointer text-left select-none group shadow-2xs"
                title="Delivery Location & Estimates"
              >
                <div className="relative w-6 h-6 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-primary)] flex items-center justify-center shrink-0 border border-sky-200">
                  <FiMapPin className="w-3 h-3" />
                  {userDeliveryLocation?.isGps && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--color-secondary)] border border-white" />
                  )}
                </div>
                <div className="leading-tight">
                  <span className="block text-[8px] sm:text-[9px] font-sans font-extrabold text-[var(--color-text-muted)] uppercase tracking-wider">
                    DELIVER TO
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="font-sans text-xs sm:text-[13px] font-bold text-[var(--color-text-main)] truncate max-w-[110px] lg:max-w-[150px]">
                      {deliveryLocationDisplay}
                    </span>
                    <span className="text-[8px] text-[var(--color-primary)] font-bold">
                      ▼
                    </span>
                  </div>
                </div>
              </button>

              {/* Location Details Popover */}
              {isLocationModalOpen && (
                <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-32px)] bg-white rounded-3xl shadow-xl border border-slate-200 p-4.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-[var(--color-text-main)]">
                  <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-primary-tint)] border border-sky-200 flex items-center justify-center text-[var(--color-primary)] shrink-0">
                        <FiMapPin className="text-base text-[var(--color-primary)]" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-[var(--color-text-main)]">Delivery Location</h4>
                        <p className="text-[11px] font-bold text-[var(--color-primary)] truncate max-w-[190px]">
                          {deliveryLocationDisplay}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLocationModalOpen(false)}
                      className="text-gray-400 hover:text-gray-700 text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Active coordinates badge if detected via GPS */}
                  {userDeliveryLocation?.isGps && userDeliveryLocation?.latitude && (
                    <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-[10.5px] font-mono text-emerald-800">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="font-bold">Live GPS Coordinates:</span>
                      </div>
                      <span>
                        {userDeliveryLocation.latitude.toFixed(4)}, {userDeliveryLocation.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}

                  {/* DETECT CURRENT LOCATION BUTTON */}
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={isDetectingLocation}
                      onClick={async () => {
                        try {
                          await detectLocation()
                        } catch (e) {
                          // error handled in hook
                        }
                      }}
                      className="w-full py-2.5 px-3 rounded-2xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs transition-all active:scale-98 cursor-pointer disabled:opacity-60"
                    >
                      {isDetectingLocation ? (
                        <>
                          <svg className="w-4 h-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          <span>Detecting GPS Location...</span>
                        </>
                      ) : (
                        <>
                          <FiNavigation className="w-3.5 h-3.5" />
                          <span>Detect Current Location</span>
                        </>
                      )}
                    </button>

                    {locationError && (
                      <p className="text-[10px] text-red-500 mt-1.5 px-1 leading-tight">
                        {locationError}
                      </p>
                    )}
                  </div>

                  {/* SAVED CUSTOMER ADDRESSES QUICK PICKER */}
                  {customer && savedAddresses.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-[#666666]">
                          Saved Addresses
                        </span>
                        <Link
                          to={ROUTES.PROFILE}
                          onClick={() => setIsLocationModalOpen(false)}
                          className="text-[10px] font-bold text-[#6C4EFF] hover:underline"
                        >
                          Manage
                        </Link>
                      </div>

                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                        {savedAddresses.slice(0, 3).map((addr) => {
                          const isSelected =
                            userDeliveryLocation?.streetAddress === addr.line1 ||
                            (!userDeliveryLocation && customerAddress?.id === addr.id)
                          return (
                            <button
                              key={addr.id}
                              type="button"
                              onClick={() => {
                                selectManualLocation({
                                  latitude: null,
                                  longitude: null,
                                  city: addr.city_district || addr.city,
                                  state: addr.state,
                                  pincode: addr.pincode,
                                  streetAddress: addr.line1,
                                  formattedAddress: [addr.line1, addr.line2, addr.city_district, addr.state, addr.pincode]
                                    .filter(Boolean)
                                    .join(', '),
                                  displayTitle: addr.address_type || 'Saved Address',
                                  displaySubtitle: `${addr.city_district || addr.city} ${addr.pincode}`,
                                  shortDisplay: `${addr.city_district || addr.city} ${addr.pincode}`,
                                  isGps: false,
                                })
                                setCustomerAddress(addr)
                                setIsLocationModalOpen(false)
                              }}
                              className={`w-full text-left p-2 rounded-xl border text-xs transition-all flex items-start gap-2 cursor-pointer ${
                                isSelected
                                  ? 'border-[#6C4EFF] bg-[#FAF8FF]'
                                  : 'border-gray-100 hover:border-[#E9DFFF] hover:bg-gray-50'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isSelected ? (
                                  <FiCheck className="w-3.5 h-3.5 text-[#6C4EFF]" />
                                ) : (
                                  <FiMapPin className="w-3.5 h-3.5 text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-[11px] text-[#1B133F]">
                                    {addr.address_type || 'Address'}
                                  </span>
                                  {addr.is_default ? (
                                    <span className="text-[9px] font-bold bg-[#E9DFFF] text-[#6C4EFF] px-1.5 py-0.2 rounded-full">
                                      Default
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-[10px] text-gray-500 truncate">
                                  {addr.line1}, {addr.city_district || addr.city} {addr.pincode}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Delivery Timeline and Shipping info */}
                  <div className="mt-3 space-y-1.5 text-xs text-[var(--color-text-muted)] pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)]">
                      <FiTruck className="text-sm text-[#7c3aed] shrink-0" />
                      <div>
                        <p className="font-bold text-[var(--color-text-main)] text-[11px]">Estimated Timeline</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{estDeliveryText}</p>
                      </div>
                    </div>

                    {freeThreshold !== null && freeThreshold > 0 && (
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)]">
                        <LuSparkles className="text-sm text-[#7c3aed] shrink-0" />
                        <div>
                          <p className="font-bold text-[var(--color-text-main)] text-[11px]">Free Shipping</p>
                          <p className="text-[10px] text-[var(--color-text-muted)]">
                            Eligible on orders above ₹{freeThreshold}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-[var(--color-border-subtle)]">
                    {customer ? (
                      <Link
                        to={ROUTES.PROFILE}
                        onClick={() => setIsLocationModalOpen(false)}
                        className="block w-full py-1.5 px-3 rounded-xl bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-[11px] font-bold text-center hover:bg-[var(--color-primary-tint)] transition-colors"
                      >
                        Manage Addresses in Profile →
                      </Link>
                    ) : (
                      <Link
                        to={ROUTES.LOGIN}
                        onClick={() => setIsLocationModalOpen(false)}
                        className="block w-full py-1.5 px-3 rounded-xl bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-[11px] font-bold text-center hover:bg-[var(--color-primary-tint)] transition-colors"
                      >
                        Sign In to Save Delivery Address →
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CENTER: Wide Grocery Search Bar (Desktop / Tablet) */}
          <div className="flex-1 max-w-2xl mx-2 lg:mx-6 hidden md:block" ref={searchContainerRef}>
            <form onSubmit={handleSearchSubmit} className="relative">
              <div className="relative flex items-center h-11 rounded-full border border-slate-200 focus-within:border-[var(--color-primary)] bg-slate-50 focus-within:bg-white px-4 transition-all shadow-2xs">
                <FiSearch className="w-4 h-4 text-[var(--color-primary)] shrink-0 mr-2.5" />

                <input
                  type="text"
                  value={localSearch}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setLocalSearch(e.target.value)
                    if (onSearchChange) onSearchChange(e.target.value)
                  }}
                  placeholder="Search for products, groceries, daily essentials..."
                  className="w-full h-full bg-transparent border-none pl-1 pr-24 text-xs font-sans font-medium text-[var(--color-text-main)] placeholder-slate-400 focus:outline-none"
                />

                {localSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setLocalSearch('')
                      if (onSearchChange) onSearchChange('')
                    }}
                    className="absolute right-24 text-gray-400 hover:text-gray-700 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer"
                    title="Clear search"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="submit"
                  className="absolute right-1 top-1 bottom-1 px-5 rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-sans font-semibold tracking-wide transition-all shadow-xs cursor-pointer flex items-center justify-center active:scale-95"
                >
                  Search
                </button>
              </div>

              {/* Instant Search Suggestions Dropdown */}
              {isSearchFocused && (searchSuggestions.products?.length > 0 || searchSuggestions.categories?.length > 0 || searchSuggestions.subcategories?.length > 0) && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-[var(--color-border-subtle)] overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150 max-h-96 overflow-y-auto">
                  
                  {/* Matching Categories */}
                  {searchSuggestions.categories?.length > 0 && (
                    <div className="p-3 border-b border-gray-100 bg-[var(--color-bg-main)]">
                      <span className="text-[10px] font-black uppercase text-[var(--color-brand)] tracking-wider block mb-2">
                        Categories ({searchSuggestions.categories.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {searchSuggestions.categories.map((cat) => (
                          <Link
                            key={cat.id}
                            to={ROUTES.PRODUCTS_BY_CATEGORY(cat)}
                            onClick={() => setIsSearchFocused(false)}
                            className="px-2.5 py-1 bg-white hover:bg-[var(--color-primary-tint)] border border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] rounded-full text-xs font-bold text-[var(--color-text-main)] transition-colors inline-flex items-center gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brand)]" />
                            <span>{cat.name}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Matching Subcategories */}
                  {searchSuggestions.subcategories?.length > 0 && (
                    <div className="p-3 border-b border-gray-100 bg-[var(--color-bg-alt)]/40">
                      <span className="text-[10px] font-black uppercase text-[var(--color-brand)] tracking-wider block mb-2">
                        Subcategories ({searchSuggestions.subcategories.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {searchSuggestions.subcategories.map((sub) => {
                          const catId = Array.isArray(sub.category_ids) ? sub.category_ids[0] : (sub.category_id || '')
                          const targetUrl = catId
                            ? ROUTES.PRODUCTS_BY_CATEGORY_SUBCATEGORY(catId, sub.id)
                            : ROUTES.PRODUCTS_BY_SUBCATEGORY(sub.id)
                          return (
                            <Link
                              key={sub.id}
                              to={targetUrl}
                              onClick={() => setIsSearchFocused(false)}
                              className="px-2.5 py-1 bg-white hover:bg-purple-100 border border-purple-200 rounded-full text-xs font-bold text-purple-900 transition-colors inline-flex items-center gap-1.5"
                            >
                              <span>{sub.name}</span>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Matching Products */}
                  {searchSuggestions.products?.length > 0 && (
                    <div>
                      <div className="p-2 border-b border-gray-100 flex items-center justify-between bg-[var(--color-bg-main)]">
                        <span className="text-[10px] font-black uppercase text-[var(--color-brand)] tracking-wider px-2">
                          Matching Products
                        </span>
                        <button
                          type="button"
                          onClick={handleSearchSubmit}
                          className="text-[11px] font-bold text-[var(--color-brand)] hover:underline px-2 cursor-pointer"
                        >
                          View all results →
                        </button>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {searchSuggestions.products.map((prod) => (
                          <Link
                            key={prod.id}
                            to={ROUTES.PRODUCT_DETAIL(prod)}
                            onClick={() => setIsSearchFocused(false)}
                            className="flex items-center gap-3 p-2.5 hover:bg-[var(--color-bg-alt)] transition-colors"
                          >
                            <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                              {prod.primary_image ? (
                                <img
                                  src={resolveImageUrl(prod.primary_image)}
                                  alt={prod.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <FiShoppingBag className="w-5 h-5 text-gray-400" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[var(--color-text-main)] truncate">{prod.name}</p>
                              <p className="text-[10px] text-gray-400 truncate">
                                {prod.brand_name || 'In Stock'}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-black text-[var(--color-brand)]">
                                ₹{prod.min_price || prod.mrp || '—'}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* RIGHT: Standalone Luxury Circular Action Icons (Offers, Wishlist, Cart, Account, Mobile Toggle) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* 1. Offers / Rewards Standalone Button */}
            <button
              type="button"
              onClick={onOpenReferral || (() => navigate(ROUTES.PRODUCTS_BY_SECTION('deals')))}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[var(--color-primary)] text-slate-700 hover:text-[var(--color-primary)] transition-all duration-200 cursor-pointer select-none flex items-center justify-center shadow-2xs"
              title="Offers & Discounts"
              aria-label="Offers and Discounts"
            >
              <span className="font-bold text-xs leading-none">%</span>
            </button>

            {/* 2. Standalone Wishlist Icon with Live Count Badge */}
            <button
              type="button"
              onClick={() => setIsWishlistOpen(true)}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[var(--color-primary)] text-slate-700 hover:text-[var(--color-primary)] transition-all duration-200 cursor-pointer group flex items-center justify-center shadow-2xs"
              title="Saved Wishlist"
              aria-label="Saved Wishlist"
            >
              <FiHeart className="w-4.5 h-4.5 transition-transform group-hover:scale-110" />
              {wishlistCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[var(--color-primary)] text-white text-[10px] font-sans font-bold rounded-full flex items-center justify-center shadow-2xs leading-none">
                  {wishlistCount}
                </span>
              )}
            </button>

            {/* 3. Standalone Shopping Cart Icon with Live Count Badge */}
            <button
              type="button"
              onClick={handleCartClick}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[var(--color-primary)] text-slate-700 hover:text-[var(--color-primary)] transition-all duration-200 cursor-pointer group select-none flex items-center justify-center shadow-2xs"
              title="Shopping Cart"
              aria-label="Shopping Cart"
            >
              <FiShoppingCart className="w-4.5 h-4.5 transition-transform group-hover:scale-110" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[var(--color-primary)] text-white text-[10px] font-sans font-bold rounded-full flex items-center justify-center shadow-2xs leading-none">
                  {cartCount}
                </span>
              )}
            </button>

            {/* Notification Bell — only shown for a logged-in customer */}
            {customer && <NotificationBell />}

            {/* 4. Standalone Customer Account Icon & Dropdown */}
            {customer ? (
              <div className="relative" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsAccountDropdownOpen((prev) => !prev)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[var(--color-primary)] text-slate-700 hover:text-[var(--color-primary)] transition-all duration-200 cursor-pointer select-none flex items-center justify-center shadow-2xs"
                  title={`Account (${customer.name || 'Customer'})`}
                  aria-label="Customer Account Menu"
                >
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name || 'Customer'}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-[var(--color-border-subtle)]"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        if (e.currentTarget.nextElementSibling) {
                          e.currentTarget.nextElementSibling.style.display = 'flex'
                        }
                      }}
                    />
                  ) : null}
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[var(--color-brand)] text-white font-black text-xs uppercase shadow-xs items-center justify-center ${
                      customer.profile_photo_path ? 'hidden' : 'flex'
                    }`}
                  >
                    {customer.name?.trim().charAt(0) || 'C'}
                  </div>
                </button>

                {/* Account Dropdown Menu */}
                {isAccountDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-xl border border-[var(--color-border-subtle)] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3">
                      {customer.profile_photo_path ? (
                        <img
                          src={customer.profile_photo_path}
                          alt={customer.name}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover border border-[var(--color-border-subtle)] shadow-xs"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center font-black text-sm uppercase shadow-xs">
                          {customer.name?.trim().charAt(0) || 'C'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[var(--color-text-main)] truncate">{customer.name}</p>
                        <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                          {customer.email || (customer.phone ? `+91 ${customer.phone}` : 'Store Customer')}
                        </p>
                      </div>
                    </div>

                    <Link
                      to={ROUTES.PROFILE}
                      onClick={() => setIsAccountDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-[var(--color-text-main)] hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-brand)] transition-colors"
                    >
                      <FiUser className="w-4 h-4 text-[#7c3aed]" />
                      <span>My Profile</span>
                    </Link>

                    <Link
                      to={ROUTES.ORDERS}
                      onClick={() => setIsAccountDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-[var(--color-text-main)] hover:bg-[var(--color-bg-alt)] hover:text-[var(--color-brand)] transition-colors"
                    >
                      <FiBox className="w-4 h-4 text-[#7c3aed]" />
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
                        <FiGift className="w-4 h-4 text-pink-600" />
                        <span>Refer & Earn ({referralPercentText})</span>
                      </button>
                    )}

                    <div className="border-t border-gray-100 my-1"></div>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors text-left cursor-pointer"
                    >
                      <FiLogOut className="w-4 h-4 text-red-600" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to={ROUTES.LOGIN}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white hover:bg-slate-50 border border-slate-200 hover:border-[var(--color-primary)] text-slate-700 hover:text-[var(--color-primary)] transition-all duration-200 cursor-pointer select-none flex items-center justify-center shadow-2xs"
                title="Customer Sign In"
                aria-label="Customer Sign In"
              >
                <FiUser className="w-4.5 h-4.5" />
              </Link>
            )}

            {/* 5. Mobile Hamburger Toggle (< 768px) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="md:hidden w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gray-50 hover:bg-gray-100 text-[var(--color-text-main)] border border-[var(--color-border-subtle)] flex items-center justify-center transition-colors cursor-pointer active:scale-95"
              title="Toggle Menu"
              aria-label="Navigation menu"
            >
              {isMobileMenuOpen ? (
                <FiX className="w-5 h-5" />
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
              placeholder="Search for products, groceries, daily essentials..."
              className="w-full h-10 pl-10 pr-9 rounded-full bg-slate-50 border border-slate-200 text-xs text-[var(--color-text-main)] placeholder-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:bg-white focus:ring-1 focus:ring-[var(--color-primary)]/20 transition-all"
            />
            <button
              type="submit"
              className="absolute left-3.5 top-3 text-slate-400 hover:text-[var(--color-primary)] cursor-pointer"
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
                <FiX className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
        </div>

        {/* 3. SECOND ROW: KIRANABAZAAR HORIZONTAL NAVIGATION ROW */}
        <nav className="hidden md:block bg-white text-[var(--color-text-main)] border-t border-slate-100 shadow-2xs relative z-30 select-none">
          <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between py-2 sm:py-2.5">
            {/* LEFT: Shop by Category Button + Links */}
            <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-2.5 text-xs font-semibold flex-wrap">
              {/* Ocean Blue "Shop by Category" Pill Button */}
              <button
                ref={allCategoriesBtnRef}
                type="button"
                onClick={() => setIsMegaMenuOpen((prev) => !prev)}
                className={`px-4 py-2 rounded-full transition-all flex items-center gap-2 cursor-pointer font-sans font-semibold shadow-xs select-none text-xs ${
                  isMegaMenuOpen
                    ? 'bg-[var(--color-primary-hover)] text-white shadow-sm'
                    : 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white shadow-xs'
                }`}
                aria-haspopup="true"
                aria-expanded={isMegaMenuOpen}
                aria-label="Shop by Category"
              >
                <svg className="w-4 h-4 text-white shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
                <span>Shop by Category</span>
                <svg
                  className={`w-3.5 h-3.5 text-white transition-transform duration-200 shrink-0 ${
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

              {/* Home */}
              <Link
                to={ROUTES.HOME}
                className={`px-3.5 py-1.5 rounded-full transition-all text-xs font-sans ${
                  location.pathname === '/' && activeNav === 'home'
                    ? 'text-[var(--color-primary)] font-bold bg-[var(--color-primary-tint)] border border-sky-200'
                    : 'text-slate-700 hover:text-[var(--color-primary)] hover:bg-slate-50'
                }`}
              >
                Home
              </Link>

              {/* Categories */}
              <Link
                to={ROUTES.PRODUCTS}
                className="px-3.5 py-1.5 rounded-full text-slate-700 hover:text-[var(--color-primary)] hover:bg-slate-50 transition-all text-xs font-sans font-medium"
              >
                Categories
              </Link>

              {/* Offers */}
              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('deals')}
                className="px-3.5 py-1.5 rounded-full text-slate-700 hover:text-[var(--color-primary)] hover:bg-slate-50 transition-all text-xs font-sans font-medium"
              >
                Offers
              </Link>

              {/* Combo Store */}
              <Link
                to={ROUTES.PRODUCTS_BY_CATEGORY(8)}
                className="px-3.5 py-1.5 rounded-full text-slate-700 hover:text-[var(--color-primary)] hover:bg-slate-50 transition-all text-xs font-sans font-medium"
              >
                Combo Store
              </Link>

              {/* Best Sellers */}
              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('best_sellers')}
                className="px-3.5 py-1.5 rounded-full text-slate-700 hover:text-[var(--color-primary)] hover:bg-slate-50 transition-all text-xs font-sans font-medium"
              >
                Best Sellers
              </Link>

              {/* New Arrivals */}
              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('new_arrivals')}
                className="px-3.5 py-1.5 rounded-full text-slate-700 hover:text-[var(--color-primary)] hover:bg-slate-50 transition-all text-xs font-sans font-medium"
              >
                New Arrivals
              </Link>
            </div>

            {/* RIGHT: WhatsApp Customer Support */}
            <div className="shrink-0 flex items-center gap-2 text-xs text-slate-600 font-sans font-medium">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-emerald-700 transition-colors flex items-center gap-1.5 py-1 px-3 rounded-full hover:bg-emerald-50 border border-transparent hover:border-emerald-200"
              >
                <FaWhatsapp className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-700">Support</span>
              </a>
            </div>
          </div>
        </nav>

        {/* JIOMART-INSPIRED CATEGORY MEGA MENU DROPDOWN PANEL */}
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
              <div className="w-full mx-auto bg-white rounded-3xl shadow-2xl border border-[var(--color-border-subtle)] overflow-hidden flex flex-col md:flex-row min-h-[460px] max-h-[580px] animate-in fade-in slide-in-from-top-2 duration-150">
                {/* LEFT SIDE: Vertical list of categories (JioMart vertical tabs) */}
                <div className="w-full md:w-36 lg:w-44 bg-[var(--color-bg-main)] border-r border-[var(--color-border-subtle)] flex flex-col shrink-0">
                  <div className="px-3 py-2.5 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-[var(--color-bg-alt)]/60">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-brand)]">
                      Top Categories
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsMegaMenuOpen(false)}
                      className="md:hidden p-1 rounded-full hover:bg-gray-200 text-gray-500 cursor-pointer"
                      title="Close"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Vertical scrollable list of categories (Top 5) */}
                  <div className="overflow-y-auto flex-1 divide-y divide-[var(--color-border-subtle)]/40 py-1">
                    {categoryList.slice(0, 5).map((cat) => {
                      const isSelected = String(cat.id) === String(selectedCategoryId)
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategoryId(cat.id)}
                          onMouseEnter={() => setSelectedCategoryId(cat.id)}
                          className={`w-full px-2 py-3.5 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative group select-none ${
                            isSelected
                              ? 'bg-white text-[var(--color-brand)] font-black shadow-xs'
                              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-white/60 font-semibold'
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[var(--color-brand)] rounded-r-full" />
                          )}
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl overflow-hidden mb-1.5 transition-transform group-hover:scale-105 ${
                              isSelected
                                ? 'bg-[var(--color-primary-tint)] text-[var(--color-brand)]'
                                : 'bg-white text-gray-600 border border-[var(--color-border-subtle)]'
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

                  <div className="p-2 border-t border-[var(--color-border-subtle)] bg-white text-center">
                    <Link
                      to={ROUTES.PRODUCTS}
                      onClick={() => setIsMegaMenuOpen(false)}
                      className="text-[10px] font-black text-[var(--color-brand)] hover:text-[var(--color-brand)] hover:underline"
                    >
                      All Catalog →
                    </Link>
                  </div>
                </div>

                {/* RIGHT SIDE: Subcategories belonging to the selected category (JioMart Card Grid) */}
                <div className="flex-1 min-w-0 bg-white flex flex-col overflow-hidden">
                  {activeCategoryObj ? (
                    <>
                      {/* Category Header with explicit Close button */}
                      <div className="p-4 sm:p-5 border-b border-[var(--color-border-subtle)] bg-gradient-to-r from-white to-[var(--color-bg-main)] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base sm:text-lg font-black text-[var(--color-text-main)] truncate">
                              {activeCategoryObj.name}
                            </h3>
                            {activeCategoryObj.product_count !== undefined && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-brand)] border border-[var(--color-brand)]/20 shrink-0">
                                {activeCategoryObj.product_count} Items
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {activeCategoryObj.description ||
                              `Explore subcategories and collections in ${activeCategoryObj.name}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            to={ROUTES.PRODUCTS_BY_CATEGORY(activeCategoryObj)}
                            onClick={() => setIsMegaMenuOpen(false)}
                            className="shrink-0 px-4 py-2 rounded-full bg-[var(--color-brand)] hover:bg-[#6d28d9] text-white text-xs font-black transition-all shadow-xs flex items-center justify-center gap-1.5 active:scale-95"
                          >
                            <span>View All</span>
                            <span>→</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => setIsMegaMenuOpen(false)}
                            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer border border-gray-200"
                            title="Close categories drawer"
                            aria-label="Close categories drawer"
                          >
                            <FiX className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Subcategories Grid or Direct Browse */}
                      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        {selectedCategorySubcategories.length > 0 ? (
                          <div>
                            <div className="flex items-center justify-between mb-3.5">
                              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-brand)]">
                                Top Subcategories ({Math.min(5, selectedCategorySubcategories.length)})
                              </span>
                              <span className="text-xs text-gray-400">
                                Click a subcategory to browse targeted items
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                              {selectedCategorySubcategories.slice(0, 5).map((subcat) => (
                                <Link
                                  key={subcat.id}
                                  to={ROUTES.PRODUCTS_BY_CATEGORY_SUBCATEGORY(activeCategoryObj, subcat)}
                                  onClick={() => setIsMegaMenuOpen(false)}
                                  className="group p-3 rounded-2xl border border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] bg-white hover:bg-[var(--color-bg-main)] transition-all flex flex-col items-center text-center shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                                >
                                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden mb-2 group-hover:scale-105 transition-transform border border-gray-100">
                                    {subcat.image_path ? (
                                      <img
                                        src={resolveImageUrl(subcat.image_path)}
                                        alt={subcat.name}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-primary-tint)] text-[var(--color-brand)]">
                                        <span className="text-2xl font-black">{getCategoryIcon(activeCategoryObj)}</span>
                                      </div>
                                    )}
                                  </div>
                                  <h4 className="text-xs font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-brand)] line-clamp-2">
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
                              <span className="text-[11px] font-black uppercase tracking-wider text-[var(--color-brand)]">
                                Popular in {activeCategoryObj.name}
                              </span>
                              <Link
                                to={ROUTES.PRODUCTS_BY_CATEGORY(activeCategoryObj)}
                                onClick={() => setIsMegaMenuOpen(false)}
                                className="text-xs font-extrabold text-[var(--color-brand)] hover:text-[var(--color-brand)] hover:underline"
                              >
                                Browse All Products →
                              </Link>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                              {activeCategoryProducts.slice(0, 5).map((prod) => (
                                <Link
                                  key={prod.id}
                                  to={ROUTES.PRODUCT_DETAIL(prod)}
                                  onClick={() => setIsMegaMenuOpen(false)}
                                  className="group p-2.5 rounded-2xl border border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] bg-white hover:bg-[var(--color-bg-main)] transition-all flex flex-col items-center text-center shadow-2xs hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
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
                                  <h4 className="text-[11px] font-bold text-[var(--color-text-main)] group-hover:text-[var(--color-brand)] line-clamp-2">
                                    {prod.name}
                                  </h4>
                                  <span className="text-xs font-black text-[var(--color-brand)] mt-1">
                                    ₹{prod.min_price || prod.mrp || '—'}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center py-10 px-4 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-tint)] text-[var(--color-brand)] flex items-center justify-center text-3xl font-black mb-3 shadow-xs">
                              {getCategoryIcon(activeCategoryObj)}
                            </div>
                            <h4 className="text-base font-black text-[var(--color-text-main)]">
                              Explore {activeCategoryObj.name}
                            </h4>
                            <p className="text-xs text-gray-500 max-w-md mt-1 mb-5">
                              Browse all available products in this category from our store catalog.
                            </p>
                            <Link
                              to={ROUTES.PRODUCTS_BY_CATEGORY(activeCategoryObj)}
                              onClick={() => setIsMegaMenuOpen(false)}
                              className="px-6 py-2.5 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand)] text-white text-xs font-black shadow-xs transition-all flex items-center gap-2"
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
            <div className="p-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-gradient-to-r from-[var(--color-bg-main)] to-[var(--color-primary-tint)]">
              <div className="flex items-center gap-2.5">
                <img
                  src={storeLogo || '/images/logo.png'}
                  alt={storeName || 'Shop with Adam'}
                  title="Shop with Adam"
                  className="h-8 w-auto max-w-[130px] object-contain"
                  onError={(e) => {
                    e.currentTarget.onerror = null
                    e.currentTarget.src = '/images/logo.png'
                  }}
                />
                <div>
                  <h3 className="font-black text-sm text-[var(--color-text-main)] truncate max-w-[180px]">
                    {storeName}
                  </h3>
                  <p className="text-[10px] text-[var(--color-brand)] font-semibold">{deliveryLocationDisplay}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-8 h-8 rounded-full bg-white text-gray-500 flex items-center justify-center text-sm shadow-xs cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Menu Items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1 text-xs font-bold text-gray-700">
              {/* Customer Greeting / Auth */}
              {customer ? (
                <div className="p-3 mb-2 rounded-2xl bg-[var(--color-bg-alt)] border border-[var(--color-border-subtle)] flex items-center gap-3">
                  {customer.profile_photo_path ? (
                    <img
                      src={customer.profile_photo_path}
                      alt={customer.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-[var(--color-border-subtle)] shadow-xs shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--color-brand)] text-white flex items-center justify-center font-black text-sm uppercase shadow-xs shrink-0">
                      {customer.name?.trim().charAt(0) || 'C'}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-[var(--color-text-main)] truncate">
                      Hello, {customer.name?.split(' ')[0]}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Link
                        to={ROUTES.PROFILE}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="text-[11px] text-[var(--color-brand)] hover:underline"
                      >
                        Profile
                      </Link>
                      <span className="text-gray-300">•</span>
                      <Link
                        to={ROUTES.ORDERS}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="text-[11px] text-[var(--color-brand)] font-bold hover:underline"
                      >
                        My Orders →
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 mb-2 rounded-2xl bg-[var(--color-bg-alt)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                  <div>
                    <p className="font-extrabold text-[var(--color-text-main)]">Welcome, Guest</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">Sign in to track orders & rewards</p>
                  </div>
                  <Link
                    to={ROUTES.LOGIN}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="px-3 py-1.5 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand)] text-white text-[11px] font-black shadow-xs"
                  >
                    Login
                  </Link>
                </div>
              )}

              {/* Navigation Links */}
              <Link
                to={ROUTES.HOME}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                <FiHome className="w-4 h-4 text-[#7c3aed]" />
                <span>Home Catalog</span>
              </Link>

              <Link
                to={ROUTES.PRODUCTS}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                <FiGrid className="w-4 h-4 text-[#7c3aed]" />
                <span>All Products</span>
              </Link>

              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('best_sellers')}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                <FiStar className="w-4 h-4 text-amber-500" />
                <span>Best Sellers</span>
              </Link>

              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('new_arrivals')}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                <LuSparkles className="w-4 h-4 text-[#7c3aed]" />
                <span>New Arrivals</span>
              </Link>

              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('featured')}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--color-primary-tint)] transition-colors"
              >
                <FiTag className="w-4 h-4 text-purple-600" />
                <span>Featured Selections</span>
              </Link>

              <Link
                to={ROUTES.PRODUCTS_BY_SECTION('deals')}
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-[var(--color-primary-tint)] transition-colors text-pink-700"
              >
                <TbSparkles className="w-4 h-4 text-orange-500" />
                <span>Flash Deals & Offers</span>
              </Link>

              {/* Expandable Mobile Category Menu */}
              {categoryList.length > 0 && (
                <div className="pt-2 border-t border-[var(--color-border-subtle)]">
                  <div className="flex items-center justify-between px-3.5 mb-1.5">
                    <span className="text-[10px] font-black uppercase text-[var(--color-brand)] tracking-wider">
                      Shop by Category
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-brand)]">
                      {categoryList.length}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {categoryList.map((cat) => {
                      const catSubs = subcategoryList.filter((s) => s.category_ids?.includes(Number(cat.id)))
                      const isExpanded = expandedMobileCatId === cat.id
                      return (
                        <div key={cat.id} className="rounded-xl border border-[var(--color-border-subtle)]/80 overflow-hidden bg-white">
                          <div className="flex items-center justify-between p-2.5">
                            <Link
                              to={ROUTES.PRODUCTS_BY_CATEGORY(cat)}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className="flex items-center gap-2.5 flex-1 min-w-0"
                            >
                              <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-tint)] text-[var(--color-brand)] flex items-center justify-center shrink-0 overflow-hidden text-xs">
                                {cat.image_path ? (
                                  <img
                                    src={resolveImageUrl(cat.image_path)}
                                    alt={cat.name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <LuSparkles className="w-4 h-4 text-[#7c3aed]" />
                                )}
                              </div>
                              <span className="text-xs font-bold text-[var(--color-text-main)] truncate">
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
                                className="p-1 rounded-lg text-gray-400 hover:text-[var(--color-brand)] hover:bg-[var(--color-bg-main)] transition-colors"
                                aria-label={`Toggle ${cat.name} subcategories`}
                              >
                                <svg
                                  className={`w-4 h-4 transition-transform ${
                                    isExpanded ? 'rotate-180 text-[var(--color-brand)]' : ''
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
                            <div className="bg-[var(--color-bg-main)] px-3 py-2 border-t border-[var(--color-border-subtle)] space-y-1">
                              <Link
                                to={ROUTES.PRODUCTS_BY_CATEGORY(cat)}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="block py-1 px-2 text-[11px] font-extrabold text-[var(--color-brand)] hover:underline"
                              >
                                View All in {cat.name} →
                              </Link>
                              {catSubs.map((subcat) => (
                                <Link
                                  key={subcat.id}
                                  to={ROUTES.PRODUCTS_BY_CATEGORY_SUBCATEGORY(cat, subcat)}
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center justify-between py-1 px-2 rounded-lg text-[11px] font-semibold text-gray-700 hover:bg-[var(--color-primary-tint)] hover:text-[var(--color-brand)] transition-colors"
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
                    className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 hover:bg-pink-50 text-[var(--color-extra-029)] font-bold"
                  >
                    <FiGift className="w-4 h-4 text-pink-600" />
                    <span>Refer & Earn ({referralPercentText})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    setIsWishlistOpen(true)
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-[var(--color-primary-tint)] font-bold cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <FiHeart className="w-4 h-4 text-red-500" />
                    <span>Saved Wishlist</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-xs font-black">
                    {wishlistCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    handleCartClick()
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between hover:bg-[var(--color-primary-tint)] font-bold text-[var(--color-text-main)]"
                >
                  <span className="flex items-center gap-3">
                    <FiShoppingCart className="w-4 h-4 text-emerald-600" />
                    <span>Shopping Cart</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-xs font-black">
                    {cartCount} items
                  </span>
                </button>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-main)] text-xs text-gray-500 space-y-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 rounded-xl bg-[var(--color-whatsapp)] text-white font-extrabold flex items-center justify-center gap-2 shadow-xs"
              >
                <FaWhatsapp className="w-4 h-4" />
                <span>WhatsApp Support</span>
              </a>
              <div className="flex items-center justify-between text-[11px] pt-1 text-[var(--color-brand)] font-semibold">
                <span className="flex items-center gap-1"><FiShield className="w-3.5 h-3.5" /> 100% Quality</span>
                <span>•</span>
                <span className="flex items-center gap-1"><FiRefreshCw className="w-3.5 h-3.5" /> 7-Day Return</span>
                <span>•</span>
                <span className="flex items-center gap-1"><FiDollarSign className="w-3.5 h-3.5" /> COD Available</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. JIOMART BOTTOM CART BAR (renders when cart has items) */}
      <BottomCartBar onOpenCart={handleCartClick} />

      {/* 6. WISHLIST SLIDE-OUT DRAWER */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        onOpenCart={handleCartClick}
      />
    </div>
  )
}
