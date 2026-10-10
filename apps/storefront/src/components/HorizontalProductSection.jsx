import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProductCard from './ProductCard'

export default function HorizontalProductSection({
  title,
  subtitle,
  badgeText,
  badgeBg = 'bg-purple-50 text-purple-800',
  products = [],
  viewAllLink,
  isLoading = false,
  emptyMessage = 'No products available right now.',
  wishlistIds = [],
  onToggleWishlist,
  onAddToCart,
  id,
}) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Check scroll boundary to disable/hide arrows
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

  // Desktop Carousel Scroll Handler
  const handleScroll = (direction) => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const hasProducts = Array.isArray(products) && products.length > 0

  return (
    <section id={id} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 w-full overflow-hidden">
      
      {/* 1. SECTION HEADER: Title, Subtitle, Carousel Arrows & View All */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4 sm:mb-5">
        <div>
          {badgeText && (
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-1">
              <span className={`px-2.5 py-0.5 rounded-full ${badgeBg}`}>
                {badgeText}
              </span>
            </div>
          )}
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-purple-950 tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right Action Bar: Carousel Arrows + View All Link */}
        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
          {/* Desktop Left/Right Carousel Controls */}
          {hasProducts && (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                aria-label={`Scroll ${title} left`}
                className={`w-9 h-9 rounded-full border border-[#E8E0F5] flex items-center justify-center transition-all ${
                  canScrollLeft
                    ? 'bg-white hover:bg-[#F5F0FF] text-[#27213A] shadow-sm cursor-pointer hover:border-[#8B5CF6] active:scale-95'
                    : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed opacity-50'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => handleScroll('right')}
                disabled={!canScrollRight}
                aria-label={`Scroll ${title} right`}
                className={`w-9 h-9 rounded-full border border-[#E8E0F5] flex items-center justify-center transition-all ${
                  canScrollRight
                    ? 'bg-white hover:bg-[#F5F0FF] text-[#27213A] shadow-sm cursor-pointer hover:border-[#8B5CF6] active:scale-95'
                    : 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed opacity-50'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* View All Button (Only shown if section has destination and products/loading) */}
          {viewAllLink && (hasProducts || isLoading) && (
            <Link
              to={viewAllLink}
              className="inline-flex items-center gap-1 text-xs font-black text-[#8B5CF6] hover:text-[#7042D2] hover:underline px-3 py-1.5 rounded-full hover:bg-[#F5F0FF] transition-colors shrink-0"
            >
              <span>View All</span>
              <span className="text-sm">→</span>
            </Link>
          )}
        </div>
      </div>

      {/* 2. PRODUCT CAROUSEL TRACK (Strictly ONE horizontal row, no page overflow) */}
      {isLoading ? (
        /* Loading Skeleton */
        <div className="flex gap-3.5 sm:gap-4 overflow-hidden py-2">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="w-[calc(50%-8px)] min-w-[155px] sm:w-[210px] md:w-[220px] lg:w-[230px] shrink-0 bg-white rounded-2xl p-3 border border-purple-100 animate-pulse space-y-3"
            >
              <div className="bg-purple-100/60 aspect-square rounded-xl w-full" />
              <div className="h-3 bg-purple-100/70 rounded w-2/3" />
              <div className="h-4 bg-purple-100/70 rounded w-full" />
              <div className="h-4 bg-purple-100/70 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !hasProducts ? (
        /* Empty State */
        <div className="py-8 text-center bg-purple-50/40 rounded-2xl border border-purple-100/80 p-6 space-y-2">
          <p className="text-sm font-bold text-gray-600">
            {emptyMessage}
          </p>
        </div>
      ) : (
        /* Products in ONE Horizontal Scrollable Row */
        <div
          ref={scrollRef}
          className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-3 sm:gap-4 py-2 px-0.5 select-none"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="w-[calc(50%-8px)] min-w-[155px] max-w-[210px] sm:w-[210px] md:w-[220px] lg:w-[230px] shrink-0"
            >
              <ProductCard
                product={product}
                isWishlist={wishlistIds.includes(product.id)}
                onToggleWishlist={onToggleWishlist}
                onAddToCart={onAddToCart}
                onClick={() => navigate(`/product/${product.id}`)}
              />
            </div>
          ))}
        </div>
      )}

    </section>
  )
}
