import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Badge, Button, Card, Modal, PageHeader, Select, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import type { Supplier } from '../lib/types'

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

  // Item picker states (PURCHASE tab only — free product/qty/price entry
  // is fine for a supplier return; a SALE return needs the real invoice,
  // see below)
  const [selectedVariantId, setSelectedVariantId] = useState('')
  const [itemQty, setItemQty] = useState('1')
  const [itemUnitPrice, setItemUnitPrice] = useState('0')

  const [posProducts, setPosProducts] = useState<any[]>([])

  // SALE tab: pick a real invoice, then qty-cap its own items — replaces
  // a free-text product/qty/price picker that had no link to any actual
  // sale, so a return could fabricate stock and refund amount out of
  // thin air (Phase 6 audit finding).
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [invoiceResults, setInvoiceResults] = useState<any[]>([])
  const [searchingInvoices, setSearchingInvoices] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null)
  const [returnQtyDraft, setReturnQtyDraft] = useState<Record<number, string>>({})

  function load() {
    setLoading(true)
    Promise.all([
      api.get('/returns/sales'),
      api.get('/returns/purchases'),
      api.get('/pos/products', { params: { limit: 500 } }),
      api.get('/suppliers'),
    ])
      .then(([srRes, prRes, posRes, suppRes]) => {
        setSaleReturns(srRes.data.sale_returns || [])
        setPurchaseReturns(prRes.data.purchase_returns || [])
        setPosProducts(posRes.data.items || [])
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
    setInvoiceSearch('')
    setInvoiceResults([])
    setSelectedInvoice(null)
    setReturnQtyDraft({})
    setError('')
    setShowModal(true)
  }

  async function searchInvoices() {
    if (!invoiceSearch.trim()) return
    setSearchingInvoices(true)
    setError('')
    try {
      const res = await api.get('/invoices', { params: { search: invoiceSearch.trim(), limit: 10 } })
      setInvoiceResults(res.data.invoices || [])
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to search invoices'))
    } finally {
      setSearchingInvoices(false)
    }
  }

  async function selectInvoice(invoiceId: number) {
    setError('')
    try {
      const res = await api.get(`/invoices/${invoiceId}`)
      setSelectedInvoice(res.data.invoice)
      setReturnQtyDraft({})
      setStagedItems([])
      if (res.data.invoice.customer_id) {
        setSelectedCustomerId(String(res.data.invoice.customer_id))
      }
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load invoice'))
    }
  }

  function handleReturnQtyChange(item: any, value: string) {
    setReturnQtyDraft((prev) => ({ ...prev, [item.variant_id]: value }))

    const qty = Number(value)
    const invoicedQty = Number(item.quantity)
    const unitPrice = invoicedQty > 0 ? Number(item.line_total) / invoicedQty : 0

    setStagedItems((prev) => {
      const withoutThis = prev.filter((i) => i.variant_id !== item.variant_id)
      if (!qty || qty <= 0) return withoutThis
      const cappedQty = Math.min(qty, invoicedQty)
      return [
        ...withoutThis,
        {
          variant_id: item.variant_id,
          variant_label: `${item.product_name_snapshot} (${item.sku_snapshot})`,
          sku: item.sku_snapshot,
          qty: cappedQty,
          unit_price: unitPrice,
        },
      ]
    })
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
        if (!selectedInvoice) {
          setError('Search for and select the invoice being returned against')
          setSubmitting(false)
          return
        }
        await api.post('/returns/sales', {
          invoice_id: selectedInvoice.id,
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
      <div className="inline-flex items-center gap-1 p-1 rounded-full text-xs overflow-x-auto max-w-full scrollbar-none shadow-sm border bg-[var(--color-extra-020)] border-[var(--color-border)]">
        <button
          onClick={() => setActiveTab('SALE')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
            activeTab === 'SALE' ? 'bg-[var(--color-primary)] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          Sale Returns ({saleReturns.length})
        </button>
        <button
          onClick={() => setActiveTab('PURCHASE')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-all ${
            activeTab === 'PURCHASE' ? 'bg-[var(--color-primary)] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          Purchase Returns ({purchaseReturns.length})
        </button>
      </div>

      <Card className="overflow-hidden border border-[var(--color-border-muted)] shadow-2xs rounded-3xl">
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
                <thead className="bg-[var(--color-surface)]/80 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-strong)] border-b border-[var(--color-border-muted)]">
                  <tr>
                    <th className="px-4 py-3">Return No</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Items Returned</th>
                    <th className="px-4 py-3">Total Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-muted)]">
                  {saleReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--color-surface)]/40 transition">
                      <td className="px-4 py-3 font-mono font-bold text-[var(--color-primary)]">{r.return_no}</td>
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
              <thead className="bg-[var(--color-surface)]/80 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-strong)] border-b border-[var(--color-border-muted)]">
                <tr>
                  <th className="px-4 py-3">Return No</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Items Returned</th>
                  <th className="px-4 py-3">Total Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-muted)]">
                {purchaseReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--color-surface)]/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-[var(--color-primary)]">{r.return_no}</td>
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
            {activeTab === 'PURCHASE' && (
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

            {activeTab === 'SALE' ? (
              <div className="space-y-3">
                {/* Invoice Lookup — a sale return must reference the real
                    invoice it's returning against, so qty/price come from
                    what was actually sold, not a free-text form. */}
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 space-y-3">
                  <span className="block text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                    Find Invoice to Return Against
                  </span>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <TextField
                        label="Invoice No. or Customer Name"
                        value={invoiceSearch}
                        onChange={(e) => setInvoiceSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            searchInvoices()
                          }
                        }}
                        placeholder="e.g. INV-14"
                      />
                    </div>
                    <Button type="button" size="sm" onClick={searchInvoices} disabled={searchingInvoices}>
                      {searchingInvoices ? 'Searching…' : 'Search'}
                    </Button>
                  </div>

                  {invoiceResults.length > 0 && !selectedInvoice && (
                    <div className="rounded-xl border border-[var(--color-border)] bg-white divide-y divide-[var(--color-border)] max-h-40 overflow-y-auto">
                      {invoiceResults.map((inv) => (
                        <button
                          type="button"
                          key={inv.id}
                          onClick={() => selectInvoice(inv.id)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)]/60 flex items-center justify-between"
                        >
                          <span className="font-bold text-[var(--color-primary)]">{inv.invoice_no}</span>
                          <span className="text-slate-600">{inv.customer_name ?? 'Walk-in'}</span>
                          <span className="font-semibold text-slate-900">₹{inv.grand_total}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedInvoice && (
                    <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          {selectedInvoice.invoice_no} · {selectedInvoice.customer_name ?? 'Walk-in'} · Paid ₹{selectedInvoice.amount_paid}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedInvoice(null)
                            setInvoiceResults([])
                            setReturnQtyDraft({})
                            setStagedItems([])
                          }}
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                        >
                          Change Invoice
                        </button>
                      </div>

                      <table className="w-full text-left text-xs">
                        <thead className="text-[10px] uppercase text-slate-500 font-bold">
                          <tr>
                            <th className="py-1">Item</th>
                            <th className="py-1">Sold Qty</th>
                            <th className="py-1">Unit Price</th>
                            <th className="py-1 w-24">Return Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {(selectedInvoice.items || []).map((item: any) => {
                            const unitPrice = item.quantity > 0 ? Number(item.line_total) / item.quantity : 0
                            return (
                              <tr key={item.id}>
                                <td className="py-1.5 font-semibold text-slate-900">
                                  {item.product_name_snapshot}
                                  <span className="block text-[10px] font-mono text-slate-400">{item.sku_snapshot}</span>
                                </td>
                                <td className="py-1.5">{item.quantity}</td>
                                <td className="py-1.5">₹{unitPrice.toFixed(2)}</td>
                                <td className="py-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.quantity}
                                    value={returnQtyDraft[item.variant_id] ?? ''}
                                    onChange={(e) => handleReturnQtyChange(item, e.target.value)}
                                    className="w-16 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* PURCHASE tab: free product/qty/price entry (unchanged) */
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 space-y-3">
                <span className="block text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
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
                      className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)] focus:outline-none"
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
            )}

            {stagedItems.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800">Return Items Summary ({stagedItems.length})</span>
                <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-surface)]/80 border-b border-[var(--color-border)] text-[var(--color-primary-strong)] uppercase font-bold text-[10px] tracking-wider">
                      <tr>
                        <th className="p-2.5">Variant</th>
                        <th className="p-2.5">SKU</th>
                        <th className="p-2.5">Qty</th>
                        <th className="p-2.5">Unit Price</th>
                        <th className="p-2.5">Subtotal</th>
                        <th className="p-2.5 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {stagedItems.map((item) => (
                        <tr key={item.variant_id} className="hover:bg-[var(--color-surface)]/30">
                          <td className="p-2.5 font-semibold text-slate-900">{item.variant_label}</td>
                          <td className="p-2.5 text-slate-500 font-mono">{item.sku}</td>
                          <td className="p-2.5 font-bold text-slate-800">{item.qty}</td>
                          <td className="p-2.5">₹{item.unit_price.toFixed(2)}</td>
                          <td className="p-2.5 font-bold text-[var(--color-primary)]">₹{(item.qty * item.unit_price).toFixed(2)}</td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.variant_id)}
                              className="text-rose-500 hover:text-rose-700 font-bold"
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
