import { useEffect, useState } from 'react'
import { Card, Spinner } from '../components/ui'
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
      {/* Dashboard Title Header (Matching Reference Image 2) */}
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
          {/* Pastel Capsule KPI Metrics Track (Matching Reference Image 2) */}
          <div className="relative overflow-x-auto py-1">
            <div className="flex items-center gap-3 min-w-[980px] px-1">
              {/* 1. Today's Sales */}
              <div className="relative flex-1 rounded-full border border-indigo-200/90 bg-gradient-to-r from-indigo-100/80 via-purple-50/70 to-indigo-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Today's Sales</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{formatCurrency(summary.sales.today_sales)}</div>
              </div>

              {/* 2. This Month */}
              <div className="relative flex-1 rounded-full border border-blue-200/90 bg-gradient-to-r from-blue-100/80 via-cyan-50/70 to-blue-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">This Month</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{formatCurrency(summary.sales.this_month_sales)}</div>
              </div>

              {/* 3. Total Sales */}
              <div className="relative flex-1 rounded-full border border-amber-200/90 bg-gradient-to-r from-amber-100/80 via-yellow-50/70 to-amber-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Total Sales</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{formatCurrency(summary.sales.total_sales)}</div>
              </div>

              {/* 4. Total Orders */}
              <div className="relative flex-1 rounded-full border border-pink-200/90 bg-gradient-to-r from-pink-100/80 via-rose-50/70 to-purple-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Total Orders</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{summary.orders.total_orders}</div>
                <span className="text-[9px] font-medium text-slate-500 block leading-none">{summary.orders.pending_orders} pending</span>
              </div>

              {/* 5. Total Customers */}
              <div className="relative flex-1 rounded-full border border-teal-200/90 bg-gradient-to-r from-teal-100/80 via-emerald-50/70 to-teal-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Total Customers</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{summary.customers.total_customers}</div>
                <span className="text-[9px] font-medium text-slate-500 block leading-none">+{summary.customers.new_customers_today} today</span>
              </div>

              {/* 6. Total Products */}
              <div className="relative flex-1 rounded-full border border-emerald-200/90 bg-gradient-to-r from-emerald-100/80 via-green-50/70 to-emerald-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Total Products</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{summary.products.total_products}</div>
              </div>

              {/* 7. Low Stock */}
              <div className="relative flex-1 rounded-full border border-amber-300/90 bg-gradient-to-r from-amber-100/80 via-orange-50/70 to-amber-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Low Stock</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{summary.products.low_stock_products}</div>
              </div>

              {/* 8. Out of Stock */}
              <div className="relative flex-1 rounded-full border border-blue-200/90 bg-gradient-to-r from-blue-100/80 via-indigo-50/70 to-blue-100/80 px-4 py-2.5 text-center shadow-xs transition-all hover:scale-105 hover:shadow-md">
                <span className="text-[10px] font-bold text-slate-800 tracking-tight">Out of Stock</span>
                <div className="text-sm font-extrabold text-slate-950 mt-0.5">{summary.products.out_of_stock_products}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            {/* Left Column: Popular Items Grid (Matching Reference Image 2) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold text-slate-900">Popular Items</h2>
              </div>

              {popularItems.length === 0 ? (
                <Card className="p-8 text-center text-sm text-slate-500">
                  No popular items recorded yet.
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {popularItems.map((item, idx) => {
                    const badgeText = idx === 0 ? 'BESTSELLER' : idx === 1 ? 'TRENDING' : 'LOW STOCK'
                    const badgeClass =
                      idx === 0
                        ? 'bg-[#f3e6d2] text-amber-950 border border-amber-200/80'
                        : idx === 1
                        ? 'bg-indigo-100 text-indigo-900 border border-indigo-200/80'
                        : 'bg-amber-100 text-amber-900 border border-amber-200/80'

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-slate-900 shadow-md border border-slate-800/80 transition-all hover:-translate-y-1 hover:shadow-xl h-56"
                      >
                        {/* Full Image Container */}
                        <div className="absolute inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
                          {imageUrl(item.primary_image || null) ? (
                            <img
                              src={imageUrl(item.primary_image || null)!}
                              alt={item.name}
                              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-90"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center text-slate-500">
                              <span className="text-xs font-semibold">No Image</span>
                            </div>
                          )}
                        </div>

                        {/* Top Badge */}
                        <div className="relative z-10 p-3 flex justify-end">
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide shadow-xs ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Bottom Gradient Overlay & Product Summary */}
                        <div className="relative z-10 p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-10">
                          <h3 className="text-base font-bold text-white truncate font-sans tracking-tight">{item.name}</h3>
                          <div className="mt-0.5 text-xs text-slate-300 font-medium">
                            {item.units_sold} {Number(item.units_sold) === 1 ? 'unit' : 'units'} • {formatCurrency(item.revenue)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Authentic Paper Receipt Timeline (Matching Reference Image 2) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-semibold text-slate-900">Receipt Timeline</h2>
                <span className="text-xs text-slate-500 font-sans">Recent transactions</span>
              </div>

              {/* Serrated Edge Authentic Receipt Slip */}
              <div className="receipt-paper mx-auto w-full rounded-sm p-6 text-slate-800 font-sans shadow-xl my-3">
                <div className="space-y-4 text-xs">
                  {latestSales.slice(0, 5).map((sale, idx) => {
                    const dotColor = idx === 0 ? 'bg-emerald-500' : idx === 1 ? 'bg-indigo-500' : 'bg-purple-500'
                    return (
                      <div key={sale.id} className="relative pl-5 border-l-2 border-slate-200/80 space-y-0.5">
                        {/* Status Dot */}
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

                {/* Receipt Footer Total */}
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
