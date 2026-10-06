import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Card, PageHeader, Select, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface Invoice {
  id: number
  invoice_no: string
  channel: 'POS' | 'ECOMMERCE'
  customer_name: string | null
  cashier_name: string | null
  grand_total: string
  payment_status: 'PAID' | 'PARTIAL' | 'UNPAID'
  status: 'ACTIVE' | 'CANCELLED'
  created_at: string
}

const PAYMENT_TONE: Record<string, 'green' | 'amber' | 'red'> = { PAID: 'green', PARTIAL: 'amber', UNPAID: 'red' }

export function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [channel, setChannel] = useState('')

  useEffect(() => {
    api.get('/invoices', { params: { channel: channel || undefined } }).then((res) => setInvoices(res.data.invoices))
  }, [channel])

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="POS sales and e-commerce order invoices."
        actions={
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-40">
            <option value="">All Channels</option>
            <option value="POS">POS</option>
            <option value="ECOMMERCE">E-commerce</option>
          </Select>
        }
      />

      {invoices === null ? (
        <Spinner />
      ) : (
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Invoice No</th>
                <th className="px-5 py-3 font-medium">Channel</th>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Cashier</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">Payment</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((inv) => (
                <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{inv.invoice_no}</td>
                  <td className="px-5 py-3 text-slate-600">{inv.channel}</td>
                  <td className="px-5 py-3 text-slate-600">{inv.customer_name ?? 'Walk-in'}</td>
                  <td className="px-5 py-3 text-slate-600">{inv.cashier_name ?? '—'}</td>
                  <td className="px-5 py-3 font-medium text-slate-900">₹{inv.grand_total}</td>
                  <td className="px-5 py-3">
                    <Badge tone={PAYMENT_TONE[inv.payment_status]}>{inv.payment_status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={inv.status === 'ACTIVE' ? 'green' : 'red'}>{inv.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{new Date(inv.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                    No invoices yet.
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
