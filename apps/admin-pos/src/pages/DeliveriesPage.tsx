import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, PageHeader, Select, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface Delivery {
  id: number
  order_no: string
  customer_name: string
  customer_phone: string
  courier: string | null
  awb: string | null
  status: string
  expected_delivery_date: string | null
  created_at: string
}

const STATUSES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED']

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  PENDING: 'slate',
  ASSIGNED: 'amber',
  PICKED_UP: 'amber',
  IN_TRANSIT: 'amber',
  OUT_FOR_DELIVERY: 'amber',
  DELIVERED: 'green',
  FAILED: 'red',
  RETURNED: 'red',
}

export function DeliveriesPage() {
  const navigate = useNavigate()
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    api.get('/deliveries', { params: { status: status || undefined } }).then((res) => setDeliveries(res.data.deliveries))
  }, [status])

  return (
    <div>
      <PageHeader
        title="Deliveries"
        description="Order fulfillment — assign a courier and track status through to delivered."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        }
      />

      {deliveries === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Order No</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Courier</th>
                <th className="px-5 py-3 font-medium">AWB</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Expected</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((d) => (
                <tr key={d.id} onClick={() => navigate(`/deliveries/${d.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{d.order_no}</td>
                  <td className="px-5 py-3 text-slate-600">
                    {d.customer_name} <span className="text-xs text-slate-400">({d.customer_phone})</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{d.courier ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">{d.awb ?? '—'}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[d.status] ?? 'slate'}>{d.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{d.expected_delivery_date ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                    No deliveries yet — create one from a paid order's detail page.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
