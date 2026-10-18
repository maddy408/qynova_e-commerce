import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiArrowRight, FiCopy, FiCheck } from 'react-icons/fi'
import Button from './common/Button'

/**
 * Top Offers for You Section
 * Exactly matches the KiranaBazaar reference image:
 * - 4 pastel promo cards (Mint, Peach, Sky Blue, Lavender)
 * - Coupon copy badge
 * - Themed CTA buttons
 * - 4 dedicated saved offer graphics (delivery truck, grocery basket, gift box, discount tag)
 * - Full fallback protection to local saved images so broken icons never happen
 */
export default function TopOffersSection({
  topOffers = [],
  deliverySettings = null,
  activeOffers = [],
  isLoading = false,
}) {
  const [copiedCode, setCopiedCode] = useState(null)

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

  const freeThreshold =
    deliverySettings?.free_delivery_threshold != null
      ? Number(deliverySettings.free_delivery_threshold)
      : 499

  // Local saved illustrations in public/images/offers/
  const localOfferImages = [
    '/images/offers/offer_truck.png',
    '/images/offers/offer_basket.png',
    '/images/offers/offer_gift.png',
    '/images/offers/offer_tag.png',
  ]

  // Default preset cards matching reference image
  const presetCards = [
    {
      id: 'offer-card-1',
      bgGradient: 'from-[#E0F7FA]/70 via-[#E8F8FC]/60 to-[#DCFCE7]/50 border-emerald-100',
      badgeBg: 'bg-[#E0F2FE] text-[#0284C7]',
      badge: 'FREE DELIVERY',
      title: `Free Delivery Above ₹${freeThreshold}`,
      subtitle: `No shipping charge applied on orders over ₹${freeThreshold}. Fast doorstep delivery.`,
      code: null,
      btnText: 'Shop Essentials',
      btnVariant: 'primary',
      link: ROUTES.PRODUCTS,
      image: '/images/offers/offer_truck.png',
      fallbackImage: '/images/offers/offer_truck.png',
    },
    {
      id: 'offer-card-2',
      bgGradient: 'from-[#FFEDD5]/70 via-[#FFF1F2]/60 to-[#FEE2E2]/50 border-rose-100',
      badgeBg: 'bg-rose-100 text-rose-600',
      badge: 'FLAT ₹50 OFF',
      title: 'Flat ₹50 Off Kirana Welcome',
      subtitle: 'Flat ₹50 instant discount on orders above ₹299.',
      code: 'KIRANA50',
      btnText: 'Shop Deals',
      btnVariant: 'secondary',
      btnCustomClass: 'bg-rose-600 hover:bg-rose-700 text-white',
      link: ROUTES.PRODUCTS_BY_SECTION('deals'),
      image: '/images/offers/offer_basket.png',
      fallbackImage: '/images/offers/offer_basket.png',
    },
    {
      id: 'offer-card-3',
      bgGradient: 'from-[#E0F2FE]/80 via-[#F0F9FF]/70 to-[#E0F7FA]/50 border-sky-100',
      badgeBg: 'bg-sky-100 text-sky-700',
      badge: '10% OFF',
      title: 'Festive Offer 10% Off',
      subtitle: 'Get 10% off on all accessories and gift orders above ₹499.',
      code: 'FESTIVE10',
      btnText: 'Shop Deals',
      btnVariant: 'primary',
      link: ROUTES.PRODUCTS_BY_SECTION('deals'),
      image: '/images/offers/offer_gift.png',
      fallbackImage: '/images/offers/offer_gift.png',
    },
    {
      id: 'offer-card-4',
      bgGradient: 'from-[#F3E8FF]/70 via-[#FAF5FF]/70 to-[#EDE9FE]/50 border-purple-100',
      badgeBg: 'bg-purple-100 text-purple-700',
      badge: '10% OFF',
      title: 'Test Coupon',
      subtitle: 'Applicable directly on checkout',
      code: 'TEST10',
      btnText: 'Shop Deals',
      btnVariant: 'primary',
      btnCustomClass: 'bg-purple-600 hover:bg-purple-700 text-white',
      link: ROUTES.PRODUCTS_BY_SECTION('deals'),
      image: '/images/offers/offer_tag.png',
      fallbackImage: '/images/offers/offer_tag.png',
    },
  ]

  // If live offers exist from database, map dynamically into cards
  let displayCards = [...presetCards]
  if (Array.isArray(topOffers) && topOffers.length > 0) {
    displayCards = topOffers.slice(0, 4).map((item, idx) => {
      const fallback = localOfferImages[idx % localOfferImages.length]
      let resolved = fallback

      if (item.image_path) {
        if (item.image_path.startsWith('/images/') || item.image_path.startsWith('http')) {
          resolved = item.image_path
        } else {
          resolved = resolveImageUrl(item.image_path) || fallback
        }
      }

      return {
        id: item.id || `live-offer-${idx}`,
        bgGradient: presetCards[idx % presetCards.length].bgGradient,
        badgeBg: presetCards[idx % presetCards.length].badgeBg,
        badge: item.badge || presetCards[idx % presetCards.length].badge,
        title: item.title || presetCards[idx % presetCards.length].title,
        subtitle: item.subtitle || presetCards[idx % presetCards.length].subtitle,
        code: item.code,
        btnText: item.button_text || presetCards[idx % presetCards.length].btnText,
        btnVariant: presetCards[idx % presetCards.length].btnVariant,
        btnCustomClass: presetCards[idx % presetCards.length].btnCustomClass,
        link: item.link || ROUTES.PRODUCTS_BY_SECTION('deals'),
        image: resolved,
        fallbackImage: fallback,
      }
    })
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

  return (
    <section className="w-full py-4 sm:py-6 select-none">
      <div className="max-w-[1320px] mx-auto px-3 sm:px-6 lg:px-8">
        
        {/* Header: 🔥 Top Offers for You */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">🔥</span>
            <h2 className="font-sans text-base sm:text-lg font-black text-[var(--color-text-main)] tracking-tight">
              Top Offers for You
            </h2>
          </div>

          <Link
            to={ROUTES.PRODUCTS_BY_SECTION('deals')}
            className="text-xs sm:text-[13px] font-sans font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1 transition-colors"
          >
            <span>View All Deals</span>
            <FiArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* 4 Pastel Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {displayCards.slice(0, 4).map((card) => {
            const isCopied = copiedCode === card.code

            return (
              <div
                key={card.id}
                className={`rounded-2xl p-4 sm:p-4.5 border bg-gradient-to-br ${card.bgGradient} shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col justify-between relative overflow-hidden group`}
              >
                <div>
                  {/* Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[9.5px] sm:text-[10px] font-sans font-extrabold uppercase px-2 py-0.5 rounded shadow-2xs ${card.badgeBg}`}
                    >
                      {card.badge}
                    </span>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="font-sans text-xs sm:text-[13px] font-extrabold text-[var(--color-text-main)] leading-snug mb-1">
                    {card.title}
                  </h3>
                  <p className="font-sans text-[11px] text-slate-600 leading-relaxed line-clamp-2 mb-2.5">
                    {card.subtitle}
                  </p>

                  {/* Coupon Code Pill */}
                  {card.code && (
                    <div className="mb-3">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(card.code)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-600 text-white border-emerald-700'
                            : 'bg-white/90 text-purple-700 border-purple-200 hover:bg-white'
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

                {/* Bottom Row: CTA Button + Illustration */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-black/5 mt-auto">
                  <Button
                    variant={card.btnVariant || 'primary'}
                    size="xs"
                    rounded="full"
                    to={card.link}
                    icon={<FiArrowRight className="w-3 h-3" />}
                    iconPosition="right"
                    className={card.btnCustomClass || ''}
                  >
                    {card.btnText}
                  </Button>

                  {/* Mini Visual / Illustration */}
                  <div className="shrink-0 w-16 h-12 flex items-center justify-end">
                    <img
                      src={card.image}
                      alt={card.title}
                      onError={(e) => {
                        if (card.fallbackImage && e.currentTarget.src !== card.fallbackImage) {
                          e.currentTarget.src = card.fallbackImage
                        }
                      }}
                      className="max-h-12 max-w-full object-contain drop-shadow-xs group-hover:scale-105 transition-transform"
                    />
                  </div>
                </div>

              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}