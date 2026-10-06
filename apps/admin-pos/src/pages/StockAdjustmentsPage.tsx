import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface StockItem {
  variant_id: number
  product_id: number
  sku: string
  barcode: string | null
  product_name: string
  on_hand: string
  available: string
  low_stock_threshold: string
}

interface AdjustmentItem {
  variant_id: number
  sku: string
  product_name: string
  system_qty: string
  counted_qty: string
  difference_qty: string
}

interface Adjustment {
  id: number
  adjustment_no: string
  reason: string
  created_by_name: string
  created_at: string
  items: AdjustmentItem[]
}

function StepperCard({
  item,
  counted,
  onChange,
}: {
  item: StockItem
  counted: string
  onChange: (value: string) => void
}) {
  const systemQty = Number(item.on_hand)
  const countedQty = Number(counted)
  const diff = countedQty - systemQty
  const changed = counted !== item.on_hand

  function step(delta: number) {
    const next = Math.max(0, (Number.isFinite(countedQty) ? countedQty : systemQty) + delta)
    onChange(String(next))
  }

  return (
    <Card className={`p-4 ${changed ? 'border-indigo-400 ring-1 ring-indigo-200' : ''}`}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{item.product_name}</p>
          <p className="text-xs text-slate-400">{item.sku}</p>
        </div>
        {Number(item.available) <= Number(item.low_stock_threshold) && <Badge tone="amber">Low</Badge>}
      </div>
      <p className="mb-3 text-xs text-slate-500">System qty: {item.on_hand}</p>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          −
        </button>
        <input
          value={counted}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="w-16 rounded-lg border border-slate-300 px-1 py-1.5 text-center text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="button"
          onClick={() => step(1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
        >
          +
        </button>
      </div>

      {changed && (
        <p className={`mt-2 text-center text-xs font-medium ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {diff > 0 ? '+' : ''}
          {diff}
        </p>
      )}
    </Card>
  )
}

export function StockAdjustmentsPage() {
  const [stock, setStock] = useState<StockItem[] | null>(null)
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null)
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function loadStock() {
    api.get('/inventory', { params: { limit: 100 } }).then((res) => {
      const items: StockItem[] = res.data.items
      setStock(items)
      setCounts((prev) => {
        const next = { ...prev }
        for (const item of items) {
          if (!(item.variant_id in next)) next[item.variant_id] = item.on_hand
        }
        return next
      })
    })
  }

  function loadAdjustments() {
    api.get('/inventory/adjustments').then((res) => setAdjustments(res.data.adjustments))
  }

  useEffect(() => {
    loadStock()
    loadAdjustments()
  }, [])

  const filteredStock = useMemo(() => {
    if (!stock) return []
    const q = search.trim().toLowerCase()
    if (q === '') return stock
    return stock.filter((i) => i.product_name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
  }, [stock, search])

  const changedItems = useMemo(() => {
    if (!stock) return []
    return stock.filter((i) => counts[i.variant_id] !== undefined && counts[i.variant_id] !== i.on_hand && counts[i.variant_id].trim() !== '')
  }, [stock, counts])

  function updateCount(variantId: number, value: string) {
    setCounts((prev) => ({ ...prev, [variantId]: value }))
  }

  function discardChanges() {
    if (!stock) return
    const reset: Record<number, string> = {}
    for (const item of stock) reset[item.variant_id] = item.on_hand
    setCounts(reset)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (reason.trim() === '' || changedItems.length === 0) {
      setError('Reason and at least one changed item are required')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/inventory/adjustments', {
        reason,
        items: changedItems.map((i) => ({ variant_id: i.variant_id, counted_qty: counts[i.variant_id] })),
      })
      setShowReasonModal(false)
      setReason('')
      // Clear the counted value for each submitted item so it re-syncs
      // from the fresh on_hand loadStock() is about to fetch — otherwise
      // it would keep comparing against the stale value the user typed
      // (e.g. "48" vs. the server's "48.000") and stay stuck "changed".
      setCounts((prev) => {
        const next = { ...prev }
        for (const item of changedItems) delete next[item.variant_id]
        return next
      })
      loadStock()
      loadAdjustments()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save stock adjustment'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        description="Adjust any item's count directly — only changed items get submitted. product_id is always resolved server-side."
        actions={
          <TextField placeholder="Search product or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        }
      />

      {stock === null ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredStock.map((item) => (
              <StepperCard
                key={item.variant_id}
                item={item}
                counted={counts[item.variant_id] ?? item.on_hand}
                onChange={(value) => updateCount(item.variant_id, value)}
              />
            ))}
            {filteredStock.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-slate-500">No products match "{search}".</p>
            )}
          </div>

          {changedItems.length > 0 && (
            <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between rounded-xl border border-indigo-200 bg-white p-4 shadow-lg">
              <p className="text-sm text-slate-700">
                <span className="font-medium text-indigo-700">{changedItems.length}</span> item(s) changed
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={discardChanges}>
                  Discard
                </Button>
                <Button onClick={() => setShowReasonModal(true)}>Stock Adjustment</Button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent Adjustments</h2>
        {adjustments === null ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            {adjustments.map((adj) => (
              <Card key={adj.id} className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900">{adj.adjustment_no}</p>
                    <p className="text-xs text-slate-500">
                      {adj.reason} · {adj.created_by_name} · {new Date(adj.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="py-1 font-medium">Product</th>
                      <th className="py-1 font-medium">System Qty</th>
                      <th className="py-1 font-medium">Counted Qty</th>
                      <th className="py-1 font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adj.items.map((item) => (
                      <tr key={item.variant_id}>
                        <td className="py-1 text-slate-700">
                          {item.product_name} <span className="text-xs text-slate-400">({item.sku})</span>
                        </td>
                        <td className="py-1 text-slate-600">{item.system_qty}</td>
                        <td className="py-1 text-slate-600">{item.counted_qty}</td>
                        <td className={`py-1 font-medium ${Number(item.difference_qty) < 0 ? 'text-red-600' : Number(item.difference_qty) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {Number(item.difference_qty) > 0 ? '+' : ''}
                          {item.difference_qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
            {adjustments.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No stock adjustments yet.</Card>}
          </div>
        )}
      </div>

      {showReasonModal && (
        <Modal title="Stock Adjustment" onClose={() => setShowReasonModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Reason" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly stock count" />

            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">System</th>
                    <th className="px-3 py-2 font-medium">Counted</th>
                    <th className="px-3 py-2 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {changedItems.map((item) => {
                    const diff = Number(counts[item.variant_id]) - Number(item.on_hand)
                    return (
                      <tr key={item.variant_id}>
                        <td className="px-3 py-1.5 text-slate-700">{item.product_name}</td>
                        <td className="px-3 py-1.5 text-slate-600">{item.on_hand}</td>
                        <td className="px-3 py-1.5 text-slate-600">{counts[item.variant_id]}</td>
                        <td className={`px-3 py-1.5 font-medium ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {diff > 0 ? '+' : ''}
                          {diff}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowReasonModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Confirm Adjustment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
