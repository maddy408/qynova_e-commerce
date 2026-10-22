import React, { useState, useEffect } from 'react'
import { resolveImageUrl } from '../lib/api'
import { FiHeart, FiPlus, FiCheck } from 'react-icons/fi'
import Button from './common/Button'
import { Link } from 'react-router-dom'
import { productPath } from '../lib/seo'

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
  const localProductFallback = rawImage ? `/images/products/${rawImage.split('/').pop()}` : null
  const resolvedImage = resolveImageUrl(rawImage) || localProductFallback || '/placeholder-product.svg'

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
    e.stopPropagation()
    if (isOutOfStock || isUnavailable || !onAddToCart) return
    onAddToCart(product, e)
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 1800)
  }

  // Compact discount badge label (Crimson/Red as in reference image or primary tint)
  const badgeLabel = product.badge || (discountPercent > 0 ? `${discountPercent}% OFF` : product.is_featured ? 'BESTSELLER' : null)

  // Flipkart-style hover line: real attribute/value pairs from variants_summary,
  // e.g. [{name:'Size', values:[{value:'S', in_stock:true}, ...]}]. Capped at 2
  // attribute groups and 5 values per group so the overlay stays compact.
  const variantGroups = Array.isArray(product.variants_summary) ? product.variants_summary.slice(0, 2) : []
  const hasVariantSummary = variantGroups.length > 0
  const totalOptionCount = variantGroups.reduce((sum, g) => sum + (g.values?.length || 0), 0)

  return (
    <div
      onClick={onClick}
      className="bg-[var(--color-card-bg)] rounded-2xl p-2.5 sm:p-3 border border-[var(--color-border-subtle)] hover:border-[var(--color-primary)]/50 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between group cursor-pointer h-full select-none"
    >
      <div>
        {/* 1. PRODUCT IMAGE AREA: Compact clean container without wasted space */}
        <div className="relative rounded-xl overflow-hidden bg-[#FBFBFC] h-[145px] sm:h-[160px] md:h-[170px] flex items-center justify-center p-2 border border-slate-100 group-hover:border-[var(--color-primary-tint)] transition-colors">
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => {
              if (localProductFallback && imgSrc !== localProductFallback) {
                setImgSrc(localProductFallback)
              } else {
                setImgSrc('/placeholder-product.svg')
              }
            }}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 ease-out"
            loading="lazy"
          />

          {/* Discount Badge */}
          {badgeLabel && (
            <span className="absolute top-2 left-2 bg-rose-50 text-rose-600 border border-rose-200 font-sans font-extrabold text-[9px] sm:text-[10px] tracking-wide px-1.5 py-0.5 rounded shadow-2xs uppercase z-10">
              {badgeLabel}
            </span>
          )}

          {/* Wishlist Heart Icon Button */}
          {onToggleWishlist && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleWishlist(product.id, e)
              }}
              className={`absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 hover:bg-white flex items-center justify-center shadow-xs border border-slate-200 hover:border-[var(--color-primary)] transition-all active:scale-95 cursor-pointer z-10 ${
                isWishlist ? 'text-[var(--color-primary)]' : 'text-slate-400 hover:text-rose-500'
              }`}
              title="Save to Wishlist"
              aria-label="Save to Wishlist"
            >
              <FiHeart
                className={`w-3.5 h-3.5 transition-transform ${isWishlist ? 'fill-[var(--color-primary)] stroke-[var(--color-primary)]' : ''}`}
              />
            </button>
          )}

          {/* Veg Indicator Dot */}
          <div
            className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 bg-white border border-[var(--color-secondary)] rounded-xs flex items-center justify-center shadow-2xs z-10"
            title="Vegetarian / Grocery Item"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-secondary)]" />
          </div>

          {/* Out of Stock overlay watermark */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] flex items-center justify-center z-10">
              <span className="bg-slate-900 text-white px-2.5 py-1 rounded text-[10px] font-sans font-bold shadow-xs tracking-wider uppercase">
                {isUnavailable ? 'Unavailable' : 'Sold Out'}
              </span>
            </div>
          )}
        </div>

        {/* 2. UNIT WEIGHT & COMPACT ADD BUTTON ROW */}
        <div className="flex items-center justify-between gap-1.5 mt-2.5">
          <span className="text-[11px] sm:text-xs text-[var(--color-text-muted)] font-medium truncate max-w-[95px] sm:max-w-[110px]">
            {unitWeight}
          </span>

          {onAddToCart && (
            <button
              type="button"
              disabled={isOutOfStock || isUnavailable}
              onClick={handleAddClick}
              className={`px-3 py-1 rounded-lg font-sans text-xs font-bold transition-all duration-150 flex items-center gap-1 active:scale-95 shrink-0 ${
                isOutOfStock || isUnavailable
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : justAdded
                  ? 'bg-[var(--color-secondary)] text-white shadow-xs'
                  : 'bg-white hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white border border-[var(--color-primary)] shadow-2xs cursor-pointer'
              }`}
              title={isUnavailable ? 'Unavailable' : isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
            >
              {justAdded ? (
                <>
                  <FiCheck className="w-3 h-3 stroke-[2.5]" />
                  <span>Added</span>
                </>
              ) : (
                <>
                  <FiPlus className="w-3 h-3 stroke-[2.5]" />
                  <span>Add</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* 3. PRICE ROW */}
        <div className="flex items-baseline gap-1.5 mt-1">
          {isUnavailable ? (
            <span className="text-xs font-sans font-semibold text-[var(--color-text-muted)]">
              Price on request
            </span>
          ) : (
            <>
              <span className="font-sans text-sm sm:text-base font-extrabold text-[var(--color-text-main)]">
                ₹{retailPrice}
              </span>
              {showDiscount && mrp > retailPrice && (
                <span className="text-[11px] sm:text-xs font-sans text-[var(--color-text-muted)] line-through font-normal">
                  ₹{mrp}
                </span>
              )}
            </>
          )}
        </div>

        {/* 4. PRODUCT TITLE */}
        <div className="relative">
          <h3
            className="font-sans text-xs sm:text-[13px] font-medium text-[var(--color-text-main)] line-clamp-2 leading-snug group-hover:text-[var(--color-primary)] transition-colors mt-1 min-h-[34px] sm:min-h-[38px]"
            title={product.name}
          >
            {/* real link so search engines can discover product pages */}
            <Link to={productPath(product)} onClick={(e) => e.stopPropagation()} className="text-inherit no-underline">
              {product.name}
            </Link>
          </h3>

          {hasVariantSummary && (
            <>
              {/* Touch/mobile: static, always-visible label (no real :hover there) */}
              <div className="sm:hidden mt-1 text-[10px] text-[var(--color-text-muted)] font-medium truncate">
                {totalOptionCount} option{totalOptionCount === 1 ? '' : 's'}
              </div>

              {/* Desktop: absolutely-positioned overlay revealed on hover.
                  Taken out of flow so expanding it never shifts the grid. */}
              <div className="hidden sm:block absolute left-0 right-0 top-full z-20 pt-1 opacity-0 invisible -translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 transition-all duration-200 pointer-events-none">
                <div className="bg-white border border-[var(--color-border-subtle)] rounded-lg shadow-lg px-2 py-1.5 space-y-1">
                  {variantGroups.map((group) => {
                    const values = group.values || []
                    const shown = values.slice(0, 5)
                    const extra = values.length - shown.length
                    const isColorGroup = shown.some((v) => v.color_hex)

                    return (
                      <div
                        key={group.name}
                        className="text-[10px] leading-tight text-[var(--color-text-muted)] truncate flex items-center gap-1"
                      >
                        <span className="font-semibold text-[var(--color-text-main)] shrink-0">{group.name}:</span>
                        {isColorGroup ? (
                          <span className="flex items-center gap-1 flex-wrap">
                            {shown.map((v, i) => (
                              <span
                                key={i}
                                className={`inline-block w-2.5 h-2.5 rounded-full border border-slate-300 ${
                                  v.in_stock === false ? 'opacity-35' : ''
                                }`}
                                style={{ backgroundColor: v.color_hex || '#ccc' }}
                                title={v.in_stock === false ? `${v.value} (Out of stock)` : v.value}
                              />
                            ))}
                          </span>
                        ) : (
                          <span className="truncate">
                            {shown.map((v, i) => (
                              <span key={i} className={v.in_stock === false ? 'opacity-50 line-through' : ''}>
                                {v.value}
                                {i < shown.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </span>
                        )}
                        {extra > 0 && <span className="shrink-0">+{extra} more</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
