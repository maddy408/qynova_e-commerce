import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { FiChevronLeft, FiChevronRight, FiArrowRight } from 'react-icons/fi'

export default function TopBrandsSection({
  brands = [],
  isLoading = false,
  title = 'Most Loved Brands',
  subtitle = 'Top verified grocery brands with exclusive offers and daily savings',
  id = 'top-brands-section',
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
  }, [brands, isLoading])

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

  const hasBrands = Array.isArray(brands) && brands.length > 0

  if (!isLoading && !hasBrands) {
    return null
  }

  return (
    <section
      id={id}
      className="w-full py-14 sm:py-18 lg:py-24 overflow-hidden relative bg-white border-b border-[#E9DFFF]/70 select-none"
    >
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* SECTION HEADER */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 sm:mb-12">
          <div className="max-w-2xl">
            <div className="mb-3">
              <span className="text-[13px] font-sans font-bold uppercase tracking-[0.2em] text-[#6C4EFF] inline-block">
                TOP SUPERMARKET BRANDS
              </span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-[46px] font-bold text-[#1B133F] tracking-tight leading-[1.15] mb-4">
              {title}
            </h2>

            {subtitle && (
              <p className="font-sans text-base sm:text-[17px] text-[#666666] leading-[1.6]">
                {subtitle}
              </p>
            )}
          </div>

          {/* Carousel Arrows + View All */}
          <div className="flex items-center gap-3 sm:gap-4 self-start md:self-end shrink-0">
            {hasBrands && (
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

            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white hover:bg-[#F3EDFF] text-[#6C4EFF] hover:text-[#4B2AC5] border border-[#E9DFFF] hover:border-[#BFA2FF] font-sans text-xs sm:text-sm font-semibold tracking-wide transition-all shadow-xs cursor-pointer"
            >
              <span>Explore All Brands</span>
              <FiArrowRight className="w-4 h-4 stroke-[2.2]" />
            </Link>
          </div>
        </div>

        {/* Brand Track: 4 CARDS PER ROW ON DESKTOP */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6">
            {[1, 2, 3, 4].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-[24px] p-6 border border-[#E9DFFF] animate-pulse space-y-4"
              >
                <div className="h-44 bg-[#FAF8FF] rounded-[18px]" />
                <div className="h-5 bg-[#F3EDFF] rounded w-2/3 mx-auto" />
                <div className="h-10 bg-[#FAF8FF] rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-4 sm:gap-5 lg:gap-6 py-2 px-1 select-none"
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
                  className="w-[calc(100%-24px)] min-w-[240px] sm:w-[calc(50%-12px)] md:w-[calc(33.333%-14px)] lg:w-[calc(25%-18px)] shrink-0"
                >
                  <div
                    onClick={() => navigate(`/products?brand_id=${brand.id}`)}
                    className="bg-[#FAF8FF] hover:bg-white rounded-[24px] p-6 sm:p-7 border border-[#E9DFFF] hover:border-[#BFA2FF] shadow-[0_6px_25px_rgba(108,78,255,0.04)] hover:shadow-[0_16px_35px_rgba(108,78,255,0.1)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group cursor-pointer h-full"
                  >
                    <div>
                      {/* Brand Logo Box with Radial Lavender Glow */}
                      <div className="relative rounded-[18px] overflow-hidden bg-[radial-gradient(circle_at_center,#FFFFFF_0%,#F3EDFF_100%)] h-44 mb-5 flex items-center justify-center p-6 border border-[#E9DFFF]/40">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={brand.name}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-white border border-[#E9DFFF] shadow-xs flex items-center justify-center font-serif font-bold text-[#6C4EFF] text-2xl uppercase">
                            {brand.name.slice(0, 2)}
                          </div>
                        )}

                        <span className="absolute top-3 left-3 bg-white/95 text-[#6C4EFF] border border-[#E9DFFF] font-sans font-bold text-[10px] tracking-wider uppercase px-2.5 py-0.5 rounded-full shadow-xs">
                          Brand
                        </span>
                      </div>

                      {/* Brand Name */}
                      <h3 className="font-serif text-lg sm:text-xl font-bold text-[#1B133F] text-center truncate group-hover:text-[#6C4EFF] transition-colors mb-1">
                        {brand.name}
                      </h3>
                      <p className="font-sans text-xs text-[#666666] text-center truncate mb-4">
                        Verified Store Brand
                      </p>
                    </div>

                    {/* Bottom Pill CTA */}
                    <div className="pt-4 border-t border-[#E9DFFF]/60">
                      <div className="w-full py-2.5 px-4 rounded-full bg-white group-hover:bg-[#6C4EFF] text-[#6C4EFF] group-hover:text-white border border-[#E9DFFF] group-hover:border-[#6C4EFF] font-sans text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all duration-200">
                        <span className="truncate">{offerLabel}</span>
                        <FiArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </section>
  )
}
