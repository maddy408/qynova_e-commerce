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
        <div className="flex items-center gap-2.5">
          <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] px-2.5 py-0.5 text-[10px] font-bold text-[#7B3F4A] uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7B3F4A] animate-pulse" />
            Live Store Overview
          </span>
        </div>
        <p className="text-xs sm:text-sm text-[#804652] mt-1 font-medium">Store performance and daily metrics at a glance</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner className="w-8 h-8 text-[#7B3F4A]" />
        </div>
      ) : !summary ? (
        <Card className="p-8 text-center text-sm text-[#804652]">
          Could not load dashboard data from backend server.
        </Card>
      ) : (
        <>
          {/* Top KPI Cards Grid - 8 Cohesive Luxury Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
            {/* 1. Today's Sales */}
            <div className="relative rounded-2xl border border-[#EEDDE0] bg-gradient-to-b from-[#FAF2F4] via-white to-white p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-[#804652] uppercase tracking-wider block">Today's Sales</span>
              <div className="font-serif text-lg sm:text-xl font-black text-[#7B3F4A] mt-1.5">{formatCurrency(summary.sales.today_sales)}</div>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 mt-1 block">Live Daily Total</span>
            </div>

            {/* 2. This Month */}
            <div className="relative rounded-2xl border border-[#EEDDE0] bg-gradient-to-b from-[#FAF2F4] via-white to-white p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-[#804652] uppercase tracking-wider block">This Month</span>
              <div className="font-serif text-lg sm:text-xl font-black text-[#7B3F4A] mt-1.5">{formatCurrency(summary.sales.this_month_sales)}</div>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 mt-1 block">Current Month</span>
            </div>

            {/* 3. Total Sales */}
            <div className="relative rounded-2xl border border-[#EEDDE0] bg-gradient-to-b from-[#FAF2F4] via-white to-white p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-[#804652] uppercase tracking-wider block">Total Sales</span>
              <div className="font-serif text-lg sm:text-xl font-black text-[#7B3F4A] mt-1.5">{formatCurrency(summary.sales.total_sales)}</div>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 mt-1 block">All-time Gross</span>
            </div>

            {/* 4. Total Orders */}
            <div className="relative rounded-2xl border border-[#F2E5E7] bg-white p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#7B3F4A]/30 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Total Orders</span>
              <div className="font-serif text-lg sm:text-xl font-black text-slate-900 mt-1.5">{summary.orders.total_orders}</div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-[#804652] mt-1 block">{summary.orders.pending_orders} pending</span>
            </div>

            {/* 5. Total Customers */}
            <div className="relative rounded-2xl border border-[#F2E5E7] bg-white p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#7B3F4A]/30 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Customers</span>
              <div className="font-serif text-lg sm:text-xl font-black text-slate-900 mt-1.5">{summary.customers.total_customers}</div>
              <span className="text-[9px] sm:text-[10px] font-semibold text-[#804652] mt-1 block">+{summary.customers.new_customers_today} today</span>
            </div>

            {/* 6. Total Products */}
            <div className="relative rounded-2xl border border-[#F2E5E7] bg-white p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-[#7B3F4A]/30 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Products</span>
              <div className="font-serif text-lg sm:text-xl font-black text-slate-900 mt-1.5">{summary.products.total_products}</div>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 mt-1 block">Active In Catalog</span>
            </div>

            {/* 7. Low Stock */}
            <div className={`relative rounded-2xl border p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between ${
              Number(summary.products.low_stock_products) > 0
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-[#F2E5E7] bg-white'
            }`}>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Low Stock</span>
              <div className={`font-serif text-lg sm:text-xl font-black mt-1.5 ${
                Number(summary.products.low_stock_products) > 0 ? 'text-amber-800' : 'text-slate-900'
              }`}>
                {summary.products.low_stock_products}
              </div>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 mt-1 block">Near threshold</span>
            </div>

            {/* 8. Out of Stock */}
            <div className={`relative rounded-2xl border p-3.5 sm:p-4 text-center shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md flex flex-col justify-between ${
              Number(summary.products.out_of_stock_products) > 0
                ? 'border-rose-200 bg-rose-50/40'
                : 'border-[#F2E5E7] bg-white'
            }`}>
              <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Out of Stock</span>
              <div className={`font-serif text-lg sm:text-xl font-black mt-1.5 ${
                Number(summary.products.out_of_stock_products) > 0 ? 'text-rose-800' : 'text-slate-900'
              }`}>
                {summary.products.out_of_stock_products}
              </div>
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500 mt-1 block">Zero inventory</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
            {/* Left Column: Popular Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-slate-900 tracking-tight">Popular Items</h2>
                  <p className="text-xs text-[#804652] font-medium">Top selling items ranked by unit volume</p>
                </div>

                {/* View Mode Toggle Icons with Wine Theme */}
                <div className="flex items-center space-x-1 rounded-full border border-[#EEDDE0] bg-[#FAF2F4] p-1">
                  <button
                    onClick={() => toggleViewMode('grid')}
                    className={`flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[#7B3F4A] text-white shadow-2xs font-bold'
                        : 'text-[#804652] hover:text-[#7B3F4A] hover:bg-[#F2E5E7] font-semibold'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGridIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => toggleViewMode('list')}
                    className={`flex items-center space-x-1.5 rounded-full px-3 py-1 text-xs transition-all ${
                      viewMode === 'list'
                        ? 'bg-[#7B3F4A] text-white shadow-2xs font-bold'
                        : 'text-[#804652] hover:text-[#7B3F4A] hover:bg-[#F2E5E7] font-semibold'
                    }`}
                    title="List View"
                  >
                    <ListIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                </div>
              </div>

              {popularItems.length === 0 ? (
                <Card className="rounded-3xl border border-[#F2E5E7] bg-white p-12 text-center shadow-2xs flex flex-col items-center justify-center space-y-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FAF2F4] border border-[#EEDDE0] text-[#7B3F4A] text-xl mb-1 shadow-2xs">
                    🛍️
                  </div>
                  <h3 className="font-serif text-base font-bold text-slate-900">No Popular Items Recorded Yet</h3>
                  <p className="text-xs text-[#804652] max-w-sm">
                    As POS and online sales occur, your top-performing catalog items will be automatically ranked here.
                  </p>
                </Card>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {popularItems.map((item, idx) => {
                    const badgeText = idx === 0 ? 'BESTSELLER' : idx === 1 ? 'TRENDING' : 'POPULAR'
                    const badgeClass =
                      idx === 0
                        ? 'bg-[#FAF2F4] text-[#7B3F4A] border border-[#EEDDE0]'
                        : idx === 1
                        ? 'bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0]'
                        : 'bg-slate-50 text-slate-700 border border-slate-200'

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between rounded-2xl bg-white p-5 shadow-2xs border border-[#F2E5E7] transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[#7B3F4A]/40"
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-mono font-bold text-[#804652]">#{idx + 1}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        <div className="mt-3 my-2">
                          <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight line-clamp-2">{item.name}</h3>
                        </div>

                        <div className="pt-3 border-t border-[#F2E5E7] flex items-center justify-between text-xs font-medium">
                          <span className="text-[#804652] font-semibold">{item.units_sold} sold</span>
                          <span className="font-serif font-extrabold text-[#7B3F4A] text-sm">{formatCurrency(item.revenue)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* List View - Text Only Table */
                <Card className="overflow-hidden p-0 border border-[#F2E5E7] rounded-2xl shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-[#F2E5E7] text-left text-xs">
                      <thead className="bg-[#FAF2F4]/80 font-bold uppercase text-[10px] tracking-wider text-[#804652] border-b border-[#EEDDE0]">
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
                            <td className="px-4 py-3 text-center font-mono font-bold text-[#804652]">#{idx + 1}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 text-right font-medium text-slate-700">{item.units_sold}</td>
                            <td className="px-4 py-3 text-right font-serif font-bold text-[#7B3F4A]">{formatCurrency(item.revenue)}</td>
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
                <div>
                  <h2 className="font-serif text-2xl font-bold text-slate-900 tracking-tight">Receipt Timeline</h2>
                  <p className="text-xs text-[#804652] font-medium">Recent POS transactions</p>
                </div>
              </div>

              <div className="receipt-paper mx-auto w-full rounded-2xl p-6 text-slate-800 font-sans shadow-md my-2 border border-[#EEDDE0] bg-[#FAF5F6]">
                <div className="space-y-4 text-xs">
                  {latestSales.slice(0, 5).map((sale) => (
                    <div key={sale.id} className="relative pl-5 border-l-2 border-[#EEDDE0] space-y-1">
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#7B3F4A] ring-2 ring-[#FAF5F6]" />

                      <div className="flex items-center justify-between font-medium">
                        <span className="font-mono font-bold text-[#7B3F4A]">
                          {sale.invoice_no}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(sale.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}, {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
                        </span>
                      </div>
                      {sale.items_summary && (
                        <div className="text-[11px] text-slate-600 truncate">
                          {sale.items_summary}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-0.5 text-[11px]">
                        <span className="font-serif font-extrabold text-slate-900">{formatCurrency(sale.grand_total)}</span>
                        <span className="text-[9px] font-bold text-[#7B3F4A] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EEDDE0]">
                          {sale.payment_status} ✓
                        </span>
                      </div>
                    </div>
                  ))}

                  {latestSales.length === 0 && (
                    <div className="py-8 text-center text-xs text-[#804652] italic space-y-1">
                      <p className="font-serif text-sm font-semibold text-slate-700 not-italic">No receipts available yet</p>
                      <p className="text-[11px]">Completed sales will generate live transaction receipts here.</p>
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-3.5 border-t border-dashed border-[#EEDDE0]">
                  <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                    <span className="font-serif text-[#804652]">Total:</span>
                    <span className="font-serif text-lg font-black text-[#7B3F4A]">{formatCurrency(totalReceiptsSum)}</span>
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

