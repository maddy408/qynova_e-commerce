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
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[#E8CCD1] uppercase text-[#4A1821] bg-[#F8EAED] text-xs font-black tracking-wider">
              <tr>
                <th className="px-6 py-4">Order</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0E0E3]">
              {orders.map((o) => (
                <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="cursor-pointer hover:bg-[#FAF2F4]/80 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-950">{o.order_no}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{o.customer_name}</td>
                  <td className="px-6 py-4">
                    <Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{o.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge tone={o.payment_status === 'PAID' ? 'green' : o.payment_status === 'FAILED' ? 'red' : 'amber'}>
                      {o.payment_status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 font-extrabold text-slate-950">₹{o.grand_total}</td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-700">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs font-semibold text-slate-500">
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
