import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate, useParams } from 'react-router-dom'
import { FiShoppingBag, FiPhone, FiMail } from 'react-icons/fi'
import { api, fetchStoreSettings, fetchDeliverySettings, resolveImageUrl } from '../lib/api'
import Navbar from '../components/Navbar'
import ProductCard from '../components/ProductCard'
import CategoryBanner from '../components/CategoryBanner'
import FilterSidebar, { MobileFilterButton } from '../components/FilterSidebar'
import CartDrawer from '../components/CartDrawer'
import CheckoutModal from '../components/CheckoutModal'
import ReferralModal from '../components/ReferralModal'
import { addToCart, getCartCount, fetchCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist, toggleWishlist } from '../lib/wishlist'
import { ROUTES } from '../routes/routes'
import { usePageTitle, categoryPath } from '../lib/seo'
import GroceryFooter from '../components/GroceryFooter'

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // URL query state
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const sectionParam = searchParams.get('section') || ''
  // SEO landing URLs /category/:categorySlug(/:subcategorySlug) resolve to ids once the lists load.
  const { categorySlug = '', subcategorySlug = '' } = useParams()
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const slugCategory = categorySlug ? categories.find((c) => c.slug === categorySlug) : null
  const slugSubcategory = subcategorySlug ? subcategories.find((s) => s.slug === subcategorySlug) : null
  const slugPending = (categorySlug && !slugCategory && categories.length === 0) || (subcategorySlug && !slugSubcategory && subcategories.length === 0)
  const offerIdParam = searchParams.get('offer_id') || searchParams.get('top_offer_id') || ''
  const categoryIdParam = searchParams.get('category_id') || (slugCategory ? String(slugCategory.id) : '')
  const subcategoryIdParam = searchParams.get('subcategory_id') || (slugSubcategory ? String(slugSubcategory.id) : '')
  const brandIdParam = searchParams.get('brand_id') || ''
  const sortParam = searchParams.get('sort') || 'newest'
  const searchParam = searchParams.get('search') || ''
  const isWishlistParam = searchParams.get('wishlist') === '1' || location.pathname === '/wishlist'
  const minPriceParam = searchParams.get('min_price') || ''
  const maxPriceParam = searchParams.get('max_price') || ''
  const ratingMinParam = searchParams.get('rating_min') || ''
  const discountMinParam = searchParams.get('discount_min') || ''
  const inStockParam = searchParams.get('in_stock') || ''
  const offerFacetParam = searchParams.get('offer') || ''
  const newArrivalParam = searchParams.get('new_arrival') || ''
  const countryParam = searchParams.get('country_of_origin') || ''
  // attr_<Name>=v1,v2 / spec_<Name>=v1,v2 — a flat URL-param convention
  // (URLSearchParams doesn't do PHP-style attr[Name]=... brackets
  // cleanly); converted to the backend's attr[...]/spec[...] shape only
  // when building the actual API request below.
  const attrParamsKey = Array.from(searchParams.entries())
    .filter(([k]) => k.startsWith('attr_') || k.startsWith('spec_'))
    .map(([k, v]) => `${k}=${v}`)
    .join('&')

  // Data states from DB
  const [products, setProducts] = useState([])
  const [facets, setFacets] = useState(null)
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false)
  const [currentOffer, setCurrentOffer] = useState(null)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [brands, setBrands] = useState([])
  const [categoryBanners, setCategoryBanners] = useState([])
  const [storeSettings, setStoreSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Modals & local state
  const [isCartOpen, setIsCartOpen] = useState(() => location.pathname === '/cart')
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [checkoutCartData, setCheckoutCartData] = useState(null)
  const [isReferralOpen, setIsReferralOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [wishlistIds, setWishlistIds] = useState(() => getWishlistIds())

  // Toast feedback helper
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 2500)
  }

  // Sync wishlist from MySQL
  useEffect(() => {
    fetchWishlist().then((items) => setWishlistIds(items.map((i) => i.product_id || i.id)))
    const handleSync = () => setWishlistIds(getWishlistIds())
    window.addEventListener('wishlist-updated', handleSync)
    return () => window.removeEventListener('wishlist-updated', handleSync)
  }, [])

  useEffect(() => {
    if (location.pathname === '/cart') {
      setIsCartOpen(true)
    }
  }, [location.pathname])

  // Fetch store settings, categories, subcategories, brands & category banners from DB
  useEffect(() => {
    let mounted = true

    const loadShopStaticData = (force = false) => {
      fetchStoreSettings(force).then((s) => mounted && s && setStoreSettings(s))
      api
        .get('/categories')
        .then((res) => {
          if (mounted && res.data?.categories) {
            setCategories(res.data.categories)
          }
        })
        .catch(() => {})

      api
        .get('/subcategories')
        .then((res) => {
          if (mounted && res.data?.subcategories) {
            setSubcategories(res.data.subcategories)
          }
        })
        .catch(() => {})

      api
        .get('/brands')
        .then((res) => {
          if (mounted && res.data?.brands) {
            setBrands(res.data.brands)
          }
        })
        .catch(() => {})

      api
        .get('/banners?is_active=1')
        .then((res) => {
          if (mounted && res.data?.banners) {
            setCategoryBanners(res.data.banners.filter((b) => Number(b.is_active) === 1))
          }
        })
        .catch(() => {})
    }

    loadShopStaticData()

    const handleRevalidate = () => loadShopStaticData(true)
    window.addEventListener('storefront-revalidate', handleRevalidate)

    return () => {
      mounted = false
      window.removeEventListener('storefront-revalidate', handleRevalidate)
    }
  }, [])

  // Fetch current offer details if offerIdParam is present
  useEffect(() => {
    if (!offerIdParam) {
      setCurrentOffer(null)
      return
    }
    let isCurrent = true
    api
      .get(`/top-offers/${offerIdParam}`)
      .then((res) => {
        if (isCurrent) {
          const found = res.data?.top_offer || res.data?.offer || null
          setCurrentOffer(found)
        }
      })
      .catch(() => {
        if (isCurrent) setCurrentOffer(null)
      })
    return () => {
      isCurrent = false
    }
  }, [offerIdParam])

  // SERVER-SIDE PAGINATION: Fetch products directly from MySQL + PHP API whenever filters change
  useEffect(() => {
    async function fetchServerProducts() {
      if (slugPending) return // wait until /category/<slug> is resolved to an id
      setIsLoading(true)

      // Build query string for /api/products
      const params = new URLSearchParams()
      params.set('page', String(pageParam))
      params.set('limit', '12') // 12 cards per page for 2/3/4-col responsive layout
      params.set('channel', 'ecommerce')
      params.set('is_active', '1')

      if (offerIdParam) params.set('offer_id', offerIdParam)
      if (sectionParam) params.set('section', sectionParam)
      if (categoryIdParam) params.set('category_id', categoryIdParam)
      if (subcategoryIdParam) params.set('subcategory_id', subcategoryIdParam)
      if (brandIdParam) params.set('brand_id', brandIdParam)
      if (sortParam) params.set('sort', sortParam)
      if (searchParam) params.set('search', searchParam)
      if (minPriceParam) params.set('min_price', minPriceParam)
      if (maxPriceParam) params.set('max_price', maxPriceParam)
      if (ratingMinParam) params.set('rating_min', ratingMinParam)
      if (discountMinParam) params.set('discount_min', discountMinParam)
      if (inStockParam) params.set('in_stock', inStockParam)
      if (offerFacetParam) params.set('offer', offerFacetParam)
      if (newArrivalParam) params.set('new_arrival', newArrivalParam)
      if (countryParam) params.set('country_of_origin', countryParam)
      params.set('include_facets', '1')
      // attr_Color=Red,Blue (URL) -> attr[Color]=Red,Blue (API) — PHP
      // parses the bracket form into $_GET['attr']['Color'] natively.
      for (const [key, value] of searchParams.entries()) {
        if (key.startsWith('attr_') && value) params.set(`attr[${key.slice(5)}]`, value)
        if (key.startsWith('spec_') && value) params.set(`spec[${key.slice(5)}]`, value)
      }

      try {
        const res = await api.get(`/products?${params.toString()}`)
        const items = res.data?.items || res.data?.data || []
        setFacets(res.data?.facets || null)
        const pag = res.data?.pagination || {
          page: res.data?.page || pageParam,
          limit: res.data?.limit || 12,
          total: res.data?.total || items.length,
          totalPages: Math.ceil((res.data?.total || items.length) / 12) || 1,
          hasNextPage: pageParam < Math.ceil((res.data?.total || items.length) / 12),
          hasPreviousPage: pageParam > 1,
        }

        // If filtering by client wishlist
        if (isWishlistParam) {
          const filtered = items.filter((p) => wishlistIds.includes(p.id))
          setProducts(filtered)
          setPagination({
            ...pag,
            total: filtered.length,
            totalPages: Math.ceil(filtered.length / 12) || 1,
          })
        } else {
          setProducts(items)
          setPagination(pag)
        }
      } catch (err) {
        console.error('Failed to load server products:', err)
        if (searchParam) {
          try {
            params.delete('search')
            const fallbackRes = await api.get(`/products?${params.toString()}`)
            const allItems = fallbackRes.data?.items || fallbackRes.data?.data || []
            const q = searchParam.toLowerCase().trim()
            const filtered = allItems.filter(
              (p) =>
                (p.name && p.name.toLowerCase().includes(q)) ||
                (p.short_description && p.short_description.toLowerCase().includes(q)) ||
                (p.product_code && p.product_code.toLowerCase().includes(q)) ||
                (p.brand_name && p.brand_name.toLowerCase().includes(q))
            )
            setProducts(filtered)
            setPagination({
              page: 1,
              limit: 12,
              total: filtered.length,
              totalPages: Math.ceil(filtered.length / 12) || 1,
              hasNextPage: false,
              hasPreviousPage: false,
            })
          } catch (e2) {
            console.error('Fallback search failed:', e2)
            setProducts([])
          }
        } else {
          setProducts([])
        }
      } finally {
        setIsLoading(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }

    fetchServerProducts()
  }, [
    pageParam,
    sectionParam,
    offerIdParam,
    categoryIdParam,
    subcategoryIdParam,
    brandIdParam,
    sortParam,
    searchParam,
    isWishlistParam,
    minPriceParam,
    maxPriceParam,
    ratingMinParam,
    discountMinParam,
    inStockParam,
    offerFacetParam,
    newArrivalParam,
    countryParam,
    attrParamsKey,
    slugPending,
  ])

  // Filter handlers updating URL
  const handlePageChange = (newPage) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', String(newPage))
    setSearchParams(next)
  }

  const handleCategoryChange = (catId) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', '1')
    next.delete('subcategory_id')
    next.delete('category_id')
    const cat = catId ? categories.find((c) => String(c.id) === String(catId)) : null
    const rest = next.toString()
    if (cat?.slug) {
      // go to the category's SEO landing URL
      navigate(`${categoryPath(cat)}${rest ? `?${rest}` : ''}`)
      return
    }
    if (catId) next.set('category_id', String(catId))
    if (categorySlug) {
      navigate(`${ROUTES.PRODUCTS}?${next.toString()}`)
      return
    }
    setSearchParams(next)
  }

  const handleSubcategoryChange = (subcatId) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', '1')
    next.delete('subcategory_id')
    const sub = subcatId ? subcategories.find((s) => String(s.id) === String(subcatId)) : null
    if (categorySlug && slugCategory) {
      // stay on the SEO URLs: /category/<cat>/<sub> or back to /category/<cat>
      next.delete('category_id')
      const rest = next.toString()
      if (!subcatId || sub?.slug) {
        navigate(`${categoryPath(slugCategory, sub?.slug ? sub : null)}${rest ? `?${rest}` : ''}`)
        return
      }
    }
    if (subcatId) next.set('subcategory_id', String(subcatId))
    setSearchParams(next)
  }

  const handleBrandChange = (bId) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', '1')
    if (bId) {
      next.set('brand_id', String(bId))
    } else {
      next.delete('brand_id')
    }
    setSearchParams(next)
  }

  const handleSortChange = (newSort) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', '1')
    next.set('sort', newSort)
    setSearchParams(next)
  }

  // Generic URL-param mutator for the filter sidebar — every sidebar
  // control resets to page 1, same as every other filter change here.
  const handleFilterParamsChange = (mutate) => {
    const next = new URLSearchParams(searchParams)
    mutate(next)
    next.set('page', '1')
    setSearchParams(next)
  }

  const handleClearFilters = () => {
    if (categorySlug) {
      navigate(ROUTES.PRODUCTS)
      return
    }
    setSearchParams(new URLSearchParams())
  }

  // Wishlist handler (Persisted in MySQL)
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

  // Add to cart handler (Persisted in MySQL)
  const handleAddToCart = async (product, e) => {
    if (e) e.stopPropagation()
    try {
      await addToCart(product, 1)
      showToast(`Added "${product.name}" to Cart!`)
    } catch {
      showToast('Could not add item to cart. Please try again.')
    }
  }

  // Derive dynamic page title from server filters
  const currentCategoryObj = useMemo(() => {
    if (!categoryIdParam) return null
    return categories.find((c) => String(c.id) === String(categoryIdParam))
  }, [categoryIdParam, categories])

  const currentSubcategoryObj = useMemo(() => {
    if (!subcategoryIdParam) return null
    return subcategories.find((s) => String(s.id) === String(subcategoryIdParam))
  }, [subcategoryIdParam, subcategories])

  const currentBrandObj = useMemo(() => {
    if (!brandIdParam) return null
    return brands.find((b) => String(b.id) === String(brandIdParam))
  }, [brandIdParam, brands])

  const relevantSubcategories = useMemo(() => {
    if (!categoryIdParam) return subcategories
    return subcategories.filter((s) => s.category_ids?.includes(Number(categoryIdParam)))
  }, [categoryIdParam, subcategories])

  const pageTitle = useMemo(() => {
    if (isWishlistParam) return 'My Saved Wishlist'
    if (searchParam) return `Search Results for "${searchParam}"`
    if (currentOffer) return `Offers Products: ${currentOffer.title}`
    if (offerIdParam) return 'Offers Products'
    if (currentBrandObj && currentCategoryObj) return `${currentBrandObj.name} — ${currentCategoryObj.name}`
    if (currentBrandObj) return `Brand: ${currentBrandObj.name}`
    if (currentCategoryObj && currentSubcategoryObj) return `${currentCategoryObj.name} — ${currentSubcategoryObj.name}`
    if (currentSubcategoryObj) return currentSubcategoryObj.name
    if (currentCategoryObj) return currentCategoryObj.name
    if (sectionParam === 'best_sellers') return 'Best Sellers'
    if (sectionParam === 'new_arrivals') return 'New Arrivals'
    if (sectionParam === 'featured') return 'Featured Products'
    if (sectionParam === 'trending') return 'Trending Products'
    if (sectionParam === 'deals') return 'Flash Deals & Special Offers'
    return 'All Products Catalog'
  }, [isWishlistParam, searchParam, currentOffer, offerIdParam, currentCategoryObj, currentSubcategoryObj, currentBrandObj, sectionParam])

  const seoEntity = currentSubcategoryObj || currentCategoryObj
  usePageTitle(seoEntity?.meta_title || (seoEntity && !searchParam && !currentBrandObj ? `${pageTitle} - Buy Online at Best Prices` : pageTitle))

  // Dynamic Category Banner: only active banners assigned to current category & valid date
  const currentCategoryBanner = useMemo(() => {
    if (!categoryIdParam) return null

    // 1. Look for banner specifically positioned for CATEGORY_PAGE matching this category
    const specificPlacement = categoryBanners.find(
      (b) =>
        Number(b.is_active) === 1 &&
        b.position === 'CATEGORY_PAGE' &&
        ((b.target_type === 'CATEGORY' && String(b.target_id) === String(categoryIdParam)) ||
          String(b.target_id) === String(categoryIdParam))
    )
    if (specificPlacement) return specificPlacement

    // 2. Look for active banner assigned to this category
    const assignedBanner = categoryBanners.find(
      (b) =>
        Number(b.is_active) === 1 &&
        b.target_type === 'CATEGORY' &&
        String(b.target_id) === String(categoryIdParam)
    )
    if (assignedBanner) return assignedBanner

    // 3. Fallback: banner with position CATEGORY_PAGE without specific target_id (generic category banner, if any)
    const genericCategoryBanner = categoryBanners.find(
      (b) =>
        Number(b.is_active) === 1 &&
        b.position === 'CATEGORY_PAGE' &&
        (!b.target_id || b.target_type === 'NONE')
    )
    return genericCategoryBanner || null
  }, [categoryIdParam, categoryBanners])

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans selection:bg-[var(--color-primary-tint)] selection:text-[var(--color-brand)] flex flex-col justify-between">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--color-text-main)] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-[var(--color-brand)]/30 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      <div>
        {/* ONE Reusable Global Sticky Navbar */}
        <Navbar
          onOpenCart={() => setIsCartOpen(true)}
          onOpenReferral={() => setIsReferralOpen(true)}
          searchQuery={searchParam}
          onSearchChange={(q) => {
            const next = new URLSearchParams(searchParams)
            next.set('page', '1')
            if (q) next.set('search', q)
            else next.delete('search')
            setSearchParams(next)
          }}
          categories={categories}
          activeNav="shop"
        />

        {/* Main Content Area in 1320px Container */}
        <main className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-2 sm:pt-3 pb-8 sm:pb-12">
          
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-xs font-sans font-medium text-[#666666] mb-2">
            <Link to={ROUTES.HOME} className="text-[#6C4EFF] hover:underline">
              Home
            </Link>
            <span>/</span>
            <span className="text-[#1B133F] font-semibold">{pageTitle}</span>
          </div>

          {/* Top Offer Highlight Banner */}
          {offerIdParam && (
            <div className="mb-6 rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-purple-50 via-indigo-50 to-pink-50 border border-purple-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-sans font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-purple-600 text-white shadow-2xs">
                    {currentOffer?.badge || 'EXCLUSIVE OFFER'}
                  </span>
                  <span className="text-xs font-bold text-purple-700 bg-white/90 border border-purple-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                    🔥 Offers Products
                  </span>
                  {currentOffer?.code && (
                    <span className="font-mono text-xs font-bold bg-white text-slate-800 border border-purple-200 px-2.5 py-0.5 rounded-md shadow-2xs">
                      CODE: {currentOffer.code}
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-[#1B133F] tracking-tight">
                  {currentOffer?.title || 'Offer Mapped Products'}
                </h2>

                {currentOffer?.subtitle && (
                  <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                    {currentOffer.subtitle}
                  </p>
                )}

                <p className="text-xs text-purple-700 font-bold flex items-center gap-1.5 pt-1">
                  <span>✨</span>
                  <span>
                    Showing {pagination.total} exclusive product{pagination.total === 1 ? '' : 's'} mapped to this offer
                  </span>
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-3 self-end md:self-center">
                {currentOffer?.image_path && (
                  <img
                    src={resolveImageUrl(currentOffer.image_path)}
                    alt={currentOffer?.title || 'Offer'}
                    className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-xs mix-blend-multiply"
                  />
                )}
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <span>All Products</span>
                  <span>✕</span>
                </button>
              </div>
            </div>
          )}

          {/* Dynamic Category Banner: Positioned below breadcrumbs, above category heading (Hidden if no active banner) */}
          {currentCategoryBanner && (
            <CategoryBanner
              banner={currentCategoryBanner}
              onScrollToProducts={() => {
                const target = document.getElementById('shop-products-header')
                if (target) target.scrollIntoView({ behavior: 'smooth' })
              }}
            />
          )}

          {/* Filter Sidebar + Listing: sidebar is sticky on desktop with
              its own scroll, a full-screen drawer on mobile (opened via
              the Filter button next to Sort below). */}
          <div className="lg:flex lg:gap-6 lg:items-start">
            <FilterSidebar
              facets={facets}
              categories={categories}
              subcategories={subcategories}
              currentCategory={currentCategoryObj}
              currentSubcategory={currentSubcategoryObj}
              searchParams={searchParams}
              onChangeParams={handleFilterParamsChange}
              isOpenMobile={isMobileFilterOpen}
              onCloseMobile={() => setIsMobileFilterOpen(false)}
              resultCount={pagination.total}
            />

          <div className="flex-1 min-w-0">
          {/* Page Header / Category Heading */}
          <div id="shop-products-header" className="flex flex-col md:flex-row md:items-end justify-between gap-3 pb-3 border-b border-[#E9DFFF] mb-2">
            <div>
              <span className="text-[12px] font-sans font-bold uppercase tracking-[0.2em] text-[#6C4EFF] bg-[#FAF8FF] px-3.5 py-1 rounded-full border border-[#E9DFFF]">
                {offerIdParam
                  ? 'Offers Products'
                  : sectionParam
                  ? `Section: ${sectionParam.replace('_', ' ')}`
                  : currentCategoryObj
                  ? currentCategoryObj.name
                  : 'All Groceries & Essentials'}
              </span>
              <h1 className="font-serif text-xl sm:text-2xl lg:text-[26px] font-bold text-[#1B133F] tracking-tight mt-2.5">
                {pageTitle}
              </h1>
              <p className="font-sans text-xs sm:text-sm text-[#666666] mt-1.5">
                {pagination.total > 0 ? (
                  <>
                    Showing{' '}
                    <strong className="text-[#6C4EFF] font-bold">
                      {(pagination.page - 1) * pagination.limit + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)}
                    </strong>{' '}
                    of <strong className="text-[#6C4EFF] font-bold">{pagination.total}</strong> product{pagination.total === 1 ? '' : 's'}
                  </>
                ) : (
                  'No products found'
                )}
              </p>
            </div>

            {/* Sort & Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <MobileFilterButton onClick={() => setIsMobileFilterOpen(true)} activeCount={Array.from(searchParams.keys()).filter((k) => !['page', 'section', 'sort'].includes(k)).length} />
              <label htmlFor="shop-sort" className="text-xs font-bold text-[var(--color-text-muted)]">
                Sort by:
              </label>
              <select
                id="shop-sort"
                value={sortParam}
                onChange={(e) => handleSortChange(e.target.value)}
                className="bg-white border border-[var(--color-border-subtle)] text-xs sm:text-sm font-bold text-[var(--color-text-main)] rounded-xl px-3 py-2 focus:outline-none focus:border-[var(--color-brand)] focus:ring-1 focus:ring-[var(--color-brand)] shadow-xs cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="best_sellers">Best Sellers</option>
                <option value="popular">Popular & Featured</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="rating">Rating</option>
                <option value="name_asc">Name: A to Z</option>
              </select>

              {(categoryIdParam || subcategoryIdParam || brandIdParam || sectionParam || searchParam || isWishlistParam || minPriceParam || maxPriceParam || offerIdParam) && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-3.5 py-2 bg-[var(--color-primary-tint)] hover:bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Clear Filters ✕
                </button>
              )}
            </div>
          </div>

          {/* Active Offer Chip Filter */}
          {offerIdParam && (
            <div className="pt-2 pb-1 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase text-purple-700 tracking-wider">
                Active Offer Filter:
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                <span>🎁 {currentOffer?.title || 'Offer Products'}</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = new URLSearchParams(searchParams)
                    next.delete('offer_id')
                    next.delete('top_offer_id')
                    next.set('page', '1')
                    setSearchParams(next)
                  }}
                  className="ml-1 w-4 h-4 rounded-full bg-purple-200 hover:bg-purple-300 text-purple-900 flex items-center justify-center font-bold text-[10px] cursor-pointer"
                  title="Remove offer filter"
                >
                  ✕
                </button>
              </span>
            </div>
          )}

          {/* Category Quick Chips Filter (Top 5 Categories) - hidden when search has no results */}
          {(!searchParam || products.length > 0 || isLoading) && (
            <div className="py-1.5 flex flex-nowrap overflow-x-auto no-scrollbar gap-2">
              <button
                type="button"
                onClick={() => handleCategoryChange('')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  !categoryIdParam
                    ? 'bg-[var(--color-brand)] text-white shadow-xs'
                    : 'bg-[var(--color-primary-tint)] text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)]'
                }`}
              >
                All Categories
              </button>
              {categories.slice(0, 5).map((cat) => {
                const isSelected = String(cat.id) === String(categoryIdParam)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--color-brand)] text-white shadow-xs'
                        : 'bg-[var(--color-primary-tint)] text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)]'
                    }`}
                  >
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Products Grid or Loading / Empty */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 md:gap-5 pt-1.5 pb-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl p-3 border border-[var(--color-border-subtle)] animate-pulse space-y-3"
                >
                  <div className="bg-[var(--color-primary-tint)]/60 aspect-square rounded-xl w-full" />
                  <div className="h-3 bg-[var(--color-primary-tint)]/70 rounded w-2/3" />
                  <div className="h-4 bg-[var(--color-primary-tint)]/70 rounded w-full" />
                  <div className="h-4 bg-[var(--color-primary-tint)]/70 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-3xl border border-[var(--color-border-subtle)] shadow-xs my-6 p-8 max-w-lg mx-auto space-y-4">
              <FiShoppingBag className="w-14 h-14 text-[var(--color-brand)] mx-auto mb-2" />
              <h2 className="text-xl font-black text-[var(--color-text-main)]">
                No products found in this category
              </h2>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-sm mx-auto leading-relaxed">
                No items matched your current filter criteria from the database. Try selecting another category or view all products.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-5 py-2.5 bg-[var(--color-brand)] hover:bg-[var(--color-brand)] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                >
                  View All Products
                </button>
                <Link
                  to={ROUTES.HOME}
                  className="px-5 py-2.5 bg-[var(--color-primary-tint)] hover:bg-[var(--color-primary-tint)] text-[var(--color-brand)] rounded-xl text-xs font-bold transition-colors"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pt-1.5 pb-6">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isWishlist={wishlistIds.includes(product.id)}
                  onToggleWishlist={handleToggleWishlist}
                  onAddToCart={handleAddToCart}
                  onClick={() => navigate(ROUTES.PRODUCT_DETAIL(product))}
                />
              ))}
            </div>
          )}

          {/* SERVER-SIDE PAGINATION CONTROLS */}
          {pagination.totalPages > 1 && (
            <div className="pt-8 pb-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[var(--color-border-subtle)]">
              <p className="text-xs text-gray-500 font-medium order-2 sm:order-1">
                Page <strong className="text-[var(--color-text-main)]">{pagination.page}</strong> of{' '}
                <strong className="text-[var(--color-text-main)]">{pagination.totalPages}</strong> ({pagination.total} total products)
              </p>

              <div className="flex items-center gap-1.5 order-1 sm:order-2">
                {/* Previous Button */}
                <button
                  type="button"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    pagination.hasPreviousPage
                      ? 'bg-white border-[var(--color-border-subtle)] text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)] cursor-pointer shadow-xs'
                      : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  ← Prev
                </button>

                {/* Page Number Buttons */}
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => {
                  const isCurrent = p === pagination.page
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`w-8 h-8 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[var(--color-brand)] text-white shadow-xs'
                          : 'bg-white border border-[var(--color-border-subtle)] text-[var(--color-text-main)] hover:bg-[var(--color-bg-alt)]'
                      }`}
                    >
                      {p}
                    </button>
                  )
                })}

                {/* Next Button */}
                <button
                  type="button"
                  disabled={!pagination.hasNextPage}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    pagination.hasNextPage
                      ? 'bg-white border-[var(--color-border-subtle)] text-[var(--color-text-main)] hover:bg-[var(--color-primary-tint)] cursor-pointer shadow-xs'
                      : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
          </div>
          </div>

          {/* Category intro + SEO copy - the same text search engines get from the server render */}
          {seoEntity && !searchParam && pageParam === 1 && (seoEntity.description || seoEntity.seo_content) && (
            <section className="mt-12 border-t border-[#E9DFFF] pt-8 font-sans text-sm text-[#555555] leading-relaxed space-y-3 max-w-4xl">
              <h2 className="font-serif text-xl font-bold text-[#1B133F]">About {seoEntity.name}</h2>
              {[seoEntity.description, seoEntity.seo_content]
                .filter(Boolean)
                .join('\n\n')
                .split(/\n\s*\n/)
                .map((para) => para.trim())
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
            </section>
          )}

        </main>
      </div>

      {/* Comprehensive Supermarket Grocery Footer with Logo, Location & Google Map */}
      <GroceryFooter storeSettings={storeSettings} categories={categories} />

      {/* Cart Drawer & Checkout Modal */}
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
