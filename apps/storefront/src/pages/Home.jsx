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
import { getCategoryPalette } from '../lib/catalogData'
import Navbar from '../components/Navbar'
import PromotionalBannerCarousel from '../components/PromotionalBannerCarousel'
import LowerPromotionalBanners from '../components/LowerPromotionalBanners'
import DynamicHomeSection from '../components/DynamicHomeSection'
import PopupBannerModal from '../components/PopupBannerModal'
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

  // Dynamic Homepage Sections (All from Database via Home Sections API)
  const [sections, setSections] = useState([])
  const [sectionProductsMap, setSectionProductsMap] = useState({})
  const [isLoadingSections, setIsLoadingSections] = useState(true)
  const [popupBanner, setPopupBanner] = useState(null)

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
    fetchWishlist().then((items) => setWishlistIds(items.map((i) => i.product_id || i.id)))
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

      try {
        const [catRes, heroBannerRes, middleBannerRes, popupBannerRes, sectionsRes] = await Promise.all([
          api.get('/categories').catch(() => ({ data: { categories: [] } })),
          api.get('/banners?position=HOME_HERO&is_active=1').catch(() => ({ data: { banners: [] } })),
          api.get('/banners?position=HOME_MIDDLE&is_active=1').catch(() => ({ data: { banners: [] } })),
          api.get('/banners?position=POPUP&is_active=1').catch(() => ({ data: { banners: [] } })),
          fetchHomeSections().catch(() => []),
        ])

        const loadedCats = catRes.data?.categories || []
        setCategories(loadedCats)

        const heroBanners = (heroBannerRes.data?.banners || []).filter((b) => Number(b.is_active) === 1)
        const midBanners = (middleBannerRes.data?.banners || []).filter((b) => Number(b.is_active) === 1)
        const popBanners = (popupBannerRes.data?.banners || []).filter((b) => Number(b.is_active) === 1)

        setBanners(heroBanners)
        setMiddleBanners(midBanners)
        setPopupBanner(popBanners[0] || null)
        setIsBannersLoading(false)

        const rawSections = Array.isArray(sectionsRes) ? sectionsRes : (sectionsRes?.sections || [])
        const activeSections = rawSections.filter((s) => s.is_active !== 0 && s.is_active !== false)
        setSections(activeSections)

        // Helper to query products for each section based on database configuration
        const getSectionProductsQuery = (section) => {
          const limit = Number(section.item_limit) || 8
          const type = section.type
          const key = section.section_key

          if (type === 'BEST_SELLERS' || key === 'best_sellers') {
            return `/products?section=best_sellers&limit=${limit}`
          }
          if (type === 'NEW_ARRIVALS' || key === 'new_arrivals') {
            return `/products?section=new_arrivals&limit=${limit}`
          }
          if (type === 'FEATURED' || key === 'featured') {
            return `/products?section=featured&limit=${limit}`
          }
          if (type === 'DEALS' || key === 'deals' || key === 'flash_deals') {
            return `/products?section=deals&limit=${limit}`
          }
          if (type === 'COMBOS' || key === 'combos' || key === 'combo_offers') {
            return `/products?category_slug=combo-offers&limit=${limit}`
          }
          if (type === 'CUSTOM') {
            return `/products?section=${encodeURIComponent(key || 'trending')}&limit=${limit}`
          }
          return null
        }

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
      showToast('Could not add item to cart. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-[#F8F3F6] text-[#2D252B] font-sans selection:bg-[#F2DDE9] selection:text-[#601D49] overflow-x-hidden flex flex-col justify-between">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#2D252B] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-[#601D49]/30 animate-bounce">
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
          storeSettings={storeSettings}
        />

        {/* 2. DYNAMIC DATABASE-DRIVEN HOME SECTIONS */}
        {sections.map((section, index) => (
          <React.Fragment key={section.id}>
            <DynamicHomeSection
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
            {/* If no BANNER section was explicitly configured in home_sections, place middle banners midway between sections */}
            {!sections.some((s) => s.type === 'BANNER') &&
              middleBanners.length > 0 &&
              index === Math.min(1, sections.length - 1) && (
                <LowerPromotionalBanners
                  banners={middleBanners}
                  isLoading={isBannersLoading}
                />
              )}
          </React.Fragment>
        ))}

        {/* Fallback if no sections are active in database but middle banners exist */}
        {!sections.some((s) => s.type === 'BANNER') && sections.length === 0 && middleBanners.length > 0 && (
          <LowerPromotionalBanners
            banners={middleBanners}
            isLoading={isBannersLoading}
          />
        )}

        {/* Loading Skeletons when sections are loading */}
        {isLoadingSections && sections.length === 0 && (
          <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 space-y-8">
            {[1, 2].map((idx) => (
              <div key={idx} className="space-y-4">
                <div className="h-6 w-48 bg-[#F2DDE9]/60 rounded-lg animate-pulse" />
                <div className="flex gap-4 overflow-hidden py-2">
                  {[1, 2, 3, 4].map((c) => (
                    <div
                      key={c}
                      className="w-[calc(50%-8px)] min-w-[155px] sm:w-[210px] md:w-[220px] lg:w-[230px] shrink-0 bg-white rounded-2xl p-3 border border-[#E8E0E5] animate-pulse h-64 space-y-3"
                    >
                      <div className="bg-[#F2DDE9]/60 aspect-square rounded-xl w-full" />
                      <div className="h-3 bg-[#F2DDE9]/70 rounded w-2/3" />
                      <div className="h-4 bg-[#F2DDE9]/70 rounded w-1/2" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 4. POPUP BANNER MODAL (Real MySQL Data via PHP REST API) */}
        {popupBanner && <PopupBannerModal banner={popupBanner} />}


        {/* 10. CUSTOMER SUPPORT & WHATSAPP */}
        <section id="support-section" className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-8">
          <div className="bg-white border border-[#E8E0E5] rounded-3xl p-6 sm:p-10 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 text-xs font-bold text-[#601D49] bg-[#F2DDE9] px-3 py-1 rounded-full shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>24/7 CUSTOMER CARE</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-[#2D252B]">
                Need Help with Orders or Custom Gifts?
              </h3>
              <p className="text-xs sm:text-sm text-[#6B5E68] leading-relaxed">
                Our customer care team is available on WhatsApp and phone to assist with product inquiries, bulk orders, return requests, and gift customization.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(storeSettings?.whatsapp_number || storeSettings?.phone) && (
                <a
                  href={`https://wa.me/${(storeSettings.whatsapp_number || storeSettings.phone).replace(/[^0-9]/g, '')}?text=Hi%2C%20I%20have%20an%20inquiry%20regarding%20products`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-full bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-green-700/15 active:scale-95 transition-all cursor-pointer"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-.575-.187-.988-.365-1.739-.751-2.874-2.502-2.961-2.617-.087-.116-.708-.94-.708-1.793s.448-1.273.607-1.446c.159-.173.346-.217.462-.217l.332.006c.106.005.249-.04.39.298.144.347.491 1.2.534 1.287.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.26.304c-.087.086-.177.18-.076.353.101.173.448.74 0.961 1.196.662.589 1.22.771 1.393.858.173.086.274.072.376-.044.101-.116.433-.506.549-.68.116-.173.231-.145.39-.087s1.011.477 1.184.564.289.13.332.202c.043.073.043.419-.101.824z" />
                  </svg>
                  <span>Chat on WhatsApp</span>
                </a>
              )}

              {storeSettings?.phone && (
                <a
                  href={`tel:${storeSettings.phone.replace(/[^0-9+]/g, '')}`}
                  className="px-5 py-3 rounded-full bg-[#F8F3F6] hover:bg-[#F2DDE9] border border-[#E8E0E5] text-[#2D252B] font-bold text-xs sm:text-sm flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <span>📞 {storeSettings.phone}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 11. FOOTER (Burgundy & White Aesthetic) */}
      <footer className="bg-white text-[#2D252B] pt-12 pb-8 border-t border-[#E8E0E5] mt-12">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 pb-10 border-b border-[#E8E0E5]">
            <div className="lg:col-span-2 space-y-3.5">
              <div className="flex items-center gap-2.5">
                {storeSettings?.logo ? (
                  <img src={resolveImageUrl(storeSettings.logo)} alt={storeSettings.store_name} className="w-9 h-9 rounded-xl object-cover shadow-md" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-[#601D49] flex items-center justify-center text-white shadow-md font-black text-sm">
                    {storeSettings?.store_name ? storeSettings.store_name.charAt(0) : 'S'}
                  </div>
                )}
                <div>
                  <div className="flex items-baseline leading-none">
                    <span className="text-xl font-black text-[#601D49]">{storeSettings?.store_name || 'Store'}</span>
                  </div>
                  {storeSettings?.tagline && (
                    <p className="text-[9px] font-bold text-[#6B5E68] uppercase tracking-widest mt-0.5">
                      {storeSettings.tagline}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs text-[#6B5E68] leading-relaxed max-w-sm">
                {storeSettings?.description || 'Your trusted online shopping destination.'}
              </p>
            </div>

            <div className="space-y-2.5 text-xs text-[#6B5E68]">
              <h4 className="font-black uppercase tracking-wider text-[#2D252B] text-[11px]">Collections</h4>
              <ul className="space-y-1.5">
                <li><Link to="/products?section=best_sellers" className="hover:text-[#601D49] transition-colors">Best Sellers</Link></li>
                <li><Link to="/products?section=new_arrivals" className="hover:text-[#601D49] transition-colors">New Arrivals</Link></li>
                <li><Link to="/products?section=featured" className="hover:text-[#601D49] transition-colors">Featured Selections</Link></li>
                <li><Link to="/products?section=deals" className="hover:text-[#601D49] transition-colors">Flash Deals</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5 text-xs text-[#6B5E68]">
              <h4 className="font-black uppercase tracking-wider text-[#2D252B] text-[11px]">Customer Care</h4>
              <ul className="space-y-1.5">
                <li><Link to="/pages/shipping-policy" className="hover:text-[#601D49] transition-colors">Shipping Policy</Link></li>
                <li><Link to="/pages/return-exchange-policy" className="hover:text-[#601D49] transition-colors">Returns & Exchange</Link></li>
                <li><Link to="/pages/privacy-policy" className="hover:text-[#601D49] transition-colors">Privacy Policy</Link></li>
                <li><Link to="/pages/terms-and-conditions" className="hover:text-[#601D49] transition-colors">Terms of Service</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5 text-xs text-[#6B5E68]">
              <h4 className="font-black uppercase tracking-wider text-[#2D252B] text-[11px]">Get in Touch</h4>
              {storeSettings?.address && <p>📍 {storeSettings.address}</p>}
              {storeSettings?.phone && <p>📞 {storeSettings.phone}</p>}
              {storeSettings?.email && <p>✉️ {storeSettings.email}</p>}
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#6B5E68] gap-3">
            <p>© {new Date().getFullYear()} {storeSettings?.copyright_text || `${storeSettings?.store_name || 'Store'}. All rights reserved.`}</p>
            <p>100% Secure Checkout • Express Shipping • Quality Assured</p>
          </div>
        </div>
      </footer>

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