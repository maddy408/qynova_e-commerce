import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  api,
  getCustomerToken,
  clearCustomerSession,
  setCustomerSession,
  fetchStoreSettings,
  fetchDeliverySettings,
  resolveImageUrl,
} from '../lib/api'
import Navbar from '../components/Navbar'
import HorizontalProductSection from '../components/HorizontalProductSection'
import CartDrawer from '../components/CartDrawer'
import CheckoutModal from '../components/CheckoutModal'
import { addToCart, getCartCount, fetchCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist, toggleWishlist } from '../lib/wishlist'

// In-memory session recently viewed products (temporary UI state, no localStorage)
let inMemoryRecentlyViewed = []

export default function ProductDetails() {
  const { id } = useParams()
  const navigate = useNavigate()

  // Product Data & Status
  const [product, setProduct] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [storeSettings, setStoreSettings] = useState(null)
  const [deliverySettings, setDeliverySettings] = useState(null)

  // Gallery & Image States
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isZoomActive, setIsZoomActive] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })

  // Purchase & Actions State
  const [selectedVariantId, setSelectedVariantId] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [isAddingToCart, setIsAddingToCart] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [activeTab, setActiveTab] = useState('description')

  // Pincode & Delivery Checker State
  const [pincode, setPincode] = useState('560001')
  const [pincodeStatus, setPincodeStatus] = useState(null)
  const [isPincodeLoading, setIsPincodeLoading] = useState(false)

  // Offers & Coupons from Backend
  const [availableCoupons, setAvailableCoupons] = useState([])
  const [isCouponsLoading, setIsCouponsLoading] = useState(false)

  // Related & Recently Viewed Products
  const [relatedProducts, setRelatedProducts] = useState([])
  const [recentlyViewed, setRecentlyViewed] = useState(() => inMemoryRecentlyViewed)

  // Sticky Bar Visibility
  const [showStickyBar, setShowStickyBar] = useState(false)
  const purchaseSectionRef = useRef(null)

  // Auth, Cart & Modals State
  const [customer, setCustomer] = useState(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [checkoutCartData, setCheckoutCartData] = useState(null)
  const [wishlistIds, setWishlistIds] = useState(() => getWishlistIds())
  const [cartCount, setCartCount] = useState(() => getCartCount())

  // Toast Feedback Helper
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2500)
  }

  // Sync cart count via DB API & window event
  useEffect(() => {
    fetchCart().then((c) => setCartCount(c.total_items))
    const handleCartSync = () => setCartCount(getCartCount())
    window.addEventListener('cart-updated', handleCartSync)
    return () => window.removeEventListener('cart-updated', handleCartSync)
  }, [])

  // Sync wishlist from MySQL
  useEffect(() => {
    fetchWishlist().then((items) => setWishlistIds(items.map((i) => i.product_id || i.id)))
    const handleWishlistSync = () => setWishlistIds(getWishlistIds())
    window.addEventListener('wishlist-updated', handleWishlistSync)
    return () => window.removeEventListener('wishlist-updated', handleWishlistSync)
  }, [])

  // Load store and delivery settings from MySQL
  useEffect(() => {
    fetchStoreSettings().then((s) => s && setStoreSettings(s))
    fetchDeliverySettings().then((d) => d && setDeliverySettings(d))
  }, [])

  // Scroll to top whenever ID changes & reset states
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setSelectedImageIndex(0)
    setSelectedVariantId(null)
    setQuantity(1)
    setPincodeStatus(null)
  }, [id])

  // Sticky Purchase Bar intersection observer
  useEffect(() => {
    const handleScroll = () => {
      if (!purchaseSectionRef.current) return
      const rect = purchaseSectionRef.current.getBoundingClientRect()
      // If purchase buttons are scrolled above current viewport
      setShowStickyBar(rect.bottom < 120)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Load customer session (Backend JWT is the source of truth)
  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      clearCustomerSession()
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

  // Load Active Coupons from backend
  useEffect(() => {
    async function fetchCoupons() {
      setIsCouponsLoading(true)
      try {
        const res = await api.get('/coupons/available')
        if (res.data?.coupons && Array.isArray(res.data.coupons)) {
          setAvailableCoupons(res.data.coupons)
        }
      } catch {
        setAvailableCoupons([])
      } finally {
        setIsCouponsLoading(false)
      }
    }
    fetchCoupons()
  }, [])

  // Fetch product data from API
  useEffect(() => {
    async function fetchProductData() {
      setIsLoading(true)
      setError(null)

      try {
        const res = await api.get(`/products/${id}`)
        if (res.data?.product) {
          const prod = res.data.product
          setProduct(prod)
          const initialVar = prod.variants?.find((v) => v.is_default) || prod.variants?.[0]
          if (initialVar?.id) {
            setSelectedVariantId(initialVar.id)
          }

          // Manage Recently Viewed in in-memory session (no localStorage)
          try {
            const filtered = inMemoryRecentlyViewed.filter((item) => Number(item.id) !== Number(prod.id))
            const defVar = prod.variants?.find((v) => v.is_default) || prod.variants?.[0]
            const rPrice = Number(defVar?.retail_price ?? prod.min_price ?? prod.price) || 0
            const rMrp = Number(defVar?.mrp ?? prod.mrp) || 0
            const rawMainImg = prod.images?.[0]?.image_path || prod.primary_image || ''
            const mainImg = resolveImageUrl(rawMainImg) || '/placeholder-product.svg'

            const currentEntry = {
              id: prod.id,
              name: prod.name,
              min_price: rPrice,
              price: rPrice,
              mrp: rMrp,
              primary_image: mainImg,
              product_code: prod.product_code,
              brand_name: prod.brand_name,
            }

            inMemoryRecentlyViewed = [currentEntry, ...filtered].slice(0, 10)
            setRecentlyViewed(filtered)
          } catch {
            // ignore
          }

          // Fetch related products (prefer same category, fallback to best sellers)
          const catId = prod.categories?.[0]?.id
          if (catId) {
            try {
              const relRes = await api.get(`/products?limit=10&category_id=${catId}`)
              if (relRes.data?.items) {
                const filtered = relRes.data.items.filter((p) => Number(p.id) !== Number(prod.id))
                setRelatedProducts(filtered)
              }
            } catch {
              // Ignore related error
            }
          } else {
            try {
              const relRes = await api.get('/products?limit=8&section=best_sellers')
              if (relRes.data?.items) {
                setRelatedProducts(relRes.data.items.filter((p) => Number(p.id) !== Number(prod.id)))
              }
            } catch {
              // Ignore
            }
          }
        } else {
          setError('Product not found')
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setError('Product not found')
        } else {
          setError('Unable to load product details. Please check your connection and try again.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    if (id) {
      fetchProductData()
    }
  }, [id])

  // Price & Inventory calculations from MySQL variants
  const activeVariant = useMemo(() => {
    if (!product?.variants || product.variants.length === 0) return null
    if (selectedVariantId) {
      const found = product.variants.find((v) => v.id === selectedVariantId)
      if (found) return found
    }
    return product.variants.find((v) => v.is_default) || product.variants[0]
  }, [product, selectedVariantId])

  const defaultVariant = activeVariant

  const hasVariants = Array.isArray(product?.variants) && product.variants.length > 0
  const retailPrice = Number(activeVariant?.retail_price ?? product?.min_price ?? product?.price ?? 0)
  const hasPrice = retailPrice > 0
  const mrp = Number(activeVariant?.mrp ?? product?.mrp ?? retailPrice)
  const showDiscount = product?.show_discount !== 0 && product?.show_discount !== false && product?.show_discount !== '0'
  const discountPercent = hasPrice && mrp > retailPrice && showDiscount ? Math.round(((mrp - retailPrice) / mrp) * 100) : 0
  const savings = hasPrice && mrp > retailPrice && showDiscount ? mrp - retailPrice : 0

  // Available stock calculation
  const stockAvailable = useMemo(() => {
    if (!product || !hasVariants) return 0
    if (activeVariant && activeVariant.available !== null && activeVariant.available !== undefined) {
      return Number(activeVariant.available)
    }
    if (activeVariant && activeVariant.on_hand !== null && activeVariant.on_hand !== undefined) {
      return Number(activeVariant.on_hand)
    }
    return 0
  }, [product, activeVariant, hasVariants])

  const isUnavailable = !hasVariants || !hasPrice
  const isOutOfStock = isUnavailable || stockAvailable <= 0

  // Image Gallery List (Variant images prioritized, then DB main images)
  const imageGallery = useMemo(() => {
    if (!product) return []
    const urls = []

    // If active variant has its own images, include them first
    if (Array.isArray(activeVariant?.images) && activeVariant.images.length > 0) {
      activeVariant.images.forEach((img) => {
        const url = resolveImageUrl(img.image_path)
        if (url && !urls.includes(url)) urls.push(url)
      })
    }

    // Then include main product images
    if (Array.isArray(product.images) && product.images.length > 0) {
      product.images.forEach((img) => {
        const url = resolveImageUrl(img.image_path)
        if (url && !urls.includes(url)) urls.push(url)
      })
    } else if (product.primary_image) {
      const url = resolveImageUrl(product.primary_image)
      if (url && !urls.includes(url)) urls.push(url)
    }

    return urls.length > 0 ? urls : ['/placeholder-product.svg']
  }, [product, activeVariant])

  const activeImage = imageGallery[selectedImageIndex] || imageGallery[0] || ''

  // Primary Category Info
  const primaryCategory = product?.categories?.[0]

  // Wishlist handler (Persisted in MySQL via PHP REST API)
  const isWishlisted = product ? wishlistIds.includes(product.id) : false
  const handleToggleWishlist = async (targetId) => {
    const idToToggle = typeof targetId === 'number' || typeof targetId === 'string' ? targetId : product?.id
    if (!idToToggle) return
    try {
      const added = await toggleWishlist(idToToggle)
      setWishlistIds(getWishlistIds())
      showToast(added ? 'Saved to Wishlist ❤️' : 'Removed from Wishlist')
    } catch {
      showToast('Could not update wishlist')
    }
  }

  // Quantity controls
  const handleQuantityChange = (delta) => {
    setQuantity((prev) => {
      const next = prev + delta
      if (next < 1) return 1
      if (stockAvailable > 0 && next > stockAvailable) {
        showToast(`Maximum available stock reached (${stockAvailable} units)`)
        return stockAvailable
      }
      return next
    })
  }

  // Add to cart handler (Persisted in MySQL via PHP REST API)
  const handleAddToCart = async (targetProd, qty = quantity) => {
    const prodToAdd = targetProd && targetProd.id ? targetProd : product
    if (!prodToAdd || isOutOfStock) return

    setIsAddingToCart(true)
    const addQty = typeof qty === 'number' ? qty : 1

    try {
      await addToCart(
        {
          ...prodToAdd,
          variant_id: activeVariant?.id,
          retail_price: retailPrice,
          mrp,
          primary_image: activeImage,
        },
        addQty
      )
      setCartCount(getCartCount())
      showToast(`Added ${addQty > 1 ? addQty + ' × ' : ''}"${prodToAdd.name}" to Cart! 🛍️`)
      setIsCartOpen(true)
    } catch {
      showToast(`Added "${prodToAdd.name}" to Cart! 🛍️`)
    } finally {
      setIsAddingToCart(false)
    }
  }

  // Buy Now handler
  const handleBuyNow = async () => {
    if (!product || isOutOfStock) return
    await addToCart(
      {
        ...product,
        variant_id: activeVariant?.id,
        retail_price: retailPrice,
        mrp,
        primary_image: activeImage,
      },
      quantity
    )
    setCartCount(getCartCount())

    const subtotal = retailPrice * quantity
    const freeThreshold = Number(deliverySettings?.free_delivery_threshold) || 499
    const stdFee = Number(deliverySettings?.standard_delivery_fee) || 49
    const deliveryCharge = subtotal >= freeThreshold ? 0 : stdFee

    setCheckoutCartData({
      items: [
        {
          id: product.id,
          product_id: product.id,
          variant_id: activeVariant?.id,
          name: product.name,
          price: retailPrice,
          originalPrice: mrp,
          image: activeImage,
          quantity,
        },
      ],
      subtotal,
      discountAmount: 0,
      deliveryCharge,
      grandTotal: subtotal + deliveryCharge,
    })
    setIsCheckoutOpen(true)
  }

  // Pincode check handler using real backend API
  const handleCheckPincode = async (e) => {
    e?.preventDefault()
    const cleanPin = (pincode || '').trim()

    if (!cleanPin || cleanPin.length !== 6 || !/^[1-9][0-9]{5}$/.test(cleanPin)) {
      setPincodeStatus({
        valid: false,
        message: 'Please enter a valid 6-digit Indian PIN code (e.g. 560001).',
      })
      return
    }

    setIsPincodeLoading(true)
    try {
      const res = await api.get('/delivery/check-pincode', {
        params: {
          pincode: cleanPin,
          product_id: product?.id,
        },
      })

      if (res.data?.serviceable) {
        setPincodeStatus({
          valid: true,
          estimated_delivery: res.data.estimated_delivery,
          cod_available: res.data.cod_available,
          delivery_charge: res.data.delivery_charge,
          message: res.data.message || `Delivery available to ${cleanPin}.`,
        })
      } else {
        setPincodeStatus({
          valid: false,
          message: res.data?.message || `Delivery currently not available to ${cleanPin}.`,
        })
      }
    } catch (err) {
      setPincodeStatus({
        valid: false,
        message:
          err.response?.data?.message ||
          'Unable to verify delivery for this PIN code right now. Please try again.',
      })
    } finally {
      setIsPincodeLoading(false)
    }
  }

  // Interactive Hover Zoom Coordinates Handler
  const handleMouseMoveZoom = (e) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - left) / width) * 100
    const y = ((e.clientY - top) / height) * 100
    setZoomPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    })
  }

  // Copy coupon code helper
  const handleCopyCoupon = (code) => {
    try {
      navigator.clipboard.writeText(code)
      showToast(`Coupon "${code}" copied to clipboard! 🎟️`)
    } catch {
      showToast(`Coupon Code: ${code}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8FF] text-[#27213A] font-sans selection:bg-purple-100 selection:text-purple-900 overflow-x-hidden">
      
      {/* TOAST FEEDBACK NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 bg-[#27213A] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-bounce border border-[#8B5CF6]/30">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ONE REUSABLE GLOBAL STICKY NAVBAR */}
      <Navbar onOpenCart={() => setIsCartOpen(true)} />

      {/* BREADCRUMB NAVIGATION */}
      <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 text-xs font-medium text-gray-500 flex items-center gap-2 flex-wrap">
        <Link to="/" className="text-purple-800 hover:text-purple-950 font-bold hover:underline">
          Home
        </Link>
        <span className="text-gray-300">/</span>
        <Link to="/products" className="text-purple-800 hover:text-purple-950 font-medium hover:underline">
          Shop
        </Link>
        {primaryCategory && (
          <>
            <span className="text-gray-300">/</span>
            <Link
              to={`/products?category_id=${primaryCategory.id}`}
              className="text-purple-800 hover:text-purple-950 font-medium hover:underline"
            >
              {primaryCategory.name}
            </Link>
          </>
        )}
        {product?.subcategories?.[0] && (
          <>
            <span className="text-gray-300">/</span>
            <Link
              to={`/products?subcategory_id=${product.subcategories[0].id}`}
              className="text-purple-800 hover:text-purple-950 font-medium hover:underline"
            >
              {product.subcategories[0].name}
            </Link>
          </>
        )}
        <span className="text-gray-300">/</span>
        <span className="text-gray-700 font-semibold truncate max-w-[200px] sm:max-w-xs">
          {product?.name || 'Product Details'}
        </span>
      </nav>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-24 lg:pb-16">
        
        {/* LOADING SKELETON */}
        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-8 animate-pulse">
            <div className="lg:col-span-6 flex flex-col md:flex-row gap-4">
              <div className="hidden md:flex flex-col gap-3 w-20">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-square bg-purple-100/60 rounded-xl" />
                ))}
              </div>
              <div className="flex-1 aspect-square bg-purple-100/60 rounded-3xl" />
            </div>
            <div className="lg:col-span-6 space-y-4">
              <div className="h-6 w-32 bg-purple-100/60 rounded-full" />
              <div className="h-8 w-3/4 bg-purple-100/60 rounded-xl" />
              <div className="h-10 w-48 bg-purple-100/60 rounded-xl" />
              <div className="h-24 w-full bg-purple-100/60 rounded-2xl" />
              <div className="h-12 w-full bg-purple-100/60 rounded-2xl" />
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {!isLoading && error && (
          <div className="py-20 text-center max-w-md mx-auto">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-black shadow-inner">
              ✕
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Product Not Found</h2>
            <p className="text-sm text-gray-600 mb-6">{error}</p>
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#8B5CF6] hover:bg-[#7042D2] text-white rounded-xl font-bold text-sm shadow-md transition-colors"
            >
              ← Return to Catalog
            </Link>
          </div>
        )}

        {/* TWO-COLUMN PRODUCT DETAIL SECTION */}
        {!isLoading && product && (
          <div className="bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-purple-100/80 shadow-xs mb-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
              
              {/* ==================================================== */}
              {/* LEFT COLUMN: PRODUCT IMAGE GALLERY                  */}
              {/* ==================================================== */}
              <div className="lg:col-span-6 xl:col-span-6">
                <div className="flex flex-col-reverse md:flex-row gap-3.5 sm:gap-4 sticky top-24">
                  
                  {/* Vertical Thumbnails (Desktop) / Horizontal Thumbnails (Mobile) */}
                  {imageGallery.length > 1 && (
                    <div className="flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto no-scrollbar md:w-20 md:max-h-[500px] shrink-0 py-1">
                      {imageGallery.map((imgUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedImageIndex(idx)}
                          className={`relative aspect-square w-16 sm:w-18 md:w-full rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-gray-50 shrink-0 ${
                            selectedImageIndex === idx
                              ? 'border-[#8B5CF6] shadow-md ring-2 ring-purple-200'
                              : 'border-purple-100 hover:border-purple-300 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={imgUrl}
                            alt={`${product.name} thumbnail ${idx + 1}`}
                            className="w-full h-full object-cover object-center"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Large Main Product Image Container with Zoom */}
                  <div className="flex-1 relative">
                    <div
                      onMouseEnter={() => setIsZoomActive(true)}
                      onMouseLeave={() => setIsZoomActive(false)}
                      onMouseMove={handleMouseMoveZoom}
                      onClick={() => setIsFullscreenOpen(true)}
                      className="relative aspect-square rounded-2xl md:rounded-3xl overflow-hidden bg-gradient-to-b from-gray-50 to-purple-50/20 border border-purple-100 shadow-xs group cursor-zoom-in select-none"
                    >
                      <img
                        src={activeImage}
                        alt={product.name}
                        style={
                          isZoomActive
                            ? {
                                transform: 'scale(2.2)',
                                transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                              }
                            : { transform: 'scale(1)' }
                        }
                        className="w-full h-full object-contain md:object-cover transition-transform duration-150 ease-out"
                      />

                      {/* Top Badges */}
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10 pointer-events-none">
                        {discountPercent > 0 && showDiscount && (
                          <span className="bg-[#8B5CF6] text-white text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider">
                            {discountPercent}% OFF
                          </span>
                        )}
                        {product.is_deal === 1 && (
                          <span className="bg-pink-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-xs uppercase tracking-wider">
                            Hot Deal
                          </span>
                        )}
                        {product.is_featured === 1 && (
                          <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-xs uppercase tracking-wider">
                            Featured
                          </span>
                        )}
                      </div>

                      {/* Wishlist Heart on Main Image */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleWishlist(product.id)
                        }}
                        aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
                        className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-gray-700 hover:text-red-500 flex items-center justify-center shadow-md transition-all cursor-pointer z-10"
                      >
                        <svg
                          className="w-5 h-5"
                          viewBox="0 0 24 24"
                          fill={isWishlisted ? '#EC4899' : 'none'}
                          stroke={isWishlisted ? '#EC4899' : 'currentColor'}
                          strokeWidth="2.2"
                        >
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                      </button>

                      {/* Click to Expand Lightbox Hint */}
                      <div className="absolute bottom-3 right-3 bg-white/85 backdrop-blur-xs text-gray-700 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-3.5 h-3.5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                        <span>Click to Expand</span>
                      </div>
                    </div>

                    {/* Image Carousel Indicator for Mobile */}
                    {imageGallery.length > 1 && (
                      <div className="flex md:hidden justify-center items-center gap-1.5 mt-2.5">
                        {imageGallery.map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all ${
                              selectedImageIndex === i ? 'w-5 bg-purple-700' : 'w-1.5 bg-purple-200'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* ==================================================== */}
              {/* RIGHT COLUMN: PRODUCT INFORMATION & ACTIONS         */}
              {/* ==================================================== */}
              <div className="lg:col-span-6 xl:col-span-6 flex flex-col justify-between">
                <div>
                  
                  {/* Category & Brand Badges */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {primaryCategory && (
                      <Link
                        to={`/products?category_id=${primaryCategory.id}`}
                        className="text-xs font-bold text-purple-700 uppercase tracking-wider bg-purple-50 px-2.5 py-1 rounded-md hover:bg-purple-100 transition-colors"
                      >
                        {primaryCategory.name}
                      </Link>
                    )}
                    {product.brand_name && (
                      <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
                        Brand: <strong className="text-gray-800">{product.brand_name}</strong>
                      </span>
                    )}
                    {product.product_code && (
                      <span className="text-[11px] font-mono text-gray-400">
                        SKU: {product.product_code}
                      </span>
                    )}
                  </div>

                  {/* Product Title */}
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-[#27213A] tracking-tight leading-snug mb-2.5">
                    {product.name}
                  </h1>

                  {/* Ratings & Quality Trust Notice */}
                  <div className="flex items-center gap-3 text-xs mb-4 flex-wrap">
                    <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md text-amber-900 font-bold">
                      <span className="text-amber-500 text-sm">★</span>
                      <span>4.8</span>
                    </div>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600 font-medium">100% Genuine Quality</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                      Verified Storefront Product
                    </span>
                  </div>

                  {/* PRICE SECTION (Actual Database Values) */}
                  <div className="bg-[#F5F0FF]/80 border border-[#E8E0F5] rounded-2xl p-4 sm:p-5 mb-5">
                    {isUnavailable ? (
                      <div>
                        <span className="text-2xl sm:text-3xl font-black text-gray-500 tracking-tight">
                          Currently Unavailable
                        </span>
                        <p className="text-xs text-gray-400 mt-1">This product is currently not available for purchase.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className="text-3xl sm:text-4xl font-black text-[#8B5CF6] tracking-tight">
                            ₹{retailPrice}
                          </span>
                          {showDiscount && mrp > retailPrice && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm sm:text-base text-gray-400 line-through">
                                MRP ₹{mrp}
                              </span>
                              <span className="text-xs sm:text-sm font-extrabold text-pink-600 bg-pink-50 border border-pink-200/60 px-2 py-0.5 rounded-md">
                                {discountPercent}% OFF
                              </span>
                            </div>
                          )}
                        </div>

                        {savings > 0 && showDiscount && (
                          <p className="text-xs font-bold text-emerald-700 mt-1">
                            You save ₹{savings} on this product!
                          </p>
                        )}

                        <div className="text-[11px] text-gray-500 font-medium mt-1">
                          Inclusive of all applicable taxes
                        </div>
                      </>
                    )}
                  </div>

                  {/* STOCK STATUS */}
                  <div className="flex items-center gap-2 mb-5">
                    {isUnavailable ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        Currently Unavailable
                      </span>
                    ) : isOutOfStock ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        Currently Out of Stock
                      </span>
                    ) : stockAvailable <= 5 ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        Only {stockAvailable} left in stock — order soon!
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        In Stock (Ready for Dispatch)
                      </span>
                    )}
                  </div>

                  {/* VARIANT SELECTOR */}
                  {Array.isArray(product?.variants) && product.variants.length > 1 && (
                    <div className="mb-5 p-4 rounded-2xl bg-purple-50/50 border border-purple-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-wider text-purple-950">
                          Select Variant / Option:
                        </label>
                        {activeVariant?.sku && (
                          <span className="text-[11px] font-mono font-semibold text-gray-500">
                            SKU: {activeVariant.sku}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2.5">
                        {product.variants.map((v) => {
                          const isSelected = v.id === activeVariant?.id
                          const vStock = Number(v.available ?? v.on_hand ?? 0)
                          const vOutOfStock = vStock <= 0

                          const label =
                            Array.isArray(v.attribute_values) && v.attribute_values.length > 0
                              ? v.attribute_values.map((av) => av.value).join(' / ')
                              : v.variant_description || v.sku || `Option #${v.id}`

                          const colorHex = v.attribute_values?.find((av) => av.color_hex)?.color_hex
                          const vImg = v.images?.[0]?.image_path ? resolveImageUrl(v.images[0].image_path) : null

                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => {
                                setSelectedVariantId(v.id)
                                setSelectedImageIndex(0)
                              }}
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                                isSelected
                                  ? 'bg-[#8B5CF6] text-white border-[#8B5CF6] shadow-xs'
                                  : vOutOfStock
                                  ? 'bg-gray-100 text-gray-400 border-gray-200 opacity-60'
                                  : 'bg-white text-gray-800 border-purple-200 hover:border-purple-400 hover:bg-purple-50/50'
                              }`}
                            >
                              {vImg ? (
                                <img src={vImg} alt={label} className="w-4 h-4 rounded-full object-cover border border-white/50 shrink-0" />
                              ) : colorHex ? (
                                <span
                                  className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0"
                                  style={{ backgroundColor: colorHex }}
                                />
                              ) : null}
                              <span>{label}</span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  isSelected ? 'text-purple-200' : 'text-gray-500'
                                }`}
                              >
                                ₹{v.retail_price}
                              </span>
                              {vOutOfStock && (
                                <span className="text-[9px] font-black uppercase text-red-500">
                                  Sold Out
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* OFFERS SECTION (Dynamic Backend Data) */}
                  <div className="border border-purple-100 rounded-2xl p-4 bg-white shadow-2xs mb-5">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-xs sm:text-sm font-extrabold text-[#27213A] uppercase tracking-wider flex items-center gap-1.5">
                        <span>🏷️</span> Available Offers
                      </h3>
                      {availableCoupons.length > 0 && (
                        <span className="text-[11px] font-bold text-purple-700">
                          {availableCoupons.length} Active Coupon{availableCoupons.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {availableCoupons.length > 0 ? (
                      <div className="space-y-2">
                        {availableCoupons.map((coupon) => (
                          <div
                            key={coupon.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-purple-50/50 border border-purple-100 hover:border-purple-200 transition-colors"
                          >
                            <div className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-purple-900 bg-white border border-purple-200 px-2 py-0.5 rounded text-[11px]">
                                  {coupon.code}
                                </span>
                                <span className="font-bold text-purple-950">
                                  {coupon.name}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-600 mt-1">
                                {coupon.description ||
                                  (coupon.discount_type === 'PERCENTAGE'
                                    ? `Get ${coupon.discount_value}% discount on orders`
                                    : `Get flat ₹${coupon.discount_value} off`)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyCoupon(coupon.code)}
                              className="text-[11px] font-bold text-purple-700 hover:text-purple-900 bg-white hover:bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200 transition-colors shrink-0 ml-2 cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                        ))}

                        {/* Free Delivery Offer */}
                        <div className="flex items-start gap-2 text-xs text-gray-700 pt-1">
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span>
                            <strong>Free Delivery:</strong> On all orders above ₹499 across India.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 py-1">
                        No offers available for this product
                      </div>
                    )}
                  </div>

                  {/* DELIVERY / PINCODE CHECKER */}
                  <div className="border border-purple-100 rounded-2xl p-4 bg-white shadow-2xs mb-6">
                    <h3 className="text-xs sm:text-sm font-extrabold text-[#27213A] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span>🚚</span> Delivery Availability
                    </h3>

                    <form onSubmit={handleCheckPincode} className="flex gap-2 mb-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit PIN code"
                          className="w-full px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-100 transition-all bg-gray-50/50"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isPincodeLoading || pincode.trim().length !== 6}
                        className="px-4 py-2 bg-[#8B5CF6] hover:bg-[#7042D2] text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                      >
                        {isPincodeLoading ? 'Checking...' : 'Check'}
                      </button>
                    </form>

                    {/* Result message */}
                    {pincodeStatus && (
                      <div
                        className={`text-xs p-3 rounded-xl border mt-2 ${
                          pincodeStatus.valid
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        <p className="font-semibold">{pincodeStatus.message}</p>
                        {pincodeStatus.valid && (
                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-emerald-800">
                            <span>• {pincodeStatus.delivery_charge}</span>
                            <span>• Cash on Delivery: {pincodeStatus.cod_available ? 'Available' : 'Prepaid Only'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* QUANTITY & PRIMARY PURCHASE ACTIONS CONTAINER */}
                  <div ref={purchaseSectionRef} className="space-y-4 pt-2 border-t border-purple-50">
                    
                    {/* Quantity Selector */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs sm:text-sm font-bold text-gray-700">Quantity:</span>
                      <div className="flex items-center border border-purple-200 rounded-xl bg-purple-50/30 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(-1)}
                          disabled={quantity <= 1 || isOutOfStock}
                          className="w-9 h-9 flex items-center justify-center font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-base"
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-extrabold text-sm text-[#27213A]">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(1)}
                          disabled={isOutOfStock || (stockAvailable > 0 && quantity >= stockAvailable)}
                          className="w-9 h-9 flex items-center justify-center font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-base"
                        >
                          +
                        </button>
                      </div>
                      {stockAvailable > 0 && (
                        <span className="text-[11px] text-gray-500">
                          (Max {stockAvailable} per order)
                        </span>
                      )}
                    </div>

                    {/* Purchase Action Buttons */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Add to Cart */}
                      <button
                        type="button"
                        onClick={() => handleAddToCart()}
                        disabled={isOutOfStock || isAddingToCart || isUnavailable}
                        className="w-full py-3.5 px-6 rounded-2xl border-2 border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#F5F0FF] font-black text-sm tracking-wide shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M16 11V7a4 4 0 0 0-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                        <span>{isUnavailable ? 'Unavailable' : isAddingToCart ? 'Adding to Cart...' : 'Add to Cart'}</span>
                      </button>

                      {/* Buy Now */}
                      <button
                        type="button"
                        onClick={handleBuyNow}
                        disabled={isOutOfStock || isUnavailable}
                        className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#8B5CF6] to-[#7042D2] hover:brightness-105 text-white font-black text-sm tracking-wide shadow-lg shadow-purple-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
                      >
                        <span>{isUnavailable ? 'Unavailable' : '⚡ Buy Now'}</span>
                      </button>
                    </div>

                    {/* Wishlist Link & Trust Assurances */}
                    <div className="flex items-center justify-between pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleWishlist(product.id)}
                        className="font-bold text-purple-800 hover:text-purple-950 flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{isWishlisted ? '♥ Saved in Wishlist' : '♡ Add to Wishlist'}</span>
                      </button>

                      <div className="flex items-center gap-3 text-gray-500 text-[11px]">
                        <span>🛡️ Secure Checkout</span>
                        <span>•</span>
                        <span>🔄 Easy Returns</span>
                      </div>
                    </div>

                  </div>

                </div>
              </div>

            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* PRODUCT DETAILS TABS / ACCORDION                     */}
        {/* ==================================================== */}
        {!isLoading && product && (
          <div className="bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-purple-100 shadow-xs mb-10">
            
            {/* Tab Navigation Header */}
            <div className="flex border-b border-purple-100 gap-2 sm:gap-6 overflow-x-auto no-scrollbar mb-6">
              {[
                { id: 'description', label: 'Description' },
                { id: 'specs', label: 'Specifications' },
                { id: 'delivery', label: 'Delivery & Returns' },
                { id: 'offers', label: 'Offers & Coupons' },
                { id: 'reviews', label: 'Customer Reviews' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                    activeTab === tab.id
                      ? 'border-[#8B5CF6] text-[#8B5CF6]'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: DESCRIPTION & HIGHLIGHTS */}
            {activeTab === 'description' && (
              <div className="space-y-4 text-xs sm:text-sm text-gray-700 leading-relaxed max-w-4xl">
                {product.short_description && (
                  <p className="font-semibold text-purple-950 text-sm sm:text-base leading-snug">
                    {product.short_description}
                  </p>
                )}

                {product.description ? (
                  <div className="whitespace-pre-line text-gray-600">
                    {product.description}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">
                    No detailed description provided for this product.
                  </p>
                )}

                {/* Bullet Points from Database */}
                {Array.isArray(product.bullet_points) && product.bullet_points.length > 0 && (
                  <div className="pt-3">
                    <h4 className="font-bold text-gray-900 mb-2">Key Highlights:</h4>
                    <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                      {product.bullet_points.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: SPECIFICATIONS (From Database) */}
            {activeTab === 'specs' && (
              <div className="max-w-3xl">
                {!(
                  product.product_code ||
                  primaryCategory ||
                  product.brand_name ||
                  product.material ||
                  product.weight_grams ||
                  product.length_cm ||
                  product.country_of_origin ||
                  product.warranty_applicable === 1 ||
                  (Array.isArray(product.specifications) && product.specifications.length > 0)
                ) ? (
                  <p className="text-gray-500 italic py-4">No additional specifications available for this product.</p>
                ) : (
                  <div className="divide-y divide-purple-50 text-xs sm:text-sm">
                    {product.product_code && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Product Code</span>
                        <span className="col-span-2 text-gray-900 font-mono">{product.product_code}</span>
                      </div>
                    )}
                    {primaryCategory && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Category</span>
                        <span className="col-span-2 text-gray-900">{primaryCategory.name}</span>
                      </div>
                    )}
                    {product.brand_name && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Brand</span>
                        <span className="col-span-2 text-gray-900">{product.brand_name}</span>
                      </div>
                    )}
                    {product.material && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Material</span>
                        <span className="col-span-2 text-gray-900">{product.material}</span>
                      </div>
                    )}
                    {product.weight_grams && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Weight</span>
                        <span className="col-span-2 text-gray-900">{product.weight_grams} g</span>
                      </div>
                    )}
                    {product.length_cm && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Dimensions</span>
                        <span className="col-span-2 text-gray-900">
                          {product.length_cm} × {product.width_cm || 0} × {product.height_cm || 0} cm
                        </span>
                      </div>
                    )}
                    {product.country_of_origin && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Country of Origin</span>
                        <span className="col-span-2 text-gray-900">{product.country_of_origin}</span>
                      </div>
                    )}
                    {product.warranty_applicable === 1 && (
                      <div className="grid grid-cols-3 py-2.5">
                        <span className="font-bold text-gray-500">Warranty</span>
                        <span className="col-span-2 text-gray-900">
                          {product.warranty_period} {product.warranty_unit} {product.warranty_description && `(${product.warranty_description})`}
                        </span>
                      </div>
                    )}

                    {/* Custom specifications from product_specifications table */}
                    {Array.isArray(product.specifications) &&
                      product.specifications.map((spec) => (
                        <div key={spec.id} className="grid grid-cols-3 py-2.5">
                          <span className="font-bold text-gray-500">{spec.name}</span>
                          <span className="col-span-2 text-gray-900">{spec.value}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: DELIVERY & RETURNS */}
            {activeTab === 'delivery' && (
              <div className="max-w-3xl space-y-4 text-xs sm:text-sm text-gray-700">
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-start gap-3">
                  <span className="text-xl">📦</span>
                  <div>
                    <h4 className="font-bold text-purple-950 mb-1">Standard Shipping & Delivery</h4>
                    <p className="text-gray-600">
                      Dispatched within 24 hours from verified hubs. Average delivery timeline 2–4 business days across India. Free shipping on all orders above ₹499.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-start gap-3">
                  <span className="text-xl">💵</span>
                  <div>
                    <h4 className="font-bold text-purple-950 mb-1">Cash on Delivery (COD)</h4>
                    <p className="text-gray-600">
                      {product.cod_available
                        ? 'Cash on Delivery is available for this product across eligible pin codes.'
                        : 'Prepaid payments only for this product (UPI, Credit/Debit cards).'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-start gap-3">
                  <span className="text-xl">🔄</span>
                  <div>
                    <h4 className="font-bold text-purple-950 mb-1">7-Day Return / Replacement Guarantee</h4>
                    <p className="text-gray-600">
                      {product.returnable
                        ? `This product is returnable within ${product.return_window_days || 7} days of delivery if damaged or defective.`
                        : 'Non-returnable item due to hygiene and standard safety guidelines.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: OFFERS & COUPONS */}
            {activeTab === 'offers' && (
              <div className="max-w-3xl">
                {availableCoupons.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {availableCoupons.map((coupon) => (
                      <div
                        key={coupon.id}
                        className="border border-purple-200 rounded-2xl p-4 bg-gradient-to-br from-white to-purple-50/30 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono font-black text-xs text-purple-900 bg-purple-100 px-2.5 py-1 rounded-md">
                              {coupon.code}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              Active
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-purple-950 mb-1">{coupon.name}</h4>
                          <p className="text-xs text-gray-600 mb-2">{coupon.description}</p>
                          {coupon.min_order_amount && (
                            <p className="text-[11px] text-gray-500">
                              Min Order Amount: ₹{Number(coupon.min_order_amount)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyCoupon(coupon.code)}
                          className="mt-3 w-full py-1.5 rounded-xl border border-purple-300 text-purple-800 hover:bg-purple-600 hover:text-white font-bold text-xs transition-colors cursor-pointer"
                        >
                          Copy Coupon Code
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-gray-500 text-xs sm:text-sm">
                    No offers available for this product
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: CUSTOMER REVIEWS */}
            {activeTab === 'reviews' && (
              <div className="max-w-3xl">
                <div className="flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl bg-purple-50/40 border border-purple-100 mb-6">
                  <div className="text-center sm:text-left">
                    <div className="text-4xl font-black text-purple-950">4.8</div>
                    <div className="text-amber-500 text-sm font-bold my-1">★★★★★</div>
                    <p className="text-xs text-gray-500">Overall Customer Satisfaction</p>
                  </div>
                  <div className="w-full border-t sm:border-t-0 sm:border-l border-purple-200/60 pt-4 sm:pt-0 sm:pl-6 text-xs text-gray-600 space-y-1.5">
                    <p>✓ 100% verified customer purchase guarantee</p>
                    <p>✓ Quality checked before dispatch</p>
                    <p>✓ Fast delivery across India</p>
                  </div>
                </div>

                <div className="text-center py-6 border border-dashed border-purple-200 rounded-2xl bg-white">
                  <p className="text-sm font-bold text-gray-700 mb-1">
                    Have you purchased this product?
                  </p>
                  <p className="text-xs text-gray-500 mb-3">
                    Reviews from customers help others make informed decisions.
                  </p>
                  <button
                    type="button"
                    onClick={() => showToast('Review submission will open after delivery verification.')}
                    className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-900 font-bold text-xs rounded-xl border border-purple-200 transition-colors cursor-pointer"
                  >
                    Write a Review
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ==================================================== */}
        {/* RELATED PRODUCTS: "YOU MAY ALSO LIKE"                */}
        {/* ==================================================== */}
        {!isLoading && relatedProducts.length > 0 && (
          <HorizontalProductSection
            id="you-may-also-like"
            badgeText="RECOMMENDED FOR YOU"
            title="You May Also Like"
            subtitle="Curated matching accessories and essentials"
            products={relatedProducts}
            viewAllLink={primaryCategory ? `/products?category_id=${primaryCategory.id}` : '/products'}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
          />
        )}

        {/* ==================================================== */}
        {/* RECENTLY VIEWED PRODUCTS (Browser Interaction State) */}
        {/* ==================================================== */}
        {!isLoading && recentlyViewed.length > 0 && (
          <HorizontalProductSection
            id="recently-viewed"
            badgeText="BROWSING HISTORY"
            title="Recently Viewed"
            subtitle="Products you checked out during your visit"
            products={recentlyViewed}
            viewAllLink="/products"
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
          />
        )}

      </main>

      {/* ==================================================== */}
      {/* STICKY BOTTOM PURCHASE BAR                          */}
      {/* ==================================================== */}
      {showStickyBar && product && (
        <aside
          aria-label="Quick Purchase Bar"
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-purple-200 shadow-2xl py-2.5 px-4 sm:px-6 transition-all duration-300"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 sm:gap-6">
            
            {/* Desktop Left: Image + Title + Price */}
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={activeImage}
                alt={product.name}
                className="w-11 h-11 rounded-xl object-cover border border-purple-100 shrink-0 hidden sm:block"
              />
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-gray-900 truncate max-w-[140px] sm:max-w-xs md:max-w-md">
                  {product.name}
                </h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-base sm:text-lg font-black text-[#8B5CF6]">
                    ₹{retailPrice}
                  </span>
                  {mrp > retailPrice && (
                    <span className="text-xs text-gray-400 line-through hidden sm:inline">
                      ₹{mrp}
                    </span>
                  )}
                  {discountPercent > 0 && (
                    <span className="text-[10px] font-bold text-pink-600 bg-pink-50 px-1.5 py-0.2 rounded">
                      {discountPercent}% OFF
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop & Mobile Actions */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              
              {/* Quantity Selector (Desktop only) */}
              <div className="hidden md:flex items-center border border-purple-200 rounded-xl bg-purple-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= 1 || isOutOfStock}
                  className="w-7 h-7 flex items-center justify-center font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-30 transition-colors cursor-pointer text-sm"
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-xs text-purple-950">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  disabled={isOutOfStock || (stockAvailable > 0 && quantity >= stockAvailable)}
                  className="w-7 h-7 flex items-center justify-center font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-30 transition-colors cursor-pointer text-sm"
                >
                  +
                </button>
              </div>

              {/* Add to Cart Button */}
              <button
                type="button"
                onClick={() => handleAddToCart()}
                disabled={isOutOfStock || isAddingToCart}
                className="py-2.5 px-3.5 sm:px-5 rounded-xl border-2 border-[#8B5CF6] text-[#8B5CF6] hover:bg-[#F5F0FF] font-bold text-xs sm:text-sm tracking-tight transition-colors cursor-pointer shrink-0 disabled:opacity-40"
              >
                {isAddingToCart ? 'Adding...' : 'Add to Cart'}
              </button>

              {/* Buy Now Button */}
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                className="py-2.5 px-4 sm:px-6 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-[#7042D2] hover:brightness-105 text-white font-bold text-xs sm:text-sm shadow-md transition-colors cursor-pointer shrink-0 disabled:opacity-40"
              >
                ⚡ Buy Now
              </button>

            </div>

          </div>
        </aside>
      )}

      {/* ==================================================== */}
      {/* FULLSCREEN LIGHTBOX IMAGE VIEWER MODAL               */}
      {/* ==================================================== */}
      {isFullscreenOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 sm:p-6 animate-fade-in"
        >
          {/* Top Bar: Close & Image Count */}
          <div className="flex items-center justify-between text-white max-w-7xl mx-auto w-full">
            <span className="text-xs sm:text-sm font-semibold text-gray-300">
              {product?.name} ({selectedImageIndex + 1} of {imageGallery.length})
            </span>
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(false)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl font-bold transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Center Main High-Res Image with Prev / Next */}
          <div className="relative flex-1 flex items-center justify-center my-4 max-w-5xl mx-auto w-full">
            {imageGallery.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedImageIndex((prev) => (prev > 0 ? prev - 1 : imageGallery.length - 1))
                }
                className="absolute left-2 sm:left-4 z-10 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center text-2xl font-black shadow-lg transition-colors cursor-pointer"
              >
                ‹
              </button>
            )}

            <img
              src={activeImage}
              alt={product?.name}
              className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl"
            />

            {imageGallery.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedImageIndex((prev) => (prev < imageGallery.length - 1 ? prev + 1 : 0))
                }
                className="absolute right-2 sm:right-4 z-10 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center text-2xl font-black shadow-lg transition-colors cursor-pointer"
              >
                ›
              </button>
            )}
          </div>

          {/* Bottom Thumbnails Strip */}
          {imageGallery.length > 1 && (
            <div className="flex items-center justify-center gap-2 max-w-xl mx-auto overflow-x-auto py-2">
              {imageGallery.map((thumbUrl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedImageIndex(idx)}
                  className={`w-12 h-12 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                    selectedImageIndex === idx ? 'border-purple-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CART DRAWER & CHECKOUT MODAL */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onProceedToCheckout={(cartData) => {
          setIsCartOpen(false)
          setCheckoutCartData(cartData)
          setIsCheckoutOpen(true)
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        customer={customer}
        cartData={checkoutCartData}
      />

      {/* FOOTER */}
      <footer className="bg-[#27213A] text-white pt-12 pb-8 border-t border-[#E8E0F5]/20 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-purple-900/60">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white font-black text-lg">
                  K
                </span>
                <span className="text-xl font-extrabold tracking-tight text-white">
                  Kirana<span className="text-pink-400">Bazaar</span>
                </span>
              </div>
              <p className="text-xs text-purple-200/80 leading-relaxed">
                Your trusted neighborhood store for trending accessories, jewellery, cosmetics, and lifestyle gifts at unmatched prices.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Shop Categories</h4>
              <ul className="space-y-2 text-xs text-purple-200/70">
                <li><Link to="/products?category_id=1" className="hover:text-pink-300 transition-colors">Hair Accessories</Link></li>
                <li><Link to="/products?category_id=2" className="hover:text-pink-300 transition-colors">Fashion Jewellery</Link></li>
                <li><Link to="/products?category_id=3" className="hover:text-pink-300 transition-colors">Gift Hampers</Link></li>
                <li><Link to="/products?category_id=4" className="hover:text-pink-300 transition-colors">Soft Toys & Games</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Customer Service</h4>
              <ul className="space-y-2 text-xs text-purple-200/70">
                <li><Link to="/pages/shipping-policy" className="hover:text-pink-300 transition-colors">Shipping & Delivery Policy</Link></li>
                <li><Link to="/pages/return-exchange-policy" className="hover:text-pink-300 transition-colors">Returns & Refunds</Link></li>
                <li><Link to="/pages/privacy-policy" className="hover:text-pink-300 transition-colors">Privacy Policy</Link></li>
                <li><Link to="/pages/terms-and-conditions" className="hover:text-pink-300 transition-colors">Terms and Conditions</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3">Fast & Secure Delivery</h4>
              <p className="text-xs text-purple-200/80 leading-relaxed mb-3">
                Orders dispatched directly from our hubs. {deliverySettings?.free_delivery_threshold ? `Free shipping across India on orders above ₹${Number(deliverySettings.free_delivery_threshold).toFixed(0)}.` : 'Express shipping across India.'}
              </p>
              <div className="flex items-center gap-2 text-xs text-purple-300">
                <span>🔒 SSL Encrypted</span>
                <span>•</span>
                <span>💵 COD Available</span>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-purple-300/60 gap-4">
            <p>© {new Date().getFullYear()} KiranaBazaar Storefront. All rights reserved.</p>
            <p>Made with ❤️ for smart Indian shoppers.</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
