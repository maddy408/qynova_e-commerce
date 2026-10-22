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
    const cardWidth = scrollRef.current.clientWidth >= 1280
      ? scrollRef.current.clientWidth / 8
      : scrollRef.current.clientWidth >= 1024
      ? scrollRef.current.clientWidth / 6
      : scrollRef.current.clientWidth >= 640
      ? scrollRef.current.clientWidth / 5
      : scrollRef.current.clientWidth / 3.5
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

        {/* Brand Track: logo-only circles, as many per row as fit */}
        {isLoading ? (
          <div className="flex flex-wrap gap-4 sm:gap-5 lg:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <div
                key={idx}
                className="w-22 h-22 sm:w-28 sm:h-28 lg:w-[140px] lg:h-[140px] rounded-full bg-[#FAF8FF] border border-[#E9DFFF] animate-pulse shrink-0"
              />
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
              const brandNameLower = (brand.name || '').toLowerCase()
              const localBrandFallback =
                brandNameLower.includes('nivea') ? '/images/brands/nivea.png' :
                brandNameLower.includes('dettol') ? '/images/brands/dettol.png' :
                brandNameLower.includes('fortune') ? '/images/brands/fortune.png' :
                brandNameLower.includes('britannia') ? '/images/brands/britannia.png' :
                brandNameLower.includes('maggi') ? '/images/brands/maggi.png' :
                brandNameLower.includes('amul') ? '/images/brands/amul.png' :
                brandNameLower.includes('tata') ? '/images/brands/tata.png' :
                brandNameLower.includes('dabur') ? '/images/brands/dabur.png' :
                brandNameLower.includes('dove') ? '/images/brands/dove.png' :
                brandNameLower.includes('gold winner') ? '/images/brands/gold_winner.png' :
                brandNameLower.includes('aashirvaad') ? '/images/brands/aashirvaad.png' : null

              const imageUrl = brand.image_path ? resolveImageUrl(brand.image_path) : localBrandFallback

              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => navigate(`/products?brand_id=${brand.id}`)}
                  aria-label={`Shop ${brand.name}`}
                  title={brand.name}
                  className="group shrink-0 w-22 h-22 sm:w-28 sm:h-28 lg:w-[140px] lg:h-[140px] rounded-full bg-white border border-[#E9DFFF] hover:border-[#BFA2FF] shadow-[0_4px_16px_rgba(108,78,255,0.06)] hover:shadow-[0_10px_28px_rgba(108,78,255,0.14)] hover:scale-105 transition-all duration-300 flex items-center justify-center p-3.5 sm:p-5 cursor-pointer"
                >
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={brand.name}
                      onError={(e) => {
                        if (localBrandFallback && e.target.src !== window.location.origin + localBrandFallback) {
                          e.target.src = localBrandFallback
                        }
                      }}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <span className="font-serif font-bold text-[#6C4EFF] text-xl sm:text-2xl uppercase">
                      {brand.name.slice(0, 2)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

      </div>
    </section>
  )
}
