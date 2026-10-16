import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiTruck, FiArrowRight, FiCopy, FiCheck, FiTag, FiPercent, FiGift, FiZap, FiStar } from 'react-icons/fi'

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

  const renderIcon = (iconType) => {
    switch (iconType) {
      case 'truck':
        return <FiTruck className="w-5 h-5 text-[#7c3aed]" />
      case 'tag':
        return <FiTag className="w-5 h-5 text-[#7c3aed]" />
      case 'percent':
        return <FiPercent className="w-5 h-5 text-[#7c3aed]" />
      case 'gift':
        return <FiGift className="w-5 h-5 text-[#7c3aed]" />
      case 'zap':
        return <FiZap className="w-5 h-5 text-[#7c3aed]" />
      case 'star':
        return <FiStar className="w-5 h-5 text-[#7c3aed]" />
      default:
        return <FiPercent className="w-5 h-5 text-[#7c3aed]" />
    }
  }

  // If dynamic topOffers are provided from MySQL database (/api/top-offers)
  let displayCards = []

  if (Array.isArray(topOffers) && topOffers.length > 0) {
    displayCards = topOffers.map((item) => ({
      id: item.id,
      badge: item.badge,
      title: item.title,
      subtitle: item.subtitle,
      code: item.code,
      imagePath: item.image_path,
      icon: renderIcon(item.icon),
      link: item.link || ROUTES.PRODUCTS_BY_SECTION('deals'),
      buttonText: item.button_text || 'Shop Deals',
      gradient: 'from-[#faf5ff] to-[#f5f3ff] border-[#e9d5ff]',
    }))
  } else {
    // Fallback if top_offers table is empty
    const freeMinAmount = deliverySettings?.free_delivery_threshold
      ? Number(deliverySettings.free_delivery_threshold)
      : 499

    if (deliverySettings) {
      displayCards.push({
        id: 'delivery-threshold-offer',
        badge: 'FREE DELIVERY',
        title: `Free Delivery Above ₹${freeMinAmount}`,
        subtitle: `No shipping charge applied on orders over ₹${freeMinAmount}. Fast doorstep delivery.`,
        code: null,
        imagePath: null,
        icon: <FiTruck className="w-5 h-5 text-[#7c3aed]" />,
        link: ROUTES.PRODUCTS,
        buttonText: 'Shop Essentials',
        gradient: 'from-[#faf5ff] to-[#f5f3ff] border-[#e9d5ff]',
      })
    }

    const fallbackCoupons = Array.isArray(activeOffers) ? activeOffers : []
    fallbackCoupons.forEach((coupon) => {
      const isFixed = coupon.discount_type === 'FIXED'
      const discountVal = Math.round(Number(coupon.discount_value) || 0)
      const discountBadge = isFixed ? `FLAT ₹${discountVal} OFF` : `${discountVal}% OFF`

      let subtitle = coupon.description
      if (!subtitle) {
        subtitle = coupon.min_order_amount && Number(coupon.min_order_amount) > 0
          ? `Valid on minimum cart value of ₹${Math.round(coupon.min_order_amount)}`
          : 'Applicable directly on checkout'
      }

      displayCards.push({
        id: `coupon-${coupon.id || coupon.code}`,
        badge: discountBadge,
        title: coupon.name || `Coupon: ${coupon.code}`,
        subtitle,
        code: coupon.code,
        imagePath: null,
        icon: isFixed ? <FiTag className="w-5 h-5 text-[#7c3aed]" /> : <FiPercent className="w-5 h-5 text-[#7c3aed]" />,
        link: ROUTES.PRODUCTS_BY_SECTION('deals'),
        buttonText: 'Shop Deals',
        gradient: 'from-[#faf5ff] to-[#f5f3ff] border-[#e9d5ff]',
      })
    })
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <section className="w-full bg-white py-6 px-3 sm:px-6 lg:px-8 xl:px-12 border-b border-[#e9d5ff]">
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-slate-100 border border-[#e9d5ff]/50" />
          ))}
        </div>
      </section>
    )
  }

  if (displayCards.length === 0) {
    return null
  }

  return (
    <section className="w-full bg-white py-6 sm:py-8 px-3 sm:px-6 lg:px-8 xl:px-12 select-none border-b border-[#e9d5ff]">
      {/* Section Header */}
      <div className="w-full flex items-center justify-between mb-4 sm:mb-5">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed] animate-pulse" />
          <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
            Top Offers for You
          </h2>
        </div>
        <Link
          to={ROUTES.PRODUCTS_BY_SECTION('deals')}
          className="text-xs font-bold text-[#6d28d9] hover:text-black hover:underline flex items-center gap-1 transition-colors"
        >
          <span>View All Deals</span>
          <FiArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Dynamic Promo Cards across 100% width grid */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {displayCards.slice(0, 4).map((card) => {
          const isCopied = copiedCode === card.code
          const hasImage = Boolean(card.imagePath)

          return (
            <div
              key={card.id}
              className={`relative overflow-hidden rounded-2xl border transition-all duration-300 group hover:shadow-xl hover:-translate-y-0.5 flex flex-col justify-between ${
                hasImage
                  ? 'border-white/60 shadow-md bg-slate-900/10'
                  : `rounded-2xl bg-gradient-to-br ${card.gradient} shadow-2xs hover:shadow-md`
              }`}
            >
              {/* Background Image Container */}
              {hasImage && (
                <div className="absolute inset-0 z-0">
                  <img
                    src={resolveImageUrl(card.imagePath)}
                    alt={card.title}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                  />
                  {/* Frosted Glass Overlay: blur + soft translucent light gradient */}
                  <div className="absolute inset-0 bg-white/70 backdrop-blur-[3.5px] bg-gradient-to-tr from-white/90 via-white/75 to-white/60" />
                </div>
              )}

              {/* Glass UI Content */}
              <div className="relative z-10 p-4 sm:p-4.5 flex flex-col justify-between h-full min-h-[175px]">
                <div>
                  {/* Badge & Icon with Frosted Glass styling */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-md shadow-2xs tracking-wide border ${
                        hasImage
                          ? 'bg-white/85 text-[#6d28d9] border-white/80 backdrop-blur-md'
                          : 'bg-[#ede9fe] text-[#6d28d9] border-[#ddd6fe]'
                      }`}
                    >
                      {card.badge}
                    </span>
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-xl border shadow-2xs group-hover:scale-110 transition-transform duration-300 ${
                        hasImage
                          ? 'bg-white/85 border-white/80 backdrop-blur-md'
                          : 'bg-white/80 border-[#e9d5ff]'
                      }`}
                    >
                      {card.icon}
                    </div>
                  </div>

                  {/* Title & Subtitle sitting directly on top of the image */}
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 leading-tight line-clamp-1 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]">
                    {card.title}
                  </h3>
                  <p className="text-[11px] text-slate-700 font-medium mt-1 line-clamp-2 leading-relaxed">
                    {card.subtitle}
                  </p>

                  {/* Optional Coupon Code with Copy Button */}
                  {card.code && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(card.code)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-500 text-white border-emerald-600 shadow-2xs'
                            : hasImage
                            ? 'bg-white/90 hover:bg-white text-[#6d28d9] border-white/80 shadow-2xs backdrop-blur-md'
                            : 'bg-white hover:bg-[#ede9fe] text-[#6d28d9] border-[#ddd6fe]'
                        }`}
                        title="Click to copy coupon code"
                      >
                        {isCopied ? (
                          <>
                            <FiCheck className="w-3 h-3" />
                            <span>COPIED!</span>
                          </>
                        ) : (
                          <>
                            <FiCopy className="w-3 h-3" />
                            <span>CODE: {card.code}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Action Button: Solid Black Button with White Text */}
                <div className="pt-3.5">
                  <Link
                    to={card.link}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-black hover:bg-neutral-800 text-white text-[11px] font-bold shadow-2xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <span>{card.buttonText}</span>
                    <FiArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}