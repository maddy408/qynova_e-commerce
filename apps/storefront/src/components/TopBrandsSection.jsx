import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'

export default function TopBrandsSection({
  brands = [],
  isLoading = false,
  title = 'Most Loved Brands',
  subtitle = 'Top verified brands with exclusive offers',
  id = 'top-brands-section',
}) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // Scroll boundary check to disable/enable carousel arrows
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
  }, [brands, isLoading])

  // Desktop Carousel Scroll Handler - Matches HorizontalProductSection
  const handleScroll = (direction) => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const hasBrands = Array.isArray(brands) && brands.length > 0

  if (!isLoading && !hasBrands) {
    return null
  }

  return (
    <section
      id={id}
      className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 overflow-hidden relative bg-white border-b border-slate-100"
    >
      {/* 1. SECTION HEADER: Title, Subtitle, Carousel Arrows & View All */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-[#ede9fe] text-[#6d28d9]">
              TOP BRANDS
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[var(--color-text-main)] tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right Action Bar: Carousel Arrows + View All Link */}
        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
          {/* Desktop Left/Right Carousel Controls */}
          {hasBrands && (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                aria-label={`Scroll ${title} left`}
                className={`w-9 h-9 rounded-full border border-[var(--color-border-subtle)] flex items-center justify-center transition-all ${
                  canScrollLeft
                    ? 'bg-white hover:bg-[var(--color-primary-tint)] text-[var(--color-text-main)] shadow-sm cursor-pointer hover:border-[var(--color-brand)] active:scale-95'
                    : 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]/40 border-[var(--color-border-subtle)] cursor-not-allowed opacity-50'
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
                className={`w-9 h-9 rounded-full border border-[var(--color-border-subtle)] flex items-center justify-center transition-all ${
                  canScrollRight
                    ? 'bg-white hover:bg-[var(--color-primary-tint)] text-[var(--color-text-main)] shadow-sm cursor-pointer hover:border-[var(--color-brand)] active:scale-95'
                    : 'bg-[var(--color-bg-main)] text-[var(--color-text-muted)]/40 border-[var(--color-border-subtle)] cursor-not-allowed opacity-50'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* View All Button */}
          <Link
            to="/products"
            className="inline-flex items-center gap-1 text-xs font-black text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] hover:underline px-3 py-1.5 rounded-full hover:bg-[var(--color-primary-tint)] transition-colors shrink-0"
          >
            <span>View All</span>
            <span className="text-sm">→</span>
          </Link>
        </div>
      </div>

      {/* 2. BRAND CAROUSEL TRACK (100% Width matching HorizontalProductSection) */}
      {isLoading ? (
        /* Loading Skeleton */
        <div className="flex gap-3 sm:gap-4 overflow-hidden py-2">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="w-[calc(50%-8px)] min-w-[155px] max-w-[210px] sm:w-[210px] md:w-[220px] lg:w-[230px] shrink-0 bg-white rounded-xl p-3 border border-slate-200/90 animate-pulse space-y-3"
            >
              <div className="bg-[#faf5ff] aspect-square rounded-lg w-full" />
              <div className="h-3 bg-slate-100 rounded w-2/3 mx-auto" />
              <div className="h-7 bg-slate-200 rounded-lg w-full" />
            </div>
          ))}
        </div>
      ) : (
        /* Brands in Horizontal Scrollable Row */
        <div
          ref={scrollRef}
          className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-3 sm:gap-4 py-2 px-0.5 select-none"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {brands.map((brand) => {
            const imageUrl = brand.image_path ? resolveImageUrl(brand.image_path) : null
            const offerLabel =
              brand.offer_text?.trim() ||
              (brand.min_price ? `From ₹${Math.round(Number(brand.min_price))}` : 'Explore Brand')

            return (
              <div
                key={brand.id}
                className="w-[calc(50%-8px)] min-w-[155px] max-w-[210px] sm:w-[210px] md:w-[220px] lg:w-[230px] shrink-0"
              >
                <div
                  onClick={() => navigate(`/products?brand_id=${brand.id}`)}
                  className="bg-white rounded-xl p-3 border border-slate-200/90 hover:border-[#c4b5fd] hover:shadow-md transition-all duration-200 flex flex-col justify-between group cursor-pointer h-full select-none"
                >
                  <div>
                    {/* Brand Image / Logo Box */}
                    <div className="relative rounded-lg overflow-hidden bg-[#faf5ff] aspect-square mb-2.5 flex items-center justify-center p-2.5 border border-[#f5f3ff]">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={brand.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-white border border-[#ede9fe] flex items-center justify-center font-black text-[#6d28d9] text-xl uppercase">
                          {brand.name.slice(0, 2)}
                        </div>
                      )}

                      {/* Brand Pill in App's Soft Lavender */}
                      <span className="absolute top-1.5 left-1.5 bg-[#ede9fe] text-[#6d28d9] border border-[#ddd6fe] font-black text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded shadow-2xs z-10 tracking-wide uppercase">
                        Brand
                      </span>
                    </div>

                    {/* Brand Name */}
                    <h3 className="text-xs sm:text-sm font-bold text-slate-800 text-center truncate leading-snug group-hover:text-[#6d28d9] transition-colors mb-0.5">
                      {brand.name}
                    </h3>
                  </div>

                  {/* Bottom: Action Banner (Uses Store's Black Button Styling) */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100">
                    <div className="w-full py-1.5 px-3 rounded-lg font-bold text-xs bg-black hover:bg-neutral-800 text-white shadow-2xs flex items-center justify-center gap-1.5 transition-colors tracking-tight">
                      <span className="truncate">{offerLabel}</span>
                      <span className="text-xs shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
