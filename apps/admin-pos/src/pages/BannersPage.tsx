import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ImageIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '../components/Icons'
import { Alert, Button, Modal, PageHeader, Select, Spinner, TextArea, TextField } from '../components/ui'
import { api, apiErrorMessage, getApiOrigin } from '../lib/api'
import type { Banner, BannerItem, BannerPosition, BannerTargetType, Category, ProductListItem, Subcategory } from '../lib/types'

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${getApiOrigin()}/${cleanPath}`
}

/** Parses discount percentage from discount_text string, constrained between 10% and 65% (T10 requirement). */
export function parseDiscountPercentage(discountText: string | null | undefined): number {
  if (!discountText) return 20
  const match = discountText.match(/(\d+)\s*%/i)
  if (match) {
    const val = parseInt(match[1], 10)
    if (!isNaN(val)) {
      return Math.min(65, Math.max(10, val))
    }
  }
  return 20
}

/** Extracts actual product price from existing ProductListItem or BannerItem without hardcoding. */
export function getProductPrice(item: ProductListItem | BannerItem | null | undefined): number {
  if (!item) return 0
  if ('min_price' in item && item.min_price != null && Number(item.min_price) > 0) {
    return Number(item.min_price)
  }
  if ('mrp' in item && item.mrp != null && Number(item.mrp) > 0) {
    return Number(item.mrp)
  }
  if ('max_price' in item && item.max_price != null && Number(item.max_price) > 0) {
    return Number(item.max_price)
  }
  return 0
}

/**
 * T11: Calculates discounted price breakdown based on original price and discount percentage.
 * Example requirement:
 *   Original price: ₹1,000
 *   Discount: 65%
 *   Discount amount: ₹650
 *   Final discounted price: ₹350
 */
export function calculateDiscount(price: number | string | null | undefined, discountPercent: number) {
  const originalPrice = Number(price) || 0
  const pct = Math.min(65, Math.max(10, discountPercent))
  const discountAmount = Math.round(originalPrice * (pct / 100))
  const finalDiscountedPrice = Math.max(0, originalPrice - discountAmount)
  return {
    originalPrice,
    discountPercent: pct,
    discountAmount,
    finalDiscountedPrice,
    // Backwards-compatibility aliases:
    discountedPrice: finalDiscountedPrice,
    savings: discountAmount,
  }
}

interface BannerPricePreviewCardProps {
  productName: string
  originalPrice: number | string | null | undefined
  discountPercent: number
  badgeText?: string | null
  layout?: 'detailed' | 'compact' | 'table-row'
  onRemove?: () => void
}

/**
 * T11: Reusable Banner Item Price Preview Component.
 * Conforms to Qynova wine (#804652 / #7B3F4A) and rose-cream (#FAF2F4 / #F2E5E7) theme.
 * Displays:
 *   1. Product name
 *   2. Original price (with strikethrough)
 *   3. Discount percentage
 *   4. Discount amount
 *   5. Final discounted price
 */
export function BannerPricePreviewCard({
  productName,
  originalPrice,
  discountPercent,
  badgeText,
  layout = 'detailed',
  onRemove,
}: BannerPricePreviewCardProps) {
  const { originalPrice: orig, discountPercent: pct, discountAmount, finalDiscountedPrice } = calculateDiscount(
    originalPrice,
    discountPercent
  )

  if (layout === 'table-row') {
    return (
      <div className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF2F4]/30 transition-colors">
        <div className="space-y-0.5">
          <p className="font-bold text-slate-900 text-xs">{productName}</p>
          {badgeText && (
            <span className="inline-block px-2 py-0.5 rounded-full bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0] text-[10px] font-bold">
              {badgeText}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-xs">
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 block sm:text-right">Original</span>
            <span className="font-semibold text-slate-400 line-through">₹{orig.toLocaleString('en-IN')}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-500 block sm:text-right">Discount</span>
            <span className="font-black text-slate-800">{pct}%</span>
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-emerald-700 block sm:text-right">Discount Amt</span>
            <span className="font-bold text-emerald-700">-₹{discountAmount.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-[#FAF2F4] px-2.5 py-1 rounded-xl border border-[#EEDDE0]">
            <span className="text-[10px] font-bold uppercase text-[#804652] block sm:text-right">Final Price</span>
            <span className="font-black text-[#804652] text-sm">₹{finalDiscountedPrice.toLocaleString('en-IN')}</span>
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
              title="Remove linked product"
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    )
  }

  if (layout === 'compact') {
    return (
      <div className="rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/50 p-2.5 sm:p-3 text-xs space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-slate-900 line-clamp-1">{productName}</p>
          <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-[#804652] text-white">
            {pct}% OFF
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-[#EEDDE0]/70 text-[11px] bg-white/70 p-2 rounded-xl">
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-400 block">Original</span>
            <span className="text-slate-500 line-through font-semibold">₹{orig.toLocaleString('en-IN')}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-slate-500 block">Discount %</span>
            <span className="font-black text-slate-800">{pct}%</span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-emerald-700 block">Discount Amt</span>
            <span className="font-bold text-emerald-700">-₹{discountAmount.toLocaleString('en-IN')}</span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-bold text-[#804652] block">Final Price</span>
            <span className="font-black text-[#804652] text-xs">₹{finalDiscountedPrice.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/40 p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#804652] block">
            Banner Item Price Preview
          </span>
          <h5 className="text-sm font-extrabold text-slate-950 line-clamp-1">{productName}</h5>
        </div>
        <div className="flex items-center gap-2">
          {badgeText && (
            <span className="px-2.5 py-0.5 rounded-full bg-white text-[#804652] border border-[#EEDDE0] text-[11px] font-bold shadow-2xs">
              {badgeText}
            </span>
          )}
          <span className="px-3 py-1 rounded-full bg-[#804652] text-white text-xs font-black shadow-2xs">
            {pct}% Banner Discount
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-[#EEDDE0] shadow-2xs">
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Original Price</span>
          <span className="text-sm font-bold text-slate-500 line-through">₹{orig.toLocaleString('en-IN')}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-slate-500 block">Discount Percentage</span>
          <span className="text-sm font-black text-slate-800">{pct}%</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-emerald-700 block">Discount Amount</span>
          <span className="text-sm font-black text-emerald-700">-₹{discountAmount.toLocaleString('en-IN')}</span>
        </div>
        <div>
          <span className="text-[10px] font-bold uppercase text-[#804652] block">Final Discounted Price</span>
          <span className="text-base font-black text-[#804652]">₹{finalDiscountedPrice.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  )
}

const DISCOUNT_PRESETS = [10, 15, 20, 25, 30, 35, 40, 50, 60, 65]

const POSITIONS: { value: BannerPosition; label: string }[] = [
  { value: 'HOME_HERO', label: 'Home Hero Carousel' },
  { value: 'HOME_MIDDLE', label: 'Home Middle Marquee' },
  { value: 'CATEGORY_PAGE', label: 'Category Page Banner' },
  { value: 'POPUP', label: 'Interactive Popup' },
]

const TARGET_TYPES: { value: BannerTargetType; label: string }[] = [
  { value: 'NONE', label: 'None (No Link)' },
  { value: 'PRODUCT', label: 'Specific Product' },
  { value: 'CATEGORY', label: 'Category' },
  { value: 'SUBCATEGORY', label: 'Subcategory' },
  { value: 'BRAND', label: 'Brand' },
  { value: 'COUPON', label: 'Coupon' },
  { value: 'EXTERNAL_URL', label: 'External Website URL' },
]

const COLOR_THEMES = [
  { value: 'purple', label: 'Purple (Royal)', color: '#8B5CF6', bg: 'from-purple-900 to-indigo-900' },
  { value: 'blue', label: 'Blue (Ocean)', color: '#3B82F6', bg: 'from-blue-900 to-sky-900' },
  { value: 'orange', label: 'Orange (Sunset)', color: '#F97316', bg: 'from-amber-800 to-orange-900' },
  { value: 'lavender', label: 'Lavender (Pastel)', color: '#A78BFA', bg: 'from-violet-900 to-purple-800' },
  { value: 'pink', label: 'Pink (Rose)', color: '#EC4899', bg: 'from-rose-900 to-pink-900' },
  { value: 'teal', label: 'Teal (Emerald)', color: '#14B8A6', bg: 'from-teal-900 to-emerald-900' },
]

interface Brand {
  id: number
  name: string
}

interface Coupon {
  id: number
  code: string
}

export function BannersPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [products, setProducts] = useState<ProductListItem[]>([])

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('')
  const [positionFilter, setPositionFilter] = useState<'ALL' | BannerPosition>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [reordering, setReordering] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  function load() {
    api.get('/banners').then((res) => setBanners(res.data.banners))
  }

  useEffect(() => {
    load()
    api.get('/categories').then((res) => setCategories(res.data.categories ?? []))
    api.get('/subcategories').then((res) => setSubcategories(res.data.subcategories ?? []))
    api.get('/brands').then((res) => setBrands(res.data.brands ?? []))
    api.get('/coupons').then((res) => setCoupons(res.data.coupons ?? []))
    api.get('/products', { params: { limit: 100 } }).then((res) => setProducts(res.data.items ?? []))
  }, [])

  async function toggleActive(banner: Banner) {
    const nextStatus = banner.is_active ? 0 : 1
    await api.put(`/banners/${banner.id}`, { is_active: nextStatus })
    load()
  }

  async function removeBanner(id: number) {
    if (!window.confirm('Delete this banner? This cannot be undone.')) return
    await api.delete(`/banners/${id}`)
    load()
  }

  async function moveBanner(bannerId: number, direction: 'up' | 'down') {
    if (!banners || banners.length < 2) return
    const index = banners.findIndex((b) => b.id === bannerId)
    if (index < 0) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= banners.length) return

    const newBanners = [...banners]
    const temp = newBanners[index]
    newBanners[index] = newBanners[targetIndex]
    newBanners[targetIndex] = temp

    setBanners(newBanners)
    setReordering(true)
    try {
      const ordered_ids = newBanners.map((b) => b.id)
      await api.put('/banners/reorder', { ordered_ids })
    } catch (err) {
      console.error('Failed to save banner reordering', err)
    } finally {
      setReordering(false)
      load()
    }
  }

  // Summary Metrics
  const totalBanners = banners?.length ?? 0
  const activeBanners = banners?.filter((b) => Number(b.is_active) === 1).length ?? 0
  const heroBanners = banners?.filter((b) => b.position === 'HOME_HERO').length ?? 0
  const middleBanners = banners?.filter((b) => b.position === 'HOME_MIDDLE').length ?? 0

  // Filtered List
  const filteredBanners = (banners ?? []).filter((b) => {
    const matchesSearch =
      !searchQuery.trim() ||
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.subtitle && b.subtitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.discount_text && b.discount_text.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.cta_text && b.cta_text.toLowerCase().includes(searchQuery.toLowerCase()))

    const matchesPosition = positionFilter === 'ALL' || b.position === positionFilter

    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && Number(b.is_active) === 1) ||
      (statusFilter === 'INACTIVE' && Number(b.is_active) === 0)

    return matchesSearch && matchesPosition && matchesStatus
  })

  return (
    <div className="space-y-6 pb-12">
      {/* ================= PAGE HEADER ================= */}
      <PageHeader
        title="Banner Management"
        description="Configure homepage hero slides, middle promotional carousels, category landing banners, and discount percentages (10% - 65%)."
        actions={
          <Button onClick={() => { setSuccessMessage(''); setShowCreate(true) }}>
            <PlusIcon />
            <span>New Banner</span>
          </Button>
        }
      />

      {successMessage && <Alert tone="green">{successMessage}</Alert>}

      {/* ================= SUMMARY STATS CARDS ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Total Banners */}
        <div className="rounded-3xl bg-white border border-[#F2E5E7] p-5 shadow-2xs hover:border-[#804652]/40 transition-all flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Banners</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{totalBanners}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">All configured</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0]">
            <ImageIcon className="h-5 w-5" />
          </div>
        </div>

        {/* Active Banners */}
        <div className="rounded-3xl bg-white border border-[#F2E5E7] p-5 shadow-2xs hover:border-emerald-300 transition-all flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Active Banners</p>
            <p className="mt-1 text-2xl font-black text-emerald-600">{activeBanners}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Live on storefront</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200">
            <PowerIcon className="h-5 w-5" />
          </div>
        </div>

        {/* Hero Banners */}
        <div className="rounded-3xl bg-white border border-[#F2E5E7] p-5 shadow-2xs hover:border-purple-300 transition-all flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Hero Carousel</p>
            <p className="mt-1 text-2xl font-black text-purple-700">{heroBanners}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Home hero slides</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-50 text-purple-700 border border-purple-200">
            <span className="text-base font-bold">✨</span>
          </div>
        </div>

        {/* Middle Banners */}
        <div className="rounded-3xl bg-white border border-[#F2E5E7] p-5 shadow-2xs hover:border-amber-300 transition-all flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Middle Marquee</p>
            <p className="mt-1 text-2xl font-black text-amber-700">{middleBanners}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Promotional bar</p>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 border border-amber-200">
            <span className="text-base font-bold">🔥</span>
          </div>
        </div>
      </div>

      {/* ================= MAIN CONTENT CARD ================= */}
      <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
        {/* Header Toolbar: Filters & Search */}
        <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white">
          <div>
            <h3 className="text-xl font-bold text-slate-950">All Banners</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Showing {filteredBanners.length} of {totalBanners} banners
              {reordering && <span className="ml-2 text-[#804652] font-semibold animate-pulse">(Updating order…)</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Position Filter Tabs */}
            <div className="inline-flex items-center gap-1 bg-[#FAF2F4] p-1 rounded-full border border-[#EEDDE0] text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setPositionFilter('ALL')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  positionFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter('HOME_HERO')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  positionFilter === 'HOME_HERO'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hero
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter('HOME_MIDDLE')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  positionFilter === 'HOME_MIDDLE'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Middle
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter('CATEGORY_PAGE')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  positionFilter === 'CATEGORY_PAGE'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Category
              </button>
              <button
                type="button"
                onClick={() => setPositionFilter('POPUP')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  positionFilter === 'POPUP'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Popup
              </button>
            </div>

            {/* Status Filter Pills */}
            <div className="inline-flex items-center gap-1 bg-[#FAF2F4] p-1 rounded-full border border-[#EEDDE0] text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Status
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ACTIVE')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-white text-emerald-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('INACTIVE')}
                className={`px-3 py-1 rounded-full font-medium transition-all cursor-pointer ${
                  statusFilter === 'INACTIVE'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inactive
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search banners…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-full border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#804652] transition-all w-44 sm:w-56"
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-5 sm:p-6">
          {banners === null ? (
            <div className="p-12 text-center">
              <Spinner />
            </div>
          ) : filteredBanners.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#F0E0E3] bg-[#FAF2F4]/40 p-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white border border-[#EEDDE0] text-[#804652] shadow-2xs">
                <ImageIcon className="h-6 w-6" />
              </div>
              <h4 className="mt-3 text-sm font-bold text-slate-900">No banners found</h4>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                {searchQuery || positionFilter !== 'ALL' || statusFilter !== 'ALL'
                  ? 'No banners matched your active filters or search keyword. Try clearing filters.'
                  : 'Get started by creating your first promotional store banner.'}
              </p>
              <div className="mt-4">
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  + Create New Banner
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredBanners.map((b, idx) => {
                const desktopImg = imageUrl(b.image_desktop_path)
                const mobileImg = imageUrl(b.image_mobile_path)
                const themeInfo = COLOR_THEMES.find((t) => t.value === b.color_theme)
                const bannerDiscountPct = parseDiscountPercentage(b.discount_text)

                // If banner is linked to a single product, get product
                const linkedProduct = b.target_type === 'PRODUCT' && b.target_id
                  ? products.find((p) => p.id === Number(b.target_id))
                  : null

                // If banner is linked to a category
                const linkedCategory = b.target_type === 'CATEGORY' && b.target_id
                  ? categories.find((c) => c.id === Number(b.target_id))
                  : null

                return (
                  <div
                    key={b.id}
                    className="rounded-3xl border border-[#F2E5E7] bg-white shadow-2xs hover:shadow-md hover:border-[#804652]/30 transition-all overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {/* Image Preview & Badges Header */}
                      <div className="relative h-44 w-full bg-[#FAF2F4] overflow-hidden flex items-center justify-center">
                        {desktopImg ? (
                          <img
                            src={desktopImg}
                            alt={b.title}
                            className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400 gap-1.5 p-4 text-center">
                            <ImageIcon className="h-8 w-8 text-[#804652]/40" />
                            <span className="text-xs font-semibold text-slate-500">No desktop image uploaded</span>
                          </div>
                        )}

                        {/* Top Badges Overlay */}
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-black/65 text-white backdrop-blur-md shadow-xs">
                            {b.position.replace('_', ' ')}
                          </span>
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md shadow-xs ${
                              Number(b.is_active) === 1 ? 'bg-emerald-600/90 text-white' : 'bg-slate-700/80 text-slate-200'
                            }`}
                          >
                            {Number(b.is_active) === 1 ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        {/* Bottom-right thumbnail tag for mobile image */}
                        {mobileImg && (
                          <div className="absolute bottom-2 right-2 rounded-full bg-white/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-bold text-slate-700 shadow-2xs border border-slate-200 flex items-center gap-1">
                            <span>📱</span>
                            <span>Mobile Asset</span>
                          </div>
                        )}
                      </div>

                      {/* Content Details */}
                      <div className="p-4.5 space-y-3">
                        {/* Discount badge if present */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {b.discount_text ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0] text-[11px] font-black tracking-wide">
                              <span>🔥</span>
                              <span>{b.discount_text}</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-black">
                              <span>🏷️</span>
                              <span>{bannerDiscountPct}% Discount</span>
                            </div>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">
                            (10% - 65% Range)
                          </span>
                        </div>

                        <div>
                          <h4 className="font-extrabold text-slate-900 text-base leading-snug line-clamp-1">{b.title}</h4>
                          {b.subtitle && <p className="text-xs font-semibold text-[#804652] mt-0.5 line-clamp-1">{b.subtitle}</p>}
                          {b.description && (
                            <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed font-medium">
                              {b.description}
                            </p>
                          )}
                        </div>

                        {/* T11: Linked Target Pricing Preview */}
                        {linkedProduct && (
                          <BannerPricePreviewCard
                            layout="compact"
                            productName={linkedProduct.name}
                            originalPrice={getProductPrice(linkedProduct)}
                            discountPercent={bannerDiscountPct}
                          />
                        )}

                        {/* T11: Linked Landing Products Price Preview */}
                        {b.items.length > 0 && (
                          <div className="space-y-1.5 pt-0.5">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                              <span className="text-[#804652] uppercase tracking-wider text-[10px]">
                                Linked Landing Products ({b.items.length})
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">{bannerDiscountPct}% discount applied</span>
                            </div>
                            <div className="space-y-1.5">
                              {b.items.slice(0, 2).map((item) => {
                                const prod = products.find((p) => p.id === item.product_id)
                                const price = getProductPrice(prod) || Number(item.min_price || item.mrp || 0)
                                return (
                                  <BannerPricePreviewCard
                                    key={item.id}
                                    layout="compact"
                                    productName={item.product_name}
                                    originalPrice={price}
                                    discountPercent={bannerDiscountPct}
                                    badgeText={item.offer_text}
                                  />
                                )
                              })}
                              {b.items.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => setEditing(b)}
                                  className="w-full text-center py-1 text-[11px] font-bold text-[#804652] hover:bg-[#FAF2F4] rounded-lg transition-colors cursor-pointer border border-[#EEDDE0]/60 bg-[#FAF2F4]/30"
                                >
                                  +{b.items.length - 2} more linked products • Click to manage
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {linkedCategory && (
                          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-2 text-xs flex items-center justify-between text-purple-950 font-medium">
                            <span>Category: <strong className="font-bold text-[#804652]">{linkedCategory.name}</strong></span>
                            <span className="font-bold text-xs text-purple-800">All items get {bannerDiscountPct}% OFF</span>
                          </div>
                        )}

                        {/* Attribute Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                          {/* Color Theme Pill */}
                          {b.color_theme && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                              <span
                                className="h-2 w-2 rounded-full inline-block"
                                style={{ backgroundColor: themeInfo?.color ?? '#8B5CF6' }}
                              />
                              <span>{b.color_theme}</span>
                            </span>
                          )}

                          {/* Target Pill */}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0] font-semibold">
                            {b.target_type === 'NONE'
                              ? 'No Target'
                              : b.target_type === 'EXTERNAL_URL'
                              ? 'External URL'
                              : `${b.target_type} #${b.target_id}`}
                          </span>

                          {/* CTA Text Pill */}
                          {b.cta_text && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-medium border border-slate-200">
                              CTA: {b.cta_text}
                            </span>
                          )}

                          {/* Attached landing products count */}
                          {b.items.length > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-bold">
                              {b.items.length} item(s)
                            </span>
                          )}

                          {/* Sort order badge */}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                            Order: #{b.sort_order}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between p-3 sm:px-4 border-t border-[#F0E0E3] bg-[#FDFBFB]">
                      {/* Reordering Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveBanner(b.id, 'up')}
                          disabled={idx === 0 || reordering}
                          className="p-1 rounded-lg text-slate-500 hover:bg-[#FAF2F4] hover:text-[#804652] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors cursor-pointer"
                          title="Move Up"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveBanner(b.id, 'down')}
                          disabled={idx === filteredBanners.length - 1 || reordering}
                          className="p-1 rounded-lg text-slate-500 hover:bg-[#FAF2F4] hover:text-[#804652] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors cursor-pointer"
                          title="Move Down"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                      </div>

                      {/* Management Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => { setSuccessMessage(''); setEditing(b) }}
                          className="p-1.5 rounded-lg text-slate-600 hover:bg-[#FAF2F4] hover:text-[#804652] transition-colors cursor-pointer"
                          title="Edit / Manage Banner"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(b)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            Number(b.is_active) === 1
                              ? 'text-emerald-700 hover:bg-emerald-50'
                              : 'text-slate-400 hover:bg-[#FAF2F4]'
                          }`}
                          title={Number(b.is_active) === 1 ? 'Deactivate Banner' : 'Activate Banner'}
                        >
                          <PowerIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeBanner(b.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                          title="Delete Banner"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================= CREATE MODAL ================= */}
      {showCreate && (
        <BannerFormModal
          categories={categories}
          subcategories={subcategories}
          brands={brands}
          coupons={coupons}
          products={products}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            setSuccessMessage('New banner created successfully.')
            load()
          }}
        />
      )}

      {/* ================= MANAGE / EDIT MODAL ================= */}
      {editing && (
        <BannerManageModal
          banner={editing}
          categories={categories}
          subcategories={subcategories}
          brands={brands}
          coupons={coupons}
          products={products}
          onClose={() => setEditing(null)}
          onSaved={(title) => {
            setSuccessMessage(`Banner "${title}" saved successfully.`)
            setEditing(null)
            load()
          }}
          onChanged={(updated) => {
            setEditing(updated)
            load()
          }}
        />
      )}
    </div>
  )
}

{/* ================= T10: DISCOUNT PERCENTAGE CONFIG CONTROL ================= */}
function BannerDiscountConfig({
  discountPercent,
  setDiscountPercent,
  discountText,
  setDiscountText,
}: {
  discountPercent: number
  setDiscountPercent: (v: number) => void
  discountText: string
  setDiscountText: (v: string) => void
}) {
  function handlePercentChange(val: number) {
    const clamped = Math.min(65, Math.max(10, val))
    setDiscountPercent(clamped)
    setDiscountText(`FLAT ${clamped}% OFF`)
  }

  return (
    <div className="rounded-2xl border border-[#F2E5E7] bg-[#FAF2F4]/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
            Banner Discount Percentage (10% to 65%)
          </label>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configured discount applies to linked products or categories.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#EEDDE0] shadow-2xs">
          <span className="text-sm font-black text-[#804652]">{discountPercent}%</span>
          <span className="text-[10px] font-bold text-slate-400">OFF</span>
        </div>
      </div>

      {/* Slider & Number Input */}
      <div className="flex items-center gap-4">
        <input
          type="range"
          min="10"
          max="65"
          step="1"
          value={discountPercent}
          onChange={(e) => handlePercentChange(Number(e.target.value))}
          className="flex-1 accent-[#804652] h-2 bg-slate-200 rounded-lg cursor-pointer"
        />
        <input
          type="number"
          min="10"
          max="65"
          value={discountPercent}
          onChange={(e) => handlePercentChange(Number(e.target.value))}
          className="w-16 rounded-xl border border-[#EEDDE0] bg-white px-2.5 py-1 text-center text-xs font-bold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#804652]"
        />
      </div>

      {/* Quick Preset Buttons */}
      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <span className="text-[11px] font-bold text-slate-500 mr-1">Presets:</span>
        {DISCOUNT_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => handlePercentChange(p)}
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
              discountPercent === p
                ? 'bg-[#804652] text-white shadow-xs'
                : 'bg-white text-slate-700 border border-[#EEDDE0] hover:bg-[#FAF2F4]'
            }`}
          >
            {p}%
          </button>
        ))}
      </div>

      {/* Discount Badge Text Field */}
      <div className="pt-2 border-t border-[#F0E0E3]">
        <TextField
          label="Discount Text / Badge Label"
          value={discountText}
          onChange={(e) => setDiscountText(e.target.value)}
          placeholder="e.g. FLAT 50% OFF"
        />
      </div>
    </div>
  )
}

{/* ================= REUSABLE TARGET DESTINATION & PRICING PREVIEW ================= */}
function TargetFields({
  targetType,
  setTargetType,
  targetId,
  setTargetId,
  targetUrl,
  setTargetUrl,
  discountPercent,
  categories,
  subcategories,
  brands,
  coupons,
  products,
}: {
  targetType: BannerTargetType
  setTargetType: (v: BannerTargetType) => void
  targetId: string
  setTargetId: (v: string) => void
  targetUrl: string
  setTargetUrl: (v: string) => void
  discountPercent: number
  categories: Category[]
  subcategories: Subcategory[]
  brands: Brand[]
  coupons: Coupon[]
  products: ProductListItem[]
}) {
  const [categoryProducts, setCategoryProducts] = useState<ProductListItem[]>([])
  const [loadingCatProducts, setLoadingCatProducts] = useState(false)

  // Fetch category products when a category target is selected
  useEffect(() => {
    if (targetType === 'CATEGORY' && targetId) {
      setLoadingCatProducts(true)
      api
        .get('/products', { params: { category_id: targetId, limit: 12 } })
        .then((res) => setCategoryProducts(res.data.items ?? []))
        .catch(() => setCategoryProducts([]))
        .finally(() => setLoadingCatProducts(false))
    } else {
      setCategoryProducts([])
    }
  }, [targetType, targetId])

  // Single Product pricing breakdown
  const selectedProduct = targetType === 'PRODUCT' && targetId
    ? products.find((p) => String(p.id) === String(targetId))
    : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Links to (Destination)"
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value as BannerTargetType)
            setTargetId('')
          }}
        >
          {TARGET_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>

        {targetType === 'PRODUCT' && (
          <Select label="Select Product" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choose a product…</option>
            {products.map((p) => {
              const orig = getProductPrice(p)
              return (
                <option key={p.id} value={p.id}>
                  {p.name} {orig > 0 ? `(₹${orig.toLocaleString('en-IN')})` : ''}
                </option>
              )
            })}
          </Select>
        )}

        {targetType === 'CATEGORY' && (
          <Select label="Select Category" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        {targetType === 'SUBCATEGORY' && (
          <Select label="Select Subcategory" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choose a subcategory…</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}

        {targetType === 'BRAND' && (
          <Select label="Select Brand" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choose a brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}

        {targetType === 'COUPON' && (
          <Select label="Select Coupon" required value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Choose a coupon…</option>
            {coupons.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        )}

        {targetType === 'EXTERNAL_URL' && (
          <TextField
            label="External Website URL"
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com/promo"
          />
        )}
      </div>

      {/* T11: Live Pricing Calculation Breakdown for Linked Product */}
      {selectedProduct && (
        <BannerPricePreviewCard
          layout="detailed"
          productName={selectedProduct.name}
          originalPrice={getProductPrice(selectedProduct)}
          discountPercent={discountPercent}
        />
      )}

      {/* T11: Category Products Discount Impact Preview */}
      {targetType === 'CATEGORY' && targetId && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase text-purple-950 tracking-wider">
              Category Products Discount Impact Preview ({discountPercent}% OFF)
            </span>
            {loadingCatProducts && <span className="text-xs text-purple-700 animate-pulse font-bold">Loading products…</span>}
          </div>
          <p className="text-[11px] text-purple-900 font-medium">
            Category products will display with the banner&apos;s {discountPercent}% discount.
          </p>

          {categoryProducts.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-xl border border-purple-200 bg-white divide-y divide-purple-100 shadow-2xs">
              {categoryProducts.map((p) => (
                <div key={p.id} className="p-2 sm:p-2.5 hover:bg-purple-50/40">
                  <BannerPricePreviewCard
                    layout="compact"
                    productName={p.name}
                    originalPrice={getProductPrice(p)}
                    discountPercent={discountPercent}
                  />
                </div>
              ))}
            </div>
          ) : !loadingCatProducts ? (
            <div className="p-3 text-center text-xs text-slate-500 bg-white rounded-xl border border-purple-100">
              No products found in this category yet.
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

{/* ================= CREATE BANNER MODAL ================= */}
function BannerFormModal({
  categories,
  subcategories,
  brands,
  coupons,
  products,
  onClose,
  onSaved,
}: {
  categories: Category[]
  subcategories: Subcategory[]
  brands: Brand[]
  coupons: Coupon[]
  products: ProductListItem[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [position, setPosition] = useState<BannerPosition>('HOME_HERO')
  const [colorTheme, setColorTheme] = useState('purple')

  // T10: Discount Percentage configuration (10% to 65%)
  const [discountPercent, setDiscountPercent] = useState<number>(25)
  const [discountText, setDiscountText] = useState('FLAT 25% OFF')
  const [ctaText, setCtaText] = useState('Shop Now →')

  const [targetType, setTargetType] = useState<BannerTargetType>('NONE')
  const [targetId, setTargetId] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isActive, setIsActive] = useState(true)

  const [desktopFile, setDesktopFile] = useState<File | null>(null)
  const [mobileFile, setMobileFile] = useState<File | null>(null)
  const [desktopPreview, setDesktopPreview] = useState<string>('')
  const [mobilePreview, setMobilePreview] = useState<string>('')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const formattedStarts = startsAt
        ? startsAt.includes('T') || startsAt.includes(' ')
          ? startsAt
          : `${startsAt} 00:00:00`
        : null
      const formattedEnds = endsAt
        ? endsAt.includes('T') || endsAt.includes(' ')
          ? endsAt
          : `${endsAt} 23:59:59`
        : null

      const res = await api.post('/banners', {
        title: name,
        subtitle: subtitle || null,
        description: description || null,
        position,
        color_theme: colorTheme || 'purple',
        discount_text: discountText || `FLAT ${discountPercent}% OFF`,
        cta_text: ctaText || null,
        target_type: targetType,
        target_id: targetId || null,
        target_url: targetType === 'EXTERNAL_URL' ? targetUrl : null,
        starts_at: formattedStarts,
        ends_at: formattedEnds,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive ? 1 : 0,
      })
      const bannerId = res.data.id

      if (desktopFile) {
        const formData = new FormData()
        formData.append('file', desktopFile)
        await api.post(`/banners/${bannerId}/image/desktop`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      if (mobileFile) {
        const formData = new FormData()
        formData.append('file', mobileFile)
        await api.post(`/banners/${bannerId}/image/mobile`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }

      onSaved()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create banner'))
    } finally {
      setSubmitting(false)
    }
  }

  const selectedTheme = COLOR_THEMES.find((t) => t.value === colorTheme) || COLOR_THEMES[0]

  return (
    <Modal title="Create New Banner" onClose={onClose} width="xl">
      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {error && <Alert>{error}</Alert>}

        {/* Live Preview Bar */}
        <div className={`p-4 rounded-2xl bg-gradient-to-r ${selectedTheme.bg} text-white shadow-sm space-y-2`}>
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/80">
            <span>Storefront Live Preview ({position.replace('_', ' ')})</span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-black">
              🔥 {discountText || `FLAT ${discountPercent}% OFF`}
            </span>
          </div>
          <div>
            <h5 className="text-base font-extrabold tracking-tight">{name || 'Your Banner Title Here'}</h5>
            <p className="text-xs text-white/90 font-semibold">{subtitle || 'Catchy promotional subtitle'}</p>
            {description && <p className="text-[11px] text-white/75 mt-0.5 line-clamp-1">{description}</p>}
          </div>
          {ctaText && (
            <div className="pt-1">
              <span className="inline-block px-3 py-1 rounded-full bg-white text-slate-900 text-[10px] font-bold shadow-xs">
                {ctaText}
              </span>
            </div>
          )}
        </div>

        {/* Main Content Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Banner Title"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Silk Scrunchies & Velvet Bows"
          />
          <TextField
            label="Subtitle (Optional)"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="e.g. Anti-breakage styling essentials"
          />
        </div>

        <TextArea
          label="Description (Optional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Detailed promotional text shown on storefront cards..."
        />

        {/* T10: Discount Percentage (10% to 65%) */}
        <BannerDiscountConfig
          discountPercent={discountPercent}
          setDiscountPercent={setDiscountPercent}
          discountText={discountText}
          setDiscountText={setDiscountText}
        />

        {/* Display Positioning & Theme */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Banner Position" value={position} onChange={(e) => setPosition(e.target.value as BannerPosition)}>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>

          <Select label="Color Theme" value={colorTheme} onChange={(e) => setColorTheme(e.target.value)}>
            {COLOR_THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>

        {/* CTA Button Text */}
        <TextField
          label="CTA Button Text"
          value={ctaText}
          onChange={(e) => setCtaText(e.target.value)}
          placeholder="e.g. Shop Now →"
        />

        {/* Link Destination & Pricing Calculation */}
        <TargetFields
          targetType={targetType}
          setTargetType={setTargetType}
          targetId={targetId}
          setTargetId={setTargetId}
          targetUrl={targetUrl}
          setTargetUrl={setTargetUrl}
          discountPercent={discountPercent}
          categories={categories}
          subcategories={subcategories}
          brands={brands}
          coupons={coupons}
          products={products}
        />

        {/* Image File Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-[#F2E5E7] bg-[#FAF2F4]/30 p-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Desktop Banner Image
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setDesktopFile(f)
                  setDesktopPreview(URL.createObjectURL(f))
                }
              }}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#FAF2F4] file:text-[#804652] hover:file:bg-[#F2E5E7] cursor-pointer"
            />
            {desktopPreview && (
              <img
                src={desktopPreview}
                alt="Desktop Preview"
                className="mt-2 h-20 w-full rounded-xl border border-slate-300 object-cover shadow-2xs"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
              Mobile Banner Image (Optional)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setMobileFile(f)
                  setMobilePreview(URL.createObjectURL(f))
                }
              }}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-[#FAF2F4] file:text-[#804652] hover:file:bg-[#F2E5E7] cursor-pointer"
            />
            {mobilePreview && (
              <img
                src={mobilePreview}
                alt="Mobile Preview"
                className="mt-2 h-20 w-full rounded-xl border border-slate-300 object-cover shadow-2xs"
              />
            )}
          </div>
        </div>

        {/* Schedule, Sort Order, Active Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TextField label="Starts At (Optional)" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <TextField label="Ends At (Optional)" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <TextField label="Sort Order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2 pt-1">
          <input
            id="banner-is-active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[#804652] focus:ring-[#804652] cursor-pointer"
          />
          <label htmlFor="banner-is-active" className="text-xs font-bold text-slate-800 cursor-pointer">
            Active immediately upon creation
          </label>
        </div>

        {/* Modal Actions */}
        <div className="flex justify-end gap-2.5 pt-3 border-t border-[#F0E0E3]">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating Banner…' : 'Create Banner'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

{/* ================= MANAGE / EDIT BANNER MODAL ================= */}
function BannerManageModal({
  banner,
  categories,
  subcategories,
  brands,
  coupons,
  products,
  onClose,
  onChanged,
  onSaved,
}: {
  banner: Banner
  categories: Category[]
  subcategories: Subcategory[]
  brands: Brand[]
  coupons: Coupon[]
  products: ProductListItem[]
  onClose: () => void
  onChanged: (updated: Banner) => void
  onSaved?: (title: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'images' | 'products'>('details')

  // Edit fields
  const [title, setTitle] = useState(banner.title)
  const [subtitle, setSubtitle] = useState(banner.subtitle ?? '')
  const [description, setDescription] = useState(banner.description ?? '')
  const [position, setPosition] = useState<BannerPosition>(banner.position)
  const [colorTheme, setColorTheme] = useState(banner.color_theme ?? 'purple')

  // T10: Discount percentage state initialized from existing banner discount text
  const [discountPercent, setDiscountPercent] = useState<number>(() => parseDiscountPercentage(banner.discount_text))
  const [discountText, setDiscountText] = useState(banner.discount_text ?? 'FLAT 20% OFF')
  const [ctaText, setCtaText] = useState(banner.cta_text ?? '')

  const [targetType, setTargetType] = useState<BannerTargetType>(banner.target_type)
  const [targetId, setTargetId] = useState(banner.target_id ? String(banner.target_id) : '')
  const [targetUrl, setTargetUrl] = useState(banner.target_url ?? '')
  const [startsAt, setStartsAt] = useState(banner.starts_at ? banner.starts_at.slice(0, 10) : '')
  const [endsAt, setEndsAt] = useState(banner.ends_at ? banner.ends_at.slice(0, 10) : '')
  const [sortOrder, setSortOrder] = useState(String(banner.sort_order))
  const [isActive, setIsActive] = useState(Number(banner.is_active) === 1)

  const [error, setError] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)

  // Image Upload states
  const [uploadingDesktop, setUploadingDesktop] = useState(false)
  const [uploadingMobile, setUploadingMobile] = useState(false)
  const desktopInput = useRef<HTMLInputElement>(null)
  const mobileInput = useRef<HTMLInputElement>(null)

  // Landing page products states
  const [newItemProductId, setNewItemProductId] = useState('')
  const [newItemOfferText, setNewItemOfferText] = useState('')
  const [addingProduct, setAddingProduct] = useState(false)

  // When a product is selected in newItemProductId, auto-calculate offer text
  function handleSelectNewItemProduct(prodId: string) {
    setNewItemProductId(prodId)
    if (prodId) {
      const p = products.find((prod) => String(prod.id) === String(prodId))
      if (p) {
        const pr = calculateDiscount(p.min_price || p.mrp, discountPercent)
        setNewItemOfferText(`FLAT ${discountPercent}% OFF (Now ₹${pr.discountedPrice})`)
      }
    }
  }

  async function refresh() {
    const res = await api.get(`/banners/${banner.id}`)
    onChanged(res.data.banner)
  }

  async function saveMeta(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSavingMeta(true)
    try {
      const formattedStarts = startsAt
        ? startsAt.includes('T') || startsAt.includes(' ')
          ? startsAt
          : `${startsAt} 00:00:00`
        : null
      const formattedEnds = endsAt
        ? endsAt.includes('T') || endsAt.includes(' ')
          ? endsAt
          : `${endsAt} 23:59:59`
        : null

      await api.put(`/banners/${banner.id}`, {
        title,
        subtitle: subtitle || null,
        description: description || null,
        position,
        color_theme: colorTheme || 'purple',
        discount_text: discountText || `FLAT ${discountPercent}% OFF`,
        cta_text: ctaText || null,
        target_type: targetType,
        target_id: targetId || null,
        target_url: targetType === 'EXTERNAL_URL' ? targetUrl : null,
        starts_at: formattedStarts,
        ends_at: formattedEnds,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive ? 1 : 0,
      })
      onSaved?.(title)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save changes'))
    } finally {
      setSavingMeta(false)
    }
  }

  async function uploadImage(side: 'desktop' | 'mobile', file: File | undefined) {
    if (!file) return
    const setBusy = side === 'desktop' ? setUploadingDesktop : setUploadingMobile
    setBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.post(`/banners/${banner.id}/image/${side}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not upload image'))
    } finally {
      setBusy(false)
    }
  }

  async function addItem(e: FormEvent) {
    e.preventDefault()
    if (!newItemProductId) return
    setError('')
    setAddingProduct(true)
    try {
      await api.post(`/banners/${banner.id}/items`, {
        product_id: Number(newItemProductId),
        offer_text: newItemOfferText || null,
      })
      setNewItemProductId('')
      setNewItemOfferText('')
      await refresh()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not link product'))
    } finally {
      setAddingProduct(false)
    }
  }

  async function removeItem(itemId: number) {
    await api.delete(`/banners/${banner.id}/items/${itemId}`)
    await refresh()
  }

  const selectedTheme = COLOR_THEMES.find((t) => t.value === colorTheme) || COLOR_THEMES[0]
  const currentDesktop = imageUrl(banner.image_desktop_path)
  const currentMobile = imageUrl(banner.image_mobile_path)

  // Pricing preview for the item about to be added
  const pendingProduct = newItemProductId
    ? products.find((p) => String(p.id) === String(newItemProductId))
    : null

  return (
    <Modal title={`Manage Banner: ${banner.title}`} onClose={onClose} width="xl">
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-[#F0E0E3] gap-6 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`pb-2.5 transition-all cursor-pointer ${
              activeTab === 'details'
                ? 'border-b-2 border-[#804652] text-[#804652]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Details & Discount
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('images')}
            className={`pb-2.5 transition-all cursor-pointer ${
              activeTab === 'images'
                ? 'border-b-2 border-[#804652] text-[#804652]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Banner Images
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`pb-2.5 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'products'
                ? 'border-b-2 border-[#804652] text-[#804652]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Landing Products</span>
            {banner.items.length > 0 && (
              <span className="rounded-full bg-[#FAF2F4] text-[#804652] px-2 py-0.2 text-[10px] font-extrabold border border-[#EEDDE0]">
                {banner.items.length}
              </span>
            )}
          </button>
        </div>

        {/* ================= TAB 1: DETAILS & DISCOUNT ================= */}
        {activeTab === 'details' && (
          <form onSubmit={saveMeta} className="space-y-4 text-xs pt-1">
            {/* Live Preview Box */}
            <div className={`p-4 rounded-2xl bg-gradient-to-r ${selectedTheme.bg} text-white shadow-sm space-y-2`}>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/80">
                <span>Theme & Discount Preview</span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-black">
                  🔥 {discountText || `FLAT ${discountPercent}% OFF`}
                </span>
              </div>
              <div>
                <h5 className="text-base font-extrabold tracking-tight">{title || 'Banner Title'}</h5>
                <p className="text-xs text-white/90 font-semibold">{subtitle || 'Banner subtitle'}</p>
                {description && <p className="text-[11px] text-white/75 mt-0.5 line-clamp-1">{description}</p>}
              </div>
              {ctaText && (
                <div className="pt-1">
                  <span className="inline-block px-3 py-1 rounded-full bg-white text-slate-900 text-[10px] font-bold shadow-xs">
                    {ctaText}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
              <TextField
                label="Subtitle"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Subtitle preview"
              />
            </div>

            <TextArea
              label="Description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed promotional description"
            />

            {/* T10: Discount Percentage Control */}
            <BannerDiscountConfig
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              discountText={discountText}
              setDiscountText={setDiscountText}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Position" value={position} onChange={(e) => setPosition(e.target.value as BannerPosition)}>
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Select label="Color Theme" value={colorTheme} onChange={(e) => setColorTheme(e.target.value)}>
                {COLOR_THEMES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>

            <TextField
              label="CTA Button Text"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="e.g. Shop Now →"
            />

            {/* Target Destination & Pricing Preview */}
            <TargetFields
              targetType={targetType}
              setTargetType={setTargetType}
              targetId={targetId}
              setTargetId={setTargetId}
              targetUrl={targetUrl}
              setTargetUrl={setTargetUrl}
              discountPercent={discountPercent}
              categories={categories}
              subcategories={subcategories}
              brands={brands}
              coupons={coupons}
              products={products}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextField label="Starts At" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              <TextField label="Ends At" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              <TextField label="Sort Order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="edit-is-active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-[#804652] focus:ring-[#804652] cursor-pointer"
              />
              <label htmlFor="edit-is-active" className="text-xs font-bold text-slate-800 cursor-pointer">
                Active banner on storefront
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#F0E0E3]">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingMeta}>
                {savingMeta ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        )}

        {/* ================= TAB 2: BANNER IMAGES ================= */}
        {activeTab === 'images' && (
          <div className="space-y-5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Desktop Image */}
              <div className="rounded-2xl border border-[#F2E5E7] p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Desktop Image Banner</span>
                  <span className="text-[11px] text-slate-500">1200 × 500 px rec.</span>
                </div>
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#EEDDE0] bg-white">
                  {currentDesktop ? (
                    <img src={currentDesktop} alt="Desktop banner" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400 font-semibold">No desktop image uploaded</span>
                  )}
                </div>
                <input
                  ref={desktopInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => uploadImage('desktop', e.target.files?.[0])}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={uploadingDesktop}
                  onClick={() => desktopInput.current?.click()}
                >
                  {uploadingDesktop ? 'Uploading…' : 'Upload / Replace Desktop Image'}
                </Button>
              </div>

              {/* Mobile Image */}
              <div className="rounded-2xl border border-[#F2E5E7] p-4 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Mobile Image (Optional)</span>
                  <span className="text-[11px] text-slate-500">600 × 600 px rec.</span>
                </div>
                <div className="flex h-36 items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#EEDDE0] bg-white">
                  {currentMobile ? (
                    <img src={currentMobile} alt="Mobile banner" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400 font-semibold">No mobile image uploaded</span>
                  )}
                </div>
                <input
                  ref={mobileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => uploadImage('mobile', e.target.files?.[0])}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={uploadingMobile}
                  onClick={() => mobileInput.current?.click()}
                >
                  {uploadingMobile ? 'Uploading…' : 'Upload / Replace Mobile Image'}
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F0E0E3]">
              <Button type="button" variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}

        {/* ================= TAB 3: LANDING PRODUCTS (T11 PRICING INTEGRATED) ================= */}
        {activeTab === 'products' && (
          <div className="space-y-4 pt-1">
            {/* Banner Discount Control in Tab 3 */}
            <div className="rounded-2xl bg-[#FAF2F4]/50 border border-[#EEDDE0] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="font-extrabold text-[#804652] text-xs uppercase tracking-wider">
                    Banner Discount Percentage ({discountPercent}%)
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Adjusting the discount updates the price preview for all linked products immediately.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full bg-white border border-[#EEDDE0] font-black text-[#804652] text-xs shadow-2xs">
                    {discountPercent}% OFF
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingMeta}
                    onClick={async () => {
                      setSavingMeta(true)
                      try {
                        await api.put(`/banners/${banner.id}`, {
                          title,
                          subtitle: subtitle || null,
                          description: description || null,
                          position,
                          color_theme: colorTheme || 'purple',
                          discount_text: discountText || `FLAT ${discountPercent}% OFF`,
                          cta_text: ctaText || null,
                          target_type: targetType,
                          target_id: targetId || null,
                          target_url: targetType === 'EXTERNAL_URL' ? targetUrl : null,
                          starts_at: startsAt ? (startsAt.includes(' ') ? startsAt : `${startsAt} 00:00:00`) : null,
                          ends_at: endsAt ? (endsAt.includes(' ') ? endsAt : `${endsAt} 23:59:59`) : null,
                          sort_order: Number(sortOrder) || 0,
                          is_active: isActive ? 1 : 0,
                        })
                        await refresh()
                      } catch (err) {
                        setError(apiErrorMessage(err, 'Failed to update discount'))
                      } finally {
                        setSavingMeta(false)
                      }
                    }}
                  >
                    {savingMeta ? 'Saving…' : 'Save Discount'}
                  </Button>
                </div>
              </div>

              {/* Slider & Presets */}
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="10"
                  max="65"
                  step="1"
                  value={discountPercent}
                  onChange={(e) => {
                    const v = Math.min(65, Math.max(10, Number(e.target.value)))
                    setDiscountPercent(v)
                    setDiscountText(`FLAT ${v}% OFF`)
                  }}
                  className="flex-1 accent-[#804652] h-2 bg-slate-200 rounded-lg cursor-pointer"
                />
                <input
                  type="number"
                  min="10"
                  max="65"
                  value={discountPercent}
                  onChange={(e) => {
                    const v = Math.min(65, Math.max(10, Number(e.target.value)))
                    setDiscountPercent(v)
                    setDiscountText(`FLAT ${v}% OFF`)
                  }}
                  className="w-16 rounded-xl border border-[#EEDDE0] bg-white px-2.5 py-1 text-center text-xs font-bold text-slate-900 shadow-2xs focus:outline-none focus:ring-2 focus:ring-[#804652]"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Presets:</span>
                {DISCOUNT_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setDiscountPercent(p)
                      setDiscountText(`FLAT ${p}% OFF`)
                    }}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      discountPercent === p
                        ? 'bg-[#804652] text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-[#EEDDE0] hover:bg-[#FAF2F4]'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            </div>

            {/* Existing Items List with T11 Price Calculations */}
            {banner.items.length > 0 ? (
              <div className="rounded-2xl border border-[#F2E5E7] bg-white divide-y divide-[#F0E0E3] overflow-hidden shadow-2xs">
                {banner.items.map((item) => {
                  const linkedP = products.find((p) => p.id === item.product_id)
                  const origPrice = getProductPrice(linkedP) || Number(item.min_price || item.mrp || 0)

                  return (
                    <BannerPricePreviewCard
                      key={item.id}
                      layout="table-row"
                      productName={item.product_name}
                      originalPrice={origPrice}
                      discountPercent={discountPercent}
                      badgeText={item.offer_text}
                      onRemove={() => removeItem(item.id)}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="p-6 text-center rounded-2xl border border-dashed border-[#EEDDE0] text-slate-400 text-xs">
                No products linked to this banner yet.
              </div>
            )}

            {/* Add New Product Form with Live Pricing Preview before saving */}
            <form onSubmit={addItem} className="space-y-3 pt-2 rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 p-4">
              <p className="font-bold text-slate-800 text-xs">Link Another Product to this Banner</p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  value={newItemProductId}
                  onChange={(e) => handleSelectNewItemProduct(e.target.value)}
                  required
                >
                  <option value="">Select a product to attach…</option>
                  {products.map((p) => {
                    const orig = getProductPrice(p)
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} {orig > 0 ? `(₹${orig.toLocaleString('en-IN')})` : ''}
                      </option>
                    )
                  })}
                </Select>
                <TextField
                  placeholder={`Offer badge text (e.g. FLAT ${discountPercent}% OFF)`}
                  value={newItemOfferText}
                  onChange={(e) => setNewItemOfferText(e.target.value)}
                />
              </div>

              {/* T11 Calculated Price Preview for selected product before saving */}
              {pendingProduct && (
                <div className="pt-1">
                  <BannerPricePreviewCard
                    layout="detailed"
                    productName={pendingProduct.name}
                    originalPrice={getProductPrice(pendingProduct)}
                    discountPercent={discountPercent}
                    badgeText={newItemOfferText || `FLAT ${discountPercent}% OFF`}
                  />
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={addingProduct || !newItemProductId}>
                  {addingProduct ? 'Adding…' : '+ Attach Product with Discount'}
                </Button>
              </div>
            </form>

            <div className="flex justify-end pt-3 border-t border-[#F0E0E3]">
              <Button type="button" variant="secondary" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
