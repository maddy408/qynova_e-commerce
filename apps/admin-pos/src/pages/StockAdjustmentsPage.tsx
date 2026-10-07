import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import { STOCK_STATUS_LABEL, STOCK_STATUS_TONE, stockStatus } from '../lib/stock'

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
        {(() => {
          const status = stockStatus(item.available, item.low_stock_threshold)
          return status !== 'IN_STOCK' && <Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
        })()}
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
  const [activeTab, setActiveTab] = useState<'OPENING_STOCK' | 'ADJUSTMENTS'>('OPENING_STOCK')

  // Opening Stock state
  const [openingItems, setOpeningItems] = useState<StockItem[]>([])
  const [openingPage, setOpeningPage] = useState(1)
  const [openingTotal, setOpeningTotal] = useState(0)
  const [openingSearch, setOpeningSearch] = useState('')
  const [openingInputs, setOpeningInputs] = useState<Record<number, string>>({})
  const [dirtyVariantIds, setDirtyVariantIds] = useState<Set<number>>(new Set())
  const [savingOpening, setSavingOpening] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<string>('')
  const [openingLoading, setOpeningLoading] = useState(true)

  // Adjustments state
  const [stock, setStock] = useState<StockItem[] | null>(null)
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [search, setSearch] = useState('')
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null)
  const [showReasonModal, setShowReasonModal] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const PAGE_SIZE = 10

  function loadOpeningStock(page: number, searchStr: string) {
    setOpeningLoading(true)
    api.get('/inventory', { params: { page, limit: PAGE_SIZE, search: searchStr || undefined } })
      .then((res) => {
        const items: StockItem[] = res.data.items || []
        setOpeningItems(items)
        setOpeningTotal(res.data.total || 0)
        setOpeningInputs((prev) => {
          const next = { ...prev }
          for (const item of items) {
            if (!(item.variant_id in next)) {
              next[item.variant_id] = String(Number(item.on_hand) || 0)
            }
          }
          return next
        })
      })
      .finally(() => setOpeningLoading(false))
  }

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
    loadOpeningStock(openingPage, openingSearch)
  }, [openingPage, openingSearch])

  useEffect(() => {
    loadStock()
    loadAdjustments()
  }, [])

  function handleOpeningInputChange(variantId: number, val: string) {
    setOpeningInputs((prev) => ({ ...prev, [variantId]: val }))
    setDirtyVariantIds((prev) => {
      const next = new Set(prev)
      next.add(variantId)
      return next
    })
  }

  async function autoSaveOpeningStock(): Promise<boolean> {
    if (dirtyVariantIds.size === 0) return true
    const payload = Array.from(dirtyVariantIds).map((vId) => ({
      variant_id: vId,
      opening_stock: openingInputs[vId] ?? '0',
    }))

    setAutoSaveStatus('Auto-saving unsaved stock in background…')
    try {
      await api.post('/inventory/opening-stock', { items: payload })
      setDirtyVariantIds(new Set())
      setAutoSaveStatus('Auto-saved stock successfully!')
      setTimeout(() => setAutoSaveStatus(''), 3000)
      return true
    } catch (err) {
      setAutoSaveStatus('Auto-save error!')
      return false
    }
  }

  async function handleManualSaveOpening() {
    setSavingOpening(true)
    const success = await autoSaveOpeningStock()
    setSavingOpening(false)
    if (success) {
      loadOpeningStock(openingPage, openingSearch)
    }
  }

  async function handlePageChange(newPage: number) {
    if (newPage === openingPage || newPage < 1) return
    // Auto-save unsaved inputs in background before changing page
    if (dirtyVariantIds.size > 0) {
      await autoSaveOpeningStock()
    }
    setOpeningPage(newPage)
  }

  const totalPages = Math.ceil(openingTotal / PAGE_SIZE) || 1

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
      setCounts((prev) => {
        const next = { ...prev }
        for (const item of changedItems) delete next[item.variant_id]
        return next
      })
      loadStock()
      loadAdjustments()
      loadOpeningStock(openingPage, openingSearch)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save stock adjustment'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Management"
        description="Opening stock manual entry with background auto-save on pagination, and real-time stock adjustments."
      />

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('OPENING_STOCK')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'OPENING_STOCK'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Opening Stock Section
        </button>
        <button
          onClick={() => setActiveTab('ADJUSTMENTS')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'ADJUSTMENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Stock Adjustments &amp; History
        </button>
      </div>

      {activeTab === 'OPENING_STOCK' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Manual Opening Stock Entry</h2>
              <p className="text-xs text-slate-500">
                Type opening stock for items and click Save. Any unsaved edits auto-save in background when you click pagination!
              </p>
            </div>
            <div className="flex items-center gap-3">
              {autoSaveStatus && (
                <span className="text-xs font-semibold text-indigo-600 animate-pulse bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200">
                  {autoSaveStatus}
                </span>
              )}
              {dirtyVariantIds.size > 0 && (
                <Badge tone="amber">{dirtyVariantIds.size} Unsaved Edit(s)</Badge>
              )}
              <TextField
                placeholder="Search item or SKU…"
                value={openingSearch}
                onChange={(e) => {
                  setOpeningSearch(e.target.value)
                  setOpeningPage(1)
                }}
                className="w-56"
              />
              <Button onClick={handleManualSaveOpening} disabled={savingOpening}>
                {savingOpening ? 'Saving Stock…' : 'Save Opening Stock'}
              </Button>
            </div>
          </div>

          <Card>
            {openingLoading ? (
              <Spinner />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Product Title</th>
                      <th className="px-4 py-3 font-semibold">SKU / Barcode</th>
                      <th className="px-4 py-3 font-semibold">Current On-Hand</th>
                      <th className="px-4 py-3 font-semibold">Manual Opening Stock Input</th>
                      <th className="px-4 py-3 font-semibold text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {openingItems.map((item) => {
                      const isDirty = dirtyVariantIds.has(item.variant_id)
                      const currentVal = openingInputs[item.variant_id] ?? String(Number(item.on_hand) || 0)

                      return (
                        <tr key={item.variant_id} className={`hover:bg-slate-50/60 transition-colors ${isDirty ? 'bg-indigo-50/20' : ''}`}>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{item.product_name}</td>
                          <td className="px-4 py-2.5 font-mono text-slate-600">
                            {item.sku} {item.barcode ? `(${item.barcode})` : ''}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-slate-700">{item.on_hand} units</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={currentVal}
                                onChange={(e) => handleOpeningInputChange(item.variant_id, e.target.value)}
                                className={`w-32 rounded-lg border px-3 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                  isDirty ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-300' : 'border-slate-300 bg-white'
                                }`}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {isDirty ? (
                              <Badge tone="amber">Unsaved Edits</Badge>
                            ) : (
                              <Badge tone="green">Saved</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {openingItems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No items match "{openingSearch}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination with Background Auto-Save */}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50/50 text-xs">
              <span className="text-slate-500">
                Page <span className="font-bold text-slate-900">{openingPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span> ({openingTotal} total items)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={openingPage <= 1}
                  onClick={() => handlePageChange(openingPage - 1)}
                >
                  ← Previous
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pNum = i + 1
                  if (totalPages > 5 && openingPage > 3) {
                    pNum = openingPage - 3 + i
                    if (pNum > totalPages) pNum = totalPages - (4 - i)
                  }
                  return (
                    <button
                      key={pNum}
                      onClick={() => handlePageChange(pNum)}
                      className={`h-7 w-7 rounded-lg font-bold text-xs transition-colors ${
                        pNum === openingPage ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {pNum}
                    </button>
                  )
                })}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={openingPage >= totalPages}
                  onClick={() => handlePageChange(openingPage + 1)}
                >
                  Next Pagination →
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'ADJUSTMENTS' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Direct Stepper Stock Adjustment</h2>
            <TextField placeholder="Search product or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          </div>

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
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Recent Adjustment Logs</h2>
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
        </>
      )}

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
