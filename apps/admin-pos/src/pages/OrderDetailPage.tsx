import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Spinner } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
import { ROUTES } from '../routes/routes'

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
  payment_method?: string
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
  delivery_type: 'OWN_DELIVERY' | 'INDIA_POST' | null
  delivery_distance_km: string | null
  delivery_days: number | null
  delivery_tracking_id: string | null
  delivery_tracking_courier: string | null
  delivery_tracking_status: string | null
  delivery_whatsapp_sent_at: string | null
  recipient_phone?: string
  whatsapp_web_url?: string | null
  whatsapp_click_to_chat_url?: string | null
  items: OrderItem[]
  status_history: StatusHistoryRow[]
}

const ALL_ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'OUT_OF_STOCK',
  'CANCELLED',
]

export function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [error, setError] = useState('')
  const [nextStatus, setNextStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [deliveryId, setDeliveryId] = useState<number | null>(null)
  const [deliveryChecked, setDeliveryChecked] = useState(false)
  const [creatingDelivery, setCreatingDelivery] = useState(false)
  const [trackingId, setTrackingId] = useState('')
  const [courierName, setCourierName] = useState('India Post')
  const [trackingStatus, setTrackingStatus] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [whatsappWebUrl, setWhatsappWebUrl] = useState<string | null>(null)
  const [clickToChatUrl, setClickToChatUrl] = useState<string | null>(null)
  const [savingTracking, setSavingTracking] = useState(false)
  const [trackingError, setTrackingError] = useState('')

  const load = useCallback(() => {
    api.get(`/orders/${id}`).then((res) => {
      const ord = res.data.order
      setOrder(ord)
      setTrackingId(ord.delivery_tracking_id || '')
      setCourierName(ord.delivery_tracking_courier || 'India Post')
      setTrackingStatus(ord.delivery_tracking_status || '')
      setRecipientPhone(ord.recipient_phone || ord.shipping_phone || ord.customer_phone || '')
      setWhatsappWebUrl(ord.whatsapp_web_url || null)
      setClickToChatUrl(ord.whatsapp_click_to_chat_url || null)
    })
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
      navigate(ROUTES.DELIVERY_DETAIL(res.data.delivery.id))
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create delivery'))
    } finally {
      setCreatingDelivery(false)
    }
  }

  async function saveAndSendWhatsAppWeb() {
    if (!trackingId.trim()) {
      setTrackingError('Tracking ID is required')
      return
    }
    if (!recipientPhone.trim()) {
      setTrackingError('Customer mobile number is required')
      return
    }
    setSavingTracking(true)
    setTrackingError('')

    // Open blank tab immediately during user click event to bypass popup blockers
    const win = window.open('about:blank', '_blank')

    try {
      const res = await api.patch(`/orders/${id}/delivery-tracking`, {
        tracking_id: trackingId.trim(),
        courier_name: courierName.trim() || 'India Post',
        status: trackingStatus.trim() || undefined,
        phone: recipientPhone.trim(),
      })
      setOrder(res.data.order)
      setWhatsappWebUrl(res.data.whatsapp_web_url)
      setClickToChatUrl(res.data.whatsapp_click_to_chat_url)

      const targetUrl = res.data.whatsapp_web_url || res.data.whatsapp_click_to_chat_url
      if (win && targetUrl) {
        win.location.href = targetUrl
      }

      await api.post(`/orders/${id}/delivery-tracking/mark-whatsapp-sent`, {
        phone: recipientPhone.trim(),
      })
      load()
    } catch (err) {
      if (win) win.close()
      setTrackingError(apiErrorMessage(err, 'Could not save tracking details'))
    } finally {
      setSavingTracking(false)
    }
  }

  async function saveTrackingOnly() {
    if (!trackingId.trim()) {
      setTrackingError('Tracking ID is required')
      return
    }
    setSavingTracking(true)
    setTrackingError('')
    try {
      const res = await api.patch(`/orders/${id}/delivery-tracking`, {
        tracking_id: trackingId.trim(),
        courier_name: courierName.trim() || 'India Post',
        status: trackingStatus.trim() || undefined,
        phone: recipientPhone.trim() || undefined,
      })
      setOrder(res.data.order)
      setWhatsappWebUrl(res.data.whatsapp_web_url)
      setClickToChatUrl(res.data.whatsapp_click_to_chat_url)
      load()
    } catch (err) {
      setTrackingError(apiErrorMessage(err, 'Could not save tracking details'))
    } finally {
      setSavingTracking(false)
    }
  }

  async function markSentManually() {
    try {
      await api.post(`/orders/${id}/delivery-tracking/mark-whatsapp-sent`, {
        phone: recipientPhone.trim() || undefined,
      })
      load()
    } catch {
      // ignore
    }
  }

  async function updateStatus() {
    if (!nextStatus) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/orders/${id}/status`, { status: nextStatus, note: statusNote || undefined })
      setNextStatus('')
      setStatusNote('')
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

  const canModify = !['DELIVERED', 'REFUNDED'].includes(order.status)

  return (
    <div>
      <button onClick={() => navigate(ROUTES.ORDERS)} className="mb-2 text-xs font-medium text-slate-400 hover:text-slate-700">
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
          <Badge tone="slate">{order.payment_method || 'COD'}</Badge>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6 border border-[var(--color-border-muted)]">
            <h2 className="mb-4 text-base font-bold text-slate-950">Items</h2>
            <table className="w-full text-left text-sm">
              <thead className="border-b-2 border-[var(--color-extra-003)] uppercase text-[var(--color-extra-001)] bg-[var(--color-extra-005)] text-xs font-black tracking-wider">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-extra-004)]">
                {order.items.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--color-surface)]/80 transition-colors">
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

          {order.delivery_type === 'INDIA_POST' && (
            <Card className="space-y-3.5 p-5">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>India Post Tracking</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      WhatsApp Notify
                    </span>
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {order.delivery_distance_km ? `${order.delivery_distance_km} km from shop` : 'Beyond local radius'} ·{' '}
                  {order.delivery_days ? `up to ${order.delivery_days} days` : '2-3 days'}
                </p>
              </div>

              {trackingError && <Alert>{trackingError}</Alert>}

              {order.delivery_whatsapp_sent_at && (
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>WhatsApp Sent: <strong>{new Date(order.delivery_whatsapp_sent_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</strong></span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Success</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-slate-700">Customer Mobile (WhatsApp)</label>
                    <span className="text-[11px] text-slate-400">Recipient Number</span>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. 9384256321"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Tracking details will be sent directly to this WhatsApp number</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tracking ID</label>
                  <input
                    type="text"
                    placeholder="e.g. EE123456789IN"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value.toUpperCase())}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Courier Name</label>
                    <input
                      type="text"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Status Note</label>
                    <input
                      type="text"
                      placeholder="e.g. dispatched to post office"
                      value={trackingStatus}
                      onChange={(e) => setTrackingStatus(e.target.value)}
                      className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </div>
                </div>

                {/* Primary Button: Save & Open WhatsApp Web */}
                <button
                  type="button"
                  onClick={saveAndSendWhatsAppWeb}
                  disabled={savingTracking}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-xs shadow-sm transition disabled:opacity-60 cursor-pointer"
                >
                  <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.82 2.41h-.01c-1.42 0-2.82-.37-4.05-1.07l-.29-.17-3.11.82.83-3.03-.19-.31c-.77-1.26-1.18-2.72-1.18-4.22 0-4.54 3.7-8.24 8.25-8.24zm4.52 11.64c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.26-1.49-1.4-1.74-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.32-.02-.45-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.29 3.78.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.3z"/>
                  </svg>
                  <span>
                    {savingTracking
                      ? 'Saving & Opening…'
                      : order.delivery_whatsapp_sent_at
                        ? 'Resend via WhatsApp Web'
                        : 'Save & Send via WhatsApp Web'}
                  </span>
                </button>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={saveTrackingOnly}
                    disabled={savingTracking}
                    className="flex-1 text-xs"
                  >
                    Save Tracking Only
                  </Button>

                  {(whatsappWebUrl || order.whatsapp_web_url) && (
                    <a
                      href={whatsappWebUrl || order.whatsapp_web_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={markSentManually}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition"
                      title="Open chat in WhatsApp Web directly"
                    >
                      Web Chat ↗
                    </a>
                  )}

                  {(clickToChatUrl || order.whatsapp_click_to_chat_url) && (
                    <a
                      href={clickToChatUrl || order.whatsapp_click_to_chat_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      onClick={markSentManually}
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium transition"
                      title="Open in WhatsApp Mobile / App (wa.me)"
                    >
                      wa.me ↗
                    </a>
                  )}
                </div>

                {/* Message preview */}
                {trackingId && (
                  <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] text-slate-600">
                    <p className="font-semibold text-slate-700 mb-1 flex items-center justify-between">
                      <span>Message Preview:</span>
                      <span className="text-[10px] font-normal text-slate-400">to {recipientPhone || 'customer'}</span>
                    </p>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700 whitespace-pre-line font-sans leading-relaxed text-[11px]">
                      {`Hi ${order.shipping_name || order.customer_name || 'Customer'}! 👋\n\nYour order #${order.order_no} from Shop with Adam has been dispatched via ${courierName || 'India Post'}.\n\n📦 Tracking ID: ${trackingId}\n${trackingStatus ? `📝 Status: ${trackingStatus}\n` : ''}\n🌐 Track your parcel: https://www.indiapost.gov.in/\n\nThank you for shopping with us! 🙏`}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {deliveryChecked && (
            <Card className="space-y-2 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Delivery</h2>
              {deliveryId ? (
                <Button size="sm" variant="secondary" onClick={() => navigate(ROUTES.DELIVERY_DETAIL(deliveryId))}>
                  View Delivery
                </Button>
              ) : !['CANCELLED', 'RETURNED', 'REFUNDED'].includes(order.status) ? (
                <Button size="sm" onClick={createDelivery} disabled={creatingDelivery}>
                  {creatingDelivery ? 'Creating…' : 'Create Delivery'}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">Delivery cannot be created for {order.status.toLowerCase()} order.</p>
              )}
            </Card>
          )}

          {canModify && (
            <Card className="space-y-4 p-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Update Order Status</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Change fulfillment stage to Packed, Shipped, Delivered, Out of Stock, etc.
                </p>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">New Status</label>
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
                  >
                    <option value="">Select status…</option>
                    {ALL_ORDER_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Dispatched via Express Courier / Batch A"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    className="w-full text-xs py-2 px-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <Button size="sm" onClick={updateStatus} disabled={busy || !nextStatus} className="w-full">
                  {busy ? 'Updating…' : 'Update Status'}
                </Button>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <Button size="sm" variant="danger" onClick={cancelOrder} disabled={busy} className="w-full">
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
