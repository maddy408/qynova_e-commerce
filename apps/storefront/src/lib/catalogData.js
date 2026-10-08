// Dynamic catalog UI styling helpers and fallback utilities
// All actual business catalog data, images, prices, and categories come from MySQL via the REST API.

export const CATEGORY_PALETTES = [
  { bg: 'bg-purple-50 border-purple-200/80 hover:border-purple-400 text-purple-950', iconBg: 'bg-purple-100/90 text-purple-700' },
  { bg: 'bg-fuchsia-50 border-fuchsia-200/80 hover:border-fuchsia-400 text-fuchsia-950', iconBg: 'bg-fuchsia-100/90 text-fuchsia-700' },
  { bg: 'bg-violet-50 border-violet-200/80 hover:border-violet-400 text-violet-950', iconBg: 'bg-violet-100/90 text-violet-700' },
  { bg: 'bg-pink-50 border-pink-200/80 hover:border-pink-400 text-pink-950', iconBg: 'bg-pink-100/90 text-pink-700' },
  { bg: 'bg-rose-50 border-rose-200/80 hover:border-rose-400 text-rose-950', iconBg: 'bg-rose-100/90 text-rose-700' },
  { bg: 'bg-indigo-50 border-indigo-200/80 hover:border-indigo-400 text-indigo-950', iconBg: 'bg-indigo-100/90 text-indigo-700' },
  { bg: 'bg-amber-50 border-amber-200/80 hover:border-amber-400 text-amber-950', iconBg: 'bg-amber-100/90 text-amber-700' },
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
