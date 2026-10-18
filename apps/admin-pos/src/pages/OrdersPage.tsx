import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Card, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api, apiErrorMessage } from '../lib/api'
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
  OUT_OF_STOCK: 'red',
  PENDING: 'amber',
  CONFIRMED: 'amber',
  PROCESSING: 'amber',
  PACKED: 'amber',
  SHIPPED: 'amber',
  OUT_FOR_DELIVERY: 'amber',
}

const ALL_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'OUT_OF_STOCK',
  'CANCELLED',
]

export function OrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderListItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  function loadOrders() {
    api
      .get('/orders', { params: { status: status || undefined, search: search || undefined, page, limit: PAGE_SIZE } })
      .then((res) => {
        setOrders(res.data.orders)
        setTotal(res.data.total ?? res.data.orders.length)
      })
      .catch((err) => {
        setError(apiErrorMessage(err, 'Failed to load orders'))
      })
  }

  useEffect(() => {
    loadOrders()
  }, [status, search, page])

  function handleStatusFilterChange(value: string) {
    setStatus(value)
    setPage(1)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  async function handleQuickStatusUpdate(orderId: number, orderNo: string, newStatus: string) {
    if (!newStatus) return
    setUpdatingId(orderId)
    setError('')
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus })
      setMsg(`Order ${orderNo} status updated to ${newStatus.replace(/_/g, ' ')}!`)
      setTimeout(() => setMsg(''), 3500)
      loadOrders()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to update order status'))
    } finally {
      setUpdatingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <PageHeader
        title="Orders & Tracking"
        description="E-commerce orders with live status management (Packed, Shipped, Out of Stock, Cancelled) and tracking."
        actions={
          <div className="flex items-center gap-3">
            <TextField
              placeholder="Search order # or customer…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-56 text-xs"
            />
            <Select value={status} onChange={(e) => handleStatusFilterChange(e.target.value)} className="w-48 text-xs">
              <option value="">All statuses</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {msg && <div className="mb-4"><Alert tone="green">{msg}</Alert></div>}
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}

      {orders === null ? (
        <Spinner />
      ) : (
        <Card className="rounded-3xl border border-[var(--color-border-muted)] overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--color-border-muted)] uppercase text-[var(--color-primary-strong)] bg-[var(--color-surface)]/80 text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Order #</th>
                <th className="px-5 py-3.5">Customer</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Payment</th>
                <th className="px-5 py-3.5">Total</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5 text-right">Quick Status Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-muted)]">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-[var(--color-surface)]/40 transition-colors">
                  <td
                    onClick={() => navigate(ROUTES.ORDER_DETAIL(o.id))}
                    className="px-5 py-3.5 font-mono font-bold text-[var(--color-primary)] cursor-pointer hover:underline"
                  >
                    {o.order_no}
                  </td>
                  <td className="px-5 py-3.5 font-medium text-slate-800">{o.customer_name}</td>
                  <td className="px-5 py-3.5">
                    <Badge tone={STATUS_TONE[o.status] ?? 'slate'}>{o.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={o.payment_status === 'PAID' ? 'green' : o.payment_status === 'FAILED' ? 'red' : 'amber'}>
                      {o.payment_status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 font-serif font-bold text-slate-900">₹{o.grand_total}</td>
                  <td className="px-5 py-3.5 text-slate-500 text-xs">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <select
                        disabled={updatingId === o.id}
                        value={o.status}
                        onChange={(e) => handleQuickStatusUpdate(o.id, o.order_no, e.target.value)}
                        className="text-xs py-1 px-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 hover:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer disabled:opacity-50"
                      >
                        {ALL_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => navigate(ROUTES.ORDER_DETAIL(o.id))}
                        className="text-[11px] font-bold text-[var(--color-primary)] hover:underline px-2 py-1"
                      >
                        Details →
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-xs font-semibold text-slate-500">
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
                  className="px-3 py-1 rounded-full border border-[var(--color-border)] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[var(--color-surface)] transition-colors text-xs cursor-pointer"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 rounded-full border border-[var(--color-border)] bg-white text-slate-700 font-medium disabled:opacity-40 hover:bg-[var(--color-surface)] transition-colors text-xs cursor-pointer"
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
