import { useEffect, useState } from 'react'
import { Card, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { LayoutGridIcon, ListIcon } from '../components/Icons'

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
  customer_name?: string | null
  items_summary?: string | null
  grand_total: string
  payment_status: string
  created_at: string
}

function formatCurrency(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [popularItems, setPopularItems] = useState<PopularProduct[]>([])
  const [latestSales, setLatestSales] = useState<SaleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('dashboard_popular_view') as 'grid' | 'list') || 'grid'
  })

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('dashboard_popular_view', mode)
  }

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

  const totalReceiptsSum = latestSales.reduce((acc, curr) => acc + Number(curr.grand_total || 0), 0)

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-sans">Store performance at a glance</p>
      </div>

      {loading ? (
        <Spinner />
      ) : !summary ? (
        <p className="text-sm text-slate-500">Could not load dashboard data from backend server.</p>
      ) : (
        <>
          <div className="relative overflow-x-auto py-2">
            <div className="flex items-center gap-3 min-w-[980px] px-1">
              <div className="relative flex-1 rounded-md border border-indigo-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Today's Sales</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{formatCurrency(summary.sales.today_sales)}</div>
              </div>

              <div className="relative flex-1 rounded-md border border-blue-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">This Month</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{formatCurrency(summary.sales.this_month_sales)}</div>
              </div>

              <div className="relative flex-1 rounded-md border border-amber-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Total Sales</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{formatCurrency(summary.sales.total_sales)}</div>
              </div>

              <div className="relative flex-1 rounded-md border border-pink-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Total Orders</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{summary.orders.total_orders}</div>
                <span className="text-[10px] font-medium text-slate-500 block leading-none">{summary.orders.pending_orders} pending</span>
              </div>

              <div className="relative flex-1 rounded-md border border-teal-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Total Customers</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{summary.customers.total_customers}</div>
                <span className="text-[10px] font-medium text-slate-500 block leading-none">+{summary.customers.new_customers_today} today</span>
              </div>

              <div className="relative flex-1 rounded-md border border-emerald-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Total Products</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{summary.products.total_products}</div>
              </div>

              <div className="relative flex-1 rounded-md border border-orange-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Low Stock</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{summary.products.low_stock_products}</div>
              </div>

              <div className="relative flex-1 rounded-md border border-indigo-200 bg-white px-4 py-3 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className="text-[11px] font-semibold text-slate-700 tracking-tight">Out of Stock</span>
                <div className="text-base font-extrabold text-slate-950 mt-0.5">{summary.products.out_of_stock_products}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            {/* Left Column: Popular Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold text-slate-900">Popular Items</h2>

                {/* View Mode Toggle Icons */}
                <div className="flex items-center space-x-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
                  <button
                    onClick={() => toggleViewMode('grid')}
                    className={`flex items-center space-x-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGridIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => toggleViewMode('list')}
                    className={`flex items-center space-x-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      viewMode === 'list'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                    title="List View"
                  >
                    <ListIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>
              </div>

              {popularItems.length === 0 ? (
                <Card className="p-8 text-center text-sm text-slate-500">
                  No popular items recorded yet.
                </Card>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {popularItems.map((item, idx) => {
                    const badgeText = idx === 0 ? 'BESTSELLER' : idx === 1 ? 'TRENDING' : 'POPULAR'
                    const badgeClass =
                      idx === 0
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : idx === 1
                        ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                        : 'bg-slate-100 text-slate-700 border border-slate-300'

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between rounded-xl bg-white p-5 shadow-xs border border-slate-200 transition-all hover:-translate-y-1 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        <div className="mt-3 my-2">
                          <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight line-clamp-2">{item.name}</h3>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium">
                          <span>{item.units_sold} sold</span>
                          <span className="font-bold text-slate-900">{formatCurrency(item.revenue)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* List View - Text Only Table */
                <Card className="overflow-hidden p-0 border border-slate-200 shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead className="bg-slate-50 font-semibold text-slate-700">
                        <tr>
                          <th className="px-4 py-3 text-center">Rank</th>
                          <th className="px-4 py-3">Item Name</th>
                          <th className="px-4 py-3 text-right">Qty Sold</th>
                          <th className="px-4 py-3 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {popularItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-center font-bold text-slate-400">#{idx + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{item.units_sold}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900">{formatCurrency(item.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>

            {/* Right Column: Receipt Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold text-slate-900">Receipt Timeline</h2>
                <span className="text-xs text-slate-500 font-sans">Recent transactions</span>
              </div>

              <div className="receipt-paper mx-auto w-full rounded-sm p-6 text-slate-800 font-sans shadow-xl my-3">
                <div className="space-y-4 text-xs">
                  {latestSales.slice(0, 5).map((sale, idx) => {
                    const dotColor = idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-indigo-500' : 'bg-purple-500'
                    return (
                      <div key={sale.id} className="relative pl-5 border-l-2 border-slate-200/80 space-y-0.5">
                        <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${dotColor} ring-2 ring-[#f4efe6]`} />

                        <div className="flex items-center justify-between font-medium">
                          <span className="font-bold text-slate-900">
                            {sale.invoice_no} • {new Date(sale.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
                          </span>
                        </div>
                        {sale.items_summary && (
                          <div className="text-[11px] text-slate-600 truncate">
                            {sale.items_summary}
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-0.5 text-[11px]">
                          <span className="font-extrabold text-slate-900">{formatCurrency(sale.grand_total)}</span>
                          <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.2 rounded border border-emerald-200">
                            {sale.payment_status} ✓
                          </span>
                        </div>
                      </div>
                    )
                  })}

                  {latestSales.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-400 italic">No sale receipts available yet.</p>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-dashed border-slate-300/80">
                  <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                    <span>Total:</span>
                    <span className="text-base">{formatCurrency(totalReceiptsSum)}</span>
                  </div>
                  <div className="mt-3 text-center text-[11px] font-serif italic text-slate-500">
                    Thank you for your purchase
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

