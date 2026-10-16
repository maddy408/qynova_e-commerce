import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiX } from 'react-icons/fi'
import { TbSparkles } from 'react-icons/tb'
import { resolveImageUrl } from '../lib/api'
import { ROUTES } from '../routes/routes'

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
      navigate(ROUTES.PRODUCTS_BY_CATEGORY(banner.target_id))
      return
    }
    if (banner.target_type === 'PRODUCT' && banner.target_id) {
      navigate(ROUTES.PRODUCT_DETAIL(banner.target_id))
      return
    }
    if (banner.target_type === 'EXTERNAL_URL' && banner.target_url) {
      window.open(banner.target_url, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(ROUTES.PRODUCTS)
  }

  const image = resolveImageUrl(banner.image_desktop_path || banner.image_mobile_path)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-[var(--color-border-subtle)] animate-scale-up">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-sm font-bold backdrop-blur-sm cursor-pointer transition-colors"
          aria-label="Close promotion"
        >
          <FiX className="w-4 h-4" />
        </button>

        {/* Media */}
        {image && (
          <div className="w-full h-48 sm:h-56 overflow-hidden bg-[var(--color-bg-main)]">
            <img src={image} alt={banner.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Content */}
        <div className="p-6 text-center space-y-3">
          {banner.discount_text && (
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-xs font-black uppercase tracking-wider">
                <TbSparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>{banner.discount_text}</span>
              </span>
            </div>
          )}

          <h3 className="text-xl sm:text-2xl font-black text-[var(--color-text-main)] leading-tight">
            {banner.title}
          </h3>

          {banner.subtitle && (
            <p className="text-sm font-semibold text-[var(--color-brand)]">
              {banner.subtitle}
            </p>
          )}

          {banner.description && (
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed max-w-sm mx-auto">
              {banner.description}
            </p>
          )}

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleAction}
              className="px-6 py-2.5 rounded-full bg-[var(--color-brand)] hover:bg-[var(--color-brand-hover)] text-white text-xs sm:text-sm font-black shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {banner.cta_text || 'Explore Offer →'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2.5 rounded-full bg-[var(--color-bg-alt)] hover:bg-[var(--color-primary-tint)] text-[var(--color-text-main)] text-xs sm:text-sm font-bold transition-all cursor-pointer border border-[var(--color-border-subtle)]"
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
