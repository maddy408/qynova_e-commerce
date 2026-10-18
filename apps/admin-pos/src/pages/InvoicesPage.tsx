import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { ROUTES } from '../routes/routes'
import { PencilIcon, PrinterIcon, TrashIcon } from '../components/Icons'
import { PAYMENT_METHODS } from '../constants/paymentMethods'
import { api, apiErrorMessage } from '../lib/api'

interface Invoice {
  id: number
  invoice_no: string
  channel: 'POS' | 'ECOMMERCE'
  customer_name: string | null
  cashier_name: string | null
  grand_total: string
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID'
  payment_method?: string | null
  amount_paid?: string
  status: 'ACTIVE' | 'CANCELLED'
  created_at: string
}

const PAYMENT_TONE: Record<string, 'green' | 'amber' | 'red'> = { PAID: 'green', PARTIAL: 'amber', UNPAID: 'red' }
const REFERENCE_REQUIRED_METHODS = ['UPI', 'CARD', 'NETBANKING', 'GOOGLE_PAY']

export function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [channel, setChannel] = useState('')

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
    api.get('/invoices', { params: { channel: channel || undefined } }).then((res) => setInvoices(res.data.invoices))
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

  // Filtered invoices by search
  const [search, setSearch] = useState('')
  const displayedInvoices = (invoices || []).filter((inv) => {
    if (!search.trim()) return true
    const term = search.toLowerCase()
    return (
      inv.invoice_no?.toLowerCase().includes(term) ||
      inv.customer_name?.toLowerCase().includes(term) ||
      inv.cashier_name?.toLowerCase().includes(term)
    )
  })

  return (
    <div>
      <PageHeader
        title="Invoices Management"
        description="Filter and generate walk-in customer POS bills and e-commerce online order invoices separately."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              placeholder="Search invoice #, customer, cashier…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] w-60"
            />
            {/* Quick Channel Filter Tabs */}
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-medium">
              <button
                type="button"
                onClick={() => setChannel('')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold ${
                  channel === '' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Invoices
              </button>
              <button
                type="button"
                onClick={() => setChannel('POS')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1 ${
                  channel === 'POS' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🏬 Walk-in Customer (POS)</span>
              </button>
              <button
                type="button"
                onClick={() => setChannel('ECOMMERCE')}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer font-bold flex items-center gap-1 ${
                  channel === 'ECOMMERCE' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🌐 E-Commerce Orders</span>
              </button>
            </div>
          </div>
        }
      />

      {msg && <div className="mb-4"><Alert tone="green">{msg}</Alert></div>}

      {invoices === null ? (
        <Spinner />
      ) : (
        <Card className="border border-[var(--color-border-muted)] rounded-3xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--color-border-muted)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-strong)] bg-[var(--color-surface)]/80">
              <tr>
                <th className="px-5 py-3.5">Invoice No</th>
                <th className="px-5 py-3.5">Type / Channel</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Cashier</th>
                <th className="px-5 py-3.5">Total</th>
                <th className="px-5 py-3.5">Payment</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-muted)]">
              {displayedInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--color-surface)]/40 transition-colors">
                  <td
                    onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                    className="px-5 py-3 font-mono font-bold text-[var(--color-primary)] cursor-pointer hover:underline"
                  >
                    {inv.invoice_no}
                  </td>
                  <td className="px-5 py-3">
                    {inv.channel === 'POS' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        🏬 Walk-in Bill
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                        🌐 E-Commerce
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-800 font-medium">
                    {inv.customer_name ?? <span className="text-slate-500 italic">Walk-in Customer</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-xs">{inv.cashier_name ?? 'Online System'}</td>
                  <td className="px-5 py-3 font-serif font-bold text-slate-900">₹{inv.grand_total}</td>
                  <td className="px-5 py-3">
                    <Badge tone={PAYMENT_TONE[inv.payment_status]}>{inv.payment_status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={inv.status === 'ACTIVE' ? 'green' : 'red'}>{inv.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{new Date(inv.created_at).toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Take / Print Invoice Button */}
                      <button
                        onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                        className="px-2.5 py-1 text-xs font-bold bg-[var(--color-primary-tint)] text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        title="View / Print Tax Invoice"
                      >
                        <PrinterIcon className="w-3.5 h-3.5" />
                        <span>Print Bill</span>
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEdit(inv)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer"
                        title="Amend Invoice (Record Payment / Cancel)"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => setDeletingInvoice(inv)}
                        className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Delete / Cancel Invoice"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-sm text-slate-500">
                    No invoices recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Amend Invoice Modal — Record Payment / Correct Method / Cancel */}
      {editingInvoice && (
        <Modal title={`Amend Invoice - ${editingInvoice.invoice_no}`} onClose={() => setEditingInvoice(null)}>
          <div className="space-y-5 text-xs">
            <div className="rounded-lg bg-slate-50 p-3 space-y-1">
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
