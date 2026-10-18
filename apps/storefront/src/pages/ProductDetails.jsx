import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  FiStar,
  FiTag,
  FiTruck,
  FiZap,
  FiHeart,
  FiShield,
  FiRefreshCw,
  FiBox,
  FiDollarSign,
  FiLock,
  FiCheck,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiThumbsUp,
  FiMessageSquare,
  FiEdit3,
} from 'react-icons/fi'
import {
  api,
  getCustomerToken,
  getStoredCustomer,
  isTokenExpired,
  clearCustomerSession,
  fetchStoreSettings,
  fetchDeliverySettings,
  fetchCategories,
  resolveImageUrl,
} from '../lib/api'
import { ROUTES } from '../routes/routes'
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
  const [categories, setCategories] = useState([])

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
  const [pincode, setPincode] = useState('')
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

  // Customer Reviews State
  const [reviews, setReviews] = useState([])
  const [reviewsFilter, setReviewsFilter] = useState('ALL')
  const [reviewsSort, setReviewsSort] = useState('LATEST')
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false)
  const [newReviewRating, setNewReviewRating] = useState(5)
  const [newReviewTitle, setNewReviewTitle] = useState('')
  const [newReviewComment, setNewReviewComment] = useState('')
  const [newReviewName, setNewReviewName] = useState('')
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)
  const [votedHelpfulIds, setVotedHelpfulIds] = useState([])

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

  // Load store, delivery settings and categories from MySQL
  useEffect(() => {
    fetchStoreSettings().then((s) => s && setStoreSettings(s))
    fetchDeliverySettings().then((d) => d && setDeliverySettings(d))
    fetchCategories().then((cats) => cats && setCategories(cats))
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
      setCustomer(null)
      return
    }

    const cached = getStoredCustomer()
    if (cached) {
      setCustomer(cached)
    }

    api
      .get('/customers/me')
      .then((res) => {
        if (res.data?.customer) {
          setCustomer(res.data.customer)
          try {
            localStorage.setItem('customer_data', JSON.stringify(res.data.customer))
          } catch {
            // ignore
          }
        } else {
          setCustomer(null)
        }
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          const currentToken = getCustomerToken()
          if (!currentToken || isTokenExpired(currentToken)) {
            clearCustomerSession()
            setCustomer(null)
          }
        }
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
          setReviews(Array.isArray(prod.reviews) ? prod.reviews : [])
          const initialVar = prod.variants?.find((v) => v.is_default) || prod.variants?.[0]
          if (initialVar?.id) {
            setSelectedVariantId(initialVar.id)
          }

          // T16: Log product view event to customer activity logs & update product_stats.view_count
          try {
            let sessId = localStorage.getItem('customer_session_id')
            if (!sessId) {
              sessId = 'sess_' + Math.random().toString(36).substring(2, 15)
              localStorage.setItem('customer_session_id', sessId)
            }
            api.post(`/products/${prod.id}/view`, { session_id: sessId }).catch(() => {})

            // Store in persistent local history
            const storedIds = JSON.parse(localStorage.getItem('recently_viewed_ids') || '[]')
            const nextIds = [prod.id, ...storedIds.filter((id) => Number(id) !== Number(prod.id))].slice(0, 10)
            localStorage.setItem('recently_viewed_ids', JSON.stringify(nextIds))
          } catch {
            // ignore
          }

          // Manage Recently Viewed list for UI carousel
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

            // Asynchronously hydrate recently viewed from server to capture full catalog items
            let sessId = ''
            try { sessId = localStorage.getItem('customer_session_id') || '' } catch {}
            api.get(`/products/recently-viewed?limit=8${sessId ? `&session_id=${sessId}` : ''}`)
              .then((res) => {
                const sItems = res.data?.items || []
                const filteredServer = sItems.filter((item) => Number(item.id) !== Number(prod.id))
                if (filteredServer.length > 0) {
                  setRecentlyViewed(filteredServer)
                }
              })
              .catch(() => {})
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

    const handleRevalidate = () => {
      if (id) fetchProductData()
    }
    window.addEventListener('storefront-revalidate', handleRevalidate)

    return () => {
      window.removeEventListener('storefront-revalidate', handleRevalidate)
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
      showToast(added ? 'Saved to Wishlist' : 'Removed from Wishlist')
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
      showToast(`Added ${addQty > 1 ? addQty + ' × ' : ''}"${prodToAdd.name}" to Cart!`)
      setIsCartOpen(true)
    } catch {
      showToast('Could not add item to cart. Please try again.')
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
    const freeThreshold = deliverySettings?.free_delivery_threshold != null ? Number(deliverySettings.free_delivery_threshold) : null
    const stdFee = Number(deliverySettings?.delivery_charge ?? deliverySettings?.standard_delivery_fee ?? 0)
    const deliveryCharge = (freeThreshold !== null && subtotal >= freeThreshold) || subtotal === 0 ? 0 : stdFee

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
      showToast(`Coupon "${code}" copied to clipboard!`)
    } catch {
      showToast(`Coupon Code: ${code}`)
    }
  }

  // Calculate review statistics & star breakdown
  const reviewStats = useMemo(() => {
    const total = reviews.length
    if (total === 0) {
      return {
        total: 0,
        average: '0.0',
        counts: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        percents: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      }
    }
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    let sum = 0
    reviews.forEach((r) => {
      const star = Math.max(1, Math.min(5, Number(r.rating) || 5))
      counts[star] = (counts[star] || 0) + 1
      sum += star
    })
    const average = (sum / total).toFixed(1)
    const percents = {
      5: Math.round((counts[5] / total) * 100),
      4: Math.round((counts[4] / total) * 100),
      3: Math.round((counts[3] / total) * 100),
      2: Math.round((counts[2] / total) * 100),
      1: Math.round((counts[1] / total) * 100),
    }
    return { total, average, counts, percents }
  }, [reviews])

  // Filter and Sort Reviews
  const filteredReviews = useMemo(() => {
    let list = [...reviews]
    if (reviewsFilter !== 'ALL') {
      const starNum = Number(reviewsFilter)
      list = list.filter((r) => Number(r.rating) === starNum)
    }
    if (reviewsSort === 'LATEST') {
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    } else if (reviewsSort === 'HIGHEST') {
      list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
    } else if (reviewsSort === 'HELPFUL') {
      list.sort((a, b) => (Number(b.helpful_count) || 0) - (Number(a.helpful_count) || 0))
    }
    return list
  }, [reviews, reviewsFilter, reviewsSort])

  // Helpful vote handler
  const handleHelpfulVote = async (reviewId) => {
    if (votedHelpfulIds.includes(reviewId)) {
      showToast('You already marked this review as helpful!')
      return
    }
    try {
      const res = await api.post(`/reviews/${reviewId}/helpful`)
      const updatedCount = res.data?.helpful_count
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, helpful_count: updatedCount !== undefined ? updatedCount : (r.helpful_count || 0) + 1 }
            : r
        )
      )
      setVotedHelpfulIds((prev) => [...prev, reviewId])
      showToast('Thank you for your feedback!')
    } catch {
      showToast('Unable to submit feedback right now.')
    }
  }

  // Open review modal
  const handleOpenWriteReview = () => {
    setNewReviewRating(5)
    setNewReviewTitle('')
    setNewReviewComment('')
    setNewReviewName(customer?.name || '')
    setIsWriteReviewOpen(true)
  }

  // Submit new review
  const handleSubmitReview = async (e) => {
    e?.preventDefault()
    if (!newReviewComment.trim()) {
      showToast('Please enter your review comments.')
      return
    }
    setIsSubmittingReview(true)
    try {
      const res = await api.post(`/products/${product?.id}/reviews`, {
        rating: newReviewRating,
        title: newReviewTitle.trim() || undefined,
        comment: newReviewComment.trim(),
        customer_name: newReviewName.trim() || customer?.name || 'Verified Customer',
      })
      if (res.data?.review) {
        setReviews((prev) => [res.data.review, ...prev])
        showToast('Review submitted successfully! Thank you.')
        setIsWriteReviewOpen(false)
        setNewReviewComment('')
        setNewReviewTitle('')
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit review. Please try again.')
    } finally {
      setIsSubmittingReview(false)
    }
  }

  // Format date
  const formatReviewDate = (dateStr) => {
    if (!dateStr) return 'Recently'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  // Avatar Initials & Color
  const getInitials = (name) => {
    if (!name) return 'U'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }

  const getAvatarBg = (name) => {
    const colors = [
      'bg-emerald-600',
      'bg-indigo-600',
      'bg-purple-600',
      'bg-rose-600',
      'bg-amber-600',
      'bg-cyan-600',
      'bg-teal-600',
      'bg-blue-600',
    ]
    let hash = 0
    for (let i = 0; i < (name || '').length; i++) {
      hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0
    }
    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans selection:bg-[var(--color-primary-tint)] selection:text-[var(--color-brand)] overflow-x-hidden">
      
      {/* TOAST FEEDBACK NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-20 sm:bottom-6 right-6 z-50 bg-[var(--color-text-main)] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-bounce border border-[var(--color-brand)]/30">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ONE REUSABLE GLOBAL STICKY NAVBAR */}
      <Navbar onOpenCart={() => setIsCartOpen(true)} />

      {/* BREADCRUMB NAVIGATION */}
      <nav aria-label="Breadcrumb" className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-4 text-xs font-sans font-medium text-[#666666] flex items-center gap-2 flex-wrap">
        <Link to={ROUTES.HOME} className="text-[#6C4EFF] hover:text-[#1B133F] font-semibold hover:underline">
          Home
        </Link>
        <span className="text-[#E9DFFF]">/</span>
        <Link to={ROUTES.PRODUCTS} className="text-[#6C4EFF] hover:text-[#1B133F] font-medium hover:underline">
          Shop
        </Link>
        {primaryCategory && (
          <>
            <span className="text-[#E9DFFF]">/</span>
            <Link
              to={ROUTES.PRODUCTS_BY_CATEGORY(primaryCategory.id)}
              className="text-[#6C4EFF] hover:text-[#1B133F] font-medium hover:underline"
            >
              {primaryCategory.name}
            </Link>
          </>
        )}
        {product?.subcategories?.[0] && (
          <>
            <span className="text-[#E9DFFF]">/</span>
            <Link
              to={ROUTES.PRODUCTS_BY_SUBCATEGORY(product.subcategories[0].id)}
              className="text-[#6C4EFF] hover:text-[#1B133F] font-medium hover:underline"
            >
              {product.subcategories[0].name}
            </Link>
          </>
        )}
        <span className="text-[#E9DFFF]">/</span>
        <span className="text-[#1B133F] font-semibold truncate max-w-[200px] sm:max-w-xs">
          {product?.name || 'Product Details'}
        </span>
      </nav>

      {/* MAIN CONTAINER: 1320px */}
      <main className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-2 pb-24 lg:pb-16">
        
        {/* LOADING SKELETON */}
        {isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 py-8 animate-pulse">
            <div className="lg:col-span-6 flex flex-col md:flex-row gap-4">
              <div className="hidden md:flex flex-col gap-3 w-20">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="aspect-square bg-[var(--color-primary-tint)]/40 rounded-xl" />
                ))}
              </div>
              <div className="flex-1 aspect-square bg-[var(--color-primary-tint)]/40 rounded-3xl" />
            </div>
            <div className="lg:col-span-6 space-y-4">
              <div className="h-6 w-32 bg-[var(--color-primary-tint)]/40 rounded-full" />
              <div className="h-8 w-3/4 bg-[var(--color-primary-tint)]/40 rounded-xl" />
              <div className="h-10 w-48 bg-[var(--color-primary-tint)]/40 rounded-xl" />
              <div className="h-24 w-full bg-[var(--color-primary-tint)]/40 rounded-2xl" />
              <div className="h-12 w-full bg-[var(--color-primary-tint)]/40 rounded-2xl" />
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
              to={ROUTES.PRODUCTS}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white rounded-xl font-bold text-sm shadow-md transition-colors"
            >
              ← Return to Catalog
            </Link>
          </div>
        )}

        {/* TWO-COLUMN PRODUCT DETAIL SECTION */}
        {!isLoading && product && (
          <div className="bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-[var(--color-border-subtle)] shadow-xs mb-10">
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
                              ? 'border-[var(--color-brand)] shadow-md ring-2 ring-[var(--color-primary-tint)]'
                              : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-subtle)] opacity-80 hover:opacity-100'
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
                      className="relative aspect-square rounded-2xl md:rounded-3xl overflow-hidden bg-gradient-to-b from-gray-50 to-[var(--color-bg-main)] border border-[var(--color-border-subtle)] shadow-xs group cursor-zoom-in select-none"
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
                          <span className="bg-[var(--color-brand)] text-white text-[10px] sm:text-xs font-black px-2.5 py-1 rounded-lg shadow-md uppercase tracking-wider">
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
                          fill={isWishlisted ? 'var(--color-brand)' : 'none'}
                          stroke={isWishlisted ? 'var(--color-brand)' : 'currentColor'}
                          strokeWidth="2.2"
                        >
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                        </svg>
                      </button>

                      {/* Click to Expand Lightbox Hint */}
                      <div className="absolute bottom-3 right-3 bg-white/85 backdrop-blur-xs text-gray-700 px-2.5 py-1 rounded-lg text-[11px] font-bold shadow-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg className="w-3.5 h-3.5 text-[var(--color-brand)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                              selectedImageIndex === i ? 'w-5 bg-[var(--color-brand)]' : 'w-1.5 bg-[var(--color-border-subtle)]'
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
                        to={ROUTES.PRODUCTS_BY_CATEGORY(primaryCategory.id)}
                        className="text-xs font-bold text-[var(--color-brand)] uppercase tracking-wider bg-[var(--color-bg-main)] px-2.5 py-1 rounded-md hover:bg-[var(--color-primary-tint)] transition-colors"
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

                  {/* Product Title: Playfair Display */}
                  <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1B133F] tracking-tight leading-snug mb-3">
                    {product.name}
                  </h1>

                  {/* Ratings & Quality Trust Notice */}
                  <div className="flex items-center gap-3 text-xs mb-4 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('reviews')
                        document.getElementById('product-tabs-section')?.scrollIntoView({ behavior: 'smooth' })
                      }}
                      className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md text-amber-900 font-bold transition-colors cursor-pointer"
                    >
                      <FiStar className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      <span>{Number(reviewStats.average) > 0 ? reviewStats.average : '4.8'}</span>
                      <span className="text-gray-500 font-normal">
                        ({reviewStats.total} {reviewStats.total === 1 ? 'review' : 'reviews'})
                      </span>
                    </button>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600 font-medium">100% Genuine Quality</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                      Verified Storefront Product
                    </span>
                  </div>

                  {/* PRICE SECTION (Actual Database Values) */}
                  <div className="bg-[var(--color-bg-alt)]/80 border border-[var(--color-border-subtle)] rounded-2xl p-4 sm:p-5 mb-5">
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
                          <span className="text-3xl sm:text-4xl font-black text-[var(--color-brand)] tracking-tight">
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
                    <div className="mb-5 p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
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
                                  ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)] shadow-xs'
                                  : vOutOfStock
                                  ? 'bg-gray-100 text-gray-400 border-gray-200 opacity-60'
                                  : 'bg-white text-gray-800 border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] hover:bg-[var(--color-primary-tint)]/40'
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
                                  isSelected ? 'text-[var(--color-primary-tint)]' : 'text-gray-500'
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
                  <div className="border border-[var(--color-border-subtle)] rounded-2xl p-4 bg-white shadow-2xs mb-5">
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="text-xs sm:text-sm font-extrabold text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-1.5">
                        <FiTag className="w-4 h-4 text-[var(--color-brand)]" />
                        <span>Available Offers</span>
                      </h3>
                      {availableCoupons.length > 0 && (
                        <span className="text-[11px] font-bold text-[var(--color-brand)]">
                          {availableCoupons.length} Active Coupon{availableCoupons.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {availableCoupons.length > 0 ? (
                      <div className="space-y-2">
                        {availableCoupons.map((coupon) => (
                          <div
                            key={coupon.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-subtle)] transition-colors"
                          >
                            <div className="text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-[var(--color-text-main)] bg-white border border-[var(--color-border-subtle)] px-2 py-0.5 rounded text-[11px]">
                                  {coupon.code}
                                </span>
                                <span className="font-bold text-[var(--color-text-main)]">
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
                              className="text-[11px] font-bold text-[var(--color-brand)] hover:text-[var(--color-text-main)] bg-white hover:bg-[var(--color-primary-tint)] px-2.5 py-1 rounded-lg border border-[var(--color-border-subtle)] transition-colors shrink-0 ml-2 cursor-pointer"
                            >
                              Copy
                            </button>
                          </div>
                        ))}

                        {/* Free Delivery Offer */}
                        <div className="flex items-start gap-2 text-xs text-gray-700 pt-1">
                          <FiCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
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
                  <div className="border border-[var(--color-border-subtle)] rounded-2xl p-4 bg-white shadow-2xs mb-6">
                    <h3 className="text-xs sm:text-sm font-extrabold text-[var(--color-text-main)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FiTruck className="w-4 h-4 text-[var(--color-brand)]" />
                      <span>Delivery Availability</span>
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
                          className="w-full px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 focus:outline-none focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[var(--color-primary-tint)] transition-all bg-gray-50/50"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isPincodeLoading || pincode.trim().length !== 6}
                        className="px-4 py-2 bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white font-bold text-xs sm:text-sm rounded-xl transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
                  <div ref={purchaseSectionRef} className="space-y-4 pt-2 border-t border-[var(--color-border-subtle)]">
                    
                    {/* Quantity Selector */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs sm:text-sm font-bold text-gray-700">Quantity:</span>
                      <div className="flex items-center border border-[var(--color-border-subtle)] rounded-xl bg-[var(--color-bg-main)] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(-1)}
                          disabled={quantity <= 1 || isOutOfStock}
                          className="w-9 h-9 flex items-center justify-center font-bold text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-base"
                        >
                          −
                        </button>
                        <span className="w-10 text-center font-extrabold text-sm text-[var(--color-text-main)]">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleQuantityChange(1)}
                          disabled={isOutOfStock || (stockAvailable > 0 && quantity >= stockAvailable)}
                          className="w-9 h-9 flex items-center justify-center font-bold text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-base"
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
                        className="w-full py-4 px-6 rounded-full border border-[#6C4EFF] text-[#6C4EFF] hover:bg-[#FAF8FF] font-sans font-semibold text-sm tracking-wide shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
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
                        className="w-full py-4 px-6 rounded-full bg-[#6C4EFF] hover:bg-[#4B2AC5] text-white font-sans font-semibold text-sm tracking-wide shadow-[0_8px_25px_rgba(108,78,255,0.35)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
                      >
                        {isUnavailable ? (
                          <span>Unavailable</span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <FiZap className="w-4 h-4 fill-white" />
                            <span>Buy Now</span>
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Wishlist Link & Trust Assurances */}
                    <div className="flex items-center justify-between pt-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleWishlist(product.id)}
                        className="font-bold text-[var(--color-brand)] hover:text-[var(--color-text-main)] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <FiHeart className={`w-3.5 h-3.5 ${isWishlisted ? 'text-red-500 fill-red-500' : ''}`} />
                        <span>{isWishlisted ? 'Saved in Wishlist' : 'Add to Wishlist'}</span>
                      </button>

                      <div className="flex items-center gap-3 text-gray-500 text-[11px]">
                        <span className="flex items-center gap-1">
                          <FiShield className="w-3 h-3 text-emerald-600" />
                          <span>Secure Checkout</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <FiRefreshCw className="w-3 h-3 text-purple-600" />
                          <span>Easy Returns</span>
                        </span>
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
          <div id="product-tabs-section" className="bg-white rounded-3xl p-4 sm:p-6 lg:p-8 border border-[var(--color-border-subtle)] shadow-xs mb-10 scroll-mt-24">
            
            {/* Tab Navigation Header */}
            <div className="flex border-b border-[var(--color-border-subtle)] gap-2 sm:gap-6 overflow-x-auto no-scrollbar mb-6">
              {[
                { id: 'description', label: 'Description' },
                { id: 'specs', label: 'Specifications' },
                { id: 'delivery', label: 'Delivery & Returns' },
                { id: 'offers', label: 'Offers & Coupons' },
                { id: 'reviews', label: `Customer Reviews (${reviewStats.total})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-3 text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap border-b-2 ${
                    activeTab === tab.id
                      ? 'border-[var(--color-brand)] text-[var(--color-brand)]'
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
                  <p className="font-semibold text-[var(--color-text-main)] text-sm sm:text-base leading-snug">
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
                  <div className="divide-y divide-[var(--color-border-subtle)] text-xs sm:text-sm">
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
                <div className="p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] flex items-start gap-3">
                  <FiBox className="w-5 h-5 text-[var(--color-brand)] shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-[var(--color-text-main)] mb-1">Standard Shipping & Delivery</h4>
                    <p className="text-gray-600">
                      Dispatched within 24 hours from verified hubs. Average delivery timeline 2–4 business days across India. Free shipping on all orders above ₹499.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] flex items-start gap-3">
                  <FiDollarSign className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-[var(--color-text-main)] mb-1">Cash on Delivery (COD)</h4>
                    <p className="text-gray-600">
                      {product.cod_available
                        ? 'Cash on Delivery is available for this product across eligible pin codes.'
                        : 'Prepaid payments only for this product (UPI, Credit/Debit cards).'}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border-subtle)] flex items-start gap-3">
                  <FiRefreshCw className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-bold text-[var(--color-text-main)] mb-1">7-Day Return / Replacement Guarantee</h4>
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
                        className="border border-[var(--color-border-subtle)] rounded-2xl p-4 bg-gradient-to-br from-white to-[var(--color-bg-main)] flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-mono font-black text-xs text-[var(--color-text-main)] bg-[var(--color-primary-tint)] px-2.5 py-1 rounded-md">
                              {coupon.code}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              Active
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-[var(--color-text-main)] mb-1">{coupon.name}</h4>
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
                          className="mt-3 w-full py-1.5 rounded-xl border border-[var(--color-border-subtle)] text-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] hover:text-white font-bold text-xs transition-colors cursor-pointer"
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
              <div className="max-w-4xl space-y-8">
                {/* Overall Rating & Breakdown Card */}
                <div className="p-6 sm:p-8 rounded-3xl bg-[var(--color-bg-main)]/50 border border-[var(--color-border-subtle)] shadow-xs">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                    
                    {/* Score & Star Breakdown Column */}
                    <div className="md:col-span-4 text-center md:text-left flex flex-col items-center md:items-start">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-black text-[var(--color-text-main)] tracking-tight">
                          {Number(reviewStats.average) > 0 ? reviewStats.average : '4.8'}
                        </span>
                        <span className="text-base text-gray-400 font-bold">/ 5.0</span>
                      </div>
                      
                      <div className="flex items-center gap-1 text-amber-500 my-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <FiStar
                            key={star}
                            className={`w-5 h-5 ${
                              star <= Math.round(Number(reviewStats.average) || 4.8)
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                      </div>

                      <p className="text-xs text-gray-500 font-medium">
                        Based on {reviewStats.total} verified customer {reviewStats.total === 1 ? 'rating' : 'ratings'}
                      </p>

                      <button
                        type="button"
                        onClick={handleOpenWriteReview}
                        className="mt-4 px-5 py-2.5 bg-[var(--color-brand)] hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <FiEdit3 className="w-4 h-4" />
                        <span>Write a Review</span>
                      </button>
                    </div>

                    {/* Progress Bars Column */}
                    <div className="md:col-span-5 border-t md:border-t-0 md:border-l md:border-r border-[var(--color-border-subtle)] pt-6 md:pt-0 md:px-6 space-y-2 w-full">
                      {[5, 4, 3, 2, 1].map((star) => (
                        <div key={star} className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => setReviewsFilter(reviewsFilter === String(star) ? 'ALL' : String(star))}
                            className={`w-12 text-left font-semibold flex items-center gap-1 hover:text-[var(--color-brand)] cursor-pointer ${
                              reviewsFilter === String(star) ? 'text-[var(--color-brand)] font-bold' : 'text-gray-600'
                            }`}
                          >
                            <span>{star}</span>
                            <FiStar className="w-3 h-3 fill-amber-500 text-amber-500" />
                          </button>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all duration-500"
                              style={{ width: `${reviewStats.percents[star] || 0}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-gray-400 text-[11px] font-mono">
                            {reviewStats.counts[star] || 0}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Guarantee & Trust Badges */}
                    <div className="md:col-span-3 text-xs text-gray-600 space-y-3 pt-2 md:pt-0">
                      <p className="flex items-center gap-2 font-medium">
                        <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>100% verified customer purchase guarantee</span>
                      </p>
                      <p className="flex items-center gap-2 font-medium">
                        <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Quality checked before dispatch</span>
                      </p>
                      <p className="flex items-center gap-2 font-medium">
                        <FiCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Fast delivery across India</span>
                      </p>
                    </div>

                  </div>
                </div>

                {/* Filter and Controls Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--color-border-subtle)] pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-gray-500 mr-1">Filter:</span>
                    {['ALL', '5', '4', '3'].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setReviewsFilter(f)}
                        className={`px-3 py-1 text-xs rounded-full font-bold transition-all cursor-pointer ${
                          reviewsFilter === f
                            ? 'bg-[var(--color-brand)] text-white shadow-xs'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        {f === 'ALL' ? `All (${reviewStats.total})` : `${f} Stars (${reviewStats.counts[Number(f)] || 0})`}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 font-medium">Sort by:</span>
                    <select
                      value={reviewsSort}
                      onChange={(e) => setReviewsSort(e.target.value)}
                      className="bg-white border border-[var(--color-border-subtle)] text-gray-700 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] cursor-pointer"
                    >
                      <option value="LATEST">Most Recent</option>
                      <option value="HIGHEST">Highest Rating</option>
                      <option value="HELPFUL">Most Helpful</option>
                    </select>
                  </div>
                </div>

                {/* Reviews List */}
                {filteredReviews.length > 0 ? (
                  <div className="space-y-4">
                    {filteredReviews.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-5 sm:p-6 rounded-2xl bg-white border border-[var(--color-border-subtle)] hover:border-gray-300 transition-all shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-xs ${getAvatarBg(
                                rev.customer_name
                              )}`}
                            >
                              {getInitials(rev.customer_name)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-sm text-[var(--color-text-main)]">
                                  {rev.customer_name}
                                </span>
                                {rev.is_verified_purchase === 1 && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-full">
                                    <FiCheck className="w-3 h-3 text-emerald-600" />
                                    <span>Verified Buyer</span>
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-gray-400">
                                {formatReviewDate(rev.created_at)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md text-amber-900 font-bold text-xs shrink-0">
                            <FiStar className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                            <span>{rev.rating}.0</span>
                          </div>
                        </div>

                        {rev.title && (
                          <h4 className="font-bold text-sm text-gray-900 mb-1.5 leading-snug">
                            {rev.title}
                          </h4>
                        )}

                        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed whitespace-pre-line mb-4">
                          {rev.comment}
                        </p>

                        <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] pt-3 text-xs text-gray-500">
                          <span className="text-[11px] text-gray-400">
                            Product: <strong className="text-gray-600 font-medium">{product.name}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleHelpfulVote(rev.id)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border transition-all cursor-pointer text-xs ${
                              votedHelpfulIds.includes(rev.id)
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold'
                                : 'bg-gray-50 hover:bg-gray-100 border-[var(--color-border-subtle)] text-gray-600'
                            }`}
                          >
                            <FiThumbsUp className="w-3.5 h-3.5" />
                            <span>
                              Helpful ({rev.helpful_count || 0})
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border border-dashed border-[var(--color-border-subtle)] rounded-2xl bg-white">
                    <FiMessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-gray-700 mb-1">
                      No reviews found for this selection
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                      {reviewsFilter !== 'ALL'
                        ? 'Try clearing the star filter to see all reviews.'
                        : 'Be the first customer to share your thoughts on this product!'}
                    </p>
                    {reviewsFilter !== 'ALL' ? (
                      <button
                        type="button"
                        onClick={() => setReviewsFilter('ALL')}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-xs font-bold rounded-xl cursor-pointer"
                      >
                        Clear Filter
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleOpenWriteReview}
                        className="px-4 py-2 bg-[var(--color-brand)] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                      >
                        Write the First Review
                      </button>
                    )}
                  </div>
                )}
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
            viewAllLink={primaryCategory ? ROUTES.PRODUCTS_BY_CATEGORY(primaryCategory.id) : '/products'}
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
          className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[var(--color-border-subtle)] shadow-2xl py-2.5 px-3 sm:px-6 lg:px-8 xl:px-12 transition-all duration-300"
        >
          <div className="w-full flex items-center justify-between gap-3 sm:gap-6">
            
            {/* Desktop Left: Image + Title + Price */}
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={activeImage}
                alt={product.name}
                className="w-11 h-11 rounded-xl object-cover border border-[var(--color-border-subtle)] shrink-0 hidden sm:block"
              />
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-gray-900 truncate max-w-[140px] sm:max-w-xs md:max-w-md">
                  {product.name}
                </h4>
                <div className="flex items-baseline gap-2">
                  <span className="text-base sm:text-lg font-black text-[var(--color-brand)]">
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
              <div className="hidden md:flex items-center border border-[var(--color-border-subtle)] rounded-xl bg-[var(--color-bg-main)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(-1)}
                  disabled={quantity <= 1 || isOutOfStock}
                  className="w-7 h-7 flex items-center justify-center font-bold text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)] disabled:opacity-30 transition-colors cursor-pointer text-sm"
                >
                  −
                </button>
                <span className="w-8 text-center font-bold text-xs text-[var(--color-text-main)]">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(1)}
                  disabled={isOutOfStock || (stockAvailable > 0 && quantity >= stockAvailable)}
                  className="w-7 h-7 flex items-center justify-center font-bold text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)] disabled:opacity-30 transition-colors cursor-pointer text-sm"
                >
                  +
                </button>
              </div>

              {/* Add to Cart Button */}
              <button
                type="button"
                onClick={() => handleAddToCart()}
                disabled={isOutOfStock || isAddingToCart}
                className="py-2.5 px-3.5 sm:px-5 rounded-xl border-2 border-[var(--color-brand)] text-[var(--color-brand)] hover:bg-[var(--color-bg-alt)] font-bold text-xs sm:text-sm tracking-tight transition-colors cursor-pointer shrink-0 disabled:opacity-40"
              >
                {isAddingToCart ? 'Adding...' : 'Add to Cart'}
              </button>

              {/* Buy Now Button */}
              <button
                type="button"
                onClick={handleBuyNow}
                disabled={isOutOfStock}
                className="py-2.5 px-4 sm:px-6 rounded-xl bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] hover:brightness-105 text-white font-bold text-xs sm:text-sm shadow-md transition-colors cursor-pointer shrink-0 disabled:opacity-40"
              >
                <span className="flex items-center gap-1.5">
                  <FiZap className="w-3.5 h-3.5 fill-white" />
                  <span>Buy Now</span>
                </span>
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
          <div className="flex items-center justify-between text-white w-full px-3 sm:px-6 lg:px-8 xl:px-12">
            <span className="text-xs sm:text-sm font-semibold text-gray-300">
              {product?.name} ({selectedImageIndex + 1} of {imageGallery.length})
            </span>
            <button
              type="button"
              onClick={() => setIsFullscreenOpen(false)}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl font-bold transition-colors cursor-pointer"
            >
              <FiX className="w-5 h-5" />
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
                <FiChevronLeft className="w-6 h-6" />
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
                <FiChevronRight className="w-6 h-6" />
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
                    selectedImageIndex === idx ? 'border-[var(--color-brand)] scale-105' : 'border-transparent opacity-60 hover:opacity-100'
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

      {/* WRITE A REVIEW MODAL */}
      {isWriteReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-[var(--color-border-subtle)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border-subtle)] mb-5">
              <div>
                <h3 className="text-lg font-black text-[var(--color-text-main)]">Write a Customer Review</h3>
                <p className="text-xs text-gray-500">Share your genuine experience with other shoppers</p>
              </div>
              <button
                type="button"
                onClick={() => setIsWriteReviewOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Product Snapshot */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--color-bg-main)]/60 border border-[var(--color-border-subtle)] mb-5">
              <img
                src={activeImage}
                alt={product?.name}
                className="w-12 h-12 object-cover rounded-xl bg-white border border-[var(--color-border-subtle)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--color-text-main)] truncate">{product?.name}</p>
                <p className="text-[11px] text-gray-400">SKU: {product?.product_code || 'N/A'}</p>
              </div>
            </div>

            <form onSubmit={handleSubmitReview} className="space-y-4">
              {/* Star Rating Picker */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Your Overall Rating <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewReviewRating(star)}
                      className="p-1 transition-transform hover:scale-110 cursor-pointer"
                    >
                      <FiStar
                        className={`w-7 h-7 ${
                          star <= newReviewRating
                            ? 'fill-amber-400 text-amber-500 drop-shadow-xs'
                            : 'text-gray-300 hover:text-amber-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 text-xs font-extrabold text-amber-700">
                    {newReviewRating === 5 && '5.0 - Excellent'}
                    {newReviewRating === 4 && '4.0 - Very Good'}
                    {newReviewRating === 3 && '3.0 - Average'}
                    {newReviewRating === 2 && '2.0 - Below Average'}
                    {newReviewRating === 1 && '1.0 - Poor'}
                  </span>
                </div>
              </div>

              {/* Reviewer Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newReviewName}
                  onChange={(e) => setNewReviewName(e.target.value)}
                  placeholder="e.g. Nandini Iyer"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border-subtle)] text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] bg-white"
                />
              </div>

              {/* Headline / Title */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Headline / Title (Optional)
                </label>
                <input
                  type="text"
                  value={newReviewTitle}
                  onChange={(e) => setNewReviewTitle(e.target.value)}
                  placeholder="e.g. Delicious taste and chilled packaging!"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border-subtle)] text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] bg-white"
                />
              </div>

              {/* Comments Body */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Review Comments <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={newReviewComment}
                  onChange={(e) => setNewReviewComment(e.target.value)}
                  placeholder="What did you like or dislike about this item? How was the quality and delivery?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--color-border-subtle)] text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] bg-white leading-relaxed resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsWriteReviewOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[var(--color-border-subtle)] text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2.5 rounded-xl bg-[var(--color-brand)] hover:opacity-95 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FOOTER (Black & White Aesthetic) */}
      <footer className="bg-black text-white pt-12 pb-8 border-t border-zinc-800 mt-16">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                {storeSettings?.logo ? (
                  <img src={resolveImageUrl(storeSettings.logo)} alt={storeSettings.store_name} className="w-9 h-9 rounded-xl object-cover border border-zinc-800" />
                ) : (
                  <span className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white font-black text-lg">
                    {storeSettings?.store_name ? storeSettings.store_name.charAt(0) : 'S'}
                  </span>
                )}
                <span className="text-xl font-extrabold tracking-tight text-white">
                  {storeSettings?.store_name || 'Store'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {storeSettings?.description || 'Your trusted online shopping destination.'}
              </p>
            </div>

            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-3">Shop Categories</h4>
              <ul className="space-y-2 text-xs text-zinc-400">
                {categories.length > 0 ? (
                  categories.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <Link to={ROUTES.PRODUCTS_BY_CATEGORY(c.id)} className="hover:text-white transition-colors">
                        {c.name}
                      </Link>
                    </li>
                  ))
                ) : (
                  <li><Link to={ROUTES.PRODUCTS} className="hover:text-white transition-colors">All Products</Link></li>
                )}
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-3">Customer Service</h4>
              <ul className="space-y-2 text-xs text-zinc-400">
                <li><Link to={ROUTES.POLICY_SHIPPING} className="hover:text-white transition-colors">Shipping & Delivery Policy</Link></li>
                <li><Link to={ROUTES.POLICY_RETURNS} className="hover:text-white transition-colors">Returns & Refunds</Link></li>
                <li><Link to={ROUTES.POLICY_PRIVACY} className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link to={ROUTES.POLICY_TERMS_PAGE} className="hover:text-white transition-colors">Terms and Conditions</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-wider mb-3">Fast & Secure Delivery</h4>
              <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                {deliverySettings?.free_delivery_threshold != null && Number(deliverySettings.free_delivery_threshold) > 0
                  ? `Free shipping on orders above ₹${Number(deliverySettings.free_delivery_threshold).toFixed(0)}.`
                  : deliverySettings?.estimated_delivery_text
                  ? `Express shipping: ${deliverySettings.estimated_delivery_text}.`
                  : 'Fast and reliable shipping across India.'}
              </p>
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <FiLock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SSL Encrypted</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <FiDollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>COD Available</span>
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-400 gap-4">
            <p>© {new Date().getFullYear()} {storeSettings?.copyright_text || `${storeSettings?.store_name || 'Store'}. All rights reserved.`}</p>
            <p className="text-zinc-500">100% Secure Checkout • Express Shipping • Quality Assured</p>
          </div>
        </div>
      </footer>

    </div>
  )
}
