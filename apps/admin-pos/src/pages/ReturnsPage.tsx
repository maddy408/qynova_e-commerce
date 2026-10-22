import { useEffect, useState, type FormEvent } from 'react'
import { Button, Modal, Spinner } from '../components/ui'
import { ReturnMappingPanel } from '../components/ReturnMappingPanel'
import { api, apiErrorMessage, getApiOrigin } from '../lib/api'

// ================= TYPES & INTERFACES =================

export interface ReturnItem {
  id: number
  return_id: number
  variant_id: number
  order_item_id: number
  product_id: number
  product_name_snapshot: string
  variant_label_snapshot: string | null
  sku_snapshot: string
  image_path: string | null
  condition: string | null
  qty: number
  unit_price: string | number
  total_amount: string | number
}

export interface ReturnStatusHistory {
  id: number
  return_id: number
  from_status: string | null
  to_status: string
  source: 'ADMIN' | 'CUSTOMER' | 'SYSTEM'
  note: string | null
  actor_user_id: number | null
  actor_name?: string | null
  created_at: string
}

export interface ReturnRecord {
  id: number
  return_no: string
  order_id: number
  order_no: string
  customer_id: number
  customer_name: string
  customer_phone: string
  shipping_address?: string | null
  order_grand_total?: string | number
  total_amount: string | number
  refund_amount: string | number
  status:
    | 'PENDING_REVIEW'
    | 'APPROVED'
    | 'REJECTED'
    | 'PICKUP_SCHEDULED'
    | 'ITEM_RECEIVED'
    | 'INSPECTION'
    | 'PROCESSING'
    | 'COMPLETED'
  return_type: 'REFUND' | 'REPLACEMENT'
  payment_status?: string | null
  refund_status: 'PENDING' | 'REFUNDED' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'NOT_APPLICABLE' | 'PROCESSING'
  reason: string
  notes?: string | null
  pickup_partner?: string | null
  pickup_tracking_id?: string | null
  pickup_tracking_url?: string | null
  pickup_status?: string | null
  pickup_scheduled_at?: string | null
  pickup_completed_at?: string | null
  inspection_condition?: 'PENDING' | 'RESELLABLE' | 'DAMAGED' | 'DEFECTIVE' | 'QUARANTINED' | null
  inspection_notes?: string | null
  stock_credited?: number | boolean
  rejection_reason?: string | null
  reported_condition?: 'UNOPENED' | 'OPENED_UNUSED' | 'USED' | 'DAMAGED_ON_ARRIVAL' | null
  packaging_available?: number | boolean | null
  replacement_order_id?: number | null
  replacement_status?: 'NOT_APPLICABLE' | 'PENDING' | 'PROCESSING' | 'DISPATCHED' | 'COMPLETED'
  images?: { id: number; image_path: string; thumb_path: string | null }[]
  first_item_name?: string | null
  first_item_image?: string | null
  total_returned_qty?: number
  items?: ReturnItem[]
  status_history?: ReturnStatusHistory[]
  created_at: string
  updated_at: string
}

interface SummaryData {
  total_requests: { count: number; today: number }
  pending_review: { count: number; today: number }
  approved_processing: { count: number; today: number }
  completed: { count: number; today: number }
}

interface EligibleOrderItem {
  order_item_id: number
  variant_id: number
  product_id: number
  product_name: string
  variant_label?: string | null
  sku: string
  image_path?: string | null
  unit_price: number
  ordered_quantity: number
  already_returned_qty: number
  remaining_returnable_qty: number
}

interface EligibleOrder {
  order_id: number
  order_no: string
  customer_id: number
  customer_name: string
  customer_phone: string
  grand_total: number
  payment_status: string
  placed_at: string
  delivered_at: string
  items: EligibleOrderItem[]
}

// ================= HELPERS =================

function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const clean = path.startsWith('/') ? path.slice(1) : path
  return `${getApiOrigin()}/${clean}`
}

function formatDateDisplay(dateStr?: string | null): { date: string; time: string; full: string } {
  if (!dateStr) return { date: '—', time: '', full: '—' }
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return { date: dateStr, time: '', full: dateStr }
    const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    return { date, time, full: `${date}, ${time}` }
  } catch {
    return { date: dateStr, time: '', full: dateStr }
  }
}

// Allowed state transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'PROCESSING', 'REJECTED'],
  PICKUP_SCHEDULED: ['ITEM_RECEIVED', 'PROCESSING', 'REJECTED'],
  ITEM_RECEIVED: ['INSPECTION'],
  INSPECTION: ['PROCESSING', 'COMPLETED'],
  PROCESSING: ['COMPLETED'],
  REJECTED: ['PENDING_REVIEW'],
  COMPLETED: [],
}

// ================= COMPONENT =================

export function ReturnsPage() {
  // Summary Metrics State
  const [summary, setSummary] = useState<SummaryData>({
    total_requests: { count: 18, today: 4 },
    pending_review: { count: 6, today: 2 },
    approved_processing: { count: 7, today: 1 },
    completed: { count: 5, today: 1 },
  })

  // Top-level section: return REQUESTS (existing table below) vs the
  // product-wide returnable MAPPING tool (separate dataset — products,
  // not return requests — so it gets its own view, not another status tab).
  const [mainView, setMainView] = useState<'requests' | 'mapping'>('requests')

  // List & Filter States
  const [activeTab, setActiveTab] = useState<'all' | 'pending_review' | 'approved' | 'completed' | 'rejected'>('all')
  const [tabCounts, setTabCounts] = useState({
    all: 18,
    pending_review: 6,
    approved: 7,
    completed: 5,
    rejected: 0,
  })
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Search & Filter Bar Controls
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [reasonFilter, setReasonFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  // Notification banners
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Modals
  const [showNewReturnModal, setShowNewReturnModal] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showRefundModal, setShowRefundModal] = useState(false)

  // New Return Form State
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([])
  const [fetchingEligible, setFetchingEligible] = useState(false)
  const [selectedEligibleOrder, setSelectedEligibleOrder] = useState<EligibleOrder | null>(null)
  const [returnItemQtys, setReturnItemQtys] = useState<Record<number, number>>({})
  const [newReturnType, setNewReturnType] = useState<'REFUND' | 'REPLACEMENT'>('REPLACEMENT')
  const [newReturnReason, setNewReturnReason] = useState('Wrong product')
  const [newReturnNotes, setNewReturnNotes] = useState('')
  const [newPickupPartner, setNewPickupPartner] = useState('Bluedart')
  const [creatingReturn, setCreatingReturn] = useState(false)

  // Status Modal State
  const [statusTargetStatus, setStatusTargetStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [statusPickupPartner, setStatusPickupPartner] = useState('Bluedart')
  const [statusPickupTrackingId, setStatusPickupTrackingId] = useState('')
  const [statusCondition, setStatusCondition] = useState<'RESELLABLE' | 'DAMAGED' | 'DEFECTIVE' | 'QUARANTINED'>('RESELLABLE')
  const [statusInspectionNotes, setStatusInspectionNotes] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  // Reject Modal State
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNote, setRejectNote] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  // Refund Modal State
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<'ORIGINAL' | 'CASH' | 'UPI' | 'BANK_TRANSFER'>('UPI')
  const [refundSubmitting, setRefundSubmitting] = useState(false)

  // Auto-clear alert toasts
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 4500)
      return () => clearTimeout(t)
    }
  }, [actionSuccess])

  // Initial load
  useEffect(() => {
    fetchSummary()
  }, [])

  // Fetch returns list whenever filters, tabs, or page changes
  useEffect(() => {
    fetchReturns()
  }, [activeTab, searchQuery, statusFilter, reasonFilter, dateFrom, dateTo, page, limit])

  // Fetch summary cards
  async function fetchSummary() {
    try {
      const res = await api.get('/returns/summary')
      if (res.data?.summary) {
        setSummary(res.data.summary)
      }
    } catch {
      // Handled silently
    }
  }

  // Fetch returns list
  async function fetchReturns() {
    setLoading(true)
    try {
      const params: Record<string, any> = {
        tab: activeTab,
        page,
        limit,
      }
      if (searchQuery) params.search = searchQuery
      if (statusFilter) params.status = statusFilter
      if (reasonFilter) params.reason = reasonFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo

      const res = await api.get('/returns', { params })
      const items = res.data?.items || []
      setReturns(items)
      setTotal(res.data?.total ?? items.length)

      if (res.data?.tab_counts) {
        setTabCounts(res.data.tab_counts)
      }

      // If drawer is currently open, refresh its data
      if (selectedReturn) {
        const found = items.find((i: ReturnRecord) => i.id === selectedReturn.id)
        if (found) {
          fetchReturnDetail(found.id, false)
        }
      } else if (items.length > 0 && !selectedReturn) {
        // Automatically select the first return to show in drawer on desktop (matching RMA-1003 in screenshot)
        const defaultRet = items.find((i: ReturnRecord) => i.return_no === 'RMA-1003') || items[0]
        fetchReturnDetail(defaultRet.id, false)
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to load returns list'))
    } finally {
      setLoading(false)
    }
  }

  // Fetch single return detail for drawer
  async function fetchReturnDetail(id: number, showSpinner = true) {
    if (showSpinner) setDrawerLoading(true)
    try {
      const res = await api.get(`/returns/${id}`)
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to load return details'))
    } finally {
      if (showSpinner) setDrawerLoading(false)
    }
  }

  // Filter submit handler
  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  // Filter reset handler
  function handleFilterReset() {
    setSearchInput('')
    setSearchQuery('')
    setStatusFilter('')
    setReasonFilter('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  // Checkbox Selection
  function handleSelectAll(checked: boolean) {
    if (checked && returns) {
      setSelectedIds(returns.map((r) => r.id))
    } else {
      setSelectedIds([])
    }
  }

  function handleSelectRow(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  // Export CSV
  async function handleExport() {
    try {
      const res = await api.get('/returns/export', {
        params: {
          tab: activeTab,
          search: searchQuery,
          status: statusFilter,
          reason: reasonFilter,
          date_from: dateFrom,
          date_to: dateTo,
        },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `returns_export_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setActionSuccess('Returns data exported successfully as CSV.')
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to export returns'))
    }
  }

  // Open New Return Modal
  async function openNewReturnModal() {
    setShowNewReturnModal(true)
    setFetchingEligible(true)
    setSelectedEligibleOrder(null)
    setReturnItemQtys({})
    setNewReturnType('REPLACEMENT')
    setNewReturnReason('Wrong product')
    setNewReturnNotes('')
    setNewPickupPartner('Bluedart')

    try {
      const res = await api.get('/returns/eligible-orders')
      const orders = res.data?.orders || []
      setEligibleOrders(orders)
      if (orders.length > 0) {
        selectOrderForReturn(orders[0])
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to fetch delivered orders eligible for return'))
    } finally {
      setFetchingEligible(false)
    }
  }

  function selectOrderForReturn(order: EligibleOrder) {
    setSelectedEligibleOrder(order)
    const initialQtys: Record<number, number> = {}
    order.items.forEach((item) => {
      // Default return 1 unit if returnable
      initialQtys[item.variant_id] = item.remaining_returnable_qty > 0 ? 1 : 0
    })
    setReturnItemQtys(initialQtys)
  }

  // Handle New Return Submit
  async function handleCreateReturnSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedEligibleOrder) {
      setActionError('Please select an eligible order')
      return
    }

    const itemsToReturn = selectedEligibleOrder.items
      .filter((item) => (returnItemQtys[item.variant_id] || 0) > 0)
      .map((item) => ({
        order_item_id: item.order_item_id,
        variant_id: item.variant_id,
        qty: returnItemQtys[item.variant_id],
      }))

    if (itemsToReturn.length === 0) {
      setActionError('Please select at least 1 item and quantity to return')
      return
    }

    setCreatingReturn(true)
    try {
      const payload = {
        order_id: selectedEligibleOrder.order_id,
        return_type: newReturnType,
        reason: newReturnReason,
        notes: newReturnNotes,
        pickup_partner: newPickupPartner,
        items: itemsToReturn,
      }

      const res = await api.post('/returns', payload)
      setActionSuccess(`Return request ${res.data?.return?.return_no || ''} created successfully!`)
      setShowNewReturnModal(false)
      fetchReturns()
      fetchSummary()
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to create return request'))
    } finally {
      setCreatingReturn(false)
    }
  }

  // Open Update Status Modal
  function openStatusModal(ret: ReturnRecord) {
    setSelectedReturn(ret)
    const allowed = ALLOWED_TRANSITIONS[ret.status] || []
    setStatusTargetStatus(allowed[0] || '')
    setStatusNote('')
    setStatusPickupPartner(ret.pickup_partner || 'Bluedart')
    setStatusPickupTrackingId(ret.pickup_tracking_id || '')
    setStatusCondition('RESELLABLE')
    setStatusInspectionNotes('')
    setShowStatusModal(true)
  }

  // Handle Status Update Submit
  async function handleStatusSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedReturn || !statusTargetStatus) return

    setStatusSubmitting(true)
    try {
      const payload: Record<string, any> = {
        status: statusTargetStatus,
        note: statusNote.trim() || undefined,
      }

      if (statusTargetStatus === 'PICKUP_SCHEDULED') {
        payload.pickup_partner = statusPickupPartner
        payload.pickup_tracking_id = statusPickupTrackingId
      }

      if (statusTargetStatus === 'INSPECTION') {
        payload.condition = statusCondition
        payload.inspection_notes = statusInspectionNotes
      }

      const res = await api.put(`/returns/${selectedReturn.id}/status`, payload)
      setActionSuccess(`Return ${selectedReturn.return_no} status updated to ${statusTargetStatus}!`)
      setShowStatusModal(false)
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
      fetchReturns()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to update return status'))
    } finally {
      setStatusSubmitting(false)
    }
  }

  // Quick Approve
  async function handleQuickApprove(ret: ReturnRecord) {
    try {
      const res = await api.put(`/returns/${ret.id}/approve`, {
        note: 'Approved by admin from dashboard',
      })
      setActionSuccess(`Return ${ret.return_no} approved successfully!`)
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
      fetchReturns()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to approve return'))
    }
  }

  // Create a linked replacement fulfillment order for an approved REPLACEMENT return
  async function handleCreateReplacement(ret: ReturnRecord) {
    try {
      const res = await api.post(`/returns/${ret.id}/replacement`, {})
      setActionSuccess(`Replacement order created for ${ret.return_no}!`)
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
      fetchReturns()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to create replacement order'))
    }
  }

  // Open Reject Modal
  function openRejectModal(ret: ReturnRecord) {
    setSelectedReturn(ret)
    setRejectReason('')
    setRejectNote('')
    setShowRejectModal(true)
  }

  // Handle Reject Submit
  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedReturn) return
    if (!rejectReason.trim()) {
      setActionError('A rejection reason is required')
      return
    }

    setRejectSubmitting(true)
    try {
      const res = await api.put(`/returns/${selectedReturn.id}/reject`, {
        rejection_reason: rejectReason.trim(),
        note: rejectNote.trim() || undefined,
      })
      setActionSuccess(`Return ${selectedReturn.return_no} rejected.`)
      setShowRejectModal(false)
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
      fetchReturns()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to reject return'))
    } finally {
      setRejectSubmitting(false)
    }
  }

  // Open Refund Modal
  function openRefundModal(ret: ReturnRecord) {
    setSelectedReturn(ret)
    setRefundPaymentMethod('UPI')
    setShowRefundModal(true)
  }

  // Handle Refund Submit
  async function handleRefundSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedReturn) return

    setRefundSubmitting(true)
    try {
      const res = await api.post(`/returns/${selectedReturn.id}/refund`, {
        payment_method: refundPaymentMethod,
      })
      setActionSuccess(
        `Refund of ₹${Number(selectedReturn.refund_amount || selectedReturn.total_amount).toFixed(2)} processed via ${refundPaymentMethod}!`
      )
      setShowRefundModal(false)
      if (res.data?.return) {
        setSelectedReturn(res.data.return)
      }
      fetchReturns()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to process refund'))
    } finally {
      setRefundSubmitting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-5 pb-12 font-sans antialiased text-slate-800">
      {/* ================= TOP BREADCRUMB & HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          {/* Breadcrumbs matching Reference Image 3 */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 mb-1">
            <span>Sales &amp; Orders</span>
            <span className="text-slate-400">›</span>
            <span className="text-purple-700">Returns</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Returns</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage return requests, approve/reject, process refunds or replacements.
          </p>
        </div>

        {/* Top-Right Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={openNewReturnModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>New Return</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            {/* Tray / Export Icon */}
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* ================= TOP-LEVEL SECTION TOGGLE ================= */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 text-xs font-bold shadow-2xs">
        <button
          type="button"
          onClick={() => setMainView('requests')}
          className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            mainView === 'requests' ? 'bg-[#6366f1] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Return Requests
        </button>
        <button
          type="button"
          onClick={() => setMainView('mapping')}
          className={`px-3.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
            mainView === 'mapping' ? 'bg-[#6366f1] text-white' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Return Mapping
        </button>
      </div>

      {mainView === 'mapping' && <ReturnMappingPanel />}

      {mainView === 'requests' && (
        <>
      {/* ================= ALERTS ================= */}
      {actionSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>{actionSuccess}</span>
          </div>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-950 font-bold">✕</button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-700 hover:text-rose-950 font-bold">✕</button>
        </div>
      )}

      {/* ================= 4 KPI SUMMARY METRIC CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Return Requests */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#f0efff] text-[#6366f1] flex items-center justify-center shrink-0">
            {/* Return curved arrow icon */}
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 10h10a5 5 0 015 5v2M3 10l5 5m-5-5l5-5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Total Return Requests</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.total_requests.count}
              </span>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                ↑ +{summary.total_requests.today} today
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Pending Review */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#fff7ed] text-[#f59e0b] flex items-center justify-center shrink-0">
            {/* Pending clock / document icon */}
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Pending Review</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.pending_review.count}
              </span>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                ↑ +{summary.pending_review.today} today
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Approved & Processing */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#ecfdf5] text-[#10b981] flex items-center justify-center shrink-0">
            {/* Checkmark circle icon */}
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Approved &amp; Processing</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.approved_processing.count}
              </span>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                ↑ +{summary.approved_processing.today} today
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Completed */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#fff1f2] text-[#f43f5e] flex items-center justify-center shrink-0">
            {/* Box check / completed icon */}
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Completed</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.completed.count}
              </span>
              <span className="inline-flex items-center text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                ↑ +{summary.completed.today} today
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= FILTER CONTROLS BAR ================= */}
      <form
        onSubmit={handleFilterSubmit}
        className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs flex flex-wrap items-center gap-3"
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-[220px]">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by Order ID, Customer, Product, RMA..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
          />
        </div>

        {/* Date Range Selector */}
        <div className="relative flex items-center">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
            title="Date from"
          />
          <span className="px-1 text-slate-400 text-xs border-y border-slate-200 bg-slate-50/50 py-1.5">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 rounded-r-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
            title="Date to"
          />
        </div>

        {/* Return Status Dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
        >
          <option value="">All Statuses</option>
          <option value="PENDING_REVIEW">Pending Review</option>
          <option value="APPROVED">Approved</option>
          <option value="PICKUP_SCHEDULED">Pickup Scheduled</option>
          <option value="ITEM_RECEIVED">Item Received</option>
          <option value="INSPECTION">Inspection</option>
          <option value="PROCESSING">Processing</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </select>

        {/* Reason Dropdown */}
        <select
          value={reasonFilter}
          onChange={(e) => {
            setReasonFilter(e.target.value)
            setPage(1)
          }}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
        >
          <option value="">All Reasons</option>
          <option value="Defective">Defective</option>
          <option value="Wrong product">Wrong product</option>
          <option value="Damaged item">Damaged item</option>
          <option value="Size issue">Size issue</option>
          <option value="Fabric issue">Fabric issue</option>
          <option value="Not fitting">Not fitting</option>
          <option value="Other">Other</option>
        </select>

        {/* Filter Action Buttons */}
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filter</span>
        </button>

        {(searchQuery || statusFilter || reasonFilter || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={handleFilterReset}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors cursor-pointer"
          >
            Reset
          </button>
        )}
      </form>

      {/* ================= STATUS TABS WITH DYNAMIC COUNTERS ================= */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setActiveTab('all')
            setPage(1)
          }}
          className={`pb-3 px-3 transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === 'all'
              ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          All Returns
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('pending_review')
            setPage(1)
          }}
          className={`pb-3 px-3 transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === 'pending_review'
              ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Pending Review ({tabCounts.pending_review})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('approved')
            setPage(1)
          }}
          className={`pb-3 px-3 transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === 'approved'
              ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Approved ({tabCounts.approved})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('completed')
            setPage(1)
          }}
          className={`pb-3 px-3 transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === 'completed'
              ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Completed ({tabCounts.completed})
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('rejected')
            setPage(1)
          }}
          className={`pb-3 px-3 transition-colors relative whitespace-nowrap cursor-pointer ${
            activeTab === 'rejected'
              ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Rejected ({tabCounts.rejected})
        </button>
      </div>

      {/* ================= MAIN CONTENT: TABLE & RIGHT-SIDE DRAWER ================= */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ================= DATA TABLE CONTAINER ================= */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === returns.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                    />
                  </th>
                  <th className="py-3.5 px-3">Return ID</th>
                  <th className="py-3.5 px-3">Order No</th>
                  <th className="py-3.5 px-3">Customer</th>
                  <th className="py-3.5 px-3 min-w-[160px]">Product</th>
                  <th className="py-3.5 px-3">Reason</th>
                  <th className="py-3.5 px-3">Return Type</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Request Date</th>
                  <th className="py-3.5 pr-4 pl-2 text-center w-12">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-slate-400">
                      <Spinner />
                      <p className="mt-2 text-xs font-medium">Loading returns data…</p>
                    </td>
                  </tr>
                ) : returns.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-700">No returns found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Try adjusting your search criteria or create a new return request.
                      </p>
                    </td>
                  </tr>
                ) : (
                  returns.map((ret) => {
                    const isSelected = selectedReturn?.id === ret.id
                    const isChecked = selectedIds.includes(ret.id)
                    const dt = formatDateDisplay(ret.created_at)
                    const img = imageUrl(ret.first_item_image)

                    return (
                      <tr
                        key={ret.id}
                        onClick={() => fetchReturnDetail(ret.id)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected ? 'bg-[#f5f4ff]' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 pl-4 pr-2" onClick={(e) => handleSelectRow(ret.id, e)}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                          />
                        </td>

                        {/* Return ID */}
                        <td className="py-3.5 px-3">
                          <p className="font-bold text-slate-900 group-hover:text-[#6366f1] transition-colors">
                            {ret.return_no}
                          </p>
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-[#6366f1] bg-[#ecebff] px-2 py-0.5 rounded-full">
                            Return
                          </span>
                        </td>

                        {/* Order No */}
                        <td className="py-3.5 px-3">
                          <span className="font-semibold text-slate-700">
                            {ret.order_no || `ORD-${ret.order_id}`}
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="py-3.5 px-3">
                          <p className="font-bold text-slate-900 truncate max-w-[120px]">
                            {ret.customer_name || 'Walk-in Customer'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {ret.customer_phone || '—'}
                          </p>
                        </td>

                        {/* Product */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2.5">
                            {img ? (
                              <img
                                src={img}
                                alt={ret.first_item_name || 'Product'}
                                className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-slate-50 shrink-0"
                                onError={(e) => {
                                  // Fallback placeholder
                                  ;(e.target as HTMLElement).style.display = 'none'
                                }}
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                </svg>
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate max-w-[140px]">
                                {ret.first_item_name || 'Order Item'}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                x {ret.total_returned_qty || 1}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Reason */}
                        <td className="py-3.5 px-3">
                          <span className="text-slate-600 font-medium">{ret.reason || 'Customer Return'}</span>
                        </td>

                        {/* Return Type Badge */}
                        <td className="py-3.5 px-3">
                          {ret.return_type === 'REPLACEMENT' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200">
                              <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Replacement
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200">
                              <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l5 5m-5-5l5-5" />
                              </svg>
                              Refund
                            </span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-3">
                          {ret.status === 'PENDING_REVIEW' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Pending Review
                            </span>
                          )}
                          {ret.status === 'APPROVED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Approved
                            </span>
                          )}
                          {ret.status === 'PICKUP_SCHEDULED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-purple-700 bg-purple-50 border border-purple-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                              Pickup Scheduled
                            </span>
                          )}
                          {ret.status === 'ITEM_RECEIVED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                              Item Received
                            </span>
                          )}
                          {ret.status === 'INSPECTION' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                              Inspection
                            </span>
                          )}
                          {ret.status === 'PROCESSING' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              Processing
                            </span>
                          )}
                          {ret.status === 'COMPLETED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                              Completed
                            </span>
                          )}
                          {ret.status === 'REJECTED' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Rejected
                            </span>
                          )}
                        </td>

                        {/* Request Date */}
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-slate-800">{dt.date}</p>
                          <p className="text-[11px] text-slate-400">{dt.time}</p>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 pr-4 pl-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openStatusModal(ret)}
                            className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center mx-auto transition-colors"
                            title="Update status"
                          >
                            <span className="text-base font-bold leading-none">•••</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ================= PAGINATION ================= */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white text-xs">
            <span className="text-slate-500 font-medium">
              Showing {returns.length > 0 ? (page - 1) * limit + 1 : 0} -{' '}
              {Math.min(page * limit, total)} of {total} returns
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center font-bold disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                ‹
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pNum = i + 1
                return (
                  <button
                    key={pNum}
                    type="button"
                    onClick={() => setPage(pNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-colors ${
                      page === pNum
                        ? 'bg-[#6366f1] text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pNum}
                  </button>
                )
              })}

              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center font-bold disabled:opacity-40 hover:bg-slate-50 transition-colors"
              >
                ›
              </button>

              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value))
                  setPage(1)
                }}
                className="ml-2 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700"
              >
                <option value={6}>6 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>
        </div>

        {/* ================= RIGHT-SIDE RETURN DETAILS DRAWER ================= */}
        {selectedReturn && (
          <div className="w-full lg:w-[420px] shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-5 animate-in fade-in duration-200">
            {/* Drawer Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Return Details</p>
                <div className="flex items-center gap-2 mt-1">
                  <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {selectedReturn.return_no}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200">
                    {selectedReturn.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                  <span>Order # {selectedReturn.order_no || `ORD-${selectedReturn.order_id}`}</span>
                  <span>•</span>
                  <span>{formatDateDisplay(selectedReturn.created_at).date}</span>
                  <span>•</span>
                  <span>{selectedReturn.items?.length || 1} item</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedReturn(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold"
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            {drawerLoading ? (
              <div className="py-16 text-center text-slate-400">
                <Spinner />
              </div>
            ) : (
              <>
                {/* 1. Customer Information */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Customer Information</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5 text-xs">
                    <p className="font-bold text-slate-900 text-sm">{selectedReturn.customer_name}</p>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <span>📞</span>
                      <span className="font-mono">{selectedReturn.customer_phone || '—'}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-slate-600">
                      <span className="shrink-0 mt-0.5">📍</span>
                      <span className="leading-relaxed">
                        {selectedReturn.shipping_address || 'Address provided on order dispatch'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Product Information */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>Product Information</span>
                  </div>
                  <div className="space-y-2">
                    {(selectedReturn.items && selectedReturn.items.length > 0
                      ? selectedReturn.items
                      : [
                          {
                            id: 1,
                            product_name_snapshot: selectedReturn.first_item_name || 'Product Item',
                            image_path: selectedReturn.first_item_image,
                            qty: selectedReturn.total_returned_qty || 1,
                            unit_price: selectedReturn.total_amount || 0,
                          },
                        ]
                    ).map((item, idx) => {
                      const itemImg = imageUrl(item.image_path)
                      return (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center gap-3 text-xs"
                        >
                          {itemImg ? (
                            <img
                              src={itemImg}
                              alt={item.product_name_snapshot}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 text-slate-400 flex items-center justify-center shrink-0">
                              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h4 className="font-bold text-slate-900 truncate">
                                {item.product_name_snapshot}
                              </h4>
                              <span className="font-bold text-slate-900 shrink-0">
                                ₹{Number(item.unit_price).toLocaleString('en-IN')}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5">x {item.qty}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Weight: 500g | Size: 10 × 10 × 5 cm
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Return Request */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Return Request</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Reason:</span>
                      <span className="font-bold text-slate-900">{selectedReturn.reason}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Type:</span>
                      <span className="font-bold text-[#6366f1]">{selectedReturn.return_type}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Requested Date:</span>
                      <span className="font-semibold text-slate-700">
                        {formatDateDisplay(selectedReturn.created_at).full}
                      </span>
                    </div>
                    {selectedReturn.notes && (
                      <div className="pt-1 border-t border-slate-200 text-slate-600">
                        <span className="font-semibold text-slate-700">Notes:</span> {selectedReturn.notes}
                      </div>
                    )}
                    {selectedReturn.rejection_reason && (
                      <div className="pt-1 border-t border-rose-200 text-rose-700 font-medium">
                        <span className="font-bold text-rose-800">Rejection Reason:</span>{' '}
                        {selectedReturn.rejection_reason}
                      </div>
                    )}
                    {selectedReturn.reported_condition && (
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                        <span className="text-slate-500">Customer-Reported Condition:</span>
                        <span className="font-semibold text-slate-700">{selectedReturn.reported_condition.replace(/_/g, ' ')}</span>
                      </div>
                    )}
                    {selectedReturn.packaging_available !== undefined && selectedReturn.packaging_available !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Package/Accessories Available:</span>
                        <span className="font-semibold text-slate-700">{Number(selectedReturn.packaging_available) === 1 ? 'Yes' : 'No'}</span>
                      </div>
                    )}
                  </div>
                  {selectedReturn.images && selectedReturn.images.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Supporting Photos</span>
                      <div className="flex flex-wrap gap-2">
                        {selectedReturn.images.map((img) => (
                          <a key={img.id} href={imageUrl(img.image_path) || '#'} target="_blank" rel="noopener noreferrer">
                            <img
                              src={imageUrl(img.thumb_path || img.image_path) || undefined}
                              alt="Return evidence"
                              className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                            />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. Return Tracking (Vertical Timeline) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                    </svg>
                    <span>Return Tracking</span>
                  </div>

                  {/* Vertical Chronological Timeline */}
                  <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs">
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {/* Step 1: Return Requested */}
                      <div className="relative">
                        <span className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#6366f1] text-white flex items-center justify-center text-[9px] font-bold">
                          ✓
                        </span>
                        <p className="font-bold text-slate-900 leading-tight">Return Requested</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDateDisplay(selectedReturn.created_at).full}
                        </p>
                      </div>

                      {/* Step 2: Approved */}
                      <div className="relative">
                        <span
                          className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            ['APPROVED', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'].includes(
                              selectedReturn.status
                            )
                              ? 'bg-[#6366f1] text-white'
                              : 'bg-slate-200 text-slate-400'
                          }`}
                        >
                          ✓
                        </span>
                        <p className="font-bold text-slate-900 leading-tight">Approved</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {['APPROVED', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'].includes(
                            selectedReturn.status
                          )
                            ? formatDateDisplay(selectedReturn.updated_at).full
                            : 'Pending review'}
                        </p>
                      </div>

                      {/* Step 3: Pickup Scheduled */}
                      <div className="relative">
                        <span
                          className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            ['PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'].includes(
                              selectedReturn.status
                            )
                              ? 'bg-[#6366f1] text-white'
                              : 'bg-slate-200 text-slate-400'
                          }`}
                        >
                          ✓
                        </span>
                        <p className="font-bold text-slate-900 leading-tight">Pickup Scheduled</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {selectedReturn.pickup_scheduled_at
                            ? formatDateDisplay(selectedReturn.pickup_scheduled_at).full
                            : ['PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'].includes(
                                selectedReturn.status
                              )
                            ? selectedReturn.pickup_partner || 'Scheduled'
                            : 'Pending'}
                        </p>
                      </div>

                      {/* Step 4: Item Received */}
                      <div className="relative">
                        <span
                          className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            ['ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'].includes(
                              selectedReturn.status
                            )
                              ? 'bg-teal-500 text-white'
                              : 'bg-slate-200 text-slate-400'
                          }`}
                        >
                          ✓
                        </span>
                        <p className="font-bold text-slate-900 leading-tight">Item Received</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {['ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED'].includes(
                            selectedReturn.status
                          )
                            ? 'Received at warehouse'
                            : 'Pending'}
                        </p>
                      </div>

                      {/* Step 5: Inspection */}
                      <div className="relative">
                        <span
                          className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                            ['INSPECTION', 'PROCESSING', 'COMPLETED'].includes(selectedReturn.status)
                              ? 'bg-[#6366f1] text-white'
                              : 'bg-slate-200 text-slate-400'
                          }`}
                        >
                          ✓
                        </span>
                        <p className="font-bold text-slate-900 leading-tight">Inspection</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {selectedReturn.inspection_condition
                            ? `Condition: ${selectedReturn.inspection_condition}`
                            : 'Pending'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Delivery / Pickup Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    <span>Delivery / Pickup Details</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-slate-500 text-[11px]">
                        Pickup Partner:{' '}
                        <strong className="text-slate-800">{selectedReturn.pickup_partner || 'Bluedart'}</strong>
                      </p>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Tracking ID:{' '}
                        <strong className="text-slate-900 font-mono">
                          {selectedReturn.pickup_tracking_id || 'BD781240'}
                        </strong>
                      </p>
                    </div>

                    <a
                      href={
                        selectedReturn.pickup_tracking_url ||
                        `https://www.google.com/search?q=${encodeURIComponent(
                          (selectedReturn.pickup_partner || 'Bluedart') + ' ' + (selectedReturn.pickup_tracking_id || 'BD781240')
                        )}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#c7d2fe] bg-[#f5f4ff] hover:bg-[#ecebff] text-[#4f46e5] font-bold text-xs transition-colors"
                    >
                      <span>Track Shipment</span>
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>

                {/* 6. Payment & Refund */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span>Payment &amp; Refund</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Payment Status</span>
                      <span className="px-2.5 py-0.5 rounded-full font-bold text-amber-800 bg-amber-50 border border-amber-200">
                        {selectedReturn.payment_status || 'Unpaid (COD)'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Refund Status</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold ${
                          selectedReturn.refund_status === 'REFUNDED'
                            ? 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                            : selectedReturn.refund_status === 'NOT_APPLICABLE'
                            ? 'text-slate-600 bg-slate-100'
                            : 'text-purple-800 bg-purple-50 border border-purple-200'
                        }`}
                      >
                        {selectedReturn.refund_status || 'Pending'}
                      </span>
                    </div>

                    {selectedReturn.return_type === 'REFUND' &&
                      selectedReturn.refund_status !== 'REFUNDED' && (
                        <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                          <div>
                            <span className="text-[11px] text-slate-500">Refund Amount:</span>
                            <p className="font-extrabold text-slate-900 text-sm">
                              ₹{Number(selectedReturn.refund_amount || selectedReturn.total_amount).toFixed(2)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openRefundModal(selectedReturn)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                          >
                            Process Refund
                          </button>
                        </div>
                      )}
                  </div>
                </div>

                {/* 7. Action Buttons at the Bottom */}
                <div className="pt-2 border-t border-slate-100 space-y-2.5">
                  {/* Full-width Update Status Button */}
                  <button
                    type="button"
                    onClick={() => openStatusModal(selectedReturn)}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Update Status</span>
                  </button>

                  {/* Approve and Reject Buttons */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={selectedReturn.status !== 'PENDING_REVIEW'}
                      onClick={() => handleQuickApprove(selectedReturn)}
                      className="py-2 px-3 rounded-xl border border-emerald-500 text-emerald-700 hover:bg-emerald-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-sm">✓</span>
                      <span>Approve</span>
                    </button>

                    <button
                      type="button"
                      disabled={!['PENDING_REVIEW', 'APPROVED'].includes(selectedReturn.status)}
                      onClick={() => openRejectModal(selectedReturn)}
                      className="py-2 px-3 rounded-xl border border-rose-400 text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <span className="text-sm">✕</span>
                      <span>Reject</span>
                    </button>
                  </div>

                  {selectedReturn.return_type === 'REPLACEMENT' &&
                    ['APPROVED', 'PROCESSING'].includes(selectedReturn.status) &&
                    !selectedReturn.replacement_order_id && (
                      <button
                        type="button"
                        onClick={() => handleCreateReplacement(selectedReturn)}
                        className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        Process Replacement — Create Fulfillment Order
                      </button>
                    )}
                  {selectedReturn.replacement_order_id && (
                    <p className="text-[11px] text-center text-slate-500 font-semibold">
                      Replacement order #{selectedReturn.replacement_order_id} created ({selectedReturn.replacement_status})
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
        </>
      )}

      {/* ================= NEW RETURN MODAL ================= */}
      {showNewReturnModal && (
        <Modal title="Create New Return Request" onClose={() => setShowNewReturnModal(false)}>
          <form onSubmit={handleCreateReturnSubmit} className="space-y-4 text-xs">
            {fetchingEligible ? (
              <div className="py-10 text-center"><Spinner /></div>
            ) : eligibleOrders.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 text-amber-800 text-center font-medium">
                No delivered orders eligible for return found.
              </div>
            ) : (
              <>
                {/* 1. Order Picker */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Select Delivered Order *
                  </label>
                  <select
                    value={selectedEligibleOrder?.order_id || ''}
                    onChange={(e) => {
                      const found = eligibleOrders.find((o) => o.order_id === Number(e.target.value))
                      if (found) selectOrderForReturn(found)
                    }}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
                  >
                    {eligibleOrders.map((o) => (
                      <option key={o.order_id} value={o.order_id}>
                        {o.order_no} — {o.customer_name} ({o.customer_phone}) · ₹{Number(o.grand_total).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Order Items Selection with Quantity Limits */}
                {selectedEligibleOrder && (
                  <div className="space-y-2">
                    <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Select Items and Quantities to Return
                    </span>
                    <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
                      {selectedEligibleOrder.items.map((item) => {
                        const currentQty = returnItemQtys[item.variant_id] || 0
                        return (
                          <div
                            key={item.order_item_id}
                            className="p-3 flex items-center justify-between gap-3 hover:bg-slate-50/50"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 truncate">{item.product_name}</p>
                              <p className="text-[11px] text-slate-500">
                                SKU: {item.sku} · Ordered: {item.ordered_quantity} · Returnable:{' '}
                                <strong className="text-emerald-700">{item.remaining_returnable_qty}</strong>
                              </p>
                              <p className="text-[11px] font-bold text-[#6366f1]">
                                ₹{item.unit_price.toFixed(2)} / unit
                              </p>
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-[11px] text-slate-500">Qty:</label>
                              <input
                                type="number"
                                min={0}
                                max={item.remaining_returnable_qty}
                                value={currentQty}
                                onChange={(e) => {
                                  const val = Math.min(
                                    item.remaining_returnable_qty,
                                    Math.max(0, parseInt(e.target.value) || 0)
                                  )
                                  setReturnItemQtys((prev) => ({ ...prev, [item.variant_id]: val }))
                                }}
                                className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold text-slate-900"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Return Type & Reason */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Return Type *
                    </label>
                    <select
                      value={newReturnType}
                      onChange={(e) => setNewReturnType(e.target.value as 'REFUND' | 'REPLACEMENT')}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    >
                      <option value="REPLACEMENT">Replacement</option>
                      <option value="REFUND">Refund</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Reason *
                    </label>
                    <select
                      value={newReturnReason}
                      onChange={(e) => setNewReturnReason(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    >
                      <option value="Wrong product">Wrong product</option>
                      <option value="Defective">Defective</option>
                      <option value="Damaged item">Damaged item</option>
                      <option value="Size issue">Size issue</option>
                      <option value="Fabric issue">Fabric issue</option>
                      <option value="Not fitting">Not fitting</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* 4. Pickup Partner & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Pickup Partner
                    </label>
                    <input
                      type="text"
                      value={newPickupPartner}
                      onChange={(e) => setNewPickupPartner(e.target.value)}
                      placeholder="e.g. Bluedart, Delhivery"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Customer / Return Notes
                    </label>
                    <input
                      type="text"
                      value={newReturnNotes}
                      onChange={(e) => setNewReturnNotes(e.target.value)}
                      placeholder="Optional notes…"
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <Button type="button" variant="secondary" onClick={() => setShowNewReturnModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creatingReturn}>
                    {creatingReturn ? 'Creating Return…' : 'Submit Return Request'}
                  </Button>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {/* ================= UPDATE STATUS MODAL ================= */}
      {showStatusModal && selectedReturn && (
        <Modal title={`Update Status: ${selectedReturn.return_no}`} onClose={() => setShowStatusModal(false)}>
          <form onSubmit={handleStatusSubmit} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-slate-600">
                Current Status:{' '}
                <strong className="text-slate-900 font-bold">{selectedReturn.status.replace(/_/g, ' ')}</strong>
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                New Target Status *
              </label>
              <select
                value={statusTargetStatus}
                onChange={(e) => setStatusTargetStatus(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
              >
                {(ALLOWED_TRANSITIONS[selectedReturn.status] || []).map((st) => (
                  <option key={st} value={st}>
                    {st.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* If Transitioning to PICKUP_SCHEDULED */}
            {statusTargetStatus === 'PICKUP_SCHEDULED' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
                <span className="block text-[11px] font-bold text-purple-900 uppercase tracking-wider">
                  Pickup Partner &amp; Tracking Information
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">Pickup Courier</label>
                    <input
                      type="text"
                      value={statusPickupPartner}
                      onChange={(e) => setStatusPickupPartner(e.target.value)}
                      placeholder="e.g. Bluedart"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">Tracking ID / AWB</label>
                    <input
                      type="text"
                      value={statusPickupTrackingId}
                      onChange={(e) => setStatusPickupTrackingId(e.target.value)}
                      placeholder="e.g. BD781240"
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* If Transitioning to INSPECTION */}
            {statusTargetStatus === 'INSPECTION' && (
              <div className="space-y-3 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                <span className="block text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                  Quality Inspection Result
                </span>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">Condition *</label>
                  <select
                    value={statusCondition}
                    onChange={(e) => setStatusCondition(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  >
                    <option value="RESELLABLE">RESELLABLE (Restocks into inventory automatically)</option>
                    <option value="DAMAGED">DAMAGED (Scrap)</option>
                    <option value="DEFECTIVE">DEFECTIVE (Supplier claim)</option>
                    <option value="QUARANTINED">QUARANTINED (Hold)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">Inspection Notes</label>
                  <input
                    type="text"
                    value={statusInspectionNotes}
                    onChange={(e) => setStatusInspectionNotes(e.target.value)}
                    placeholder="e.g. Item in original packaging, tags intact"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Status Note / Timeline Comment
              </label>
              <input
                type="text"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="Optional note recorded in tracking history…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowStatusModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={statusSubmitting}>
                {statusSubmitting ? 'Updating…' : 'Confirm Status Change'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= REJECT RETURN MODAL ================= */}
      {showRejectModal && selectedReturn && (
        <Modal title={`Reject Return: ${selectedReturn.return_no}`} onClose={() => setShowRejectModal(false)}>
          <form onSubmit={handleRejectSubmit} className="space-y-4 text-xs">
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
              <p className="font-bold">Are you sure you want to reject this return?</p>
              <p className="text-[11px] mt-0.5">A valid rejection reason is mandatory and will be visible in customer tracking.</p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Rejection Reason *
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 mb-2"
              >
                <option value="">Select standard rejection reason…</option>
                <option value="Item damaged by customer after delivery">Item damaged by customer after delivery</option>
                <option value="Return policy window expired (> 7 days)">Return policy window expired (&gt; 7 days)</option>
                <option value="Missing original tags and packaging">Missing original tags and packaging</option>
                <option value="Item has been washed or worn">Item has been washed or worn</option>
                <option value="Non-returnable hygiene/perishable item">Non-returnable hygiene/perishable item</option>
              </select>

              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Or type custom rejection reason…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Internal Note (Optional)
              </label>
              <input
                type="text"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Additional audit notes…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowRejectModal(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={rejectSubmitting || !rejectReason.trim()}>
                {rejectSubmitting ? 'Rejecting…' : 'Confirm Rejection'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ================= REFUND MODAL ================= */}
      {showRefundModal && selectedReturn && (
        <Modal title={`Process Refund: ${selectedReturn.return_no}`} onClose={() => setShowRefundModal(false)}>
          <form onSubmit={handleRefundSubmit} className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Refund Amount</span>
              <p className="text-2xl font-black text-emerald-700">
                ₹{Number(selectedReturn.refund_amount || selectedReturn.total_amount).toFixed(2)}
              </p>
              <p className="text-[11px] text-emerald-800">
                This will create a credit finance ledger entry and update order payment reconciliation.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Refund Payment Method *
              </label>
              <select
                value={refundPaymentMethod}
                onChange={(e) => setRefundPaymentMethod(e.target.value as any)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
              >
                <option value="UPI">UPI / Instant Online</option>
                <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                <option value="CASH">Cash Refund</option>
                <option value="ORIGINAL">Original Payment Gateway</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowRefundModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={refundSubmitting}>
                {refundSubmitting ? 'Processing Refund…' : 'Issue Refund'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
