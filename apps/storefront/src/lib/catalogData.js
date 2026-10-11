// Dynamic catalog UI styling helpers and fallback utilities
// All actual business catalog data, images, prices, and categories come from MySQL via the REST API.

export const CATEGORY_PALETTES = [
  { bg: 'bg-[var(--color-background)] border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] hover:bg-[var(--color-primary-tint)]/40 text-[var(--color-text-main)]', iconBg: 'bg-[var(--color-primary-tint)] text-[var(--color-brand)]' },
  { bg: 'bg-[var(--color-bg-main)] border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] text-[var(--color-text-main)]', iconBg: 'bg-[var(--color-primary-tint)] text-[var(--color-brand)]' },
  { bg: 'bg-[var(--color-background)] border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] hover:bg-[var(--color-primary-tint)]/40 text-[var(--color-text-main)]', iconBg: 'bg-[var(--color-primary-tint)] text-[var(--color-brand)]' },
  { bg: 'bg-[var(--color-bg-alt)] border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] text-[var(--color-text-main)]', iconBg: 'bg-[var(--color-primary-tint)] text-[var(--color-brand)]' },
  { bg: 'bg-[var(--color-background)] border-[var(--color-border-subtle)] hover:border-[var(--color-brand)] hover:bg-[var(--color-primary-tint)]/40 text-[var(--color-text-main)]', iconBg: 'bg-[var(--color-primary-tint)] text-[var(--color-brand)]' },
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
