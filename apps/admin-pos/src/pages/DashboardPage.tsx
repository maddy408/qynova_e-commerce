import { useEffect, useState } from 'react'
import { Card, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface DashboardSummary {
  sales: { total_sales: string; today_sales: string; this_month_sales: string }
  orders: { total_orders: number; pending_orders: string; cancelled_orders: string }
  customers: { total_customers: number; new_customers_today: string }
  products: { total_products: number; low_stock_products: number; out_of_stock_products: number }
}

interface PopularProduct {
  id: number
  name: string
  units_sold: string
  revenue: string
}

interface SaleItem {
  id: number
  invoice_no: string
  channel: string
  grand_total: string
  payment_status: string
  created_at: string
}

function formatCurrency(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  )
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [popularItems, setPopularItems] = useState<PopularProduct[]>([])
  const [latestSales, setLatestSales] = useState<SaleItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/summary'),
      api.get('/dashboard/product-analytics'),
      api.get('/dashboard/recent-activity'),
    ])
      .then(([sumRes, prodRes, actRes]) => {
        setSummary(sumRes.data)
        setPopularItems(prodRes.data.top_selling_products || [])
        setLatestSales(actRes.data.recent_sales || [])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="Store performance at a glance" />
      {loading ? (
        <Spinner />
      ) : !summary ? (
        <p className="text-sm text-slate-500">Could not load dashboard data.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Today's Sales" value={formatCurrency(summary.sales.today_sales)} />
            <StatCard label="This Month" value={formatCurrency(summary.sales.this_month_sales)} />
            <StatCard label="Total Sales" value={formatCurrency(summary.sales.total_sales)} />
            <StatCard label="Total Orders" value={String(summary.orders.total_orders)} hint={`${summary.orders.pending_orders} pending`} />
            <StatCard label="Total Customers" value={String(summary.customers.total_customers)} hint={`+${summary.customers.new_customers_today} today`} />
            <StatCard label="Total Products" value={String(summary.products.total_products)} />
            <StatCard label="Low Stock" value={String(summary.products.low_stock_products)} />
            <StatCard label="Out of Stock" value={String(summary.products.out_of_stock_products)} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Popular Items Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">🔥 Popular Items</h2>
                <span className="text-xs font-medium text-slate-400">Top selling by quantity</span>
              </div>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
                      <tr>
                        <th className="px-4 py-3 font-semibold">#</th>
                        <th className="px-4 py-3 font-semibold">Product Name</th>
                        <th className="px-4 py-3 font-semibold text-right">Units Sold</th>
                        <th className="px-4 py-3 font-semibold text-right">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {popularItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2.5 font-semibold text-slate-900">{item.name}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-indigo-600 bg-indigo-50/30 rounded">{item.units_sold} units</td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(item.revenue)}</td>
                        </tr>
                      ))}
                      {popularItems.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                            No popular items recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Latest Sale Items List Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">🧾 Latest Sale Items</h2>
                <span className="text-xs font-medium text-slate-400">Recent transactions</span>
              </div>
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 uppercase text-slate-500 bg-slate-50/70">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Invoice No</th>
                        <th className="px-4 py-3 font-semibold">Channel</th>
                        <th className="px-4 py-3 font-semibold">Date &amp; Time</th>
                        <th className="px-4 py-3 font-semibold text-right">Amount</th>
                        <th className="px-4 py-3 font-semibold text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {latestSales.map((sale) => (
                        <tr key={sale.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-bold text-indigo-700">{sale.invoice_no}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              sale.channel === 'POS' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {sale.channel}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {new Date(sale.created_at).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900">{formatCurrency(sale.grand_total)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              sale.payment_status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {sale.payment_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {latestSales.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                            No recent sales recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
