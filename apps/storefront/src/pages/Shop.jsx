import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { api, fetchStoreSettings, fetchDeliverySettings, resolveImageUrl } from '../lib/api'
import Navbar from '../components/Navbar'
import ProductCard from '../components/ProductCard'
import CategoryBanner from '../components/CategoryBanner'
import CartDrawer from '../components/CartDrawer'
import CheckoutModal from '../components/CheckoutModal'
import ReferralModal from '../components/ReferralModal'
import { addToCart, getCartCount, fetchCart } from '../lib/cart'
import { getWishlistIds, fetchWishlist, toggleWishlist } from '../lib/wishlist'

export default function Shop() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // URL query state
  const pageParam = parseInt(searchParams.get('page') || '1', 10)
  const sectionParam = searchParams.get('section') || ''
  const categoryIdParam = searchParams.get('category_id') || ''
  const subcategoryIdParam = searchParams.get('subcategory_id') || ''
  const brandIdParam = searchParams.get('brand_id') || ''
  const sortParam = searchParams.get('sort') || 'newest'
  const searchParam = searchParams.get('search') || ''
  const isWishlistParam = searchParams.get('wishlist') === '1' || location.pathname === '/wishlist'
  const minPriceParam = searchParams.get('min_price') || ''
  const maxPriceParam = searchParams.get('max_price') || ''

  // Data states from DB
  const [products, setProducts] = useState([])
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
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

  // SERVER-SIDE PAGINATION: Fetch products directly from MySQL + PHP API whenever filters change
  useEffect(() => {
    async function fetchServerProducts() {
      setIsLoading(true)

      // Build query string for /api/products
      const params = new URLSearchParams()
      params.set('page', String(pageParam))
      params.set('limit', '12') // 12 cards per page for 2/3/4-col responsive layout
      params.set('channel', 'ecommerce')
      params.set('is_active', '1')

      if (sectionParam) params.set('section', sectionParam)
      if (categoryIdParam) params.set('category_id', categoryIdParam)
      if (subcategoryIdParam) params.set('subcategory_id', subcategoryIdParam)
      if (brandIdParam) params.set('brand_id', brandIdParam)
      if (sortParam) params.set('sort', sortParam)
      if (searchParam) params.set('search', searchParam)
      if (minPriceParam) params.set('min_price', minPriceParam)
      if (maxPriceParam) params.set('max_price', maxPriceParam)

      try {
        const res = await api.get(`/products?${params.toString()}`)
        const items = res.data?.items || res.data?.data || []
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
    categoryIdParam,
    subcategoryIdParam,
    brandIdParam,
    sortParam,
    searchParam,
    isWishlistParam,
    minPriceParam,
    maxPriceParam,
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
    if (catId) {
      next.set('category_id', String(catId))
    } else {
      next.delete('category_id')
    }
    setSearchParams(next)
  }

  const handleSubcategoryChange = (subcatId) => {
    const next = new URLSearchParams(searchParams)
    next.set('page', '1')
    if (subcatId) {
      next.set('subcategory_id', String(subcatId))
    } else {
      next.delete('subcategory_id')
    }
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

  const handleClearFilters = () => {
    setSearchParams(new URLSearchParams())
  }

  // Wishlist handler (Persisted in MySQL)
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

  // Add to cart handler (Persisted in MySQL)
  const handleAddToCart = async (product, e) => {
    if (e) e.stopPropagation()
    try {
      await addToCart(product, 1)
      showToast(`Added "${product.name}" to Cart! 🛍️`)
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
  }, [isWishlistParam, searchParam, currentCategoryObj, currentSubcategoryObj, currentBrandObj, sectionParam])

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
    <div className="min-h-screen bg-[#F8F3F6] text-[#2D252B] font-sans selection:bg-[#F2DDE9] selection:text-[#601D49] flex flex-col justify-between">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#2D252B] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-[#601D49]/30 animate-bounce">
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

        {/* Main Content Area */}
        <main className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
          
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-xs font-bold text-[#6B5E68] mb-3">
            <Link to="/" className="text-[#601D49] hover:underline">
              Home
            </Link>
            <span>/</span>
            <span className="text-[#2D252B]">{pageTitle}</span>
          </div>

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

          {/* Page Header / Category Heading */}
          <div id="shop-products-header" className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#E8E0E5]">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#601D49] bg-[#F2DDE9] px-3 py-1 rounded-full">
                {sectionParam ? `Collection: ${sectionParam.replace('_', ' ')}` : currentCategoryObj ? 'Category' : 'Store Catalog'}
              </span>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#2D252B] tracking-tight mt-1.5">
                {pageTitle}
              </h1>
              <p className="text-xs sm:text-sm text-[#6B5E68] mt-1">
                Showing{' '}
                <strong className="text-[#601D49] font-bold">
                  {pagination.total}
                </strong>{' '}
                product{pagination.total === 1 ? '' : 's'} available in database
              </p>
            </div>

            {/* Sort & Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor="shop-sort" className="text-xs font-bold text-[#6B5E68]">
                Sort by:
              </label>
              <select
                id="shop-sort"
                value={sortParam}
                onChange={(e) => handleSortChange(e.target.value)}
                className="bg-white border border-[#E8E0E5] text-xs sm:text-sm font-bold text-[#2D252B] rounded-xl px-3 py-2 focus:outline-none focus:border-[#601D49] focus:ring-1 focus:ring-[#601D49] shadow-xs cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="best_sellers">Best Sellers</option>
                <option value="popular">Popular & Featured</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="name_asc">Name: A to Z</option>
              </select>

              {(categoryIdParam || subcategoryIdParam || brandIdParam || sectionParam || searchParam || isWishlistParam || minPriceParam || maxPriceParam) && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-3.5 py-2 bg-[#F2DDE9] hover:bg-[#F2DDE9] text-[#601D49] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Clear Filters ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Quick Chips Filter (Only main categories) */}
          <div className="py-3.5 flex flex-nowrap overflow-x-auto no-scrollbar gap-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                !categoryIdParam
                  ? 'bg-[#601D49] text-white shadow-xs'
                  : 'bg-[#F2DDE9] text-[#2D252B] hover:bg-[#F2DDE9]'
              }`}
            >
              All Categories
            </button>
            {categories.map((cat) => {
              const isSelected = String(cat.id) === String(categoryIdParam)
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleCategoryChange(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-[#601D49] text-white shadow-xs'
                      : 'bg-[#F2DDE9] text-[#2D252B] hover:bg-[#F2DDE9]'
                  }`}
                >
                  {cat.name}
                </button>
              )
            })}
          </div>

          {/* Products Grid or Loading / Empty */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 md:gap-5 py-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl p-3 border border-[#E8E0E5] animate-pulse space-y-3"
                >
                  <div className="bg-[#F2DDE9]/60 aspect-square rounded-xl w-full" />
                  <div className="h-3 bg-[#F2DDE9]/70 rounded w-2/3" />
                  <div className="h-4 bg-[#F2DDE9]/70 rounded w-full" />
                  <div className="h-4 bg-[#F2DDE9]/70 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-3xl border border-[#E8E0E5] shadow-xs my-6 p-8 max-w-lg mx-auto space-y-4">
              <span className="text-5xl block">🛍️</span>
              <h2 className="text-xl font-black text-[#2D252B]">
                No products found in this category
              </h2>
              <p className="text-xs sm:text-sm text-[#6B5E68] max-w-sm mx-auto leading-relaxed">
                No items matched your current filter criteria from the database. Try selecting another category or view all products.
              </p>
              <div className="pt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-5 py-2.5 bg-[#601D49] hover:bg-[#601D49] text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
                >
                  View All Products
                </button>
                <Link
                  to="/"
                  className="px-5 py-2.5 bg-[#F2DDE9] hover:bg-[#F2DDE9] text-[#601D49] rounded-xl text-xs font-bold transition-colors"
                >
                  Back to Home
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 md:gap-5 py-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  isWishlist={wishlistIds.includes(product.id)}
                  onToggleWishlist={handleToggleWishlist}
                  onAddToCart={handleAddToCart}
                  onClick={() => navigate(`/product/${product.id}`)}
                />
              ))}
            </div>
          )}

          {/* SERVER-SIDE PAGINATION CONTROLS */}
          {pagination.totalPages > 1 && (
            <div className="pt-8 pb-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-[#E8E0E5]">
              <p className="text-xs text-gray-500 font-medium order-2 sm:order-1">
                Page <strong className="text-[#2D252B]">{pagination.page}</strong> of{' '}
                <strong className="text-[#2D252B]">{pagination.totalPages}</strong> ({pagination.total} total products)
              </p>

              <div className="flex items-center gap-1.5 order-1 sm:order-2">
                {/* Previous Button */}
                <button
                  type="button"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    pagination.hasPreviousPage
                      ? 'bg-white border-[#E8E0E5] text-[#2D252B] hover:bg-[#F2DDE9] cursor-pointer shadow-xs'
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
                          ? 'bg-[#601D49] text-white shadow-xs'
                          : 'bg-white border border-[#E8E0E5] text-[#2D252B] hover:bg-[#F7F5F7]'
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
                      ? 'bg-white border-[#E8E0E5] text-[#2D252B] hover:bg-[#F2DDE9] cursor-pointer shadow-xs'
                      : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* FOOTER (Burgundy & White Aesthetic) */}
      <footer className="bg-white text-[#2D252B] pt-12 pb-8 border-t border-[#E8E0E5] mt-12">
        <div className="w-full px-3 sm:px-6 lg:px-8 xl:px-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-[#E8E0E5]">
            <div className="space-y-3">
              <div className="flex items-baseline leading-none">
                <span className="text-2xl font-black tracking-tight text-[#601D49]">
                  {storeSettings?.store_name || 'Store'}
                </span>
              </div>
              <p className="text-xs text-[#6B5E68] leading-relaxed">
                {storeSettings?.description || 'Your trusted online shopping destination.'}
              </p>
            </div>
            <div className="space-y-2 text-xs text-[#6B5E68]">
              <h4 className="font-black uppercase text-[#2D252B] text-xs">Quick Links</h4>
              <ul className="space-y-1.5">
                <li><Link to="/" className="hover:text-[#601D49] transition-colors">Home Catalog</Link></li>
                <li><Link to="/products?section=best_sellers" className="hover:text-[#601D49] transition-colors">Best Sellers</Link></li>
                <li><Link to="/products?section=new_arrivals" className="hover:text-[#601D49] transition-colors">New Arrivals</Link></li>
              </ul>
            </div>
            <div className="space-y-2 text-xs text-[#6B5E68]">
              <h4 className="font-black uppercase text-[#2D252B] text-xs">Customer Care</h4>
              <ul className="space-y-1.5">
                <li><Link to="/pages/shipping-policy" className="hover:text-[#601D49] transition-colors">Shipping Information</Link></li>
                <li><Link to="/pages/return-exchange-policy" className="hover:text-[#601D49] transition-colors">Return & Refund Policy</Link></li>
                <li><Link to="/pages/privacy-policy" className="hover:text-[#601D49] transition-colors">Privacy Policy</Link></li>
                <li><Link to="/pages/terms-and-conditions" className="hover:text-[#601D49] transition-colors">Terms and Conditions</Link></li>
              </ul>
            </div>
            <div className="space-y-2 text-xs text-[#6B5E68]">
              <h4 className="font-black uppercase text-[#2D252B] text-xs">Contact</h4>
              {storeSettings?.phone && <p>📞 {storeSettings.phone}</p>}
              {storeSettings?.email && <p>✉️ {storeSettings.email}</p>}
            </div>
          </div>
          <p className="pt-6 text-center text-[11px] text-[#6B5E68]">
            © {new Date().getFullYear()} {storeSettings?.copyright_text || `${storeSettings?.store_name || 'Store'}. All rights reserved.`}
          </p>
        </div>
      </footer>

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
