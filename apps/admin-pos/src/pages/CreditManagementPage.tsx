import { useEffect, useState } from 'react'
import { Alert, Button, Card, Modal, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface PendingCustomer {
  customer_id: number
  customer_name: string
  phone: string | null
  credit_limit: string | number
  unpaid_bills: number
  total_due: string | number
}

interface CollectionReceipt {
  id: number
  receipt_no: string
  customer_id: number
  customer_name: string
  amount: string | number
  payment_method: string
  collected_by: string
  created_at: string
}

interface UnpaidInvoice {
  id: number
  invoice_no: string
  grand_total: string | number
  amount_paid: string | number
  pending_amount: string | number
  created_at: string
}

function money(val: string | number) {
  return Number(val || 0).toFixed(2)
}

export function CreditManagementPage() {
  const [pendingList, setPendingList] = useState<PendingCustomer[]>([])
  const [totalPending, setTotalPending] = useState<number>(0)
  const [receipts, setReceipts] = useState<CollectionReceipt[]>([])
  const [totalCollected, setTotalCollected] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Modal State
  const [selectedCustomer, setSelectedCustomer] = useState<PendingCustomer | null>(null)
  const [custInvoices, setCustInvoices] = useState<UnpaidInvoice[]>([])
  const [loadingModal, setLoadingModal] = useState(false)
  const [collectMode, setCollectMode] = useState<'AUTO' | 'SELECTED_INVOICES'>('AUTO')
  
  // Auto Mode State
  const [payAmountInput, setPayAmountInput] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash')

  // Selected Invoices Mode State
  const [checkedInvoiceIds, setCheckedInvoiceIds] = useState<number[]>([])

  const [submittingPayment, setSubmittingPayment] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [pendRes, rcptRes] = await Promise.all([
        api.get('/collections/pending'),
        api.get('/collections/receipts'),
      ])
      setPendingList(pendRes.data.pending || [])
      setTotalPending(Number(pendRes.data.total_pending || 0))
      setReceipts(rcptRes.data.receipts || [])
      setTotalCollected(Number(rcptRes.data.total_collected || 0))
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load credit management data'))
    } finally {
      setLoading(false)
    }
  }

  async function openCollectModal(cust: PendingCustomer) {
    setSelectedCustomer(cust)
    setCollectMode('AUTO')
    setPayAmountInput(String(cust.total_due))
    setPaymentMethod('Cash')
    setCheckedInvoiceIds([])
    setLoadingModal(true)
    setError('')

    try {
      const res = await api.get(`/collections/customer-unpaid/${cust.customer_id}`)
      setCustInvoices(res.data.invoices || [])
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not fetch customer unpaid bills'))
    } finally {
      setLoadingModal(false)
    }
  }

  function closeCollectModal() {
    setSelectedCustomer(null)
    setCustInvoices([])
    setCheckedInvoiceIds([])
  }

  // Calculate auto allocation breakdown table
  const enterAmount = Number(payAmountInput || 0)
  let remainingPool = enterAmount
  const autoBreakdown = custInvoices.map((inv) => {
    const pending = Number(inv.pending_amount)
    const thisPay = Math.min(remainingPool, pending)
    const rem = Math.max(0, pending - thisPay)
    remainingPool = Math.max(0, remainingPool - thisPay)
    return {
      ...inv,
      thisPay,
      rem,
    }
  })

  const affectedInvoicesCount = autoBreakdown.filter((item) => item.thisPay > 0).length

  // Calculate total for selected invoices mode
  const selectedInvoiceTotal = custInvoices
    .filter((inv) => checkedInvoiceIds.includes(inv.id))
    .reduce((sum, inv) => sum + Number(inv.pending_amount), 0)

  function toggleInvoiceCheck(invId: number) {
    setCheckedInvoiceIds((prev) =>
      prev.includes(invId) ? prev.filter((id) => id !== invId) : [...prev, invId]
    )
  }

  async function handlePayNow() {
    if (!selectedCustomer) return
    setSubmittingPayment(true)
    setError('')

    try {
      const payload = {
        customer_id: selectedCustomer.customer_id,
        amount: collectMode === 'AUTO' ? enterAmount : selectedInvoiceTotal,
        payment_method: paymentMethod,
        mode: collectMode,
        invoice_ids: collectMode === 'SELECTED_INVOICES' ? checkedInvoiceIds : [],
      }

      const res = await api.post('/collections/pay', payload)
      setSuccessMsg(`Successfully collected Rs. ${money(res.data.collected_amount)} (${res.data.receipt_no})`)
      closeCollectModal()
      await loadData()
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to process collection payment'))
    } finally {
      setSubmittingPayment(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Credit Management</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Customer credit balances and collections.
        </p>
      </div>

      {successMsg && <Alert tone="green">{successMsg}</Alert>}
      {error && <Alert tone="red">{error}</Alert>}

      {/* Top Card: Route Pending Credit Balances */}
      <Card className="overflow-hidden border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800">Route Pending Credit Balances</h2>
          <span className="text-xs font-semibold text-slate-600">
            Total pending: <strong className="text-slate-900">Rs. {money(totalPending)}</strong>
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="w-6 h-6 text-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 uppercase font-semibold text-slate-500 tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">CUSTOMER</th>
                  <th className="px-4 py-3">PHONE</th>
                  <th className="px-4 py-3 text-center">UNPAID BILLS</th>
                  <th className="px-4 py-3 text-right">TOTAL DUE</th>
                  <th className="px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {pendingList.map((cust) => (
                  <tr key={cust.customer_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900">{cust.customer_name}</td>
                    <td className="px-4 py-3 text-slate-500">{cust.phone || '.'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-700">{cust.unpaid_bills}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {money(cust.total_due)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openCollectModal(cust)}
                        className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-3 py-1 rounded-md transition-colors"
                      >
                        Collect
                      </button>
                    </td>
                  </tr>
                ))}

                {pendingList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No pending customer credit balances found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bottom Card: Past Collection Receipts */}
      <Card className="overflow-hidden border-slate-200 shadow-2xs">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-800">Past Collection Receipts</h2>
          <span className="text-xs font-semibold text-slate-600">
            Total collected: <strong className="text-slate-900">Rs. {money(totalCollected)}</strong>
          </span>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="w-6 h-6 text-indigo-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 uppercase font-semibold text-slate-500 tracking-wider text-[11px]">
                <tr>
                  <th className="px-4 py-3">RECEIPT #</th>
                  <th className="px-4 py-3">CUSTOMER</th>
                  <th className="px-4 py-3 text-right">AMOUNT</th>
                  <th className="px-4 py-3 text-center">MODE</th>
                  <th className="px-4 py-3">COLLECTED BY</th>
                  <th className="px-4 py-3 text-right">DATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {receipts.map((rcpt) => (
                  <tr key={rcpt.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-700">{rcpt.receipt_no}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{rcpt.customer_name}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">
                      Rs. {money(rcpt.amount)}
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-600 uppercase">
                      {rcpt.payment_method}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rcpt.collected_by}</td>
                    <td className="px-4 py-3 text-right text-slate-500 font-mono text-[11px]">
                      {new Date(rcpt.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}

                {receipts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                      No collections yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Collect Modal */}
      {selectedCustomer && (
        <Modal title={`Collect from ${selectedCustomer.customer_name}`} onClose={closeCollectModal}>
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Route: -- Credit limit: Rs. {money(selectedCustomer.credit_limit || 10000)} - Outstanding: Rs.{' '}
              {money(selectedCustomer.total_due)}
            </p>

            {/* Mode Selection Tabs */}
            <div className="flex items-center rounded-lg bg-amber-50/60 border border-amber-200/80 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCollectMode('AUTO')}
                className={`flex-1 rounded-md py-1.5 transition-all text-center ${
                  collectMode === 'AUTO'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Auto (Oldest Bill First)
              </button>
              <button
                type="button"
                onClick={() => setCollectMode('SELECTED_INVOICES')}
                className={`flex-1 rounded-md py-1.5 transition-all text-center ${
                  collectMode === 'SELECTED_INVOICES'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Select Invoices
              </button>
            </div>

            {loadingModal ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : collectMode === 'AUTO' ? (
              /* Mode 1: Auto (Oldest Bill First) */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <TextField
                      type="number"
                      step="0.01"
                      value={payAmountInput}
                      onChange={(e) => setPayAmountInput(e.target.value)}
                      placeholder="Enter collection amount..."
                    />
                  </div>
                  <div className="w-36">
                    <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      <option value="Cash">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="Card">Card</option>
                      <option value="Other">Other</option>
                    </Select>
                  </div>
                </div>

                {/* Auto Breakdown Table */}
                <div className="rounded-lg border border-amber-100 bg-amber-50/30 overflow-hidden text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-amber-100/50 uppercase font-semibold text-slate-600 text-[11px]">
                      <tr>
                        <th className="px-3 py-2">Invoice</th>
                        <th className="px-3 py-2 text-right">Pending</th>
                        <th className="px-3 py-2 text-right">This Pay</th>
                        <th className="px-3 py-2 text-right">Rem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100/60 bg-white">
                      {autoBreakdown.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-mono font-bold text-slate-800">{item.invoice_no}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{money(item.pending_amount)}</td>
                          <td className="px-3 py-2 text-right font-bold text-amber-700">{money(item.thisPay)}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{money(item.rem)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs font-semibold text-emerald-600">
                  Collected Rs. {money(enterAmount)} across {affectedInvoicesCount} invoice(s).
                </p>
              </div>
            ) : (
              /* Mode 2: Select Invoices */
              <div className="space-y-3 text-xs">
                <div className="space-y-2 border border-slate-200 rounded-lg p-3 max-h-56 overflow-y-auto">
                  {custInvoices.map((inv) => (
                    <label
                      key={inv.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 cursor-pointer border border-slate-100"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checkedInvoiceIds.includes(inv.id)}
                          onChange={() => toggleInvoiceCheck(inv.id)}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                        <span className="font-mono font-bold text-slate-900">{inv.invoice_no}</span>
                      </div>
                      <span className="font-bold text-slate-800">Rs. {money(inv.pending_amount)}</span>
                    </label>
                  ))}
                </div>

                <div className="rounded-lg bg-amber-50 p-3 flex justify-between items-center font-bold text-xs">
                  <span>Selected Invoice Total</span>
                  <span className="text-sm font-black text-slate-900">Rs. {money(selectedInvoiceTotal)}</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">Payment Method</label>
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Other">Other</option>
                  </Select>
                </div>

                {checkedInvoiceIds.length > 0 && (
                  <p className="text-xs font-semibold text-emerald-600">
                    Collected Rs. {money(selectedInvoiceTotal)} across {checkedInvoiceIds.length} invoice(s).
                  </p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button variant="secondary" onClick={closeCollectModal} className="text-xs">
                Close
              </Button>
              <Button
                onClick={handlePayNow}
                disabled={submittingPayment}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2 rounded-md transition-all shadow-xs"
              >
                {submittingPayment ? 'Processing...' : 'Pay Now'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
