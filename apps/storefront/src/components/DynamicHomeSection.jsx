import React from 'react'
import HorizontalProductSection from './HorizontalProductSection'
import LowerPromotionalBanners from './LowerPromotionalBanners'
import CategoriesSection from './CategoriesSection'
import { resolveImageUrl } from '../lib/api'

function getDefaultTitle(section) {
  switch (section.type) {
    case 'BEST_SELLERS':
      return 'Best Sellers'
    case 'NEW_ARRIVALS':
      return 'New Arrivals'
    case 'FEATURED':
      return 'Featured Products'
    case 'DEALS':
      return 'Flash Deals'
    case 'COMBOS':
      return 'Combo Specials'
    case 'CATEGORIES':
      return 'Shop by Category'
    case 'BANNER':
      return 'Exclusive Store Offers'
    case 'CUSTOM':
    default:
      if (section.section_key) {
        return section.section_key
          .split('_')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      }
      return 'Trending Products'
  }
}

function getDefaultBadge(section) {
  switch (section.type) {
    case 'BEST_SELLERS':
      return '⭐ CUSTOMER FAVORITES'
    case 'NEW_ARRIVALS':
      return '✨ FRESH DROPS'
    case 'FEATURED':
      return '💎 CURATED SELECTION'
    case 'DEALS':
      return '🔥 SPECIAL DISCOUNTS'
    case 'COMBOS':
      return '📦 VALUE PACKS'
    case 'CATEGORIES':
      return '📂 COLLECTIONS'
    case 'BANNER':
      return '🏷️ PROMOTIONS'
    case 'CUSTOM':
    default:
      return '📈 POPULAR PICKS'
  }
}

function getDefaultViewAllLink(section) {
  switch (section.type) {
    case 'BEST_SELLERS':
      return '/products?section=best_sellers'
    case 'NEW_ARRIVALS':
      return '/products?section=new_arrivals'
    case 'FEATURED':
      return '/products?section=featured'
    case 'DEALS':
      return '/products?section=deals'
    case 'COMBOS':
      return '/products?section=combos'
    case 'CATEGORIES':
      return '/products'
    case 'CUSTOM':
      return `/products?section=${section.section_key || 'trending'}`
    default:
      return '/products'
  }
}

function getBadgeBg(type) {
  switch (type) {
    case 'BEST_SELLERS':
      return 'bg-[#F2DDE9] text-[#601D49]'
    case 'NEW_ARRIVALS':
      return 'bg-emerald-100 text-emerald-800'
    case 'FEATURED':
      return 'bg-[#F2DDE9] text-[#601D49]'
    case 'DEALS':
      return 'bg-amber-100 text-amber-800'
    case 'COMBOS':
      return 'bg-blue-100 text-blue-800'
    case 'CUSTOM':
      return 'bg-rose-100 text-rose-800'
    default:
      return 'bg-[#F2DDE9] text-[#601D49]'
  }
}

export default function DynamicHomeSection({
  section,
  products = [],
  isLoading = false,
  categories = [],
  middleBanners = [],
  isBannersLoading = false,
  wishlistIds = [],
  onToggleWishlist,
  onAddToCart,
}) {
  if (!section) return null

  // 1. Banner Section Type (Admin-managed banner content preserved)
  if (section.type === 'BANNER') {
    return (
      <LowerPromotionalBanners
        id={`home-section-${section.id}`}
        banners={middleBanners}
        isLoading={isBannersLoading}
        title={section.title || undefined}
        subtitle={section.subtitle || undefined}
        badgeText={section.badge_text || undefined}
      />
    )
  }

  // 2. Categories Section Type
  if (section.type === 'CATEGORIES') {
    return (
      <CategoriesSection
        id={`home-section-${section.id}`}
        categories={categories.slice(0, section.item_limit || 12)}
        isLoading={isLoading}
        title={section.title || getDefaultTitle(section)}
        subtitle={section.subtitle}
        badgeText={section.badge_text || getDefaultBadge(section)}
        viewAllLink={section.view_all_link || getDefaultViewAllLink(section)}
      />
    )
  }

  // 3. Product Sections (BEST_SELLERS, NEW_ARRIVALS, FEATURED, DEALS, CUSTOM, COMBOS)
  const title = section.title || getDefaultTitle(section)
  const subtitle = section.subtitle || null
  const badgeText = section.badge_text || getDefaultBadge(section)
  const viewAllLink = section.view_all_link || getDefaultViewAllLink(section)
  const badgeBg = getBadgeBg(section.type)
  const backgroundImage = section.image_path ? resolveImageUrl(section.image_path) : null

  return (
    <HorizontalProductSection
      id={`home-section-${section.id}`}
      title={title}
      subtitle={subtitle}
      badgeText={badgeText}
      badgeBg={badgeBg}
      products={products}
      viewAllLink={viewAllLink}
      isLoading={isLoading}
      emptyMessage="No products available in this section right now."
      wishlistIds={wishlistIds}
      onToggleWishlist={onToggleWishlist}
      onAddToCart={onAddToCart}
      backgroundImage={backgroundImage}
    />
  )
}
