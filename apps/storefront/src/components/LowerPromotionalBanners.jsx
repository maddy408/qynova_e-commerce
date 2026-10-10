import React, { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'

// Admin-managed banner theme presets — preserved untouched
const THEME_MAP = {
  purple: {
    gradient: 'from-[#8B5CF6] via-[#7C4DE8] to-[#7042D2]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonBg: 'from-white to-[#EDE5FF] text-[#7042D2] font-black',
    subtitleColor: 'text-[#EDE5FF]',
  },
  blue: {
    gradient: 'from-[#0A192F] via-[#1E3A8A] to-[#0284C7]',
    badgeBg: 'bg-cyan-500/25 text-cyan-200 border-cyan-400/40',
    buttonBg: 'from-[#06B6D4] to-[#38BDF8] text-slate-950 font-black',
    subtitleColor: 'text-cyan-200',
  },
  orange: {
    gradient: 'from-[#431407] via-[#9A3412] to-[#EA580C]',
    badgeBg: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
    buttonBg: 'from-[#F59E0B] to-[#F97316] text-white',
    subtitleColor: 'text-amber-200',
  },
  pink: {
    gradient: 'from-[#4C0519] via-[#831843] to-[#BE185D]',
    badgeBg: 'bg-rose-400/25 text-rose-200 border-rose-300/40',
    buttonBg: 'from-[#FB7185] to-[#F43F5E] text-white',
    subtitleColor: 'text-rose-200',
  },
  teal: {
    gradient: 'from-[#042F2E] via-[#115E59] to-[#0D9488]',
    badgeBg: 'bg-teal-400/25 text-teal-200 border-teal-300/40',
    buttonBg: 'from-[#14B8A6] to-[#2DD4BF] text-slate-950 font-black',
    subtitleColor: 'text-teal-200',
  },
  lavender: {
    gradient: 'from-[#7042D2] via-[#8B5CF6] to-[#A78BFA]',
    badgeBg: 'bg-white/25 text-white border-white/35',
    buttonBg: 'from-white to-[#EDE5FF] text-[#7042D2] font-black',
    subtitleColor: 'text-[#EDE5FF]',
  },
}

export default function LowerPromotionalBanners({
  banners = [],
  isLoading = false,
  title = '',
  subtitle = '',
  badgeText = '',
  id = 'lower-promotional-banners',
}) {
  const navigate = useNavigate()
  const scrollContainerRef = useRef(null)

  // Filter only active banners from database
  const activeBanners = useMemo(() => {
    return Array.isArray(banners)
      ? banners.filter((b) => Number(b.is_active) === 1)
      : []
  }, [banners])

  const handleNavigate = (banner) => {
    if (!banner) return

    if (banner.target_link) {
      if (banner.target_link.startsWith('http://') || banner.target_link.startsWith('https://')) {
        window.open(banner.target_link, '_blank', 'noopener,noreferrer')
      } else {
        navigate(banner.target_link)
      }
      return
    }

    if (banner.target_type === 'CATEGORY' && banner.target_id) {
      navigate(`/products?category_id=${banner.target_id}`)
      return
    }

    if (banner.target_type === 'PRODUCT' && banner.target_id) {
      navigate(`/product/${banner.target_id}`)
      return
    }

    if (banner.target_type === 'SUBCATEGORY' && banner.target_id) {
      navigate(`/products?subcategory_id=${banner.target_id}`)
      return
    }

    if (banner.target_type === 'EXTERNAL_URL' && banner.target_url) {
      window.open(banner.target_url, '_blank', 'noopener,noreferrer')
      return
    }

    navigate('/products')
  }

  // Handle manual arrow nudge
  const handleScroll = (direction) => {
    if (!scrollContainerRef.current) return
    const offset = direction === 'left' ? -380 : 380
    scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  // 1. Loading state (storefront UI)
  if (isLoading) {
    return (
      <section className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-6">
        <div className="w-full h-44 rounded-3xl bg-[#F2DDE9]/40 animate-pulse flex items-center justify-center border border-[#E8E0E5]">
          <span className="text-xs sm:text-sm font-bold text-[#601D49]">
            Loading promotional offers...
          </span>
        </div>
      </section>
    )
  }

  // 2. Empty state — No fallback fake banners
  if (activeBanners.length === 0) {
    return null
  }

  // Double array for continuous seamless infinite loop
  const displayItems = [...activeBanners, ...activeBanners]

  return (
    <section id={id} className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-8 overflow-hidden">
      {/* Header (rendered if title or badgeText provided — styled with storefront burgundy theme) */}
      {(title || badgeText) && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
          <div>
            {badgeText && (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#601D49] bg-[#F2DDE9] px-3 py-1 rounded-full mb-1">
                <span>{badgeText}</span>
              </div>
            )}
            {title && (
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#2D252B] tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-[#6B5E68] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          {/* Desktop Controls to pause / manually nudge */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className="w-9 h-9 rounded-full border border-[#E8E0E5] bg-white hover:bg-[#F2DDE9] text-[#2D252B] flex items-center justify-center shadow-xs cursor-pointer transition-all active:scale-95"
              aria-label="Scroll promotional banners left"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className="w-9 h-9 rounded-full border border-[#E8E0E5] bg-white hover:bg-[#F2DDE9] text-[#2D252B] flex items-center justify-center shadow-xs cursor-pointer transition-all active:scale-95"
              aria-label="Scroll promotional banners right"
            >
              ›
            </button>
          </div>
        </div>
      )}

      {/* Continuous Auto-Scrolling Marquee Track (Preserves admin-configured banner gradients and styling) */}
      <div
        ref={scrollContainerRef}
        className="relative overflow-x-hidden no-scrollbar rounded-3xl"
      >
        <div className="animate-continuous-scroll flex gap-4 sm:gap-5 py-2">
          {displayItems.map((banner, index) => {
            const themeKey = (banner.color_theme || 'purple').toLowerCase()
            const theme = THEME_MAP[themeKey] || THEME_MAP.purple
            const image = resolveImageUrl(banner.image_desktop_path)

            return (
              <div
                key={`${banner.id}-${index}`}
                onClick={() => handleNavigate(banner)}
                className={`w-[290px] sm:w-[360px] lg:w-[400px] shrink-0 rounded-2xl sm:rounded-3xl p-4 sm:p-5 bg-gradient-to-r ${theme.gradient} text-white shadow-md hover:shadow-xl hover:scale-[1.01] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-white/20 relative overflow-hidden group select-none`}
              >
                {/* Ambient glow in background */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

                {/* Top Badge & Title Area */}
                <div className="z-10">
                  {banner.discount_text && (
                    <div className="mb-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] sm:text-xs font-black uppercase tracking-wider backdrop-blur-md shadow-xs ${theme.badgeBg}`}>
                        <span>🔥</span>
                        <span>{banner.discount_text}</span>
                      </span>
                    </div>
                  )}

                  <h3 className="text-sm sm:text-base lg:text-lg font-black leading-snug line-clamp-1">
                    {banner.title}
                  </h3>

                  {banner.subtitle && (
                    <p className={`text-xs sm:text-sm font-semibold mt-0.5 line-clamp-1 ${theme.subtitleColor}`}>
                      {banner.subtitle}
                    </p>
                  )}
                </div>

                {/* Bottom Media & Action */}
                <div className="mt-3 pt-2.5 border-t border-white/15 flex items-center justify-between gap-3 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleNavigate(banner)
                    }}
                    className={`px-3.5 sm:px-4 py-1.5 rounded-full bg-gradient-to-r ${theme.buttonBg} text-xs font-black tracking-wide shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer`}
                  >
                    {banner.cta_text || 'Claim Offer →'}
                  </button>

                  {image && (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden border-2 border-white/30 bg-black/20 shrink-0 shadow-sm">
                      <img
                        src={image}
                        alt={banner.title}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
