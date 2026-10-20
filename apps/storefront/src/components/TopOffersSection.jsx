import React, { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiArrowRight, FiCopy, FiCheck, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import Button from './common/Button'

/**
 * Top Offers for You Section
 * Displays offer banners created by Admin in a sleek single-row slider.
 * Clicking any offer navigates directly to /products?offer_id={id}
 * where the mapped products are displayed in the full catalog grid.
 */
export default function TopOffersSection({
  topOffers = [],
  deliverySettings = null,
  activeOffers = [],
  isLoading = false,
}) {
  const navigate = useNavigate()
  const [copiedCode, setCopiedCode] = useState(null)
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
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScrollBounds, { passive: true })
    window.addEventListener('resize', checkScrollBounds)
    return () => {
      el.removeEventListener('scroll', checkScrollBounds)
      window.removeEventListener('resize', checkScrollBounds)
    }
  }, [topOffers])

  const handleScroll = (direction) => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const card = container.querySelector('[data-offer-card]')
    const scrollAmount = card ? card.offsetWidth + 16 : container.clientWidth / 4
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const handleCopyCode = (code) => {
    if (!code) return
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(code).catch(() => {})
    }
    setCopiedCode(code)
    setTimeout(() => {
      setCopiedCode((prev) => (prev === code ? null : prev))
    }, 2500)
  }

  // 4 Rotating visual themes for styling dynamic cards
  const CARD_THEMES = [
    {
      bgGradient: 'from-[#E0F7FA]/80 via-[#E8F8FC]/70 to-[#DCFCE7]/60 border-emerald-100',
      badgeBg: 'bg-[#E0F2FE] text-[#0284C7]',
      btnVariant: 'primary',
      btnCustomClass: '',
    },
    {
      bgGradient: 'from-[#FFEDD5]/80 via-[#FFF1F2]/70 to-[#FEE2E2]/60 border-rose-100',
      badgeBg: 'bg-rose-100 text-rose-600',
      btnVariant: 'secondary',
      btnCustomClass: 'bg-rose-600 hover:bg-rose-700 text-white',
    },
    {
      bgGradient: 'from-[#E0F2FE]/85 via-[#F0F9FF]/75 to-[#E0F7FA]/60 border-sky-100',
      badgeBg: 'bg-sky-100 text-sky-700',
      btnVariant: 'primary',
      btnCustomClass: '',
    },
    {
      bgGradient: 'from-[#F3E8FF]/80 via-[#FAF5FF]/75 to-[#EDE9FE]/60 border-purple-100',
      badgeBg: 'bg-purple-100 text-purple-700',
      btnVariant: 'primary',
      btnCustomClass: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
  ]

  const renderIcon = (icon) => {
    switch (icon) {
      case 'truck':
        return '🚚'
      case 'tag':
        return '🏷️'
      case 'percent':
        return '％'
      case 'gift':
        return '🎁'
      case 'zap':
        return '⚡'
      case 'star':
        return '⭐'
      default:
        return '🏷️'
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  // If no top offers exist in database, do not render any cards
  if (!Array.isArray(topOffers) || topOffers.length === 0) {
    return null
  }

  const hasMultipleOffers = topOffers.length > 4

  return (
    <section className="w-full py-4 sm:py-6 select-none relative">
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 lg:px-8">
        
        {/* Header: 🔥 Top Offers for You + Prev/Next Controls + View More Deals */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">🔥</span>
            <h2 className="font-sans text-base sm:text-lg font-black text-[var(--color-text-main)] tracking-tight">
              Top Offers for You
            </h2>
            {topOffers.length > 4 && (
              <span className="text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200/80 px-2 py-0.5 rounded-full ml-1">
                {topOffers.length} Deals
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Prev / Next buttons when more than 4 offers exist */}
            {hasMultipleOffers && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleScroll('left')}
                  disabled={!canScrollLeft}
                  aria-label="Previous offers"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center transition-all ${
                    canScrollLeft
                      ? 'bg-white hover:bg-purple-50 text-slate-800 hover:text-purple-700 border-slate-300 hover:border-purple-300 shadow-2xs cursor-pointer active:scale-95'
                      : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed opacity-40'
                  }`}
                  title="Previous offers"
                >
                  <FiChevronLeft className="w-4 h-4 stroke-[2.5]" />
                </button>

                <button
                  type="button"
                  onClick={() => handleScroll('right')}
                  disabled={!canScrollRight}
                  aria-label="Next offers"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center transition-all ${
                    canScrollRight
                      ? 'bg-white hover:bg-purple-50 text-slate-800 hover:text-purple-700 border-slate-300 hover:border-purple-300 shadow-2xs cursor-pointer active:scale-95'
                      : 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed opacity-40'
                  }`}
                  title="Next offers"
                >
                  <FiChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
            )}

            <Link
              to={ROUTES.PRODUCTS_BY_SECTION('deals')}
              className="text-xs sm:text-[13px] font-sans font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1 transition-colors"
            >
              <span>View More Deals</span>
              <FiArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Carousel Container: Exactly 4 cards visible on desktop, no bottom row */}
        <div className="relative group/carousel">
          {/* Floating Left Arrow (Desktop / Tablet) */}
          {hasMultipleOffers && canScrollLeft && (
            <button
              type="button"
              onClick={() => handleScroll('left')}
              aria-label="Previous offers"
              className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95"
            >
              <FiChevronLeft className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}

          {/* Cards Track (Single horizontal row, never wraps underneath) */}
          <div
            ref={scrollRef}
            className="flex flex-nowrap overflow-x-auto scroll-smooth no-scrollbar gap-3.5 sm:gap-4 py-1 select-none"
            style={{
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {topOffers.map((card, idx) => {
              const theme = CARD_THEMES[idx % CARD_THEMES.length]
              const isCopied = copiedCode === card.code
              const targetLink = ROUTES.PRODUCTS_BY_OFFER(card.id)

              let imageUrl = null
              if (card.image_path) {
                if (
                  card.image_path.startsWith('http://') ||
                  card.image_path.startsWith('https://') ||
                  card.image_path.startsWith('/images/')
                ) {
                  imageUrl = card.image_path
                } else {
                  imageUrl = resolveImageUrl(card.image_path)
                }
              }

              const mappedCount = Array.isArray(card.products)
                ? card.products.length
                : Array.isArray(card.product_ids)
                ? card.product_ids.length
                : 0

              return (
                <div
                  key={card.id || `live-offer-${idx}`}
                  data-offer-card="true"
                  onClick={() => navigate(targetLink)}
                  className={`w-[calc(100%-24px)] min-w-[270px] sm:w-[calc(50%-10px)] lg:w-[calc(25%-12px)] shrink-0 rounded-2xl p-4 sm:p-4.5 border bg-gradient-to-br ${theme.bgGradient} shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between relative overflow-hidden group min-h-[175px] cursor-pointer hover:scale-[1.01] active:scale-[0.99]`}
                >
                  <div>
                    {/* Badge & Icon Header */}
                    <div className="flex items-center justify-between mb-2">
                      {card.badge && (
                        <span
                          className={`text-[9.5px] sm:text-[10px] font-sans font-extrabold uppercase px-2 py-0.5 rounded shadow-2xs ${theme.badgeBg}`}
                        >
                          {card.badge}
                        </span>
                      )}
                      <span className="text-xl opacity-90">
                        {renderIcon(card.icon)}
                      </span>
                    </div>

                    {/* Title & Subtitle */}
                    <h3 className="font-sans text-xs sm:text-[13px] font-extrabold text-[var(--color-text-main)] leading-snug mb-1 group-hover:text-purple-700 transition-colors">
                      {card.title}
                    </h3>
                    {card.subtitle && (
                      <p className="font-sans text-[11px] text-slate-600 leading-relaxed line-clamp-2 mb-2">
                        {card.subtitle}
                      </p>
                    )}

                    {/* Coupon Code Pill */}
                    {card.code && (
                      <div className="mb-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyCode(card.code)
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                            isCopied
                              ? 'bg-emerald-600 text-white border-emerald-700'
                              : 'bg-white/90 text-purple-700 border-purple-200 hover:bg-white shadow-2xs'
                          }`}
                          title="Click to copy coupon code"
                        >
                          {isCopied ? (
                            <>
                              <FiCheck className="w-3 h-3 stroke-[2.5]" />
                              <span>COPIED</span>
                            </>
                          ) : (
                            <>
                              <FiCopy className="w-2.5 h-2.5" />
                              <span>CODE : {card.code}</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Bottom Row: Shop Deals Button + Image Preview */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/5 mt-auto">
                    <div className="flex flex-col items-start">
                      <Button
                        variant={theme.btnVariant || 'primary'}
                        size="xs"
                        rounded="full"
                        to={targetLink}
                        icon={<FiArrowRight className="w-3 h-3" />}
                        iconPosition="right"
                        className={theme.btnCustomClass || ''}
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(targetLink)
                        }}
                      >
                        {card.button_text || 'Shop Deals'}
                      </Button>
                      {mappedCount > 0 && (
                        <span className="text-[9.5px] font-semibold text-slate-500 mt-1">
                          {mappedCount} items included
                        </span>
                      )}
                    </div>

                    {/* Visual: Image or Icon */}
                    <div className="shrink-0 w-20 h-16 sm:w-22 sm:h-16 flex items-center justify-end">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={card.title}
                          className="max-h-16 max-w-full object-contain mix-blend-multiply drop-shadow-xs group-hover:scale-108 transition-transform duration-200"
                        />
                      ) : (
                        <span className="text-3xl opacity-80 group-hover:scale-110 transition-transform duration-200">
                          {renderIcon(card.icon)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Floating Right Arrow (Desktop / Tablet) */}
          {hasMultipleOffers && canScrollRight && (
            <button
              type="button"
              onClick={() => handleScroll('right')}
              aria-label="Next offers"
              className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-white/95 hover:bg-white text-slate-800 shadow-md border border-slate-200 items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 animate-pulse hover:animate-none"
            >
              <FiChevronRight className="w-4 h-4 stroke-[2.5]" />
            </button>
          )}
        </div>

      </div>
    </section>
  )
}