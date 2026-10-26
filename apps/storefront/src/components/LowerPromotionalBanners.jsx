import React, { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TbSparkles } from 'react-icons/tb'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'

// Admin-managed banner theme presets — solid, vibrant gradients matching Admin Panel COLOR_THEMES
const THEME_CONFIG = {
  purple: {
    background: 'linear-gradient(135deg, #3b0764 0%, #581c87 50%, #312e81 100%)',
    backgroundColor: '#581c87',
    badgeBg: 'bg-purple-950/40 text-purple-200 border-purple-400/30',
    buttonBg: 'bg-white text-purple-950 hover:bg-purple-50',
    subtitleColor: 'text-purple-200',
  },
  blue: {
    background: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #1e40af 100%)',
    backgroundColor: '#0369a1',
    badgeBg: 'bg-sky-950/40 text-cyan-200 border-cyan-400/30',
    buttonBg: 'bg-white text-sky-950 hover:bg-sky-50',
    subtitleColor: 'text-cyan-200',
  },
  orange: {
    background: 'linear-gradient(135deg, #9a3412 0%, #ea580c 50%, #c2410c 100%)',
    backgroundColor: '#ea580c',
    badgeBg: 'bg-amber-950/40 text-amber-200 border-amber-400/30',
    buttonBg: 'bg-white text-orange-950 hover:bg-orange-50',
    subtitleColor: 'text-amber-100',
  },
  pink: {
    background: 'linear-gradient(135deg, #881337 0%, #e11d48 50%, #9f1239 100%)',
    backgroundColor: '#e11d48',
    badgeBg: 'bg-rose-950/40 text-rose-200 border-rose-400/30',
    buttonBg: 'bg-white text-rose-950 hover:bg-rose-50',
    subtitleColor: 'text-rose-200',
  },
  teal: {
    background: 'linear-gradient(135deg, #042f2e 0%, #0d9488 50%, #065f46 100%)',
    backgroundColor: '#0d9488',
    badgeBg: 'bg-teal-950/40 text-teal-200 border-teal-400/30',
    buttonBg: 'bg-white text-teal-950 hover:bg-teal-50',
    subtitleColor: 'text-teal-200',
  },
  lavender: {
    background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #5b21b6 100%)',
    backgroundColor: '#7c3aed',
    badgeBg: 'bg-violet-950/40 text-violet-200 border-violet-400/30',
    buttonBg: 'bg-white text-purple-950 hover:bg-purple-50',
    subtitleColor: 'text-violet-200',
  },
}

function resolveBannerStyle(banner) {
  const rawTheme = banner?.color_theme || banner?.background_color || 'purple'
  const key = String(rawTheme).trim().toLowerCase()

  if (THEME_CONFIG[key]) {
    return THEME_CONFIG[key]
  }

  // Handle direct hex, rgb, or hsl values
  if (key.startsWith('#') || key.startsWith('rgb') || key.startsWith('hsl')) {
    return {
      background: rawTheme,
      backgroundColor: rawTheme,
      badgeBg: 'bg-black/30 text-white border-white/30',
      buttonBg: 'bg-white text-slate-900 hover:bg-slate-100',
      subtitleColor: 'text-white/90',
    }
  }

  // Fallback preset
  return THEME_CONFIG.purple
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
  const trackRef = useRef(null)
  const [duration, setDuration] = useState(25)

  // Filter only active banners from database
  const activeBanners = useMemo(() => {
    return Array.isArray(banners)
      ? banners.filter((b) => Number(b.is_active) === 1)
      : []
  }, [banners])

  // Calculate dynamic animation duration based on actual track width for constant, steady speed (~40px/s)
  useEffect(() => {
    if (!trackRef.current || activeBanners.length === 0) return

    const computeDuration = () => {
      if (!trackRef.current) return
      const totalWidth = trackRef.current.scrollWidth
      const loopDistance = totalWidth / 2 // The distance of one full seamless sequence
      if (loopDistance > 0) {
        // ~40px per second gives a steady, readable, continuous crawl like JioMart
        const calculatedDuration = Math.max(10, Math.round(loopDistance / 40))
        setDuration(calculatedDuration)
      }
    }

    computeDuration()
    window.addEventListener('resize', computeDuration)
    return () => window.removeEventListener('resize', computeDuration)
  }, [activeBanners])

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

  // Duplicate the sequence internally only as needed to create a seamless loop
  const displayItems = [...activeBanners, ...activeBanners]

  return (
    <section id={id} className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-3 sm:py-4 overflow-hidden">
      {/* Header (rendered if title or badgeText provided — styled with storefront theme) */}
      {(title || badgeText) && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-3">
          <div>
            {badgeText && (
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-brand)] bg-[var(--color-primary-tint)] px-3 py-1 rounded-full mb-1">
                <span>{badgeText}</span>
              </div>
            )}
            {title && (
              <h2 className="text-lg sm:text-xl lg:text-2xl font-black text-[var(--color-text-main)] tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Continuous Marquee Track (Smooth, uninterrupted continuous horizontal movement) */}
      <div className="relative overflow-hidden no-scrollbar rounded-3xl w-full">
        <div
          ref={trackRef}
          className="animate-continuous-scroll flex gap-4 sm:gap-5 py-2 w-max will-change-transform"
          style={{
            animationDuration: `${duration}s`,
            animationTimingFunction: 'linear',
            animationIterationCount: 'infinite',
          }}
        >
          {displayItems.map((banner, index) => {
            const theme = resolveBannerStyle(banner)
            const image = resolveImageUrl(banner.image_desktop_path)

            return (
              <div
                key={`${banner.id}-${index}`}
                data-banner-card="true"
                onClick={() => handleNavigate(banner)}
                style={{
                  background: theme.background,
                  backgroundColor: theme.backgroundColor,
                }}
                className="w-[290px] sm:w-[360px] lg:w-[420px] shrink-0 rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-white shadow-md hover:shadow-xl hover:scale-[1.01] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-white/20 relative overflow-hidden group select-none"
              >
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
                    className={`px-3.5 sm:px-4 py-1.5 rounded-full ${theme.buttonBg} text-xs font-black tracking-wide shadow-md hover:brightness-110 active:scale-95 transition-all cursor-pointer`}
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
