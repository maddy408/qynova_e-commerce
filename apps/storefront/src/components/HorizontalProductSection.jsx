import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import ProductCard from './ProductCard'
import { ROUTES } from '../routes/routes'
import { FiChevronLeft, FiChevronRight, FiArrowRight } from 'react-icons/fi'

export default function HorizontalProductSection({
  title,
  subtitle,
  badgeText = 'CURATED COLLECTION',
  badgeBg,
  products = [],
  viewAllLink,
  isLoading = false,
  emptyMessage = 'No products available at the moment.',
  wishlistIds = [],
  onToggleWishlist,
  onAddToCart,
  id,
  backgroundImage = null,
}) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Scroll boundary check
  const checkScrollBounds = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 10)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10)
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

  // Desktop Carousel Scroll Handler: scrolls by ~1 card width (4 cards per row on desktop)
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
    <section
      id={id}
      className="w-full py-16 sm:py-20 lg:py-28 overflow-hidden relative bg-[#FAF8FF] border-b border-[#E9DFFF]/60"
      style={
        backgroundImage
          ? {
              backgroundImage: `linear-gradient(rgba(250, 248, 255, 0.94), rgba(250, 248, 255, 0.98)), url(${backgroundImage})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {/* Centered Luxury 1320px Main Container */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* 1. SECTION HEADER: Eyebrow (~12px) -> Heading (~16px) -> Subtitle (~40-48px before grid) */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 sm:mb-12">
          <div className="max-w-2xl">
            {/* Eyebrow Label: approximately 13px, uppercase, bold, letter spacing 0.2em */}
            {badgeText && (
              <div className="mb-3">
                <span className="text-[13px] font-sans font-bold uppercase tracking-[0.2em] text-[#6C4EFF] inline-block">
                  {badgeText}
                </span>
              </div>
            )}

            {/* Section Heading: approximately 46px desktop, Playfair Display, #1B133F */}
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-[46px] font-bold text-[#1B133F] tracking-tight leading-[1.15] mb-4">
              {title}
            </h2>

            {/* Subtitle: Inter 16-18px, #666666, readable width roughly 640px */}
            {subtitle && (
              <p className="font-sans text-base sm:text-[17px] text-[#666666] leading-[1.6] max-w-[640px]">
                {subtitle}
              </p>
            )}
          </div>

          {/* Right Action Controls: Carousel Arrows + View All Link (16-24px between controls) */}
          <div className="flex items-center gap-3 sm:gap-4 self-start md:self-end shrink-0">
            {/* Desktop Left/Right Carousel Controls */}
            {hasProducts && products.length > 3 && (
              <div className="hidden sm:flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleScroll('left')}
                  disabled={!canScrollLeft}
                  aria-label={`Scroll ${title} left`}
                  className={`w-11 h-11 rounded-full border border-[#E9DFFF] flex items-center justify-center transition-all ${
                    canScrollLeft
                      ? 'bg-white hover:bg-[#F3EDFF] text-[#1B133F] hover:text-[#6C4EFF] shadow-xs cursor-pointer hover:border-[#BFA2FF] active:scale-95'
                      : 'bg-white/50 text-[#666666]/40 border-[#E9DFFF]/60 cursor-not-allowed opacity-50'
                  }`}
                >
                  <FiChevronLeft className="w-5 h-5 stroke-[2.2]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleScroll('right')}
                  disabled={!canScrollRight}
                  aria-label={`Scroll ${title} right`}
                  className={`w-11 h-11 rounded-full border border-[#E9DFFF] flex items-center justify-center transition-all ${
                    canScrollRight
                      ? 'bg-white hover:bg-[#F3EDFF] text-[#1B133F] hover:text-[#6C4EFF] shadow-xs cursor-pointer hover:border-[#BFA2FF] active:scale-95'
                      : 'bg-white/50 text-[#666666]/40 border-[#E9DFFF]/60 cursor-not-allowed opacity-50'
                  }`}
                >
                  <FiChevronRight className="w-5 h-5 stroke-[2.2]" />
                </button>
              </div>
            )}

            {/* View All Link */}
            {viewAllLink && (
              <Link
                to={viewAllLink}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#F3EDFF] text-[#6C4EFF] hover:text-[#4B2AC5] border border-[#E9DFFF] hover:border-[#BFA2FF] font-sans text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-xs cursor-pointer"
              >
                <span>Explore All</span>
                <FiArrowRight className="w-4 h-4 stroke-[2.2]" />
              </Link>
            )}
          </div>
        </div>

        {/* 2. PRODUCT CAROUSEL / GRID: 4 CARDS PER ROW ON DESKTOP */}
        {isLoading ? (
          /* Loading Skeletons: 4 per row */
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-[24px] p-6 border border-[#E9DFFF] shadow-xs animate-pulse space-y-4"
              >
                <div className="h-[280px] bg-[#FAF8FF] rounded-[18px] w-full" />
                <div className="h-4 bg-[#F3EDFF] rounded w-1/3" />
                <div className="h-6 bg-[#F3EDFF] rounded w-3/4" />
                <div className="h-4 bg-[#F3EDFF] rounded w-1/2" />
                <div className="h-10 bg-[#FAF8FF] rounded-full w-full mt-4" />
              </div>
            ))}
          </div>
        ) : !hasProducts ? (
          /* Empty State */
          <div className="py-12 text-center bg-white rounded-[24px] border border-[#E9DFFF] p-8 space-y-2">
            <p className="font-sans text-sm font-medium text-[#666666]">
              {emptyMessage}
            </p>
          </div>
        ) : (
          /* Responsive Product Track: 4 columns desktop (lg), 3 tablet (md), 2 mobile (sm) */
          <div
            ref={scrollRef}
            className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-4 sm:gap-5 lg:gap-6 py-2 px-1 select-none"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {products.map((product) => (
              <div
                key={product.id}
                className="w-[calc(100%-24px)] min-w-[240px] sm:w-[calc(50%-12px)] md:w-[calc(33.333%-14px)] lg:w-[calc(25%-18px)] shrink-0"
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
