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
  mrp?: string | null
  retail_price?: string | null
  wholesale_price?: string | null
  batch_id?: number | null
  batch_no?: string | null
  manufacturing_date?: string | null
  expiry_date?: string | null
  batch_selling_price?: string | null
  batch_mrp?: string | null
}

interface InlineOpeningRow {
  batch_id: number | null
  batch_no: string
  quantity: string
  selling_price: string
  mrp: string
  manufacturing_date: string
  expiry_date: string
}

interface InventoryBatch {
  id: number
  variant_id: number
  batch_no: string
  supplier_id?: number | null
  purchase_id?: number | null
  purchase_date?: string | null
  manufacturing_date: string | null
  expiry_date: string | null
  cost_price: string
  selling_price: string
  mrp: string
  quantity: string
  available_quantity: string
  status: 'ACTIVE' | 'EXPIRED' | 'DEPLETED' | 'INACTIVE'
  created_at: string
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
  const [openingRowData, setOpeningRowData] = useState<Record<number, InlineOpeningRow>>({})
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
        setOpeningRowData((prev) => {
          const next = { ...prev }
          for (const item of items) {
            if (!(item.variant_id in next)) {
              next[item.variant_id] = {
                batch_id: item.batch_id ?? null,
                batch_no: item.batch_no || 'OPENING-001',
                quantity: String(Number(item.on_hand) || 0),
                selling_price: item.batch_selling_price ? String(Number(item.batch_selling_price)) : (item.retail_price ? String(Number(item.retail_price)) : ''),
                mrp: item.batch_mrp ? String(Number(item.batch_mrp)) : (item.mrp ? String(Number(item.mrp)) : ''),
                manufacturing_date: item.manufacturing_date || '',
                expiry_date: item.expiry_date || '',
              }
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

  // Single-item save & feedback state
  const [savingVariantId, setSavingVariantId] = useState<number | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; tone: 'green' | 'amber' | 'red' } | null>(null)

  function showFeedback(text: string, tone: 'green' | 'amber' | 'red' = 'green') {
    setFeedbackMessage({ text, tone })
    setTimeout(() => {
      setFeedbackMessage((curr) => curr?.text === text ? null : curr)
    }, 4000)
  }

  // Edit details modal state
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)
  const [batchList, setBatchList] = useState<InventoryBatch[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [batchForm, setBatchForm] = useState({
    batch_id: null as number | null,
    batch_no: '',
    quantity: '',
    selling_price: '',
    mrp: '',
    manufacturing_date: '',
    expiry_date: '',
  })
  const [batchDateError, setBatchDateError] = useState('')
  const [savingBatchModal, setSavingBatchModal] = useState(false)
  const [batchActionFeedback, setBatchActionFeedback] = useState<{ text: string; tone: 'green' | 'red' } | null>(null)

  // Reset / Delete stock confirmation state
  const [itemToReset, setItemToReset] = useState<StockItem | null>(null)
  const [resettingStock, setResettingStock] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState<InventoryBatch | null>(null)
  const [deletingBatch, setDeletingBatch] = useState(false)

  function handleInlineRowChange(variantId: number, field: keyof InlineOpeningRow, val: string) {
    setOpeningRowData((prev) => {
      const existing = prev[variantId] || {
        batch_id: null,
        batch_no: 'OPENING-001',
        quantity: '0',
        selling_price: '',
        mrp: '',
        manufacturing_date: '',
        expiry_date: '',
      }
      return {
        ...prev,
        [variantId]: {
          ...existing,
          [field]: val,
        },
      }
    })
    if (field === 'quantity') {
      setOpeningInputs((prev) => ({ ...prev, [variantId]: val }))
    }
    setDirtyVariantIds((prev) => {
      const next = new Set(prev)
      next.add(variantId)
      return next
    })
  }

  function validateDates(mfg: string, exp: string): string {
    if (mfg && exp && exp < mfg) {
      return 'Expiry Date must not be earlier than Manufacturing Date.'
    }
    return ''
  }

  function validateInlineRow(row: InlineOpeningRow): string | null {
    const qty = Number(row.quantity)
    if (row.quantity === '' || isNaN(qty) || qty < 0) {
      return 'Please enter a valid non-negative opening quantity.'
    }
    if (row.selling_price !== '') {
      const p = Number(row.selling_price)
      if (isNaN(p) || p < 0) return 'Price must be a valid non-negative number.'
    }
    if (row.mrp !== '') {
      const m = Number(row.mrp)
      if (isNaN(m) || m < 0) return 'MRP must be a valid non-negative number.'
    }
    const dateErr = validateDates(row.manufacturing_date, row.expiry_date)
    if (dateErr) return dateErr
    return null
  }

  async function handleSaveSingle(variantId: number, productTitle?: string): Promise<boolean> {
    const row = openingRowData[variantId]
    if (!row) return false

    const err = validateInlineRow(row)
    if (err) {
      showFeedback(err, 'red')
      return false
    }

    setSavingVariantId(variantId)
    try {
      const payload = {
        batch_id: row.batch_id,
        batch_no: row.batch_no || 'OPENING-001',
        quantity: Number(row.quantity) || 0,
        selling_price: Number(row.selling_price) || 0,
        mrp: Number(row.mrp) || 0,
        manufacturing_date: row.manufacturing_date || null,
        expiry_date: row.expiry_date || null,
      }

      const res = await api.post(`/inventory/${variantId}/batches`, payload)
      const newOnHand = res.data.on_hand

      setDirtyVariantIds((prev) => {
        const next = new Set(prev)
        next.delete(variantId)
        return next
      })
      showFeedback(`Opening stock for ${productTitle || 'item'} saved successfully (${newOnHand} units)!`, 'green')
      setOpeningItems((prev) =>
        prev.map((it) => it.variant_id === variantId ? { ...it, on_hand: String(newOnHand) } : it)
      )
      if (res.data.batch?.id) {
        setOpeningRowData((prev) => ({
          ...prev,
          [variantId]: {
            ...prev[variantId],
            batch_id: res.data.batch.id,
          },
        }))
      }
      return true
    } catch (err) {
      showFeedback(apiErrorMessage(err, 'Failed to save opening stock'), 'red')
      return false
    } finally {
      setSavingVariantId(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, variantId: number, productTitle: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      handleSaveSingle(variantId, productTitle)
    }
  }

  function handleBatchFormChange(field: string, value: string) {
    setBatchForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'manufacturing_date' || field === 'expiry_date') {
        const mfg = field === 'manufacturing_date' ? value : next.manufacturing_date
        const exp = field === 'expiry_date' ? value : next.expiry_date
        setBatchDateError(validateDates(mfg, exp))
      }
      return next
    })
  }

  function openEditPopup(item: StockItem) {
    setEditingItem(item)
    setBatchActionFeedback(null)
    setBatchDateError('')
    setLoadingBatches(true)
    const currentRow = openingRowData[item.variant_id]
    api.get(`/inventory/${item.variant_id}/batches`)
      .then((res) => {
        const list: InventoryBatch[] = res.data.batches || []
        setBatchList(list)
        if (list.length > 0) {
          const active = list.find((b) => b.status === 'ACTIVE') || list[0]
          setBatchForm({
            batch_id: active.id,
            batch_no: currentRow?.batch_no || active.batch_no || '',
            quantity: currentRow?.quantity || String(Number(active.quantity) || 0),
            selling_price: currentRow?.selling_price !== undefined && currentRow.selling_price !== ''
              ? currentRow.selling_price
              : (active.selling_price ? String(Number(active.selling_price)) : (item.retail_price ? String(Number(item.retail_price)) : '')),
            mrp: currentRow?.mrp !== undefined && currentRow.mrp !== ''
              ? currentRow.mrp
              : (active.mrp ? String(Number(active.mrp)) : (item.mrp ? String(Number(item.mrp)) : '')),
            manufacturing_date: currentRow?.manufacturing_date ?? (active.manufacturing_date || ''),
            expiry_date: currentRow?.expiry_date ?? (active.expiry_date || ''),
          })
        } else {
          setBatchForm({
            batch_id: currentRow?.batch_id ?? null,
            batch_no: currentRow?.batch_no || 'OPENING-001',
            quantity: currentRow?.quantity ?? (openingInputs[item.variant_id] ?? String(Number(item.on_hand) || 0)),
            selling_price: currentRow?.selling_price ?? (item.retail_price ? String(Number(item.retail_price)) : ''),
            mrp: currentRow?.mrp ?? (item.mrp ? String(Number(item.mrp)) : ''),
            manufacturing_date: currentRow?.manufacturing_date ?? '',
            expiry_date: currentRow?.expiry_date ?? '',
          })
        }
      })
      .catch((err) => {
        setBatchActionFeedback({ text: apiErrorMessage(err, 'Failed to load batches'), tone: 'red' })
      })
      .finally(() => setLoadingBatches(false))
  }

  async function handleSaveBatchDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!editingItem) return

    const dateErr = validateDates(batchForm.manufacturing_date, batchForm.expiry_date)
    if (dateErr) {
      setBatchDateError(dateErr)
      return
    }

    const qtyNum = Number(batchForm.quantity)
    if (isNaN(qtyNum) || qtyNum < 0) {
      setBatchActionFeedback({ text: 'Please enter a valid non-negative opening quantity.', tone: 'red' })
      return
    }

    setSavingBatchModal(true)
    setBatchActionFeedback(null)
    try {
      const res = await api.post(`/inventory/${editingItem.variant_id}/batches`, {
        batch_id: batchForm.batch_id,
        batch_no: batchForm.batch_no,
        quantity: qtyNum,
        selling_price: Number(batchForm.selling_price) || 0,
        mrp: Number(batchForm.mrp) || 0,
        manufacturing_date: batchForm.manufacturing_date || null,
        expiry_date: batchForm.expiry_date || null,
      })

      const newOnHand = res.data.on_hand
      setBatchActionFeedback({ text: 'Opening stock details saved successfully!', tone: 'green' })
      showFeedback(`Opening stock details saved for ${editingItem.product_name}!`, 'green')

      setOpeningInputs((prev) => ({ ...prev, [editingItem.variant_id]: String(Number(newOnHand) || 0) }))
      setOpeningRowData((prev) => ({
        ...prev,
        [editingItem.variant_id]: {
          batch_id: res.data.batch?.id ?? batchForm.batch_id,
          batch_no: batchForm.batch_no,
          quantity: String(qtyNum),
          selling_price: batchForm.selling_price,
          mrp: batchForm.mrp,
          manufacturing_date: batchForm.manufacturing_date,
          expiry_date: batchForm.expiry_date,
        },
      }))
      setDirtyVariantIds((prev) => {
        const next = new Set(prev)
        next.delete(editingItem.variant_id)
        return next
      })
      setOpeningItems((prev) =>
        prev.map((it) => it.variant_id === editingItem.variant_id ? { ...it, on_hand: String(newOnHand) } : it)
      )

      const bRes = await api.get(`/inventory/${editingItem.variant_id}/batches`)
      setBatchList(bRes.data.batches || [])
      setTimeout(() => {
        setEditingItem(null)
      }, 1200)
    } catch (err) {
      setBatchActionFeedback({ text: apiErrorMessage(err, 'Failed to save batch details'), tone: 'red' })
    } finally {
      setSavingBatchModal(false)
    }
  }

  async function handleConfirmResetStock() {
    if (!itemToReset) return
    setResettingStock(true)
    try {
      await api.delete(`/inventory/${itemToReset.variant_id}/opening-stock`)
      showFeedback(`Opening stock reset to 0 for ${itemToReset.product_name}.`, 'green')
      setOpeningInputs((prev) => ({ ...prev, [itemToReset.variant_id]: '0' }))
      setOpeningRowData((prev) => ({
        ...prev,
        [itemToReset.variant_id]: {
          batch_id: null,
          batch_no: 'OPENING-001',
          quantity: '0',
          selling_price: '',
          mrp: '',
          manufacturing_date: '',
          expiry_date: '',
        },
      }))
      setDirtyVariantIds((prev) => {
        const next = new Set(prev)
        next.delete(itemToReset.variant_id)
        return next
      })
      setOpeningItems((prev) =>
        prev.map((it) => it.variant_id === itemToReset.variant_id ? { ...it, on_hand: '0.000' } : it)
      )
      setItemToReset(null)
    } catch (err) {
      showFeedback(apiErrorMessage(err, 'Failed to reset opening stock'), 'red')
    } finally {
      setResettingStock(false)
    }
  }

  async function handleConfirmDeleteBatch() {
    if (!batchToDelete || !editingItem) return
    setDeletingBatch(true)
    try {
      const res = await api.delete(`/inventory/batches/${batchToDelete.id}`)
      setBatchActionFeedback({
        text: `Batch ${batchToDelete.batch_no} ${res.data.action || 'removed'} successfully.`,
        tone: 'green',
      })
      const newOnHand = res.data.on_hand
      setOpeningInputs((prev) => ({ ...prev, [editingItem.variant_id]: String(Number(newOnHand) || 0) }))
      setOpeningRowData((prev) => {
        const current = prev[editingItem.variant_id]
        return {
          ...prev,
          [editingItem.variant_id]: {
            batch_id: null,
            batch_no: current?.batch_no || 'OPENING-001',
            quantity: String(Number(newOnHand) || 0),
            selling_price: current?.selling_price || '',
            mrp: current?.mrp || '',
            manufacturing_date: '',
            expiry_date: '',
          },
        }
      })
      setOpeningItems((prev) =>
        prev.map((it) => it.variant_id === editingItem.variant_id ? { ...it, on_hand: String(newOnHand) } : it)
      )

      const bRes = await api.get(`/inventory/${editingItem.variant_id}/batches`)
      setBatchList(bRes.data.batches || [])
      setBatchToDelete(null)

      if (batchForm.batch_id === batchToDelete.id) {
        setBatchForm({
          batch_id: null,
          batch_no: 'OPENING-001',
          quantity: String(Number(newOnHand) || 0),
          selling_price: editingItem.retail_price ? String(Number(editingItem.retail_price)) : '',
          mrp: editingItem.mrp ? String(Number(editingItem.mrp)) : '',
          manufacturing_date: '',
          expiry_date: '',
        })
      }
    } catch (err) {
      setBatchActionFeedback({ text: apiErrorMessage(err, 'Failed to delete batch'), tone: 'red' })
    } finally {
      setDeletingBatch(false)
    }
  }

  async function autoSaveOpeningStock(): Promise<boolean> {
    if (dirtyVariantIds.size === 0) return true
    const payload = Array.from(dirtyVariantIds).map((vId) => {
      const row = openingRowData[vId]
      return {
        variant_id: vId,
        batch_id: row?.batch_id,
        batch_no: row?.batch_no || 'OPENING-001',
        quantity: Number(row?.quantity) || 0,
        selling_price: Number(row?.selling_price) || 0,
        mrp: Number(row?.mrp) || 0,
        manufacturing_date: row?.manufacturing_date || null,
        expiry_date: row?.expiry_date || null,
      }
    })

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
    if (dirtyVariantIds.size === 0) {
      showFeedback('No unsaved edits to save.', 'amber')
      return
    }

    for (const vId of dirtyVariantIds) {
      const row = openingRowData[vId]
      if (row) {
        const err = validateInlineRow(row)
        if (err) {
          const item = openingItems.find((it) => it.variant_id === vId)
          showFeedback(`${item?.product_name || 'Item'}: ${err}`, 'red')
          return
        }
      }
    }

    setSavingOpening(true)
    const success = await autoSaveOpeningStock()
    setSavingOpening(false)
    if (success) {
      showFeedback('All opening stock changes saved successfully!', 'green')
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
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-full whitespace-nowrap transition-all cursor-pointer ${mainTab === 'OPENING_STOCK'
              ? 'bg-[#804652] text-white shadow-xs'
              : 'text-slate-700 hover:text-slate-950 font-bold'
            }`}
        >
          📦 Opening Stock
        </button>
        <button
          onClick={() => handleMainTabChange('ADJUSTMENTS')}
          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-full whitespace-nowrap transition-all cursor-pointer ${mainTab === 'ADJUSTMENTS'
              ? 'bg-[#804652] text-white shadow-xs'
              : 'text-slate-700 hover:text-slate-950 font-bold'
            }`}
        >
          🔧 Adjustments &amp; History
        </button>
      </div>

      {mainTab === 'OPENING_STOCK' && (
        <div className="space-y-4">
          <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-sm px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Manual Opening Stock Entry</h2>
              <p className="text-xs text-slate-600 font-medium">
                Enter opening stock quantities and click Save. Unsaved edits auto-save when paginating.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {autoSaveStatus && (
                <span className="text-xs font-bold text-[#804652] animate-pulse bg-[#FAF2F4] px-2.5 py-1 rounded-full border border-[#EEDDE0]">
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
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#804652] hover:bg-[#6e3743] text-white text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer"
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
                  <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-[11px] font-black tracking-wider whitespace-nowrap">
                    <tr>
                      <th className="px-5 py-3.5 font-black">Product Title</th>
                      <th className="px-5 py-3.5 font-black">SKU / Barcode</th>
                      <th className="px-5 py-3.5 font-black text-right">Current On-Hand</th>
                      <th className="px-3 py-3.5 font-black">Batch Number</th>
                      <th className="px-3 py-3.5 font-black">Opening Qty</th>
                      <th className="px-3 py-3.5 font-black">MRP (₹)</th>
                      <th className="px-3 py-3.5 font-black">Mfg Date</th>
                      <th className="px-3 py-3.5 font-black">Exp Date</th>
                      <th className="px-4 py-3.5 font-black text-center">Status</th>
                      <th className="px-5 py-3.5 font-black text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0E0E3]">
                    {openingItems.map((item) => {
                      const isDirty = dirtyVariantIds.has(item.variant_id)
                      const row = openingRowData[item.variant_id] || {
                        batch_id: item.batch_id ?? null,
                        batch_no: item.batch_no || 'OPENING-001',
                        quantity: String(Number(item.on_hand) || 0),
                        selling_price: item.batch_selling_price ? String(Number(item.batch_selling_price)) : (item.retail_price ? String(Number(item.retail_price)) : ''),
                        mrp: item.batch_mrp ? String(Number(item.batch_mrp)) : (item.mrp ? String(Number(item.mrp)) : ''),
                        manufacturing_date: item.manufacturing_date || '',
                        expiry_date: item.expiry_date || '',
                      }
                      const isSavingThis = savingVariantId === item.variant_id
                      const isDateInvalid = Boolean(row.manufacturing_date && row.expiry_date && row.expiry_date < row.manufacturing_date)

                      return (
                        <tr key={item.variant_id} className={`hover:bg-[#FAF2F4]/80 transition-colors ${isDirty ? 'bg-[#FAF2F4]/50' : ''}`}>
                          {/* Product Title */}
                          <td className="px-5 py-3.5 font-bold text-slate-950 min-w-[170px]">
                            <div>{item.product_name}</div>
                            {(item.retail_price || item.mrp) && (
                              <div className="text-[11px] text-slate-500 font-normal mt-0.5">
                                {item.retail_price ? `Price: ₹${Number(item.retail_price).toFixed(2)}` : ''}
                                {item.retail_price && item.mrp ? ' • ' : ''}
                                {item.mrp ? `MRP: ₹${Number(item.mrp).toFixed(2)}` : ''}
                              </div>
                            )}
                          </td>

                          {/* SKU / Barcode */}
                          <td className="px-5 py-3.5 font-mono font-bold text-[#804652] whitespace-nowrap">
                            {item.sku} {item.barcode ? `(${item.barcode})` : ''}
                          </td>

                          {/* Current On-Hand */}
                          <td className="px-5 py-3.5 font-extrabold text-slate-900 text-right whitespace-nowrap">
                            {item.on_hand} units
                          </td>

                          {/* Inline Batch Number */}
                          <td className="px-3 py-3.5">
                            <input
                              type="text"
                              value={row.batch_no}
                              onChange={(e) => handleInlineRowChange(item.variant_id, 'batch_no', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, item.variant_id, item.product_name)}
                              placeholder="e.g. B-001"
                              title="Enter Batch Number (e.g. B-001)"
                              className="w-28 rounded-xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                            />
                          </td>

                          {/* Inline Opening Quantity (Manual Input) */}
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={row.quantity}
                                onChange={(e) => handleInlineRowChange(item.variant_id, 'quantity', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, item.variant_id, item.product_name)}
                                title="Manual Opening Stock Input (press Enter to save row)"
                                className={`w-20 rounded-xl border px-2.5 py-1.5 text-xs font-extrabold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652] ${isDirty ? 'border-[#804652] bg-[#FAF2F4] ring-1 ring-[#804652]' : 'border-[#EEDDE0] bg-[#FAF2F4]/30'
                                  }`}
                              />
                              <span className="text-[10px] text-slate-400 font-semibold select-none cursor-help" title="Press Enter to save this row">↵</span>
                            </div>
                          </td>

                          {/* Inline MRP */}
                          <td className="px-3 py-3.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400 font-medium">₹</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                value={row.mrp}
                                onChange={(e) => handleInlineRowChange(item.variant_id, 'mrp', e.target.value)}
                                onKeyDown={(e) => handleKeyDown(e, item.variant_id, item.product_name)}
                                title="MRP (₹)"
                                className="w-20 rounded-xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-2 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                              />
                            </div>
                          </td>

                          {/* Inline Manufacturing Date */}
                          <td className="px-3 py-3.5">
                            <input
                              type="date"
                              value={row.manufacturing_date}
                              onChange={(e) => handleInlineRowChange(item.variant_id, 'manufacturing_date', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, item.variant_id, item.product_name)}
                              title="Manufacturing Date"
                              className="w-28 rounded-xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-1.5 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                            />
                          </td>

                          {/* Inline Expiry Date */}
                          <td className="px-3 py-3.5">
                            <input
                              type="date"
                              value={row.expiry_date}
                              onChange={(e) => handleInlineRowChange(item.variant_id, 'expiry_date', e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, item.variant_id, item.product_name)}
                              title={isDateInvalid ? 'Expiry Date cannot be earlier than Manufacturing Date' : 'Expiry Date'}
                              className={`w-28 rounded-xl border px-1.5 py-1.5 text-[11px] text-slate-700 focus:outline-none focus:ring-2 ${isDateInvalid
                                  ? 'border-rose-400 bg-rose-50/50 text-rose-800 focus:ring-rose-400'
                                  : 'border-[#EEDDE0] bg-[#FAF2F4]/30 focus:ring-[#804652]'
                                }`}
                            />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {isDirty ? (
                              <Badge tone="amber">Unsaved Edits</Badge>
                            ) : (
                              <Badge tone="green">Saved</Badge>
                            )}
                          </td>

                          {/* Actions (Save, Edit Popup, Delete/Reset) */}
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Save Action */}
                              <button
                                type="button"
                                title="Save this row's values (or press Enter)"
                                disabled={isSavingThis || isDateInvalid}
                                onClick={() => handleSaveSingle(item.variant_id, item.product_name)}
                                className={`p-1.5 rounded-xl border transition-all cursor-pointer ${isDirty
                                    ? 'bg-[#804652] text-white border-[#804652] hover:bg-[#6e3743] shadow-xs'
                                    : 'bg-white text-slate-600 border-[#EEDDE0] hover:bg-[#FAF2F4] hover:text-[#804652]'
                                  }`}
                              >
                                {isSavingThis ? (
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.75V7.5a1.5 1.5 0 01-1.5 1.5H9A1.5 1.5 0 017.5 7.5V3.75m9 0H6.75A2.25 2.25 0 004.5 6v12a2.25 2.25 0 002.25 2.25h10.5A2.25 2.25 0 0019.5 18V6.75l-3-3zM9 14.25a2.25 2.25 0 104.5 0 2.25 2.25 0 00-4.5 0z" />
                                  </svg>
                                )}
                              </button>

                              {/* Edit Details Action (Popup) */}
                              <button
                                type="button"
                                title="Edit Opening Stock Details in popup"
                                onClick={() => openEditPopup(item)}
                                className="p-1.5 rounded-xl border border-[#EEDDE0] bg-white text-slate-700 hover:bg-[#FAF2F4] hover:text-[#804652] hover:border-[#804652] transition-all cursor-pointer"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                </svg>
                              </button>

                              {/* Delete / Reset Action */}
                              <button
                                type="button"
                                title="Reset / Delete Opening Stock to 0"
                                onClick={() => setItemToReset(item)}
                                className="p-1.5 rounded-xl border border-[#EEDDE0] bg-white text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-all cursor-pointer"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {openingItems.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-6 py-12 text-center text-xs font-semibold text-slate-500">
                          No items match "{openingSearch}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination with Background Auto-Save */}
            <div className="flex items-center justify-between border-t border-[#F2E5E7] px-6 py-4 bg-[#FAF2F4]/30 text-xs">
              <span className="text-slate-600 font-medium">
                Page <span className="font-extrabold text-slate-950">{openingPage}</span> of <span className="font-extrabold text-slate-950">{totalPages}</span> ({openingTotal} total items)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={openingPage <= 1}
                  onClick={() => handlePageChange(openingPage - 1)}
                  className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors text-xs cursor-pointer"
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
                      className={`h-7 w-7 rounded-full font-bold text-xs transition-colors cursor-pointer ${pNum === openingPage ? 'bg-[#804652] text-white shadow-xs' : 'bg-white border border-[#EEDDE0] text-slate-800 hover:bg-[#FAF2F4]'
                        }`}
                    >
                      {pNum}
                    </button>
                  )
                })}
                <button
                  disabled={openingPage >= totalPages}
                  onClick={() => handlePageChange(openingPage + 1)}
                  className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors text-xs cursor-pointer"
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
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${subView === 'ADJUSTMENTS'
                  ? 'bg-[#7B3F4A] text-white shadow-sm'
                  : 'text-[#804652]/70 hover:bg-[#FAF2F4] hover:text-[#804652]'
                }`}
            >
              Stock Adjustment &amp; History
            </button>
            <button
              type="button"
              onClick={() => handleSubViewChange('LOGS')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all ${subView === 'LOGS'
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
                              className={`hover:bg-[#FAF2F4]/60 transition-colors ${isChanged ? 'bg-[#FAF2F4]/40' : ''
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
                                    className={`w-20 rounded-full border px-2 py-1 text-center text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#804652]/30 ${isChanged
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

      {/* ── Opening Stock Details Edit Popup (Modal) ── */}
      {editingItem && (
        <Modal title="Opening Stock Details" width="xl" onClose={() => setEditingItem(null)}>
          <div className="space-y-6">
            {/* Product Summary Header Card */}
            <div className="rounded-2xl border border-[#F2E5E7] bg-[#FAF2F4]/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-950">{editingItem.product_name}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-600 font-medium">
                  <span>SKU: <span className="font-mono font-bold text-[#804652]">{editingItem.sku}</span></span>
                  {editingItem.barcode && <span>• Barcode: <span className="font-mono font-bold">{editingItem.barcode}</span></span>}
                  {editingItem.retail_price && <span>• Default Price: <span className="font-bold text-slate-900">₹{Number(editingItem.retail_price).toFixed(2)}</span></span>}
                  {editingItem.mrp && <span>• MRP: <span className="font-bold text-slate-900">₹{Number(editingItem.mrp).toFixed(2)}</span></span>}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Current On-Hand</span>
                <span className="text-sm font-black text-[#804652]">{editingItem.on_hand} units</span>
              </div>
            </div>

            {/* Notification Banner inside Modal */}
            {batchActionFeedback && (
              <div className={`p-3 rounded-2xl border text-xs font-bold ${batchActionFeedback.tone === 'green'
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                  : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}>
                {batchActionFeedback.text}
              </div>
            )}

            {/* Existing Batches Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#4A1821]">
                  Existing Batches ({batchList.length})
                </h4>
                {batchForm.batch_id !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setBatchForm({
                        batch_id: null,
                        batch_no: 'OPENING-' + (batchList.length + 1).toString().padStart(3, '0'),
                        quantity: '',
                        selling_price: editingItem.retail_price ? String(Number(editingItem.retail_price)) : '',
                        mrp: editingItem.mrp ? String(Number(editingItem.mrp)) : '',
                        manufacturing_date: '',
                        expiry_date: '',
                      })
                      setBatchDateError('')
                      setBatchActionFeedback(null)
                    }}
                    className="text-xs font-bold text-[#804652] hover:underline cursor-pointer"
                  >
                    + Add New Batch Instead
                  </button>
                )}
              </div>

              {loadingBatches ? (
                <div className="p-6 text-center"><Spinner /></div>
              ) : batchList.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#EEDDE0] p-4 text-center text-xs text-slate-500 font-medium">
                  No batches created yet for this product. Fill in the form below to initialize opening batch details.
                </div>
              ) : (
                <div className="rounded-2xl border border-[#F2E5E7] overflow-hidden overflow-x-auto max-h-48">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF2F4] text-[#4A1821] uppercase text-[10px] font-black border-b border-[#F0E0E3]">
                      <tr>
                        <th className="px-3 py-2">Batch #</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Avail</th>
                        <th className="px-3 py-2">Price</th>
                        <th className="px-3 py-2">MRP</th>
                        <th className="px-3 py-2">Mfg Date</th>
                        <th className="px-3 py-2">Exp Date</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0E0E3]">
                      {batchList.map((b) => {
                        const isSelected = batchForm.batch_id === b.id
                        return (
                          <tr key={b.id} className={`hover:bg-[#FAF2F4]/80 transition-colors ${isSelected ? 'bg-[#FAF2F4] font-bold' : ''}`}>
                            <td className="px-3 py-2 font-mono font-bold text-[#804652]">{b.batch_no}</td>
                            <td className="px-3 py-2 font-bold">{Number(b.quantity)}</td>
                            <td className="px-3 py-2 font-bold text-slate-700">{Number(b.available_quantity)}</td>
                            <td className="px-3 py-2">₹{Number(b.selling_price || 0).toFixed(2)}</td>
                            <td className="px-3 py-2">₹{Number(b.mrp || 0).toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-600">{b.manufacturing_date || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{b.expiry_date || '—'}</td>
                            <td className="px-3 py-2">
                              <Badge tone={b.status === 'ACTIVE' ? 'green' : 'slate'}>{b.status}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  title="Edit this batch"
                                  onClick={() => {
                                    setBatchForm({
                                      batch_id: b.id,
                                      batch_no: b.batch_no || '',
                                      quantity: String(Number(b.quantity) || 0),
                                      selling_price: b.selling_price ? String(Number(b.selling_price)) : '',
                                      mrp: b.mrp ? String(Number(b.mrp)) : '',
                                      manufacturing_date: b.manufacturing_date || '',
                                      expiry_date: b.expiry_date || '',
                                    })
                                    setBatchDateError('')
                                    setBatchActionFeedback(null)
                                  }}
                                  className="p-1 rounded-lg text-slate-600 hover:text-[#804652] hover:bg-[#FAF2F4] transition-colors cursor-pointer"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                                </button>
                                <button
                                  type="button"
                                  title="Delete batch"
                                  onClick={() => setBatchToDelete(b)}
                                  className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Batch Form */}
            <form onSubmit={handleSaveBatchDetails} className="space-y-4 pt-2 border-t border-[#F2E5E7]">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-[#804652]">
                  {batchForm.batch_id ? `Edit Batch Details (ID #${batchForm.batch_id})` : 'Add New Opening Batch Details'}
                </h4>
                {batchForm.batch_id && (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Editing Existing Batch
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Batch Number */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Batch Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={batchForm.batch_no}
                    onChange={(e) => handleBatchFormChange('batch_no', e.target.value)}
                    placeholder="e.g. BATCH-001"
                    className="w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                  />
                </div>

                {/* Opening Quantity */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Opening Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={batchForm.quantity}
                    onChange={(e) => handleBatchFormChange('quantity', e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-extrabold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                  />
                </div>

                {/* Selling Price */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Price (Selling Price ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={batchForm.selling_price}
                    onChange={(e) => handleBatchFormChange('selling_price', e.target.value)}
                    placeholder="e.g. 299.00"
                    className="w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                  />
                </div>

                {/* MRP */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    MRP (Maximum Retail Price ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={batchForm.mrp}
                    onChange={(e) => handleBatchFormChange('mrp', e.target.value)}
                    placeholder="e.g. 350.00"
                    className="w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                  />
                </div>

                {/* Manufacturing Date */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Manufacturing Date
                  </label>
                  <input
                    type="date"
                    value={batchForm.manufacturing_date}
                    onChange={(e) => handleBatchFormChange('manufacturing_date', e.target.value)}
                    className="w-full rounded-2xl border border-[#EEDDE0] bg-[#FAF2F4]/30 px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 focus:ring-[#804652]"
                  />
                </div>

                {/* Expiry Date */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={batchForm.expiry_date}
                    onChange={(e) => handleBatchFormChange('expiry_date', e.target.value)}
                    className={`w-full rounded-2xl border px-3.5 py-2 text-xs font-semibold text-slate-950 focus:outline-none focus:ring-2 ${batchDateError ? 'border-rose-400 bg-rose-50/50 focus:ring-rose-400' : 'border-[#EEDDE0] bg-[#FAF2F4]/30 focus:ring-[#804652]'
                      }`}
                  />
                </div>
              </div>

              {/* Date Validation Alert */}
              {batchDateError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4 shrink-0 text-rose-600"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  <span>{batchDateError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-4">
                <Button type="button" variant="secondary" onClick={() => setEditingItem(null)}>
                  Close
                </Button>
                <button
                  type="submit"
                  disabled={Boolean(batchDateError) || savingBatchModal}
                  className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full bg-[#804652] hover:bg-[#6e3743] text-white text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {savingBatchModal ? 'Saving Details…' : batchForm.batch_id ? 'Update Batch Details' : 'Save Opening Stock Batch'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ── Delete / Reset Opening Stock Confirmation Dialog ── */}
      {itemToReset && (
        <Modal title="Confirm Reset Opening Stock" width="sm" onClose={() => setItemToReset(null)}>
          <div className="space-y-4">
            <p className="text-xs text-slate-700 font-medium leading-relaxed">
              Are you sure you want to reset opening stock for <span className="font-extrabold text-slate-950">{itemToReset.product_name}</span> (SKU: <span className="font-mono font-bold text-[#804652]">{itemToReset.sku}</span>)?
            </p>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-900 leading-snug">
              This will safely set on-hand stock to 0 units and deactivate active opening batches in accordance with inventory movement audit rules.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setItemToReset(null)} disabled={resettingStock}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmResetStock}
                disabled={resettingStock}
                className="px-5 py-2 rounded-full bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
              >
                {resettingStock ? 'Resetting…' : 'Confirm Reset to 0'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Batch Confirmation Dialog ── */}
      {batchToDelete && (
        <Modal title="Delete Batch" width="sm" onClose={() => setBatchToDelete(null)}>
          <div className="space-y-4">
            <p className="text-xs text-slate-700 font-medium leading-relaxed">
              Are you sure you want to delete batch <span className="font-mono font-bold text-[#804652]">{batchToDelete.batch_no}</span>?
            </p>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-900 leading-snug">
              Unconsumed stock ({Number(batchToDelete.available_quantity)} units) from this batch will be safely deducted from on-hand inventory.
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setBatchToDelete(null)} disabled={deletingBatch}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={handleConfirmDeleteBatch}
                disabled={deletingBatch}
                className="px-5 py-2 rounded-full bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
              >
                {deletingBatch ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Global Feedback Toast Notification ── */}
      {feedbackMessage && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl border text-xs font-bold transition-all ${feedbackMessage.tone === 'green'
            ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
            : feedbackMessage.tone === 'red'
              ? 'bg-rose-50 text-rose-950 border-rose-300'
              : 'bg-amber-50 text-amber-950 border-amber-300'
          }`}>
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="ml-2 text-slate-400 hover:text-slate-800 font-black cursor-pointer text-sm"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
