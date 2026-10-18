import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProductCard from './ProductCard'
import { ROUTES } from '../routes/routes'
import { FiChevronLeft, FiChevronRight, FiArrowRight } from 'react-icons/fi'

/**
 * Universal Horizontal Product Carousel Section
 * Matches KiranaBazaar reference image:
 * - Clean title with optional emoji/badge + subtitle
 * - Left/Right circular carousel arrows & View All link
 * - Compact JioMart style Product Cards
 * - Responsive 5 columns on desktop, 4 on tablet, 2 on mobile
 */
export default function HorizontalProductSection({
  title,
  subtitle,
  badgeText,
  badgeBg,
  icon = null,
  products = [],
  viewAllLink,
  isLoading = false,
  emptyMessage = 'No products available at the moment.',
  wishlistIds = [],
  onToggleWishlist,
  onAddToCart,
  id,
}) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScrollBounds = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 8)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 8)
  }

  useEffect(() => {
    checkScrollBounds()
    const container = scrollRef.current
    if (!container) return

    container.addEventListener('scroll', checkScrollBounds, { passive: true })
    window.addEventListener('resize', checkScrollBounds)

    return () => {
      container.removeEventListener('scroll', checkScrollBounds)
      window.removeEventListener('resize', checkScrollBounds)
    }
  }, [products, isLoading])

  const handleScroll = (direction) => {
    if (!scrollRef.current) return
    const cardWidth = scrollRef.current.clientWidth >= 1024
      ? scrollRef.current.clientWidth / 4
      : scrollRef.current.clientWidth >= 768
      ? scrollRef.current.clientWidth / 3
      : scrollRef.current.clientWidth / 2
    const scrollAmount = cardWidth * (direction === 'left' ? -1 : 1)
    scrollRef.current.scrollBy({
      left: scrollAmount,
      behavior: 'smooth',
    })
  }

  const hasProducts = Array.isArray(products) && products.length > 0

  if (!isLoading && !hasProducts) {
    return null
  }

  return (
    <section id={id} className="w-full py-4 sm:py-6 select-none">
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 lg:px-8">
        
        {/* Header Row */}
        <div className="flex items-center justify-between gap-4 mb-3 sm:mb-4">
          <div>
            <div className="flex items-center gap-2">
              {icon && <span className="text-base sm:text-lg">{icon}</span>}
              <h2 className="font-sans text-base sm:text-lg font-black text-[var(--color-text-main)] tracking-tight">
                {title}
              </h2>
            </div>
            {subtitle && (
              <p className="font-sans text-xs text-[var(--color-text-muted)] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          {/* Right Controls: < > Arrows + View All */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {hasProducts && products.length > 3 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleScroll('left')}
                  disabled={!canScrollLeft}
                  aria-label={`Scroll ${title} left`}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 flex items-center justify-center transition-all ${
                    canScrollLeft
                      ? 'bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer hover:border-slate-300 active:scale-95'
                      : 'bg-white/50 text-slate-300 border-slate-100 cursor-not-allowed opacity-40'
                  }`}
                >
                  <FiChevronLeft className="w-4 h-4 stroke-[2]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleScroll('right')}
                  disabled={!canScrollRight}
                  aria-label={`Scroll ${title} right`}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 flex items-center justify-center transition-all ${
                    canScrollRight
                      ? 'bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer hover:border-slate-300 active:scale-95'
                      : 'bg-white/50 text-slate-300 border-slate-100 cursor-not-allowed opacity-40'
                  }`}
                >
                  <FiChevronRight className="w-4 h-4 stroke-[2]" />
                </button>
              </div>
            )}

            {viewAllLink && (
              <Link
                to={viewAllLink}
                className="text-xs sm:text-[13px] font-sans font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1 transition-colors"
              >
                <span>View All</span>
                <FiArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Product Track: JioMart Compact Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-2.5 border border-slate-100 shadow-xs animate-pulse space-y-2"
              >
                <div className="h-[140px] bg-slate-100 rounded-xl w-full" />
                <div className="h-3 bg-slate-100 rounded w-1/3" />
                <div className="h-4 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : !hasProducts ? (
          <div className="py-8 text-center bg-white rounded-2xl border border-slate-200 p-6">
            <p className="font-sans text-xs text-slate-500">{emptyMessage}</p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-2.5 sm:gap-3 py-1 select-none"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {products.map((product) => (
              <div
                key={product.id}
                className="w-[155px] sm:w-[175px] md:w-[195px] lg:w-[205px] xl:w-[212px] shrink-0"
              >
                <ProductCard
                  product={product}
                  isWishlist={wishlistIds.includes(product.id)}
                  onToggleWishlist={onToggleWishlist}
                  onAddToCart={onAddToCart}
                  onClick={() => navigate(ROUTES.PRODUCT_DETAIL(product.id))}
                />
              </div>
            ))}
          </div>
        )}

      </div>
    </section>
  )
}
