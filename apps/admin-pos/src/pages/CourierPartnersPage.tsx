import { useEffect, useState, type FormEvent } from 'react'
import { Button, Modal, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

// ================= TYPES & INTERFACES =================

export interface CourierPartner {
  id: number
  name: string
  code: string
  subtitle: string | null
  account_id: string
  logo_url: string | null
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE'
  integration_status: 'CONNECTED' | 'PENDING' | 'ERROR' | 'UNCONFIGURED'
  company_name: string | null
  contact_person: string | null
  email: string | null
  phone: string | null
  website: string | null
  supported_services: string[]
  service_areas: string[]
  auth_type: 'API_KEY' | 'BEARER_TOKEN' | 'OAUTH2' | 'BASIC'
  api_base_url: string | null
  webhook_url: string | null
  tracking_method: 'WEBHOOK' | 'POLLING'
  masked_api_key: string | null
  last_sync_at: string | null
  total_shipments: number
  success_rate: number | string
  avg_delivery_days: number | string
  error_notes: string | null
  created_at: string
  updated_at: string
  sync_logs?: Array<{
    id: number
    event_type: string
    status: string
    message: string
    payload_sanitized: any
    created_at: string
  }>
  recent_shipments?: Array<{
    id: number
    order_id: number
    order_no: string
    shipping_name: string
    status: string
    awb: string | null
    created_at: string
  }>
}

interface SummaryData {
  total_partners: { count: number; delta: string }
  active_partners: { count: number; delta: string }
  pending_setup: { count: number; delta: string }
  integration_issues: { count: number; delta: string }
}

// Helpers
function formatDateTime(dateStr?: string | null): { date: string; time: string; full: string } {
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

// Brand visual helper
function renderBrandLogo(code: string, name: string) {
  const upper = code.toUpperCase()
  if (upper === 'DELHIVERY') {
    return (
      <div className="w-10 h-10 rounded-xl bg-black text-white flex flex-col items-center justify-center font-black text-[9px] tracking-tighter shrink-0 shadow-xs">
        <span>DELHIVERY</span>
      </div>
    )
  }
  if (upper === 'BLUEDART' || upper.includes('BLUE')) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#002f6c] text-[#00b0ff] border border-blue-300/40 flex flex-col items-center justify-center font-black text-[9px] tracking-tight shrink-0 shadow-xs">
        <span className="text-white">BLUE</span>
        <span className="text-[#38bdf8]">DART</span>
      </div>
    )
  }
  if (upper === 'EKART') {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#2874f0] text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
        <span>ekart</span>
      </div>
    )
  }
  if (upper === 'SHADOWFAX') {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#fff3e0] border border-orange-200 text-[#ea580c] flex items-center justify-center font-black text-[10px] shrink-0 shadow-xs">
        <span>SF</span>
      </div>
    )
  }
  if (upper === 'ECOM_EXPRESS' || upper.includes('ECOM')) {
    return (
      <div className="w-10 h-10 rounded-xl bg-[#fee2e2] border border-red-200 text-[#dc2626] flex flex-col items-center justify-center font-black text-[8px] leading-tight shrink-0 shadow-xs">
        <span>ECOM</span>
        <span>EXPRESS</span>
      </div>
    )
  }
  if (upper === 'XPRESSBEES') {
    return (
      <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 text-amber-400 flex items-center justify-center font-black text-[9px] shrink-0 shadow-xs">
        <span>XB</span>
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

// ================= MAIN COMPONENT =================

export function CourierPartnersPage() {
  // Summary Metrics
  const [summary, setSummary] = useState<SummaryData>({
    total_partners: { count: 5, delta: '↑ 1 this month' },
    active_partners: { count: 4, delta: '↑ 1 this month' },
    pending_setup: { count: 1, delta: '0 this month' },
    integration_issues: { count: 0, delta: '0 this month' },
  })

  // List & Filter States
  const [partners, setPartners] = useState<CourierPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Filters
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')

  // Selection & Details Drawer
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [selectedPartner, setSelectedPartner] = useState<CourierPartner | null>(null)
  const [drawerTab, setDrawerTab] = useState<'overview' | 'services' | 'areas' | 'settings' | 'logs'>('overview')
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [revealedApiKey, setRevealedApiKey] = useState(false)

  // Modals & Action States
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Add / Edit Form State
  const [formId, setFormId] = useState<number | null>(null)
  const [formName, setFormName] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formSubtitle, setFormSubtitle] = useState('')
  const [formAccountId, setFormAccountId] = useState('')
  const [formCompanyName, setFormCompanyName] = useState('')
  const [formContactPerson, setFormContactPerson] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formWebsite, setFormWebsite] = useState('')
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'PENDING' | 'INACTIVE'>('ACTIVE')
  const [formServices, setFormServices] = useState<string[]>(['STANDARD', 'EXPRESS', 'COD'])
  const [formAreas, setFormAreas] = useState<string>('Tamil Nadu, Kerala, Karnataka')
  const [formApiBaseUrl, setFormApiBaseUrl] = useState('')
  const [formWebhookUrl, setFormWebhookUrl] = useState('')
  const [formApiKey, setFormApiKey] = useState('')
  const [formTrackingMethod, setFormTrackingMethod] = useState<'WEBHOOK' | 'POLLING'>('WEBHOOK')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Auto-clear notification toasts
  useEffect(() => {
    if (actionSuccess) {
      const t = setTimeout(() => setActionSuccess(null), 4500)
      return () => clearTimeout(t)
    }
  }, [actionSuccess])

  // Initial reference load
  useEffect(() => {
    fetchSummary()
  }, [])

  // Fetch partners list
  useEffect(() => {
    fetchPartners()
  }, [searchQuery, statusFilter, serviceFilter, page, limit])

  async function fetchSummary() {
    try {
      const res = await api.get('/courier-partners/summary')
      if (res.data?.summary) {
        setSummary(res.data.summary)
      }
    } catch {
      // Handled silently
    }
  }

  async function fetchPartners() {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, limit }
      if (searchQuery) params.search = searchQuery
      if (statusFilter) params.status = statusFilter
      if (serviceFilter) params.service_type = serviceFilter

      const res = await api.get('/courier-partners', { params })
      const items = res.data?.items || []
      setPartners(items)
      setTotal(res.data?.total ?? items.length)

      // Auto-select Delhivery (or first item) if no partner selected yet
      if (!selectedPartner && items.length > 0) {
        const dlv = items.find((i: CourierPartner) => i.code === 'DELHIVERY') || items[0]
        fetchPartnerDetail(dlv.id, false)
      } else if (selectedPartner) {
        const found = items.find((i: CourierPartner) => i.id === selectedPartner.id)
        if (found) fetchPartnerDetail(found.id, false)
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to load courier partners'))
    } finally {
      setLoading(false)
    }
  }

  async function fetchPartnerDetail(id: number, showSpinner = true) {
    if (showSpinner) setDrawerLoading(true)
    try {
      const res = await api.get(`/courier-partners/${id}`)
      if (res.data?.partner) {
        setSelectedPartner(res.data.partner)
      }
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to load partner details'))
    } finally {
      if (showSpinner) setDrawerLoading(false)
    }
  }

  // Filter actions
  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  function handleFilterReset() {
    setSearchInput('')
    setSearchQuery('')
    setStatusFilter('')
    setServiceFilter('')
    setPage(1)
  }

  // Checkbox selections
  function handleSelectAll(checked: boolean) {
    if (checked && partners) {
      setSelectedIds(partners.map((p) => p.id))
    } else {
      setSelectedIds([])
    }
  }

  function handleSelectRow(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  // Test Connection
  async function handleTestConnection(partnerId: number) {
    setTestingConnection(true)
    try {
      const res = await api.post(`/courier-partners/${partnerId}/test-connection`)
      if (res.data?.success) {
        setActionSuccess(res.data.message || 'Connection verified successfully!')
      } else {
        setActionError(res.data?.message || 'Connection test failed')
      }
      fetchPartnerDetail(partnerId, false)
      fetchPartners()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Connection test failed'))
    } finally {
      setTestingConnection(false)
    }
  }

  // Open Create Modal
  function openAddPartnerModal() {
    setFormId(null)
    setFormName('')
    setFormCode('')
    setFormSubtitle('Express Delivery')
    setFormAccountId('')
    setFormCompanyName('')
    setFormContactPerson('')
    setFormEmail('')
    setFormPhone('')
    setFormWebsite('')
    setFormStatus('ACTIVE')
    setFormServices(['STANDARD', 'EXPRESS', 'COD'])
    setFormAreas('Tamil Nadu, Kerala, Karnataka')
    setFormApiBaseUrl('https://api.example.com/v1')
    setFormWebhookUrl('https://api.example.com/webhook')
    setFormApiKey('')
    setFormTrackingMethod('WEBHOOK')
    setShowAddModal(true)
  }

  // Open Edit Modal
  function openEditPartnerModal(p: CourierPartner) {
    setFormId(p.id)
    setFormName(p.name)
    setFormCode(p.code)
    setFormSubtitle(p.subtitle || '')
    setFormAccountId(p.account_id)
    setFormCompanyName(p.company_name || '')
    setFormContactPerson(p.contact_person || '')
    setFormEmail(p.email || '')
    setFormPhone(p.phone || '')
    setFormWebsite(p.website || '')
    setFormStatus(p.status)
    setFormServices(p.supported_services || ['STANDARD', 'EXPRESS', 'COD'])
    setFormAreas((p.service_areas || []).join(', '))
    setFormApiBaseUrl(p.api_base_url || '')
    setFormWebhookUrl(p.webhook_url || '')
    setFormApiKey('')
    setFormTrackingMethod(p.tracking_method || 'WEBHOOK')
    setShowEditModal(true)
  }

  // Handle Save (Add / Edit) Submit
  async function handlePartnerFormSubmit(e: FormEvent) {
    e.preventDefault()
    if (!formName.trim() || !formCode.trim() || !formAccountId.trim()) {
      setActionError('Name, Provider Code and Account ID are required')
      return
    }

    setFormSubmitting(true)
    try {
      const areasList = formAreas
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)

      const payload: Record<string, any> = {
        name: formName.trim(),
        code: formCode.trim().toUpperCase(),
        subtitle: formSubtitle.trim() || undefined,
        account_id: formAccountId.trim(),
        company_name: formCompanyName.trim() || formName.trim(),
        contact_person: formContactPerson.trim() || undefined,
        email: formEmail.trim() || undefined,
        phone: formPhone.trim() || undefined,
        website: formWebsite.trim() || undefined,
        status: formStatus,
        supported_services: formServices,
        service_areas: areasList,
        api_base_url: formApiBaseUrl.trim() || undefined,
        webhook_url: formWebhookUrl.trim() || undefined,
        tracking_method: formTrackingMethod,
      }

      if (formApiKey.trim()) {
        payload.api_key = formApiKey.trim()
      }

      if (formId) {
        // Update
        const res = await api.put(`/courier-partners/${formId}`, payload)
        setActionSuccess(`Courier partner '${formName}' updated successfully!`)
        setShowEditModal(false)
        if (res.data?.partner) setSelectedPartner(res.data.partner)
      } else {
        // Create
        const res = await api.post('/courier-partners', payload)
        setActionSuccess(`Courier partner '${formName}' created successfully!`)
        setShowAddModal(false)
        if (res.data?.partner) setSelectedPartner(res.data.partner)
      }

      fetchPartners()
      fetchSummary()
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Failed to save courier partner'))
    } finally {
      setFormSubmitting(false)
    }
  }

  // Toggle Service in Modal
  function toggleService(svc: string) {
    setFormServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-5 pb-12 font-sans antialiased text-slate-800">
      {/* ================= BREADCRUMBS & HEADER ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          {/* Breadcrumbs matching Reference Image 1 */}
          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-600 mb-1">
            <span>Sales &amp; Orders</span>
            <span className="text-slate-400">›</span>
            <span className="text-purple-700">Courier Partners</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Courier Partners
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your courier partners, credentials, services and integration status.
          </p>
        </div>

        {/* Top-Right Action Button */}
        <div>
          <button
            type="button"
            onClick={openAddPartnerModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <span className="text-sm font-bold leading-none">+</span>
            <span>Add Courier Partner</span>
          </button>
        </div>
      </div>

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

      {/* ================= 4 KPI SUMMARY CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Partners */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#f0efff] text-[#6366f1] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Total Partners</p>
            <p className="text-[11px] text-slate-400">Configured courier providers</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.total_partners.count}
              </span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {summary.total_partners.delta}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Active Partners */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#ecfdf5] text-[#10b981] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Active Partners</p>
            <p className="text-[11px] text-slate-400">Ready for shipments</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.active_partners.count}
              </span>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {summary.active_partners.delta}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Pending Setup */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#fff7ed] text-[#f59e0b] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Pending Setup</p>
            <p className="text-[11px] text-slate-400">Awaiting verification</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.pending_setup.count}
              </span>
              <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                {summary.pending_setup.delta}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Integration Issues */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#fff1f2] text-[#f43f5e] flex items-center justify-center shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-500 truncate">Integration Issues</p>
            <p className="text-[11px] text-slate-400">Action required</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {summary.integration_issues.count}
              </span>
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {summary.integration_issues.delta}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SEARCH & FILTERS BAR ================= */}
      <form
        onSubmit={handleFilterSubmit}
        className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs flex flex-wrap items-center gap-3"
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by partner name, account ID or service..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
          />
        </div>

        {/* Status Dropdown */}
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-slate-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {/* Service Type Dropdown */}
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] font-medium text-slate-500">Service Type</label>
          <select
            value={serviceFilter}
            onChange={(e) => {
              setServiceFilter(e.target.value)
              setPage(1)
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/20 focus:border-[#6366f1]"
          >
            <option value="">All Services</option>
            <option value="STANDARD">Standard</option>
            <option value="EXPRESS">Express</option>
            <option value="COD">COD</option>
            <option value="PICKUP_DROP">Pickup &amp; Drop</option>
          </select>
        </div>

        {/* Reset Button */}
        <button
          type="button"
          onClick={handleFilterReset}
          className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Reset</span>
        </button>
      </form>

      {/* ================= MAIN CONTENT: TABLE & RIGHT-SIDE DRAWER ================= */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* ================= TABLE CONTAINER ================= */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 pl-4 pr-2 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === partners.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                    />
                  </th>
                  <th className="py-3.5 px-3">Partner Name</th>
                  <th className="py-3.5 px-3">Account ID</th>
                  <th className="py-3.5 px-3">Services</th>
                  <th className="py-3.5 px-3">Service Areas</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-3">Last Sync</th>
                  <th className="py-3.5 pr-4 pl-2 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-slate-400">
                      <Spinner />
                      <p className="mt-2 text-xs font-medium">Loading courier partners…</p>
                    </td>
                  </tr>
                ) : partners.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" />
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-slate-700">No courier partners configured</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Click "+ Add Courier Partner" above to configure your first provider.
                      </p>
                    </td>
                  </tr>
                ) : (
                  partners.map((p) => {
                    const isSelected = selectedPartner?.id === p.id
                    const isChecked = selectedIds.includes(p.id)
                    const dt = formatDateTime(p.last_sync_at)

                    return (
                      <tr
                        key={p.id}
                        onClick={() => fetchPartnerDetail(p.id)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected ? 'bg-[#f5f4ff]' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 pl-4 pr-2" onClick={(e) => handleSelectRow(p.id, e)}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="rounded border-slate-300 text-[#6366f1] focus:ring-[#6366f1]"
                          />
                        </td>

                        {/* Partner Name & Logo */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3">
                            {renderBrandLogo(p.code, p.name)}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 group-hover:text-[#6366f1] transition-colors leading-tight">
                                {p.name}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[130px]">
                                {p.subtitle || 'Express Delivery'}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Account ID */}
                        <td className="py-3.5 px-3">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {p.account_id}
                          </span>
                        </td>

                        {/* Services Pills */}
                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap items-center gap-1 max-w-[160px]">
                            {(p.supported_services || []).slice(0, 3).map((svc, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100"
                              >
                                {svc === 'STANDARD' ? 'Standard' : svc === 'EXPRESS' ? 'Express' : svc === 'COD' ? 'COD' : svc}
                              </span>
                            ))}
                            {(p.supported_services || []).length > 3 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                +{(p.supported_services || []).length - 3}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Service Areas */}
                        <td className="py-3.5 px-3">
                          <div className="text-slate-600 text-[11px] leading-relaxed max-w-[140px]">
                            <p className="truncate">
                              {(p.service_areas || []).slice(0, 2).join(', ') || 'All India'}
                            </p>
                            {(p.service_areas || []).length > 2 && (
                              <p className="text-[10px] text-slate-400">
                                +{(p.service_areas || []).length - 2} more
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-3">
                          {p.status === 'ACTIVE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          )}
                          {p.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Pending
                            </span>
                          )}
                          {p.status === 'INACTIVE' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Inactive
                            </span>
                          )}
                        </td>

                        {/* Last Sync */}
                        <td className="py-3.5 px-3">
                          <p className="font-semibold text-slate-800">{dt.date}</p>
                          <p className="text-[11px] text-slate-400">{dt.time}</p>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 pr-4 pl-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Edit Pencil Icon */}
                            <button
                              type="button"
                              onClick={() => openEditPartnerModal(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Edit partner"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>

                            {/* View Eye Icon */}
                            <button
                              type="button"
                              onClick={() => fetchPartnerDetail(p.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#6366f1] hover:bg-slate-100 transition-colors"
                              title="View details"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>

                            {/* Test Connection Button */}
                            <button
                              type="button"
                              onClick={() => handleTestConnection(p.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
                              title="Test API connection"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                            </button>
                          </div>
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
              Showing {partners.length > 0 ? (page - 1) * limit + 1 : 0} -{' '}
              {Math.min(page * limit, total)} of {total} partners
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
              </select>
            </div>
          </div>
        </div>

        {/* ================= RIGHT-SIDE PARTNER DETAILS DRAWER ================= */}
        {selectedPartner && (
          <div className="w-full lg:w-[420px] shrink-0 bg-white rounded-2xl border border-slate-200/90 shadow-sm p-5 space-y-4 animate-in fade-in duration-200">
            {/* Drawer Header matching Reference Image 1 */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                {renderBrandLogo(selectedPartner.code, selectedPartner.name)}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                      {selectedPartner.name}
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        selectedPartner.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      ● {selectedPartner.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Account ID: {selectedPartner.account_id}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPartner(null)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold"
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            {/* Drawer Tabs */}
            <div className="flex items-center gap-3 border-b border-slate-100 text-xs font-semibold overflow-x-auto">
              <button
                type="button"
                onClick={() => setDrawerTab('overview')}
                className={`pb-2 transition-colors relative cursor-pointer ${
                  drawerTab === 'overview'
                    ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Overview
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('services')}
                className={`pb-2 transition-colors relative cursor-pointer ${
                  drawerTab === 'services'
                    ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Services
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('areas')}
                className={`pb-2 transition-colors relative cursor-pointer ${
                  drawerTab === 'areas'
                    ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Service Areas
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('settings')}
                className={`pb-2 transition-colors relative cursor-pointer ${
                  drawerTab === 'settings'
                    ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('logs')}
                className={`pb-2 transition-colors relative cursor-pointer ${
                  drawerTab === 'logs'
                    ? 'text-[#6366f1] border-b-2 border-[#6366f1] font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Logs
              </button>
            </div>

            {drawerLoading ? (
              <div className="py-16 text-center text-slate-400">
                <Spinner />
              </div>
            ) : (
              <>
                {drawerTab === 'overview' && (
                  <div className="space-y-4">
                    {/* Section 1: Partner Information */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        <span>Partner Information</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Company Name</span>
                          <span className="font-bold text-slate-900">{selectedPartner.company_name || selectedPartner.name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Contact Person</span>
                          <span className="font-semibold text-slate-800">{selectedPartner.contact_person || 'Support Team'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Email</span>
                          <span className="font-mono text-slate-700">{selectedPartner.email || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Phone</span>
                          <span className="font-mono text-slate-700">{selectedPartner.phone || '—'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Website</span>
                          <a
                            href={selectedPartner.website?.startsWith('http') ? selectedPartner.website : `https://${selectedPartner.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#6366f1] hover:underline"
                          >
                            {selectedPartner.website || '—'}
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Integration Details */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span>Integration Details</span>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">API Key</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-700">
                              {revealedApiKey
                                ? `live_sk_${selectedPartner.code.toLowerCase()}_${selectedPartner.account_id}`
                                : selectedPartner.masked_api_key || '••••••••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRevealedApiKey(!revealedApiKey)}
                              className="text-slate-400 hover:text-slate-600"
                              title="Toggle reveal"
                            >
                              👁
                            </button>
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <span className="text-slate-500 shrink-0">Webhook URL</span>
                          <span className="font-mono text-[11px] text-slate-700 truncate max-w-[200px]">
                            {selectedPartner.webhook_url || `https://api.example.com/webhook/${selectedPartner.code.toLowerCase()}`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Last Sync</span>
                          <span className="text-slate-700 font-medium">
                            {formatDateTime(selectedPartner.last_sync_at).full}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-200/80">
                          <span className="text-slate-500">Status</span>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Connected
                            </span>
                            <button
                              type="button"
                              disabled={testingConnection}
                              onClick={() => handleTestConnection(selectedPartner.id)}
                              className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[10px] font-bold transition-colors"
                            >
                              {testingConnection ? 'Testing…' : 'Test'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 3: Supported Services */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Supported Services</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                          <span className="font-semibold text-slate-800">Standard Delivery</span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                          <span className="font-semibold text-slate-800">Express Delivery</span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                          <span className="font-semibold text-slate-800">COD Collection</span>
                        </div>
                        <div className="p-2 rounded-xl bg-slate-50/80 border border-slate-100 flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                          <span className="font-semibold text-slate-800">Pickup &amp; Drop</span>
                        </div>
                      </div>
                    </div>

                    {/* Section 4: Service Areas */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span>Service Areas</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {(selectedPartner.service_areas || []).map((area, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-full bg-indigo-50/70 border border-indigo-100 text-[#4f46e5] text-[11px] font-medium"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Section 5: Performance */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span>Performance</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100">
                          <p className="text-[10px] text-slate-500">Total Shipments</p>
                          <p className="text-base font-extrabold text-slate-900 mt-0.5">
                            {Number(selectedPartner.total_shipments || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100">
                          <p className="text-[10px] text-slate-500">Success Rate</p>
                          <p className="text-base font-extrabold text-emerald-600 mt-0.5">
                            {selectedPartner.success_rate || 98.5}%
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100">
                          <p className="text-[10px] text-slate-500">Avg. Delivery</p>
                          <p className="text-base font-extrabold text-blue-600 mt-0.5">
                            {selectedPartner.avg_delivery_days || 2.4} days
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {drawerTab === 'services' && (
                  <div className="space-y-3 text-xs">
                    <span className="block font-bold text-slate-800">Supported Delivery Methods</span>
                    <div className="space-y-2">
                      {(selectedPartner.supported_services || []).map((s, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <span className="font-bold text-slate-900">{s}</span>
                          <span className="text-emerald-600 font-semibold text-[11px]">Enabled</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {drawerTab === 'areas' && (
                  <div className="space-y-3 text-xs">
                    <span className="block font-bold text-slate-800">Operational Hubs &amp; Coverage</span>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                      <p className="text-slate-600 leading-relaxed">
                        Shipments can be dispatched to destinations covering:
                      </p>
                      <ul className="list-disc pl-4 space-y-1 text-slate-700 font-medium">
                        {(selectedPartner.service_areas || []).map((area, i) => (
                          <li key={i}>{area}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {drawerTab === 'settings' && (
                  <div className="space-y-3 text-xs">
                    <span className="block font-bold text-slate-800">Integration Configuration</span>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                      <div>
                        <span className="text-slate-500 text-[11px]">API Base URL</span>
                        <p className="font-mono text-slate-800">{selectedPartner.api_base_url || 'https://api.example.com/v1'}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Tracking Method</span>
                        <p className="font-bold text-slate-800">{selectedPartner.tracking_method}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Authentication Type</span>
                        <p className="font-bold text-slate-800">{selectedPartner.auth_type}</p>
                      </div>
                    </div>
                  </div>
                )}

                {drawerTab === 'logs' && (
                  <div className="space-y-3 text-xs">
                    <span className="block font-bold text-slate-800">Synchronization &amp; Audit Logs</span>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {(selectedPartner.sync_logs || []).length === 0 ? (
                        <p className="text-slate-400 py-4 text-center">No recent sync events</p>
                      ) : (
                        (selectedPartner.sync_logs || []).map((l) => (
                          <div key={l.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{l.event_type}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                                  l.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {l.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600">{l.message}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{formatDateTime(l.created_at).full}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Bottom Edit Partner Button */}
                <div className="pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => openEditPartnerModal(selectedPartner)}
                    className="w-full py-3 px-4 rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white text-xs font-bold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    <span>Edit Partner</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ================= ADD / EDIT COURIER PARTNER MODAL ================= */}
      {(showAddModal || showEditModal) && (
        <Modal
          title={formId ? `Edit Courier Partner: ${formName}` : 'Add Courier Partner'}
          onClose={() => {
            setShowAddModal(false)
            setShowEditModal(false)
          }}
        >
          <form onSubmit={handlePartnerFormSubmit} className="space-y-4 text-xs">
            {/* Row 1: Name, Code, Account ID */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Partner Name *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Delhivery"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Provider Code *
                </label>
                <input
                  type="text"
                  required
                  disabled={formId !== null}
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  placeholder="e.g. DELHIVERY"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Account ID *
                </label>
                <input
                  type="text"
                  required
                  value={formAccountId}
                  onChange={(e) => setFormAccountId(e.target.value)}
                  placeholder="e.g. DLV001234"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Row 2: Subtitle & Company Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Tagline / Subtitle
                </label>
                <input
                  type="text"
                  value={formSubtitle}
                  onChange={(e) => setFormSubtitle(e.target.value)}
                  placeholder="e.g. Express Delivery"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Company Legal Name
                </label>
                <input
                  type="text"
                  value={formCompanyName}
                  onChange={(e) => setFormCompanyName(e.target.value)}
                  placeholder="e.g. Delhivery Ltd."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>
            </div>

            {/* Row 3: Contact Person, Email, Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={formContactPerson}
                  onChange={(e) => setFormContactPerson(e.target.value)}
                  placeholder="e.g. Support Team"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="e.g. support@delhivery.com"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. +91 1800 103 3322"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>
            </div>

            {/* Row 4: Supported Services */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Supported Delivery Services
              </label>
              <div className="flex flex-wrap gap-2">
                {['STANDARD', 'EXPRESS', 'COD', 'PICKUP_DROP'].map((svc) => {
                  const isChecked = formServices.includes(svc)
                  return (
                    <button
                      key={svc}
                      type="button"
                      onClick={() => toggleService(svc)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                        isChecked
                          ? 'border-[#6366f1] bg-[#ecebff] text-[#4f46e5]'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}
                      {svc === 'STANDARD' ? 'Standard Delivery' : svc === 'EXPRESS' ? 'Express Delivery' : svc === 'COD' ? 'COD Collection' : 'Pickup & Drop'}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Row 5: Service Areas & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Service Areas (Comma separated)
                </label>
                <input
                  type="text"
                  value={formAreas}
                  onChange={(e) => setFormAreas(e.target.value)}
                  placeholder="Tamil Nadu, Kerala, Karnataka, All India"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Partner Status
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
                >
                  <option value="ACTIVE">Active (Ready for shipments)</option>
                  <option value="PENDING">Pending (Awaiting setup)</option>
                  <option value="INACTIVE">Inactive (Disabled)</option>
                </select>
              </div>
            </div>

            {/* Row 6: API Integration & Secrets */}
            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200/90 space-y-3">
              <span className="block text-[11px] font-bold text-purple-900 uppercase tracking-wider">
                API Integration &amp; Credentials
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    API Base Gateway URL
                  </label>
                  <input
                    type="url"
                    value={formApiBaseUrl}
                    onChange={(e) => setFormApiBaseUrl(e.target.value)}
                    placeholder="https://track.delhivery.com/api/v1"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-700 mb-1">
                    Webhook Destination URL
                  </label>
                  <input
                    type="url"
                    value={formWebhookUrl}
                    onChange={(e) => setFormWebhookUrl(e.target.value)}
                    placeholder="https://api.example.com/webhook/delhivery"
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-700 mb-1">
                  Provider API Secret Key {formId ? '(Leave blank to retain existing key)' : '*'}
                </label>
                <input
                  type="password"
                  value={formApiKey}
                  onChange={(e) => setFormApiKey(e.target.value)}
                  placeholder={formId ? '•••••••••••••• (Existing key active)' : 'Enter production secret key…'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowAddModal(false)
                  setShowEditModal(false)
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={formSubmitting}>
                {formSubmitting ? 'Saving Partner…' : formId ? 'Save Changes' : 'Create Partner'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
