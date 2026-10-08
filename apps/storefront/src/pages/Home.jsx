import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  api,
  fetchStoreSettings,
  fetchDeliverySettings,
  fetchFlashDeal,
  fetchHomeSections,
} from '../lib/api'
import { getCategoryPalette } from '../lib/catalogData'
import Navbar from '../components/Navbar'
import HorizontalProductSection from '../components/HorizontalProductSection'
import PromotionalBannerCarousel from '../components/PromotionalBannerCarousel'
import LowerPromotionalBanners from '../components/LowerPromotionalBanners'
import ReferralModal from '../components/ReferralModal'
import CartDrawer from '../components/CartDrawer'
import CheckoutModal from '../components/CheckoutModal'
import { addToCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist, toggleWishlist } from '../lib/wishlist'

export default function Home() {
  const navigate = useNavigate()

  // Dynamic Store Data State (All from Database via PHP API)
  const [storeSettings, setStoreSettings] = useState(null)
  const [deliverySettings, setDeliverySettings] = useState(null)
  const [flashDeal, setFlashDeal] = useState(null)
  const [banners, setBanners] = useState([])
  const [middleBanners, setMiddleBanners] = useState([])
  const [isBannersLoading, setIsBannersLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [categoryProducts, setCategoryProducts] = useState([])
  const [isLoadingCategory, setIsLoadingCategory] = useState(false)

  // Dynamic Horizontal Product Sections (Limited fetch for performance)
  const [bestSellers, setBestSellers] = useState([])
  const [newArrivals, setNewArrivals] = useState([])
  const [featuredProducts, setFeaturedProducts] = useState([])
  const [flashDeals, setFlashDeals] = useState([])
  const [trendingProducts, setTrendingProducts] = useState([])
  const [isLoadingSections, setIsLoadingSections] = useState(true)

  // Modals & Feedback State
  const [isReferralOpen, setIsReferralOpen] = useState(false)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [wishlistIds, setWishlistIds] = useState(() => getWishlistIds())

  // Dynamic countdown timer based on database end_datetime
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 })

  // Ref to smoothly scroll to filtered product section
  const productsSectionRef = useRef(null)

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
    fetchWishlist().then((items) => setWishlistIds(items.map((i) => i.product_id || i.id)))
    const handleSync = () => setWishlistIds(getWishlistIds())
    window.addEventListener('wishlist-updated', handleSync)
    return () => window.removeEventListener('wishlist-updated', handleSync)
  }, [])

  // 1. Fetch store settings, flash deal, banners, categories & product sections from MySQL
  useEffect(() => {
    async function loadHomeData() {
      setIsBannersLoading(true)
      setIsLoadingSections(true)

      fetchStoreSettings().then((s) => s && setStoreSettings(s))
      fetchDeliverySettings().then((d) => d && setDeliverySettings(d))
      fetchFlashDeal().then((fd) => fd && setFlashDeal(fd.deal || fd))

      try {
        const [catRes, heroBannerRes, middleBannerRes, bsRes, naRes, featRes, dealsRes, trendRes] = await Promise.all([
          api.get('/categories').catch(() => ({ data: { categories: [] } })),
          api.get('/banners?position=HOME_HERO&is_active=1').catch(() => ({ data: { banners: [] } })),
          api.get('/banners?position=HOME_MIDDLE&is_active=1').catch(() => ({ data: { banners: [] } })),
          api.get('/products?section=best_sellers&limit=8').catch(() => ({ data: { items: [] } })),
          api.get('/products?section=new_arrivals&limit=8').catch(() => ({ data: { items: [] } })),
          api.get('/products?section=featured&limit=8').catch(() => ({ data: { items: [] } })),
          api.get('/products?section=deals&limit=8').catch(() => ({ data: { items: [] } })),
          api.get('/products?section=trending&limit=8').catch(() => ({ data: { items: [] } })),
        ])

        const loadedCats = catRes.data?.categories || []
        setCategories(loadedCats)

        if (heroBannerRes.data?.banners) {
          setBanners(heroBannerRes.data.banners.filter((b) => Number(b.is_active) === 1))
        }

        if (middleBannerRes.data?.banners) {
          setMiddleBanners(middleBannerRes.data.banners.filter((b) => Number(b.is_active) === 1))
        }

        const bsItems = bsRes.data?.items || bsRes.data?.data || []
        const naItems = naRes.data?.items || naRes.data?.data || []
        const featItems = featRes.data?.items || featRes.data?.data || []
        const dealsItems = dealsRes.data?.items || dealsRes.data?.data || []
        const trendItems = trendRes.data?.items || trendRes.data?.data || []

        setBestSellers(bsItems)
        setNewArrivals(naItems)
        setFeaturedProducts(featItems)
        setFlashDeals(dealsItems)
        setTrendingProducts(trendItems)
      } catch (err) {
        console.error('Failed to load home sections data from API:', err)
      } finally {
        setIsBannersLoading(false)
        setIsLoadingSections(false)
      }
    }

    loadHomeData()
  }, [])

  // 2. When a category is selected on Home, fetch limited products for that category
  useEffect(() => {
    if (selectedCategory === 'all') {
      setCategoryProducts([])
      return
    }

    const catObj = categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory)
    if (!catObj) return

    setIsLoadingCategory(true)
    api
      .get(`/products?category_id=${catObj.id}&limit=8`)
      .then((res) => {
        setCategoryProducts(res.data?.items || res.data?.data || [])
      })
      .catch(() => {
        setCategoryProducts([])
      })
      .finally(() => {
        setIsLoadingCategory(false)
      })
  }, [selectedCategory, categories])

  // Toast feedback helper
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2500)
  }

  // Handle Category Selection with Smooth Scroll
  const handleSelectCategory = (catSlug) => {
    setSelectedCategory(catSlug)
    setTimeout(() => {
      productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  // Clear Category Filter
  const handleClearCategory = () => {
    setSelectedCategory('all')
  }

  // Handle Banner CTA Click
  const handleBannerAction = (banner) => {
    if (!banner) return

    if (banner.target_type === 'CATEGORY' && banner.target_id) {
      navigate(`/products?category_id=${banner.target_id}`)
      return
    }

    if (banner.target_type === 'PRODUCT' && banner.target_id) {
      navigate(`/product/${banner.target_id}`)
      return
    }

    if (banner.target_type === 'EXTERNAL_URL' && banner.target_url) {
      window.open(banner.target_url, '_blank', 'noopener,noreferrer')
      return
    }

    navigate('/products')
  }

  // Wishlist Heart Toggle (Persisted in MySQL via PHP API)
  const handleToggleWishlist = async (productId, e) => {
    if (e) e.stopPropagation()
    try {
      const added = await toggleWishlist(productId)
      setWishlistIds(getWishlistIds())
      showToast(added ? 'Saved to Wishlist ❤️' : 'Removed from Wishlist')
    } catch {
      showToast('Could not update wishlist')
    }
  }

  // Add to Cart with database-driven cart service
  const handleAddToCart = async (product, e) => {
    if (e) e.stopPropagation()
    try {
      await addToCart(product, 1)
      showToast(`Added "${product.name}" to Cart! 🛍️`)
    } catch {
      showToast(`Added "${product.name}" to Cart! 🛍️`)
    }
  }

  // Active Category Object from DB
  const currentCategoryObj = useMemo(() => {
    if (selectedCategory === 'all') return null
    return categories.find((c) => c.slug === selectedCategory || c.id === selectedCategory)
  }, [selectedCategory, categories])

  return (
    <div className="min-h-screen bg-[#FDFBFD] text-slate-800 font-sans selection:bg-purple-100 selection:text-purple-900 overflow-x-hidden flex flex-col justify-between">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#2E1065] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-purple-500/30 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        {/* ONE Reusable Global Sticky Production Navbar */}
        <Navbar
          onOpenCart={() => setIsCartOpen(true)}
          onOpenReferral={() => setIsReferralOpen(true)}
          categories={categories}
          activeNav="home"
        />

        {/* 1. HERO PROMOTIONAL BANNER CAROUSEL (Real MySQL Data via PHP REST API) */}
        <PromotionalBannerCarousel
          banners={banners}
          isLoading={isBannersLoading}
          autoPlayInterval={5500}
        />

        {/* 2. PROMOTIONAL BANNER STRIP (Continuous Horizontal Auto-Scroll from MySQL via PHP API) */}
        <LowerPromotionalBanners
          banners={middleBanners}
          isLoading={isBannersLoading}
          title="Exclusive Promotional Highlights"
          subtitle="Real-time deals, special combo packs & express delivery offers"
        />

        {/* 3. CATEGORY TILES EXPLORER */}
        <section id="categories-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full mb-1">
                <span>EXPLORE DEPARTMENTS</span>
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-purple-950 tracking-tight">
                Shop by Category
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                Select any department to preview items below, or view the full category catalog
              </p>
            </div>

            {selectedCategory !== 'all' && (
              <button
                type="button"
                onClick={handleClearCategory}
                className="inline-flex items-center gap-1.5 text-xs font-black text-purple-900 bg-purple-100 hover:bg-purple-200 px-4 py-2 rounded-full transition-all cursor-pointer shadow-xs self-start sm:self-auto"
              >
                <span>Filtered: {currentCategoryObj?.name}</span>
                <span className="font-extrabold text-red-600 ml-1">✕ Clear</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 sm:gap-3.5">
            {categories.map((cat, idx) => {
              const isSelected = selectedCategory === cat.slug || selectedCategory === cat.id
              const palette = getCategoryPalette(idx)
              const icon = cat.icon || '✨'

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.slug)}
                  className={`group flex flex-col items-center justify-between p-3 sm:p-4 rounded-2xl border text-center transition-all duration-200 cursor-pointer min-h-[130px] ${
                    isSelected
                      ? 'bg-purple-50 border-2 border-[#6B21A8] shadow-lg scale-102 ring-2 ring-purple-600/30'
                      : `${palette.bg} hover:shadow-md hover:-translate-y-1`
                  }`}
                >
                  <div className={`w-12 h-12 sm:w-13 sm:h-13 rounded-2xl ${palette.iconBg} text-2xl sm:text-3xl flex items-center justify-center mb-2 shadow-xs transition-transform duration-200 group-hover:scale-110`}>
                    {icon}
                  </div>
                  <h3 className="text-xs font-extrabold text-purple-950 line-clamp-2 leading-snug min-h-[30px] flex items-center justify-center">
                    {cat.name}
                  </h3>
                  <span className="text-[10px] font-semibold text-purple-800/60 mt-0.5 opacity-80 group-hover:opacity-100">
                    Collection
                  </span>
                  {isSelected && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-[#6B21A8] ring-2 ring-purple-300" />
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* 3. CATEGORY PREVIEW HORIZONTAL SECTION (When Category is Selected) */}
        <div ref={productsSectionRef}>
          {selectedCategory !== 'all' && currentCategoryObj && (
            <div className="bg-purple-50/40 border-y border-purple-100 py-2 my-4">
              <HorizontalProductSection
                id="category-preview-section"
                badgeText="DEPARTMENT PREVIEW"
                badgeBg="bg-purple-100 text-purple-900"
                title={currentCategoryObj.name}
                subtitle={`Handpicked selections available in ${currentCategoryObj.name}`}
                products={categoryProducts}
                viewAllLink={`/products?category_id=${currentCategoryObj.id}`}
                isLoading={isLoadingCategory}
                wishlistIds={wishlistIds}
                onToggleWishlist={handleToggleWishlist}
                onAddToCart={handleAddToCart}
              />
            </div>
          )}
        </div>

        {/* 4. BEST SELLERS HORIZONTAL SECTION + VIEW ALL */}
        <HorizontalProductSection
          id="bestsellers-section"
          badgeText="⭐ CUSTOMER FAVORITES"
          badgeBg="bg-purple-100 text-purple-900"
          title="Best Sellers"
          subtitle="Top-rated accessories, jewellery & gifts loved by hundreds of shoppers"
          products={bestSellers}
          viewAllLink="/products?section=best_sellers"
          isLoading={isLoadingSections}
          wishlistIds={wishlistIds}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
        />

        {/* 5. NEW ARRIVALS HORIZONTAL SECTION + VIEW ALL */}
        <HorizontalProductSection
          id="new-arrivals-section"
          badgeText="✨ FRESH DROPS"
          badgeBg="bg-pink-100 text-pink-700"
          title="New Arrivals"
          subtitle="Just arrived: Korean accessories, gemstone rollers & luxury organizers"
          products={newArrivals}
          viewAllLink="/products?section=new_arrivals"
          isLoading={isLoadingSections}
          wishlistIds={wishlistIds}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
        />

        {/* 6. FEATURED PRODUCTS HORIZONTAL SECTION + VIEW ALL */}
        <HorizontalProductSection
          id="featured-section"
          badgeText="💎 CURATED SELECTION"
          badgeBg="bg-violet-100 text-violet-800"
          title="Featured Products"
          subtitle="Handpicked selections with exceptional quality and customer ratings"
          products={featuredProducts}
          viewAllLink="/products?section=featured"
          isLoading={isLoadingSections}
          wishlistIds={wishlistIds}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
        />

        {/* 7. FLASH DEALS & SPECIAL DISCOUNTS HORIZONTAL SECTION + VIEW ALL */}
        <HorizontalProductSection
          id="deals-section"
          badgeText="🔥 SPECIAL DISCOUNTS"
          badgeBg="bg-rose-100 text-rose-700"
          title="Flash Deals & Offers"
          subtitle="Save up to 60% on curated accessories and gift hampers"
          products={flashDeals}
          viewAllLink="/products?section=deals"
          isLoading={isLoadingSections}
          wishlistIds={wishlistIds}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
        />

        {/* 8. TRENDING PRODUCTS HORIZONTAL SECTION + VIEW ALL */}
        <HorizontalProductSection
          id="trending-section"
          badgeText="📈 POPULAR THIS WEEK"
          badgeBg="bg-amber-100 text-amber-800"
          title="Trending Products"
          subtitle="Most viewed hair essentials, bags and plush toys right now"
          products={trendingProducts}
          viewAllLink="/products?section=trending"
          isLoading={isLoadingSections}
          wishlistIds={wishlistIds}
          onToggleWishlist={handleToggleWishlist}
          onAddToCart={handleAddToCart}
        />


        {/* 10. CUSTOMER SUPPORT & WHATSAPP */}
        <section id="support-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-purple-50/70 border border-purple-100 rounded-3xl p-6 sm:p-10 flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-purple-800 bg-white px-3 py-1 rounded-full shadow-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span>24/7 CUSTOMER CARE</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-purple-950">
                Need Help with Orders or Custom Gifts?
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                Our customer care team is available on WhatsApp and phone to assist with product inquiries, bulk orders, return requests, and gift customization.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`https://wa.me/${(storeSettings?.whatsapp_number || storeSettings?.phone || '919876501234').replace(/[^0-9]/g, '')}?text=Hi%2C%20I%20have%20an%20inquiry%20regarding%20products`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-green-700/20 active:scale-95 transition-all cursor-pointer"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.353.101.173.448.74 0.961 1.196.662.589 1.22.771 1.393.858.173.086.274.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z" />
                </svg>
                <span>Chat on WhatsApp</span>
              </a>

              {storeSettings?.phone && (
                <a
                  href={`tel:${storeSettings.phone.replace(/[^0-9+]/g, '')}`}
                  className="px-5 py-3 rounded-full bg-white hover:bg-purple-50 border border-purple-200 text-purple-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <span>📞 {storeSettings.phone}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 11. FOOTER */}
      <footer className="bg-[#1E0B36] text-white pt-12 pb-8 border-t border-purple-950 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 pb-10 border-b border-purple-900/60">
            <div className="lg:col-span-2 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] flex items-center justify-center text-white shadow-md">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="8" cy="21" r="1" />
                    <circle cx="19" cy="21" r="1" />
                    <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                  </svg>
                </div>
                <div>
                  <div className="flex items-baseline leading-none">
                    <span className="text-xl font-black text-white">Kirana</span>
                    <span className="text-xl font-black text-[#EC4899]">Bazaar</span>
                  </div>
                  <p className="text-[9px] font-bold text-purple-300 uppercase tracking-widest mt-0.5">
                    Accessories & Gifts Hub
                  </p>
                </div>
              </div>
              <p className="text-xs text-purple-200/80 leading-relaxed max-w-sm">
                Your premier destination for handcrafted accessories, minimalist jewellery, personalized gift hampers, plush toys, and vanity organizers.
              </p>
            </div>

            <div className="space-y-2.5 text-xs text-purple-200/80">
              <h4 className="font-black uppercase tracking-wider text-amber-300 text-[11px]">Collections</h4>
              <ul className="space-y-1.5">
                <li><Link to="/products?section=best_sellers" className="hover:text-white">Best Sellers</Link></li>
                <li><Link to="/products?section=new_arrivals" className="hover:text-white">New Arrivals</Link></li>
                <li><Link to="/products?section=featured" className="hover:text-white">Featured Selections</Link></li>
                <li><Link to="/products?section=deals" className="hover:text-white">Flash Deals</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5 text-xs text-purple-200/80">
              <h4 className="font-black uppercase tracking-wider text-amber-300 text-[11px]">Customer Care</h4>
              <ul className="space-y-1.5">
                <li><Link to="/pages/shipping-policy" className="hover:text-white">Shipping Policy</Link></li>
                <li><Link to="/pages/return-exchange-policy" className="hover:text-white">Returns & Exchange</Link></li>
                <li><Link to="/pages/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link to="/pages/terms-and-conditions" className="hover:text-white">Terms of Service</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5 text-xs text-purple-200/80">
              <h4 className="font-black uppercase tracking-wider text-amber-300 text-[11px]">Get in Touch</h4>
              {storeSettings?.address && <p>📍 {storeSettings.address}</p>}
              {storeSettings?.phone && <p>📞 {storeSettings.phone}</p>}
              {storeSettings?.email && <p>✉️ {storeSettings.email}</p>}
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-purple-300/60 gap-3">
            <p>© {new Date().getFullYear()} KiranaBazaar Hub. All rights reserved.</p>
            <p>100% Secure Checkout • Express Shipping • Quality Assured</p>
          </div>
        </div>
      </footer>

      {/* Cart Drawer, Checkout & Referral Modals */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onProceedToCheckout={() => {
          setIsCartOpen(false)
          setIsCheckoutOpen(true)
        }}
      />

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
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