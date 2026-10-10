import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { resolveImageUrl } from '../lib/api'

export default function PopupBannerModal({ banner }) {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!banner) {
      setIsOpen(false)
      return
    }
    // Check if dismissed in current browser session
    try {
      const dismissed = sessionStorage.getItem(`popup_banner_dismissed_${banner.id}`)
      if (!dismissed) {
        setIsOpen(true)
      }
    } catch {
      setIsOpen(true)
    }
  }, [banner])

  if (!isOpen || !banner) return null

  const handleClose = () => {
    setIsOpen(false)
    try {
      sessionStorage.setItem(`popup_banner_dismissed_${banner.id}`, 'true')
    } catch {
      // ignore
    }
  }

  const handleAction = () => {
    handleClose()
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
    if (banner.target_type === 'EXTERNAL_URL' && banner.target_url) {
      window.open(banner.target_url, '_blank', 'noopener,noreferrer')
      return
    }
    navigate('/products')
  }

  const image = resolveImageUrl(banner.image_desktop_path || banner.image_mobile_path)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#E8E0E5] animate-scale-up">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-sm font-bold backdrop-blur-sm cursor-pointer transition-colors"
          aria-label="Close promotion"
        >
          ×
        </button>

        {/* Media */}
        {image && (
          <div className="w-full h-48 sm:h-56 overflow-hidden bg-[#F8F3F6]">
            <img src={image} alt={banner.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="p-6 text-center space-y-3">
          {banner.discount_text && (
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2DDE9] text-[#601D49] text-xs font-black uppercase tracking-wider">
                <span>🔥</span>
                <span>{banner.discount_text}</span>
              </span>
            </div>
          )}

          <h3 className="text-xl sm:text-2xl font-black text-[#2D252B] leading-tight">
            {banner.title}
          </h3>

          {banner.subtitle && (
            <p className="text-sm font-semibold text-[#601D49]">
              {banner.subtitle}
            </p>
          )}

          {banner.description && (
            <p className="text-xs text-[#6B5E68] leading-relaxed max-w-sm mx-auto">
              {banner.description}
            </p>
          )}

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleAction}
              className="px-6 py-2.5 rounded-full bg-[#601D49] hover:bg-[#4D153A] text-white text-xs sm:text-sm font-black shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {banner.cta_text || 'Explore Offer →'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-full bg-[#F7F5F7] hover:bg-[#F2DDE9] text-[#2D252B] text-xs sm:text-sm font-bold transition-all cursor-pointer border border-[#E8E0E5]"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
