import React, { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FiChevronDown, FiX, FiSearch, FiFilter } from 'react-icons/fi'
import { categoryPath } from '../lib/seo'

/**
 * Left-side faceted filter sidebar (category/brand/search/listing pages) —
 * every control reads from and writes to the URL via onChangeParams, so
 * filter state is shareable and survives back/forward/refresh exactly
 * like Shop.jsx's existing category/brand/sort params already do.
 *
 * `facets` is the backend's GET /products?include_facets=1 response.facets
 * ({brands, price, rating_buckets, discount_buckets, countries,
 * attributes, specs}) for the CURRENT filtered result set — each group
 * already excludes its own active selection server-side, so the counts
 * shown here are the faceted-search counts a customer expects (picking
 * one Color never makes the other Colors disappear).
 */

function CollapsibleGroup({ title, defaultOpen = true, children, count }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[var(--color-border-subtle)] py-3.5 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left cursor-pointer"
      >
        <span className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
          {title}
          {typeof count === 'number' && count > 0 && (
            <span className="ml-1.5 text-[10px] font-bold text-[var(--color-brand)]">({count})</span>
          )}
        </span>
        <FiChevronDown className={`w-3.5 h-3.5 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2.5 space-y-1.5">{children}</div>}
    </div>
  )
}

function FacetCheckbox({ label, count, checked, onChange, swatchHex }) {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--color-text-main)] cursor-pointer group py-0.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-3.5 h-3.5 rounded border-[var(--color-border-subtle)] text-[var(--color-brand)] focus:ring-[var(--color-brand)] cursor-pointer"
      />
      {swatchHex && (
        <span
          className="w-3 h-3 rounded-full border border-black/10 shrink-0"
          style={{ backgroundColor: swatchHex }}
        />
      )}
      <span className="flex-1 truncate group-hover:text-[var(--color-brand)]">{label}</span>
      {typeof count === 'number' && <span className="text-[10px] text-[var(--color-text-muted)]">({count})</span>}
    </label>
  )
}

const PRICE_PRESETS = [200, 300, 500, 700, 1000]

export default function FilterSidebar({
  facets,
  categories = [],
  subcategories = [],
  currentCategory,
  currentSubcategory,
  searchParams,
  onChangeParams,
  isOpenMobile = false,
  onCloseMobile,
  resultCount = 0,
}) {
  const getP = (key) => searchParams.get(key) || ''
  const getMulti = (key) => (searchParams.get(key) || '').split(',').filter(Boolean)

  const [brandSearch, setBrandSearch] = useState('')
  const [priceDraft, setPriceDraft] = useState({ min: getP('min_price'), max: getP('max_price') })

  useEffect(() => {
    setPriceDraft({ min: getP('min_price'), max: getP('max_price') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Debounced price-slider commit — avoids firing a new API request on
  // every pixel of drag.
  useEffect(() => {
    const t = setTimeout(() => {
      if (priceDraft.min === getP('min_price') && priceDraft.max === getP('max_price')) return
      onChangeParams((next) => {
        if (priceDraft.min) next.set('min_price', priceDraft.min)
        else next.delete('min_price')
        if (priceDraft.max) next.set('max_price', priceDraft.max)
        else next.delete('max_price')
      })
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceDraft])

  function toggleMulti(key, value) {
    const current = getMulti(key)
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    onChangeParams((params) => {
      if (next.length > 0) params.set(key, next.join(','))
      else params.delete(key)
    })
  }

  function setSingle(key, value) {
    onChangeParams((params) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
  }

  function clearAll() {
    onChangeParams((params) => {
      for (const key of Array.from(params.keys())) {
        if (key !== 'section') params.delete(key)
      }
    })
  }

  const selectedBrandIds = getMulti('brand_id')
  const selectedRating = getP('rating_min')
  const selectedDiscount = getP('discount_min')
  const includeOutOfStock = getP('in_stock') === '0'
  const selectedOffer = getP('offer')
  const isNewArrival = getP('new_arrival') === '1'
  const selectedCountries = getMulti('country_of_origin')

  const filteredBrands = useMemo(() => {
    const list = facets?.brands ?? []
    if (!brandSearch.trim()) return list
    const q = brandSearch.toLowerCase()
    return list.filter((b) => (b.name || '').toLowerCase().includes(q))
  }, [facets, brandSearch])

  // Applied-filter chips: every URL param that represents a real,
  // user-visible filter choice, each individually removable.
  const appliedChips = useMemo(() => {
    const chips = []
    for (const id of selectedBrandIds) {
      const b = facets?.brands?.find((x) => String(x.id) === String(id))
      chips.push({ label: b?.name || `Brand #${id}`, onRemove: () => toggleMulti('brand_id', id) })
    }
    if (selectedRating) chips.push({ label: `${selectedRating}★ & above`, onRemove: () => setSingle('rating_min', '') })
    if (selectedDiscount) chips.push({ label: `${selectedDiscount}% off or more`, onRemove: () => setSingle('discount_min', '') })
    if (priceDraft.min || priceDraft.max) {
      chips.push({
        label: `₹${priceDraft.min || 0} - ₹${priceDraft.max || '∞'}`,
        onRemove: () => onChangeParams((p) => { p.delete('min_price'); p.delete('max_price') }),
      })
    }
    for (const c of selectedCountries) chips.push({ label: c, onRemove: () => toggleMulti('country_of_origin', c) })
    if (selectedOffer) chips.push({ label: 'Special Price', onRemove: () => setSingle('offer', '') })
    if (isNewArrival) chips.push({ label: 'New Arrivals', onRemove: () => setSingle('new_arrival', '') })
    for (const attr of facets?.attributes ?? []) {
      for (const v of getMulti(`attr_${attr.name}`)) {
        chips.push({ label: `${attr.name}: ${v}`, onRemove: () => toggleMulti(`attr_${attr.name}`, v) })
      }
    }
    for (const spec of facets?.specs ?? []) {
      for (const v of getMulti(`spec_${spec.name}`)) {
        chips.push({ label: `${spec.name}: ${v}`, onRemove: () => toggleMulti(`spec_${spec.name}`, v) })
      }
    }
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, facets, priceDraft])

  const body = (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border-subtle)]">
        <h2 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-wide">Filters</h2>
        {appliedChips.length > 0 && (
          <button type="button" onClick={clearAll} className="text-[11px] font-bold text-[var(--color-brand)] hover:underline cursor-pointer">
            CLEAR ALL
          </button>
        )}
        {onCloseMobile && (
          <button type="button" onClick={onCloseMobile} className="lg:hidden text-[var(--color-text-muted)] cursor-pointer">
            <FiX className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Applied chips */}
      {appliedChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-3 border-b border-[var(--color-border-subtle)]">
          {appliedChips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-[11px] font-bold"
            >
              {chip.label}
              <button type="button" onClick={chip.onRemove} className="hover:text-rose-600 cursor-pointer">
                <FiX className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Category breadcrumb */}
      {(currentCategory || currentSubcategory) && (
        <div className="py-3 border-b border-[var(--color-border-subtle)] text-xs">
          <p className="text-[10px] font-black uppercase text-[var(--color-text-muted)] mb-1.5">Category</p>
          <div className="flex flex-wrap items-center gap-1 font-semibold text-[var(--color-text-main)]">
            <Link to="/products" className="text-[var(--color-brand)] hover:underline">All</Link>
            {currentCategory && (
              <>
                <span className="text-[var(--color-text-muted)]">/</span>
                <Link to={categoryPath(currentCategory)} className={currentSubcategory ? 'text-[var(--color-brand)] hover:underline' : ''}>
                  {currentCategory.name}
                </Link>
              </>
            )}
            {currentSubcategory && (
              <>
                <span className="text-[var(--color-text-muted)]">/</span>
                <span>{currentSubcategory.name}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Brand */}
      {(facets?.brands?.length ?? 0) > 0 && (
        <CollapsibleGroup title="Brand" count={facets.brands.length}>
          {facets.brands.length > 8 && (
            <div className="relative mb-1.5">
              <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="Search brands…"
                className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded-lg border border-[var(--color-border-subtle)] focus:border-[var(--color-brand)] outline-none"
              />
            </div>
          )}
          <div className="space-y-1 pr-1">
            {filteredBrands.map((b) => (
              <FacetCheckbox
                key={b.id}
                label={b.name}
                count={Number(b.count)}
                checked={selectedBrandIds.includes(String(b.id))}
                onChange={() => toggleMulti('brand_id', String(b.id))}
              />
            ))}
          </div>
        </CollapsibleGroup>
      )}

      {/* Price */}
      {facets?.price && (facets.price.min_price !== null) && (
        <CollapsibleGroup title="Price">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="number"
              placeholder="Min"
              value={priceDraft.min}
              onChange={(e) => setPriceDraft((d) => ({ ...d, min: e.target.value }))}
              className="w-1/2 px-2 py-1.5 text-xs rounded-lg border border-[var(--color-border-subtle)] focus:border-[var(--color-brand)] outline-none"
            />
            <span className="text-[var(--color-text-muted)] text-xs">–</span>
            <input
              type="number"
              placeholder="Max"
              value={priceDraft.max}
              onChange={(e) => setPriceDraft((d) => ({ ...d, max: e.target.value }))}
              className="w-1/2 px-2 py-1.5 text-xs rounded-lg border border-[var(--color-border-subtle)] focus:border-[var(--color-brand)] outline-none"
            />
          </div>
          <input
            type="range"
            min={Math.floor(Number(facets.price.min_price) || 0)}
            max={Math.ceil(Number(facets.price.max_price) || 1000)}
            value={priceDraft.max || Math.ceil(Number(facets.price.max_price) || 1000)}
            onChange={(e) => setPriceDraft((d) => ({ ...d, max: e.target.value }))}
            className="w-full accent-[var(--color-brand)] cursor-pointer"
          />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {PRICE_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriceDraft({ min: '', max: String(p) })}
                className="px-2 py-1 rounded-full border border-[var(--color-border-subtle)] text-[10px] font-semibold text-[var(--color-text-main)] hover:border-[var(--color-brand)] cursor-pointer"
              >
                Under ₹{p}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPriceDraft({ min: '1000', max: '' })}
              className="px-2 py-1 rounded-full border border-[var(--color-border-subtle)] text-[10px] font-semibold text-[var(--color-text-main)] hover:border-[var(--color-brand)] cursor-pointer"
            >
              ₹1000+
            </button>
          </div>
        </CollapsibleGroup>
      )}

      {/* Customer Ratings */}
      <CollapsibleGroup title="Customer Ratings">
        {(facets?.rating_buckets ?? []).filter((b) => b.count > 0).map((b) => (
          <FacetCheckbox
            key={b.min_rating}
            label={`${b.min_rating}★ & above`}
            count={b.count}
            checked={selectedRating === String(b.min_rating)}
            onChange={() => setSingle('rating_min', selectedRating === String(b.min_rating) ? '' : String(b.min_rating))}
          />
        ))}
      </CollapsibleGroup>

      {/* Discount */}
      <CollapsibleGroup title="Discount">
        {(facets?.discount_buckets ?? []).filter((b) => b.count > 0).map((b) => (
          <FacetCheckbox
            key={b.min_discount}
            label={`${b.min_discount}% or more`}
            count={b.count}
            checked={selectedDiscount === String(b.min_discount)}
            onChange={() => setSingle('discount_min', selectedDiscount === String(b.min_discount) ? '' : String(b.min_discount))}
          />
        ))}
      </CollapsibleGroup>

      {/* Availability */}
      <CollapsibleGroup title="Availability">
        <label className="flex items-center justify-between text-xs font-semibold text-[var(--color-text-main)] cursor-pointer">
          <span>Include Out of Stock</span>
          <input
            type="checkbox"
            checked={includeOutOfStock}
            onChange={() => setSingle('in_stock', includeOutOfStock ? '' : '0')}
            className="w-3.5 h-3.5 rounded cursor-pointer accent-[var(--color-brand)]"
          />
        </label>
      </CollapsibleGroup>

      {/* Offers */}
      <CollapsibleGroup title="Offers">
        <FacetCheckbox
          label="Special Price"
          checked={selectedOffer === 'special_price'}
          onChange={() => setSingle('offer', selectedOffer === 'special_price' ? '' : 'special_price')}
        />
      </CollapsibleGroup>

      {/* New Arrivals */}
      <CollapsibleGroup title="New Arrivals">
        <FacetCheckbox
          label="Added in the last 30 days"
          checked={isNewArrival}
          onChange={() => setSingle('new_arrival', isNewArrival ? '' : '1')}
        />
      </CollapsibleGroup>

      {/* Country of Origin */}
      {(facets?.countries?.length ?? 0) > 0 && (
        <CollapsibleGroup title="Country of Origin">
          {facets.countries.map((c) => (
            <FacetCheckbox
              key={c.name}
              label={c.name}
              count={Number(c.count)}
              checked={selectedCountries.includes(c.name)}
              onChange={() => toggleMulti('country_of_origin', c.name)}
            />
          ))}
        </CollapsibleGroup>
      )}

      {/* Dynamic variant-attribute facets */}
      {(facets?.attributes ?? []).map((attr) => {
        const selected = getMulti(`attr_${attr.name}`)
        return (
          <CollapsibleGroup key={attr.name} title={attr.name} defaultOpen={false}>
            {attr.values.map((v) => (
              <FacetCheckbox
                key={v.value}
                label={v.value}
                count={Number(v.count)}
                swatchHex={v.color_hex}
                checked={selected.includes(v.value)}
                onChange={() => toggleMulti(`attr_${attr.name}`, v.value)}
              />
            ))}
          </CollapsibleGroup>
        )
      })}

      {/* Dynamic product-spec facets */}
      {(facets?.specs ?? []).map((spec) => {
        const selected = getMulti(`spec_${spec.name}`)
        return (
          <CollapsibleGroup key={spec.name} title={spec.name} defaultOpen={false}>
            {spec.values.map((v) => (
              <FacetCheckbox
                key={v.value}
                label={v.value}
                count={Number(v.count)}
                checked={selected.includes(v.value)}
                onChange={() => toggleMulti(`spec_${spec.name}`, v.value)}
              />
            ))}
          </CollapsibleGroup>
        )
      })}
    </div>
  )

  return (
    <>
      {/* Desktop: sticky sidebar with its own scroll */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto bg-white rounded-2xl border border-[var(--color-border-subtle)] p-4 shadow-xs">
          {body}
        </div>
      </aside>

      {/* Mobile: full-screen drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <div className="absolute inset-y-0 left-0 w-[88%] max-w-sm bg-white flex flex-col animate-in slide-in-from-left duration-200">
            <div className="flex-1 overflow-y-auto p-4">{body}</div>
            <div className="shrink-0 border-t border-[var(--color-border-subtle)] p-3 flex gap-2 bg-white">
              <button
                type="button"
                onClick={clearAll}
                className="flex-1 py-2.5 rounded-full border border-[var(--color-border-subtle)] text-xs font-bold text-[var(--color-text-main)] cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={onCloseMobile}
                className="flex-1 py-2.5 rounded-full bg-[var(--color-brand)] text-white text-xs font-bold cursor-pointer"
              >
                Apply ({resultCount})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function MobileFilterButton({ onClick, activeCount = 0 }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="lg:hidden inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--color-border-subtle)] bg-white text-xs font-bold text-[var(--color-text-main)] shadow-xs cursor-pointer relative"
    >
      <FiFilter className="w-3.5 h-3.5" />
      <span>Filter</span>
      {activeCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--color-brand)] text-white text-[9px] font-bold flex items-center justify-center">
          {activeCount}
        </span>
      )}
    </button>
  )
}
