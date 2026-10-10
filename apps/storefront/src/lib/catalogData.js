// Dynamic catalog UI styling helpers and fallback utilities
// All actual business catalog data, images, prices, and categories come from MySQL via the REST API.

export const CATEGORY_PALETTES = [
  { bg: 'bg-[#FFFFFF] border-[#E8E0E5] hover:border-[#601D49] hover:bg-[#F2DDE9]/40 text-[#2D252B]', iconBg: 'bg-[#F2DDE9] text-[#601D49]' },
  { bg: 'bg-[#F8F3F6] border-[#E8E0E5] hover:border-[#601D49] text-[#2D252B]', iconBg: 'bg-[#F2DDE9] text-[#601D49]' },
  { bg: 'bg-[#FFFFFF] border-[#E8E0E5] hover:border-[#601D49] hover:bg-[#F2DDE9]/40 text-[#2D252B]', iconBg: 'bg-[#F2DDE9] text-[#601D49]' },
  { bg: 'bg-[#F7F5F7] border-[#E8E0E5] hover:border-[#601D49] text-[#2D252B]', iconBg: 'bg-[#F2DDE9] text-[#601D49]' },
  { bg: 'bg-[#FFFFFF] border-[#E8E0E5] hover:border-[#601D49] hover:bg-[#F2DDE9]/40 text-[#2D252B]', iconBg: 'bg-[#F2DDE9] text-[#601D49]' },
]

export function getCategoryPalette(indexOrSlug) {
  if (typeof indexOrSlug === 'number') {
    return CATEGORY_PALETTES[Math.abs(indexOrSlug) % CATEGORY_PALETTES.length]
  }
  const str = String(indexOrSlug || '')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
  }
  return CATEGORY_PALETTES[Math.abs(hash) % CATEGORY_PALETTES.length]
}

export const PLACEHOLDER_PRODUCT_IMAGE = '/placeholder-product.svg'
