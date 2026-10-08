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
  const [deliveryId, setDeliveryId] = useState<number | null>(null)
  const [deliveryChecked, setDeliveryChecked] = useState(false)
  const [creatingDelivery, setCreatingDelivery] = useState(false)

  const load = useCallback(() => {
    api.get(`/orders/${id}`).then((res) => setOrder(res.data.order))
    api
      .get(`/orders/${id}/delivery`)
      .then((res) => setDeliveryId(res.data.delivery.id))
      .catch(() => setDeliveryId(null))
      .finally(() => setDeliveryChecked(true))
  }, [id])

  useEffect(load, [load])

  async function createDelivery() {
    setCreatingDelivery(true)
    setError('')
    try {
      const res = await api.post(`/orders/${id}/delivery`, {})
      navigate(`/deliveries/${res.data.delivery.id}`)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create delivery'))
    } finally {
      setCreatingDelivery(false)
    }
  }

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
          <Card className="p-6 border border-[#F2E5E7]">
            <h2 className="mb-4 text-base font-bold text-slate-950">Items</h2>
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0E0E3]">
                {order.items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF2F4]/80 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-slate-950">{item.product_name_snapshot}</p>
                      <p className="text-xs font-semibold text-slate-600">
                        {item.variant_label_snapshot} · <span className="font-mono">{item.sku_snapshot}</span>
                      </p>
                    </td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">{item.quantity}</td>
                    <td className="px-4 py-3.5 font-bold text-slate-900">₹{item.unit_price}</td>
                    <td className="px-4 py-3.5 font-black text-slate-950">₹{item.line_total}</td>
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

          {deliveryChecked && (
            <Card className="space-y-2 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Delivery</h2>
              {deliveryId ? (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/deliveries/${deliveryId}`)}>
                  View Delivery
                </Button>
              ) : order.payment_status === 'PAID' ? (
                <Button size="sm" onClick={createDelivery} disabled={creatingDelivery}>
                  {creatingDelivery ? 'Creating…' : 'Create Delivery'}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">A delivery can be created once this order is paid.</p>
              )}
            </Card>
          )}

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
