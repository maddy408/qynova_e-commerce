import React, { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'
import { 
  FiShoppingBag, 
  FiGift, 
  FiBox, 
  FiTag, 
  FiShoppingCart, 
  FiSmile, 
  FiHeart, 
  FiChevronLeft, 
  FiChevronRight,
  FiArrowRight 
} from 'react-icons/fi'
import { TbBottle, TbSparkles } from 'react-icons/tb'
import { LuMilk, LuSparkles } from 'react-icons/lu'
import { FaCarrot } from 'react-icons/fa6'

// Clean category icon mapping with soft pastel purple & lavender visual palettes
function getCategoryVisual(cat) {
  const name = (cat.name || cat.slug || '').toLowerCase()
  if (name.includes('fruit') || name.includes('veg')) return { icon: <FaCarrot className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f5f3ff] text-[#6d28d9] border-[#e9d5ff]' }
  if (name.includes('dairy') || name.includes('milk') || name.includes('breakfast')) return { icon: <LuMilk className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#faf5ff] text-[#7c3aed] border-[#ede9fe]' }
  if (name.includes('staple') || name.includes('pulse') || name.includes('atta') || name.includes('rice') || name.includes('dal')) return { icon: <FiBox className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f5f3ff] text-[#6d28d9] border-[#e9d5ff]' }
  if (name.includes('snack') || name.includes('munch') || name.includes('biscuit')) return { icon: <TbSparkles className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#faf5ff] text-[#8b5cf6] border-[#ede9fe]' }
  if (name.includes('beverage') || name.includes('drink') || name.includes('juice') || name.includes('tea')) return { icon: <TbBottle className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f3e8ff] text-[#6d28d9] border-[#e9d5ff]' }
  if (name.includes('personal') || name.includes('care') || name.includes('soap') || name.includes('shampoo')) return { icon: <TbBottle className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#ede9fe] text-[#7c3aed] border-[#ddd6fe]' }
  if (name.includes('house') || name.includes('clean') || name.includes('utility') || name.includes('storage')) return { icon: <FiBox className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f5f3ff] text-[#6d28d9] border-[#e9d5ff]' }
  if (name.includes('combo') || name.includes('offer')) return { icon: <FiTag className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#ede9fe] text-[#6d28d9] border-[#ddd6fe]' }
  if (name.includes('beauty') || name.includes('cosmetic')) return { icon: <LuSparkles className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#faf5ff] text-[#7c3aed] border-[#ede9fe]' }
  if (name.includes('gift')) return { icon: <FiGift className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f3e8ff] text-[#6d28d9] border-[#ddd6fe]' }
  if (name.includes('toy')) return { icon: <FiSmile className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#faf5ff] text-[#8b5cf6] border-[#ede9fe]' }
  if (name.includes('hair') || name.includes('jewel') || name.includes('fashion')) return { icon: <FiHeart className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#ede9fe] text-[#6d28d9] border-[#ddd6fe]' }
  if (name.includes('bag') || name.includes('pouch')) return { icon: <FiShoppingBag className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f5f3ff] text-[#7c3aed] border-[#e9d5ff]' }
  return { icon: <FiShoppingCart className="w-6 h-6 sm:w-8 sm:h-8" />, bg: 'bg-[#f5f3ff] text-[#6d28d9] border-[#e9d5ff]' }
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
    <section className="w-full bg-white border-b border-[#e9d5ff] py-4 sm:py-5 px-3 sm:px-6 lg:px-8 xl:px-12 select-none">
      <div className="w-full relative">
        {/* Scroll Left Button */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll('left')}
            className="hidden sm:flex absolute -left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow-md border border-[#e9d5ff] text-slate-700 hover:text-[#7c3aed] items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
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
            className="hidden sm:flex absolute -right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow-md border border-[#e9d5ff] text-slate-700 hover:text-[#7c3aed] items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Scroll categories right"
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Category Circular Row */}
        <div
          ref={scrollRef}
          className="flex items-start gap-4 sm:gap-6 lg:gap-8 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1 justify-start xl:justify-between"
        >
          {isLoading
            ? Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex flex-col items-center gap-2 shrink-0 animate-pulse w-20">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#f5f3ff]" />
                  <div className="h-2.5 w-14 bg-slate-200 rounded" />
                </div>
              ))
            : (
                <>
                  {(categories || []).slice(0, 5).map((cat) => {
                    const visual = getCategoryVisual(cat)
                    const imageSrc = cat.image_path ? resolveImageUrl(cat.image_path) : null

                    return (
                      <Link
                        key={cat.id}
                        to={ROUTES.PRODUCTS_BY_CATEGORY(cat.id)}
                        className="group flex flex-col items-center shrink-0 w-20 sm:w-24 text-center cursor-pointer transition-transform hover:-translate-y-1"
                        title={cat.name}
                      >
                        {/* Circular Avatar */}
                        <div
                          className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full ${visual.bg} border-2 border-transparent group-hover:border-[#7c3aed] shadow-2xs group-hover:shadow-md transition-all duration-300 flex items-center justify-center overflow-hidden p-2 relative`}
                        >
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={cat.name}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <div className="group-hover:scale-110 transition-transform duration-300">
                              {visual.icon}
                            </div>
                          )}
                        </div>

                        {/* Small Compact Title */}
                        <span className="mt-2 text-[11px] sm:text-xs font-semibold text-slate-800 group-hover:text-[#7c3aed] transition-colors line-clamp-2 max-w-[84px] sm:max-w-[96px] leading-tight">
                          {cat.name}
                        </span>
                      </Link>
                    )
                  })}

                  {/* View All Categories Circle */}
                  <Link
                    to={ROUTES.PRODUCTS}
                    className="group flex flex-col items-center shrink-0 w-20 sm:w-24 text-center cursor-pointer transition-transform hover:-translate-y-1"
                    title="View All Categories"
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#faf5ff] border-2 border-[#e9d5ff] group-hover:border-[#7c3aed] group-hover:bg-[#ede9fe] shadow-2xs group-hover:shadow-md transition-all duration-300 flex items-center justify-center text-slate-600 group-hover:text-[#7c3aed]">
                      <FiArrowRight className="w-5 h-5 transform group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <span className="mt-2 text-[11px] sm:text-xs font-bold text-slate-700 group-hover:text-[#7c3aed] transition-colors leading-tight">
                      View All
                    </span>
                  </Link>
                </>
              )}
        </div>
      </div>
    </section>
  )
}
