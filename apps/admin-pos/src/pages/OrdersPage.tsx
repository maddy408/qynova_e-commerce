import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api } from '../lib/api'
import { ROUTES } from '../routes/routes'

const PAGE_SIZE = 20

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
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api
      .get('/orders', { params: { status: status || undefined, search: search || undefined, page, limit: PAGE_SIZE } })
      .then((res) => {
        setOrders(res.data.orders)
        setTotal(res.data.total ?? res.data.orders.length)
      })
  }, [status, search, page])

  function handleStatusChange(value: string) {
    setStatus(value)
    setPage(1)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <PageHeader
        title="Orders"
        description="E-commerce orders. POS sales are invoices, not orders — see Invoices."
        actions={
          <div className="flex items-center gap-3">
            <TextField
              placeholder="Search order # or customer…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-56 text-xs"
            />
            <Select value={status} onChange={(e) => handleStatusChange(e.target.value)} className="w-48">
              <option value="">All statuses</option>
              {['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {orders === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[var(--color-extra-003)] uppercase text-[var(--color-extra-001)] bg-[var(--color-extra-005)] text-xs font-black tracking-wider">
              <tr>
                <th className="px-6 py-4">Order</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Total</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-extra-004)]">
              {orders.map((o) => (
                <tr key={o.id} onClick={() => navigate(ROUTES.ORDER_DETAIL(o.id))} className="cursor-pointer hover:bg-[var(--color-surface)]/80 transition-colors">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[var(--color-border-muted)] px-6 py-4 text-xs">
              <span className="text-slate-600 font-medium">
                Page <span className="font-extrabold text-slate-950">{page}</span> of{' '}
                <span className="font-extrabold text-slate-950">{totalPages}</span> ({total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1 rounded-full border border-[var(--color-border)] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[var(--color-surface)] transition-colors text-xs"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 rounded-full border border-[var(--color-border)] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[var(--color-surface)] transition-colors text-xs"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
