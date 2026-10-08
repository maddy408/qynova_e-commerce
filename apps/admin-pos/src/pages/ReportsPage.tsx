import { useEffect, useState } from 'react'
import { Select, Spinner, TextField } from '../components/ui'
import { api } from '../lib/api'

const API_ORIGIN = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/api\/?$/, '')

function imageUrl(path: string | null | undefined) {
  return path ? `${API_ORIGIN}/${path}` : null
}

function money(value: string | number | undefined | null) {
  if (value === undefined || value === null || isNaN(Number(value))) return '₹0.00'
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}


interface DashboardSummary {
  sales: {
    total_sales: string
    today_sales: string
    this_month_sales: string
    today_collection: string
    pos_invoice_count: number
    ecommerce_invoice_count: number
  }
  orders: {
    total_orders: number
    pending_orders: number
    completed_orders: number
    cancelled_orders: number
    today_orders: number
  }
  refunds: {
    total_refund_amount: string
    pending_refund_amount: string
    completed_refund_count: number
    pending_refund_count: number
  }
  customers: {
    total_customers: number
    active_customers: number
    new_customers_today: number
    new_customers_30d: number
  }
  products: {
    total_products: number
    low_stock_products: number
    out_of_stock_products: number
  }
}

interface SalesChartPoint {
  period: string
  sales_amount: string
  order_count: number
}

interface ProductAnalytics {
  top_selling_products: { id: number; name: string; units_sold: string; revenue: string; primary_image?: string | null }[]
  top_selling_categories: { id: number; name: string; units_sold: string; revenue: string }[]
  top_selling_variants: { id: number; sku: string; product_name: string; units_sold: string; revenue: string }[]
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
  totals: {
    total_referrals: number
    successful_referrals: number
    pending_referrals: number
  }
  referral_discount_given: string
  top_referrers: { id: number; name: string; referral_count: number }[]
}

interface RefundSummary {
  total_refund_amount: string
  pending_refund_amount: string
  completed_refund_amount: string
  total_refunds: number
  pending_count: number
  completed_count: number
  failed_count: number
}

interface BatchReportItem {
  id: number
  variant_id: number
  batch_no: string
  sku: string
  product_name: string
  cost_price: string
  selling_price: string
  mrp: string
  quantity: string
  available_quantity: string
  manufacturing_date: string | null
  expiry_date: string | null
  status: string
}

function SectionHeading({ tag, title, subtitle }: { tag?: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      {tag && (
        <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[#804652] mb-1">
          {tag}
        </span>
      )}
      <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
        {title}
      </h2>
      {subtitle && <p className="text-xs text-slate-600 font-medium mt-0.5">{subtitle}</p>}
    </div>
  )
}

export function ReportsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'POS' | 'ECOMMERCE'>('ALL')
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | 'RETAIL' | 'WHOLESALE'>('ALL')
  const [preset, setPreset] = useState<'today' | 'yesterday' | '7days' | 'month' | 'custom'>('custom')

  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [chart, setChart] = useState<SalesChartPoint[] | null>(null)
  const [products, setProducts] = useState<ProductAnalytics | null>(null)
  const [customers, setCustomers] = useState<CustomerAnalytics | null>(null)
  const [activity, setActivity] = useState<RecentActivity | null>(null)
  const [referrals, setReferrals] = useState<ReferralReport | null>(null)
  const [refunds, setRefunds] = useState<RefundSummary | null>(null)
  const [batches, setBatches] = useState<BatchReportItem[]>([])
  const [expiringBatches, setExpiringBatches] = useState<BatchReportItem[]>([])
  const [hoveredPoint, setHoveredPoint] = useState<SalesChartPoint | null>(null)

  useEffect(() => {
    api.get('/dashboard/sales-chart', { params: { period } }).then((res) => setChart(res.data.chart))
  }, [period])

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/summary').catch(() => ({ data: null })),
      api.get('/dashboard/product-analytics').catch(() => ({ data: null })),
      api.get('/dashboard/customer-analytics').catch(() => ({ data: null })),
      api.get('/dashboard/recent-activity').catch(() => ({ data: null })),
      api.get('/reports/referrals').catch(() => ({ data: null })),
      api.get('/reports/refunds').catch(() => ({ data: { summary: null } })),
      api.get('/inventory/batches').catch(() => ({ data: { batches: [] } })),
      api.get('/inventory/batches/expiry').catch(() => ({ data: { expiring_batches: [] } })),
    ]).then(([sumRes, prodRes, custRes, actRes, refRes, refuRes, batchRes, expRes]) => {
      if (sumRes?.data) setSummary(sumRes.data)
      if (prodRes?.data) setProducts(prodRes.data)
      if (custRes?.data) setCustomers(custRes.data)
      if (actRes?.data) setActivity(actRes.data)
      if (refRes?.data) setReferrals(refRes.data)
      if (refuRes?.data?.summary) setRefunds(refuRes.data.summary)
      if (batchRes?.data?.batches) setBatches(batchRes.data.batches)
      if (expRes?.data?.expiring_batches) setExpiringBatches(expRes.data.expiring_batches)
    })
  }, [])

  function applyPreset(type: 'today' | 'yesterday' | '7days' | 'month') {
    setPreset(type)
    const today = new Date()
    const formatDate = (d: Date) => d.toISOString().slice(0, 10)

    if (type === 'today') {
      const d = formatDate(today)
      setStartDate(d)
      setEndDate(d)
    } else if (type === 'yesterday') {
      const y = new Date(today)
      y.setDate(y.getDate() - 1)
      const d = formatDate(y)
      setStartDate(d)
      setEndDate(d)
    } else if (type === '7days') {
      const d7 = new Date(today)
      d7.setDate(d7.getDate() - 7)
      setStartDate(formatDate(d7))
      setEndDate(formatDate(today))
    } else if (type === 'month') {
      const m1 = new Date(today.getFullYear(), today.getMonth(), 1)
      setStartDate(formatDate(m1))
      setEndDate(formatDate(today))
    }
  }

  function handleExportExcel() {
    const params = new URLSearchParams()
    if (startDate) params.append('start_date', startDate)
    if (endDate) params.append('end_date', endDate)
    if (channelFilter !== 'ALL') params.append('channel', channelFilter)
    if (customerTypeFilter !== 'ALL') params.append('customer_type', customerTypeFilter)

    const token = localStorage.getItem('token')
    fetch(`/api/reports/export/excel?${params.toString()}`, {
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        a.remove()
      })
      .catch((err) => alert('Export failed: ' + err.message))
  }

  function handleExportPdf() {
    window.print()
  }

  // Calculated metrics
  const grossProfitAmount = products ? Number(products.gross_profit_estimate.estimated_gross_profit || 0) : 0
  const revenueExTax = products ? Number(products.gross_profit_estimate.revenue_ex_tax || 0) : 0
  const grossMarginPercent = revenueExTax > 0 ? ((grossProfitAmount / revenueExTax) * 100).toFixed(1) : '0.0'

  // Average Order Value estimate
  const totalOrdersCount = summary?.orders.total_orders || 0
  const totalSalesNum = summary ? Number(summary.sales.total_sales || 0) : 0
  const avgOrderValue = totalOrdersCount > 0 ? (totalSalesNum / totalOrdersCount).toFixed(0) : '0'

  // Max category units sold for relative progress bar
  const maxCategoryUnits = products?.top_selling_categories?.length
    ? Math.max(...products.top_selling_categories.map((c) => Number(c.units_sold) || 0), 1)
    : 1

  // Chart rendering helpers
  const maxSales = chart && chart.length > 0 ? Math.max(...chart.map((c) => Number(c.sales_amount)), 100) : 100
  const chartPoints = chart || []

  return (
    <div className="space-y-6 pb-16 font-sans text-slate-900">
      {/* Top Header with Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-950 tracking-tight">
            Store Performance &amp; Analytics
          </h2>
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            Store analytics with Excel export, PDF export, date presets and multi-filter options.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full bg-white border border-[#EEDDE0] text-slate-900 hover:bg-[#FAF2F4] hover:border-[#804652] shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-[#804652]" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.25V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-bold rounded-full bg-[#804652] text-white hover:bg-[#6e3743] shadow-2xs transition-all active:scale-95 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-rose-200" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24-1.127-.24-2.3 0-3.427m3.84 0a9.043 9.043 0 011.89-2.072m0 0a9.04 9.04 0 012.87-1.173m-4.76 3.245a9.043 9.043 0 00-1.89 2.072m10.457 4.288c-.24 1.127-.24 2.3 0 3.427m-3.84 0a9.043 9.043 0 01-1.89 2.072m0 0a9.04 9.04 0 01-2.87 1.173m4.76-3.245a9.043 9.043 0 001.89-2.072" />
            </svg>
            Export PDF / Print
          </button>
        </div>
      </div>

      {/* Filter Options Bar (Rounded 3XL Card) */}
      <div className="p-4 sm:p-5 bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mr-1">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                preset === 'today' ? 'bg-[#804652] text-white' : 'bg-[#FAF2F4] text-slate-800 hover:bg-[#F2E5E7]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('yesterday')}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                preset === 'yesterday' ? 'bg-[#804652] text-white' : 'bg-[#FAF2F4] text-slate-800 hover:bg-[#F2E5E7]'
              }`}
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => applyPreset('7days')}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                preset === '7days' ? 'bg-[#804652] text-white' : 'bg-[#FAF2F4] text-slate-800 hover:bg-[#F2E5E7]'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('month')}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                preset === 'month' ? 'bg-[#804652] text-white' : 'bg-[#FAF2F4] text-slate-800 hover:bg-[#F2E5E7]'
              }`}
            >
              This Month
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3.5 text-xs pt-2 border-t border-[#F8EAED]">
          <div>
            <label className="block font-bold text-slate-800 mb-1 text-[11px] uppercase tracking-wider">Start Date</label>
            <TextField
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPreset('custom')
              }}
              className="w-36 sm:w-44 bg-[#FAF2F4]/40 border-[#EEDDE0] rounded-2xl font-semibold text-slate-900 focus:border-[#804652]"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-800 mb-1 text-[11px] uppercase tracking-wider">End Date</label>
            <TextField
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPreset('custom')
              }}
              className="w-36 sm:w-44 bg-[#FAF2F4]/40 border-[#EEDDE0] rounded-2xl font-semibold text-slate-900 focus:border-[#804652]"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-800 mb-1 text-[11px] uppercase tracking-wider">Channel</label>
            <Select
              value={channelFilter}
              onChange={(e: any) => setChannelFilter(e.target.value)}
              className="w-36 sm:w-44 bg-[#FAF2F4]/40 border-[#EEDDE0] rounded-2xl font-semibold text-slate-900 focus:border-[#804652]"
            >
              <option value="ALL">All channels</option>
              <option value="POS">POS Billing</option>
              <option value="ECOMMERCE">E-Commerce</option>
            </Select>
          </div>
          <div>
            <label className="block font-bold text-slate-800 mb-1 text-[11px] uppercase tracking-wider">Customer Type</label>
            <Select
              value={customerTypeFilter}
              onChange={(e: any) => setCustomerTypeFilter(e.target.value)}
              className="w-36 sm:w-44 bg-[#FAF2F4]/40 border-[#EEDDE0] rounded-2xl font-semibold text-slate-900 focus:border-[#804652]"
            >
              <option value="ALL">All customers</option>
              <option value="RETAIL">Retail Customers</option>
              <option value="WHOLESALE">Wholesale Buyers</option>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => {
                setStartDate('')
                setEndDate('')
                setChannelFilter('ALL')
                setCustomerTypeFilter('ALL')
                setPreset('custom')
              }}
              className="px-4 py-2 text-xs font-bold text-[#804652] hover:text-[#6e3743] bg-[#FAF2F4] hover:bg-[#F5E8EB] border border-[#EEDDE0] rounded-full transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3 h-3 text-[#804652]" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* 4 Top Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1: Total Revenue */}
        <div className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-[#804652] via-[#733c48] to-[#804652] text-white shadow-sm">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-28 h-28 rounded-full bg-white/10 blur-xl pointer-events-none" />
          <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-rose-100 mb-2">
            TOTAL REVENUE
          </span>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mt-1">
            {summary ? money(summary.sales.total_sales) : '₹0.00'}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-rose-100 font-semibold">
            <span className="inline-flex items-center gap-1 bg-white/20 px-2.5 py-0.5 rounded-full font-bold">
              Today: {summary ? money(summary.sales.today_sales) : '₹0.00'}
            </span>
          </div>
        </div>

        {/* KPI 2: Total Orders */}
        <div className="rounded-3xl p-6 bg-white border border-[#F2E5E7] shadow-2xs flex flex-col justify-between">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">
              TOTAL ORDERS
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 mt-1">
              {summary ? summary.orders.total_orders : 0}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center gap-1 bg-[#FAF2F4] text-[#804652] px-2.5 py-0.5 rounded-full border border-[#EEDDE0]">
              Today: {summary ? summary.orders.today_orders : 0} orders
            </span>
            <span className="text-[11px] text-slate-500 font-medium">Avg: ₹{avgOrderValue}</span>
          </div>
        </div>

        {/* KPI 3: Est. Gross Profit */}
        <div className="rounded-3xl p-6 bg-white border border-[#F2E5E7] shadow-2xs flex flex-col justify-between">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">
              EST. GROSS PROFIT
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-emerald-800 mt-1">
              {products ? money(products.gross_profit_estimate.estimated_gross_profit) : '₹0.00'}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-900">
            <span className="inline-flex items-center bg-emerald-50 text-emerald-900 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {grossMarginPercent}% margin
            </span>
            <span className="text-[11px] text-slate-500 font-medium">ex-tax profit</span>
          </div>
        </div>

        {/* KPI 4: Total Customers & Batches */}
        <div className="rounded-3xl p-6 bg-white border border-[#F2E5E7] shadow-2xs flex flex-col justify-between">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">
              CUSTOMERS &amp; BATCHES
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 mt-1">
              {summary ? summary.customers.total_customers : 0}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center bg-amber-50 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-200">
              {batches.length} Active Batches
            </span>
            {expiringBatches.length > 0 && (
              <span className="inline-flex items-center bg-rose-50 text-rose-900 px-2 py-0.5 rounded-full border border-rose-200 text-[10px]">
                {expiringBatches.length} Expiring
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Performance Chart Card */}
      <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-[#804652] mb-1">
              TREND ANALYSIS
            </span>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Sales Revenue Trend
            </h3>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Interactive timeline of store turnover and order volume
            </p>
          </div>

          {/* Period selector pill */}
          <div className="inline-flex rounded-full bg-[#FAF2F4] p-1 border border-[#EEDDE0] self-start sm:self-auto">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 text-xs font-bold rounded-full capitalize transition-all cursor-pointer ${
                  period === p
                    ? 'bg-[#804652] text-white shadow-2xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Hovered point tooltip callout */}
        <div className="mb-4 flex items-center gap-3 text-xs bg-[#FAF2F4]/60 px-4 py-2 rounded-2xl border border-[#F2E5E7] min-h-[38px]">
          {hoveredPoint ? (
            <>
              <span className="font-bold text-slate-950">{hoveredPoint.period}:</span>
              <span className="font-extrabold text-[#804652] text-sm">{money(hoveredPoint.sales_amount)}</span>
              <span className="text-slate-600 font-semibold">({hoveredPoint.order_count} orders)</span>
            </>
          ) : (
            <span className="text-slate-500 font-medium">Hover over any bar in the chart to inspect period metrics</span>
          )}
        </div>

        {/* Bar Chart Container */}
        {chart === null ? (
          <div className="flex justify-center items-center h-60">
            <Spinner />
          </div>
        ) : chartPoints.length === 0 ? (
          <p className="py-12 text-center text-xs font-semibold text-slate-500">
            No sales recorded for this period.
          </p>
        ) : (
          <div className="h-64 pt-6 flex items-end gap-2 sm:gap-4 overflow-x-auto pb-2">
            {chartPoints.map((point) => {
              const amount = Number(point.sales_amount) || 0
              const heightPct = maxSales > 0 ? Math.max(8, (amount / maxSales) * 100) : 8
              const isHovered = hoveredPoint?.period === point.period

              return (
                <div
                  key={point.period}
                  onMouseEnter={() => setHoveredPoint(point)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="flex-1 min-w-[36px] flex flex-col items-center gap-2 group cursor-pointer"
                >
                  <div className="w-full flex items-end justify-center h-48">
                    <div
                      className={`w-full max-w-[40px] rounded-t-xl transition-all duration-300 ${
                        isHovered
                          ? 'bg-[#804652] shadow-md scale-y-105 origin-bottom'
                          : 'bg-gradient-to-t from-[#804652] to-[#A05C6B] hover:opacity-90'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-[11px] font-bold truncate max-w-full transition-colors ${
                    isHovered ? 'text-[#804652]' : 'text-slate-600'
                  }`}>
                    {point.period}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 2-Column: Top Selling Products & Top Selling Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products */}
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading tag="CATALOG" title="Top Selling Products" subtitle="Most popular items ranked by units and revenue" />
          {products === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : products.top_selling_products.length === 0 ? (
            <p className="py-8 text-center text-xs font-semibold text-slate-500">No product sales yet.</p>
          ) : (
            <div className="divide-y divide-[#F5E8EB]">
              {products.top_selling_products.slice(0, 5).map((p, idx) => (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      idx === 0
                        ? 'bg-[#804652] text-white shadow-2xs'
                        : idx === 1
                        ? 'bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0]'
                        : 'bg-slate-200 text-slate-800'
                    }`}>
                      {idx + 1}
                    </span>
                    <div className="w-10 h-10 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] overflow-hidden shrink-0 flex items-center justify-center">
                      {p.primary_image ? (
                        <img src={imageUrl(p.primary_image)!} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-bold text-xs text-[#804652]">{p.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-950 truncate group-hover:text-[#804652] transition-colors">
                        {p.name}
                      </p>
                      <p className="text-xs text-slate-600 font-semibold">{p.units_sold} sold</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-slate-950">{money(p.revenue)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Selling Categories */}
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading tag="REVENUE SHARE" title="Top Selling Categories" subtitle="Category breakdown and relative demand share" />
          {products === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : products.top_selling_categories.length === 0 ? (
            <p className="py-8 text-center text-xs font-semibold text-slate-500">No category sales yet.</p>
          ) : (
            <div className="space-y-4 pt-1">
              {products.top_selling_categories.map((c) => {
                const units = Number(c.units_sold) || 0
                const percent = Math.min(100, Math.round((units / maxCategoryUnits) * 100))
                return (
                  <div key={c.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-950">{c.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-600">{c.units_sold} sold</span>
                        <span className="font-extrabold text-[#804652]">{percent}%</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-[#FAF2F4] rounded-full overflow-hidden border border-[#F5E8EB]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#804652] to-[#A05C6B] transition-all duration-500"
                        style={{ width: `${Math.max(4, percent)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Batch & Expiry Report Section */}
      <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
        <SectionHeading
          tag="INVENTORY & BATCHES"
          title="Batches & Expiry Alerts"
          subtitle="Real-time tracking of product batches, available quantities and expiry timeline"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
          {/* Active Inventory Batches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Active Batches ({batches.length})</h3>
            </div>
            <div className="overflow-x-auto max-h-72 border border-[#F2E5E7] rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF2F4] text-[#4A1821] uppercase font-bold sticky top-0 border-b border-[#E8CCD1]">
                  <tr>
                    <th className="px-3 py-2">Item / SKU</th>
                    <th className="px-3 py-2">Batch No</th>
                    <th className="px-3 py-2 text-right">Available</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F2E5E7] bg-white">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-[#FAF2F4]/50">
                      <td className="px-3 py-2">
                        <p className="font-bold text-slate-900 truncate max-w-[140px]">{b.product_name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{b.sku}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-700 font-bold">{b.batch_no}</td>
                      <td className="px-3 py-2 text-right font-black text-slate-900">{Number(b.available_quantity)}</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-700">₹{Number(b.selling_price).toFixed(2)}</td>
                      <td className="px-3 py-2 text-slate-600 font-medium">{b.expiry_date ? b.expiry_date : '—'}</td>
                    </tr>
                  ))}
                  {batches.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-400">No active batches recorded.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Near Expiry / Expired Batches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-950">Expiry Alerts (&lt; 30 Days) ({expiringBatches.length})</h3>
            </div>
            <div className="overflow-x-auto max-h-72 border border-red-200 bg-red-50/20 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-red-100/70 text-red-900 uppercase font-bold sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Item / SKU</th>
                    <th className="px-3 py-2">Batch No</th>
                    <th className="px-3 py-2 text-right">Qty Left</th>
                    <th className="px-3 py-2">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 bg-white">
                  {expiringBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-red-50">
                      <td className="px-3 py-2">
                        <p className="font-bold text-red-950 truncate max-w-[140px]">{b.product_name}</p>
                        <p className="text-[10px] font-mono text-red-700">{b.sku}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-red-900 font-bold">{b.batch_no}</td>
                      <td className="px-3 py-2 text-right font-black text-red-950">{Number(b.available_quantity)}</td>
                      <td className="px-3 py-2 text-red-800 font-bold">{b.expiry_date}</td>
                    </tr>
                  ))}
                  {expiringBatches.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-emerald-700 font-bold">✓ No batches near expiry within 30 days.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Estimated Gross Profit Section */}
      {products && (
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading
            tag="MARGINS"
            title="Estimated Gross Profit"
            subtitle="Calculated on variant cost price vs invoice selling price ex-tax"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">REVENUE (EX. TAX)</p>
              <p className="mt-1.5 text-xl font-extrabold text-slate-950 tracking-tight">
                {money(products.gross_profit_estimate.revenue_ex_tax)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">ESTIMATED COGS</p>
              <p className="mt-1.5 text-xl font-extrabold text-slate-950 tracking-tight">
                {money(products.gross_profit_estimate.estimated_cogs)}
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600">GROSS PROFIT</p>
              <p className="mt-1.5 text-xl font-extrabold text-emerald-800 tracking-tight flex items-baseline gap-2">
                <span>{money(products.gross_profit_estimate.estimated_gross_profit)}</span>
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full font-sans">
                  {grossMarginPercent}% margin
                </span>
              </p>
            </div>
          </div>
          <p className="mt-3.5 text-xs text-slate-600 font-medium">
            {products.gross_profit_estimate.note}
          </p>
        </div>
      )}

      {/* 2-Column: Customer Analytics & Referrals Report */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Analytics */}
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading tag="AUDIENCE" title="Customer Analytics" subtitle="Customer retention, acquisition and top spenders" />
          {customers === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-5">
              {/* 3 Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7] text-center">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">ONE-TIME</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-950">{customers.one_time_customers}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7] text-center">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">RETURNING</p>
                  <p className="mt-1 text-lg font-extrabold text-[#804652]">{customers.returning_customers}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7] text-center">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">VIA REFERRAL</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-800">{customers.referral_customer_count}</p>
                </div>
              </div>

              {/* Top Customers List */}
              <div>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#804652]">TOP CUSTOMERS</p>
                <div className="divide-y divide-[#F5E8EB]">
                  {customers.top_customers.map((c) => (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] text-[#804652] font-bold text-xs flex items-center justify-center shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-950 truncate">{c.name}</p>
                          <p className="text-[11px] text-slate-600 font-medium">{c.invoice_count} orders • {c.phone || 'No phone'}</p>
                        </div>
                      </div>
                      <span className="text-xs font-extrabold text-slate-950 shrink-0">{money(c.total_spent)}</span>
                    </div>
                  ))}
                  {customers.top_customers.length === 0 && (
                    <p className="py-4 text-center text-xs font-semibold text-slate-500">No customer invoices yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Referrals Report */}
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading tag="WORD OF MOUTH" title="Referrals Report" subtitle="Referral program performance & top promoters" />
          {referrals === null ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <div className="space-y-5">
              {/* 3 Referral Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7] text-center">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">TOTAL</p>
                  <p className="mt-1 text-lg font-extrabold text-slate-950">{referrals.totals.total_referrals}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7] text-center">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">SUCCESSFUL</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-800">{referrals.totals.successful_referrals}</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7] text-center">
                  <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">PENDING</p>
                  <p className="mt-1 text-lg font-extrabold text-amber-800">{referrals.totals.pending_referrals}</p>
                </div>
              </div>

              {/* Discount callout */}
              <div className="p-3.5 rounded-2xl bg-[#FAF2F4] border border-[#EEDDE0] flex items-center justify-between text-xs">
                <span className="font-bold text-[#804652]">Discount given via referrals</span>
                <span className="font-extrabold text-[#804652]">{money(referrals.referral_discount_given)}</span>
              </div>

              {/* Top Referrers */}
              <div>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#804652]">TOP REFERRERS</p>
                <div className="divide-y divide-[#F5E8EB]">
                  {referrals.top_referrers.map((r) => (
                    <div key={r.id} className="py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#FAF2F4] border border-[#EEDDE0] text-[#804652] font-bold text-xs flex items-center justify-center shrink-0">
                          {r.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-bold text-slate-950">{r.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-800 bg-[#FAF2F4] px-3 py-1 rounded-full border border-[#EEDDE0]">
                        {r.referral_count} invites
                      </span>
                    </div>
                  ))}
                  {referrals.top_referrers.length === 0 && (
                    <p className="py-4 text-center text-xs font-semibold text-slate-500">No referrals yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Refunds Summary Card */}
      <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
        <SectionHeading tag="RETURNS" title="Refunds Summary" subtitle="Store refund claims, pending status and settlement" />
        {refunds === null ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">TOTAL REFUNDED</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg sm:text-xl font-extrabold text-slate-950">{money(refunds.total_refund_amount)}</p>
                <span className="text-[11px] font-bold bg-[#FAF2F4] text-[#804652] px-2 py-0.5 rounded-full border border-[#EEDDE0]">
                  {refunds.total_refunds} refunds
                </span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">PENDING</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg sm:text-xl font-extrabold text-amber-800">{money(refunds.pending_refund_amount)}</p>
                <span className="text-[11px] font-bold bg-amber-50 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                  {refunds.pending_count} refunds
                </span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">COMPLETED</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg sm:text-xl font-extrabold text-emerald-800">{money(refunds.completed_refund_amount)}</p>
                <span className="text-[11px] font-bold bg-emerald-50 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-200">
                  {refunds.completed_count} refunds
                </span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF2F4]/50 border border-[#F2E5E7]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">FAILED</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-lg sm:text-xl font-extrabold text-slate-950">{refunds.failed_count}</p>
                <span className="text-[11px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                  failed
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity: POS / E-Commerce Sales & Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading tag="LIVE" title="POS / E-commerce Sales" subtitle="Latest invoice transactions" />
          <div className="divide-y divide-[#F5E8EB]">
            {activity?.recent_sales.map((s) => (
              <div key={s.id} className="py-3 flex items-center justify-between gap-3 hover:bg-[#FAF2F4]/50 px-2 rounded-2xl transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      s.channel === 'POS' ? 'bg-[#804652] text-white' : 'bg-[#FAF2F4] text-[#804652] border border-[#EEDDE0]'
                    }`}>
                      {s.channel}
                    </span>
                    <span className="text-xs font-bold text-slate-950">{s.invoice_no}</span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium mt-1">{s.created_at}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-extrabold text-slate-950">{money(s.grand_total)}</p>
                </div>
              </div>
            ))}
            {activity && activity.recent_sales.length === 0 && (
              <p className="py-6 text-center text-xs font-semibold text-slate-500">No recent sales recorded yet.</p>
            )}
            {!activity && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-3xl border border-[#F2E5E7] shadow-2xs p-6">
          <SectionHeading tag="FULFILMENT" title="Orders" subtitle="Latest store orders & fulfillment" />
          <div className="divide-y divide-[#F5E8EB]">
            {activity?.recent_orders.map((o) => (
              <div key={o.id} className="py-3 flex items-center justify-between gap-3 hover:bg-[#FAF2F4]/50 px-2 rounded-2xl transition-colors">
                <div>
                  <p className="text-xs font-bold text-slate-950">{o.customer_name || 'Walk-in Customer'}</p>
                  <p className="text-[11px] text-slate-600 font-medium mt-0.5">{o.order_no}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                    o.status === 'DELIVERED'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : o.status === 'SHIPPED'
                      ? 'bg-rose-50 text-[#804652] border border-rose-200'
                      : o.status === 'PROCESSING' || o.status === 'PENDING'
                      ? 'bg-amber-50 text-amber-900 border border-amber-200'
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {o.status}
                  </span>
                  <p className="text-xs font-extrabold text-slate-950">{money(o.grand_total)}</p>
                </div>
              </div>
            ))}
            {activity && activity.recent_orders.length === 0 && (
              <p className="py-6 text-center text-xs font-semibold text-slate-500">No online orders placed yet.</p>
            )}
            {!activity && (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
