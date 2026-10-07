import { useEffect, useState } from 'react'
import { Card, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string | null) {
  return path ? `${API_ORIGIN}/${path}` : null
}

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
  primary_image?: string | null
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
      <PageHeader title="Dashboard" description="Store performance at a glance" />

      {loading ? (
        <Spinner />
      ) : !summary ? (
        <p className="text-sm text-slate-500">Could not load dashboard data from backend server.</p>
      ) : (
        <>
          {/* Connected Pastel Capsule KPI Metrics Track */}
          <div className="relative overflow-x-auto py-2">
            <div className="flex items-center gap-3 min-w-[980px] px-1">
              {/* 1. Today's Sales */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Today's Sales</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{formatCurrency(summary.sales.today_sales)}</div>
              </div>

              {/* 2. This Month */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">This Month</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{formatCurrency(summary.sales.this_month_sales)}</div>
              </div>

              {/* 3. Total Sales */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Total Sales</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{formatCurrency(summary.sales.total_sales)}</div>
              </div>

              {/* 4. Total Orders */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Total Orders</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{summary.orders.total_orders}</div>
                <span className="text-[10px] font-medium text-indigo-400">{summary.orders.pending_orders} pending</span>
              </div>

              {/* 5. Total Customers */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Total Customers</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{summary.customers.total_customers}</div>
                <span className="text-[10px] font-medium text-indigo-400">+{summary.customers.new_customers_today} today</span>
              </div>

              {/* 6. Total Products */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Total Products</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{summary.products.total_products}</div>
              </div>

              {/* 7. Low Stock */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Low Stock</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{summary.products.low_stock_products}</div>
              </div>

              {/* 8. Out of Stock */}
              <div className="relative flex-1 rounded-full border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-purple-50/90 px-4 py-3 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Out of Stock</span>
                <div className="text-base font-extrabold text-indigo-950 mt-0.5">{summary.products.out_of_stock_products}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            {/* Left Column: Popular Items Cards Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Popular Items
                  </h2>
                  <p className="text-xs text-slate-500">Top selling items calculated from live invoice history</p>
                </div>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                  Live Sales Feed
                </span>
              </div>

              {popularItems.length === 0 ? (
                <Card className="p-8 text-center text-sm text-slate-500">
                  No popular items recorded yet.
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {popularItems.map((item, idx) => {
                    const badgeText = idx === 0 ? 'BESTSELLER' : idx === 1 ? 'TRENDING' : 'POPULAR'
                    const badgeColor =
                      idx === 0
                        ? 'bg-amber-500 text-white'
                        : idx === 1
                        ? 'bg-indigo-600 text-white'
                        : 'bg-emerald-600 text-white'

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                      >
                        {/* Image background / Thumbnail container */}
                        <div className="relative mb-3 flex h-44 items-center justify-center overflow-hidden rounded-xl bg-white p-2 border border-slate-100 shadow-2xs">
                          {imageUrl(item.primary_image || null) ? (
                            <img
                              src={imageUrl(item.primary_image || null)!}
                              alt={item.name}
                              className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-400">
                              <span className="text-xs font-semibold">No Image</span>
                            </div>
                          )}
                          <span className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold shadow-xs ${badgeColor}`}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Product Info & Sales Summary Footer */}
                        <div>
                          <h3 className="text-base font-bold text-slate-900 truncate">{item.name}</h3>
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500">
                              {item.units_sold} units sold
                            </span>
                            <span className="text-base font-extrabold text-slate-900">
                              {formatCurrency(item.revenue)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Authentic Torn Thermal Receipt Timeline Widget */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Receipt Timeline</h2>
                  <p className="text-xs text-slate-500">Recent completed transactions</p>
                </div>
              </div>

              {/* Realistic Perforated Receipt Container */}
              <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-lg bg-[#FAF8F5] p-5 shadow-lg border border-amber-200/60 font-serif text-slate-800">
                {/* Receipt Header */}
                <div className="text-center pb-3 border-b border-dashed border-slate-300">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-500">Receipt Timeline Feed</div>
                  <div className="text-sm font-extrabold text-slate-900 mt-0.5">UNIFIED POS BILLS</div>
                </div>

                {/* Receipt Timeline Entries */}
                <div className="py-4 space-y-4 font-sans text-xs">
                  {latestSales.slice(0, 5).map((sale) => (
                    <div key={sale.id} className="relative pl-6 border-l-2 border-dashed border-indigo-300">
                      {/* Node Circle Indicator */}
                      <span className="absolute -left-[7px] top-0.5 h-3 w-3 rounded-full bg-indigo-600 ring-4 ring-[#FAF8F5]" />

                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-mono font-bold text-slate-900">{sale.invoice_no}</div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-extrabold text-slate-900">{formatCurrency(sale.grand_total)}</div>
                          <span className="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                            {sale.payment_status} ✓
                          </span>
                        </div>
                      </div>

                      {sale.items_summary && (
                        <div className="mt-1 text-[11px] text-slate-600 truncate font-mono">
                          {sale.items_summary}
                        </div>
                      )}
                    </div>
                  ))}

                  {latestSales.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-400 italic">No sale receipts available yet.</p>
                  )}
                </div>

                {/* Receipt Bottom Total Summary */}
                <div className="pt-3 border-t border-dashed border-slate-300 font-sans">
                  <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                    <span>Recent Sales Total:</span>
                    <span>{formatCurrency(totalReceiptsSum)}</span>
                  </div>
                  <div className="mt-3 text-center text-[11px] text-slate-400 font-serif italic">
                    Thank you for your business!
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
