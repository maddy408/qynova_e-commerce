import React, { useState, useEffect, useMemo } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { api, fetchStoreSettings, fetchDeliverySettings } from '../lib/api'
import Navbar from '../components/Navbar'
import ProductCard from '../components/ProductCard'
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
  const isWishlistParam = searchParams.get('wishlist') === '1'
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
  const [storeSettings, setStoreSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Modals & local state
  const [isCartOpen, setIsCartOpen] = useState(false)
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

  // Fetch store settings, categories, subcategories & brands from DB
  useEffect(() => {
    fetchStoreSettings().then((s) => s && setStoreSettings(s))
    api
      .get('/categories')
      .then((res) => {
        if (res.data?.categories) {
          setCategories(res.data.categories)
        }
      })
      .catch(() => {})

    api
      .get('/subcategories')
      .then((res) => {
        if (res.data?.subcategories) {
          setSubcategories(res.data.subcategories)
        }
      })
      .catch(() => {})

    api
      .get('/brands')
      .then((res) => {
        if (res.data?.brands) {
          setBrands(res.data.brands)
        }
      })
      .catch(() => {})
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
        setProducts([])
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
      showToast(`Added "${product.name}" to Cart! 🛍️`)
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

  return (
    <div className="min-h-screen bg-[#FAF8FF] text-[#27213A] font-sans selection:bg-purple-100 selection:text-purple-900 flex flex-col justify-between">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#27213A] text-white px-5 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-[#8B5CF6]/30 animate-bounce">
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
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 mb-4">
            <Link to="/" className="text-purple-700 hover:underline">
              Home
            </Link>
            <span>/</span>
            <span className="text-gray-700">{pageTitle}</span>
          </div>

          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-purple-100">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
                {sectionParam ? `Collection: ${sectionParam.replace('_', ' ')}` : 'Store Catalog'}
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-purple-950 tracking-tight mt-1.5">
                {pageTitle}
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Showing{' '}
                <strong className="text-purple-900 font-bold">
                  {pagination.total}
                </strong>{' '}
                product{pagination.total === 1 ? '' : 's'} available in database
              </p>
            </div>

            {/* Sort & Filter Controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <label htmlFor="shop-sort" className="text-xs font-bold text-gray-600">
                Sort by:
              </label>
              <select
                id="shop-sort"
                value={sortParam}
                onChange={(e) => handleSortChange(e.target.value)}
                className="bg-white border border-purple-200 text-xs sm:text-sm font-bold text-purple-950 rounded-xl px-3 py-2 focus:outline-none focus:border-purple-600 focus:ring-1 focus:ring-purple-600 shadow-xs cursor-pointer"
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
                  className="px-3.5 py-2 bg-[#EDE5FF] hover:bg-[#E0D6FF] text-[#7042D2] text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Clear Filters ✕
                </button>
              )}
            </div>
          </div>

          {/* Category Quick Chips Filter */}
          <div className="py-4 flex flex-nowrap overflow-x-auto no-scrollbar gap-2">
            <button
              type="button"
              onClick={() => handleCategoryChange('')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                !categoryIdParam
                  ? 'bg-[#8B5CF6] text-white shadow-xs'
                  : 'bg-[#F5F0FF] text-[#27213A] hover:bg-[#EDE5FF]'
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
                      ? 'bg-[#8B5CF6] text-white shadow-xs'
                      : 'bg-[#F5F0FF] text-[#27213A] hover:bg-[#EDE5FF]'
                  }`}
                >
                  {cat.name}
                </button>
              )
            })}
          </div>

          {/* Subcategory Quick Chips Filter (Renders when relevant subcategories exist in DB) */}
          {relevantSubcategories.length > 0 && (
            <div className="pb-3 flex flex-nowrap overflow-x-auto no-scrollbar gap-1.5 items-center">
              <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider shrink-0 mr-1">
                Subcategories:
              </span>
              <button
                type="button"
                onClick={() => handleSubcategoryChange('')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  !subcategoryIdParam
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'bg-white border border-purple-200 text-purple-900 hover:bg-purple-50'
                }`}
              >
                All
              </button>
              {relevantSubcategories.map((subcat) => {
                const isSelected = String(subcat.id) === String(subcategoryIdParam)
                return (
                  <button
                    key={subcat.id}
                    type="button"
                    onClick={() => handleSubcategoryChange(subcat.id)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-purple-900 text-white shadow-xs'
                        : 'bg-white border border-purple-200 text-purple-900 hover:bg-purple-50'
                    }`}
                  >
                    {subcat.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Brand Quick Chips Filter (Renders when brands exist in DB) */}
          {brands.length > 0 && (
            <div className="pb-3 flex flex-nowrap overflow-x-auto no-scrollbar gap-1.5 items-center">
              <span className="text-[11px] font-extrabold text-gray-400 uppercase tracking-wider shrink-0 mr-1">
                Brands:
              </span>
              <button
                type="button"
                onClick={() => handleBrandChange('')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                  !brandIdParam
                    ? 'bg-purple-900 text-white shadow-xs'
                    : 'bg-white border border-purple-200 text-purple-900 hover:bg-purple-50'
                }`}
              >
                All
              </button>
              {brands.map((b) => {
                const isSelected = String(b.id) === String(brandIdParam)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleBrandChange(b.id)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-purple-900 text-white shadow-xs'
                        : 'bg-white border border-purple-200 text-purple-900 hover:bg-purple-50'
                    }`}
                  >
                    {b.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Products Grid or Loading / Empty */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5 py-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl p-3 border border-purple-100 animate-pulse space-y-3"
                >
                  <div className="bg-purple-100/60 aspect-square rounded-xl w-full" />
                  <div className="h-3 bg-purple-100/70 rounded w-2/3" />
                  <div className="h-4 bg-purple-100/70 rounded w-full" />
                  <div className="h-4 bg-purple-100/70 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-3xl border border-purple-100 shadow-xs my-6 p-6 space-y-3">
              <span className="text-5xl block">🛍️</span>
              <h2 className="text-xl font-black text-purple-950">
                No products available right now.
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto">
                No items matched your current filter criteria from the database. Try selecting another category or clearing filters.
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-block px-5 py-2.5 bg-[#8B5CF6] text-white rounded-full text-xs font-bold shadow-xs cursor-pointer hover:bg-[#7042D2]"
              >
                View All Products
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5 py-6">
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
            <div className="pt-8 pb-10 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-purple-100">
              <p className="text-xs text-gray-500 font-medium order-2 sm:order-1">
                Page <strong className="text-purple-950">{pagination.page}</strong> of{' '}
                <strong className="text-purple-950">{pagination.totalPages}</strong> ({pagination.total} total products)
              </p>

              <div className="flex items-center gap-1.5 order-1 sm:order-2">
                {/* Previous Button */}
                <button
                  type="button"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                    pagination.hasPreviousPage
                      ? 'bg-white border-purple-200 text-purple-900 hover:bg-purple-50 cursor-pointer shadow-xs'
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
                          ? 'bg-[#8B5CF6] text-white shadow-xs'
                          : 'bg-white border border-[#E8E0F5] text-[#27213A] hover:bg-[#F5F0FF]'
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
                      ? 'bg-white border-purple-200 text-purple-900 hover:bg-purple-50 cursor-pointer shadow-xs'
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

      {/* FOOTER */}
      <footer className="bg-[#27213A] text-white pt-12 pb-8 border-t border-[#E8E0F5]/20 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 pb-10 border-b border-purple-900/60">
            <div className="space-y-3">
              <div className="flex items-baseline leading-none">
                <span className="text-2xl font-black tracking-tight text-white">Kirana</span>
                <span className="text-2xl font-black tracking-tight text-[#EC4899]">Bazaar</span>
              </div>
              <p className="text-xs text-purple-200/80 leading-relaxed">
                Handcrafted hair accessories, minimalist jewellery, personalized gift sets, and vanity organizers.
              </p>
            </div>
            <div className="space-y-2 text-xs text-purple-200/80">
              <h4 className="font-black uppercase text-amber-300">Quick Links</h4>
              <ul className="space-y-1.5">
                <li><Link to="/" className="hover:text-white">Home Catalog</Link></li>
                <li><Link to="/products?section=best_sellers" className="hover:text-white">Best Sellers</Link></li>
                <li><Link to="/products?section=new_arrivals" className="hover:text-white">New Arrivals</Link></li>
              </ul>
            </div>
            <div className="space-y-2 text-xs text-purple-200/80">
              <h4 className="font-black uppercase text-amber-300">Customer Care</h4>
              <ul className="space-y-1.5">
                <li><Link to="/pages/shipping-policy" className="hover:text-white">Shipping Information</Link></li>
                <li><Link to="/pages/return-exchange-policy" className="hover:text-white">Return & Refund Policy</Link></li>
                <li><Link to="/pages/privacy-policy" className="hover:text-white">Privacy Policy</Link></li>
                <li><Link to="/pages/terms-and-conditions" className="hover:text-white">Terms and Conditions</Link></li>
              </ul>
            </div>
            <div className="space-y-2 text-xs text-purple-200/80">
              <h4 className="font-black uppercase text-amber-300">Contact</h4>
              {storeSettings?.phone && <p>📞 {storeSettings.phone}</p>}
              {storeSettings?.email && <p>✉️ {storeSettings.email}</p>}
            </div>
          </div>
          <p className="pt-6 text-center text-[11px] text-purple-300/60">
            © {new Date().getFullYear()} KiranaBazaar Hub. All rights reserved.
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
