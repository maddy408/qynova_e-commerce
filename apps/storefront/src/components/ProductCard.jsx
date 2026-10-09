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
  const mrp = Number(product.mrp) || 0
  const discountPercent = mrp > retailPrice && retailPrice > 0 ? Math.round(((mrp - retailPrice) / mrp) * 100) : 0

  const rawImage =
    product.primary_image ||
    (Array.isArray(product.images) && (product.images[0]?.image_path || product.images[0])) ||
    ''
  const resolvedImage = resolveImageUrl(rawImage) || '/placeholder-product.svg'

  const [imgSrc, setImgSrc] = useState(resolvedImage)
  useEffect(() => {
    setImgSrc(resolvedImage)
  }, [resolvedImage])

  const isOutOfStock =
    product.total_stock !== undefined && product.total_stock !== null
      ? Number(product.total_stock) <= 0
      : false

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-2.5 sm:p-3 border border-purple-100 hover:border-purple-300 hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-pointer h-full select-none"
    >
      <div>
        {/* Product Image & Badges */}
        <div className="relative rounded-xl overflow-hidden bg-gray-50 aspect-square mb-2">
          <img
            src={imgSrc}
            alt={product.name}
            onError={() => setImgSrc('/placeholder-product.svg')}
            className="w-full h-full object-cover group-hover:scale-106 transition-transform duration-500"
            loading="lazy"
          />

          {/* Discount % Badge from DB pricing */}
          {discountPercent > 0 && (
            <span className="absolute top-1.5 sm:top-2 left-1.5 sm:left-2 bg-[#6B21A8] text-white font-black text-[9px] px-1.5 sm:px-2 py-0.5 rounded shadow-xs">
              {discountPercent}% OFF
            </span>
          )}

          {/* Wishlist Heart Icon */}
          {onToggleWishlist && (
            <button
              type="button"
              onClick={(e) => onToggleWishlist(product.id, e)}
              className="absolute top-1.5 sm:top-2 right-1.5 sm:right-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 hover:bg-white text-gray-600 hover:text-red-500 flex items-center justify-center shadow-xs transition-colors cursor-pointer"
              title="Save to Wishlist"
              aria-label="Save to Wishlist"
            >
              <svg
                className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                viewBox="0 0 24 24"
                fill={isWishlist ? '#EC4899' : 'none'}
                stroke={isWishlist ? '#EC4899' : 'currentColor'}
                strokeWidth="2.2"
              >
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>
          )}
        </div>

        {/* Stock Status Badge */}
        <div className="flex items-center justify-between text-[10px] mb-1">
          {product.brand_name ? (
            <span className="text-[10px] font-bold text-purple-900 truncate max-w-[120px]">
              {product.brand_name}
            </span>
          ) : (
            <span />
          )}
          {isOutOfStock ? (
            <span className="text-red-700 font-bold bg-red-50 px-1.5 py-0.5 rounded text-[9px]">
              Out of Stock
            </span>
          ) : (
            <span className="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded text-[9px]">
              In Stock
            </span>
          )}
        </div>

        {/* Brand / Product Code from DB */}
        <p className="text-[9px] uppercase font-bold text-gray-400 tracking-wider truncate">
          {product.brand_name || product.product_code || 'KiranaBazaar'}
        </p>

        {/* Product Name from DB */}
        <h4 className="text-xs sm:text-[13px] font-bold text-gray-900 line-clamp-2 mt-0.5 leading-snug min-h-[30px] sm:min-h-[34px] group-hover:text-purple-700 transition-colors">
          {product.name}
        </h4>

        {/* Price display: Discounted Price & Original MRP from DB */}
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="text-sm sm:text-base font-black text-[#581C87]">
            ₹{retailPrice}
          </span>
          {mrp > retailPrice && (
            <span className="text-[10px] sm:text-[11px] text-gray-400 line-through">
              ₹{mrp}
            </span>
          )}
        </div>
      </div>

      {/* Actions: Add to Cart button */}
      <div className="mt-2.5 pt-2 border-t border-purple-50 flex items-center gap-1.5">
        {onAddToCart && (
          <button
            type="button"
            disabled={isOutOfStock}
            onClick={(e) => onAddToCart(product, e)}
            className={`flex-1 py-2 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1 min-h-[38px] active:scale-95 ${
              isOutOfStock
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-purple-50 hover:bg-[#6B21A8] text-purple-900 hover:text-white cursor-pointer'
            }`}
            title={isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>{isOutOfStock ? 'Out of Stock' : 'Add'}</span>
          </button>
        )}

        <span className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs shadow-xs group-hover:brightness-105 min-h-[38px] flex items-center justify-center">
          View →
        </span>
      </div>
    </div>
  )
}
