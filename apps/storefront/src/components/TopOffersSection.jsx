import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../routes/routes'
import { resolveImageUrl } from '../lib/api'
import { FiTruck, FiArrowRight, FiCopy, FiCheck, FiTag, FiPercent, FiGift, FiZap, FiStar } from 'react-icons/fi'
import { LuSparkles } from 'react-icons/lu'

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
        return <FiTruck className="w-5 h-5 text-[#6C4EFF]" />
      case 'gift':
        return <FiGift className="w-5 h-5 text-[#6C4EFF]" />
      case 'star':
        return <FiStar className="w-5 h-5 text-[#FFB800]" />
      default:
        return <LuSparkles className="w-5 h-5 text-[#6C4EFF]" />
    }
  }

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
      buttonText: item.button_text || 'Claim Offer',
    }))
  } else {
    const freeMinAmount = deliverySettings?.free_delivery_threshold
      ? Number(deliverySettings.free_delivery_threshold)
      : 499

    if (deliverySettings) {
      displayCards.push({
        id: 'delivery-threshold-offer',
        badge: 'FREE DELIVERY',
        title: `Free Delivery on Orders Above ₹${freeMinAmount}`,
        subtitle: `Enjoy express doorstep grocery delivery directly to your home with zero shipping fee.`,
        code: null,
        imagePath: null,
        icon: <FiTruck className="w-5 h-5 text-[#6C4EFF]" />,
        link: ROUTES.PRODUCTS,
        buttonText: 'Shop Groceries',
      })
    }

    const fallbackCoupons = Array.isArray(activeOffers) ? activeOffers : []
    fallbackCoupons.forEach((coupon) => {
      const isFixed = coupon.discount_type === 'FIXED'
      const discountVal = Math.round(Number(coupon.discount_value) || 0)
      const discountBadge = isFixed ? `FLAT ₹${discountVal} OFF` : `${discountVal}% SPECIAL SAVINGS`

      let subtitle = coupon.description
      if (!subtitle) {
        subtitle = coupon.min_order_amount && Number(coupon.min_order_amount) > 0
          ? `Applicable on grocery orders above ₹${Math.round(coupon.min_order_amount)}`
          : 'Apply at checkout to redeem savings'
      }

      displayCards.push({
        id: `coupon-${coupon.id || coupon.code}`,
        badge: discountBadge,
        title: coupon.name || `Special Voucher: ${coupon.code}`,
        subtitle,
        code: coupon.code,
        imagePath: null,
        icon: <LuSparkles className="w-5 h-5 text-[#6C4EFF]" />,
        link: ROUTES.PRODUCTS_BY_SECTION('deals'),
        buttonText: 'Redeem Voucher',
      })
    })
  }

  if (isLoading) {
    return (
      <section className="w-full bg-[#FAF8FF] py-14 px-4 sm:px-6 lg:px-8 border-b border-[#E9DFFF]">
        <div className="max-w-[1320px] mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-[24px] bg-white border border-[#E9DFFF]" />
          ))}
        </div>
      </section>
    )
  }

  if (displayCards.length === 0) {
    return null
  }

  return (
    <section className="w-full bg-[#FAF8FF] py-14 sm:py-20 px-4 sm:px-6 lg:px-8 select-none border-b border-[#E9DFFF]">
      <div className="max-w-[1320px] mx-auto">
        
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <span className="text-[12px] font-sans font-bold uppercase tracking-[0.2em] text-[#6C4EFF] block mb-2">
              TOP SAVINGS & OFFERS
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-[#1B133F] tracking-tight">
              Exclusive Grocery Offers & Vouchers
            </h2>
          </div>
          <Link
            to={ROUTES.PRODUCTS_BY_SECTION('deals')}
            className="text-xs sm:text-sm font-sans font-semibold text-[#6C4EFF] hover:text-[#4B2AC5] flex items-center gap-1.5 transition-colors self-start sm:self-end"
          >
            <span>View All Vouchers</span>
            <FiArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Offer Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {displayCards.slice(0, 4).map((card) => {
            const isCopied = copiedCode === card.code
            const hasImage = Boolean(card.imagePath)

            return (
              <div
                key={card.id}
                className="bg-white rounded-[24px] p-6 border border-[#E9DFFF] shadow-[0_6px_25px_rgba(108,78,255,0.04)] hover:shadow-[0_16px_35px_rgba(108,78,255,0.1)] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between relative overflow-hidden group"
              >
                {/* Background Subtle Gradient */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#F3EDFF]/60 rounded-full blur-2xl pointer-events-none" />

                <div className="relative z-10">
                  {/* Top Badge & Icon */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-[10px] font-sans font-bold uppercase px-2.5 py-1 rounded-full bg-[#FAF8FF] text-[#6C4EFF] border border-[#E9DFFF] tracking-wider">
                      {card.badge}
                    </span>
                    <div className="w-8 h-8 rounded-full bg-[#FAF8FF] border border-[#E9DFFF] flex items-center justify-center">
                      {card.icon}
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <h3 className="font-serif text-base sm:text-lg font-bold text-[#1B133F] leading-snug line-clamp-2 mb-2">
                    {card.title}
                  </h3>
                  <p className="font-sans text-xs text-[#666666] leading-relaxed line-clamp-2 mb-4">
                    {card.subtitle}
                  </p>

                  {/* Coupon Code Pill */}
                  {card.code && (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => handleCopyCode(card.code)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold border transition-all cursor-pointer ${
                          isCopied
                            ? 'bg-emerald-500 text-white border-emerald-600'
                            : 'bg-[#FAF8FF] hover:bg-[#F3EDFF] text-[#6C4EFF] border-[#E9DFFF]'
                        }`}
                        title="Click to copy code"
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

                {/* Bottom CTA Button */}
                <div className="pt-3 border-t border-[#E9DFFF]/60 relative z-10">
                  <Link
                    to={card.link}
                    className="w-full py-2.5 px-4 rounded-full bg-[#6C4EFF] hover:bg-[#4B2AC5] text-white text-xs font-sans font-semibold flex items-center justify-center gap-1.5 transition-all shadow-[0_4px_12px_rgba(108,78,255,0.25)] active:scale-95"
                  >
                    <span>{card.buttonText}</span>
                    <FiArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </section>
  )
}