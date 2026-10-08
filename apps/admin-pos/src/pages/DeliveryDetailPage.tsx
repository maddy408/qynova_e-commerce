import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Badge, Button, Card, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'

interface StatusHistoryRow {
  id: number
  from_status: string | null
  to_status: string
  source: string
  note: string | null
  created_at: string
}

interface DeliveryDetail {
  id: number
  order_id: number
  order_no: string
  customer_name: string
  customer_phone: string
  shipping_line1: string
  shipping_line2: string | null
  shipping_city_district: string
  shipping_state: string
  shipping_pincode: string
  provider: string
  courier: string | null
  awb: string | null
  tracking_url: string | null
  status: string
  expected_delivery_date: string | null
  delivery_notes: string | null
  history: StatusHistoryRow[]
}

const STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED']

export function DeliveryDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [delivery, setDelivery] = useState<DeliveryDetail | null>(null)
  const [nextStatus, setNextStatus] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(`/deliveries/${id}`).then((res) => setDelivery(res.data.delivery))
  }, [id])

  useEffect(load, [load])

  async function updateStatus() {
    if (!nextStatus) return
    setBusy(true)
    setError('')
    try {
      await api.patch(`/deliveries/${id}/status`, { status: nextStatus, note: note || null })
      setNextStatus('')
      setNote('')
      load()
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update delivery status'))
    } finally {
      setBusy(false)
    }
  }

  if (delivery === null) return <Spinner />

  const canModify = delivery.status !== 'DELIVERED'

  return (
    <div>
      <button onClick={() => navigate('/deliveries')} className="mb-2 text-xs font-medium text-slate-400 hover:text-slate-700">
        ← Deliveries
      </button>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Delivery for {delivery.order_no}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {delivery.customer_name} · {delivery.customer_phone}
          </p>
        </div>
        <Badge tone={delivery.status === 'DELIVERED' ? 'green' : delivery.status === 'FAILED' || delivery.status === 'RETURNED' ? 'red' : 'amber'}>
          {delivery.status.replace(/_/g, ' ')}
        </Badge>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="space-y-2 p-5 text-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Shipping Address</h2>
            <p className="text-slate-600">
              {delivery.shipping_line1}
              {delivery.shipping_line2 ? `, ${delivery.shipping_line2}` : ''}
            </p>
            <p className="text-slate-600">
              {delivery.shipping_city_district}, {delivery.shipping_state} {delivery.shipping_pincode}
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Status History</h2>
            <ul className="space-y-2">
              {delivery.history.map((h) => (
                <li key={h.id} className="flex items-start justify-between border-b border-slate-100 pb-2 text-sm last:border-0">
                  <div>
                    <p className="font-medium text-slate-900">
                      {h.from_status ? `${h.from_status.replace(/_/g, ' ')} → ` : ''}
                      {h.to_status.replace(/_/g, ' ')}
                    </p>
                    {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
                </li>
              ))}
              {delivery.history.length === 0 && <li className="text-sm text-slate-500">No status changes yet.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-1 p-5 text-sm">
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Shipment Info</h2>
            <p className="text-slate-600">Provider: {delivery.provider}</p>
            <p className="text-slate-600">Courier: {delivery.courier ?? '—'}</p>
            <p className="text-slate-600">AWB: {delivery.awb ?? '—'}</p>
            {delivery.tracking_url && (
              <a href={delivery.tracking_url} target="_blank" rel="noreferrer" className="text-[#7B3F4A] hover:underline font-semibold">
                Tracking Link
              </a>
            )}
            <p className="text-slate-600">Expected: {delivery.expected_delivery_date ?? '—'}</p>
          </Card>

          {canModify && (
            <Card className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Update Status</h2>
              <Select label="New status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                <option value="">Select status…</option>
                {STATUSES.filter((s) => s !== delivery.status).map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
              <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Handed to courier" />
              <Button size="sm" onClick={updateStatus} disabled={busy || !nextStatus}>
                {busy ? 'Updating…' : 'Update Status'}
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
