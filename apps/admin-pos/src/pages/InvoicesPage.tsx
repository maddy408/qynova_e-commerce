import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Modal, Select, Spinner, TextField } from '../components/ui'
import { ROUTES } from '../routes/routes'
import { PAYMENT_METHODS } from '../constants/paymentMethods'
import { api, apiErrorMessage } from '../lib/api'

interface Invoice {
  id: number
  invoice_no: string
  channel: 'POS' | 'ECOMMERCE'
  customer_name: string | null
  customer_phone?: string | null
  cashier_name: string | null
  grand_total: string
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID'
  payment_method?: string | null
  amount_paid?: string
  status: 'ACTIVE' | 'CANCELLED'
  created_at: string
}

const REFERENCE_REQUIRED_METHODS = ['UPI', 'CARD', 'NETBANKING', 'GOOGLE_PAY']
const PAGE_SIZE = 7

function formatInvoiceDate(dateStr: string) {
  if (!dateStr) return { date: '—', time: '' }
  try {
    const d = new Date(dateStr)
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    const dateFormatted = `${day}/${month}/${year}`
    const timeFormatted = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    return { date: dateFormatted, time: timeFormatted }
  } catch {
    return { date: dateStr, time: '' }
  }
}

export function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [channel, setChannel] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)

  // Record Payment / amendment modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [paymentReferenceNo, setPaymentReferenceNo] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [correctMethod, setCorrectMethod] = useState('CASH')
  const [correctingMethod, setCorrectingMethod] = useState(false)
  const [modalError, setModalError] = useState('')

  // Delete Invoice state
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cancelingInvoice, setCancelingInvoice] = useState(false)
  const [msg, setMsg] = useState('')

  function loadInvoices() {
    api
      .get('/invoices', { params: { channel: channel || undefined } })
      .then((res) => {
        setInvoices(res.data.invoices)
        setSelectedIds(new Set())
      })
      .catch((err) => {
        console.error('Failed to load invoices:', err)
      })
  }

  useEffect(() => {
    loadInvoices()
  }, [channel])

  function balanceOf(inv: Invoice): number {
    return Math.max(0, Number(inv.grand_total) - Number(inv.amount_paid || 0))
  }

  function openEdit(inv: Invoice) {
    setEditingInvoice(inv)
    setPaymentAmount(balanceOf(inv) > 0 ? balanceOf(inv).toFixed(2) : '')
    setPaymentMethod('CASH')
    setPaymentReferenceNo('')
    setCorrectMethod(inv.payment_method || 'CASH')
    setModalError('')
  }

  async function handleRecordPayment() {
    if (!editingInvoice) return
    setModalError('')
    if (REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !paymentReferenceNo.trim()) {
      setModalError(`Reference number is required for ${paymentMethod}`)
      return
    }
    setRecordingPayment(true)
    try {
      await api.post(`/invoices/${editingInvoice.id}/payments`, {
        amount: paymentAmount,
        lines: [{ method: paymentMethod, amount: paymentAmount, reference_no: paymentReferenceNo || undefined }],
      })
      setEditingInvoice(null)
      setMsg(`Payment recorded for invoice ${editingInvoice.invoice_no}!`)
      setTimeout(() => setMsg(''), 3000)
      loadInvoices()
    } catch (err) {
      setModalError(apiErrorMessage(err, 'Could not record payment'))
    } finally {
      setRecordingPayment(false)
    }
  }

  async function handleCorrectMethod() {
    if (!editingInvoice) return
    setModalError('')
    setCorrectingMethod(true)
    try {
      await api.put(`/invoices/${editingInvoice.id}/payment-method`, { payment_method: correctMethod })
      setEditingInvoice(null)
      setMsg(`Payment method corrected for invoice ${editingInvoice.invoice_no}!`)
      setTimeout(() => setMsg(''), 3000)
      loadInvoices()
    } catch (err) {
      setModalError(apiErrorMessage(err, 'Could not update payment method'))
    } finally {
      setCorrectingMethod(false)
    }
  }

  async function handleCancelInvoice(inv: Invoice) {
    const reason = window.prompt(`Cancellation reason for invoice ${inv.invoice_no}?`)
    if (!reason) return
    setCancelingInvoice(true)
    try {
      await api.post(`/invoices/${inv.id}/cancel`, { reason })
      setEditingInvoice(null)
      setMsg(`Invoice ${inv.invoice_no} cancelled.`)
      setTimeout(() => setMsg(''), 3000)
      loadInvoices()
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not cancel invoice'))
    } finally {
      setCancelingInvoice(false)
    }
  }

  async function handleDeleteInvoice() {
    if (!deletingInvoice) return
    setDeleting(true)
    try {
      await api.delete(`/invoices/${deletingInvoice.id}`)
      setDeletingInvoice(null)
      setMsg(`Invoice ${deletingInvoice.invoice_no} deleted successfully!`)
      setTimeout(() => setMsg(''), 3000)
      loadInvoices()
    } catch (err) {
      alert(apiErrorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  // Filtered invoices by search and status
  const displayedInvoices = useMemo(() => {
    return (invoices || []).filter((inv) => {
      // Status filter
      if (statusFilter === 'PAID' && inv.payment_status !== 'PAID') return false
      if (statusFilter === 'UNPAID' && inv.payment_status !== 'UNPAID') return false
      if (statusFilter === 'PARTIAL' && inv.payment_status !== 'PARTIAL') return false
      if (statusFilter === 'CANCELLED' && inv.status !== 'CANCELLED') return false
      if (statusFilter === 'ACTIVE' && inv.status !== 'ACTIVE') return false

      // Search term filter
      if (!search.trim()) return true
      const term = search.toLowerCase()
      return (
        inv.invoice_no?.toLowerCase().includes(term) ||
        inv.customer_name?.toLowerCase().includes(term) ||
        inv.customer_phone?.toLowerCase().includes(term) ||
        inv.cashier_name?.toLowerCase().includes(term)
      )
    })
  }, [invoices, statusFilter, search])

  // Pagination calculation
  const totalInvoices = displayedInvoices.length
  const totalPages = Math.max(1, Math.ceil(totalInvoices / PAGE_SIZE))
  const currentPageSafe = Math.min(currentPage, totalPages)
  const startIndex = (currentPageSafe - 1) * PAGE_SIZE
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalInvoices)
  const currentInvoices = displayedInvoices.slice(startIndex, endIndex)

  // Selection handlers
  const allCurrentSelected = currentInvoices.length > 0 && currentInvoices.every((inv) => selectedIds.has(inv.id))

  function toggleSelectAll() {
    if (allCurrentSelected) {
      const next = new Set(selectedIds)
      currentInvoices.forEach((inv) => next.delete(inv.id))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      currentInvoices.forEach((inv) => next.add(inv.id))
      setSelectedIds(next)
    }
  }

  function toggleSelectRow(id: number) {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  return (
    <div className="space-y-6 pb-12 font-sans">
      {/* Title Row with Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pt-1">
        {/* Left Title & Icon */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 to-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <svg className="w-6 h-6 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Invoices</h1>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              View, manage and track all your customer invoices.
            </p>
          </div>
        </div>

        {/* Right Filters & Search Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative min-w-[220px] sm:w-64">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search invoice #, customer, cashier…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full h-10 pl-10 pr-3.5 text-xs font-medium text-slate-800 placeholder-slate-400 bg-white border border-slate-200/90 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
            />
          </div>

          {/* Dropdown Filter: All Invoices */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="h-10 pl-3.5 pr-8 text-xs font-semibold text-slate-700 bg-white border border-slate-200/90 rounded-2xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs cursor-pointer"
            >
              <option value="ALL">All Invoices</option>
              <option value="PAID">Paid Only</option>
              <option value="PARTIAL">Partial Only</option>
              <option value="UNPAID">Unpaid Only</option>
              <option value="ACTIVE">Active Only</option>
              <option value="CANCELLED">Cancelled Only</option>
            </select>
            <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </div>

          {/* Channel Filter Pill: Walk-in Customer (POS) */}
          <button
            type="button"
            onClick={() => {
              setChannel(channel === 'POS' ? '' : 'POS')
              setCurrentPage(1)
            }}
            className={`h-10 px-3.5 rounded-2xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-2xs ${
              channel === 'POS'
                ? 'bg-blue-50/80 border-blue-500 text-blue-700 ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <svg className="w-4 h-4 text-[#1877F2] stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <span>Walk-in Customer (POS)</span>
          </button>

          {/* Channel Filter Pill: E-Commerce Orders */}
          <button
            type="button"
            onClick={() => {
              setChannel(channel === 'ECOMMERCE' ? '' : 'ECOMMERCE')
              setCurrentPage(1)
            }}
            className={`h-10 px-3.5 rounded-2xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-2xs ${
              channel === 'ECOMMERCE'
                ? 'bg-blue-50/80 border-blue-500 text-blue-700 ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <svg className="w-4 h-4 text-[#1877F2] stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            <span>E-Commerce Orders</span>
          </button>

          {/* Filter Funnel Button */}
          <button
            type="button"
            onClick={() => {
              if (channel || statusFilter !== 'ALL' || search) {
                setChannel('')
                setStatusFilter('ALL')
                setSearch('')
                setCurrentPage(1)
              }
            }}
            className="h-10 px-4 rounded-2xl bg-[#4361EE] hover:bg-[#3451DE] text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-blue-500/25 cursor-pointer active:scale-95"
            title={channel || statusFilter !== 'ALL' || search ? 'Reset All Filters' : 'Active Filters'}
          >
            <svg className="w-4 h-4 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filter</span>
          </button>
        </div>
      </div>

      {msg && (
        <div>
          <Alert tone="green">{msg}</Alert>
        </div>
      )}

      {/* ================= INVOICE TABLE ================= */}
      {invoices === null ? (
        <div className="py-20 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_4px_25px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              {/* Vibrant Blue Gradient Header — Perfectly Aligned 10 Columns */}
              <thead className="bg-gradient-to-r from-[#1877F2] via-[#2482F6] to-[#3BA2FF] text-white font-semibold text-xs select-none">
                <tr className="h-12">
                  {/* 1. Checkbox Column */}
                  <th className="w-12 py-3.5 pl-4 pr-2 text-center">
                    <input
                      type="checkbox"
                      checked={allCurrentSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-2 border-white/70 bg-white/20 checked:bg-white checked:text-[#1877F2] focus:ring-0 focus:outline-none transition-all cursor-pointer"
                    />
                  </th>

                  {/* 2. Invoice No. */}
                  <th className="w-28 py-3.5 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Invoice No.</span>
                    </div>
                  </th>

                  {/* 3. Type / Channel */}
                  <th className="w-36 py-3.5 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Type / Channel</span>
                    </div>
                  </th>

                  {/* 4. Customer */}
                  <th className="w-56 min-w-[210px] py-3.5 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Customer</span>
                    </div>
                  </th>

                  {/* 5. Cashier */}
                  <th className="w-28 py-3.5 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Cashier</span>
                    </div>
                  </th>

                  {/* 6. Total Amount */}
                  <th className="w-32 py-3.5 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Total Amount</span>
                    </div>
                  </th>

                  {/* 7. Payment Status */}
                  <th className="w-28 py-3.5 px-4 text-center font-bold">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                      </svg>
                      <span>Payment Status</span>
                    </div>
                  </th>

                  {/* 8. Status */}
                  <th className="w-28 py-3.5 px-4 text-center font-bold">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Status</span>
                    </div>
                  </th>

                  {/* 9. Date & Time */}
                  <th className="w-36 py-3.5 px-4 font-bold">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Date &amp; Time</span>
                    </div>
                  </th>

                  {/* 10. Actions */}
                  <th className="w-44 py-3.5 pr-5 pl-4 text-center font-bold">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-4 h-4 opacity-90 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                      </svg>
                      <span>Actions</span>
                    </div>
                  </th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100 font-sans">
                {currentInvoices.map((inv) => {
                  const isSelected = selectedIds.has(inv.id)
                  const dateInfo = formatInvoiceDate(inv.created_at)
                  const isPos = inv.channel === 'POS'

                  return (
                    <tr
                      key={inv.id}
                      className={`hover:bg-blue-50/25 transition-colors h-14 ${
                        isSelected ? 'bg-blue-50/40' : ''
                      }`}
                    >
                      {/* 1. Checkbox Column (with left green accent if active) */}
                      <td className="relative w-12 py-3.5 pl-4 pr-2 text-center align-middle">
                        {inv.status === 'ACTIVE' && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#00C48C] rounded-r-full z-10" />
                        )}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(inv.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* 2. Invoice No. */}
                      <td
                        onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                        className="w-28 py-3.5 px-4 font-bold text-xs text-slate-800 cursor-pointer hover:text-blue-600 transition-colors align-middle"
                      >
                        {inv.invoice_no}
                      </td>

                      {/* 3. Type / Channel Pill */}
                      <td className="w-36 py-3.5 px-4 align-middle">
                        {isPos ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#E6F9F3] text-[#00A86B] border border-[#B3F0D8]">
                            <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                            <span>Walk-in Bill</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
                            <svg className="w-3.5 h-3.5 stroke-[2.2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                            <span>E-Commerce</span>
                          </span>
                        )}
                      </td>

                      {/* 4. Customer with Avatar Circle */}
                      <td className="w-56 min-w-[210px] py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE] flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                              {inv.customer_name || 'Walk-in Customer'}
                            </p>
                            {inv.customer_phone ? (
                              <p className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5 truncate">
                                +91 {inv.customer_phone}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* 5. Cashier */}
                      <td className="w-28 py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <svg className="w-3.5 h-3.5 text-[#2563EB] stroke-[2] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="truncate">{inv.cashier_name || 'Admin'}</span>
                        </div>
                      </td>

                      {/* 6. Total Amount */}
                      <td className="w-32 py-3.5 px-4 font-bold text-slate-900 text-xs align-middle">
                        ₹{Number(inv.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* 7. Payment Status Pill */}
                      <td className="w-28 py-3.5 px-4 text-center align-middle">
                        {inv.payment_status === 'PAID' ? (
                          <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wide bg-[#E6F9F3] text-[#00A86B] border border-[#B3F0D8]">
                            PAID
                          </span>
                        ) : inv.payment_status === 'PARTIAL' ? (
                          <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wide bg-[#FFF7ED] text-[#EA580C] border border-[#FED7AA]">
                            PARTIAL
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wide bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                            UNPAID
                          </span>
                        )}
                      </td>

                      {/* 8. Status Pill */}
                      <td className="w-28 py-3.5 px-4 text-center align-middle">
                        {inv.status === 'ACTIVE' ? (
                          <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wide bg-[#E6F9F3] text-[#00A86B] border border-[#B3F0D8]">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 rounded-full text-[10.5px] font-bold tracking-wide bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA]">
                            CANCELLED
                          </span>
                        )}
                      </td>

                      {/* 9. Date & Time */}
                      <td className="w-36 py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-slate-400 stroke-[1.8] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <div>
                            <p className="text-xs font-semibold text-slate-700 leading-tight">
                              {dateInfo.date}
                            </p>
                            <p className="text-[10.5px] text-slate-400 font-medium leading-tight mt-0.5">
                              {dateInfo.time}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* 10. Actions Buttons Row */}
                      <td className="w-44 py-3.5 pr-5 pl-4 text-center align-middle">
                        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* 1. View Button (Eye) */}
                          <button
                            type="button"
                            onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                            className="w-7 h-7 rounded-lg bg-[#EBF5FF] text-[#2563EB] hover:bg-[#DBEAFE] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                            title="View Details"
                          >
                            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>

                          {/* 2. Edit / Amend Button (Pencil) */}
                          <button
                            type="button"
                            onClick={() => openEdit(inv)}
                            className="w-7 h-7 rounded-lg bg-[#F5F0FF] text-[#7C3AED] hover:bg-[#EDE9FE] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                            title="Amend Invoice / Record Payment"
                          >
                            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>

                          {/* 3. Print Button (Printer) */}
                          <button
                            type="button"
                            onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                            className="w-7 h-7 rounded-lg bg-[#E0F2FE] text-[#0284C7] hover:bg-[#BAE6FD] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                            title="Print Tax Invoice"
                          >
                            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                          </button>

                          {/* 4. Delete / Cancel Button (Trash) */}
                          <button
                            type="button"
                            onClick={() => setDeletingInvoice(inv)}
                            className="w-7 h-7 rounded-lg bg-[#FEE2E2] text-[#EF4444] hover:bg-[#FECACA] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                            title="Delete / Cancel Invoice"
                          >
                            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>

                          {/* 5. More Actions Button (...) */}
                          <button
                            type="button"
                            onClick={() => openEdit(inv)}
                            className="w-7 h-7 rounded-lg bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                            title="More options"
                          >
                            <svg className="w-3.5 h-3.5 stroke-[2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {currentInvoices.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-xs font-semibold text-slate-400">
                      No invoices match the selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ================= TABLE FOOTER & PAGINATION ================= */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-slate-100 bg-white text-xs">
            {/* Left: Showing entries */}
            <p className="font-medium text-slate-500 text-[12px]">
              Showing{' '}
              <span className="font-bold text-slate-700">
                {totalInvoices === 0 ? 0 : startIndex + 1}
              </span>{' '}
              -{' '}
              <span className="font-bold text-slate-700">{endIndex}</span> of{' '}
              <span className="font-bold text-slate-700">{totalInvoices}</span> invoices
            </p>

            {/* Right: Modern Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 select-none">
                {/* Previous Button */}
                <button
                  type="button"
                  disabled={currentPageSafe <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-all cursor-pointer font-bold text-xs"
                >
                  ‹
                </button>

                {/* Page numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNo) => {
                  const isActive = pageNo === currentPageSafe
                  return (
                    <button
                      key={pageNo}
                      type="button"
                      onClick={() => setCurrentPage(pageNo)}
                      className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#1877F2] text-white shadow-sm shadow-blue-500/25'
                          : 'bg-white border border-transparent text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {pageNo}
                    </button>
                  )
                })}

                {/* Next Button */}
                <button
                  type="button"
                  disabled={currentPageSafe >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-all cursor-pointer font-bold text-xs"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODALS (PRESERVED) ================= */}

      {/* Amend Invoice Modal — Record Payment / Correct Method / Cancel */}
      {editingInvoice && (
        <Modal title={`Amend Invoice - ${editingInvoice.invoice_no}`} onClose={() => setEditingInvoice(null)}>
          <div className="space-y-5 text-xs">
            <div className="rounded-xl bg-slate-50 p-3.5 space-y-1 border border-slate-100">
              <div className="font-bold text-slate-900 text-sm">Invoice #{editingInvoice.invoice_no}</div>
              <div className="text-slate-600">
                Grand Total: <strong className="text-slate-900">₹{editingInvoice.grand_total}</strong> · Paid:{' '}
                <strong className="text-slate-900">₹{editingInvoice.amount_paid ?? '0.00'}</strong> · Balance:{' '}
                <strong className="text-slate-900">₹{balanceOf(editingInvoice).toFixed(2)}</strong>
              </div>
            </div>

            {modalError && <Alert>{modalError}</Alert>}

            {editingInvoice.status === 'CANCELLED' ? (
              <p className="text-slate-500">This invoice is cancelled and can no longer be amended.</p>
            ) : (
              <>
                {balanceOf(editingInvoice) > 0 && (
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <h3 className="text-xs font-bold text-slate-900">Record Payment</h3>
                    <TextField
                      label="Amount (₹)"
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                    <Select label="Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      {PAYMENT_METHODS.filter((pm) => pm.code !== 'CREDIT').map((pm) => (
                        <option key={pm.code} value={pm.code}>
                          {pm.label}
                        </option>
                      ))}
                    </Select>
                    {REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && (
                      <TextField
                        label="Reference No."
                        value={paymentReferenceNo}
                        onChange={(e) => setPaymentReferenceNo(e.target.value)}
                        placeholder="UTR / transaction ID"
                      />
                    )}
                    <div className="flex justify-end">
                      <Button onClick={handleRecordPayment} disabled={recordingPayment || !paymentAmount}>
                        {recordingPayment ? 'Recording...' : 'Record Payment'}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 border-t border-slate-100 pt-3">
                  <h3 className="text-xs font-bold text-slate-900">Correct Payment Method Label</h3>
                  <Select value={correctMethod} onChange={(e) => setCorrectMethod(e.target.value)}>
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm.code} value={pm.code}>
                        {pm.label}
                      </option>
                    ))}
                  </Select>
                  <div className="flex justify-end">
                    <Button variant="secondary" onClick={handleCorrectMethod} disabled={correctingMethod}>
                      {correctingMethod ? 'Saving...' : 'Save Method'}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end border-t border-slate-100 pt-3">
                  <Button variant="danger" onClick={() => handleCancelInvoice(editingInvoice)} disabled={cancelingInvoice}>
                    {cancelingInvoice ? 'Cancelling...' : 'Cancel Invoice'}
                  </Button>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setEditingInvoice(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingInvoice && (
        <Modal title={`Delete Invoice ${deletingInvoice.invoice_no}`} onClose={() => setDeletingInvoice(null)}>
          <div className="space-y-4 text-xs">
            <p className="text-slate-700">
              Are you sure you want to delete invoice <strong className="text-slate-900">{deletingInvoice.invoice_no}</strong> (Total: ₹{deletingInvoice.grand_total})?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setDeletingInvoice(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteInvoice} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
