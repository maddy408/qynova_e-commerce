import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, PageHeader, Select, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface OrderListItem {
  id: number
  order_no: string
  customer_name: string
  status: string
  payment_status: string
  grand_total: string
  created_at: string
}

const STATUS_TONE: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  DELIVERED: 'green',
  CANCELLED: 'red',
  PENDING: 'amber',
  CONFIRMED: 'amber',
  PROCESSING: 'amber',
  PACKED: 'amber',
  SHIPPED: 'amber',
  OUT_FOR_DELIVERY: 'amber',
}

export function OrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderListItem[] | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    api.get('/orders', { params: status ? { status } : {} }).then((res) => setOrders(res.data.orders))
  }, [status])

  return (
    <div>
      <PageHeader
        title="Orders"
        description="E-commerce orders. POS sales are invoices, not orders — see Invoices."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
            <option value="">All statuses</option>
            {['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        }
      />

      {orders === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Order</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Payment</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{o.order_no}</td>
                  <td className="px-5 py-3 text-slate-600">{o.customer_name}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{o.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={o.payment_status === 'PAID' ? 'green' : o.payment_status === 'FAILED' ? 'red' : 'amber'}>
                      {o.payment_status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-600">₹{o.grand_total}</td>
                  <td className="px-5 py-3 text-slate-500">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    No orders found.
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
