import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { getCategoryPalette } from '../lib/catalogData'

export default function CategoriesSection({
  title = 'Shop by Category',
  subtitle,
  badgeText = 'COLLECTIONS',
  categories = [],
  viewAllLink = '/products',
  isLoading = false,
  id = 'categories-section',
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
  }, [categories, isLoading])

  const handleScroll = (direction) => {
    if (!scrollRef.current) return
    const scrollAmount = scrollRef.current.clientWidth * 0.75
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const hasCategories = Array.isArray(categories) && categories.length > 0

  if (!isLoading && !hasCategories) {
    return null
  }

  return (
    <section id={id} className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4 sm:mb-5">
        <div>
          {badgeText && (
            <div className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-[#F2DDE9] text-[#601D49]">
                {badgeText}
              </span>
            </div>
          )}
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#2D252B] tracking-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[#6B5E68] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
          {hasCategories && (
            <div className="hidden sm:flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleScroll('left')}
                disabled={!canScrollLeft}
                aria-label={`Scroll ${title} left`}
                className={`w-9 h-9 rounded-full border border-[#E8E0E5] flex items-center justify-center transition-all ${
                  canScrollLeft
                    ? 'bg-white hover:bg-[#F2DDE9] text-[#2D252B] shadow-sm cursor-pointer hover:border-[#601D49] active:scale-95'
                    : 'bg-[#F8F3F6] text-[#6B5E68]/40 border-[#E8E0E5] cursor-not-allowed opacity-50'
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
                className={`w-9 h-9 rounded-full border border-[#E8E0E5] flex items-center justify-center transition-all ${
                  canScrollRight
                    ? 'bg-white hover:bg-[#F2DDE9] text-[#2D252B] shadow-sm cursor-pointer hover:border-[#601D49] active:scale-95'
                    : 'bg-[#F8F3F6] text-[#6B5E68]/40 border-[#E8E0E5] cursor-not-allowed opacity-50'
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {viewAllLink && (
            <Link
              to={viewAllLink}
              className="inline-flex items-center gap-1 text-xs font-black text-[#601D49] hover:text-[#4D153A] hover:underline px-3 py-1.5 rounded-full hover:bg-[#F2DDE9] transition-colors shrink-0"
            >
              <span>View All</span>
              <span className="text-sm">→</span>
            </Link>
          )}
        </div>
      </div>

      {/* Track */}
      {isLoading ? (
        <div className="flex gap-3.5 sm:gap-4 overflow-hidden py-2">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div
              key={idx}
              className="w-32 sm:w-36 shrink-0 bg-white rounded-2xl p-3 border border-[#E8E0E5] animate-pulse space-y-2.5 flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 rounded-full bg-[#F2DDE9]/60" />
              <div className="h-3 bg-[#F2DDE9]/70 rounded w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-3 sm:gap-4 py-2 px-0.5 select-none"
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {categories.map((cat, idx) => {
            const img = cat.image_path || cat.thumb_path ? resolveImageUrl(cat.image_path || cat.thumb_path) : null

            return (
              <div
                key={cat.id}
                onClick={() => navigate(`/products?category_id=${cat.id}`)}
                className="w-32 sm:w-36 shrink-0 rounded-2xl p-3 sm:p-4 border border-[#E8E0E5] transition-all duration-300 cursor-pointer flex flex-col items-center text-center group bg-white hover:shadow-md hover:border-[#601D49]"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden bg-[#F7F5F7] border-2 border-[#E8E0E5] group-hover:border-[#601D49] transition-colors flex items-center justify-center mb-2.5 shadow-xs">
                  {img ? (
                    <img
                      src={img}
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xl sm:text-2xl font-black text-[#601D49]">
                      {cat.name.charAt(0)}
                    </span>
                  )}
                </div>

                <h3 className="text-xs sm:text-sm font-bold text-[#2D252B] group-hover:text-[#601D49] transition-colors line-clamp-1">
                  {cat.name}
                </h3>
                {cat.product_count !== undefined && (
                  <span className="text-[10px] text-[#6B5E68] mt-0.5 font-medium">
                    {cat.product_count} {cat.product_count === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
