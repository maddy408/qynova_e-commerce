import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { PencilIcon, PrinterIcon, TrashIcon } from '../components/Icons'
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

export function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [channel, setChannel] = useState('')

  // Edit Invoice Modal state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [editPaymentMethod, setEditPaymentMethod] = useState('CASH')
  const [editAmountPaid, setEditAmountPaid] = useState('')
  const [editStatus, setEditStatus] = useState('ACTIVE')
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete Invoice state
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [msg, setMsg] = useState('')

  function loadInvoices() {
    api.get('/invoices', { params: { channel: channel || undefined } }).then((res) => setInvoices(res.data.invoices))
  }

  useEffect(() => {
    loadInvoices()
  }, [channel])

  function openEdit(inv: Invoice) {
    setEditingInvoice(inv)
    setEditPaymentMethod(inv.payment_method || 'CASH')
    setEditAmountPaid(inv.amount_paid || inv.grand_total)
    setEditStatus(inv.status)
  }

  async function handleSaveEdit() {
    if (!editingInvoice) return
    setSavingEdit(true)
    try {
      await api.put(`/invoices/${editingInvoice.id}`, {
        payment_method: editPaymentMethod,
        amount_paid: editAmountPaid,
        status: editStatus,
      })
      setEditingInvoice(null)
      setMsg(`Invoice ${editingInvoice.invoice_no} updated successfully!`)
      setTimeout(() => setMsg(''), 3000)
      loadInvoices()
    } catch (err) {
      alert(apiErrorMessage(err))
    } finally {
      setSavingEdit(false)
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
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
              <tr>
                <th className="px-6 py-4">Invoice No</th>
                <th className="px-6 py-4">Channel</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Cashier</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E0E3]">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                  <td
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="px-6 py-4 font-bold text-[#804652] cursor-pointer hover:underline"
                  >
                    {inv.invoice_no}
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{inv.channel}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{inv.customer_name ?? 'Walk-in'}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{inv.cashier_name ?? '—'}</td>
                  <td className="px-6 py-4 font-extrabold text-slate-950">₹{inv.grand_total}</td>
                  <td className="px-6 py-4">
                    <Badge tone={PAYMENT_TONE[inv.payment_status]}>{inv.payment_status}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={inv.status === 'ACTIVE' ? 'green' : 'red'}>{inv.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-xs font-medium">{new Date(inv.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Print Button */}
                      <button
                        onClick={() => navigate(`/invoices/${inv.id}`)}
                        className="p-1.5 text-slate-600 hover:text-[#804652] rounded-lg hover:bg-[#FAF2F4] transition-colors cursor-pointer"
                        title="Print Thermal / A4 Receipt"
                      >
                        <PrinterIcon className="w-4 h-4" />
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEdit(inv)}
                        className="p-1.5 text-slate-600 hover:text-amber-700 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer"
                        title="Edit Invoice Details"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => setDeletingInvoice(inv)}
                        className="p-1.5 text-slate-600 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
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
                  <td colSpan={9} className="px-6 py-12 text-center text-xs font-semibold text-slate-500">
                    No invoices recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <Modal title={`Edit Invoice - ${editingInvoice.invoice_no}`} onClose={() => setEditingInvoice(null)}>
          <div className="space-y-4 text-xs">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="font-bold text-slate-900 text-sm">Invoice #{editingInvoice.invoice_no}</div>
              <div className="text-slate-600 mt-1">
                Grand Total: <strong className="text-slate-900">₹{editingInvoice.grand_total}</strong>
              </div>
            </div>

            <Select
              label="Payment Method"
              value={editPaymentMethod}
              onChange={(e) => setEditPaymentMethod(e.target.value)}
            >
              <option value="CASH">Cash</option>
              <option value="UPI">UPI / GPay / PhonePe</option>
              <option value="CARD">Credit / Debit Card</option>
              <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
              <option value="CREDIT">Credit / Due</option>
            </Select>

            <TextField
              label="Amount Paid (₹)"
              type="number"
              step="0.01"
              value={editAmountPaid}
              onChange={(e) => setEditAmountPaid(e.target.value)}
            />

            <Select label="Invoice Status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="CANCELLED">CANCELLED</option>
            </Select>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditingInvoice(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Update Invoice'}
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
