import { useEffect, useState } from 'react'
import { Spinner } from '../components/ui'
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
<<<<<<< HEAD
=======
      {/* Dashboard Title Header */}
>>>>>>> 075ae4a (feat(ui): align dashboard, navbar, marketing and settings screens with luxury wine and rose-cream theme)
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-sans">Store performance at a glance</p>
      </div>

      {loading ? (
        <Spinner />
      ) : !summary ? (
        <p className="text-sm text-slate-500">Could not load dashboard data from backend server.</p>
      ) : (
        <>
<<<<<<< HEAD
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
=======
          {/* Capsule KPI Metrics Track (Rose & Cream Luxury Theme - Identical Uniform Dimensions) */}
          <div className="relative overflow-x-auto py-2 scrollbar-none">
            <div className="flex items-center gap-3 min-w-[1040px] px-1">
              {/* 1. Today's Sales */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Today's Sales</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{formatCurrency(summary.sales.today_sales)}</div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Today</span>
              </div>

              {/* 2. This Month */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">This Month</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{formatCurrency(summary.sales.this_month_sales)}</div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">Month</span>
              </div>

              {/* 3. Total Sales */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Total Sales</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{formatCurrency(summary.sales.total_sales)}</div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">All Time</span>
              </div>

              {/* 4. Total Orders */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Total Orders</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{summary.orders.total_orders}</div>
                <span className="text-[9px] font-bold text-[#804652] uppercase tracking-wider leading-none">{summary.orders.pending_orders} pending</span>
              </div>

              {/* 5. Total Customers */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Total Customers</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{summary.customers.total_customers}</div>
                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider leading-none">+{summary.customers.new_customers_today} today</span>
              </div>

              {/* 6. Total Products */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Total Products</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{summary.products.total_products}</div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">In Catalog</span>
              </div>

              {/* 7. Low Stock */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Low Stock</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{summary.products.low_stock_products}</div>
                <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider leading-none">Need Restock</span>
              </div>

              {/* 8. Out of Stock */}
              <div className="group relative flex-1 min-w-[125px] h-[84px] rounded-full bg-white border border-[#EEDDE0] hover:border-[#7B3F4A] px-3 py-2 flex flex-col justify-center items-center text-center shadow-2xs hover:shadow-md hover:scale-[1.02] transition-all duration-300">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#804652] whitespace-nowrap block leading-tight">Out of Stock</span>
                <div className="text-lg font-serif font-black text-slate-900 leading-tight my-0.5 tracking-tight">{summary.products.out_of_stock_products}</div>
                <span className="text-[9px] font-bold text-rose-700 uppercase tracking-wider leading-none">Zero Units</span>
>>>>>>> 075ae4a (feat(ui): align dashboard, navbar, marketing and settings screens with luxury wine and rose-cream theme)
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            {/* Left Column: Popular Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-bold text-slate-900">Popular Items</h2>

                {/* View Mode Toggle Icons */}
                <div className="flex items-center space-x-1 rounded-full border border-[#EEDDE0] bg-[#FAF2F4] p-1">
                  <button
                    onClick={() => toggleViewMode('grid')}
                    className={`flex items-center space-x-1 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      viewMode === 'grid'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGridIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => toggleViewMode('list')}
                    className={`flex items-center space-x-1 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      viewMode === 'list'
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    title="List View"
                  >
                    <ListIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>
              </div>

              {popularItems.length === 0 ? (
                <div className="rounded-3xl bg-white p-12 text-center text-sm text-slate-500 border border-[#F2E5E7] shadow-2xs">
                  No popular items recorded yet.
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {popularItems.map((item, idx) => {
                    const badgeText = idx === 0 ? 'BESTSELLER' : idx === 1 ? 'TRENDING' : 'POPULAR'
                    const badgeClass =
                      idx === 0
                        ? 'bg-[#FAF2F4] text-[#7B3F4A] border border-[#EEDDE0]'
                        : idx === 1
                        ? 'bg-[#F2E5E7] text-[#804652] border border-[#EEDDE0]'
                        : 'bg-rose-50 text-rose-900 border border-rose-200'

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-3xl bg-slate-900 shadow-md border border-[#F2E5E7] transition-all hover:-translate-y-1 hover:shadow-xl h-56"
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
                        <div className="relative z-10 p-3.5 flex justify-end">
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-xs ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Bottom Gradient Overlay & Product Summary */}
                        <div className="relative z-10 p-4 bg-gradient-to-t from-black/95 via-black/75 to-transparent pt-10">
                          <h3 className="text-base font-bold text-white truncate font-sans tracking-tight">{item.name}</h3>
                          <div className="mt-0.5 text-xs text-rose-200/90 font-medium">
                            {item.units_sold} {Number(item.units_sold) === 1 ? 'unit' : 'units'} • {formatCurrency(item.revenue)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* List View - Table with Theme Header */
                <Card className="overflow-hidden p-0 border border-[#F2E5E7] shadow-2xs rounded-3xl">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-[#F2E5E7] text-left text-xs">
                      <thead className="bg-[#FAF2F4]/80 font-bold uppercase text-[10px] tracking-wider text-[#804652] border-b border-[#F2E5E7]">
                        <tr>
                          <th className="px-4 py-3 text-center">Rank</th>
                          <th className="px-4 py-3">Item Name</th>
                          <th className="px-4 py-3 text-right">Qty Sold</th>
                          <th className="px-4 py-3 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F2E5E7] bg-white">
                        {popularItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-[#FAF2F4]/40 transition-colors">
                            <td className="px-4 py-3 text-center font-bold text-[#804652]">#{idx + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{item.units_sold}</td>
                            <td className="px-4 py-3 text-right font-bold text-[#7B3F4A]">{formatCurrency(item.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>

            {/* Right Column: Authentic Paper Receipt Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl font-bold text-slate-900">Receipt Timeline</h2>
                <span className="text-xs font-bold text-[#804652] uppercase tracking-wider">Recent transactions</span>
              </div>

              <div className="receipt-paper mx-auto w-full rounded-sm p-6 text-slate-800 font-sans shadow-xl my-3">
                <div className="space-y-4 text-xs">
                  {latestSales.slice(0, 5).map((sale) => (
                    <div key={sale.id} className="relative pl-5 border-l-2 border-[#EEDDE0] space-y-0.5">
                      {/* Status Dot */}
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#7B3F4A] ring-2 ring-[#FAF5F6]" />

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
                        <span className="font-bold text-[#7B3F4A] font-serif text-sm">{formatCurrency(sale.grand_total)}</span>
                        <span className="text-[9px] font-bold text-[#7B3F4A] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EEDDE0]">
                          {sale.payment_status} ✓
                        </span>
                      </div>
                    </div>
                  ))}

                  {latestSales.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-400 italic">No sale receipts available yet.</p>
                  )}
                </div>

                {/* Receipt Footer Total */}
                <div className="mt-5 pt-3 border-t border-dashed border-[#EEDDE0]">
                  <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                    <span className="text-[#804652] uppercase tracking-wider text-xs">Total:</span>
                    <span className="text-base font-serif font-bold text-[#7B3F4A]">{formatCurrency(totalReceiptsSum)}</span>
                  </div>
                  <div className="mt-3 text-center text-[11px] font-serif italic text-[#804652]">
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

