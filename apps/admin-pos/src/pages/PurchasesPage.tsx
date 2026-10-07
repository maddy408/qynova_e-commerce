import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface Supplier {
  id: number
  name: string
}

interface Purchase {
  id: number
  purchase_no: string
  supplier_name: string
  status: 'ACTIVE' | 'CANCELLED'
  grand_total: string
  amount_paid: string
  payment_method?: string | null
  payment_status: string
  purchase_date: string
  notes?: string | null
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

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [allVariants, setAllVariants] = useState<VariantOption[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMode, setPaymentMode] = useState<'SINGLE' | 'SPLIT'>('SINGLE')
  const [singlePaymentMethod, setSinglePaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CREDIT'>('CASH')
  const [paymentStatus] = useState<'PAID' | 'PARTIAL' | 'UNPAID'>('PAID')
  const [amountPaid, setAmountPaid] = useState('')
  const [items, setItems] = useState<LineItem[]>([])

  // Split payment breakdown fields
  const [splitCash, setSplitCash] = useState('')
  const [splitUpi, setSplitUpi] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [splitBank, setSplitBank] = useState('')
  const [splitCredit, setSplitCredit] = useState('')

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

  function updateItem(variantId: number, field: 'quantity' | 'unit_cost' | 'mrp' | 'discount_amount', value: string) {
    setItems((prev) => prev.map((i) => (i.variant_id === variantId ? { ...i, [field]: value } : i)))
  }

  function removeItem(variantId: number) {
    setItems((prev) => prev.filter((i) => i.variant_id !== variantId))
  }

  const grandTotal = items.reduce(
    (acc, item) => acc + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) - (Number(item.discount_amount) || 0),
    0,
  )

  // Split calculation helpers
  const splitCashNum = Number(splitCash) || 0
  const splitUpiNum = Number(splitUpi) || 0
  const splitCardNum = Number(splitCard) || 0
  const splitBankNum = Number(splitBank) || 0
  const splitTotalPaid = splitCashNum + splitUpiNum + splitCardNum + splitBankNum
  const splitCreditCalculated = Math.max(0, grandTotal - splitTotalPaid)

  // Auto-calculate split credit whenever cash/upi/card/bank amounts change
  function updateSplitField(field: 'cash' | 'upi' | 'card' | 'bank', value: string) {
    let nextCash = splitCash
    let nextUpi = splitUpi
    let nextCard = splitCard
    let nextBank = splitBank

    if (field === 'cash') { nextCash = value; setSplitCash(value); }
    if (field === 'upi') { nextUpi = value; setSplitUpi(value); }
    if (field === 'card') { nextCard = value; setSplitCard(value); }
    if (field === 'bank') { nextBank = value; setSplitBank(value); }

    const paidSum = (Number(nextCash) || 0) + (Number(nextUpi) || 0) + (Number(nextCard) || 0) + (Number(nextBank) || 0)
    const remaining = Math.max(0, grandTotal - paidSum)
    setSplitCredit(remaining > 0 ? remaining.toFixed(2) : '0')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!supplierId) {
      setError('Select a supplier')
      return
    }
    if (items.length === 0) {
      setError('Select at least one item for stock purchase')
      return
    }

    let finalAmountPaid = '0'
    let finalPaymentMethod = ''
    let splitNotes = ''

    if (paymentMode === 'SINGLE') {
      finalPaymentMethod = singlePaymentMethod
      if (singlePaymentMethod === 'CREDIT') {
        finalAmountPaid = '0'
      } else {
        finalAmountPaid = amountPaid !== '' ? amountPaid : String(grandTotal)
      }
    } else {
      // SPLIT mode
      finalAmountPaid = String(splitTotalPaid)
      const parts: string[] = []
      if (splitCashNum > 0) parts.push(`Cash: ₹${splitCashNum.toFixed(2)}`)
      if (splitUpiNum > 0) parts.push(`UPI: ₹${splitUpiNum.toFixed(2)}`)
      if (splitCardNum > 0) parts.push(`Card: ₹${splitCardNum.toFixed(2)}`)
      if (splitBankNum > 0) parts.push(`Bank: ₹${splitBankNum.toFixed(2)}`)
      const dueCredit = Number(splitCredit) || splitCreditCalculated
      if (dueCredit > 0) parts.push(`Credit: ₹${dueCredit.toFixed(2)}`)

      finalPaymentMethod = `SPLIT (${parts.join(', ')})`
      splitNotes = `Split Payment Details: ${parts.join(' | ')}`
    }

    // Auto compute payment status
    let autoStatus = paymentStatus
    if (Number(finalAmountPaid) >= grandTotal && grandTotal > 0) {
      autoStatus = 'PAID'
    } else if (Number(finalAmountPaid) > 0) {
      autoStatus = 'PARTIAL'
    } else {
      autoStatus = 'UNPAID'
    }

    setSubmitting(true)
    try {
      await api.post('/purchases', {
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        payment_method: finalPaymentMethod,
        payment_status: autoStatus,
        amount_paid: finalAmountPaid,
        notes: splitNotes || undefined,
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
      setAmountPaid('')
      setSplitCash('')
      setSplitUpi('')
      setSplitCard('')
      setSplitBank('')
      setSplitCredit('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create purchase'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Supplier -> Stock Purchase -> Increase inventory transaction with cost & MRP management."
        actions={
          <Button
            onClick={() => {
              setShowForm(true)
              fetchVariants()
            }}
          >
            + New Purchase
          </Button>
        }
      />

      {purchases === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Purchase No</th>
                <th className="px-4 py-2.5 font-semibold">Supplier</th>
                <th className="px-4 py-2.5 font-semibold">Grand Total</th>
                <th className="px-4 py-2.5 font-semibold">Paid Amount</th>
                <th className="px-4 py-2.5 font-semibold">Payment Method</th>
                <th className="px-4 py-2.5 font-semibold">Payment Status</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-900">{p.purchase_no}</td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{p.supplier_name}</td>
                  <td className="px-4 py-2.5 text-slate-900 font-bold">₹{p.grand_total}</td>
                  <td className="px-4 py-2.5 text-emerald-700 font-bold">₹{p.amount_paid}</td>
                  <td className="px-4 py-2.5 text-slate-700 font-medium text-[11px] max-w-[200px] truncate" title={p.payment_method ?? ''}>
                    {p.payment_method || 'CASH'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.payment_status === 'PAID' ? 'green' : p.payment_status === 'PARTIAL' ? 'amber' : 'red'}>
                      {p.payment_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={p.status === 'ACTIVE' ? 'green' : 'red'}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{p.purchase_date}</td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No purchases recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Stock Purchase" onClose={() => setShowForm(false)} width="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <div className="grid grid-cols-3 gap-3">
              <Select label="Supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select Supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <TextField label="Purchase Date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                <div className="flex gap-1.5 p-0.5 rounded-lg border border-slate-200 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setPaymentMode('SINGLE')}
                    className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${
                      paymentMode === 'SINGLE' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Single Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('SPLIT')
                      // Pre-fill credit automatically
                      const rem = Math.max(0, grandTotal - (Number(splitCash) + Number(splitUpi) + Number(splitCard) + Number(splitBank)))
                      setSplitCredit(rem > 0 ? rem.toFixed(2) : '0')
                    }}
                    className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${
                      paymentMode === 'SPLIT' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Split Payment
                  </button>
                </div>
              </div>
            </div>

            {/* Single Mode Payment Selector */}
            {paymentMode === 'SINGLE' ? (
              <div className="grid grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                <Select
                  label="Payment Method"
                  value={singlePaymentMethod}
                  onChange={(e: any) => setSinglePaymentMethod(e.target.value)}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="CREDIT">Credit / Pending Due</option>
                </Select>
                <TextField
                  label="Amount Paid (₹)"
                  type="number"
                  step="0.01"
                  disabled={singlePaymentMethod === 'CREDIT'}
                  value={singlePaymentMethod === 'CREDIT' ? '0' : amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder={singlePaymentMethod === 'CREDIT' ? '0.00' : String(grandTotal.toFixed(2))}
                />
              </div>
            ) : (
              /* Split Payment Mode breakdown across Cash, UPI, Card, Bank, Credit */
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-950">
                    Split Payment Breakdown (Multi-Mode Pay)
                  </h4>
                  <span className="text-[11px] font-semibold text-indigo-700">
                    Grand Total: <strong className="text-slate-900">₹{grandTotal.toFixed(2)}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <TextField
                    label="Cash (₹)"
                    type="number"
                    step="0.01"
                    value={splitCash}
                    onChange={(e) => updateSplitField('cash', e.target.value)}
                    placeholder="0"
                  />
                  <TextField
                    label="UPI / Online (₹)"
                    type="number"
                    step="0.01"
                    value={splitUpi}
                    onChange={(e) => updateSplitField('upi', e.target.value)}
                    placeholder="0"
                  />
                  <TextField
                    label="Card (₹)"
                    type="number"
                    step="0.01"
                    value={splitCard}
                    onChange={(e) => updateSplitField('card', e.target.value)}
                    placeholder="0"
                  />
                  <TextField
                    label="Bank Transfer (₹)"
                    type="number"
                    step="0.01"
                    value={splitBank}
                    onChange={(e) => updateSplitField('bank', e.target.value)}
                    placeholder="0"
                  />
                  <TextField
                    label="Credit / Due (₹)"
                    type="number"
                    step="0.01"
                    value={splitCredit}
                    onChange={(e) => setSplitCredit(e.target.value)}
                    placeholder="0"
                  />
                </div>

                {/* Calculation Summary Bar */}
                <div className="flex items-center justify-between rounded-lg bg-white p-2.5 border border-indigo-100 text-xs">
                  <div className="flex items-center gap-4">
                    <span>
                      Total Paid Upfront: <strong className="text-emerald-700">₹{splitTotalPaid.toFixed(2)}</strong>
                    </span>
                    <span>
                      Pending Credit Due: <strong className="text-amber-700">₹{(Number(splitCredit) || 0).toFixed(2)}</strong>
                    </span>
                  </div>
                  <Badge tone={splitTotalPaid >= grandTotal && grandTotal > 0 ? 'green' : splitTotalPaid > 0 ? 'amber' : 'red'}>
                    {splitTotalPaid >= grandTotal && grandTotal > 0 ? 'FULL PAID' : splitTotalPaid > 0 ? 'PARTIAL PAYMENT' : 'CREDIT / UNPAID'}
                  </Badge>
                </div>
              </div>
            )}

            {/* Auto-opening Item Searchbar Dropdown with Keyboard Navigation */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Search Items / Variants (Type item name, SKU or press Down Arrow to browse)
              </label>
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
                className="w-full rounded-lg border border-indigo-300 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
              />

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                  {filteredVariants.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-500">No items found matching search.</div>
                  ) : (
                    filteredVariants.map((v, index) => (
                      <div
                        key={v.id}
                        onClick={() => selectVariant(v)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`flex cursor-pointer items-center justify-between px-3 py-2 text-xs transition-colors ${
                          index === highlightedIndex ? 'bg-indigo-600 text-white font-medium' : 'hover:bg-slate-100 text-slate-800'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{v.product_name}</p>
                          <p className={`text-[10px] ${index === highlightedIndex ? 'text-indigo-100' : 'text-slate-500'}`}>
                            SKU: <span className="font-mono">{v.sku}</span> | Stock: {v.on_hand ?? 0}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">Unit Cost: ₹{v.purchase_price || '0'}</p>
                          <p className={`text-[10px] ${index === highlightedIndex ? 'text-indigo-100' : 'text-slate-500'}`}>MRP: ₹{v.mrp}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Purchase Item List ({items.length})</h3>
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Product Item</th>
                      <th className="px-3 py-2 font-semibold">Qty</th>
                      <th className="px-3 py-2 font-semibold">Purchase Price (₹)</th>
                      <th className="px-3 py-2 font-semibold">MRP (₹)</th>
                      <th className="px-3 py-2 font-semibold">Discount (₹)</th>
                      <th className="px-3 py-2 font-semibold">Subtotal</th>
                      <th className="px-3 py-2 font-semibold text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const sub = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0) - (Number(item.discount_amount) || 0)
                      return (
                        <tr key={item.variant_id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-slate-900">{item.product_name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</p>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.variant_id, 'quantity', e.target.value)}
                              className="w-16 rounded border border-slate-300 px-2 py-1 text-xs font-bold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unit_cost}
                              onChange={(e) => updateItem(item.variant_id, 'unit_cost', e.target.value)}
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.mrp}
                              onChange={(e) => updateItem(item.variant_id, 'mrp', e.target.value)}
                              className="w-24 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.discount_amount}
                              onChange={(e) => updateItem(item.variant_id, 'discount_amount', e.target.value)}
                              className="w-20 rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-900 focus:ring-1 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2 font-bold text-slate-900">₹{sub.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeItem(item.variant_id)}
                              className="text-xs font-bold text-red-600 hover:text-red-800"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <div className="text-xs">
                    <span className="text-slate-500 font-medium">Grand Total: </span>
                    <span className="text-sm font-extrabold text-slate-900">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Submit Stock Purchase'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
