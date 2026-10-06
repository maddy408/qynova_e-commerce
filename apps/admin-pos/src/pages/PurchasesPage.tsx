import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
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
  payment_status: string
  purchase_date: string
}

interface LineItem {
  variant_id: number
  product_name: string
  sku: string
  quantity: string
  unit_cost: string
}

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [amountPaid, setAmountPaid] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scanError, setScanError] = useState('')
  const [items, setItems] = useState<LineItem[]>([])

  function load() {
    api.get('/purchases').then((res) => setPurchases(res.data.purchases))
  }

  useEffect(() => {
    load()
    api.get('/suppliers').then((res) => setSuppliers(res.data.suppliers))
  }, [])

  async function addByCode(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || scanCode.trim() === '') return
    e.preventDefault()
    setScanError('')
    try {
      const res = await api.get('/variants/lookup', { params: { code: scanCode.trim() } })
      const v = res.data.variant
      setItems((prev) => {
        const existing = prev.find((i) => i.variant_id === v.id)
        if (existing) {
          return prev.map((i) => (i.variant_id === v.id ? { ...i, quantity: String(Number(i.quantity) + 1) } : i))
        }
        return [...prev, { variant_id: v.id, product_name: v.product_name, sku: v.sku, quantity: '1', unit_cost: v.purchase_price ?? '0' }]
      })
      setScanCode('')
    } catch (err) {
      setScanError(apiErrorMessage(err, 'Variant not found'))
    }
  }

  function updateItem(variantId: number, field: 'quantity' | 'unit_cost', value: string) {
    setItems((prev) => prev.map((i) => (i.variant_id === variantId ? { ...i, [field]: value } : i)))
  }

  function removeItem(variantId: number) {
    setItems((prev) => prev.filter((i) => i.variant_id !== variantId))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!supplierId) {
      setError('Select a supplier')
      return
    }
    if (items.length === 0) {
      setError('Scan or add at least one item')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/purchases', {
        supplier_id: supplierId,
        purchase_date: purchaseDate,
        amount_paid: amountPaid || '0',
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity, unit_cost: i.unit_cost })),
      })
      setShowForm(false)
      setItems([])
      setSupplierId('')
      setAmountPaid('')
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
        description="Supplier -> Purchase -> stock increase, through the same InventoryService used everywhere else."
        actions={<Button onClick={() => setShowForm(true)}>+ New Purchase</Button>}
      />

      {purchases === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Purchase No</th>
                <th className="px-5 py-3 font-medium">Supplier</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Payment</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3 font-medium text-slate-900">{p.purchase_no}</td>
                  <td className="px-5 py-3 text-slate-600">{p.supplier_name}</td>
                  <td className="px-5 py-3 text-slate-600">₹{p.grand_total}</td>
                  <td className="px-5 py-3 text-slate-600">{p.payment_status}</td>
                  <td className="px-5 py-3">
                    <Badge tone={p.status === 'ACTIVE' ? 'green' : 'red'}>{p.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{p.purchase_date}</td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    No purchases yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showForm && (
        <Modal title="New Purchase" onClose={() => setShowForm(false)} width="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <div className="grid grid-cols-3 gap-4">
              <Select label="Supplier" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <TextField label="Purchase Date" type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
              <TextField label="Amount Paid" type="number" step="0.01" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" />
            </div>

            <div>
              <TextField
                label="Scan or type SKU / Barcode, then press Enter"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={addByCode}
                placeholder="e.g. TSH-BLU-L"
              />
              {scanError && <p className="mt-1 text-xs text-red-600">{scanError}</p>}
            </div>

            {items.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium">Qty</th>
                    <th className="py-2 font-medium">Unit Cost</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.variant_id}>
                      <td className="py-2">
                        <p className="font-medium text-slate-900">{item.product_name}</p>
                        <p className="text-xs text-slate-500">{item.sku}</p>
                      </td>
                      <td className="py-2">
                        <input
                          value={item.quantity}
                          onChange={(e) => updateItem(item.variant_id, 'quantity', e.target.value)}
                          className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          value={item.unit_cost}
                          onChange={(e) => updateItem(item.variant_id, 'unit_cost', e.target.value)}
                          className="w-20 rounded border border-slate-300 px-1.5 py-1 text-sm"
                        />
                      </td>
                      <td className="py-2">
                        <button type="button" onClick={() => removeItem(item.variant_id)} className="text-xs text-red-600">
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Purchase'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
