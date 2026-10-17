import React, { useState, useEffect } from 'react'
import { resolveImageUrl } from '../lib/api'
import { FiHeart, FiPlus, FiCheck } from 'react-icons/fi'
import { FaStar } from 'react-icons/fa6'

export default function ProductCard({
  product,
  isWishlist = false,
  onToggleWishlist,
  onAddToCart,
  onClick,
}) {
  if (!product) return null

  const retailPrice = Number(product.min_price ?? product.price ?? product.selling_price) || 0
  const hasPrice = retailPrice > 0
  const mrp = Number(product.mrp) || 0
  const showDiscount = product.show_discount !== 0 && product.show_discount !== false && product.show_discount !== '0'
  const discountPercent = hasPrice && mrp > retailPrice && showDiscount ? Math.round(((mrp - retailPrice) / mrp) * 100) : 0

  const rawImage =
    product.primary_image ||
    (Array.isArray(product.images) && (product.images[0]?.image_path || product.images[0])) ||
    ''
  const resolvedImage = resolveImageUrl(rawImage) || '/placeholder-product.svg'

  const [imgSrc, setImgSrc] = useState(resolvedImage)
  const [justAdded, setJustAdded] = useState(false)

  useEffect(() => {
    setImgSrc(resolvedImage)
  }, [resolvedImage])

  const hasVariants = product.variant_count === undefined || Number(product.variant_count) > 0
  const isOutOfStock = !hasVariants || (product.total_stock !== undefined && product.total_stock !== null ? Number(product.total_stock) <= 0 : !hasPrice)
  const isUnavailable = !hasVariants || !hasPrice

  const unitWeight =
    product.unit_short_code ||
    product.unit_name ||
    (product.weight_grams
      ? Number(product.weight_grams) >= 1000
        ? `${(Number(product.weight_grams) / 1000).toFixed(1)} kg`
        : `${Number(product.weight_grams)} g`
      : null) ||
    (product.short_description &&
    product.short_description.trim().toLowerCase() !== product.name.trim().toLowerCase()
      ? product.short_description
      : null) ||
    '1 Unit'

  const handleAddClick = (e) => {
    if (isOutOfStock || isUnavailable || !onAddToCart) return
    onAddToCart(product, e)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1800)
  }

  // Restrained luxury badge label
  const badgeLabel = product.badge || (discountPercent > 0 ? `${discountPercent}% OFF` : product.is_featured ? 'BESTSELLER' : null)

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-[24px] p-6 sm:p-7 border border-[#E9DFFF] shadow-[0_10px_30px_rgba(108,78,255,0.05)] hover:shadow-[0_20px_40px_rgba(108,78,255,0.12)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between group cursor-pointer h-full select-none"
    >
      <div>
        {/* 1. PRODUCT IMAGE AREA: 280-300px height with soft lavender radial glow & contain sizing */}
        <div className="relative rounded-[18px] overflow-hidden bg-[radial-gradient(circle_at_center,#FAF8FF_0%,#E9DFFF_100%)] h-[280px] sm:h-[300px] flex items-center justify-center p-6 border border-[#E9DFFF]/40">
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => setImgSrc('/placeholder-product.svg')}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
          />

          {/* Small Restrained Badge (Do not obscure image) */}
          {badgeLabel && (
            <span className="absolute top-3.5 left-3.5 bg-white/95 backdrop-blur-sm text-[#4B2AC5] border border-[#E9DFFF] font-sans font-bold text-[10px] tracking-[0.1em] px-2.5 py-1 rounded-full shadow-xs uppercase z-10">
              {badgeLabel}
            </span>
          )}

          {/* Wishlist Heart Icon Button */}
          {onToggleWishlist && (
            <button
              type="button"
              onClick={(e) => onToggleWishlist(product.id, e)}
              className={`absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-xs backdrop-blur-sm border border-[#E9DFFF] transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer z-10 ${
                isWishlist ? 'text-[#6C4EFF] border-[#BFA2FF]' : 'text-[#666666] hover:text-[#6C4EFF]'
              }`}
              title="Save to Wishlist"
              aria-label="Save to Wishlist"
            >
              <FiHeart
                className={`w-4 h-4 transition-transform ${isWishlist ? 'fill-[#6C4EFF] stroke-[#6C4EFF]' : ''}`}
              />
            </button>
          )}

          {/* Out of Stock overlay watermark */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-[#FAF8FF]/75 backdrop-blur-[2px] flex items-center justify-center z-10">
              <span className="bg-white text-[#1B133F] px-4 py-1.5 rounded-full text-xs font-sans font-bold border border-[#E9DFFF] shadow-xs tracking-wider uppercase">
                {isUnavailable ? 'Unavailable' : 'Sold Out'}
              </span>
            </div>
          )}
        </div>

        {/* 2. SPACING RHYTHM: ~20px gap before details */}
        <div className="mt-5">
          {/* Star Rating in Accent Gold #FFB800 */}
          <div className="flex items-center gap-1.5 mb-2 text-[#FFB800]">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <FaStar key={i} className="w-3 h-3 fill-[#FFB800]" />
              ))}
            </div>
            <span className="text-[11px] font-sans font-medium text-[#666666] ml-1">
              5.0 (24)
            </span>
          </div>

          {/* Category / Brand Eyebrow: 12px uppercase with letter spacing */}
          <div className="mb-1.5">
            <span className="text-[12px] uppercase tracking-[0.18em] font-semibold text-[#6C4EFF]">
              {product.brand_name || product.category_name || (product.product_code ? `SKU: ${product.product_code}` : 'Grocery')}
            </span>
          </div>

          {/* Product Title: ~22px Playfair Display Semibold #1B133F */}
          <h3 className="font-serif text-[20px] sm:text-[22px] font-semibold text-[#1B133F] line-clamp-2 leading-snug group-hover:text-[#6C4EFF] transition-colors min-h-[56px]">
            {product.name}
          </h3>

          {/* Size / Volume Text: Inter ~14px, #666666, line-height 1.6 */}
          {unitWeight && (
            <p className="mt-1.5 text-sm font-sans text-[#666666] leading-[1.6]">
              {unitWeight}
            </p>
          )}
        </div>
      </div>

      {/* 3. BOTTOM PRICE & ADD-TO-CART ACTION */}
      <div className="mt-5 pt-4 border-t border-[#E9DFFF]/70 flex items-center justify-between gap-3">
        {/* Price Display */}
        <div className="flex flex-col">
          {isUnavailable ? (
            <span className="text-xs font-sans font-semibold text-[#666666]">
              Price on request
            </span>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-xl sm:text-2xl font-bold text-[#1B133F]">
                ₹{retailPrice}
              </span>
              {showDiscount && mrp > retailPrice && (
                <span className="text-xs font-sans text-[#999999] line-through font-normal">
                  ₹{mrp}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Add to Cart Luxury Pill Action */}
        {onAddToCart && (
          <button
            type="button"
            disabled={isOutOfStock || isUnavailable}
            onClick={handleAddClick}
            className={`px-4 sm:px-5 py-2.5 rounded-full font-sans text-xs font-semibold tracking-wide transition-all duration-200 flex items-center gap-1.5 active:scale-95 shrink-0 ${
              isOutOfStock || isUnavailable
                ? 'bg-[#E9DFFF]/60 text-[#666666] cursor-not-allowed border border-[#E9DFFF]'
                : justAdded
                ? 'bg-[#10B981] text-white shadow-sm'
                : 'bg-[#6C4EFF] hover:bg-[#4B2AC5] text-white shadow-[0_4px_14px_rgba(108,78,255,0.3)] hover:shadow-[0_6px_20px_rgba(75,42,197,0.4)] cursor-pointer'
            }`}
            title={isUnavailable ? 'Unavailable' : isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          >
            {justAdded ? (
              <>
                <FiCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Added</span>
              </>
            ) : (
              <>
                <FiPlus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Add</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
