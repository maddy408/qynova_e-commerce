import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api,
  fetchStoreSettings,
  fetchDeliverySettings,
  fetchFlashDeal,
  fetchHomeSections,
  resolveImageUrl,
} from '../lib/api'
import { ROUTES } from '../routes/routes'
import Navbar from '../components/Navbar'
import GroceryHeroBanner from '../components/GroceryHeroBanner'
import CircularCategoriesRow from '../components/CircularCategoriesRow'
import TopOffersSection from '../components/TopOffersSection'
import TopBrandsSection from '../components/TopBrandsSection'
import LowerPromotionalBanners from '../components/LowerPromotionalBanners'
import DynamicHomeSection from '../components/DynamicHomeSection'
import HorizontalProductSection from '../components/HorizontalProductSection'
import TrustValueBar from '../components/TrustValueBar'
import NewsletterBar from '../components/NewsletterBar'
import GroceryFooter from '../components/GroceryFooter'
import PopupBannerModal from '../components/PopupBannerModal'
import ReferralModal from '../components/ReferralModal'
import CartDrawer from '../components/CartDrawer'
import CheckoutModal from '../components/CheckoutModal'
import { addToCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist, toggleWishlist } from '../lib/wishlist'

export default function Home() {
  const navigate = useNavigate()

  // Dynamic Store Data State (All from Database via PHP API - NO MOCK DATA)
  const [storeSettings, setStoreSettings] = useState(null)
  const [deliverySettings, setDeliverySettings] = useState(null)
  const [flashDeal, setFlashDeal] = useState(null)
  const [banners, setBanners] = useState([])
  const [middleBanners, setMiddleBanners] = useState([])
  const [isBannersLoading, setIsBannersLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [bestSellers, setBestSellers] = useState([])
  const [topBrands, setTopBrands] = useState([])
  const [isTopBrandsLoading, setIsTopBrandsLoading] = useState(true)

  // Dynamic Homepage Sections (All from Database via Home Sections API)
  const [sections, setSections] = useState([])
  const [sectionProductsMap, setSectionProductsMap] = useState({})
  const [isLoadingSections, setIsLoadingSections] = useState(true)
  const [availableOffers, setAvailableOffers] = useState([])
  const [topOffers, setTopOffers] = useState([])
  const [popupBanner, setPopupBanner] = useState(null)
  const [recentlyViewed, setRecentlyViewed] = useState([])

  // Modals & Feedback State
  const [isReferralOpen, setIsReferralOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [checkoutCartData, setCheckoutCartData] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [wishlistIds, setWishlistIds] = useState(() => getWishlistIds())

  // Dynamic countdown timer based on database end_datetime
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })

  // Dynamic countdown calculation based on database flash deal end_datetime
  useEffect(() => {
    if (!flashDeal?.end_datetime) return

    const targetDate = new Date(flashDeal.end_datetime.replace(' ', 'T')).getTime()

    const updateRemaining = () => {
      const now = Date.now()
      const diff = Math.max(0, targetDate - now)
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft({ hours, minutes, seconds })
    }

    updateRemaining()
    const timer = setInterval(updateRemaining, 1000)
    return () => clearInterval(timer)
  }, [flashDeal])

  // Sync wishlist with MySQL database
  useEffect(() => {
    fetchWishlist().then((res) => {
      const ids = res?.productIds || (Array.isArray(res?.items) ? res.items.map((i) => i.product_id || i.id) : (Array.isArray(res) ? res.map((i) => i.product_id || i.id) : []))
      setWishlistIds(ids)
    }).catch(() => {})
    const handleSync = () => setWishlistIds(getWishlistIds())
    window.addEventListener('wishlist-updated', handleSync)
    return () => window.removeEventListener('wishlist-updated', handleSync)
  }, [])

  // 1. Fetch store settings, flash deal, banners, categories & home sections dynamically from MySQL
  useEffect(() => {
    async function loadHomeData() {
      setIsBannersLoading(true)
      setIsLoadingSections(true)

      fetchStoreSettings().then((s) => s && setStoreSettings(s))
      fetchDeliverySettings().then((d) => d && setDeliverySettings(d))
      fetchFlashDeal().then((fd) => fd && setFlashDeal(fd.deal || fd))

      // Fetch Best Sellers dynamically from database
      api.get('/products?section=best_sellers&limit=10')
        .then((res) => {
          const prods = res.data?.items || res.data?.data || []
          if (prods.length > 0) {
            setBestSellers(prods)
          } else {
            api.get('/products?limit=10')
              .then((r) => setBestSellers(r.data?.items || r.data?.data || []))
              .catch(() => {})
          }
        })
        .catch(() => {
          api.get('/products?limit=10')
            .then((r) => setBestSellers(r.data?.items || r.data?.data || []))
            .catch(() => {})
        })

      try {
        const [catRes, heroBannerRes, middleBannerRes, popupBannerRes, sectionsRes, offersRes, topOffersRes, topBrandsRes] = await Promise.all([
          api.get('/categories').catch(() => ({ data: { categories: [] } })),
          api.get('/banners?position=HOME_HERO&is_active=1').catch(() => ({ data: { banners: [] } })),
          api.get('/banners?position=HOME_MIDDLE&is_active=1').catch(() => ({ data: { banners: [] } })),
          api.get('/banners?position=POPUP&is_active=1').catch(() => ({ data: { banners: [] } })),
          fetchHomeSections().catch(() => []),
          api.get('/offers').catch(() => ({ data: { offers: [], coupons: [] } })),
          api.get('/top-offers').catch(() => ({ data: { top_offers: [] } })),
          api.get('/brands/top').catch(() => ({ data: { brands: [] } })),
        ])

        const loadedCats = catRes.data?.categories || []
        setCategories(loadedCats)

        const heroBanners = (heroBannerRes.data?.banners || []).filter((b) => Number(b.is_active) === 1)
        const midBanners = (middleBannerRes.data?.banners || []).filter((b) => Number(b.is_active) === 1)
        const popBanners = (popupBannerRes.data?.banners || []).filter((b) => Number(b.is_active) === 1)

        setBanners(heroBanners)
        setMiddleBanners(midBanners)
        setPopupBanner(popBanners[0] || null)

        const liveOffers = offersRes.data?.offers || []
        const liveCoupons = offersRes.data?.coupons || []
        setAvailableOffers([...liveOffers, ...liveCoupons])
        setTopOffers(topOffersRes.data?.top_offers || [])
        setTopBrands(topBrandsRes.data?.brands || [])

        setIsBannersLoading(false)
        setIsTopBrandsLoading(false)

        const rawSections = Array.isArray(sectionsRes) ? sectionsRes : (sectionsRes?.sections || [])
        const activeSections = rawSections.filter((s) => s.is_active !== 0 && s.is_active !== false)
        setSections(activeSections)

        // Helper to query products for each section based on database configuration
        const getSectionProductsQuery = (section) => {
          const limit = Number(section.item_limit) || 8
          const type = section.type
          const key = section.section_key

          if (type === 'FEATURED' || key === 'featured') {
            return `/products?section=featured&limit=${limit}`
          }
          if (type === 'BEST_SELLERS' || key === 'best_sellers') {
            return `/products?section=best_sellers&limit=${limit}`
          }
          if (type === 'NEW_ARRIVALS' || key === 'new_arrivals') {
            return `/products?section=new_arrivals&limit=${limit}`
          }
          if (type === 'DEALS' || key === 'deals' || key === 'flash_deals') {
            return `/products?section=deals&limit=${limit}`
          }
          if (type === 'COMBOS' || key === 'combos' || key === 'combo_offers') {
            return `/products?category_slug=combo-offers&limit=${limit}`
          }
          if (type === 'POPULAR_SALE' || key === 'popular_sale' || key === 'popular') {
            return `/products?section=popular_sale&limit=${limit}`
          }
          if (type === 'CUSTOM') {
            return `/products?section=${encodeURIComponent(key || 'trending')}&limit=${limit}`
          }
          return null
        }

        // Fetch recently viewed products from API
        let sessId = ''
        try { sessId = localStorage.getItem('customer_session_id') || '' } catch {}
        api.get(`/products/recently-viewed?limit=8${sessId ? `&session_id=${sessId}` : ''}`)
          .then((res) => {
            if (res.data?.items) setRecentlyViewed(res.data.items)
          })
          .catch(() => {})

        // Fetch products only for active product sections
        const productFetches = activeSections
          .filter((s) => s.type !== 'BANNER' && s.type !== 'CATEGORIES')
          .map(async (section) => {
            const query = getSectionProductsQuery(section)
            if (!query) return { id: section.id, products: [] }
            try {
              const res = await api.get(query)
              const items = res.data?.items || res.data?.data || []
              return { id: section.id, products: items }
            } catch (err) {
              console.error(`Failed to load products for section ${section.id}:`, err)
              return { id: section.id, products: [] }
            }
          })

        const fetchedProductResults = await Promise.all(productFetches)
        const productsMap = {}
        for (const item of fetchedProductResults) {
          productsMap[item.id] = item.products
        }
        setSectionProductsMap(productsMap)
      } catch (err) {
        console.error('Failed to load homepage data from API:', err)
      } finally {
        setIsBannersLoading(false)
        setIsLoadingSections(false)
      }
    }

    loadHomeData()

    // Listen for cross-tab or focus revalidation when Admin updates sections/banners/settings
    const handleRevalidate = () => loadHomeData()
    window.addEventListener('storefront-revalidate', handleRevalidate)

    return () => {
      window.removeEventListener('storefront-revalidate', handleRevalidate)
    }
  }, [])

  // Toast feedback helper
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2500)
  }

  // Wishlist Heart Toggle (Persisted in MySQL via PHP API)
  const handleToggleWishlist = async (productId, e) => {
    if (e) e.stopPropagation()
    try {
      const added = await toggleWishlist(productId)
      setWishlistIds(getWishlistIds())
      showToast(added ? 'Saved to Wishlist' : 'Removed from Wishlist')
    } catch {
      showToast('Could not update wishlist')
    }
  }

  // Add to Cart with database-driven cart service
  const handleAddToCart = async (product, e) => {
    if (e) e.stopPropagation()
    try {
      await addToCart(product, 1)
      showToast(`Added "${product.name}" to Cart!`)
    } catch {
      showToast('Could not add item to cart. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans selection:bg-[#ede9fe] selection:text-[#6d28d9] flex flex-col justify-between w-full">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-black text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-[#7c3aed]/40 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="w-full">
        {/* 1. GLOBAL STICKY PRODUCTION NAVBAR */}
        <Navbar
          onOpenCart={() => setIsCartOpen(true)}
          onOpenReferral={() => setIsReferralOpen(true)}
          categories={categories}
          activeNav="home"
        />

        {/* 2. GROCERY HERO BANNER (KiranaBazaar Reference Design with Fresh Veg Basket) */}
        <GroceryHeroBanner
          storeSettings={storeSettings}
          deliverySettings={deliverySettings}
          banners={banners}
          isLoading={isBannersLoading}
        />

        {/* 3. VALUE PROPOSITION BAR (Directly below Hero Banner: Free Delivery, Fresh & Quality, Secure Payments, 24/7 Support, Great Offers) */}
        <TrustValueBar deliverySettings={deliverySettings} />

        {/* 4. TOP OFFERS FOR YOU (4 Pastel Promo Cards from Reference Image) */}
        <TopOffersSection
          topOffers={topOffers}
          deliverySettings={deliverySettings}
          activeOffers={availableOffers}
          isLoading={isBannersLoading}
        />

        {/* 5. BEST SELLING PRODUCTS (Crown Header, Compact JioMart Cards, View All Link) */}
        <HorizontalProductSection
          id="best-sellers-section"
          icon="👑"
          title="Best Selling Products"
          subtitle="Top rated groceries and customer favourites."
          products={bestSellers}
          viewAllLink="/products?section=best_sellers"
          isLoading={isLoadingSections}
          wishlistIds={wishlistIds}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
        />

        {/* 6. CIRCULAR CATEGORIES ROW ("Shop by Category" Round Avatars) */}
        <CircularCategoriesRow
          categories={categories}
          isLoading={isBannersLoading}
        />

        {/* 7. MOST LOVED BRANDS (Top Brands from Database via PHP API) */}
        <TopBrandsSection
          brands={topBrands}
          isLoading={isTopBrandsLoading}
          title="Most Loved Brands"
          subtitle="Top verified brands with exclusive offers and daily savings"
        />

        {/* 8. DYNAMIC DATABASE-DRIVEN HOME SECTIONS (Configured in MySQL home_sections) */}
        {sections
          .filter((section) => (section.type !== 'BEST_SELLERS' && section.section_key !== 'best_sellers') || !bestSellers.length)
          .map((section) => (
            <DynamicHomeSection
              key={section.id}
              section={section}
              products={sectionProductsMap[section.id] || []}
              isLoading={isLoadingSections}
              categories={categories}
              middleBanners={middleBanners}
              isBannersLoading={isBannersLoading}
              wishlistIds={wishlistIds}
              onToggleWishlist={handleToggleWishlist}
              onAddToCart={handleAddToCart}
            />
          ))}

        {/* Standalone middle banners when no existing home section of type BANNER handles them */}
        {!sections.some((s) => s.type === 'BANNER') &&
          (middleBanners.length > 0 || isBannersLoading) && (
            <LowerPromotionalBanners
              banners={middleBanners}
              isLoading={isBannersLoading}
            />
          )}

        {/* 9. POPUP BANNER MODAL (Real MySQL Data via PHP REST API) */}
        {popupBanner && <PopupBannerModal banner={popupBanner} />}

        {/* 10. RECENTLY VIEWED PRODUCTS */}
        {recentlyViewed.length > 0 && (
          <HorizontalProductSection
            id="recently-viewed-section"
            title="Recently Viewed Products"
            subtitle="Products you browsed during recent visits"
            products={recentlyViewed}
            viewAllLink="/products"
            isLoading={isLoadingSections}
            wishlistIds={wishlistIds}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
          />
        )}

        {/* 11. NEWSLETTER / STAY UPDATED BAR */}
        <NewsletterBar />
      </div>

      {/* 11. FOOTER (Full width modern grocery store footer) */}
      <GroceryFooter
        storeSettings={storeSettings}
        categories={categories}
      />

      {/* Cart Drawer, Checkout & Referral Modals */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onProceedToCheckout={(cartData) => {
          setCheckoutCartData(cartData)
          setIsCartOpen(false)
          setIsCheckoutOpen(true)
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cartData={checkoutCartData}
      />

      {isReferralOpen && (
        <ReferralModal
          isOpen={isReferralOpen}
          onClose={() => setIsReferralOpen(false)}
        />
      )}

    </div>
  )
}