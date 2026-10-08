import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Spinner, EmptyState } from '../components/ui'
import { api } from '../lib/api'
import { LayoutGridIcon, ListIcon } from '../components/Icons'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')
function imageUrl(path: string | null | undefined) {
  return path ? `${API_ORIGIN}/${path}` : null
}

interface DashboardSummary {
  sales: {
    total_sales: string
    today_sales: string
    this_month_sales: string
    today_collection?: string
    pos_invoice_count?: number
    ecommerce_invoice_count?: number
  }
  orders: {
    total_orders: number
    pending_orders: string | number
    completed_orders?: string | number
    cancelled_orders?: string | number
    today_orders?: string | number
  }
  customers: {
    total_customers: number
    active_customers?: number
    new_customers_today: string | number
  }
  products: {
    total_products: number
    low_stock_products: number
    out_of_stock_products: number
  }
}

interface PopularProduct {
  id: number
  name: string
  units_sold: string | number
  revenue: string | number
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
  payment_method?: string
  created_at: string
}

function formatCurrency(value: string | number | undefined | null) {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0.00'
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [popularItems, setPopularItems] = useState<PopularProduct[]>([])
  const [latestSales, setLatestSales] = useState<SaleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('dashboard_popular_view') as 'grid' | 'list') || 'grid'
  })

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
      .catch((err) => {
        console.error('Failed to load dashboard data', err)
      })
      .finally(() => setLoading(false))
  }, [])

  const toggleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('dashboard_popular_view', mode)
  }

  const filteredPopularItems = popularItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const todayStr = new Date().toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const totalReceiptsSum = latestSales.reduce((acc, curr) => acc + Number(curr.grand_total || 0), 0)

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-900">
      {/* 1. TOP HEADER BAR */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#8B1D2C]"></span>
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B1D2C]">
              Live Store Analytics
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal">
            Store performance & real-time sales intelligence at a glance
          </p>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Date Indicator */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs">
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{todayStr}</span>
          </div>

          {/* Export Report Button */}
          <Link
            to="/reports"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Export Report</span>
          </Link>

          {/* + New Sale Button */}
          <button
            onClick={() => navigate('/sale')}
            className="flex items-center gap-1.5 rounded-xl bg-[#8B1D2C] hover:bg-[#721723] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:shadow hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>New Sale</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spinner />
        </div>
      ) : !summary ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Could not load dashboard data from backend server.
        </Card>
      ) : (
        <>
          {/* 2. METRIC KPI CARDS (2 ROWS OF 4 CARDS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: TODAY'S SALES */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Today's Sales</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {formatCurrency(summary.sales.today_sales)}
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Active Sales</span>
                <span>Today's registered total</span>
              </div>
            </div>

            {/* Card 2: THIS MONTH */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">This Month</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {formatCurrency(summary.sales.this_month_sales)}
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Current Month</span>
                <span>Calendar month to date</span>
              </div>
            </div>

            {/* Card 3: TOTAL SALES */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Sales</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {formatCurrency(summary.sales.total_sales)}
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">All-Time</span>
                <span>Invoices generated</span>
              </div>
            </div>

            {/* Card 4: TOTAL ORDERS */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Orders</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {summary.orders.total_orders}
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                  {summary.orders.pending_orders} pending
                </span>
                <span>E-Commerce Orders</span>
              </div>
            </div>

            {/* Card 5: CUSTOMERS */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Customers</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {summary.customers.total_customers}
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  +{summary.customers.new_customers_today} today
                </span>
                <span>Active Directory</span>
              </div>
            </div>

            {/* Card 6: TOTAL PRODUCTS */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Products</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
                {summary.products.total_products}
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">Catalog Items</span>
                <Link to="/products" className="hover:text-slate-900 font-semibold underline">
                  View Catalog
                </Link>
              </div>
            </div>

            {/* Card 7: LOW STOCK */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-amber-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Low Stock</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-amber-700">
                {summary.products.low_stock_products} Items
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Reorder Soon</span>
                <Link to="/stock-adjustments" className="font-semibold text-slate-700 hover:text-slate-950 underline">
                  View Stock
                </Link>
              </div>
            </div>

            {/* Card 8: OUT OF STOCK */}
            <div className="relative flex flex-col justify-between rounded-2xl border border-rose-200/90 bg-white p-4 shadow-2xs transition-all hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Out of Stock</span>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-2xl font-black tracking-tight text-rose-700">
                {summary.products.out_of_stock_products} Items
              </div>
              <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-100 text-[10px] text-slate-500">
                <span className="font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">Urgent Alert</span>
                <Link to="/purchases" className="font-semibold text-slate-700 hover:text-slate-950 underline">
                  Create PO
                </Link>
              </div>
            </div>
          </div>

          {/* 3. MAIN SECTION: POPULAR ITEMS & RECENT INVOICES */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Popular Items (8 Cols on LG) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="h-4 w-1 bg-[#8B1D2C] rounded-full"></div>
                  <h2 className="text-base font-bold text-slate-900">Popular Items</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    Top Sellers
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-44 sm:w-52 rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                    <svg className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>

                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                    <button
                      onClick={() => toggleViewMode('grid')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                      }`}
                      title="Grid View"
                    >
                      <LayoutGridIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => toggleViewMode('list')}
                      className={`p-1.5 rounded-lg transition-colors ${
                        viewMode === 'list' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-400 hover:text-slate-700'
                      }`}
                      title="List View"
                    >
                      <ListIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {filteredPopularItems.length === 0 ? (
                <Card className="p-8 text-center text-sm text-slate-500">
                  <EmptyState title="No items recorded yet" description="Items will appear as sales are registered." />
                </Card>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredPopularItems.map((item, idx) => {
                    const img = imageUrl(item.primary_image)
                    const badgeText = idx === 0 ? 'BESTSELLER' : idx === 1 ? 'TRENDING' : 'POPULAR'
                    const badgeClass =
                      idx === 0
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : idx === 1
                        ? 'bg-[#FAF2F4] text-[#7B3F4A] border border-[#EEDDE0]'
                        : 'bg-slate-100 text-slate-700 border border-slate-300'

                    return (
                      <div
                        key={item.id}
                        onClick={() => navigate(`/products/${item.id}`)}
                        className="group relative flex flex-col justify-between rounded-2xl bg-white p-4 shadow-2xs border border-slate-200/90 transition-all hover:-translate-y-1 hover:shadow-md cursor-pointer"
                      >
                        <div>
                          {/* Image / Thumbnail */}
                          {img ? (
                            <div className="relative h-32 w-full overflow-hidden rounded-xl bg-slate-100 mb-3">
                              <img src={img} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                            </div>
                          ) : (
                            <div className="relative h-24 w-full rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-slate-400 mb-3">
                              <svg className="h-7 w-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                          )}

                          <div className="flex items-start justify-between">
                            <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badgeClass}`}>
                              {badgeText}
                            </span>
                          </div>

                          <h3 className="mt-2 text-sm font-bold text-slate-900 line-clamp-2">{item.name}</h3>
                        </div>

                        <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium">
                          <span className="font-semibold text-slate-700">{item.units_sold} units sold</span>
                          <span className="font-black text-slate-900">{formatCurrency(item.revenue)}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* List View Table */
                <Card className="overflow-hidden p-0 border border-slate-200/90 shadow-2xs">
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
                        {filteredPopularItems.map((item, idx) => (
                          <tr
                            key={item.id}
                            onClick={() => navigate(`/products/${item.id}`)}
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                          >
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

            {/* Right Column: Recent Sales Activity & Receipts (4 Cols on LG) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                    Recent Invoices
                  </h2>
                </div>
                <Link to="/invoices" className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 underline">
                  See All ({latestSales.length})
                </Link>
              </div>

              {/* Invoices Feed */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
                {latestSales.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400 italic">No sale receipts available yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {latestSales.slice(0, 6).map((sale) => (
                      <div
                        key={sale.id}
                        onClick={() => navigate(`/invoices/${sale.id}`)}
                        className="group flex items-center justify-between rounded-xl bg-slate-50/80 p-3 border border-slate-100 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-slate-700 border border-slate-200 shadow-2xs group-hover:border-[#8B1D2C] transition-colors">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs">
                              {sale.invoice_no}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {sale.customer_name ? `${sale.customer_name} • ` : ''}
                              {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="font-black text-slate-900 text-xs">
                            {formatCurrency(sale.grand_total)}
                          </div>
                          <span
                            className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded mt-0.5 ${
                              sale.payment_status === 'PAID'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {sale.payment_status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {latestSales.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-slate-900">
                    <span className="text-slate-500">Recent Total:</span>
                    <span className="text-sm font-black">{formatCurrency(totalReceiptsSum)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
