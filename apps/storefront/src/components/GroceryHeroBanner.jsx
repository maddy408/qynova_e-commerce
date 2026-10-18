import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiArrowRight, FiChevronLeft, FiChevronRight } from 'react-icons/fi'

/**
 * Modern Shop with Adam Grocery Hero Banner
 * Matches the reference image layout:
 * - Single-screen panoramic banner (no 2-page vertical scroll)
 * - Full background banner image with crisp gradient text overlay
 * - Pill badge, bold typography, Shop Now & View Offers buttons
 * - Cursive callout on the visual side
 * - Left/Right arrows & pill pagination dots
 */
export default function GroceryHeroBanner({
  storeSettings = null,
  deliverySettings = null,
  banners = [],
  isLoading = false,
  autoPlayInterval = 5500,
}) {
  const navigate = useNavigate()
  const [currentSlide, setCurrentSlide] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  const touchStartX = useRef(null)
  const touchEndX = useRef(null)

  const storeName = storeSettings?.store_name || 'Shop with Adam'

  // Active banners from MySQL database
  const activeBanners = useMemo(() => {
    if (!Array.isArray(banners)) return []
    return banners.filter((b) => Number(b.is_active) === 1)
  }, [banners])

  const slides = useMemo(() => {
    const flagshipSlide = {
      id: 'flagship-grocery-basket',
      badge: 'FRESHNESS & QUALITY',
      title: 'Good Food,\nBetter Living',
      subtitle: 'Fresh groceries, daily essentials and more — at your doorstep.',
      cta_text: 'Shop Now',
      secondary_cta: 'View Offers',
      target_url: ROUTES.PRODUCTS,
      image_url: '/images/kirana_hero_basket.jpg',
      is_uploaded: false,
      callout: 'Fresh Healthy Happy ♡',
    }

    if (activeBanners.length > 0) {
      const bannerSlides = activeBanners.map((b, idx) => ({
        id: b.id || `banner-${idx}`,
        badge: b.discount_text || 'SPECIAL OFFER',
        title: b.title || 'Good Food,\nBetter Living',
        subtitle: b.subtitle || b.description || 'Fresh groceries and daily essentials delivered to your doorstep.',
        cta_text: b.cta_text || 'Shop Now',
        secondary_cta: 'View Offers',
        target_url: b.target_url || (b.target_type === 'CATEGORY' && b.target_id ? ROUTES.PRODUCTS_BY_CATEGORY(b.target_id) : ROUTES.PRODUCTS),
        target_type: b.target_type,
        target_id: b.target_id,
        image_url: b.image_desktop_path ? resolveImageUrl(b.image_desktop_path) : '/images/kirana_hero_basket.jpg',
        is_uploaded: Boolean(b.image_desktop_path),
        color_theme: b.color_theme || 'blue',
        callout: null,
      }))

      // Return database banners with the flagship slide so all are reachable
      return [...bannerSlides, flagshipSlide]
    }

    return [
      flagshipSlide,
      {
        id: 'hero-slide-2',
        badge: 'SUPERMARKET SPECIALS',
        title: 'Daily Essentials,\nUnbeatable Prices',
        subtitle: 'Farm-fresh vegetables, dairy, pantry staples and household supplies with fast delivery.',
        cta_text: 'Explore Groceries',
        secondary_cta: 'Top Deals',
        target_url: ROUTES.PRODUCTS,
        image_url: '/images/kirana_hero_basket.jpg',
        is_uploaded: false,
        callout: '100% Quality Guaranteed ★',
      },
    ]
  }, [activeBanners])

  const totalSlides = slides.length

  useEffect(() => {
    if (totalSlides > 0 && currentSlide >= totalSlides) {
      setCurrentSlide(0)
    }
  }, [totalSlides, currentSlide])

  useEffect(() => {
    if (totalSlides <= 1 || isHovered) return

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides)
    }, autoPlayInterval)

    return () => clearInterval(timer)
  }, [totalSlides, isHovered, autoPlayInterval])

  const handleTouchStart = (e) => {
    touchStartX.current = e.targetTouches[0].clientX
  }

  const handleTouchMove = (e) => {
    touchEndX.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    const distance = touchStartX.current - touchEndX.current
    if (distance > 45) {
      setCurrentSlide((prev) => (prev + 1) % totalSlides)
    } else if (distance < -45) {
      setCurrentSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1))
    }
    touchStartX.current = null
    touchEndX.current = null
  }

  const handleBannerClick = (slide) => {
    if (!slide) return

    if (slide.target_url) {
      if (slide.target_url.startsWith('http://') || slide.target_url.startsWith('https://')) {
        window.open(slide.target_url, '_blank', 'noopener,noreferrer')
      } else {
        navigate(slide.target_url)
      }
      return
    }

    if (slide.target_type === 'CATEGORY' && slide.target_id) {
      navigate(ROUTES.PRODUCTS_BY_CATEGORY(slide.target_id))
      return
    }

    if (slide.target_type === 'PRODUCT' && slide.target_id) {
      navigate(ROUTES.PRODUCT_DETAIL(slide.target_id))
      return
    }

    navigate(ROUTES.PRODUCTS)
  }

  if (isLoading) {
    return (
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 lg:px-8 pt-2.5 sm:pt-3.5 pb-2">
        <div className="w-full h-[260px] sm:h-[300px] md:h-[340px] lg:h-[370px] bg-slate-100 animate-pulse rounded-[20px] sm:rounded-[32px]" />
      </div>
    )
  }

  const activeSlide = slides[currentSlide] || slides[0]

  return (
    <section
      className="w-full select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Shop with Adam Grocery Promotion"
    >
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 lg:px-8 pt-2.5 sm:pt-3.5 pb-2">
        {/* Sleek Panoramic Hero Container */}
        <div className="relative w-full h-[260px] sm:h-[300px] md:h-[340px] lg:h-[370px] rounded-[20px] sm:rounded-[32px] overflow-hidden bg-gradient-to-r from-[#DDF4FC] via-[#EAF7FD] to-[#D2F2FB] border border-sky-100/90 shadow-xs flex items-center">
          
          {/* Slide Background Layer with smooth transition */}
          {slides.map((slide, idx) => {
            const isCurrent = idx === currentSlide
            return (
              <div
                key={slide.id || idx}
                className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                  isCurrent ? 'opacity-100 z-1 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                {slide.is_uploaded ? (
                  // Full Background Banner Image
                  <>
                    <img
                      src={slide.image_url}
                      alt={slide.title}
                      className="absolute inset-0 w-full h-full object-cover object-right md:object-center select-none"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/images/kirana_hero_basket.jpg'
                      }}
                    />
                    {/* Soft gradient mask on left for high-contrast crisp text */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/80 to-transparent sm:w-[62%] w-[88%] pointer-events-none" />
                  </>
                ) : (
                  // Flagship Basket Design (from screenshot)
                  <>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#DDF4FC] via-[#EAF7FD] to-[#D2F2FB]" />
                    {/* Subtle Organic Background Accents */}
                    <div className="absolute -top-12 -right-12 w-64 h-64 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-12 -left-12 w-64 h-64 bg-sky-200/50 rounded-full blur-3xl pointer-events-none" />

                    {/* Fresh Grocery Basket Image on the right */}
                    <img
                      src={slide.image_url || '/images/kirana_hero_basket.jpg'}
                      alt={slide.title}
                      className="absolute right-3 sm:right-10 lg:right-16 bottom-0 sm:top-1/2 sm:-translate-y-1/2 max-h-[85%] max-w-[48%] object-contain mix-blend-multiply drop-shadow-md pointer-events-none select-none transition-transform duration-500 hover:scale-102"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/images/kirana_hero_basket.jpg'
                      }}
                    />

                    {/* Floating Cursive Callout: Fresh Healthy Happy ♡ */}
                    {slide.callout && (
                      <div className="hidden md:block absolute top-4 sm:top-6 right-6 sm:right-12 z-10 pointer-events-none text-right select-none">
                        <span className="font-serif italic text-base lg:text-xl text-slate-800/90 drop-shadow-xs block leading-tight font-medium tracking-wide">
                          {slide.callout}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Content Overlay: Text, Badge, CTA Buttons (Cleanly positioned on the left) */}
                <div className="relative z-10 h-full flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-4 sm:py-6 max-w-lg sm:max-w-xl text-left space-y-2 sm:space-y-3">
                  {/* Badge */}
                  <div>
                    <span className="inline-block px-3 py-0.5 sm:px-3.5 sm:py-1 rounded-full bg-[#BAE6FD]/90 backdrop-blur-xs text-[#004B87] font-sans font-black text-[10px] sm:text-[11px] tracking-wider uppercase border border-sky-300/60 shadow-2xs">
                      {slide.badge || 'FRESHNESS & QUALITY'}
                    </span>
                  </div>

                  {/* Title */}
                  <h1 className="font-sans font-black text-xl sm:text-3xl lg:text-[40px] text-[#0F172A] tracking-tight leading-[1.12]">
                    {slide.title.includes('\n') ? (
                      slide.title.split('\n').map((line, i) => (
                        <React.Fragment key={i}>
                          {line}
                          {i === 0 && <br />}
                        </React.Fragment>
                      ))
                    ) : (
                      slide.title
                    )}
                  </h1>

                  {/* Subtitle / Description */}
                  <p className="font-sans text-xs sm:text-sm text-slate-600 font-medium max-w-md line-clamp-2 sm:line-clamp-none leading-relaxed">
                    {slide.subtitle}
                  </p>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2.5 sm:gap-3 pt-1 sm:pt-2">
                    <button
                      type="button"
                      onClick={() => handleBannerClick(slide)}
                      className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[#004B87] hover:bg-[#003B6B] text-white font-sans font-bold text-xs sm:text-sm transition-all shadow-sm hover:shadow-md active:scale-95 cursor-pointer"
                    >
                      <span>{slide.cta_text || 'Shop Now'}</span>
                      <FiArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>

                    {slide.secondary_cta && (
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.PRODUCTS_BY_SECTION('deals'))}
                        className="inline-flex items-center px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-slate-900 border border-slate-200/90 font-sans font-bold text-xs sm:text-sm transition-all shadow-2xs active:scale-95 cursor-pointer backdrop-blur-xs"
                      >
                        {slide.secondary_cta}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Left Arrow Button */}
          {totalSlides > 1 && (
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev === 0 ? totalSlides - 1 : prev - 1))}
              className="absolute left-2.5 sm:left-4 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow-md border border-slate-200/80 flex items-center justify-center cursor-pointer transition-all active:scale-95 hover:scale-105"
              aria-label="Previous Slide"
            >
              <FiChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
            </button>
          )}

          {/* Right Arrow Button */}
          {totalSlides > 1 && (
            <button
              type="button"
              onClick={() => setCurrentSlide((prev) => (prev + 1) % totalSlides)}
              className="absolute right-2.5 sm:right-4 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow-md border border-slate-200/80 flex items-center justify-center cursor-pointer transition-all active:scale-95 hover:scale-105"
              aria-label="Next Slide"
            >
              <FiChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
            </button>
          )}

          {/* Centered Pagination Dots at Bottom */}
          {totalSlides > 1 && (
            <div className="absolute bottom-2.5 sm:bottom-3.5 inset-x-0 flex justify-center items-center gap-1.5 z-20 pointer-events-auto">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === currentSlide
                      ? 'w-6 bg-[#004B87] shadow-xs'
                      : 'w-2 bg-sky-300/80 hover:bg-sky-400'
                  }`}
                />
              ))}
            </div>
          )}

        </div>
      </div>
    </section>
  )
}
