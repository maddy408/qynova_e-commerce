import { useEffect, useState } from 'react'
import { Badge, Card, PageHeader, Select, Spinner } from '../components/ui'
import { api } from '../lib/api'

function money(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

interface SalesChartPoint {
  period: string
  sales_amount: string
  order_count: number
}

interface ProductAnalytics {
  top_selling_products: { id: number; name: string; units_sold: string; revenue: string }[]
  top_selling_categories: { id: number; name: string; units_sold: string; revenue: string }[]
  low_stock_products: { variant_id: number; sku: string; product_name: string; available: string; low_stock_threshold: string }[]
  out_of_stock_products: { variant_id: number; sku: string; product_name: string }[]
  gross_profit_estimate: { revenue_ex_tax: string; estimated_cogs: string; estimated_gross_profit: string; note: string }
}

interface CustomerAnalytics {
  new_customers_by_day: { date: string; count: number }[]
  one_time_customers: number
  returning_customers: number
  top_customers: { id: number; name: string; phone: string | null; invoice_count: number; total_spent: string }[]
  referral_customer_count: number
}

interface RecentActivity {
  recent_sales: { id: number; invoice_no: string; channel: string; grand_total: string; payment_status: string; created_at: string }[]
  recent_orders: { id: number; order_no: string; customer_name: string; status: string; grand_total: string; created_at: string }[]
}

interface ReferralReport {
  totals: { total_referrals: number; successful_referrals: number; pending_referrals: number }
  referral_discount_given: string | number
  top_referrers: { id: number; name: string; referral_count: number }[]
}

interface RefundSummary {
  total_refunds: number
  total_refund_amount: string
  pending_refund_amount: string
  pending_count: number
  completed_refund_amount: string
  completed_count: number
  failed_count: number
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 text-sm font-semibold text-slate-900">{children}</h2>
}

export function ReportsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [chart, setChart] = useState<SalesChartPoint[] | null>(null)
  const [products, setProducts] = useState<ProductAnalytics | null>(null)
  const [customers, setCustomers] = useState<CustomerAnalytics | null>(null)
  const [activity, setActivity] = useState<RecentActivity | null>(null)
  const [referrals, setReferrals] = useState<ReferralReport | null>(null)
  const [refunds, setRefunds] = useState<RefundSummary | null>(null)

  useEffect(() => {
    api.get('/dashboard/sales-chart', { params: { period } }).then((res) => setChart(res.data.chart))
  }, [period])

  useEffect(() => {
    api.get('/dashboard/product-analytics').then((res) => setProducts(res.data))
    api.get('/dashboard/customer-analytics').then((res) => setCustomers(res.data))
    api.get('/dashboard/recent-activity').then((res) => setActivity(res.data))
    api.get('/reports/referrals').then((res) => setReferrals(res.data))
    api.get('/reports/refunds').then((res) => setRefunds(res.data.summary))
  }, [])

  const maxSales = chart && chart.length > 0 ? Math.max(...chart.map((c) => Number(c.sales_amount))) : 0

  return (
    <div className="space-y-8">
      <PageHeader title="Reports" description="Sales, products, customers, referrals and refunds in one place." />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Sales</SectionTitle>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')} className="w-36">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>
        <Card className="p-5">
          {chart === null ? (
            <Spinner />
          ) : chart.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No sales in this period yet.</p>
          ) : (
            <div className="flex h-40 items-end gap-2">
              {chart.map((point) => (
                <div key={point.period} className="flex flex-1 flex-col items-center gap-1" title={`${point.period}: ${money(point.sales_amount)} (${point.order_count} orders)`}>
                  <div
                    className="w-full rounded-t bg-indigo-500"
                    style={{ height: maxSales > 0 ? `${Math.max(4, (Number(point.sales_amount) / maxSales) * 120)}px` : '4px' }}
                  />
                  <span className="truncate text-[10px] text-slate-400">{point.period}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Top Selling Products</SectionTitle>
          <Card>
            {products === null ? (
              <Spinner />
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {products.top_selling_products.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-slate-900">{p.name}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{p.units_sold} units</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{money(p.revenue)}</td>
                    </tr>
                  ))}
                  {products.top_selling_products.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-slate-500">No sales yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Top Selling Categories</SectionTitle>
          <Card>
            {products === null ? (
              <Spinner />
            ) : (
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {products.top_selling_categories.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-slate-900">{c.name}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{c.units_sold} units</td>
                      <td className="px-4 py-2 text-right font-medium text-slate-700">{money(c.revenue)}</td>
                    </tr>
                  ))}
                  {products.top_selling_categories.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-slate-500">No sales yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {products && (
        <div>
          <SectionTitle>Estimated Gross Profit</SectionTitle>
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Revenue (ex. tax)</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{money(products.gross_profit_estimate.revenue_ex_tax)}</p>
              </div>
              <div>
                <p className="text-slate-500">Estimated COGS</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{money(products.gross_profit_estimate.estimated_cogs)}</p>
              </div>
              <div>
                <p className="text-slate-500">Estimated Gross Profit</p>
                <p className="mt-1 text-lg font-semibold text-emerald-600">{money(products.gross_profit_estimate.estimated_gross_profit)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">{products.gross_profit_estimate.note}</p>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Customers</SectionTitle>
          <Card className="p-5">
            {customers === null ? (
              <Spinner />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">One-time</p>
                    <p className="text-lg font-semibold text-slate-900">{customers.one_time_customers}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Returning</p>
                    <p className="text-lg font-semibold text-slate-900">{customers.returning_customers}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Via Referral</p>
                    <p className="text-lg font-semibold text-slate-900">{customers.referral_customer_count}</p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-slate-500">Top Customers</p>
                  <ul className="divide-y divide-slate-100">
                    {customers.top_customers.map((c) => (
                      <li key={c.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-700">{c.name}</span>
                        <span className="font-medium text-slate-900">{money(c.total_spent)}</span>
                      </li>
                    ))}
                    {customers.top_customers.length === 0 && <li className="py-3 text-center text-sm text-slate-500">No customers with invoices yet.</li>}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Referrals</SectionTitle>
          <Card className="p-5">
            {referrals === null ? (
              <Spinner />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Total</p>
                    <p className="text-lg font-semibold text-slate-900">{referrals.totals.total_referrals}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Successful</p>
                    <p className="text-lg font-semibold text-emerald-600">{referrals.totals.successful_referrals}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Pending</p>
                    <p className="text-lg font-semibold text-amber-600">{referrals.totals.pending_referrals}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  Discount given via referrals: <span className="font-medium text-slate-900">{money(referrals.referral_discount_given)}</span>
                </p>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase text-slate-500">Top Referrers</p>
                  <ul className="divide-y divide-slate-100">
                    {referrals.top_referrers.map((r) => (
                      <li key={r.id} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-slate-700">{r.name}</span>
                        <span className="font-medium text-slate-900">{r.referral_count}</span>
                      </li>
                    ))}
                    {referrals.top_referrers.length === 0 && <li className="py-3 text-center text-sm text-slate-500">No referrals yet.</li>}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      <div>
        <SectionTitle>Refunds</SectionTitle>
        <Card className="p-5">
          {refunds === null ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-slate-500">Total Refunded</p>
                <p className="text-lg font-semibold text-slate-900">{money(refunds.total_refund_amount)}</p>
                <p className="text-xs text-slate-400">{refunds.total_refunds} total</p>
              </div>
              <div>
                <p className="text-slate-500">Pending</p>
                <p className="text-lg font-semibold text-amber-600">{money(refunds.pending_refund_amount)}</p>
                <p className="text-xs text-slate-400">{refunds.pending_count} refund(s)</p>
              </div>
              <div>
                <p className="text-slate-500">Completed</p>
                <p className="text-lg font-semibold text-emerald-600">{money(refunds.completed_refund_amount)}</p>
                <p className="text-xs text-slate-400">{refunds.completed_count} refund(s)</p>
              </div>
              <div>
                <p className="text-slate-500">Failed</p>
                <p className="text-lg font-semibold text-red-600">{refunds.failed_count}</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>Recent Activity</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <p className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase text-slate-500">POS / E-commerce Sales</p>
            <ul className="divide-y divide-slate-100">
              {activity?.recent_sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <p className="text-slate-900">{s.invoice_no}</p>
                    <p className="text-xs text-slate-400">{s.channel}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{money(s.grand_total)}</p>
                    <Badge tone={s.payment_status === 'PAID' ? 'green' : 'amber'}>{s.payment_status}</Badge>
                  </div>
                </li>
              ))}
              {activity && activity.recent_sales.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No sales yet.</li>}
              {!activity && (
                <li className="px-4 py-6">
                  <Spinner />
                </li>
              )}
            </ul>
          </Card>

          <Card>
            <p className="border-b border-slate-100 px-4 py-2 text-xs font-medium uppercase text-slate-500">Orders</p>
            <ul className="divide-y divide-slate-100">
              {activity?.recent_orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <p className="text-slate-900">{o.order_no}</p>
                    <p className="text-xs text-slate-400">{o.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{money(o.grand_total)}</p>
                    <Badge>{o.status}</Badge>
                  </div>
                </li>
              ))}
              {activity && activity.recent_orders.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No orders yet.</li>}
              {!activity && (
                <li className="px-4 py-6">
                  <Spinner />
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
