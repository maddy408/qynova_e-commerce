import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { TbSparkles } from 'react-icons/tb'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'

// Color theme definitions derived from database 'color_theme' values — preserved untouched for admin-managed banners
const BANNER_THEMES = {
  purple: {
    bgGradient: 'from-[var(--color-referral-alt)] via-[var(--color-extra-008)] to-[var(--color-referral)]',
    accentButton: 'from-white to-[var(--color-referral-tint)] text-[var(--color-referral)] font-black shadow-md',
    badge: 'bg-white/20 text-white border-white/30',
    subtitleText: 'text-[var(--color-referral-tint)]',
    blobColor: 'bg-[var(--color-extra-030)]/20',
  },
  blue: {
    bgGradient: 'from-[var(--color-extra-009)] via-[var(--color-extra-010)] to-[var(--color-extra-001)]',
    accentButton: 'from-[var(--color-extra-011)] to-[var(--color-extra-012)] shadow-cyan-900/40 text-slate-950 font-black',
    badge: 'bg-cyan-500/25 text-cyan-200 border-cyan-400/30',
    subtitleText: 'text-cyan-200',
    blobColor: 'bg-cyan-400/20',
  },
  orange: {
    bgGradient: 'from-[var(--color-extra-013)] via-[var(--color-extra-014)] to-[var(--color-warning)]',
    accentButton: 'from-[var(--color-extra-015)] to-[var(--color-extra-003)] shadow-orange-950/40 text-white',
    badge: 'bg-amber-500/25 text-amber-200 border-amber-400/30',
    subtitleText: 'text-amber-200',
    blobColor: 'bg-amber-400/20',
  },
  lavender: {
    bgGradient: 'from-[var(--color-referral)] via-[var(--color-referral-alt)] to-[var(--color-extra-023)]',
    accentButton: 'from-white to-[var(--color-referral-tint)] text-[var(--color-referral)] font-black shadow-md',
    badge: 'bg-white/25 text-white border-white/35',
    subtitleText: 'text-[var(--color-referral-tint)]',
    blobColor: 'bg-[var(--color-referral-tint)]/20',
  },
  pink: {
    bgGradient: 'from-[var(--color-extra-016)] via-[var(--color-extra-017)] to-[var(--color-extra-018)]',
    accentButton: 'from-[var(--color-error)] to-[var(--color-extra-019)] shadow-rose-950/40 text-white',
    badge: 'bg-rose-400/25 text-rose-200 border-rose-300/30',
    subtitleText: 'text-rose-200',
    blobColor: 'bg-rose-400/20',
  },
  teal: {
    bgGradient: 'from-[var(--color-extra-020)] via-[var(--color-extra-021)] to-[var(--color-extra-002)]',
    accentButton: 'from-[var(--color-info)] to-[var(--color-extra-022)] shadow-teal-950/40 text-slate-950 font-black',
    badge: 'bg-teal-400/25 text-teal-200 border-teal-300/30',
    subtitleText: 'text-teal-200',
    blobColor: 'bg-teal-400/20',
  },
}

export default function PromotionalBannerCarousel({
  banners = [],
  isLoading = false,
  autoPlayInterval = 5500,
  storeSettings = null,
}) {
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const touchStartX = useRef(null)
  const touchEndX = useRef(null)

  // Filter only active banners
  const activeBanners = useMemo(() => {
    return Array.isArray(banners)
      ? banners.filter((b) => Number(b.is_active) === 1)
      : []
  }, [banners])

  const totalSlides = activeBanners.length

  // Normalize slide index if active list shrinks
  useEffect(() => {
    if (totalSlides > 0 && currentSlide >= totalSlides) {
      setCurrentSlide(0)
    }
  }, [totalSlides, currentSlide])

  // Autoplay with hover pause
  useEffect(() => {
    if (totalSlides <= 1 || isHovered) return

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides)
    }, autoPlayInterval)

    return () => clearInterval(timer)
  }, [totalSlides, isHovered, autoPlayInterval])

  // Touch Swipe Handlers for Mobile Browsers
  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    const distance = touchStartX.current - touchEndX.current
    const minSwipeDistance = 45

    if (distance > minSwipeDistance) {
      // Swiped Left -> Next Slide
      setCurrentSlide((prev) => (prev + 1) % totalSlides)
    } else if (distance < -minSwipeDistance) {
      // Swiped Right -> Prev Slide
      setCurrentSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1))
    }

    touchStartX.current = null
    touchEndX.current = null
  }

  // Handle banner destination navigation
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

  // Loading skeleton state (storefront UI)
  if (isLoading) {
    return (
      <section className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-3 sm:py-5">
        <div className="w-full h-[240px] sm:h-[300px] lg:h-[350px] rounded-2xl sm:rounded-3xl bg-[var(--color-primary-tint)]/40 animate-pulse border border-[var(--color-border-subtle)] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 rounded-full border-3 border-[var(--color-brand)] border-t-transparent animate-spin" />
            <span className="text-xs sm:text-sm font-bold text-[var(--color-brand)]">
              Loading promotions...
            </span>
          </div>
        </div>
      </section>
    )
  }

  // Empty state — If no active banners in DB, do not render hardcoded fallback banners
  if (totalSlides === 0) {
    return null
  }

  const activeBanner = activeBanners[currentSlide] || activeBanners[0]
  const themeKey = (activeBanner.color_theme || 'purple').toLowerCase()
  const theme = BANNER_THEMES[themeKey] || BANNER_THEMES.purple

  const desktopImage = resolveImageUrl(activeBanner.image_desktop_path)
  const mobileImage = activeBanner.image_mobile_path
    ? resolveImageUrl(activeBanner.image_mobile_path)
    : desktopImage

  return (
    <section
      id="hero-promotional-carousel"
      className="w-full px-3 sm:px-6 lg:px-8 xl:px-12 py-2.5 sm:py-4 select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Promotional Offers"
    >
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl shadow-black/10 border border-[var(--color-border-subtle)]/60">
        {/* Main Banner Slide Container (Admin-managed banner gradients and styling preserved) */}
        <div
          className={`w-full min-h-[240px] sm:min-h-[290px] lg:h-[350px] bg-gradient-to-r ${theme.bgGradient} text-white flex items-center relative overflow-hidden transition-colors duration-700`}
        >
          {/* Ambient Lighting Accents */}
          <div className="absolute -top-24 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
          <div className={`absolute -bottom-24 right-1/4 w-96 h-96 ${theme.blobColor} rounded-full blur-3xl pointer-events-none`} />

          {/* Grid Layout: Text Content + Promotional Media */}
          <div className="relative z-10 w-full px-4 sm:px-8 lg:px-14 py-4 sm:py-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-center">
            
            {/* Left Content Area (7 Cols on Desktop) */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-2 sm:space-y-3">
              {/* Discount / Offer Badge */}
              {activeBanner.discount_text && (
                <div className="self-start">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${theme.badge} backdrop-blur-md border text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-xs`}
                  >
                    <TbSparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>{activeBanner.discount_text}</span>
                  </span>
                </div>
              )}

              {/* Main Heading */}
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-black tracking-tight leading-tight sm:leading-snug">
                {activeBanner.title}
                {activeBanner.subtitle && (
                  <span className={`block font-extrabold mt-0.5 sm:mt-1 text-sm sm:xl lg:text-2xl ${theme.subtitleText}`}>
                    {activeBanner.subtitle}
                  </span>
                )}
              </h1>

              {/* Detailed Description */}
              {activeBanner.description && (
                <p className="text-xs sm:text-sm lg:text-base text-white/90 max-w-xl font-normal leading-relaxed line-clamp-2">
                  {activeBanner.description}
                </p>
              )}

              {/* Interactive CTA Buttons */}
              <div className="pt-1.5 sm:pt-3 flex flex-wrap items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => handleNavigate(activeBanner)}
                  className={`min-h-[42px] px-5 sm:px-7 py-2.5 rounded-full bg-gradient-to-r ${theme.accentButton} text-xs sm:text-sm font-extrabold tracking-wide shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center gap-2`}
                >
                  <span>{activeBanner.cta_text || 'Shop Now →'}</span>
                </button>

                <Link
                  to={ROUTES.PRODUCTS}
                  className="min-h-[42px] px-4 sm:px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white font-bold text-xs sm:text-sm backdrop-blur-md border border-white/20 transition-all flex items-center justify-center cursor-pointer"
                >
                  Explore All
                </Link>
              </div>
            </div>

            {/* Right Media Area (5 Cols on Desktop) */}
            {desktopImage && (
              <div className="lg:col-span-5 flex justify-center items-center">
                <div
                  onClick={() => handleNavigate(activeBanner)}
                  className="relative w-full max-w-[260px] sm:max-w-xs md:max-w-sm lg:max-w-md xl:max-w-lg rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border-2 sm:border-3 border-white/30 bg-black/20 aspect-4/3 sm:aspect-16/10 cursor-pointer group"
                >
                  <picture>
                    {activeBanner.image_mobile_path && (
                      <source media="(max-width: 640px)" srcSet={mobileImage} />
                    )}
                    <img
                      src={desktopImage}
                      alt={activeBanner.title}
                      loading={currentSlide === 0 ? 'eager' : 'lazy'}
                      fetchPriority={currentSlide === 0 ? 'high' : 'auto'}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-3">
                    <span className="text-[11px] font-black text-white bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
                      Click to explore
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Left / Right Carousel Controls */}
          {totalSlides > 1 && (
            <div className="absolute inset-y-0 inset-x-2 sm:inset-x-4 flex items-center justify-between pointer-events-none z-20">
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1))}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-md flex items-center justify-center pointer-events-auto transition-transform active:scale-90 cursor-pointer shadow-md"
                aria-label="Previous Slide"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => (prev + 1) % totalSlides)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/35 hover:bg-black/60 text-white backdrop-blur-md flex items-center justify-center pointer-events-auto transition-transform active:scale-90 cursor-pointer shadow-md"
                aria-label="Next Slide"
              >
                <FiChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Pagination Indicators / Dots */}
          {totalSlides > 1 && (
            <div className="absolute bottom-2.5 sm:bottom-3 inset-x-0 flex justify-center items-center gap-1.5 z-20 pointer-events-auto">
              {activeBanners.map((_, idx) => {
                const isActive = idx === currentSlide
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentSlide(idx)}
                    aria-label={`Go to slide ${idx + 1}`}
                    className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'w-7 sm:w-8 bg-white shadow-md'
                        : 'w-2 sm:w-2.5 bg-white/45 hover:bg-white/70'
                    }`}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
