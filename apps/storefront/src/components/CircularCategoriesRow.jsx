import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'
import { 
  FiChevronLeft, 
  FiChevronRight,
  FiArrowRight,
  FiShoppingBag,
  FiBox,
  FiTag,
  FiShoppingCart
} from 'react-icons/fi'
import { FaCarrot } from 'react-icons/fa6'
import { LuMilk, LuSparkles } from 'react-icons/lu'
import { TbBottle, TbSparkles } from 'react-icons/tb'

function getCategoryVisual(cat) {
  const name = (cat.name || cat.slug || '').toLowerCase()
  if (name.includes('fruit') || name.includes('veg')) {
    return { icon: <FaCarrot className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  if (name.includes('dairy') || name.includes('milk') || name.includes('breakfast')) {
    return { icon: <LuMilk className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  if (name.includes('staple') || name.includes('pulse') || name.includes('atta') || name.includes('rice') || name.includes('dal')) {
    return { icon: <FiBox className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  if (name.includes('snack') || name.includes('munch') || name.includes('biscuit')) {
    return { icon: <TbSparkles className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  if (name.includes('beverage') || name.includes('drink') || name.includes('juice') || name.includes('tea')) {
    return { icon: <TbBottle className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  if (name.includes('personal') || name.includes('care') || name.includes('clean') || name.includes('soap')) {
    return { icon: <TbBottle className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  if (name.includes('combo') || name.includes('offer')) {
    return { icon: <FiTag className="w-7 h-7 text-[#6C4EFF]" /> }
  }
  return { icon: <FiShoppingCart className="w-7 h-7 text-[#6C4EFF]" /> }
}

export default function CircularCategoriesRow({
  categories = [],
  isLoading = false,
}) {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScrollBounds = () => {
    if (!scrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
    setCanScrollLeft(scrollLeft > 6)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6)
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

  const scroll = (direction) => {
    if (!scrollRef.current) return
    const amount = scrollRef.current.clientWidth * 0.7
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    })
  }

  if (!isLoading && (!categories || categories.length === 0)) {
    return null
  }

  return (
    <section className="w-full bg-white border-b border-[#E9DFFF] py-8 sm:py-10 select-none">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#6C4EFF]" />
            <span className="text-[12px] font-sans font-bold uppercase tracking-[0.2em] text-[#6C4EFF]">
              SHOP BY CATEGORY
            </span>
          </div>

          <Link
            to={ROUTES.PRODUCTS}
            className="text-xs font-sans font-semibold text-[#6C4EFF] hover:text-[#4B2AC5] flex items-center gap-1 transition-colors"
          >
            <span>View All Categories</span>
            <FiArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Scroll Left Button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white shadow-md border border-[#E9DFFF] text-[#1B133F] hover:text-[#6C4EFF] items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Scroll categories left"
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Scroll Right Button */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll('right')}
            className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white shadow-md border border-[#E9DFFF] text-[#1B133F] hover:text-[#6C4EFF] items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Scroll categories right"
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Category Circular Row */}
        <div
          ref={scrollRef}
          className="flex items-start gap-5 sm:gap-8 lg:gap-10 overflow-x-auto no-scrollbar scroll-smooth py-2 px-1 justify-start xl:justify-between"
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2.5 shrink-0 animate-pulse w-24">
                  <div className="w-20 h-20 rounded-full bg-[#FAF8FF] border border-[#E9DFFF]" />
                  <div className="h-3 w-16 bg-[#F3EDFF] rounded" />
                </div>
              ))
            : (
                <>
                  {(categories || []).map((cat) => {
                    const visual = getCategoryVisual(cat)
                    const slugOrName = (cat.slug || cat.name || '').toLowerCase().replace(/[^a-z0-9]/g, '-')
                    const localFallback = 
                      cat.slug?.includes('hair') ? '/images/categories/hair_accessories.jpg' :
                      cat.slug?.includes('jewel') ? '/images/categories/jewellery_fashion.jpg' :
                      cat.slug?.includes('gift') ? '/images/categories/gift_items.jpg' :
                      cat.slug?.includes('toy') ? '/images/categories/toys.jpg' :
                      cat.slug?.includes('bag') ? '/images/categories/bags_pouches.jpg' :
                      cat.slug?.includes('beauty') ? '/images/categories/beauty_accessories.jpg' :
                      cat.slug?.includes('storage') ? '/images/categories/storage_utility.jpg' :
                      cat.slug?.includes('combo') ? '/images/categories/combo_offers.jpg' : null

                    const imageSrc = cat.image_path ? resolveImageUrl(cat.image_path) : localFallback

                    return (
                      <Link
                        key={cat.id}
                        to={ROUTES.PRODUCTS_BY_CATEGORY(cat)}
                        className="group flex flex-col items-center shrink-0 w-24 sm:w-28 text-center cursor-pointer transition-transform hover:-translate-y-1"
                        title={cat.name}
                      >
                        {/* Circular Avatar with Lavender Radial Glow */}
                        <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-[radial-gradient(circle_at_center,#FFFFFF_0%,#F3EDFF_100%)] border border-[#E9DFFF] group-hover:border-[#6C4EFF] shadow-[0_4px_16px_rgba(108,78,255,0.06)] group-hover:shadow-[0_8px_24px_rgba(108,78,255,0.14)] transition-all duration-300 flex items-center justify-center overflow-hidden p-0 relative">
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={cat.name}
                              onError={(e) => {
                                if (localFallback && e.target.src !== window.location.origin + localFallback) {
                                  e.target.src = localFallback
                                }
                              }}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="group-hover:scale-110 transition-transform duration-300 p-3">
                              {visual.icon}
                            </div>
                          )}
                        </div>

                        {/* Title in Inter font */}
                        <span className="mt-3 text-xs sm:text-[13px] font-sans font-semibold text-[#1B133F] group-hover:text-[#6C4EFF] transition-colors line-clamp-1 max-w-[100px] leading-tight">
                          {cat.name}
                        </span>
                      </Link>
                    )
                  })}

                  {/* View All Circle */}
                  <Link
                    to={ROUTES.PRODUCTS}
                    className="group flex flex-col items-center shrink-0 w-24 sm:w-28 text-center cursor-pointer transition-transform hover:-translate-y-1"
                    title="View All Categories"
                  >
                    <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full bg-[#FAF8FF] border border-[#E9DFFF] group-hover:border-[#6C4EFF] group-hover:bg-[#F3EDFF] shadow-xs group-hover:shadow-md transition-all duration-300 flex items-center justify-center text-[#6C4EFF]">
                      <FiArrowRight className="w-6 h-6 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                    <span className="mt-3 text-xs sm:text-[13px] font-sans font-semibold text-[#6C4EFF] transition-colors leading-tight">
                      All Items
                    </span>
                  </Link>
                </>
              )}
        </div>
      </div>
    </section>
  )
}
