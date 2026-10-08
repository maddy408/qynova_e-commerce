import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { PencilIcon, WalletIcon, ReceiptIcon } from '../components/Icons'
import {
  SplitPaymentFields,
  INITIAL_SPLIT_PAYMENT_VALUES,
  extractSplitPaymentPayload,
  type SplitPaymentValues,
} from '../components/SplitPaymentFields'
import { Alert, Badge, Button, Modal, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface Supplier {
  id: number
  name: string
}

interface Purchase {
  id: number
  purchase_no: string
  supplier_name: string
  supplier_id: number
  status: 'ACTIVE' | 'CANCELLED'
  grand_total: string
  paid_amount?: string
  balance_amount?: string
  amount_paid: string
  payment_method?: string | null
  payment_status: string
  purchase_date: string
  notes?: string | null
  updated_at?: string
  can_collect_payment?: boolean
  can_edit_payment?: boolean
  can_cancel?: boolean
  disabled_reason?: string | null
  cancel_disabled_reason?: string | null
}

interface PaymentLine {
  id?: number
  payment_method: string
  amount: string
  reference_no?: string | null
}

interface PurchasePayment {
  id: number
  purchase_id: number
  supplier_id: number
  receipt_no: string
  payment_date: string
  total_amount: string
  notes?: string | null
  status: 'ACTIVE' | 'REVERSED'
  reversed_by?: number | null
  reversed_by_name?: string | null
  reversed_at?: string | null
  reverse_reason?: string | null
  created_by_name?: string | null
  created_at: string
  lines: PaymentLine[]
}

interface VariantOption {
  id: number
  product_name: string
  sku: string
  barcode: string | null
  mrp: string
  purchase_price: string | null
  on_hand?: number
}

interface LineItem {
  variant_id: number
  product_name: string
  sku: string
  quantity: string
  unit_cost: string
  mrp: string
  discount_amount: string
}

// Feature Flag: When true, all 3 action buttons always look enabled and handle permissions via click-time toast notifications.
const ACTION_BUTTONS_ALWAYS_ENABLED = true

interface ToastNotification {
  id: number
  message: string
  type: 'info' | 'warning' | 'error' | 'success'
}

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 5
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [allVariants, setAllVariants] = useState<VariantOption[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Toast Notification State
  const [toast, setToast] = useState<ToastNotification | null>(null)
  const toastTimeoutRef = useRef<any>(null)

  function showToast(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'warning') {
    if (!message) return
    // De-duplicate identical consecutive toasts so repeated clicks do not stack
    if (toast && toast.message === message && toast.type === type) {
      return
    }
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    setToast({ id: Date.now(), message, type })
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null)
    }, 4000)
  }

  function dismissToast() {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current)
    }
    setToast(null)
  }

  // Payment Edit Modal State
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null)
  const [editSplitValues, setEditSplitValues] = useState<SplitPaymentValues>(INITIAL_SPLIT_PAYMENT_VALUES)
  const [editError, setEditError] = useState('')
  const [editSuccess, setEditSuccess] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Collect Payment Modal State
  const [collectPurchase, setCollectPurchase] = useState<Purchase | null>(null)
  const [collectAmount, setCollectAmount] = useState<string>('')
  const [collectDate, setCollectDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [collectNotes, setCollectNotes] = useState<string>('')
  const [collectSplitValues, setCollectSplitValues] = useState<SplitPaymentValues>(INITIAL_SPLIT_PAYMENT_VALUES)
  const [collectIdempotencyKey, setCollectIdempotencyKey] = useState<string>('')
  const [collectError, setCollectError] = useState<string>('')
  const [collectSuccess, setCollectSuccess] = useState<string>('')
  const [collectSubmitting, setCollectSubmitting] = useState<boolean>(false)

  // Payment History State
  const [historyPurchase, setHistoryPurchase] = useState<Purchase | null>(null)
  const [paymentsHistory, setPaymentsHistory] = useState<PurchasePayment[]>([])
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false)
  const [reversingPaymentId, setReversingPaymentId] = useState<number | null>(null)
  const [reverseReason, setReverseReason] = useState<string>('')
  const [reverseSubmitting, setReverseSubmitting] = useState<boolean>(false)
  const [historyError, setHistoryError] = useState<string>('')
  const [historySuccess, setHistorySuccess] = useState<string>('')

  // Action Click Handlers with Toast Feedback for Invalid Actions
  function handleCollectAction(p: Purchase) {
    const isCancelled = p.status === 'CANCELLED'
    const canCollect = p.can_collect_payment !== undefined ? p.can_collect_payment : !isCancelled
    if (canCollect) {
      openCollectPaymentModal(p)
    } else if (ACTION_BUTTONS_ALWAYS_ENABLED) {
      const reason = p.disabled_reason || (isCancelled ? 'Purchase is cancelled' : 'Already fully paid')
      showToast(reason, 'warning')
    }
  }

  function handleEditAction(p: Purchase) {
    const isCancelled = p.status === 'CANCELLED'
    const canEdit = p.can_edit_payment !== undefined ? p.can_edit_payment : !isCancelled
    if (canEdit) {
      openEditPaymentModal(p)
    } else if (ACTION_BUTTONS_ALWAYS_ENABLED) {
      const reason = p.disabled_reason || (isCancelled ? 'Purchase is cancelled' : 'Cannot edit payment on this purchase')
      showToast(reason, 'warning')
    }
  }

  function handleHistoryAction(p: Purchase) {
    openPaymentHistoryModal(p)
  }

  // New Purchase Creation State
  const [supplierId, setSupplierId] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [newPurchaseSplit, setNewPurchaseSplit] = useState<SplitPaymentValues>(INITIAL_SPLIT_PAYMENT_VALUES)

  // Autocomplete dropdown state
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  function load() {
    api.get('/purchases').then((res) => setPurchases(res.data.purchases))
  }

  function fetchVariants(search = '') {
    api.get('/inventory', { params: { limit: 200, search: search || undefined } }).then((res) => {
      const list = res.data.items ?? res.data.inventory ?? []
      const itemsList = list.map((inv: any) => ({
        id: inv.variant_id ?? inv.id,
        product_name: inv.product_name,
        sku: inv.sku,
        barcode: inv.barcode ?? null,
        mrp: inv.mrp,
        purchase_price: inv.purchase_price ?? inv.retail_price ?? '0',
        on_hand: inv.on_hand ?? 0,
      }))
      setAllVariants(itemsList)
    })
  }

  useEffect(() => {
    load()
    api.get('/suppliers').then((res) => setSuppliers(res.data.suppliers))
    fetchVariants()
  }, [])

  // ================= EDIT PAYMENT MODAL =================
  function openEditPaymentModal(p: Purchase) {
    setEditPurchase(p)
    const paid = p.paid_amount ?? p.amount_paid ?? '0.00'
    const isSplit = p.payment_method === 'SPLIT'

    setEditSplitValues({
      mode: isSplit ? 'SPLIT' : 'SINGLE',
      singleMethod: p.payment_method && p.payment_method !== 'SPLIT' ? p.payment_method : 'CASH',
      singleAmount: paid !== '0.00' ? paid : '',
      singleRef: '',
      cash: isSplit ? paid : (p.payment_method === 'CASH' ? paid : ''),
      upi: p.payment_method === 'UPI' ? paid : '',
      card: p.payment_method === 'CARD' ? paid : '',
      bank: p.payment_method === 'NETBANKING' ? paid : '',
      upiRef: '',
      cardRef: '',
      bankRef: '',
    })
    setEditError('')
    setEditSuccess('')
  }

  async function handleEditPaymentSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editPurchase) return
    setEditError('')
    setEditSuccess('')

    const grandTotalNum = Number(editPurchase.grand_total) || 0
    const payload = extractSplitPaymentPayload(editSplitValues, grandTotalNum)

    if (!payload.isValid) {
      setEditError(payload.errorMessage || 'Invalid payment amounts or missing required references')
      return
    }

    setEditSubmitting(true)
    try {
      const res = await api.patch(`/purchases/${editPurchase.id}/payment`, {
        payment_status: payload.paymentStatus,
        payment_method: payload.paymentMethod,
        paid_amount: payload.paidAmount,
        lines: payload.lines,
      })

      const updatedPurchase = res.data.purchase
      setEditSuccess('Payment details saved successfully!')
      setPurchases((prev) =>
        prev ? prev.map((item) => (item.id === updatedPurchase.id ? { ...item, ...updatedPurchase } : item)) : null
      )
      setTimeout(() => {
        setEditPurchase(null)
        load()
      }, 500)
    } catch (err: any) {
      if (err?.response?.status === 401) {
        window.location.href = '/login'
        return
      }
      const msg = apiErrorMessage(err, 'Failed to update payment')
      setEditError(msg)
      showToast(msg, 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  // ================= COLLECT PAYMENT MODAL =================
  function openCollectPaymentModal(p: Purchase) {
    const currentPaid = p.paid_amount ?? p.amount_paid ?? '0.00'
    const balance = p.balance_amount ?? Math.max(0, (Number(p.grand_total) || 0) - (Number(currentPaid) || 0)).toFixed(2)

    setCollectPurchase(p)
    setCollectAmount(balance)
    setCollectDate(new Date().toISOString().slice(0, 10))
    setCollectNotes('')
    setCollectSplitValues({
      mode: 'SINGLE',
      singleMethod: 'CASH',
      singleAmount: balance,
      singleRef: '',
      cash: balance,
      upi: '',
      card: '',
      bank: '',
      upiRef: '',
      cardRef: '',
      bankRef: '',
    })
    setCollectIdempotencyKey(`col-${p.id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`)
    setCollectError('')
    setCollectSuccess('')
  }

  const collectBalanceNum = collectPurchase
    ? Number(
        collectPurchase.balance_amount ??
          Math.max(
            0,
            (Number(collectPurchase.grand_total) || 0) -
              (Number(collectPurchase.paid_amount ?? collectPurchase.amount_paid) || 0)
          )
      )
    : 0

  const collectAmountNum = Number(collectAmount) || 0

  async function handleCollectPaymentSubmit(e: FormEvent) {
    e.preventDefault()
    if (!collectPurchase) return
    setCollectError('')
    setCollectSuccess('')

    if (collectAmountNum <= 0) {
      setCollectError('Payment amount must be greater than 0')
      return
    }

    if (collectAmountNum > collectBalanceNum + 0.001) {
      setCollectError('Payment exceeds balance')
      return
    }

    const payload = extractSplitPaymentPayload(collectSplitValues, collectAmountNum)
    if (!payload.isValid) {
      setCollectError(payload.errorMessage || 'Invalid payment amounts or missing required references')
      return
    }

    const allocatedNum = Number(payload.paidAmount) || 0
    if (Math.abs(allocatedNum - collectAmountNum) > 0.009) {
      setCollectError(
        `Total allocated (₹${allocatedNum.toFixed(2)}) must exactly equal Amount to Collect (₹${collectAmountNum.toFixed(2)})`
      )
      return
    }

    if (payload.lines.length === 0) {
      setCollectError('At least one payment method with amount > 0 is required')
      return
    }

    setCollectSubmitting(true)
    try {
      const res = await api.post(`/purchases/${collectPurchase.id}/payments`, {
        amount: collectAmountNum.toFixed(2),
        payment_date: collectDate,
        notes: collectNotes.trim() || undefined,
        idempotency_key: collectIdempotencyKey,
        lines: payload.lines,
      })

      const updatedPurchase = res.data.purchase
      setCollectSuccess('Payment collected successfully!')
      setPurchases((prev) =>
        prev ? prev.map((item) => (item.id === updatedPurchase.id ? { ...item, ...updatedPurchase } : item)) : null
      )
      setTimeout(() => {
        setCollectPurchase(null)
        load()
      }, 500)
    } catch (err: any) {
      if (err?.response?.status === 401) {
        window.location.href = '/login'
        return
      }
      const msg = apiErrorMessage(err, 'Failed to collect payment')
      setCollectError(msg)
      showToast(msg, 'error')
    } finally {
      setCollectSubmitting(false)
    }
  }

  // ================= PAYMENT HISTORY MODAL =================
  async function openPaymentHistoryModal(p: Purchase) {
    setHistoryPurchase(p)
    setPaymentsHistory([])
    setLoadingHistory(true)
    setHistoryError('')
    setHistorySuccess('')
    setReversingPaymentId(null)
    setReverseReason('')

    try {
      const res = await api.get(`/purchases/${p.id}/payments`)
      setPaymentsHistory(res.data.payments || [])
    } catch (err: any) {
      setHistoryError(apiErrorMessage(err, 'Failed to load payment history'))
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleReversePaymentSubmit(paymentId: number) {
    if (!historyPurchase) return
    if (!reverseReason.trim()) {
      setHistoryError('A reason is required to reverse the payment')
      return
    }

    setReverseSubmitting(true)
    setHistoryError('')
    setHistorySuccess('')

    try {
      const res = await api.post(`/purchases/${historyPurchase.id}/payments/${paymentId}/reverse`, {
        reason: reverseReason.trim(),
      })

      const updatedPurchase = res.data.purchase
      setHistorySuccess('Payment reversed successfully')
      setPurchases((prev) =>
        prev ? prev.map((item) => (item.id === updatedPurchase.id ? { ...item, ...updatedPurchase } : item)) : null
      )
      setHistoryPurchase(updatedPurchase)
      setReversingPaymentId(null)
      setReverseReason('')

      // Reload payments
      const pRes = await api.get(`/purchases/${updatedPurchase.id}/payments`)
      setPaymentsHistory(pRes.data.payments || [])
    } catch (err: any) {
      setHistoryError(apiErrorMessage(err, 'Failed to reverse payment'))
    } finally {
      setReverseSubmitting(false)
    }
  }

  // ================= NEW PURCHASE MODAL =================
  const grandTotal = items.reduce(
    (sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) - (Number(item.discount_amount) || 0)),
    0
  )

  function updateItem(variantId: number, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.variant_id !== variantId) return item
        return { ...item, [field]: value }
      })
    )
  }

  function removeItem(variantId: number) {
    setItems((prev) => prev.filter((i) => i.variant_id !== variantId))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!supplierId) {
      setError('Please select a supplier')
      return
    }

    if (items.length === 0) {
      setError('Please add at least one item to the purchase')
      return
    }

    const payload = extractSplitPaymentPayload(newPurchaseSplit, grandTotal)
    if (!payload.isValid) {
      setError(payload.errorMessage || 'Invalid payment amounts or missing required references')
      return
    }

    setSubmitting(true)
    try {
      await api.post('/purchases', {
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        payment_method: payload.paymentMethod,
        payment_status: payload.paymentStatus,
        amount_paid: payload.paidAmount,
        lines: payload.lines,
        items: items.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          mrp: i.mrp,
          discount_amount: i.discount_amount || '0',
        })),
      })
      setShowForm(false)
      setItems([])
      setSupplierId('')
      setNewPurchaseSplit(INITIAL_SPLIT_PAYMENT_VALUES)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create purchase'))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredVariants = allVariants.filter((v) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      v.product_name.toLowerCase().includes(q) ||
      v.sku.toLowerCase().includes(q) ||
      (v.barcode && v.barcode.toLowerCase().includes(q))
    )
  })

  function selectVariant(v: VariantOption) {
    setItems((prev) => {
      const existing = prev.find((i) => i.variant_id === v.id)
      if (existing) {
        return prev.map((i) => (i.variant_id === v.id ? { ...i, quantity: String(Number(i.quantity) + 1) } : i))
      }
      return [
        ...prev,
        {
          variant_id: v.id,
          product_name: v.product_name,
          sku: v.sku,
          quantity: '1',
          unit_cost: v.purchase_price || '0',
          mrp: v.mrp || '0',
          discount_amount: '0',
        },
      ]
    })
    setSearchQuery('')
    setDropdownOpen(false)
    setHighlightedIndex(0)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setDropdownOpen(true)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev < filteredVariants.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredVariants.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredVariants.length > 0 && highlightedIndex < filteredVariants.length) {
        selectVariant(filteredVariants[highlightedIndex])
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notifications */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-top-3 duration-200">
          <div
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border shadow-lg backdrop-blur-xs text-xs font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-950'
                : toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-950'
                : toast.type === 'info'
                ? 'bg-blue-50/95 border-blue-200 text-blue-950'
                : 'bg-amber-50/95 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {toast.type === 'error' ? '⚠️' : toast.type === 'success' ? '✓' : 'ℹ️'}
              </span>
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="ml-2 text-slate-400 hover:text-slate-700 font-bold text-base leading-none p-0.5 rounded focus:outline-none cursor-pointer"
              aria-label="Close notification"
            >
              &times;
            </button>
          </div>
        </div>
      )}


      {purchases === null ? (
        <div className="p-12 text-center">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#F2E5E7] shadow-2xs overflow-hidden">
          {/* Card Header with New Purchase Button */}
          <div className="p-5 sm:p-6 border-b border-[#F2E5E7] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">All Purchases</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Supplier → Stock Purchase → Increase inventory with cost &amp; MRP tracking
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm(true)
                setNewPurchaseSplit(INITIAL_SPLIT_PAYMENT_VALUES)
                fetchVariants()
              }}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all shadow-md active:scale-98 shrink-0"
            >
              + New Purchase
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-4 py-3">Purchase No</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Grand Total</th>
                  <th className="px-4 py-3">Paid Amount</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Payment Method</th>
                  <th className="px-4 py-3 text-center">Payment Status</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E0E3]">
                {(() => {
                  const totalPurchases = purchases.length
                  const totalPages = Math.max(1, Math.ceil(totalPurchases / pageSize))
                  const safeCurrentPage = Math.min(currentPage, totalPages)
                  const startIndex = (safeCurrentPage - 1) * pageSize
                  const endIndex = Math.min(startIndex + pageSize, totalPurchases)
                  const paginatedPurchases = purchases.slice(startIndex, endIndex)

                  if (paginatedPurchases.length === 0) {
                    return (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center font-semibold text-slate-500">
                          No purchases recorded yet.
                        </td>
                      </tr>
                    )
                  }

                  return paginatedPurchases.map((p) => {
                    const effectivePaid = p.paid_amount ?? p.amount_paid ?? '0.00'
                    const effectiveBalance =
                      p.balance_amount ??
                      Math.max(0, (Number(p.grand_total) || 0) - (Number(effectivePaid) || 0)).toFixed(2)
                    const isPaid = p.payment_status === 'PAID'
                    const isPartial = p.payment_status === 'PARTIAL' || p.payment_status === 'PARTIALLY_PAID'

                    return (
                      <tr key={p.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-950">{p.purchase_no}</td>
                        <td className="px-4 py-3 text-slate-950 font-bold">{p.supplier_name}</td>
                        <td className="px-4 py-3 text-slate-950 font-black">₹{p.grand_total}</td>
                        <td className="px-4 py-3 text-emerald-800 font-black">₹{effectivePaid}</td>
                        <td className="px-4 py-3 text-[#804652] font-black">₹{effectiveBalance}</td>
                        <td className="px-4 py-2.5 text-slate-700 font-medium text-[11px] max-w-[160px] truncate" title={p.payment_method ?? ''}>
                          {p.payment_method === 'SPLIT' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FAF2F4] text-[#7B3F4A] border border-[#EEDDE0]">
                              ⚡ Split
                            </span>
                          ) : (
                            p.payment_method || '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge tone={isPaid ? 'green' : isPartial ? 'amber' : 'red'}>
                            {isPaid ? 'PAID' : isPartial ? 'PARTIALLY PAID' : 'UNPAID'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge tone={p.status === 'ACTIVE' ? 'green' : 'red'}>{p.status}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px] font-semibold">{p.purchase_date}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {/* 1. Collect Payment Icon Button */}
                            <button
                              type="button"
                              onClick={() => handleCollectAction(p)}
                              title="Collect Payment"
                              aria-label="Collect Payment"
                              className="inline-flex items-center justify-center p-1.5 rounded-lg border text-xs transition-colors shadow-2xs text-emerald-700 bg-emerald-50/80 border-emerald-300 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                            >
                              <WalletIcon className="h-4 w-4" />
                            </button>

                            {/* 2. Edit Payment Icon Button */}
                            <button
                              type="button"
                              onClick={() => handleEditAction(p)}
                              title="Edit Payment"
                              aria-label="Edit Payment"
                              className="inline-flex items-center justify-center p-1.5 rounded-lg border text-xs transition-colors shadow-2xs text-indigo-700 bg-indigo-50/80 border-indigo-300 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>

                            {/* 3. Payment History Icon Button */}
                            <button
                              type="button"
                              onClick={() => handleHistoryAction(p)}
                              title="Payment History & Receipts"
                              aria-label="Payment History"
                              className="inline-flex items-center justify-center p-1.5 rounded-lg border text-xs transition-colors shadow-2xs text-slate-700 bg-slate-50 border-slate-300 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer"
                            >
                              <ReceiptIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Footer */}
          {purchases.length > 0 && (() => {
            const totalPurchases = purchases.length
            const totalPages = Math.max(1, Math.ceil(totalPurchases / pageSize))
            const safeCurrentPage = Math.min(currentPage, totalPages)
            const startIndex = (safeCurrentPage - 1) * pageSize
            const endIndex = Math.min(startIndex + pageSize, totalPurchases)

            return (
              <div className="flex items-center justify-between border-t border-[#F2E5E7] px-6 py-3 bg-[#FAF2F4]/50 text-xs text-slate-600">
                <div>
                  Showing <span className="font-semibold text-slate-900">{totalPurchases > 0 ? startIndex + 1 : 0}</span> to{' '}
                  <span className="font-semibold text-slate-900">{endIndex}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalPurchases}</span> purchases
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors"
                  >
                    ← Previous
                  </button>
                  <span className="px-2 font-medium text-slate-700">
                    Page {safeCurrentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 rounded-full border border-[#EEDDE0] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[#FAF2F4] transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* ================= COLLECT PAYMENT MODAL ================= */}

      {collectPurchase && (
        <Modal
          title={`Collect Payment — ${collectPurchase.purchase_no}`}
          onClose={() => {
            if (!collectSubmitting) setCollectPurchase(null)
          }}
          width="lg"
        >
          <form onSubmit={handleCollectPaymentSubmit} className="space-y-4">
            {collectError && <Alert tone="red">{collectError}</Alert>}
            {collectSuccess && <Alert tone="green">{collectSuccess}</Alert>}

            {/* Read-only Financial Summary Header */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Supplier: <strong className="text-slate-900">{collectPurchase.supplier_name}</strong></span>
                <span>Purchase Date: <strong className="text-slate-900 font-mono">{collectPurchase.purchase_date}</strong></span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Total Purchase</p>
                  <p className="text-sm font-bold text-slate-900">₹{Number(collectPurchase.grand_total).toFixed(2)}</p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                  <p className="text-[10px] uppercase font-semibold text-emerald-600">Already Paid</p>
                  <p className="text-sm font-bold text-emerald-700">
                    ₹{Number(collectPurchase.paid_amount ?? collectPurchase.amount_paid ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-amber-200 bg-amber-50/40 shadow-2xs">
                  <p className="text-[10px] uppercase font-semibold text-amber-700">Outstanding Balance</p>
                  <p className="text-sm font-extrabold text-amber-800">₹{collectBalanceNum.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Amount to Collect & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TextField
                label="Amount to Collect (₹)"
                type="number"
                step="0.01"
                min="0.01"
                max={collectBalanceNum}
                required
                value={collectAmount}
                onChange={(e) => {
                  setCollectAmount(e.target.value)
                  setCollectError('')
                }}
                placeholder={`Max ₹${collectBalanceNum.toFixed(2)}`}
              />
              <TextField
                label="Payment Date"
                type="date"
                required
                value={collectDate}
                onChange={(e) => setCollectDate(e.target.value)}
              />
            </div>

            {/* Reusable SplitPaymentFields for Collect Modal */}
            <SplitPaymentFields
              total={collectAmountNum}
              values={collectSplitValues}
              onChange={setCollectSplitValues}
              isCollectMode={true}
            />

            <TextField
              label="Payment Notes (Optional)"
              value={collectNotes}
              onChange={(e) => setCollectNotes(e.target.value)}
              placeholder="e.g. Part payment received via Cheque / Bank Transfer"
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                disabled={collectSubmitting}
                onClick={() => setCollectPurchase(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  collectSubmitting ||
                  collectAmountNum <= 0 ||
                  collectAmountNum > collectBalanceNum + 0.001
                }
              >
                {collectSubmitting ? 'Recording Payment…' : `Collect ₹${collectAmountNum.toFixed(2)}`}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= PAYMENT EDIT MODAL ================= */}
      {editPurchase && (
        <Modal
          title={`Edit Payment Details — ${editPurchase.purchase_no}`}
          onClose={() => {
            if (!editSubmitting) setEditPurchase(null)
          }}
          width="lg"
        >
          <form onSubmit={handleEditPaymentSubmit} className="space-y-4">
            {editError && <Alert tone="red">{editError}</Alert>}
            {editSuccess && <Alert tone="green">{editSuccess}</Alert>}

            {/* Financial Overview Card */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Supplier: <strong className="text-slate-900">{editPurchase.supplier_name}</strong></span>
                <span>Date: <strong className="text-slate-900 font-mono">{editPurchase.purchase_date}</strong></span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-center">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Grand Total</p>
                  <p className="text-sm font-bold text-slate-900">₹{Number(editPurchase.grand_total).toFixed(2)}</p>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <p className="text-[10px] uppercase font-semibold text-slate-500">Current Status</p>
                  <p className="text-sm font-bold text-[#7B3F4A]">{editPurchase.payment_status}</p>
                </div>
              </div>
            </div>

            {/* Reusable SplitPaymentFields for Edit Modal */}
            <SplitPaymentFields
              total={Number(editPurchase.grand_total) || 0}
              values={editSplitValues}
              onChange={setEditSplitValues}
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <Button
                type="button"
                variant="secondary"
                disabled={editSubmitting}
                onClick={() => setEditPurchase(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editSubmitting}>
                {editSubmitting ? 'Saving Changes…' : 'Save Payment Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= PAYMENT HISTORY DRAWER / MODAL ================= */}
      {historyPurchase && (
        <Modal
          title={`Payment History & Receipts — ${historyPurchase.purchase_no}`}
          onClose={() => setHistoryPurchase(null)}
          width="lg"
        >
          <div className="space-y-4">
            {historyError && <Alert tone="red">{historyError}</Alert>}
            {historySuccess && <Alert tone="green">{historySuccess}</Alert>}

            {/* Financial Overview Header */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-500">Supplier: </span>
                <strong className="text-slate-900">{historyPurchase.supplier_name}</strong>
              </div>
              <div className="flex items-center gap-4">
                <span>Grand Total: <strong className="text-slate-900">₹{historyPurchase.grand_total}</strong></span>
                <span>Paid: <strong className="text-emerald-700">₹{historyPurchase.paid_amount ?? historyPurchase.amount_paid}</strong></span>
                <span>Balance: <strong className="text-amber-700">₹{historyPurchase.balance_amount}</strong></span>
              </div>
            </div>

            {loadingHistory ? (
              <div className="p-8 text-center"><Spinner /></div>
            ) : paymentsHistory.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed rounded-xl">
                No payment transactions recorded for this purchase yet.
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {paymentsHistory.map((pay) => {
                  const isActive = pay.status === 'ACTIVE'
                  const isReversingThis = reversingPaymentId === pay.id

                  return (
                    <div
                      key={pay.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isActive ? 'bg-white border-slate-200 shadow-2xs' : 'bg-red-50/30 border-red-200 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{pay.receipt_no}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-mono text-[11px]">{pay.payment_date}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={isActive ? 'green' : 'red'}>{pay.status}</Badge>
                          <span className="font-extrabold text-sm text-slate-900">₹{pay.total_amount}</span>
                        </div>
                      </div>

                      {/* Payment Lines */}
                      <div className="pt-2 text-xs">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Payment Breakdown:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {pay.lines.map((l, lIdx) => (
                            <div key={lIdx} className="bg-slate-50 p-2 rounded-lg border border-slate-200/80 flex items-center justify-between">
                              <span className="font-medium text-slate-800">{l.payment_method}</span>
                              <div className="text-right">
                                <span className="font-bold text-slate-900">₹{l.amount}</span>
                                {l.reference_no && (
                                  <p className="text-[10px] text-slate-500 font-mono">Ref: {l.reference_no}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {pay.notes && (
                        <p className="mt-2 text-[11px] text-slate-600 bg-slate-50/50 p-1.5 rounded border border-slate-100">
                          <span className="font-semibold">Notes:</span> {pay.notes}
                        </p>
                      )}

                      {!isActive && (
                        <div className="mt-2 p-2 rounded-lg bg-red-100/60 text-[11px] text-red-900">
                          <p>
                            <strong>Reversed:</strong> {pay.reverse_reason || 'No reason provided'}
                          </p>
                          <p className="text-[10px] text-red-700 font-mono">
                            By {pay.reversed_by_name || 'Admin'} on {pay.reversed_at}
                          </p>
                        </div>
                      )}

                      {/* Reverse Action */}
                      {isActive && (
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-end">
                          {!isReversingThis ? (
                            <button
                              type="button"
                              onClick={() => {
                                setReversingPaymentId(pay.id)
                                setReverseReason('')
                              }}
                              className="text-xs font-semibold text-red-600 hover:text-red-800 hover:underline inline-flex items-center gap-1"
                            >
                              ↩ Reverse Payment
                            </button>
                          ) : (
                            <div className="w-full p-2.5 rounded-lg border border-red-200 bg-red-50/60 space-y-2">
                              <p className="text-xs font-bold text-red-900">Confirm Payment Reversal</p>
                              <TextField
                                label="Reversal Reason *"
                                required
                                value={reverseReason}
                                onChange={(e) => setReverseReason(e.target.value)}
                                placeholder="State reason for payment reversal…"
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={reverseSubmitting}
                                  onClick={() => setReversingPaymentId(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  disabled={reverseSubmitting || !reverseReason.trim()}
                                  onClick={() => handleReversePaymentSubmit(pay.id)}
                                  className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                  {reverseSubmitting ? 'Reversing…' : 'Confirm Reversal'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <Button type="button" variant="secondary" onClick={() => setHistoryPurchase(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= NEW PURCHASE CREATION MODAL ================= */}
      {showForm && (
        <Modal title="New Stock Purchase" onClose={() => setShowForm(false)} width="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Supplier <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
                >
                  <option value="">Select Supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Purchase Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
                />
              </div>
            </div>

            {/* Reusable SplitPaymentFields for New Purchase */}
            <SplitPaymentFields
              total={grandTotal}
              values={newPurchaseSplit}
              onChange={setNewPurchaseSplit}
              disabled={items.length === 0}
            />

            <div className="relative">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Search Items / Variants <span className="text-slate-400 font-normal normal-case">(Type name, SKU or barcode)</span>
              </label>
              <div className="relative">
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => {
                    setDropdownOpen(true)
                    fetchVariants(searchQuery)
                  }}
                  onChange={(e) => {
                    const val = e.target.value
                    setSearchQuery(val)
                    setDropdownOpen(true)
                    setHighlightedIndex(0)
                    fetchVariants(val)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type item name, SKU or barcode… (Press ↑ ↓ to navigate, Enter to select)"
                  className="w-full rounded-xl border border-[#E5D5D8] bg-[#FDFBFB] pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7B3F4A] focus:ring-4 focus:ring-[#7B3F4A]/10 transition-all shadow-2xs"
                />
              </div>

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-[#F2E5E7] bg-white shadow-xl">
                  {filteredVariants.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">No items found matching search.</div>
                  ) : (
                    filteredVariants.map((v, index) => (
                      <div
                        key={v.id}
                        onClick={() => selectVariant(v)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`flex cursor-pointer items-center justify-between px-3.5 py-2.5 text-xs transition-colors ${
                          index === highlightedIndex ? 'bg-[#7B3F4A] text-white font-medium' : 'hover:bg-[#FAF2F4] text-slate-800'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{v.product_name}</p>
                          <p className={`text-[10px] ${index === highlightedIndex ? 'text-rose-100' : 'text-slate-500'}`}>
                            SKU: <span className="font-mono font-bold">{v.sku}</span> | Stock: {v.on_hand ?? 0}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">Unit Cost: ₹{v.purchase_price || '0'}</p>
                          <p className={`text-[10px] ${index === highlightedIndex ? 'text-rose-100' : 'text-slate-500'}`}>MRP: ₹{v.mrp}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="rounded-2xl border border-[#F2E5E7] bg-white overflow-hidden shadow-2xs space-y-2">
                <div className="px-4 py-2.5 bg-[#FAF2F4] border-b border-[#F2E5E7] flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#804652] uppercase tracking-wider">Purchase Item List ({items.length})</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-[11px] font-black tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5">Product Item</th>
                        <th className="px-3 py-2.5">Qty</th>
                        <th className="px-3 py-2.5">Unit Cost (₹)</th>
                        <th className="px-3 py-2.5">MRP (₹)</th>
                        <th className="px-3 py-2.5">Discount (₹)</th>
                        <th className="px-3 py-2.5">Subtotal</th>
                        <th className="px-3 py-2.5 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F2E5E7]">
                      {items.map((item) => {
                        const sub = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) - (Number(item.discount_amount) || 0)
                        return (
                          <tr key={item.variant_id} className="hover:bg-[#FAF2F4]/50">
                            <td className="px-4 py-2.5">
                              <p className="font-bold text-slate-900">{item.product_name}</p>
                              <p className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.variant_id, 'quantity', e.target.value)}
                                className="w-16 rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2 py-1 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                step="0.01"
                                value={item.unit_cost}
                                onChange={(e) => updateItem(item.variant_id, 'unit_cost', e.target.value)}
                                className="w-24 rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                step="0.01"
                                value={item.mrp}
                                onChange={(e) => updateItem(item.variant_id, 'mrp', e.target.value)}
                                className="w-24 rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.discount_amount}
                                onChange={(e) => updateItem(item.variant_id, 'discount_amount', e.target.value)}
                                className="w-20 rounded-lg border border-[#E5D5D8] bg-[#FDFBFB] px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#7B3F4A] focus:ring-1 focus:ring-[#7B3F4A]"
                              />
                            </td>
                            <td className="px-3 py-2.5 font-bold text-slate-900">₹{sub.toFixed(2)}</td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => removeItem(item.variant_id)}
                                className="p-1 rounded-full text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                title="Remove item"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between items-center px-4 py-3 bg-[#FAF2F4]/60 border-t border-[#F2E5E7]">
                  <span className="text-slate-600 font-semibold text-xs">Grand Total</span>
                  <span className="text-base font-extrabold text-[#804652]">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F2E5E7]">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-5 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-gradient-to-r from-[#804652] to-[#6E3642] text-white text-xs font-bold uppercase tracking-wider hover:opacity-95 shadow-md active:scale-98 transition-all disabled:opacity-50"
              >
                {submitting ? 'Creating…' : 'Submit Stock Purchase'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
