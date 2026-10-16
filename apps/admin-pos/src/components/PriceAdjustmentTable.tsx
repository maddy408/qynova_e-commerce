import { useCallback } from 'react'
import { DataTable, type DataTableColumn } from './ui/DataTable'
import { RowEditable } from './ui/RowEditable'
import { api } from '../lib/api'
import { formatAmount } from '../lib/format'
import { useListQuery } from '../hooks/useListQuery'
import { useListUrlState } from '../hooks/useListUrlState'
import type { PriceVariant } from '../lib/types'

const LIMIT = 20

/**
 * Shared table behind the 3 Price Adjustment pages (Retail/Wholesale/
 * Customer) — Phase 2. Each page owns exactly one tier column, edited
 * one row at a time via RowEditable (PUT /variants/{id}/price), which
 * the backend logs to price_history (G12) instead of the old single
 * "Save All" page that silently rewrote every row's retail_price even
 * when only the wholesale tab was being edited.
 */
export function PriceAdjustmentTable({
  priceType,
  title,
  description,
  columnLabel,
  fieldKey,
}: {
  priceType: 'RETAIL' | 'WHOLESALE' | 'CUSTOMER'
  title: string
  description: string
  columnLabel: string
  fieldKey: 'retail_price' | 'wholesale_price' | 'customer_price'
}) {
  const { search, debouncedSearch, setSearch, page, setPage } = useListUrlState<Record<string, string>>([])

  const fetchVariants = useCallback(async () => {
    const res = await api.get('/products/price-settings', {
      params: { search: debouncedSearch || undefined, page, limit: LIMIT },
    })
    return { rows: res.data.variants as PriceVariant[], total: res.data.total ?? res.data.variants.length }
  }, [debouncedSearch, page])

  const { rows: variants, total, error, reload } = useListQuery(fetchVariants, [debouncedSearch, page])

  async function savePrice(variantId: number, value: string) {
    await api.put(`/variants/${variantId}/price`, { price_type: priceType, value })
    reload()
  }

  const columns: DataTableColumn<PriceVariant>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (v) => (
        <>
          <span className="font-bold text-slate-900 block">{v.product_name}</span>
          <span className="text-[10px] font-mono text-slate-400">({v.sku})</span>
        </>
      ),
    },
    {
      key: 'unit',
      header: 'Unit',
      align: 'center',
      render: (v) => <span className="font-semibold text-slate-600 uppercase">{v.unit_name || 'PCS'}</span>,
    },
    {
      key: 'mrp',
      header: 'MRP (₹)',
      align: 'right',
      render: (v) => <span className="font-medium text-slate-600">{formatAmount(v.mrp)}</span>,
    },
    {
      key: 'normal_price',
      header: 'Base Selling Price (₹)',
      align: 'right',
      render: (v) => <span className="font-medium text-slate-700">{formatAmount(v.normal_price)}</span>,
    },
    {
      key: fieldKey,
      header: columnLabel,
      align: 'right',
      className: 'bg-[var(--color-surface)]/30',
      render: (v) => (
        <RowEditable
          value={String(v[fieldKey] ?? '')}
          displayValue={<span className="font-bold text-slate-900">{formatAmount(v[fieldKey])}</span>}
          onSave={(newValue) => savePrice(v.variant_id, newValue)}
          inputType="number"
          step="0.01"
        />
      ),
    },
  ]

  return (
    <div className="space-y-6 pb-12">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-primary)] text-xl">🏷️</span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">{description}</p>
      </div>

      {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

      <DataTable
        columns={columns}
        rows={variants}
        rowKey={(v) => v.variant_id}
        total={total}
        page={page}
        limit={LIMIT}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search item name / SKU / barcode..."
        emptyMessage="No products found matching your search."
      />
    </div>
  )
}
