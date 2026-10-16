import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiZap, FiCheck, FiArrowRight, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { TbSparkles } from 'react-icons/tb'

export default function GroceryHeroBanner({
  storeSettings = null,
  deliverySettings = null,
  banners = [],
  isLoading = false,
  autoPlayInterval = 5000,
}) {
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const touchStartX = useRef(null)
  const touchEndX = useRef(null)

  // Settings from database
  const storeName = storeSettings?.store_name || 'KiranaBazaar'
  const storeDesc =
    storeSettings?.description ||
    'Your trusted neighborhood supermarket for trending essentials, groceries, and daily items at unmatched prices.'
  const freeMinAmount = deliverySettings?.free_delivery_threshold
    ? Number(deliverySettings.free_delivery_threshold)
    : 499

  // Active database banners
  const activeBanners = useMemo(() => {
    if (!Array.isArray(banners)) return []
    return banners.filter((b) => Number(b.is_active) === 1)
  }, [banners])

  // Fallback slides if database has no active banners yet
  const slides = useMemo(() => {
    if (activeBanners.length > 0) return activeBanners

    return [
      {
        id: 'fallback-1',
        title: 'Fresh Essentials Delivered Fast',
        subtitle: `Supermarket groceries, vegetables & daily needs delivered to your doorstep`,
        discount_text: 'FLAT 20% OFF',
        cta_text: 'Shop Now',
        target_type: 'ALL',
        image_desktop_path: '/images/hero_diwali_grocery.jpg',
      },
      {
        id: 'fallback-2',
        title: 'Mega Festive Grocery Savings',
        subtitle: `Handpicked organic farm produce, spices, dry fruits & festive treats`,
        discount_text: 'UP TO 40% OFF',
        cta_text: 'Explore Deals',
        target_type: 'DEALS',
        image_desktop_path: '/images/hero_navaratri_grocery.jpg',
      },
    ]
  }, [activeBanners])

  const totalSlides = slides.length

  // Normalize slide index
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

  // Handle CTA or Slide click navigation
  const handleBannerClick = (banner) => {
    if (!banner) return

    if (banner.target_url) {
      if (banner.target_url.startsWith('http://') || banner.target_url.startsWith('https://')) {
        window.open(banner.target_url, '_blank', 'noopener,noreferrer')
      } else {
        navigate(banner.target_url)
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

    if (banner.target_type === 'DEALS') {
      navigate(ROUTES.PRODUCTS_BY_SECTION('deals'))
      return
    }

    navigate(ROUTES.PRODUCTS)
  }

  // Resolve slide image (handles both remote uploaded URL and local fallbacks)
  const getSlideImageUrl = (slide, index) => {
    const rawPath = slide.image_desktop_path || slide.image_mobile_path
    if (rawPath) {
      if (rawPath.startsWith('/images/')) return rawPath
      return resolveImageUrl(rawPath)
    }
    return index % 2 === 0
      ? '/images/hero_diwali_grocery.jpg'
      : '/images/hero_navaratri_grocery.jpg'
  }

  if (isLoading) {
    return (
      <section className="w-full h-[320px] sm:h-[420px] md:h-[480px] lg:h-[520px] bg-slate-900/10 animate-pulse flex items-center justify-center border-b border-[#e9d5ff]">
        <div className="w-12 h-12 border-4 border-[#7c3aed] border-t-transparent rounded-full animate-spin" />
      </section>
    )
  }

  return (
    <section
      className="w-full relative overflow-hidden select-none bg-slate-950 border-b border-[#e9d5ff]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Hero Promotion Banners"
    >
      {/* Container with fixed full-width responsive height */}
      <div className="relative w-full h-[340px] sm:h-[420px] md:h-[470px] lg:h-[530px] xl:h-[580px] overflow-hidden">
        {slides.map((slide, idx) => {
          const isActive = idx === currentSlide
          const imageUrl = getSlideImageUrl(slide, idx)
          const fallbackUrl =
            idx % 2 === 0
              ? '/images/hero_diwali_grocery.jpg'
              : '/images/hero_navaratri_grocery.jpg'

          return (
            <div
              key={slide.id || idx}
              className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              {/* 1. FULL WIDTH COVER IMAGE */}
              <img
                src={imageUrl}
                alt={slide.title || storeName}
                onError={(e) => {
                  if (e.currentTarget.src !== fallbackUrl) {
                    e.currentTarget.src = fallbackUrl
                  }
                }}
                className="w-full h-full object-cover object-center transform scale-100 transition-transform duration-7000 ease-out"
                style={{
                  transform: isActive ? 'scale(1.03)' : 'scale(1)',
                }}
              />

              {/* 2. ELEGANT DARK GRADIENT OVERLAY (Guarantees 100% Text & Button Readability) */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20 sm:to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />

              {/* 3. TEXT & BUTTON LAYER DIRECTLY OVER THE IMAGE */}
              <div className="absolute inset-0 z-20 flex flex-col justify-center px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-7xl">
                <div className="max-w-2xl space-y-3 sm:space-y-4 text-left animate-in fade-in slide-in-from-left-4 duration-500">
                  
                  {/* Offer / Category Badge */}
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/40 text-white text-[10px] sm:text-xs font-black uppercase tracking-wider shadow-lg">
                    {slide.discount_text ? (
                      <>
                        <TbSparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>{slide.discount_text}</span>
                      </>
                    ) : (
                      <>
                        <FiZap className="w-3.5 h-3.5 text-amber-300" />
                        <span>SPECIAL OFFER</span>
                      </>
                    )}
                  </div>

                  {/* Banner Main Title */}
                  <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12] drop-shadow-md">
                    {slide.title}
                  </h1>

                  {/* Banner Subtitle / Description */}
                  <p className="text-xs sm:text-sm md:text-base text-white/90 font-medium leading-relaxed max-w-xl line-clamp-2 sm:line-clamp-3 drop-shadow-sm">
                    {slide.subtitle || slide.description || storeDesc}
                  </p>

                  {/* Delivery Value Props on Desktop */}
                  <div className="hidden sm:flex flex-wrap items-center gap-4 pt-1 text-xs text-white/95 font-semibold drop-shadow-xs">
                    <span className="flex items-center gap-1.5">
                      <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> Free delivery ₹{freeMinAmount}+
                    </span>
                    <span className="text-white/40">•</span>
                    <span className="flex items-center gap-1.5">
                      <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> 100% Genuine Quality
                    </span>
                    <span className="text-white/40">•</span>
                    <span className="flex items-center gap-1.5">
                      <FiCheck className="w-3.5 h-3.5 text-emerald-400" /> Express 60-min delivery
                    </span>
                  </div>

                  {/* CTA Buttons Placed DIRECTLY Over the Image */}
                  <div className="flex items-center gap-3 pt-2 sm:pt-3">
                    <button
                      type="button"
                      onClick={() => handleBannerClick(slide)}
                      className="bg-black hover:bg-neutral-800 text-white font-extrabold text-xs sm:text-sm px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl shadow-2xl hover:shadow-black/50 transition-all transform active:scale-95 cursor-pointer flex items-center gap-2 border border-white/20"
                    >
                      <span>{slide.cta_text || 'Shop Now'}</span>
                      <FiArrowRight className="w-4 h-4 text-white" />
                    </button>

                    <Link
                      to={ROUTES.PRODUCTS_BY_SECTION('deals')}
                      className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white border border-white/40 font-bold text-xs sm:text-sm px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
                    >
                      <span>View Deals</span>
                    </Link>
                  </div>

                </div>
              </div>

            </div>
          )
        })}

        {/* 4. PREV & NEXT CAROUSEL NAVIGATION CONTROLS */}
        {totalSlides > 1 && (
          <div className="absolute inset-y-0 inset-x-3 sm:inset-x-6 flex items-center justify-between pointer-events-none z-30">
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1))}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/75 text-white backdrop-blur-md border border-white/20 flex items-center justify-center pointer-events-auto transition-transform active:scale-90 cursor-pointer shadow-xl hover:scale-105"
              aria-label="Previous Slide"
            >
              <FiChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev + 1) % totalSlides)}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/40 hover:bg-black/75 text-white backdrop-blur-md border border-white/20 flex items-center justify-center pointer-events-auto transition-transform active:scale-90 cursor-pointer shadow-xl hover:scale-105"
              aria-label="Next Slide"
            >
              <FiChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        )}

        {/* 5. PAGINATION DOTS (Centered at the Bottom) */}
        {totalSlides > 1 && (
          <div className="absolute bottom-4 sm:bottom-6 inset-x-0 flex justify-center items-center gap-2 z-30 pointer-events-auto">
            {slides.map((_, idx) => {
              const isActive = idx === currentSlide
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`h-2 sm:h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                    isActive
                      ? 'w-7 sm:w-9 bg-[#ede9fe] shadow-lg border border-white/50'
                      : 'w-2 sm:w-2.5 bg-white/45 hover:bg-white/80'
                  }`}
                />
              )
            })}
          </div>
        )}

        {/* 6. SLIDE INDICATOR PILL (Bottom Right Corner) */}
        {totalSlides > 1 && (
          <div className="hidden sm:block absolute bottom-4 sm:bottom-6 right-6 z-30 pointer-events-none">
            <span className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/20 text-white/90 text-[10px] font-mono font-bold tracking-wider">
              {currentSlide + 1} / {totalSlides}
            </span>
          </div>
        )}

      </div>
    </section>
  )
}
