import React from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'

const THEME_MAP = {
  blue: {
    gradient: 'from-[#0369A1] via-[#0284C7] to-[#0EA5E9]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#0369A1]',
  },
  teal: {
    gradient: 'from-[#0F766E] via-[#0D9488] to-[#14B8A6]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#0F766E]',
  },
  orange: {
    gradient: 'from-[#C2410C] via-[#EA580C] to-[#F97316]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#C2410C]',
  },
  pink: {
    gradient: 'from-[#BE123C] via-[#E11D48] to-[#F43F5E]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#BE123C]',
  },
  green: {
    gradient: 'from-[#15803D] via-[#16A34A] to-[#22C55E]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#15803D]',
  },
  lavender: {
    gradient: 'from-[#6B21A8] via-[#7C3AED] to-[#8B5CF6]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#7C3AED]',
  },
  purple: {
    gradient: 'from-[#5B21B6] via-[#7C3AED] to-[#8B5CF6]',
    badgeBg: 'bg-white/20 text-white border-white/30',
    buttonColor: 'text-[#7C3AED]',
  },
}

export default function CategoryBanner({ banner, onScrollToProducts }) {
  const navigate = useNavigate()

  if (!banner || Number(banner.is_active) !== 1) {
    return null
  }

  const themeKey = (banner.color_theme || 'purple').toLowerCase()
  const theme = THEME_MAP[themeKey] || THEME_MAP.purple
  const imageUrl = resolveImageUrl(banner.image_desktop_path || banner.image_mobile_path)

  const handleAction = (e) => {
    e.stopPropagation()
    if (banner.target_link) {
      if (banner.target_link.startsWith('http://') || banner.target_link.startsWith('https://')) {
        window.open(banner.target_link, '_blank', 'noopener,noreferrer')
        return
      }
      // If already on the same URL path, scroll down smoothly to products
      if (
        typeof window !== 'undefined' &&
        (banner.target_link === window.location.pathname + window.location.search ||
          banner.target_link === `/products?category_id=${banner.target_id}`)
      ) {
        if (onScrollToProducts) {
          onScrollToProducts()
        } else {
          window.scrollTo({ top: 380, behavior: 'smooth' })
        }
        return
      }
      navigate(banner.target_link)
    } else if (onScrollToProducts) {
      onScrollToProducts()
    }
  }

  return (
    <div
      onClick={handleAction}
      className={`w-full rounded-2xl sm:rounded-3xl p-5 sm:p-7 md:p-8 bg-gradient-to-r ${theme.gradient} text-white shadow-lg relative overflow-hidden border border-white/20 mb-6 group select-none cursor-pointer transition-all duration-300 hover:shadow-xl`}
    >
      {/* Background ambient lighting */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-black/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 relative z-10">
        {/* Left: Text & Content */}
        <div className="w-full md:flex-1 space-y-2">
          {banner.discount_text && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider backdrop-blur-md shadow-xs border border-white/30 bg-white/20">
              <span>🔥</span>
              <span>{banner.discount_text}</span>
            </div>
          )}

          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
            {banner.title}
          </h2>

          {banner.subtitle && (
            <p className="text-xs sm:text-sm md:text-base font-bold text-white/95 tracking-wide">
              {banner.subtitle}
            </p>
          )}

          {banner.description && (
            <p className="text-xs sm:text-sm text-white/85 max-w-xl leading-relaxed pt-0.5 line-clamp-2 md:line-clamp-3">
              {banner.description}
            </p>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleAction}
              className={`inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-white ${theme.buttonColor} hover:bg-white/95 text-xs sm:text-sm font-black shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer`}
            >
              <span>{banner.cta_text || 'Shop Category'}</span>
              <svg
                className="w-4 h-4 transition-transform group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Right: Responsive Banner Image */}
        {imageUrl && (
          <div className="w-full md:w-2/5 lg:w-[38%] shrink-0 flex justify-center md:justify-end">
            <div className="w-full max-w-[380px] md:max-w-none h-44 sm:h-52 md:h-56 lg:h-60 rounded-xl sm:rounded-2xl overflow-hidden bg-white/10 backdrop-blur-xs p-1.5 sm:p-2 border border-white/25 shadow-xl">
              <img
                src={imageUrl}
                alt={banner.title}
                className="w-full h-full object-cover rounded-lg sm:rounded-xl group-hover:scale-105 transition-transform duration-500"
                loading="eager"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
