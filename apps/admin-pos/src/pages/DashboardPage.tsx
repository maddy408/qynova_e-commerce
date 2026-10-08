import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* Top Header with Store Pulse */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#F2E5E7]/70">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Dashboard
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] px-3 py-1 text-[11px] font-bold text-[#7B3F4A] tracking-wider uppercase shadow-2xs">
              <span className="h-2 w-2 rounded-full bg-[#7B3F4A] animate-pulse" />
              Live Store Overview
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[#804652] mt-1 font-medium">
            Real-time business performance, billing velocity, and store analytics
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <Spinner className="w-9 h-9 text-[#7B3F4A]" />
        </div>
      ) : !summary ? (
        <Card className="p-10 text-center text-sm text-[#804652]">
          Could not load dashboard data from backend server.
        </Card>
      ) : (
        <>
          {/* Top 8 KPI Cards Grid - Elevated Luxury Cards with Icons & Depth */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 sm:gap-3.5">
            {/* 1. Today's Sales */}
            <div className="group relative rounded-2xl border border-[#EEDDE0] bg-gradient-to-br from-[#FAF2F4] via-white to-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/50 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-[#804652] uppercase tracking-wider">Today's Sales</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FAF2F4] text-xs text-[#7B3F4A] shadow-2xs group-hover:scale-110 transition-transform">
                  💳
                </span>
              </div>
              <div className="my-2">
                <div className="font-serif text-xl xl:text-2xl font-black text-[#7B3F4A] tracking-tight">
                  {formatCurrency(summary.sales.today_sales)}
                </div>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200/60 w-fit">
                <span>●</span> Daily POS
              </div>
            </div>

            {/* 2. This Month */}
            <div className="group relative rounded-2xl border border-[#EEDDE0] bg-gradient-to-br from-[#FAF2F4] via-white to-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/50 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-[#804652] uppercase tracking-wider">This Month</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FAF2F4] text-xs text-[#7B3F4A] shadow-2xs group-hover:scale-110 transition-transform">
                  📈
                </span>
              </div>
              <div className="my-2">
                <div className="font-serif text-xl xl:text-2xl font-black text-[#7B3F4A] tracking-tight">
                  {formatCurrency(summary.sales.this_month_sales)}
                </div>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Current 30 Days</div>
            </div>

            {/* 3. Total Sales */}
            <div className="group relative rounded-2xl border border-[#EEDDE0] bg-gradient-to-br from-[#FAF2F4] via-white to-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/50 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-[#804652] uppercase tracking-wider">Total Sales</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FAF2F4] text-xs text-[#7B3F4A] shadow-2xs group-hover:scale-110 transition-transform">
                  🪙
                </span>
              </div>
              <div className="my-2">
                <div className="font-serif text-xl xl:text-2xl font-black text-[#7B3F4A] tracking-tight">
                  {formatCurrency(summary.sales.total_sales)}
                </div>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Lifetime Revenue</div>
            </div>

            {/* 4. Total Orders */}
            <div className="group relative rounded-2xl border border-[#F2E5E7] bg-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/40 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Orders</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-700 shadow-2xs group-hover:scale-110 transition-transform">
                  📦
                </span>
              </div>
              <div className="my-2">
                <div className="font-serif text-xl xl:text-2xl font-black text-slate-900 tracking-tight">
                  {summary.orders.total_orders}
                </div>
              </div>
              <div className="text-[10px] font-semibold text-[#804652]">
                {summary.orders.pending_orders} pending
              </div>
            </div>

            {/* 5. Total Customers */}
            <div className="group relative rounded-2xl border border-[#F2E5E7] bg-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/40 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Customers</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-700 shadow-2xs group-hover:scale-110 transition-transform">
                  👥
                </span>
              </div>
              <div className="my-2">
                <div className="font-serif text-xl xl:text-2xl font-black text-slate-900 tracking-tight">
                  {summary.customers.total_customers}
                </div>
              </div>
              <div className="text-[10px] font-semibold text-emerald-700">
                +{summary.customers.new_customers_today} today
              </div>
            </div>

            {/* 6. Total Products */}
            <div className="group relative rounded-2xl border border-[#F2E5E7] bg-white p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/40 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Products</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-700 shadow-2xs group-hover:scale-110 transition-transform">
                  🏷️
                </span>
              </div>
              <div className="my-2">
                <div className="font-serif text-xl xl:text-2xl font-black text-slate-900 tracking-tight">
                  {summary.products.total_products}
                </div>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Active SKUs</div>
            </div>

            {/* 7. Low Stock */}
            <div className={`group relative rounded-2xl border p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md flex flex-col justify-between ${
              Number(summary.products.low_stock_products) > 0
                ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                : 'border-[#F2E5E7] bg-white hover:border-[#7B3F4A]/40'
            }`}>
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Low Stock</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100/80 text-xs text-amber-800 shadow-2xs group-hover:scale-110 transition-transform">
                  ⚠️
                </span>
              </div>
              <div className="my-2">
                <div className={`font-serif text-xl xl:text-2xl font-black tracking-tight ${
                  Number(summary.products.low_stock_products) > 0 ? 'text-amber-900' : 'text-slate-900'
                }`}>
                  {summary.products.low_stock_products}
                </div>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Reorder alert</div>
            </div>

            {/* 8. Out of Stock */}
            <div className={`group relative rounded-2xl border p-4 shadow-2xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md flex flex-col justify-between ${
              Number(summary.products.out_of_stock_products) > 0
                ? 'border-rose-200 bg-rose-50/50 hover:border-rose-300'
                : 'border-[#F2E5E7] bg-white hover:border-[#7B3F4A]/40'
            }`}>
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Out of Stock</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100/80 text-xs text-rose-800 shadow-2xs group-hover:scale-110 transition-transform">
                  ⛔
                </span>
              </div>
              <div className="my-2">
                <div className={`font-serif text-xl xl:text-2xl font-black tracking-tight ${
                  Number(summary.products.out_of_stock_products) > 0 ? 'text-rose-900' : 'text-slate-900'
                }`}>
                  {summary.products.out_of_stock_products}
                </div>
              </div>
              <div className="text-[10px] font-medium text-slate-500">Zero inventory</div>
            </div>
          </div>

          {/* Main 2-Column Section: Popular Items & Receipt Timeline */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
            {/* Left Column: Popular Items */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-slate-900 tracking-tight">
                    Popular Items
                  </h2>
                  <p className="text-xs text-[#804652] font-medium">
                    Top performing catalog products ranked by order volume and sales
                  </p>
                </div>

                {/* View Mode Toggle Icons with Wine Theme */}
                <div className="flex items-center space-x-1 rounded-full border border-[#EEDDE0] bg-[#FAF2F4] p-1 shadow-2xs">
                  <button
                    onClick={() => toggleViewMode('grid')}
                    className={`flex items-center space-x-1.5 rounded-full px-3.5 py-1 text-xs transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[#7B3F4A] text-white shadow-xs font-bold'
                        : 'text-[#804652] hover:text-[#7B3F4A] hover:bg-[#F2E5E7] font-semibold'
                    }`}
                    title="Grid View"
                  >
                    <LayoutGridIcon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Grid</span>
                  </button>
                  <button
                    onClick={() => toggleViewMode('list')}
                    className={`flex items-center space-x-1.5 rounded-full px-3.5 py-1 text-xs transition-all ${
                      viewMode === 'list'
                        ? 'bg-[#7B3F4A] text-white shadow-xs font-bold'
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
                <Card className="rounded-3xl border border-[#F2E5E7] bg-white p-12 text-center shadow-2xs flex flex-col items-center justify-center space-y-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FAF2F4] to-[#F2E5E7] border border-[#EEDDE0] text-[#7B3F4A] text-2xl shadow-xs">
                    🛍️
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-slate-900">
                      No Popular Items Recorded Yet
                    </h3>
                    <p className="text-xs text-[#804652] mt-1 max-w-md mx-auto leading-relaxed">
                      As POS checkout bills and online customer orders are fulfilled, your highest-selling products will automatically populate and rank here.
                    </p>
                  </div>
                  <div className="pt-2 flex items-center gap-3">
                    <Link
                      to="/pos-sale"
                      className="rounded-full bg-[#7B3F4A] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#68343E] transition-all"
                    >
                      Start POS Billing
                    </Link>
                    <Link
                      to="/catalog/products"
                      className="rounded-full border border-[#EEDDE0] bg-[#FAF2F4] px-4 py-2 text-xs font-bold text-[#7B3F4A] hover:bg-[#F2E5E7] transition-all"
                    >
                      View Catalog
                    </Link>
                  </div>
                </Card>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {popularItems.map((item, idx) => {
                    const badgeText = idx === 0 ? '👑 BESTSELLER' : idx === 1 ? '🔥 TRENDING' : '★ POPULAR'
                    const badgeClass =
                      idx === 0
                        ? 'bg-[#FAF2F4] text-[#7B3F4A] border border-[#EEDDE0] font-bold'
                        : idx === 1
                        ? 'bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0] font-bold'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 font-semibold'

                    return (
                      <div
                        key={item.id}
                        className="group relative flex flex-col justify-between rounded-2xl bg-white p-5 shadow-2xs border border-[#F2E5E7] transition-all duration-200 hover:-translate-y-1 hover:shadow-md hover:border-[#7B3F4A]/40"
                      >
                        <div className="flex items-start justify-between">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#FAF2F4] border border-[#EEDDE0] text-xs font-mono font-bold text-[#7B3F4A]">
                            #{idx + 1}
                          </span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-wider ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </div>

                        <div className="my-3.5">
                          <h3 className="text-sm font-bold text-slate-900 font-sans tracking-tight line-clamp-2 group-hover:text-[#7B3F4A] transition-colors">
                            {item.name}
                          </h3>
                        </div>

                        <div className="pt-3 border-t border-[#F2E5E7] flex items-center justify-between text-xs">
                          <span className="text-[#804652] font-semibold bg-[#FAF2F4] px-2 py-0.5 rounded-md">
                            {item.units_sold} sold
                          </span>
                          <span className="font-serif font-black text-[#7B3F4A] text-sm">
                            {formatCurrency(item.revenue)}
                          </span>
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
                            <td className="px-4 py-3 text-right font-serif font-bold text-[#7B3F4A]">
                              {formatCurrency(item.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>

            {/* Right Column: Receipt Timeline (Authentic Thermal Paper Visual) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-1">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-slate-900 tracking-tight">
                    Receipt Timeline
                  </h2>
                  <p className="text-xs text-[#804652] font-medium">Live terminal transactions</p>
                </div>
              </div>

              {/* Thermal Paper Container */}
              <div className="receipt-paper mx-auto w-full rounded-2xl p-6 text-slate-800 font-sans shadow-md border border-[#EEDDE0] bg-[#FAF5F6] relative">
                {/* Store Header on Thermal Ticket */}
                <div className="text-center pb-3 border-b border-dashed border-[#EEDDE0] mb-4 space-y-0.5">
                  <span className="font-serif text-xs font-black tracking-wider text-slate-900 uppercase block">
                    Unified POS Store
                  </span>
                  <span className="font-mono text-[10px] text-[#804652] uppercase block tracking-widest">
                    Terminal #01 • Live Log
                  </span>
                </div>

                <div className="space-y-4 text-xs">
                  {latestSales.slice(0, 5).map((sale) => (
                    <div key={sale.id} className="relative pl-5 border-l-2 border-[#EEDDE0] space-y-1">
                      <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#7B3F4A] ring-3 ring-[#FAF5F6]" />

                      <div className="flex items-center justify-between font-medium">
                        <span className="font-mono font-bold text-[#7B3F4A]">
                          {sale.invoice_no}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toLowerCase()}
                        </span>
                      </div>
                      {sale.items_summary && (
                        <div className="text-[11px] text-slate-600 truncate font-sans">
                          {sale.items_summary}
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-0.5 text-[11px]">
                        <span className="font-serif font-extrabold text-slate-900">
                          {formatCurrency(sale.grand_total)}
                        </span>
                        <span className="text-[9px] font-bold text-[#7B3F4A] bg-[#FAF2F4] px-2 py-0.5 rounded-full border border-[#EEDDE0]">
                          {sale.payment_status} ✓
                        </span>
                      </div>
                    </div>
                  ))}

                  {latestSales.length === 0 && (
                    <div className="py-8 text-center text-xs text-[#804652] space-y-2">
                      <div className="w-10 h-10 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] flex items-center justify-center mx-auto text-[#7B3F4A] text-lg">
                        🧾
                      </div>
                      <p className="font-serif text-sm font-semibold text-slate-700">No receipts printed yet</p>
                      <p className="text-[11px] max-w-[200px] mx-auto leading-relaxed">
                        Bills printed at POS or web orders will appear in real time here.
                      </p>
                    </div>
                  )}
                </div>

                {/* Receipt Total & Barcode Bottom */}
                <div className="mt-5 pt-3.5 border-t border-dashed border-[#EEDDE0] space-y-3">
                  <div className="flex items-center justify-between font-bold text-slate-900 text-sm">
                    <span className="font-serif text-[#804652]">Recent Total:</span>
                    <span className="font-serif text-lg font-black text-[#7B3F4A]">
                      {formatCurrency(totalReceiptsSum)}
                    </span>
                  </div>

                  <div className="pt-2 flex flex-col items-center justify-center space-y-1">
                    {/* Simulated barcode */}
                    <div className="flex items-center gap-[2px] h-6 opacity-60">
                      <span className="w-[1.5px] h-full bg-slate-800" />
                      <span className="w-[1px] h-full bg-slate-800" />
                      <span className="w-[3px] h-full bg-slate-800" />
                      <span className="w-[1px] h-full bg-slate-800" />
                      <span className="w-[2px] h-full bg-slate-800" />
                      <span className="w-[4px] h-full bg-slate-800" />
                      <span className="w-[1px] h-full bg-slate-800" />
                      <span className="w-[2.5px] h-full bg-slate-800" />
                      <span className="w-[1px] h-full bg-slate-800" />
                      <span className="w-[3px] h-full bg-slate-800" />
                      <span className="w-[1.5px] h-full bg-slate-800" />
                      <span className="w-[2px] h-full bg-slate-800" />
                      <span className="w-[1px] h-full bg-slate-800" />
                      <span className="w-[3.5px] h-full bg-slate-800" />
                      <span className="w-[1px] h-full bg-slate-800" />
                    </div>
                    <div className="text-center text-[10px] font-serif italic text-[#804652]">
                      Thank you for your business
                    </div>
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
