import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface FinanceTransaction {
  id: number
  transaction_no: string
  type: 'INCOME' | 'EXPENSE'
  category: string
  amount: string
  payment_method: string
  reference_no: string | null
  transaction_date: string
  notes: string | null
  created_by_name: string | null
  created_at: string
}

export function FinancePage() {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [summary, setSummary] = useState({ total_income: 0, total_expense: 0, net_profit: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filterType, setFilterType] = useState<'' | 'INCOME' | 'EXPENSE'>('')

  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE')
  const [category, setCategory] = useState('Rent')
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [referenceNo, setReferenceNo] = useState('')
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')

  function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterType) params.append('type', filterType)

    api.get(`/finance?${params.toString()}`)
      .then((res) => {
        setTransactions(res.data.transactions || [])
        setSummary(res.data.summary || { total_income: 0, total_expense: 0, net_profit: 0 })
      })
      .catch((err) => setError(apiErrorMessage(err, 'Failed to load finance records')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [filterType])

  function openModal(t: 'EXPENSE' | 'INCOME') {
    setType(t)
    setCategory(t === 'EXPENSE' ? 'Electricity / Utilities' : 'Consulting / Other Sales')
    setAmount('')
    setPaymentMethod('CASH')
    setReferenceNo('')
    setTransactionDate(new Date().toISOString().split('T')[0])
    setNotes('')
    setError('')
    setShowModal(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) {
      setError('Amount must be greater than 0')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await api.post('/finance', {
        type,
        category,
        amount: Number(amount),
        payment_method: paymentMethod,
        reference_no: referenceNo.trim() || null,
        transaction_date: transactionDate,
        notes: notes.trim() || null,
      })

      setShowModal(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to record transaction'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this financial record?')) return
    try {
      await api.delete(`/finance/${id}`)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to delete transaction'))
    }
  }

  const CATEGORIES = {
    EXPENSE: ['Rent', 'Electricity / Utilities', 'Staff Salary', 'Marketing & Ads', 'Logistics / Transport', 'Packaging & Office Supplies', 'Maintenance', 'Other Expense'],
    INCOME: ['Direct Store Sale', 'Wholesale Revenue', 'Services / Commission', 'Refund Received', 'Other Income'],
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense & Income Management"
        description="Track store operational expenses, revenue entries, cash flow and net profitability"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => openModal('INCOME')}>
              + Add Income
            </Button>
            <Button onClick={() => openModal('EXPENSE')}>
              + Add Expense
            </Button>
          </div>
        }
      />

      {error && <Alert>{error}</Alert>}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 border-l-4 border-l-emerald-500">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Income</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">₹{summary.total_income.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-slate-400">All recorded income transactions</p>
        </Card>

        <Card className="p-5 border-l-4 border-l-red-500">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Expenses</p>
          <p className="mt-1 text-2xl font-black text-red-600">₹{summary.total_expense.toFixed(2)}</p>
          <p className="mt-1 text-[11px] text-slate-400">All store operational expenses</p>
        </Card>

        <Card className={`p-5 border-l-4 ${summary.net_profit >= 0 ? 'border-l-[#7B3F4A]' : 'border-l-amber-500'}`}>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Net Profit / Cash Flow</p>
          <p className={`mt-1 text-2xl font-black ${summary.net_profit >= 0 ? 'text-[#7B3F4A]' : 'text-amber-600'}`}>
            ₹{summary.net_profit.toFixed(2)}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">Income minus total expenses</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filter By:</span>
            <select
              value={filterType}
              onChange={(e: any) => setFilterType(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-[#7B3F4A] focus:border-[#7B3F4A]"
            >
              <option value="">All Types (Income & Expenses)</option>
              <option value="INCOME">Income Only</option>
              <option value="EXPENSE">Expenses Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading financial records…</div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No transactions found. Click "+ Add Expense" or "+ Add Income" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF2F4]/80 text-[11px] uppercase text-[#804652] border-b border-[#EEDDE0]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Transaction No</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Payment Method</th>
                  <th className="px-4 py-3 font-semibold">Ref No / Notes</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-medium text-slate-900">{t.transaction_date}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{t.transaction_no}</td>
                    <td className="px-4 py-3">
                      <Badge tone={t.type === 'INCOME' ? 'green' : 'red'}>
                        {t.type === 'INCOME' ? '+ INCOME' : '- EXPENSE'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{t.category}</td>
                    <td className={`px-4 py-3 font-bold text-base ${t.type === 'INCOME' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {t.type === 'INCOME' ? '+' : '-'}₹{Number(t.amount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{t.payment_method}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">
                      {t.reference_no && <span className="font-mono mr-1">[{t.reference_no}]</span>}
                      {t.notes || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(t.id)}
                        className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <Modal
          title={type === 'INCOME' ? 'Record Income Entry' : 'Record Expense Entry'}
          onClose={() => setShowModal(false)}
          width="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('EXPENSE')
                  setCategory(CATEGORIES.EXPENSE[0])
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                  type === 'EXPENSE' ? 'bg-red-50 text-red-700 border-red-300' : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                - EXPENSE
              </button>
              <button
                type="button"
                onClick={() => {
                  setType('INCOME')
                  setCategory(CATEGORIES.INCOME[0])
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition ${
                  type === 'INCOME' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                + INCOME
              </button>
            </div>

            <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES[type].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Amount (₹)"
                required
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 5000"
              />
              <TextField
                label="Transaction Date"
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select label="Payment Method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="CARD">Credit / Debit Card</option>
                <option value="BANK_TRANSFER">Bank NetBanking</option>
                <option value="CHEQUE">Cheque</option>
              </Select>
              <TextField
                label="Reference / Bill No (Optional)"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="e.g. INV-1092 or UPI Ref"
              />
            </div>

            <TextField
              label="Notes / Description"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide description of this expense or income"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : `Save ${type === 'INCOME' ? 'Income' : 'Expense'}`}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
