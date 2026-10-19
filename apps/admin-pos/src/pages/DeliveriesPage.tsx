import { useEffect, useState, useTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

// --- Interfaces ---

interface DeliveryItem {
  id: number
  order_id: number
  order_no: string
  order_status: string
  payment_status: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIALLY_REFUNDED' | 'REFUNDED'
  payment_method?: string
  grand_total: string
  subtotal: string
  placed_at: string
  customer_name: string
  customer_phone: string
  shipping_line1: string
  shipping_line2: string | null
  shipping_city_district: string
  shipping_state: string
  shipping_pincode: string
  customer_email?: string | null
  delivery_channel: 'OWN_DELIVERY' | 'COURIER'
  courier_partner_id?: number | null
  courier: string | null
  courier_partner: string | null
  courier_name?: string | null
  awb: string | null
  tracking_number?: string | null
  tracking_url: string | null
  driver_id: number | null
  driver_name: string | null
  driver_phone: string | null
  vehicle_no: string | null
  status: 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'FAILED' | 'RETURN_INITIATED' | 'RETURNED'
  expected_delivery_date: string | null
  delivery_notes: string | null
  failure_reason: string | null
  package_weight_kg: string
  package_dimensions: string | null
  package_items_count: number
  cod_amount: string
  cod_collected_amount: string
  cod_status: 'NOT_APPLICABLE' | 'PENDING' | 'COLLECTED' | 'RECONCILED'
  cod_collected_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  created_at: string
  updated_at: string
  items_count: number
  first_item_name: string | null
  first_item_image: string | null
  items?: Array<{
    id: number
    product_name_snapshot: string
    variant_label_snapshot: string | null
    sku_snapshot: string
    quantity: number
    mrp: string
    unit_price: string
    line_total: string
    image_path: string | null
  }>
  history?: Array<{
    id: number
    from_status: string | null
    to_status: string
    source: string
    note: string | null
    location: string | null
    actor_name?: string | null
    created_at: string
  }>
}

interface SummaryMetrics {
  ready_to_dispatch: { count: number; amount: number }
  in_transit: { count: number; amount: number }
  delivered_today: { count: number; amount: number }
  cod_pending: { count: number; amount: number }
}

interface EligibleOrder {
  id: number
  order_no: string
  status: string
  payment_status: string
  payment_method?: string
  grand_total: string
  placed_at: string
  shipping_name: string
  shipping_phone: string
  shipping_line1: string
  shipping_line2?: string | null
  shipping_city_district: string
  shipping_state: string
  shipping_pincode: string
  items_count: number
  first_item_name: string | null
  items?: Array<{
    id: number
    product_name_snapshot: string
    variant_label_snapshot: string | null
    sku_snapshot: string
    quantity: number
    unit_price: string
    line_total: string
    image_path: string | null
  }>
}

interface CourierPartnerOption {
  id: number
  name: string
  code: string
  status: string
}

const PAGE_SIZE = 15

const STATUS_TONES: Record<string, 'slate' | 'green' | 'amber' | 'red' | 'purple' | 'teal'> = {
  PENDING: 'slate',
  ASSIGNED: 'purple',
  PICKED_UP: 'teal',
  IN_TRANSIT: 'teal',
  OUT_FOR_DELIVERY: 'amber',
  DELIVERED: 'green',
  FAILED: 'red',
  RETURN_INITIATED: 'amber',
  RETURNED: 'red',
}

const COURIER_OPTIONS = [
  'Blue Dart Express',
  'Delhivery Logistics',
  'DTDC Express',
  'Ekart Logistics',
  'Shadowfax Courier',
  'India Post (Speed Post)',
  'XpressBees',
  'FedEx Express',
]

export function DeliveriesPage() {
  const [, startTransition] = useTransition()

  // Data states
  const [deliveries, setDeliveries] = useState<DeliveryItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<SummaryMetrics | null>(null)
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({ all: 0, courier: 0, failed_returns: 0 })
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const [searchParams] = useSearchParams()

  // Filter states (External courier workflow only)
  const [activeTab, setActiveTab] = useState<'all' | 'ready_orders' | 'courier' | 'failed_returns'>('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [courierFilter, setCourierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deliveryArea, setDeliveryArea] = useState('')
  const [page, setPage] = useState(1)

  // Selection states
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // Drawer & Modals
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryItem | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false)
  const [isCodModalOpen, setIsCodModalOpen] = useState(false)

  // Form reference data
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([])
  const [courierPartners, setCourierPartners] = useState<CourierPartnerOption[]>([])

  // Modal sub-states
  const [statusTargetDelivery, setStatusTargetDelivery] = useState<DeliveryItem | null>(null)
  const [newStatusValue, setNewStatusValue] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [failureReason, setFailureReason] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [statusModalError, setStatusModalError] = useState<string | null>(null)

  // Reassign form state (Courier only)
  const [reassignCourierPartnerId, setReassignCourierPartnerId] = useState<number | ''>('')
  const [reassignCourier, setReassignCourier] = useState('')
  const [reassignAwb, setReassignAwb] = useState('')
  const [reassignEta, setReassignEta] = useState('')
  const [reassignSubmitting, setReassignSubmitting] = useState(false)

  // COD collection state
  const [codAmountInput, setCodAmountInput] = useState('')
  const [codNotesInput, setCodNotesInput] = useState('')
  const [codSubmitting, setCodSubmitting] = useState(false)

  // Add Delivery Form State (Courier only)
  const [addSelectedOrder, setAddSelectedOrder] = useState<EligibleOrder | null>(null)
  const [addCourierPartnerId, setAddCourierPartnerId] = useState<number | ''>('')
  const [addCourier, setAddCourier] = useState('Delhivery')
  const [addAwb, setAddAwb] = useState('')
  const [addEta, setAddEta] = useState(
    new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [addNotes, setAddNotes] = useState('')
  const [addWeight, setAddWeight] = useState('0.50')
  const [addDimensions, setAddDimensions] = useState('20x15x10 cm')
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Toast auto-clear
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 4000)
      return () => clearTimeout(t)
    }
  }, [actionSuccess])

  // Initial reference fetch
  useEffect(() => {
    fetchCourierPartners()
    fetchSummary()
    fetchEligibleOrders()
  }, [])

  // Search param handling (e.g. from Orders page dispatch link)
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId')
    const tabParam = searchParams.get('tab')
    if (tabParam === 'ready_orders') {
      setActiveTab('ready_orders')
    }
    if (orderIdParam) {
      const orderIdNum = Number(orderIdParam)
      api
        .get('/deliveries/eligible-orders')
        .then((res) => {
          const list: EligibleOrder[] = res.data.orders || []
          setEligibleOrders(list)
          const found = list.find((o) => o.id === orderIdNum)
          if (found) {
            openAddModal(found)
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  // Main deliveries query
  useEffect(() => {
    if (activeTab !== 'ready_orders') {
      fetchDeliveries()
    }
  }, [activeTab, page, statusFilter, courierFilter, dateFrom, dateTo, deliveryArea])

  async function fetchSummary() {
    try {
      const res = await api.get('/deliveries/summary')
      setSummary(res.data.summary)
    } catch {
      // Handled silently
    }
  }

  async function fetchCourierPartners() {
    try {
      const res = await api.get('/courier-partners', { params: { limit: 50 } })
      const list = res.data.items || []
      const activeOnly = list.filter((p: any) => p.status === 'ACTIVE')
      const options = activeOnly.length > 0 ? activeOnly : list
      setCourierPartners(options)
      if (options.length > 0 && !addCourierPartnerId) {
        setAddCourierPartnerId(options[0].id)
        setAddCourier(options[0].name)
      }
    } catch {
      setCourierPartners([])
    }
  }

  async function fetchEligibleOrders() {
    try {
      const res = await api.get('/deliveries/eligible-orders')
      setEligibleOrders(res.data.orders || [])
    } catch {
      setEligibleOrders([])
    }
  }

  async function fetchDeliveries() {
    setLoading(true)
    setActionError(null)
    try {
      const params: Record<string, string | number> = {
        tab: activeTab,
        page,
        limit: PAGE_SIZE,
      }
      if (search.trim()) params.search = search.trim()
      if (statusFilter) params.status = statusFilter
      if (courierFilter) params.courier_partner = courierFilter
      if (dateFrom) params.date_from = dateFrom
      if (dateTo) params.date_to = dateTo
      if (deliveryArea.trim()) params.delivery_area = deliveryArea.trim()

      const res = await api.get('/deliveries', { params })
      setDeliveries(res.data.deliveries || [])
      setTotal(res.data.total ?? 0)
      if (res.data.tab_counts) {
        setTabCounts(res.data.tab_counts)
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to load deliveries'))
    } finally {
      setLoading(false)
    }
  }

  async function openDrawer(deliveryId: number) {
    setDrawerLoading(true)
    try {
      const res = await api.get(`/deliveries/${deliveryId}`)
      setSelectedDelivery(res.data.delivery)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to fetch delivery details'))
    } finally {
      setDrawerLoading(false)
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchDeliveries()
  }

  function handleResetFilters() {
    setSearch('')
    setStatusFilter('')
    setCourierFilter('')
    setDateFrom('')
    setDateTo('')
    setDeliveryArea('')
    setPage(1)
    startTransition(() => {
      fetchDeliveries()
    })
  }

  // --- Add Delivery Flow ---
  function openAddModal(orderToSelect?: EligibleOrder) {
    fetchEligibleOrders()
    setAddSelectedOrder(orderToSelect || null)
    const defaultPartner = courierPartners[0]
    setAddCourierPartnerId(defaultPartner?.id || '')
    setAddCourier(defaultPartner?.name || 'Delhivery')
    setAddAwb('')
    setAddNotes('')
    setAddWeight('0.50')
    setAddDimensions('20x15x10 cm')
    setIsAddModalOpen(true)
  }

  async function handleCreateDelivery(e: React.FormEvent) {
    e.preventDefault()
    if (!addSelectedOrder) {
      setActionError('Please select an order to create delivery')
      return
    }

    setAddSubmitting(true)
    try {
      const payload: Record<string, any> = {
        order_id: addSelectedOrder.id,
        delivery_channel: 'COURIER',
        courier_partner_id: addCourierPartnerId ? Number(addCourierPartnerId) : undefined,
        courier_partner: addCourier,
        courier: addCourier,
        expected_delivery_date: addEta || null,
        delivery_notes: addNotes || null,
        package_weight_kg: parseFloat(addWeight) || 0.50,
        package_dimensions: addDimensions || null,
      }

      if (addAwb.trim()) payload.awb = addAwb.trim()

      await api.post(`/orders/${addSelectedOrder.id}/delivery`, payload)
      setIsAddModalOpen(false)
      setActionSuccess(`Delivery created successfully for Order #${addSelectedOrder.order_no}`)
      fetchDeliveries()
      fetchSummary()
      fetchEligibleOrders()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to create delivery'))
    } finally {
      setAddSubmitting(false)
    }
  }

  // --- Status Update Flow ---
  function openStatusModal(del: DeliveryItem) {
    setStatusTargetDelivery(del)
    setNewStatusValue('')
    setStatusNote('')
    setFailureReason('')
    setStatusModalError(null)
    setIsStatusModalOpen(true)
  }

  async function handleUpdateStatusSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!statusTargetDelivery || !newStatusValue) return

    setStatusSubmitting(true)
    setStatusModalError(null)
    try {
      const payload: Record<string, any> = {
        status: newStatusValue,
        note: statusNote.trim() || undefined,
      }
      if (newStatusValue === 'FAILED') {
        payload.failure_reason = failureReason.trim() || statusNote.trim()
      }

      const res = await api.put(`/deliveries/${statusTargetDelivery.id}/status`, payload)
      setIsStatusModalOpen(false)
      setActionSuccess(`Delivery #${statusTargetDelivery.id} status updated to ${newStatusValue}`)

      // Update local item
      if (selectedDelivery && selectedDelivery.id === statusTargetDelivery.id) {
        setSelectedDelivery(res.data.delivery)
      }
      fetchDeliveries()
      fetchSummary()
    } catch (err) {
      const errMsg = apiErrorMessage(err, 'Could not update delivery status')
      setStatusModalError(errMsg)
      setActionError(errMsg)
    } finally {
      setStatusSubmitting(false)
    }
  }

  // --- Reassignment Flow (Courier only) ---
  function openReassignModal(del: DeliveryItem) {
    setStatusTargetDelivery(del)
    const existingPartner = courierPartners.find(
      (cp) => cp.name === del.courier_partner || cp.name === del.courier
    )
    setReassignCourierPartnerId(del.courier_partner_id || existingPartner?.id || (courierPartners[0]?.id ?? ''))
    setReassignCourier(del.courier_partner || del.courier || courierPartners[0]?.name || 'Delhivery')
    setReassignAwb(del.awb || '')
    setReassignEta(del.expected_delivery_date || '')
    setIsReassignModalOpen(true)
  }

  async function handleReassignSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!statusTargetDelivery) return

    setReassignSubmitting(true)
    try {
      const payload: Record<string, any> = {
        delivery_channel: 'COURIER',
        courier_partner_id: reassignCourierPartnerId ? Number(reassignCourierPartnerId) : undefined,
        courier_partner: reassignCourier,
        courier: reassignCourier,
        awb: reassignAwb.trim() || null,
        expected_delivery_date: reassignEta || null,
      }

      const res = await api.put(`/deliveries/${statusTargetDelivery.id}/assignment`, payload)
      setIsReassignModalOpen(false)
      setActionSuccess(`Assignment updated for Delivery #${statusTargetDelivery.id}`)

      if (selectedDelivery && selectedDelivery.id === statusTargetDelivery.id) {
        setSelectedDelivery(res.data.delivery)
      }
      fetchDeliveries()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to update assignment'))
    } finally {
      setReassignSubmitting(false)
    }
  }

  // --- COD Collection Flow ---
  function openCodModal(del: DeliveryItem) {
    setStatusTargetDelivery(del)
    setCodAmountInput(del.cod_amount || del.grand_total || '0')
    setCodNotesInput('')
    setIsCodModalOpen(true)
  }

  async function handleCodSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!statusTargetDelivery) return

    const amount = parseFloat(codAmountInput)
    if (isNaN(amount) || amount <= 0) {
      setActionError('Please enter a valid collection amount')
      return
    }

    setCodSubmitting(true)
    try {
      const res = await api.post(`/deliveries/${statusTargetDelivery.id}/cod-collect`, {
        amount,
        notes: codNotesInput.trim() || undefined,
      })
      setIsCodModalOpen(false)
      setActionSuccess(`COD of ₹${amount.toFixed(2)} recorded and reconciled for Order #${statusTargetDelivery.order_no}`)

      if (selectedDelivery && selectedDelivery.id === statusTargetDelivery.id) {
        setSelectedDelivery(res.data.delivery)
      }
      fetchDeliveries()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to record COD collection'))
    } finally {
      setCodSubmitting(false)
    }
  }

  // Checkbox Selection
  function handleSelectAll(checked: boolean) {
    if (checked && deliveries) {
      setSelectedIds(deliveries.map((d) => d.id))
    } else {
      setSelectedIds([])
    }
  }

  function handleSelectRow(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="space-y-6 pb-12">
      {/* ================= PAGE HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Deliveries</span>
            <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--color-primary-tint)] text-[var(--color-brand)] border border-[var(--color-border-subtle)]">
              Fulfillment Hub
            </span>
          </h1>
          <p className="text-xs text-slate-700 font-bold mt-1">
            Manage shipments, external courier partners, dispatch and live tracking.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button variant="secondary" onClick={() => { fetchSummary(); fetchDeliveries(); }} className="text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </Button>

          <Button variant="primary" onClick={() => openAddModal()} className="text-xs shadow-md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Add Delivery</span>
          </Button>
        </div>
      </div>

      {/* ================= ACTION ALERTS ================= */}
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

      {/* ================= DATA-DRIVEN SUMMARY CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Ready to Dispatch */}
        <div
          onClick={() => {
            setActiveTab('ready_orders')
            setPage(1)
          }}
          className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all cursor-pointer relative overflow-hidden group"
          title="Click to view all orders ready for delivery dispatch"
        >
          <div className="absolute top-0 left-0 h-1 w-full bg-purple-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Ready to Dispatch</span>
            <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {eligibleOrders.length > 0 ? eligibleOrders.length : (summary ? summary.ready_to_dispatch.count : '—')}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              {eligibleOrders.length > 0 ? `${eligibleOrders.length} order(s) waiting to dispatch →` : 'All orders dispatched'}
            </p>
          </div>
        </div>

        {/* Card 2: In Transit */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 h-1 w-full bg-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">In Transit</span>
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {summary ? summary.in_transit.count : '—'}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              ₹{summary ? summary.in_transit.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'} · Active on route
            </p>
          </div>
        </div>

        {/* Card 3: Delivered Today */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 h-1 w-full bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">Delivered Today</span>
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {summary ? summary.delivered_today.count : '—'}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              ₹{summary ? summary.delivered_today.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'} · Completed
            </p>
          </div>
        </div>

        {/* Card 4: COD Pending */}
        <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 left-0 h-1 w-full bg-amber-500" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-700">COD Pending</span>
            <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl sm:text-3xl font-black text-amber-700 tracking-tight">
              ₹{summary ? summary.cod_pending.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
            </p>
            <p className="text-xs font-bold text-slate-600 mt-0.5">
              {summary ? summary.cod_pending.count : '—'} shipment(s) to collect
            </p>
          </div>
        </div>
      </div>

      {/* ================= TABS & ADVANCED FILTERS ================= */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs p-5 space-y-4">
        {/* Delivery Tabs (External courier model) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-4">
          {[
            { id: 'all', label: 'All Deliveries', count: tabCounts.all },
            { id: 'ready_orders', label: 'Ready to Dispatch (Orders)', count: eligibleOrders.length },
            { id: 'courier', label: 'External Couriers', count: tabCounts.courier },
            { id: 'failed_returns', label: 'Failed / Returns', count: tabCounts.failed_returns },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any)
                  setPage(1)
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Filter Toolbar Form */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Order #, Customer, AWB, Courier..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-8 pr-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:bg-white transition-colors"
              />
              <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Status Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending (Ready)</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="PICKED_UP">Picked Up</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed Attempt</option>
              <option value="RETURNED">Returned</option>
            </select>
          </div>

          {/* Courier Partner */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Courier Partner
            </label>
            <select
              value={courierFilter}
              onChange={(e) => { setCourierFilter(e.target.value); setPage(1); }}
              className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-slate-900"
            >
              <option value="">All Partners</option>
              {courierPartners.length > 0
                ? courierPartners.map((c) => (
                    <option key={c.id} value={c.name}>{c.name} ({c.code})</option>
                  ))
                : COURIER_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
            </select>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Delivery Area */}
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Area / City / Pincode
            </label>
            <input
              type="text"
              placeholder="e.g. Chennai, 600040, Adyar..."
              value={deliveryArea}
              onChange={(e) => setDeliveryArea(e.target.value)}
              className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-slate-50/50 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-900"
            />
          </div>

          {/* Actions */}
          <div className="lg:col-span-2 flex items-end gap-2">
            <Button type="submit" variant="primary" className="h-9 px-5 text-xs flex-1">
              Apply Filters
            </Button>
            <Button type="button" variant="secondary" onClick={handleResetFilters} className="h-9 px-4 text-xs">
              Reset
            </Button>
          </div>
        </form>
      </div>

      {/* ================= DELIVERY TABLE ================= */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {activeTab === 'ready_orders' ? (
          <div className="overflow-x-auto">
            <div className="p-4 bg-purple-50/50 border-b border-purple-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📦</span>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-xs">Confirmed Orders Awaiting Delivery Dispatch</h3>
                  <p className="text-[11px] text-slate-500">Select an order and assign an external courier partner (Delhivery, Blue Dart, DTDC, etc.) to generate AWB and initiate delivery tracking.</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-xs font-black">
                {eligibleOrders.length} Order(s) Eligible
              </span>
            </div>

            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-4 px-4">Order # &amp; Date</th>
                  <th className="py-4 px-4">Customer Details</th>
                  <th className="py-4 px-4">Shipping Destination</th>
                  <th className="py-4 px-4">Ordered Products</th>
                  <th className="py-4 px-4">Payment &amp; Mode</th>
                  <th className="py-4 px-4">Total Amount</th>
                  <th className="py-4 px-4 text-right">Dispatch Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {eligibleOrders.length > 0 ? (
                  eligibleOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        <span className="text-purple-700 font-black text-xs block">#{ord.order_no}</span>
                        <span className="text-[11px] text-slate-400 font-sans font-medium">
                          {new Date(ord.placed_at).toLocaleDateString('en-IN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900 text-xs">{ord.shipping_name}</p>
                        <p className="text-[11px] text-slate-500 font-medium">+91 {ord.shipping_phone}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="text-xs text-slate-800 font-medium truncate max-w-[220px]" title={`${ord.shipping_line1}, ${ord.shipping_city_district}, ${ord.shipping_state} - ${ord.shipping_pincode}`}>
                          {ord.shipping_line1}
                        </p>
                        <p className="text-[11px] text-slate-500 font-bold">
                          {ord.shipping_city_district}, {ord.shipping_state} ({ord.shipping_pincode})
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                            {ord.items_count} item(s)
                          </span>
                          <span className="text-xs text-slate-700 font-medium truncate max-w-[180px]" title={ord.first_item_name || ''}>
                            {ord.first_item_name || 'Order Items'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge tone={ord.payment_status === 'PAID' ? 'green' : 'amber'}>
                            {ord.payment_status}
                          </Badge>
                          <span className="text-[11px] font-bold text-slate-600 uppercase">
                            {ord.payment_method || 'COD'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-900 text-sm">
                        ₹{parseFloat(ord.grand_total).toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openAddModal(ord)}
                          className="shadow-xs text-xs font-bold"
                        >
                          ⚡ Assign Courier
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-medium text-xs">
                      No orders waiting for dispatch. All eligible orders have been assigned to deliveries!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Spinner />
            <p className="text-xs font-bold text-slate-500">Loading delivery records...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-4 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={deliveries !== null && deliveries.length > 0 && selectedIds.length === deliveries.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                    />
                  </th>
                  <th className="py-4 px-4">Order & Date</th>
                  <th className="py-4 px-4">Items / Product</th>
                  <th className="py-4 px-4">Customer & Area</th>
                  <th className="py-4 px-4">Courier Partner</th>
                  <th className="py-4 px-4">Tracking / AWB</th>
                  <th className="py-4 px-4">Delivery Status</th>
                  <th className="py-4 px-4">Payment & COD</th>
                  <th className="py-4 px-4">Expected Date</th>
                  <th className="py-4 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries && deliveries.length > 0 ? (
                  deliveries.map((d) => {
                    const isSelected = selectedIds.includes(d.id)
                    return (
                      <tr
                        key={d.id}
                        onClick={() => openDrawer(d.id)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isSelected ? 'bg-purple-50/30' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(d.id)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                          />
                        </td>

                        {/* Order No & Placed Date */}
                        <td className="py-3.5 px-4">
                          <p className="font-extrabold text-slate-950 text-xs hover:text-purple-700 transition-colors">
                            #{d.order_no}
                          </p>
                          <p className="text-[11px] text-slate-600 font-medium">
                            {new Date(d.placed_at || d.created_at).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </td>

                        {/* Items / Product Thumbnail */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                              {d.first_item_image ? (
                                <img
                                  src={d.first_item_image.startsWith('http') ? d.first_item_image : `http://localhost:8080/${d.first_item_image.replace(/^\/+/, '')}`}
                                  alt={d.first_item_name || 'Product'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none'
                                  }}
                                />
                              ) : (
                                <span className="text-[10px] font-black text-slate-400">IMG</span>
                              )}
                            </div>
                            <div className="max-w-[160px] truncate">
                              <p className="font-bold text-slate-800 text-xs truncate">
                                {d.first_item_name || 'Order Items'}
                              </p>
                              <p className="text-[11px] text-slate-600 font-medium">
                                {d.items_count} item{d.items_count > 1 ? 's' : ''} · {d.package_weight_kg || '0.50'} kg
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Customer & Area */}
                        <td className="py-3.5 px-4">
                          <p className="font-bold text-slate-900 text-xs">{d.customer_name}</p>
                          <p className="text-[11px] text-slate-600">
                            {d.shipping_city_district || 'Chennai'} {d.shipping_pincode ? `(${d.shipping_pincode})` : ''}
                          </p>
                        </td>

                        {/* Courier Partner */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                              <span>Courier</span>
                            </span>
                            <p className="text-[11px] font-bold text-slate-800 mt-0.5">
                              {d.courier_partner || d.courier || 'Standard Courier'}
                            </p>
                          </div>
                        </td>

                        {/* Tracking / AWB */}
                        <td className="py-3.5 px-4 font-mono text-[11px]">
                          {d.awb ? (
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <span className="font-bold">{d.awb}</span>
                              {d.tracking_url && (
                                <a
                                  href={d.tracking_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-slate-400 hover:text-purple-600"
                                >
                                  ↗
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Delivery Status */}
                        <td className="py-3.5 px-4">
                          <Badge tone={STATUS_TONES[d.status] || 'slate'}>
                            {d.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>

                        {/* Payment & COD */}
                        <td className="py-3.5 px-4">
                          {d.cod_status === 'PENDING' ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-800 border border-amber-200">
                                COD: ₹{parseFloat(d.cod_amount || d.grand_total).toFixed(2)}
                              </span>
                              <p className="text-[10px] font-semibold text-amber-700">Collection Pending</p>
                            </div>
                          ) : d.cod_status === 'COLLECTED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                              COD Paid (₹{parseFloat(d.cod_collected_amount || d.grand_total).toFixed(2)})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Prepaid (PAID)
                            </span>
                          )}
                        </td>

                        {/* Expected Date */}
                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-700">
                          {d.expected_delivery_date ? (
                            new Date(d.expected_delivery_date).toLocaleDateString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDrawer(d.id)}
                              className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[11px] transition-colors"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => openStatusModal(d)}
                              className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-[11px] transition-colors"
                            >
                              Status
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="max-w-sm mx-auto space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                        <p className="text-sm font-bold text-slate-900">No deliveries match current filters</p>
                        <p className="text-xs text-slate-500">
                          Try resetting filters or click "Add Delivery" to create shipments from confirmed orders.
                        </p>
                        <Button variant="secondary" onClick={handleResetFilters} className="mt-2 text-xs">
                          Clear Filters
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {activeTab !== 'ready_orders' && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs">
            <span className="text-slate-500 font-medium">
              Showing page <strong className="text-slate-900">{page}</strong> of{' '}
              <strong className="text-slate-900">{totalPages}</strong> ({total} total deliveries)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 font-bold disabled:opacity-40 hover:bg-slate-50 transition-colors text-xs"
              >
                ← Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3.5 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 font-bold disabled:opacity-40 hover:bg-slate-50 transition-colors text-xs"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= ORDER DETAILS SIDE DRAWER ================= */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div
            className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  Delivery #{selectedDelivery.id} · {selectedDelivery.order_no}
                </h2>
                <Badge tone={STATUS_TONES[selectedDelivery.status] || 'slate'}>
                  {selectedDelivery.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDelivery(null)}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {drawerLoading ? (
                <div className="py-20 text-center"><Spinner /></div>
              ) : (
                <>
                  {/* Customer & Shipping Card */}
                  <div className="p-4 rounded-3xl bg-slate-50/70 border border-slate-200/80 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Customer & Shipping Destination
                    </p>
                    <div className="space-y-1">
                      <p className="text-sm font-black text-slate-900">{selectedDelivery.customer_name}</p>
                      <p className="text-slate-600 font-bold">📞 {selectedDelivery.customer_phone}</p>
                      <p className="text-slate-600 leading-relaxed">
                        {selectedDelivery.shipping_line1}
                        {selectedDelivery.shipping_line2 ? `, ${selectedDelivery.shipping_line2}` : ''}
                        <br />
                        {selectedDelivery.shipping_city_district}, {selectedDelivery.shipping_state} - {selectedDelivery.shipping_pincode}
                      </p>
                    </div>
                  </div>

                  {/* Fulfillment & Carrier Card */}
                  <div className="p-4 rounded-3xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Dispatch & Fulfillment Details
                      </p>
                      <button
                        type="button"
                        onClick={() => openReassignModal(selectedDelivery)}
                        className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                      >
                        Reassign
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Courier Partner</span>
                        <p className="font-extrabold text-slate-900 mt-0.5">
                          {selectedDelivery.courier_partner || selectedDelivery.courier || 'Standard Courier'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Expected Delivery</span>
                        <p className="font-extrabold text-slate-900 mt-0.5">
                          {selectedDelivery.expected_delivery_date || 'Not specified'}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Tracking / AWB</span>
                        <p className="font-mono font-bold text-purple-700 mt-0.5 flex items-center gap-1">
                          <span>{selectedDelivery.awb || '—'}</span>
                          {selectedDelivery.tracking_url && (
                            <a href={selectedDelivery.tracking_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-purple-600">↗</a>
                          )}
                        </p>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Package Specs</span>
                        <p className="font-bold text-slate-900 mt-0.5">
                          {selectedDelivery.package_weight_kg || '0.50'} kg · {selectedDelivery.package_dimensions || 'Standard box'}
                        </p>
                      </div>
                    </div>

                    {selectedDelivery.failure_reason && (
                      <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs">
                        <strong className="block text-[10px] uppercase font-black tracking-wider text-rose-700">Failure / Exception Reason</strong>
                        {selectedDelivery.failure_reason}
                      </div>
                    )}
                  </div>

                  {/* Financial & COD Reconciliation Card */}
                  <div className="p-4 rounded-3xl bg-slate-50/70 border border-slate-200/80 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Payment & COD Accounting
                    </p>
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-200/60">
                      <span className="text-slate-600 font-semibold">Order Payment Status:</span>
                      <span className="font-black text-slate-900 uppercase">{selectedDelivery.payment_status}</span>
                    </div>

                    {selectedDelivery.cod_status === 'PENDING' ? (
                      <div className="flex items-center justify-between pt-1">
                        <div>
                          <p className="text-xs font-black text-amber-900">
                            Cash On Delivery Pending: ₹{parseFloat(selectedDelivery.cod_amount || selectedDelivery.grand_total).toFixed(2)}
                          </p>
                          <p className="text-[11px] text-amber-700">Collect cash upon package delivery</p>
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => openCodModal(selectedDelivery)}
                          className="text-xs bg-amber-600 hover:bg-amber-700"
                        >
                          Collect Cash
                        </Button>
                      </div>
                    ) : selectedDelivery.cod_status === 'COLLECTED' ? (
                      <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
                        <div>
                          <p className="font-black">COD Collected & Reconciled</p>
                          <p className="text-[11px] text-emerald-700">
                            ₹{parseFloat(selectedDelivery.cod_collected_amount || selectedDelivery.grand_total).toFixed(2)} recorded in finance ledger
                          </p>
                        </div>
                        <span className="text-xs font-black text-emerald-800">✓ Settled</span>
                      </div>
                    ) : (
                      <p className="text-slate-500 font-semibold text-xs">Prepaid Order (Grand Total: ₹{parseFloat(selectedDelivery.grand_total).toFixed(2)})</p>
                    )}
                  </div>

                  {/* Ordered Items */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Package Items ({selectedDelivery.items?.length || 0})
                    </p>
                    <div className="divide-y divide-slate-100 rounded-3xl border border-slate-200/80 overflow-hidden bg-white">
                      {selectedDelivery.items?.map((item) => (
                        <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                              {item.image_path ? (
                                <img
                                  src={item.image_path.startsWith('http') ? item.image_path : `http://localhost:8080/${item.image_path.replace(/^\/+/, '')}`}
                                  alt={item.product_name_snapshot}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                                />
                              ) : (
                                <span className="text-[10px] font-black text-slate-400">IMG</span>
                              )}
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-900">{item.product_name_snapshot}</p>
                              <p className="text-[11px] text-slate-500">
                                {item.variant_label_snapshot ? `${item.variant_label_snapshot} · ` : ''}Qty: {item.quantity} · SKU: {item.sku_snapshot}
                              </p>
                            </div>
                          </div>
                          <p className="font-black text-slate-900 text-right">
                            ₹{parseFloat(item.line_total).toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Delivery Tracking Timeline */}
                  <div className="space-y-3">
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                      Live Delivery Timeline
                    </p>
                    <div className="p-4 rounded-3xl border border-slate-200/80 bg-white space-y-4">
                      {selectedDelivery.history && selectedDelivery.history.length > 0 ? (
                        <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                          {selectedDelivery.history.map((ev, idx) => {
                            const isLatest = idx === selectedDelivery.history!.length - 1
                            return (
                              <div key={ev.id || idx} className="relative text-xs">
                                <span
                                  className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full ring-4 ring-white ${
                                    isLatest ? 'bg-purple-600 ring-purple-100' : 'bg-slate-300'
                                  }`}
                                />
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-black text-slate-900">
                                    {ev.to_status ? ev.to_status.replace(/_/g, ' ') : 'Status Updated'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {new Date(ev.created_at).toLocaleString('en-IN', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                                {ev.note && <p className="text-slate-600 text-[11px] mt-0.5">{ev.note}</p>}
                                {ev.actor_name && (
                                  <p className="text-[10px] text-slate-400">By {ev.actor_name}</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-3">No tracking events recorded yet.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
              <Button
                variant="secondary"
                onClick={() => openReassignModal(selectedDelivery)}
                className="text-xs"
              >
                Reassign Carrier / Driver
              </Button>

              <Button
                variant="primary"
                onClick={() => openStatusModal(selectedDelivery)}
                className="text-xs"
              >
                Update Delivery Status
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ADD DELIVERY MODAL ================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">Create New Delivery</h3>
                <p className="text-xs text-slate-500">Dispatch an eligible confirmed order to Own Fleet or Courier Partner.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDelivery} className="space-y-4 text-xs">
              {/* Select Eligible Order */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1.5">
                  1. Select Order for Fulfillment <span className="text-red-500">*</span>
                </label>
                {eligibleOrders.length === 0 ? (
                  <p className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 text-xs">
                    No unassigned eligible orders found. Create and confirm an order first!
                  </p>
                ) : (
                  <select
                    value={addSelectedOrder?.id || ''}
                    onChange={(e) => {
                      const found = eligibleOrders.find((o) => o.id === Number(e.target.value))
                      setAddSelectedOrder(found || null)
                    }}
                    required
                    className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                  >
                    <option value="">-- Choose an eligible order --</option>
                    {eligibleOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        #{o.order_no} · {o.shipping_name} ({o.shipping_city_district}) · ₹{parseFloat(o.grand_total).toFixed(2)} ({o.payment_status})
                      </option>
                    ))}
                  </select>
                )}
                {addSelectedOrder && (
                  <div className="mt-2.5 p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-1.5 text-xs text-slate-700 animate-in fade-in">
                    <div className="flex items-center justify-between font-bold text-slate-900">
                      <span>Order #{addSelectedOrder.order_no}</span>
                      <span className="text-purple-700 font-black">₹{parseFloat(addSelectedOrder.grand_total).toFixed(2)} ({addSelectedOrder.payment_method || 'COD'} / {addSelectedOrder.payment_status})</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      <span className="font-semibold text-slate-800">Ship To:</span> {addSelectedOrder.shipping_name} (+91 {addSelectedOrder.shipping_phone}) · {addSelectedOrder.shipping_line1}, {addSelectedOrder.shipping_city_district}, {addSelectedOrder.shipping_state} - {addSelectedOrder.shipping_pincode}
                    </p>
                    {addSelectedOrder.first_item_name && (
                      <p className="text-[11px] text-slate-500 font-medium">
                        <span className="font-semibold text-slate-700">Items ({addSelectedOrder.items_count}):</span> {addSelectedOrder.first_item_name}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Courier Partner Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1.5">
                    2. Courier Partner <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addCourierPartnerId}
                    onChange={(e) => {
                      const pid = Number(e.target.value) || ''
                      setAddCourierPartnerId(pid)
                      const found = courierPartners.find((cp) => cp.id === pid)
                      if (found) setAddCourier(found.name)
                    }}
                    required
                    className="w-full h-10 px-3 rounded-2xl border border-slate-200 bg-white text-xs font-semibold focus:outline-none focus:border-purple-600"
                  >
                    <option value="">-- Choose Courier Partner --</option>
                    {courierPartners.length > 0 ? (
                      courierPartners.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </option>
                      ))
                    ) : (
                      COURIER_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1.5">
                    AWB / Tracking Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={addAwb}
                    onChange={(e) => setAddAwb(e.target.value)}
                    className="w-full h-10 px-3 rounded-2xl border border-slate-200 bg-white text-xs font-mono focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Package Specs & ETA */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={addEta}
                    onChange={(e) => setAddEta(e.target.value)}
                    className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={addWeight}
                    onChange={(e) => setAddWeight(e.target.value)}
                    className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Dimensions
                  </label>
                  <input
                    type="text"
                    value={addDimensions}
                    onChange={(e) => setAddDimensions(e.target.value)}
                    className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-white text-xs"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Dispatch Notes / Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fragile items, deliver before 6 PM"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  className="w-full h-9 px-3 rounded-2xl border border-slate-200 bg-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={addSubmitting || !addSelectedOrder}>
                  {addSubmitting ? 'Creating Delivery…' : 'Confirm & Create Delivery'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= UPDATE STATUS MODAL ================= */}
      {isStatusModalOpen && statusTargetDelivery && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Update Status · Order #{statusTargetDelivery.order_no}
              </h3>
              <button
                type="button"
                onClick={() => setIsStatusModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 font-semibold">Current Status: </span>
              <strong className="text-slate-900 uppercase">{statusTargetDelivery.status.replace(/_/g, ' ')}</strong>
            </div>

            <form onSubmit={handleUpdateStatusSubmit} className="space-y-3.5 text-xs">
              {statusModalError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <span className="font-bold text-rose-900 shrink-0">⚠️ Error:</span>
                  <span>{statusModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Select Next Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={newStatusValue}
                  onChange={(e) => setNewStatusValue(e.target.value)}
                  required
                  className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 bg-white font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                >
                  <option value="">-- Choose New Status --</option>
                  {statusTargetDelivery.status === 'PENDING' && (
                    <>
                      <option value="ASSIGNED">ASSIGNED (Fleet / Courier assigned)</option>
                      <option value="PICKED_UP">PICKED_UP (Picked up from store)</option>
                      <option value="IN_TRANSIT">IN_TRANSIT (In transit)</option>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY (Out for delivery)</option>
                      <option value="DELIVERED">DELIVERED (Directly delivered)</option>
                      <option value="FAILED">FAILED (Delivery failed)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'ASSIGNED' && (
                    <>
                      <option value="PICKED_UP">PICKED_UP (Dispatched from hub)</option>
                      <option value="IN_TRANSIT">IN_TRANSIT (In transit via courier)</option>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY (Out for delivery today)</option>
                      <option value="DELIVERED">DELIVERED (Successfully delivered)</option>
                      <option value="FAILED">FAILED (Failed attempt)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'PICKED_UP' && (
                    <>
                      <option value="IN_TRANSIT">IN_TRANSIT (In transit)</option>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY (Out for delivery)</option>
                      <option value="DELIVERED">DELIVERED (Successfully delivered)</option>
                      <option value="FAILED">FAILED (Failed attempt)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'IN_TRANSIT' && (
                    <>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY (Out for delivery)</option>
                      <option value="DELIVERED">DELIVERED (Successfully delivered)</option>
                      <option value="FAILED">FAILED (Delivery failed)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'OUT_FOR_DELIVERY' && (
                    <>
                      <option value="DELIVERED">DELIVERED (Successfully delivered & signed)</option>
                      <option value="FAILED">FAILED (Customer unreachable / failed)</option>
                      <option value="IN_TRANSIT">IN_TRANSIT (Returned to hub / In transit)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'FAILED' && (
                    <>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY (Reattempt delivery)</option>
                      <option value="DELIVERED">DELIVERED (Successfully delivered after resolution)</option>
                      <option value="IN_TRANSIT">IN_TRANSIT (In transit / re-dispatched)</option>
                      <option value="PICKED_UP">PICKED_UP (Picked up from hub)</option>
                      <option value="ASSIGNED">ASSIGNED (Reassign driver / carrier)</option>
                      <option value="RETURN_INITIATED">RETURN_INITIATED (Initiate RTO return)</option>
                      <option value="RETURNED">RETURNED (Returned to warehouse)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'RETURN_INITIATED' && (
                    <>
                      <option value="RETURNED">RETURNED (Returned to warehouse)</option>
                      <option value="DELIVERED">DELIVERED (Return cancelled / delivered)</option>
                    </>
                  )}
                  {statusTargetDelivery.status === 'DELIVERED' && (
                    <>
                      <option value="RETURN_INITIATED">RETURN_INITIATED (Customer return approved)</option>
                      <option value="RETURNED">RETURNED (Returned directly)</option>
                    </>
                  )}
                </select>
              </div>

              {newStatusValue === 'FAILED' && (
                <div>
                  <label className="block text-[11px] font-bold text-rose-700 uppercase mb-1">
                    Failure / Exception Reason <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Customer unreachable, wrong address, rejected delivery"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    className="w-full h-9 px-3 rounded-2xl border border-rose-300 bg-rose-50/40 text-xs focus:outline-none focus:border-rose-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Status Remarks / Timeline Note
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Handed over to security, delivery OTP verified"
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  className="w-full p-3 rounded-2xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setIsStatusModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={statusSubmitting || !newStatusValue}>
                  {statusSubmitting ? 'Updating…' : 'Save Transition'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= REASSIGN MODAL ================= */}
      {isReassignModalOpen && statusTargetDelivery && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Reassign Carrier / Driver · #{statusTargetDelivery.order_no}
              </h3>
              <button
                type="button"
                onClick={() => setIsReassignModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReassignSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Courier Partner <span className="text-red-500">*</span>
                </label>
                <select
                  value={reassignCourierPartnerId}
                  onChange={(e) => {
                    const pid = Number(e.target.value) || ''
                    setReassignCourierPartnerId(pid)
                    const found = courierPartners.find((cp) => cp.id === pid)
                    if (found) setReassignCourier(found.name)
                  }}
                  required
                  className="w-full h-9 px-3 rounded-2xl border border-slate-200 font-semibold text-xs bg-white"
                >
                  <option value="">-- Choose Courier Partner --</option>
                  {courierPartners.length > 0 ? (
                    courierPartners.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))
                  ) : (
                    COURIER_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  AWB / Tracking Number
                </label>
                <input
                  type="text"
                  placeholder="AWB / Waybill number"
                  value={reassignAwb}
                  onChange={(e) => setReassignAwb(e.target.value)}
                  className="w-full h-9 px-3 rounded-2xl border border-slate-200 font-mono text-xs bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">Expected Delivery Date</label>
                <input
                  type="date"
                  value={reassignEta}
                  onChange={(e) => setReassignEta(e.target.value)}
                  className="w-full h-9 px-3 rounded-2xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setIsReassignModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={reassignSubmitting}>
                  {reassignSubmitting ? 'Saving…' : 'Save Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= COD COLLECTION MODAL ================= */}
      {isCodModalOpen && statusTargetDelivery && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                Collect Cash on Delivery
              </h3>
              <button
                type="button"
                onClick={() => setIsCodModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
              <p className="font-bold">Order #{statusTargetDelivery.order_no}</p>
              <p className="text-[11px] text-amber-800">
                Customer: {statusTargetDelivery.customer_name} ({statusTargetDelivery.customer_phone})
              </p>
            </div>

            <form onSubmit={handleCodSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Cash Collected Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={codAmountInput}
                  onChange={(e) => setCodAmountInput(e.target.value)}
                  className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm font-black text-slate-900 focus:outline-none focus:border-amber-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Collection Notes / Handover Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handed over to cashier by driver"
                  value={codNotesInput}
                  onChange={(e) => setCodNotesInput(e.target.value)}
                  className="w-full h-9 px-3 rounded-2xl border border-slate-200 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="secondary" onClick={() => setIsCodModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={codSubmitting}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {codSubmitting ? 'Recording…' : 'Confirm Cash Collected'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
