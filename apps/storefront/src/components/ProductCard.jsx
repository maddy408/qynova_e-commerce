import React, { useState, useEffect } from 'react'
import { resolveImageUrl } from '../lib/api'

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

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl p-3 border border-slate-200/90 hover:border-[#c4b5fd] hover:shadow-md transition-all duration-200 flex flex-col justify-between group cursor-pointer h-full select-none"
    >
      <div>
        {/* Product Image & Badges */}
        <div className="relative rounded-lg overflow-hidden bg-[#faf5ff] aspect-square mb-2.5 flex items-center justify-center p-2 border border-[#f5f3ff]">
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => setImgSrc('/placeholder-product.svg')}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />

          {/* Discount % Badge in Pastel Purple */}
          {discountPercent > 0 && showDiscount && (
            <span className="absolute top-1.5 left-1.5 bg-[#ede9fe] text-[#6d28d9] border border-[#ddd6fe] font-black text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded shadow-2xs z-10 tracking-wide">
              {discountPercent}% OFF
            </span>
          )}

          {/* Wishlist Heart Icon */}
          {onToggleWishlist && (
            <button
              type="button"
              onClick={(e) => onToggleWishlist(product.id, e)}
              className="absolute top-1.5 right-1.5 w-6.5 h-6.5 sm:w-7 sm:h-7 rounded-full bg-white/95 hover:bg-white text-slate-400 hover:text-[#7c3aed] flex items-center justify-center shadow-2xs transition-all hover:scale-110 active:scale-95 cursor-pointer border border-slate-200/80 z-10"
              title="Save to Wishlist"
              aria-label="Save to Wishlist"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill={isWishlist ? '#7c3aed' : 'none'}
                stroke={isWishlist ? '#7c3aed' : 'currentColor'}
                strokeWidth="2.2"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>
          )}
        </div>

        {/* Brand / Product Code & Stock Status Badge */}
        <div className="flex items-center justify-between gap-1 text-[10px] mb-1">
          {product.brand_name ? (
            <span className="text-[10px] font-bold text-[#6d28d9] uppercase tracking-wider truncate max-w-[120px]">
              {product.brand_name}
            </span>
          ) : (
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider truncate max-w-[120px]">
              {product.product_code || ''}
            </span>
          )}
          {isUnavailable ? (
            <span className="text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">
              Unavailable
            </span>
          ) : isOutOfStock ? (
            <span className="text-rose-700 font-bold bg-rose-50 px-1.5 py-0.5 rounded text-[9px]">
              Out of Stock
            </span>
          ) : (
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[9px]">
              In Stock
            </span>
          )}
        </div>

        {/* Product Name from DB */}
        <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-snug min-h-[32px] group-hover:text-[#6d28d9] transition-colors">
          {product.name}
        </h3>

        {/* Unit / Weight Tag */}
        {unitWeight && (
          <div className="mt-0.5">
            <span className="inline-block text-[10px] font-medium text-slate-500">
              {unitWeight}
            </span>
          </div>
        )}

        {/* Price display: Selling Price, MRP & Savings */}
        <div className="flex items-baseline flex-wrap gap-1.5 mt-1.5">
          {isUnavailable ? (
            <span className="text-xs font-bold text-slate-400">
              Unavailable
            </span>
          ) : (
            <>
              <span className="text-sm font-black text-black">
                ₹{retailPrice}
              </span>
              {showDiscount && mrp > retailPrice && (
                <span className="text-[11px] text-slate-400 line-through font-normal">
                  ₹{mrp}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action: Add to Cart button (Black button with white text) */}
      <div className="mt-2.5 pt-2 border-t border-slate-100">
        {onAddToCart && (
          <button
            type="button"
            disabled={isOutOfStock || isUnavailable}
            onClick={(e) => onAddToCart(product, e)}
            className={`w-full py-1.5 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1 active:scale-95 ${
              isOutOfStock || isUnavailable
                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                : 'bg-black hover:bg-neutral-800 text-white cursor-pointer shadow-2xs'
            }`}
            title={isUnavailable ? 'Unavailable' : isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{isUnavailable ? 'Unavailable' : isOutOfStock ? 'Out of Stock' : 'Add to Cart'}</span>
          </button>
        )}
      </div>
    </div>
  )
}
