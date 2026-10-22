import { useEffect, useState } from 'react'
import { Alert, Button, Spinner, TextField } from './ui'
import { api, apiErrorMessage } from '../lib/api'

interface MappingProduct {
  id: number
  name: string
  product_code: string | null
  returnable: number
  return_window_days: number | null
  brand_name: string | null
}

/**
 * Admin "Return Mapping" tool — the returnable flag/window on a product
 * IS the mapping (no separate mapping table), so this is just a bulk
 * search/filter/edit UI over `products.returnable` /
 * `products.return_window_days` via ReturnsController::mappingProducts()
 * / updateMapping(). Lives inside ReturnsPage.tsx as a sibling top-level
 * view to the existing return-requests table (see `mainView` there).
 */
export function ReturnMappingPanel() {
  const [items, setItems] = useState<MappingProduct[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [returnableFilter, setReturnableFilter] = useState<'' | '1' | '0'>('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkWindowDays, setBulkWindowDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [rowSaving, setRowSaving] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/returns/mapping/products', {
        params: { search: search || undefined, returnable: returnableFilter || undefined, page, limit },
      })
      setItems(res.data?.items || [])
      setTotal(res.data?.total || 0)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load products'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, returnableFilter, page])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? items.map((i) => i.id) : [])
  }

  async function applyBulk(action: 'enable' | 'disable' | 'clear_window' | 'set_window') {
    if (selectedIds.length === 0) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const body: Record<string, unknown> = { product_ids: selectedIds }
      if (action === 'enable') body.returnable = true
      if (action === 'disable') body.returnable = false
      if (action === 'clear_window') body.clear_window = true
      if (action === 'set_window') {
        if (!bulkWindowDays.trim()) {
          setError('Enter a window (days) first')
          setBusy(false)
          return
        }
        body.return_window_days = Number(bulkWindowDays)
      }
      const res = await api.patch('/returns/mapping', body)
      setSuccess(`Updated ${res.data?.updated ?? selectedIds.length} product(s)`)
      setSelectedIds([])
      setBulkWindowDays('')
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Bulk update failed'))
    } finally {
      setBusy(false)
    }
  }

  async function toggleRowReturnable(product: MappingProduct) {
    setRowSaving(product.id)
    setError('')
    try {
      await api.patch('/returns/mapping', { product_ids: [product.id], returnable: !product.returnable })
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update product'))
    } finally {
      setRowSaving(null)
    }
  }

  async function saveRowWindow(product: MappingProduct, value: string) {
    setRowSaving(product.id)
    setError('')
    try {
      if (value.trim() === '') {
        await api.patch('/returns/mapping', { product_ids: [product.id], clear_window: true })
      } else {
        await api.patch('/returns/mapping', { product_ids: [product.id], return_window_days: Number(value) })
      }
      await load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update return window'))
    } finally {
      setRowSaving(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-4">
      {error && <Alert tone="red" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert tone="green" onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ================= SEARCH & FILTER ================= */}
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs">
        <div className="flex-1 min-w-[220px]">
          <TextField
            label="Search Products"
            value={search}
            onChange={(e) => {
              setPage(1)
              setSearch(e.target.value)
            }}
            placeholder="Search by name or product code..."
          />
        </div>
        <label className="block text-xs">
          <span className="mb-1 block font-bold text-slate-800 uppercase tracking-wider text-[11px]">Returnable Status</span>
          <select
            value={returnableFilter}
            onChange={(e) => {
              setPage(1)
              setReturnableFilter(e.target.value as '' | '1' | '0')
            }}
            className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-[#6366f1] shadow-2xs transition-all"
          >
            <option value="">All</option>
            <option value="1">Returnable</option>
            <option value="0">Not Returnable</option>
          </select>
        </label>
      </div>

      {/* ================= BULK ACTION BAR ================= */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 bg-[#f0efff] border border-[#c7c2ff] rounded-2xl p-3.5">
          <span className="text-xs font-bold text-[#4f46e5]">{selectedIds.length} selected</span>
          <Button size="sm" disabled={busy} onClick={() => applyBulk('enable')}>
            Enable Returns
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => applyBulk('disable')}>
            Disable Returns
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => applyBulk('clear_window')}>
            Cancel Window (use default)
          </Button>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              value={bulkWindowDays}
              onChange={(e) => setBulkWindowDays(e.target.value)}
              placeholder="Days"
              className="w-20 rounded-xl border border-[#c7c2ff] bg-white px-2.5 py-1.5 text-xs font-semibold"
            />
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => applyBulk('set_window')}>
              Set Window
            </Button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="ml-auto text-xs font-semibold text-[#4f46e5] hover:underline cursor-pointer"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* ================= TABLE ================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 font-semibold">No products found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === items.length}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                    />
                  </th>
                  <th className="py-3 px-2">Product</th>
                  <th className="py-3 px-2">Code</th>
                  <th className="py-3 px-2">Brand</th>
                  <th className="py-3 px-2">Returnable</th>
                  <th className="py-3 px-2">Window (Days)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="py-2.5 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                      />
                    </td>
                    <td className="py-2.5 px-2 font-semibold text-slate-800">{p.name}</td>
                    <td className="py-2.5 px-2 font-mono text-slate-500">{p.product_code || '—'}</td>
                    <td className="py-2.5 px-2 text-slate-600">{p.brand_name || '—'}</td>
                    <td className="py-2.5 px-2">
                      <button
                        type="button"
                        disabled={rowSaving === p.id}
                        onClick={() => toggleRowReturnable(p)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-50 ${
                          p.returnable
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {p.returnable ? 'Returnable' : 'Not Returnable'}
                      </button>
                    </td>
                    <td className="py-2.5 px-2">
                      <input
                        type="number"
                        min={0}
                        disabled={rowSaving === p.id}
                        defaultValue={p.return_window_days ?? ''}
                        onBlur={(e) => {
                          if (e.target.value !== String(p.return_window_days ?? '')) {
                            saveRowWindow(p, e.target.value)
                          }
                        }}
                        placeholder="Default (7)"
                        className="w-24 rounded-lg border border-slate-200 p-1.5 text-xs disabled:opacity-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ================= PAGINATION ================= */}
        {!loading && items.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500 font-semibold">
            <span>
              Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
