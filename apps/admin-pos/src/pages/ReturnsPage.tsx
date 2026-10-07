import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Customer, Supplier } from '../lib/types'

interface ReturnItemInput {
  variant_id: number
  variant_label: string
  sku: string
  qty: number
  unit_price: number
}

export function ReturnsPage() {
  const [activeTab, setActiveTab] = useState<'SALE' | 'PURCHASE'>('SALE')
  const [saleReturns, setSaleReturns] = useState<any[]>([])
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [stagedItems, setStagedItems] = useState<ReturnItemInput[]>([])

  // Item picker states
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [itemQty, setItemQty] = useState('1')
  const [itemUnitPrice, setItemUnitPrice] = useState('0')

  const [posProducts, setPosProducts] = useState<any[]>([])

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/returns/sales'),
      api.get('/returns/purchases'),
      api.get('/pos/products', { params: { limit: 500 } }),
      api.get('/customers'),
      api.get('/suppliers'),
    ])
      .then(([srRes, prRes, posRes, custRes, suppRes]) => {
        setSaleReturns(srRes.data.sale_returns || [])
        setPurchaseReturns(prRes.data.purchase_returns || [])
        setPosProducts(posRes.data.items || [])
        setCustomers(custRes.data.customers || [])
        setSuppliers(suppRes.data.suppliers || [])
      })
      .catch((err) => setError(apiErrorMessage(err, 'Failed to load returns data')))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const allVariants = posProducts.map((p) => ({
    id: p.variant_id,
    product_name: p.product_name,
    sku: p.sku,
    retail_price: p.retail_price,
    wholesale_price: p.wholesale_price,
    label: `${p.product_name} (${p.sku}) — ₹${p.retail_price}`,
  }))

  function openCreateModal(tab: 'SALE' | 'PURCHASE') {
    setActiveTab(tab)
    setSelectedCustomerId('')
    setSelectedSupplierId('')
    setReason(tab === 'SALE' ? 'Defective item returned by customer' : 'Damaged stock returned to supplier')
    setNotes('')
    setStagedItems([])
    setSelectedVariantId('')
    setItemQty('1')
    setItemUnitPrice('0')
    setError('')
    setShowModal(true)
  }

  function handleAddVariantItem() {
    const vId = Number(selectedVariantId)
    const qty = Number(itemQty)
    const price = Number(itemUnitPrice)

    if (!vId || qty <= 0 || price < 0) return

    const v = allVariants.find((varItem) => varItem.id === vId)
    if (!v) return

    setStagedItems((prev) => {
      const existing = prev.find((item) => item.variant_id === vId)
      if (existing) {
        return prev.map((item) =>
          item.variant_id === vId ? { ...item, qty: item.qty + qty, unit_price: price } : item
        )
      }
      return [
        ...prev,
        {
          variant_id: vId,
          variant_label: `${v.product_name} (${v.sku})`,
          sku: v.sku,
          qty,
          unit_price: price,
        },
      ]
    })

    setSelectedVariantId('')
    setItemQty('1')
    setItemUnitPrice('0')
  }

  function handleRemoveItem(variantId: number) {
    setStagedItems((prev) => prev.filter((i) => i.variant_id !== variantId))
  }

  const grandTotal = stagedItems.reduce((acc, item) => acc + item.qty * item.unit_price, 0)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (stagedItems.length === 0) {
      setError('Please add at least one item to return')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      if (activeTab === 'SALE') {
        await api.post('/returns/sales', {
          customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
          reason,
          notes,
          items: stagedItems.map((i) => ({
            variant_id: i.variant_id,
            qty: i.qty,
            unit_price: i.unit_price,
          })),
        })
      } else {
        await api.post('/returns/purchases', {
          supplier_id: selectedSupplierId ? Number(selectedSupplierId) : null,
          reason,
          notes,
          items: stagedItems.map((i) => ({
            variant_id: i.variant_id,
            qty: i.qty,
            unit_price: i.unit_price,
          })),
        })
      }

      setShowModal(false)
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to process return'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sale Returns & Purchase Returns"
        description="Process customer returns and supplier returns with automatic stock adjustment"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => openCreateModal('SALE')}>
              + New Sale Return
            </Button>
            <Button onClick={() => openCreateModal('PURCHASE')}>
              + New Purchase Return
            </Button>
          </div>
        }
      />

      {error && <Alert>{error}</Alert>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('SALE')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
            activeTab === 'SALE' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          Sale Returns ({saleReturns.length})
        </button>
        <button
          onClick={() => setActiveTab('PURCHASE')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
            activeTab === 'PURCHASE' ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100'
          }`}
        >
          Purchase Returns ({purchaseReturns.length})
        </button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading return records…</div>
        ) : activeTab === 'SALE' ? (
          saleReturns.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              No sale returns recorded yet. Click "+ New Sale Return" above to process one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Return No</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Reason</th>
                    <th className="px-4 py-3 font-semibold">Items Returned</th>
                    <th className="px-4 py-3 font-semibold">Total Amount</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {saleReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700">{r.return_no}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{r.customer_name || 'Walk-in Customer'}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.reason}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5 text-xs text-slate-700">
                          {r.items?.map((item: any) => (
                            <div key={item.id}>
                              <span className="font-semibold">{item.qty}x</span> {item.product_name} ({item.sku})
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold text-emerald-700">₹{Number(r.total_amount).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <Badge tone="green">{r.refund_status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : purchaseReturns.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No purchase returns recorded yet. Click "+ New Purchase Return" above to process one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Return No</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold">Items Returned</th>
                  <th className="px-4 py-3 font-semibold">Total Amount</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-700">{r.return_no}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{r.supplier_name || 'General Supplier'}</td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.reason}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5 text-xs text-slate-700">
                        {r.items?.map((item: any) => (
                          <div key={item.id}>
                            <span className="font-semibold">{item.qty}x</span> {item.product_name} ({item.sku})
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-700">₹{Number(r.total_amount).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <Badge tone="green">{r.refund_status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {showModal && (
        <Modal
          title={activeTab === 'SALE' ? 'Create New Sale Return' : 'Create New Purchase Return'}
          onClose={() => setShowModal(false)}
          width="lg"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeTab === 'SALE' ? (
              <Select
                label="Customer (Optional)"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">— Walk-in / Unlinked Customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </Select>
            ) : (
              <Select
                label="Supplier (Optional)"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">— Select Supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.contact_person})
                  </option>
                ))}
              </Select>
            )}

            <TextField
              label="Return Reason"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged product, incorrect size"
            />

            {/* Item Selector Box */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
              <span className="block text-xs font-bold uppercase tracking-wider text-indigo-900">
                Add Products to Return
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_110px_80px] gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Select Variant</label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => {
                      const vId = Number(e.target.value)
                      setSelectedVariantId(e.target.value)
                      const found = allVariants.find((v) => v.id === vId)
                      if (found) setItemUnitPrice(String(found.retail_price))
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Choose item to return…</option>
                    {allVariants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <TextField
                  label="Qty"
                  type="number"
                  min="1"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                />
                <TextField
                  label="Unit Price (₹)"
                  type="number"
                  step="0.01"
                  value={itemUnitPrice}
                  onChange={(e) => setItemUnitPrice(e.target.value)}
                />
                <Button type="button" size="sm" onClick={handleAddVariantItem}>
                  + Add
                </Button>
              </div>
            </div>

            {/* Staged Items Table */}
            {stagedItems.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800">Return Items Summary ({stagedItems.length})</span>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                      <tr>
                        <th className="p-2">Variant</th>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2">Unit Price</th>
                        <th className="p-2">Subtotal</th>
                        <th className="p-2 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stagedItems.map((item) => (
                        <tr key={item.variant_id}>
                          <td className="p-2 font-semibold text-slate-900">{item.variant_label}</td>
                          <td className="p-2 text-slate-500 font-mono">{item.sku}</td>
                          <td className="p-2 font-bold text-slate-800">{item.qty}</td>
                          <td className="p-2">₹{item.unit_price.toFixed(2)}</td>
                          <td className="p-2 font-bold text-indigo-700">₹{(item.qty * item.unit_price).toFixed(2)}</td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.variant_id)}
                              className="text-red-500 hover:text-red-700 font-bold"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end p-2 bg-slate-50 rounded-lg text-sm font-bold text-slate-900">
                  Total Refund Amount: <span className="ml-2 text-emerald-600">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <TextField
              label="Additional Notes (Optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Refund issued via cash / credited to customer balance"
            />

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || stagedItems.length === 0}>
                {submitting ? 'Processing Return…' : `Confirm ${activeTab === 'SALE' ? 'Sale' : 'Purchase'} Return`}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
