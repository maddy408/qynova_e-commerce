import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Badge, Button, Modal, Spinner, TextField } from '../components/ui'
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

export function StockAdjustmentsPage({ defaultTab }: { defaultTab?: 'OPENING_STOCK' | 'ADJUSTMENTS' | 'LOGS' } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')

  const initialMainTab: 'OPENING_STOCK' | 'ADJUSTMENTS' =
    defaultTab === 'OPENING_STOCK' || tabParam === 'opening' || tabParam === 'opening-stock'
      ? 'OPENING_STOCK'
      : defaultTab === 'LOGS' || defaultTab === 'ADJUSTMENTS' || tabParam === 'logs' || tabParam === 'recent-logs' || tabParam === 'adjustments' || tabParam === 'history'
      ? 'ADJUSTMENTS'
      : 'OPENING_STOCK'

  const initialSubView: 'ADJUSTMENTS' | 'LOGS' =
    defaultTab === 'LOGS' || tabParam === 'logs' || tabParam === 'recent-logs'
      ? 'LOGS'
      : 'ADJUSTMENTS'

  const [mainTab, setMainTab] = useState<'OPENING_STOCK' | 'ADJUSTMENTS'>(initialMainTab)
  const [subView, setSubView] = useState<'ADJUSTMENTS' | 'LOGS'>(initialSubView)

  useEffect(() => {
    if (tabParam === 'logs' || tabParam === 'recent-logs') {
      setMainTab('ADJUSTMENTS')
      setSubView('LOGS')
    } else if (tabParam === 'adjustments' || tabParam === 'history') {
      setMainTab('ADJUSTMENTS')
      setSubView('ADJUSTMENTS')
    } else if (tabParam === 'opening' || tabParam === 'opening-stock') {
      setMainTab('OPENING_STOCK')
    }
  }, [tabParam])

  function handleMainTabChange(tab: 'OPENING_STOCK' | 'ADJUSTMENTS') {
    setMainTab(tab)
    if (tab === 'OPENING_STOCK') {
      setSearchParams({ tab: 'opening' }, { replace: true })
    } else {
      setSearchParams({ tab: subView === 'LOGS' ? 'logs' : 'adjustments' }, { replace: true })
    }
  }

  function handleSubViewChange(view: 'ADJUSTMENTS' | 'LOGS') {
    setSubView(view)
    setSearchParams({ tab: view === 'LOGS' ? 'logs' : 'adjustments' }, { replace: true })
  }

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
  const [logSearch, setLogSearch] = useState('')
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

  const filteredAdjustments = useMemo(() => {
    if (!adjustments) return []
    const q = logSearch.trim().toLowerCase()
    if (q === '') return adjustments
    return adjustments.filter((adj) => {
      const matchNo = adj.adjustment_no?.toLowerCase().includes(q)
      const matchReason = adj.reason?.toLowerCase().includes(q)
      const matchUser = adj.created_by_name?.toLowerCase().includes(q)
      const matchItem = adj.items?.some(
        (it) => it.product_name?.toLowerCase().includes(q) || it.sku?.toLowerCase().includes(q)
      )
      return Boolean(matchNo || matchReason || matchUser || matchItem)
    })
  }, [adjustments, logSearch])

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
    <div className="space-y-6 pb-12">
      {/* ── Main Section Tab Navigation ── */}
      <div className="inline-flex items-center gap-1 bg-white border border-[#F2E5E7] p-1 rounded-full shadow-sm">
        <button
          onClick={() => handleMainTabChange('OPENING_STOCK')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
            mainTab === 'OPENING_STOCK'
              ? 'bg-[#7B3F4A] text-white shadow-sm'
              : 'text-[#804652]/70 hover:bg-[#FAF2F4] hover:text-[#804652]'
          }`}
        >
          📦 Opening Stock
        </button>
        <button
          onClick={() => handleMainTabChange('ADJUSTMENTS')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
            mainTab === 'ADJUSTMENTS'
              ? 'bg-[#7B3F4A] text-white shadow-sm'
              : 'text-[#804652]/70 hover:bg-[#FAF2F4] hover:text-[#804652]'
          }`}
        >
          🔧 Adjustments &amp; History
        </button>
      </div>

      {mainTab === 'OPENING_STOCK' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">Manual Opening Stock Entry</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter opening stock quantities and click Save. Unsaved edits auto-save when paginating.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {autoSaveStatus && (
                <span className="text-xs font-semibold text-[#804652] animate-pulse bg-[#FAF2F4] px-2.5 py-1 rounded-full border border-[#EEDDE0]">
                  {autoSaveStatus}
                </span>
              )}
              {dirtyVariantIds.size > 0 && (
                <Badge tone="amber">{dirtyVariantIds.size} Unsaved Edit(s)</Badge>
              )}
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                <input
                  type="text"
                  placeholder="Search item or SKU…"
                  value={openingSearch}
                  onChange={(e) => { setOpeningSearch(e.target.value); setOpeningPage(1) }}
                  className="pl-9 pr-4 py-2 rounded-full border border-[#EEDDE0] bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#804652]/30 w-52"
                />
              </div>
              <button
                onClick={handleManualSaveOpening}
                disabled={savingOpening}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#7B3F4A] hover:bg-[#6a3340] text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {savingOpening ? 'Saving Stock…' : 'Save Opening Stock'}
              </button>
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm overflow-hidden">
            {openingLoading ? (
              <div className="p-12 text-center"><Spinner /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#F2E5E7] bg-[#FAF2F4]">
                      <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Product Title</th>
                      <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">SKU / Barcode</th>
                      <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Current On-Hand</th>
                      <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Manual Opening Stock Input</th>
                      <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652] text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2E5E7]">
                    {openingItems.map((item) => {
                      const isDirty = dirtyVariantIds.has(item.variant_id)
                      const currentVal = openingInputs[item.variant_id] ?? String(Number(item.on_hand) || 0)

                      return (
                        <tr key={item.variant_id} className={`hover:bg-[#FAF2F4]/60 transition-colors ${isDirty ? 'bg-[#FAF2F4]/40' : ''}`}>
                          <td className="px-6 py-3 font-semibold text-slate-900">{item.product_name}</td>
                          <td className="px-6 py-3 font-mono text-slate-600">
                            {item.sku} {item.barcode ? `(${item.barcode})` : ''}
                          </td>
                          <td className="px-6 py-3 font-bold text-slate-700">{item.on_hand} units</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={currentVal}
                                onChange={(e) => handleOpeningInputChange(item.variant_id, e.target.value)}
                                className={`w-32 rounded-full border px-3 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#804652]/30 ${
                                  isDirty ? 'border-[#804652] bg-[#FAF2F4] ring-1 ring-[#EEDDE0]' : 'border-[#EEDDE0] bg-white'
                                }`}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
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
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          No items match "{openingSearch}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination with Background Auto-Save */}
            <div className="flex items-center justify-between border-t border-[#F2E5E7] px-6 py-3 bg-[#FAF2F4]/50 text-xs">
              <span className="text-stone-500">
                Page <span className="font-bold text-stone-900">{openingPage}</span> of <span className="font-bold text-stone-900">{totalPages}</span> ({openingTotal} total items)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={openingPage <= 1}
                  onClick={() => handlePageChange(openingPage - 1)}
                  className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors text-xs"
                >
                  ← Previous
                </button>
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
                      className={`h-7 w-7 rounded-full font-bold text-xs transition-colors ${
                        pNum === openingPage ? 'bg-[#7B3F4A] text-white' : 'bg-white border border-[#EEDDE0] text-slate-700 hover:bg-[#FAF2F4]'
                      }`}
                    >
                      {pNum}
                    </button>
                  )
                })}
                <button
                  disabled={openingPage >= totalPages}
                  onClick={() => handlePageChange(openingPage + 1)}
                  className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors text-xs"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {mainTab === 'ADJUSTMENTS' && (
        <div className="space-y-4">
          {/* Sub-view Switcher */}
          <div className="inline-flex items-center gap-0.5 bg-white border border-[#F2E5E7] p-0.5 rounded-full shadow-sm">
            <button
              type="button"
              onClick={() => handleSubViewChange('ADJUSTMENTS')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                subView === 'ADJUSTMENTS'
                  ? 'bg-[#7B3F4A] text-white shadow-sm'
                  : 'text-[#804652]/70 hover:bg-[#FAF2F4] hover:text-[#804652]'
              }`}
            >
              Stock Adjustment &amp; History
            </button>
            <button
              type="button"
              onClick={() => handleSubViewChange('LOGS')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${
                subView === 'LOGS'
                  ? 'bg-[#7B3F4A] text-white shadow-sm'
                  : 'text-[#804652]/70 hover:bg-[#FAF2F4] hover:text-[#804652]'
              }`}
            >
              Recent Adjustment Logs
            </button>
          </div>

          {subView === 'ADJUSTMENTS' && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-serif font-bold text-slate-900">Stock Adjustment &amp; Count</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Adjust quantities with steppers or direct entry, then confirm to record an audit trail.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {changedItems.length > 0 && (
                    <Badge tone="amber">{changedItems.length} Changed Item(s)</Badge>
                  )}
                  {changedItems.length > 0 && (
                    <button type="button" onClick={discardChanges} className="px-3.5 py-1.5 rounded-full border border-[#EEDDE0] bg-white text-xs font-medium text-slate-700 hover:bg-[#FAF2F4] transition-colors">
                      Discard
                    </button>
                  )}
                  <div className="relative">
                    <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    <input
                      type="text"
                      placeholder="Search product or SKU…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-full border border-[#EEDDE0] bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#804652]/30 w-72 sm:w-80"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm overflow-hidden">
                {stock === null ? (
                  <div className="p-12 text-center"><Spinner /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#F2E5E7] bg-[#FAF2F4]">
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Product Title</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">SKU / Barcode</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Current On-Hand</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Counted Qty</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652] text-center">Difference</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652] text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2E5E7]">
                        {filteredStock.map((item) => {
                          const counted = counts[item.variant_id] ?? item.on_hand
                          const systemQty = Number(item.on_hand)
                          const countedQty = Number(counted)
                          const diff = (Number.isFinite(countedQty) ? countedQty : systemQty) - systemQty
                          const isChanged = counts[item.variant_id] !== undefined && counts[item.variant_id] !== item.on_hand && counts[item.variant_id].trim() !== ''
                          const status = stockStatus(item.available, item.low_stock_threshold)

                          function step(delta: number) {
                            const cur = Number.isFinite(countedQty) ? countedQty : systemQty
                            const next = Math.max(0, cur + delta)
                            updateCount(item.variant_id, String(next))
                          }

                          return (
                            <tr
                              key={item.variant_id}
                              className={`hover:bg-[#FAF2F4]/60 transition-colors ${
                                isChanged ? 'bg-[#FAF2F4]/40' : ''
                              }`}
                            >
                              <td className="px-6 py-3 font-semibold text-slate-900">{item.product_name}</td>
                              <td className="px-6 py-3 font-mono text-slate-600">
                                {item.sku} {item.barcode ? `(${item.barcode})` : ''}
                              </td>
                              <td className="px-6 py-3 font-bold text-slate-700">{item.on_hand} units</td>
                              <td className="px-6 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => step(-1)}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#EEDDE0] bg-[#FAF2F4] text-[#804652] hover:bg-[#F2E5E7] font-bold text-xs"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={counted}
                                    onChange={(e) => updateCount(item.variant_id, e.target.value)}
                                    className={`w-20 rounded-full border px-2 py-1 text-center text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#804652]/30 ${
                                      isChanged
                                        ? 'border-[#804652] bg-[#FAF2F4] ring-1 ring-[#EEDDE0]'
                                        : 'border-[#EEDDE0] bg-white'
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => step(1)}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#EEDDE0] bg-[#FAF2F4] text-[#804652] hover:bg-[#F2E5E7] font-bold text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-center font-bold text-xs">
                                {isChanged ? (
                                  <span className={diff > 0 ? 'text-emerald-600' : 'text-red-600'}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                ) : (
                                  <span className="text-stone-400">0</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {isChanged ? (
                                  <Badge tone="amber">Changed</Badge>
                                ) : status !== 'IN_STOCK' ? (
                                  <Badge tone={STOCK_STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>
                                ) : (
                                  <Badge tone="green">In Stock</Badge>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {filteredStock.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                              No products match "{search}".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {changedItems.length > 0 && (
                <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between rounded-3xl border border-[#F2E5E7] bg-white p-4 shadow-lg">
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-[#804652]">{changedItems.length}</span> item(s) changed
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={discardChanges} className="px-3.5 py-1.5 rounded-full border border-[#EEDDE0] bg-white text-xs font-medium text-slate-700 hover:bg-[#FAF2F4] transition-colors">
                      Discard
                    </button>
                    <button type="button" onClick={() => setShowReasonModal(true)} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#7B3F4A] hover:bg-[#6a3340] text-white text-xs font-semibold transition-colors">Stock Adjustment</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {subView === 'LOGS' && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-xl font-serif font-bold text-slate-900">Recent Adjustment Logs</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Audit trail of stock adjustments, counted quantities, and inventory variances.
                  </p>
                </div>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                  <input
                    type="text"
                    placeholder="Search by adjustment #, reason, product…"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 rounded-full border border-[#EEDDE0] bg-white text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#804652]/30 w-80 sm:w-96"
                  />
                </div>
              </div>

              <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm overflow-hidden">
                {adjustments === null ? (
                  <div className="p-12 text-center"><Spinner /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#F2E5E7] bg-[#FAF2F4]">
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Adjustment #</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Date &amp; Time</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Reason</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Adjusted By</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652]">Product</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652] text-right">System Qty</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652] text-right">Counted Qty</th>
                          <th className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-[#804652] text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2E5E7]">
                        {filteredAdjustments.map((adj) => {
                          if (!adj.items || adj.items.length === 0) {
                            return (
                              <tr key={adj.id} className="hover:bg-[#FAF2F4]/60 transition-colors">
                                <td className="px-6 py-3 font-mono font-semibold text-slate-900">{adj.adjustment_no}</td>
                                <td className="px-6 py-3 text-slate-500 whitespace-nowrap">{new Date(adj.created_at).toLocaleString()}</td>
                                <td className="px-6 py-3 text-slate-700 font-medium">
                                  <span className="inline-block rounded-full bg-[#FAF2F4] px-2 py-0.5 text-xs text-[#804652] font-medium border border-[#EEDDE0]">
                                    {adj.reason}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{adj.created_by_name}</td>
                                <td colSpan={4} className="px-6 py-3 text-slate-400">No items recorded</td>
                              </tr>
                            )
                          }

                          return adj.items.map((item, itemIdx) => (
                            <tr
                              key={`${adj.id}-${item.variant_id}-${itemIdx}`}
                              className={`hover:bg-[#FAF2F4]/60 transition-colors ${itemIdx > 0 ? 'bg-[#FAF2F4]/20' : ''}`}
                            >
                              {itemIdx === 0 && (
                                <>
                                  <td
                                    rowSpan={adj.items.length}
                                    className="px-6 py-3 font-mono font-semibold text-slate-900 align-top border-b border-[#F2E5E7]"
                                  >
                                    {adj.adjustment_no}
                                  </td>
                                  <td
                                    rowSpan={adj.items.length}
                                    className="px-6 py-3 text-slate-500 align-top border-b border-[#F2E5E7] whitespace-nowrap"
                                  >
                                    {new Date(adj.created_at).toLocaleString()}
                                  </td>
                                  <td
                                    rowSpan={adj.items.length}
                                    className="px-6 py-3 text-slate-700 font-medium align-top border-b border-[#F2E5E7]"
                                  >
                                    <span className="inline-block rounded-full bg-[#FAF2F4] px-2 py-0.5 text-xs text-[#804652] font-medium border border-[#EEDDE0]">
                                      {adj.reason}
                                    </span>
                                  </td>
                                  <td
                                    rowSpan={adj.items.length}
                                    className="px-6 py-3 text-slate-600 align-top border-b border-[#F2E5E7] whitespace-nowrap"
                                  >
                                    {adj.created_by_name}
                                  </td>
                                </>
                              )}
                              <td className="px-6 py-3 text-slate-900 font-medium">
                                <div>{item.product_name}</div>
                                <div className="font-mono text-[11px] text-slate-400">{item.sku}</div>
                              </td>
                              <td className="px-6 py-3 text-slate-600 text-right font-medium">{item.system_qty}</td>
                              <td className="px-6 py-3 text-slate-900 text-right font-bold">{item.counted_qty}</td>
                              <td className="px-4 py-2.5 text-right font-bold">
                                <span
                                  className={
                                    Number(item.difference_qty) < 0
                                      ? 'text-red-600'
                                      : Number(item.difference_qty) > 0
                                      ? 'text-emerald-600'
                                      : 'text-stone-500'
                                  }
                                >
                                  {Number(item.difference_qty) > 0 ? '+' : ''}
                                  {item.difference_qty}
                                </span>
                              </td>
                            </tr>
                          ))
                        })}
                        {filteredAdjustments.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                              {logSearch ? `No adjustment logs match "${logSearch}".` : 'No stock adjustments yet.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showReasonModal && (
        <Modal title="Stock Adjustment" onClose={() => setShowReasonModal(false)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Reason" required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly stock count" />

            <div className="max-h-48 overflow-y-auto rounded-2xl border border-[#F2E5E7]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#F2E5E7] text-xs uppercase text-[#804652] bg-[#FAF2F4]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">System</th>
                    <th className="px-3 py-2 font-medium">Counted</th>
                    <th className="px-3 py-2 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2E5E7]">
                  {changedItems.map((item) => {
                    const diff = Number(counts[item.variant_id]) - Number(item.on_hand)
                    return (
                      <tr key={item.variant_id}>
                        <td className="px-3 py-1.5 text-stone-700">{item.product_name}</td>
                        <td className="px-3 py-1.5 text-stone-600">{item.on_hand}</td>
                        <td className="px-3 py-1.5 text-stone-600">{counts[item.variant_id]}</td>
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
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#7B3F4A] hover:bg-[#6a3340] text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {submitting ? 'Saving…' : 'Confirm Adjustment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
