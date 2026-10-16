import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { ROUTES } from '../routes/routes'
import { api } from '../lib/api'

const PAGE_SIZE = 20

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
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api
      .get('/deliveries', { params: { status: status || undefined, search: search || undefined, page, limit: PAGE_SIZE } })
      .then((res) => {
        setDeliveries(res.data.deliveries)
        setTotal(res.data.total ?? res.data.deliveries.length)
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
        title="Deliveries"
        description="Order fulfillment — assign a courier and track status through to delivered."
        actions={
          <div className="flex items-center gap-3">
            <TextField
              placeholder="Search order #, customer, AWB…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-56 text-xs"
            />
            <Select value={status} onChange={(e) => handleStatusChange(e.target.value)} className="w-44">
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {deliveries === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-xs">
            <thead className="border-b-2 border-[var(--color-extra-003)] uppercase text-[var(--color-extra-001)] bg-[var(--color-extra-005)] text-xs font-black tracking-wider">
              <tr>
                <th className="px-6 py-4">Order No</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Courier</th>
                <th className="px-6 py-4">AWB</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Expected</th>
                <th className="px-6 py-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-extra-004)]">
              {deliveries.map((d) => (
                <tr key={d.id} onClick={() => navigate(ROUTES.DELIVERY_DETAIL(d.id))} className="cursor-pointer hover:bg-[var(--color-surface)]/80 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-950">{d.order_no}</td>
                  <td className="px-6 py-4 font-semibold text-slate-800">
                    {d.customer_name} <span className="text-xs text-slate-600 font-medium">({d.customer_phone})</span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-800">{d.courier ?? '—'}</td>
                  <td className="px-6 py-4 font-mono text-xs font-bold text-[var(--color-primary-strong)]">{d.awb ?? '—'}</td>
                  <td className="px-6 py-4">
                    <Badge tone={STATUS_TONE[d.status] ?? 'slate'}>{d.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-700">{d.expected_delivery_date ?? '—'}</td>
                  <td className="px-6 py-4 text-xs font-semibold text-slate-700">{new Date(d.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {deliveries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-xs font-semibold text-slate-500">
                    No deliveries yet — create one from a paid order's detail page.
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
