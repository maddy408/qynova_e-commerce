import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Select, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface OrderItem {
  id: number
  product_name_snapshot: string
  variant_label_snapshot: string | null
  sku_snapshot: string
  quantity: number
  unit_price: string
  line_total: string
}

interface StatusHistoryRow {
  id: number
  from_status: string | null
  to_status: string
  source: string
  note: string | null
  created_at: string
}

interface OrderDetail {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  status: string
  payment_status: string
  subtotal: string
  coupon_discount_total: string
  referral_discount_total: string
  tax_total: string
  shipping_total: string
  grand_total: string
  shipping_name: string
  shipping_phone: string
  shipping_line1: string
  shipping_line2: string | null
  shipping_city_district: string
  shipping_state: string
  shipping_pincode: string
  items: OrderItem[]
  status_history: StatusHistoryRow[]
}

const FORWARD_STATUSES = ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']

export function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [nextStatus, setNextStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(`/orders/${id}`).then((res) => setOrder(res.data.order))
  }, [id])

  useEffect(load, [load])

  async function updateStatus() {
    if (!nextStatus) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/orders/${id}/status`, { status: nextStatus })
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update status'))
    } finally {
      setBusy(false)
    }
  }

  async function cancelOrder() {
    const reason = window.prompt('Cancellation reason?')
    if (!reason) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/orders/${id}/cancel`, { reason })
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not cancel order'))
    } finally {
      setBusy(false)
    }
  }

  if (order === null) {
    return <Spinner />
  }

  const canModify = !['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(order.status)

  return (
    <div>
      <button onClick={() => navigate('/orders')} className="mb-2 text-xs font-medium text-slate-400 hover:text-slate-700">
        ← Orders
      </button>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{order.order_no}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {order.customer_name} · {order.customer_phone}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={order.status === 'DELIVERED' ? 'green' : order.status === 'CANCELLED' ? 'red' : 'amber'}>
            {order.status.replace(/_/g, ' ')}
          </Badge>
          <Badge tone={order.payment_status === 'PAID' ? 'green' : 'slate'}>{order.payment_status}</Badge>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Items</h2>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Qty</th>
                  <th className="pb-2 font-medium">Price</th>
                  <th className="pb-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2">
                      <p className="font-medium text-slate-900">{item.product_name_snapshot}</p>
                      <p className="text-xs text-slate-500">
                        {item.variant_label_snapshot} · {item.sku_snapshot}
                      </p>
                    </td>
                    <td className="py-2 text-slate-600">{item.quantity}</td>
                    <td className="py-2 text-slate-600">₹{item.unit_price}</td>
                    <td className="py-2 text-slate-600">₹{item.line_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Status History</h2>
            <ol className="space-y-2">
              {order.status_history.map((h) => (
                <li key={h.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">
                    {h.from_status ?? '—'} → <span className="font-medium">{h.to_status.replace(/_/g, ' ')}</span>
                    <span className="ml-2 text-xs text-slate-400">({h.source})</span>
                  </span>
                  <span className="text-xs text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Totals</h2>
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>₹{order.subtotal}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Coupon discount</span>
              <span>-₹{order.coupon_discount_total}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Referral discount</span>
              <span>-₹{order.referral_discount_total}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Tax</span>
              <span>₹{order.tax_total}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Shipping</span>
              <span>₹{order.shipping_total}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
              <span>Grand Total</span>
              <span>₹{order.grand_total}</span>
            </div>
          </Card>

          <Card className="space-y-1 p-5 text-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Shipping Address</h2>
            <p className="text-slate-600">{order.shipping_name}</p>
            <p className="text-slate-600">{order.shipping_phone}</p>
            <p className="text-slate-600">
              {order.shipping_line1}
              {order.shipping_line2 ? `, ${order.shipping_line2}` : ''}
            </p>
            <p className="text-slate-600">
              {order.shipping_city_district}, {order.shipping_state} {order.shipping_pincode}
            </p>
          </Card>

          {canModify && (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
              <Select label="Update status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                <option value="">Select status…</option>
                {FORWARD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
              <Button size="sm" onClick={updateStatus} disabled={busy || !nextStatus}>
                Update Status
              </Button>
              <div className="border-t border-slate-200 pt-3">
                <Button size="sm" variant="danger" onClick={cancelOrder} disabled={busy}>
                  Cancel Order
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
