import { useState } from 'react'

export interface SeoValues {
  meta_title: string
  meta_description: string
  seo_keywords: string
  seo_content: string
}

export const EMPTY_SEO: SeoValues = { meta_title: '', meta_description: '', seo_keywords: '', seo_content: '' }

export function seoFrom(entity: Partial<Record<keyof SeoValues, string | null>> | null | undefined): SeoValues {
  return {
    meta_title: entity?.meta_title ?? '',
    meta_description: entity?.meta_description ?? '',
    seo_keywords: entity?.seo_keywords ?? '',
    seo_content: entity?.seo_content ?? '',
  }
}

const SITE_URL = 'https://shopadams.in'

function Counter({ value, ideal, max }: { value: string; ideal: number; max: number }) {
  const n = value.length
  const tone = n === 0 ? 'text-slate-400' : n <= ideal ? 'text-emerald-600' : n <= max ? 'text-amber-600' : 'text-rose-600'
  return (
    <span className={`text-[10px] font-bold ${tone}`}>
      {n}/{ideal}
    </span>
  )
}

const inputCls =
  'w-full rounded-xl border border-[var(--color-surface-muted)] bg-[var(--color-extra-002)] px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 transition-all shadow-2xs'

/**
 * Google SEO fields for a category / subcategory landing page
 * (/category/<slug>). Everything is optional - empty fields are
 * auto-generated on the website from the name, product count, price
 * range and top brands.
 */
export function SeoFields({
  value,
  onChange,
  name,
  path,
}: {
  value: SeoValues
  onChange: (next: SeoValues) => void
  /** category / subcategory name - used for the auto-generated preview */
  name: string
  /** e.g. "/category/hair-accessories" (leave empty for a new item) */
  path?: string
}) {
  const [open, setOpen] = useState(() => Object.values(value).some((v) => v.trim() !== ''))
  const set = (key: keyof SeoValues) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value })

  const previewTitle = value.meta_title.trim() || `${name || 'Category'} - Buy Online at Best Prices`
  const previewDesc =
    value.meta_description.trim() || `Shop ${name || 'these'} products online at the best prices. Fast home delivery. (auto-generated)`

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Google SEO <span className="text-slate-400 font-normal normal-case">(optional - auto-filled if empty)</span>
        </span>
        <span className="text-xs font-bold text-[var(--color-primary-strong)]">{open ? 'Hide' : 'Edit'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[var(--color-border)] px-4 py-4">
          {/* Google result preview */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Google preview</p>
            <p className="truncate text-[11px] text-emerald-800">
              {SITE_URL}
              {path || '/category/…'}
            </p>
            <p className="truncate text-[15px] leading-snug text-[#1a0dab]">{previewTitle}</p>
            <p className="line-clamp-2 text-[12px] text-slate-600">{previewDesc}</p>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Meta title</label>
              <Counter value={value.meta_title} ideal={60} max={70} />
            </div>
            <input
              value={value.meta_title}
              onChange={set('meta_title')}
              maxLength={255}
              placeholder={`e.g. ${name || 'Hair Accessories'} - Buy Online at Best Prices in Chennai`}
              className={inputCls}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">Meta description</label>
              <Counter value={value.meta_description} ideal={160} max={300} />
            </div>
            <textarea
              rows={2}
              value={value.meta_description}
              onChange={set('meta_description')}
              maxLength={500}
              placeholder="One or two sentences shown under the title in Google. Mention price range, brands, delivery."
              className={`${inputCls} resize-none`}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-700">Keywords</label>
            <input
              value={value.seo_keywords}
              onChange={set('seo_keywords')}
              maxLength={500}
              placeholder="comma separated, e.g. hair clips, hair bands, scrunchies"
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-700">
              SEO text <span className="text-slate-400 font-normal normal-case">(shown below the products on the category page)</span>
            </label>
            <textarea
              rows={5}
              value={value.seo_content}
              onChange={set('seo_content')}
              placeholder="150-300 words about this category: what's in it, popular brands, how to choose, delivery. Leave a blank line between paragraphs."
              className={`${inputCls} resize-y`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
