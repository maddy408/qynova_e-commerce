import React, { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TbSparkles } from 'react-icons/tb'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'

// Admin-managed banner theme presets — preserved untouched
const THEME_MAP = {
  purple: {
    gradient: 'from-[var(--color-referral-alt)] via-[var(--color-extra-008)] to-[var(--color-referral)]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonBg: 'from-white to-[var(--color-referral-tint)] text-[var(--color-referral)] font-black',
    subtitleColor: 'text-[var(--color-referral-tint)]',
  },
  blue: {
    gradient: 'from-[var(--color-extra-009)] via-[var(--color-extra-010)] to-[var(--color-extra-001)]',
    badgeBg: 'bg-cyan-500/25 text-cyan-200 border-cyan-400/40',
    buttonBg: 'from-[var(--color-extra-011)] to-[var(--color-extra-012)] text-slate-950 font-black',
    subtitleColor: 'text-cyan-200',
  },
  orange: {
    gradient: 'from-[var(--color-extra-013)] via-[var(--color-extra-014)] to-[var(--color-warning)]',
    badgeBg: 'bg-amber-500/25 text-amber-200 border-amber-400/40',
    buttonBg: 'from-[var(--color-extra-015)] to-[var(--color-extra-003)] text-white',
    subtitleColor: 'text-amber-200',
  },
  pink: {
    gradient: 'from-[var(--color-extra-016)] via-[var(--color-extra-017)] to-[var(--color-extra-018)]',
    badgeBg: 'bg-rose-400/25 text-rose-200 border-rose-300/40',
    buttonBg: 'from-[var(--color-extra-019)] to-[var(--color-error)] text-white',
    subtitleColor: 'text-rose-200',
  },
  teal: {
    gradient: 'from-[var(--color-extra-020)] via-[var(--color-extra-021)] to-[var(--color-extra-002)]',
    badgeBg: 'bg-teal-400/25 text-teal-200 border-teal-300/40',
    buttonBg: 'from-[var(--color-info)] to-[var(--color-extra-022)] text-slate-950 font-black',
    subtitleColor: 'text-teal-200',
  },
  lavender: {
    gradient: 'from-[var(--color-referral)] via-[var(--color-referral-alt)] to-[var(--color-extra-023)]',
    badgeBg: 'bg-white/25 text-white border-white/35',
    buttonBg: 'from-white to-[var(--color-referral-tint)] text-[var(--color-referral)] font-black',
    subtitleColor: 'text-[var(--color-referral-tint)]',
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
      navigate(ROUTES.PRODUCTS_BY_CATEGORY(banner.target_id))
      return
    }

    if (banner.target_type === 'PRODUCT' && banner.target_id) {
      navigate(ROUTES.PRODUCT_DETAIL(banner.target_id))
      return
    }

    if (banner.target_type === 'SUBCATEGORY' && banner.target_id) {
      navigate(ROUTES.PRODUCTS_BY_SUBCATEGORY(banner.target_id))
      return
    }

    if (banner.target_type === 'EXTERNAL_URL' && banner.target_url) {
      window.open(banner.target_url, '_blank', 'noopener,noreferrer')
      return
    }

    navigate(ROUTES.PRODUCTS)
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
        <div className="w-full h-44 rounded-3xl bg-[var(--color-primary-tint)]/40 animate-pulse flex items-center justify-center border border-[var(--color-border-subtle)]">
          <span className="text-xs sm:text-sm font-bold text-[var(--color-brand)]">
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
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-3 py-1 rounded-full mb-1">
                <span>{badgeText}</span>
              </div>
            )}
            {title && (
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-[var(--color-text-main)] tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>

          {/* Desktop Controls to pause / manually nudge */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className="w-9 h-9 rounded-full border border-[var(--color-border-subtle)] bg-white hover:bg-[var(--color-primary-tint)] text-[var(--color-text-main)] flex items-center justify-center shadow-xs cursor-pointer transition-all active:scale-95"
              aria-label="Scroll promotional banners left"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className="w-9 h-9 rounded-full border border-[var(--color-border-subtle)] bg-white hover:bg-[var(--color-primary-tint)] text-[var(--color-text-main)] flex items-center justify-center shadow-xs cursor-pointer transition-all active:scale-95"
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
                        <TbSparkles className="w-3.5 h-3.5 text-amber-300" />
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
