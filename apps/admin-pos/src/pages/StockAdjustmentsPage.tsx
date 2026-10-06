import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Alert, Button, Card, Modal, PageHeader, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface AdjustmentItem {
  variant_id: number
  sku: string
  product_name: string
  system_qty: string
  counted_qty: string
  difference_qty: string
}

interface Adjustment {
  id: number
  adjustment_no: string
  reason: string
  created_by_name: string
  created_at: string
  items: AdjustmentItem[]
}

interface LineItem {
  variant_id: number
  product_name: string
  sku: string
  current_on_hand: string
  counted_qty: string
}

export function StockAdjustmentsPage() {
  const [adjustments, setAdjustments] = useState<Adjustment[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [reason, setReason] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [scanError, setScanError] = useState('')
  const [items, setItems] = useState<LineItem[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    api.get('/inventory/adjustments').then((res) => setAdjustments(res.data.adjustments))
  }

  useEffect(load, [])

  async function addByCode(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || scanCode.trim() === '') return
    e.preventDefault()
    setScanError('')
    try {
      const res = await api.get('/variants/lookup', { params: { code: scanCode.trim() } })
      const v = res.data.variant
      setItems((prev) => {
        if (prev.find((i) => i.variant_id === v.id)) return prev
        return [...prev, { variant_id: v.id, product_name: v.product_name, sku: v.sku, current_on_hand: v.on_hand ?? '0', counted_qty: v.on_hand ?? '0' }]
      })
      setScanCode('')
    } catch (err) {
      setScanError(apiErrorMessage(err, 'Variant not found'))
    }
  }

  function updateCounted(variantId: number, value: string) {
    setItems((prev) => prev.map((i) => (i.variant_id === variantId ? { ...i, counted_qty: value } : i)))
  }

  function removeItem(variantId: number) {
    setItems((prev) => prev.filter((i) => i.variant_id !== variantId))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (reason.trim() === '' || items.length === 0) {
      setError('Reason and at least one item are required')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/inventory/adjustments', {
        reason,
        items: items.map((i) => ({ variant_id: i.variant_id, counted_qty: i.counted_qty })),
      })
      setShowForm(false)
      setItems([])
      setReason('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create adjustment'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock Adjustments"
        description="A physical count correction. The variant's product_id is resolved server-side — only counted_qty matters here."
        actions={<Button onClick={() => setShowForm(true)}>+ New Adjustment</Button>}
      />

      {adjustments === null ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {adjustments.map((adj) => (
            <Card key={adj.id} className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{adj.adjustment_no}</p>
                  <p className="text-xs text-slate-500">
                    {adj.reason} · {adj.created_by_name} · {new Date(adj.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1 font-medium">Product</th>
                    <th className="py-1 font-medium">System Qty</th>
                    <th className="py-1 font-medium">Counted Qty</th>
                    <th className="py-1 font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {adj.items.map((item) => (
                    <tr key={item.variant_id}>
                      <td className="py-1 text-slate-700">
                        {item.product_name} <span className="text-xs text-slate-400">({item.sku})</span>
                      </td>
                      <td className="py-1 text-slate-600">{item.system_qty}</td>
                      <td className="py-1 text-slate-600">{item.counted_qty}</td>
                      <td className={`py-1 font-medium ${Number(item.difference_qty) < 0 ? 'text-red-600' : Number(item.difference_qty) > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {Number(item.difference_qty) > 0 ? '+' : ''}
                        {item.difference_qty}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
          {adjustments.length === 0 && (
            <Card className="p-8 text-center text-sm text-slate-500">No stock adjustments yet.</Card>
          )}
        </div>
      )}

      {showForm && (
        <Modal title="New Stock Adjustment" onClose={() => setShowForm(false)} width="lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly stock count" />
            <div>
              <TextField
                label="Scan or type SKU / Barcode, then press Enter"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={addByCode}
              />
              {scanError && <p className="mt-1 text-xs text-red-600">{scanError}</p>}
            </div>

            {items.length > 0 && (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 font-medium">Product</th>
                    <th className="py-2 font-medium">System Qty</th>
                    <th className="py-2 font-medium">Counted Qty</th>
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
                      <td className="py-2 text-slate-600">{item.current_on_hand}</td>
                      <td className="py-2">
                        <input
                          value={item.counted_qty}
                          onChange={(e) => updateCounted(item.variant_id, e.target.value)}
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
                {submitting ? 'Saving…' : 'Save Adjustment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
