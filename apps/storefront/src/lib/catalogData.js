// Dynamic catalog UI styling helpers and fallback utilities
// All actual business catalog data, images, prices, and categories come from MySQL via the REST API.

export const CATEGORY_PALETTES = [
  { bg: 'bg-[#F5F0FF] border-[#E8E0F5] hover:border-[#8B5CF6] text-[#27213A]', iconBg: 'bg-[#EDE5FF] text-[#7042D2]' },
  { bg: 'bg-purple-50 border-purple-200/80 hover:border-purple-400 text-[#27213A]', iconBg: 'bg-purple-100/90 text-[#7042D2]' },
  { bg: 'bg-[#FAF8FF] border-[#E8E0F5] hover:border-[#8B5CF6] text-[#27213A]', iconBg: 'bg-[#E0D6FF] text-[#7042D2]' },
  { bg: 'bg-pink-50/70 border-pink-200/70 hover:border-pink-400 text-[#27213A]', iconBg: 'bg-pink-100/80 text-pink-700' },
  { bg: 'bg-[#F5F0FF] border-[#E8E0F5] hover:border-[#8B5CF6] text-[#27213A]', iconBg: 'bg-[#EDE5FF] text-[#7042D2]' },
  { bg: 'bg-indigo-50/70 border-indigo-200/70 hover:border-indigo-400 text-[#27213A]', iconBg: 'bg-indigo-100/80 text-indigo-700' },
  { bg: 'bg-amber-50/70 border-amber-200/70 hover:border-amber-400 text-[#27213A]', iconBg: 'bg-amber-100/80 text-amber-700' },
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
