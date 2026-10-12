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

  return (
    <div>
      <PageHeader
        title="Invoices Management"
        description="POS sales and e-commerce order invoices with print receipt, edit payment, and delete controls."
        actions={
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-40">
            <option value="">All Channels</option>
            <option value="POS">POS</option>
            <option value="ECOMMERCE">E-commerce</option>
          </Select>
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
                <th className="px-5 py-3">Invoice No</th>
                <th className="px-5 py-3">Channel</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Cashier</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3">Payment</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-muted)]">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--color-surface)]/40 transition-colors">
                  <td
                    onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                    className="px-5 py-3 font-mono font-bold text-[var(--color-primary)] cursor-pointer hover:underline"
                  >
                    {inv.invoice_no}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{inv.channel}</td>
                  <td className="px-5 py-3 text-slate-600 font-medium">{inv.customer_name ?? 'Walk-in'}</td>
                  <td className="px-5 py-3 text-slate-600">{inv.cashier_name ?? '—'}</td>
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
                      {/* Print Button */}
                      <button
                        onClick={() => navigate(ROUTES.INVOICE_DETAIL(inv.id))}
                        className="p-1.5 text-slate-500 hover:text-[var(--color-primary)] rounded-lg hover:bg-[var(--color-surface)] transition-colors"
                        title="Print Thermal / A4 Receipt"
                      >
                        <PrinterIcon className="w-4 h-4" />
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEdit(inv)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 rounded hover:bg-amber-50 transition-colors"
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
