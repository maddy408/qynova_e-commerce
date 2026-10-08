import { useEffect, useState } from 'react'
import { Badge, Button, Card, PageHeader, Select, Spinner, TextField } from '../components/ui'
import { api } from '../lib/api'
import { DownloadIcon, PrinterIcon, FilterIcon } from '../components/Icons'

function money(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-slate-900">{children}</h2>
}

export function ReportsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [channelFilter, setChannelFilter] = useState<'ALL' | 'POS' | 'ECOMMERCE'>('ALL')
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | 'NORMAL' | 'RETAIL' | 'WHOLESALE'>('ALL')
  const [preset, setPreset] = useState<'today' | 'yesterday' | '7days' | 'month' | 'custom'>('custom')

  const [chart, setChart] = useState<SalesChartPoint[] | null>(null)
  const [products, setProducts] = useState<ProductAnalytics | null>(null)
  const [customers, setCustomers] = useState<CustomerAnalytics | null>(null)
  const [activity, setActivity] = useState<RecentActivity | null>(null)
  const [batches, setBatches] = useState<BatchReportItem[]>([])
  const [expiringBatches, setExpiringBatches] = useState<BatchReportItem[]>([])

  useEffect(() => {
    api.get('/dashboard/sales-chart', { params: { period } }).then((res) => setChart(res.data.chart))
  }, [period])

  useEffect(() => {
    Promise.all([
      api.get('/dashboard/product-analytics'),
      api.get('/dashboard/customer-analytics'),
      api.get('/dashboard/recent-activity'),
      api.get('/inventory/batches'),
      api.get('/inventory/batches/expiry'),
    ]).then(([prodRes, custRes, actRes, batchRes, expRes]) => {
      setProducts(prodRes.data)
      setCustomers(custRes.data)
      setActivity(actRes.data)
      setBatches(batchRes.data.batches || [])
      setExpiringBatches(expRes.data.expiring_batches || [])
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

  const maxSales = chart && chart.length > 0 ? Math.max(...chart.map((c) => Number(c.sales_amount))) : 0

  const totalSalesSum = chart ? chart.reduce((acc, c) => acc + Number(c.sales_amount), 0) : 0

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title="Reports & Analytics"
        description="Comprehensive store reports with preset date ranges, customer type filtering, and batch expiry tracking."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportExcel} className="flex items-center space-x-1.5">
              <DownloadIcon className="h-4 w-4" />
              <span>Export CSV</span>
            </Button>
            <Button size="sm" onClick={handleExportPdf} className="flex items-center space-x-1.5 bg-slate-900">
              <PrinterIcon className="h-4 w-4" />
              <span>Print PDF</span>
            </Button>
          </div>
        }
      />

      {/* Clean KPI Cards Summary Row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4 border-[#EEDDE0] bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#804652] uppercase tracking-wider">Total Sales</span>
            <span className="text-[#7B3F4A] font-bold">₹</span>
          </div>
          <div className="mt-2 text-2xl font-serif font-black text-slate-900">{money(totalSalesSum)}</div>
          <span className="text-[10px] text-slate-400 font-medium">Aggregated sales total</span>
        </Card>

        <Card className="p-4 border-emerald-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Est. Gross Profit</span>
            <span className="text-emerald-600 font-bold">📈</span>
          </div>
          <div className="mt-2 text-2xl font-serif font-black text-emerald-700">
            {products ? money(products.gross_profit_estimate.estimated_gross_profit) : '₹0.00'}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Margin estimate</span>
        </Card>

        <Card className="p-4 border-amber-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Batches</span>
            <span className="text-amber-600 font-bold">📦</span>
          </div>
          <div className="mt-2 text-2xl font-serif font-black text-slate-900">{batches.length}</div>
          <span className="text-[10px] text-slate-400 font-medium">{expiringBatches.length} expiring soon</span>
        </Card>

        <Card className="p-4 border-rose-200 bg-white shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Customers</span>
            <span className="text-[#804652] font-bold">👥</span>
          </div>
          <div className="mt-2 text-2xl font-serif font-black text-slate-900">
            {customers ? customers.one_time_customers + customers.returning_customers : 0}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{customers?.returning_customers || 0} returning</span>
        </Card>
      </div>

      {/* Filter Options Bar with Presets */}
      <Card className="p-4 bg-[#FAF2F4]/60 border-[#EEDDE0] shadow-2xs">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold text-[#804652]">
              <FilterIcon className="h-4 w-4 text-[#7B3F4A]" />
              <span>Report Presets &amp; Filters</span>
            </div>

            {/* Date Range Presets */}
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                  preset === 'today' ? 'bg-[#7B3F4A] text-white shadow-xs' : 'bg-white border border-[#EEDDE0] text-slate-700 hover:bg-[#FAF2F4]'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPreset('yesterday')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                  preset === 'yesterday' ? 'bg-[#7B3F4A] text-white shadow-xs' : 'bg-white border border-[#EEDDE0] text-slate-700 hover:bg-[#FAF2F4]'
                }`}
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => applyPreset('7days')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                  preset === '7days' ? 'bg-[#7B3F4A] text-white shadow-xs' : 'bg-white border border-[#EEDDE0] text-slate-700 hover:bg-[#FAF2F4]'
                }`}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('month')}
                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${
                  preset === 'month' ? 'bg-[#7B3F4A] text-white shadow-xs' : 'bg-white border border-[#EEDDE0] text-slate-700 hover:bg-[#FAF2F4]'
                }`}
              >
                This Month
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4 text-xs pt-2 border-t border-slate-200">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Start Date</label>
              <TextField
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setPreset('custom')
                }}
                className="w-40 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">End Date</label>
              <TextField
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setPreset('custom')
                }}
                className="w-40 bg-white text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Sales Channel</label>
              <Select
                value={channelFilter}
                onChange={(e: any) => setChannelFilter(e.target.value)}
                className="w-40 bg-white text-xs"
              >
                <option value="ALL">All Channels</option>
                <option value="POS">POS Billing</option>
                <option value="ECOMMERCE">E-Commerce</option>
              </Select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Customer Type Filter</label>
              <Select
                value={customerTypeFilter}
                onChange={(e: any) => setCustomerTypeFilter(e.target.value)}
                className="w-40 bg-white text-xs font-bold"
              >
                <option value="ALL">All Customer Types</option>
                <option value="NORMAL">Normal Customers</option>
                <option value="RETAIL">Retail Customers</option>
                <option value="WHOLESALE">Wholesale Buyers</option>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                  setChannelFilter('ALL')
                  setCustomerTypeFilter('ALL')
                  setPreset('custom')
                }}
              >
                Reset Filters
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>Sales Trend Chart</SectionTitle>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')} className="w-36 text-xs bg-white">
            <option value="daily">Daily View</option>
            <option value="weekly">Weekly View</option>
            <option value="monthly">Monthly View</option>
          </Select>
        </div>
        <Card className="p-5 shadow-2xs">
          {chart === null ? (
            <Spinner />
          ) : chart.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No sales recorded for selected period.</p>
          ) : (
            <div className="flex h-44 items-end gap-2 pt-6">
              {chart.map((point) => (
                <div key={point.period} className="flex flex-1 flex-col items-center gap-1 group relative" title={`${point.period}: ${money(point.sales_amount)} (${point.order_count} orders)`}>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-10">
                    {money(point.sales_amount)}
                  </div>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-[#7B3F4A] to-[#A35C69] group-hover:from-[#68343E] group-hover:to-[#7B3F4A] transition-colors"
                    style={{ height: maxSales > 0 ? `${Math.max(6, (Number(point.sales_amount) / maxSales) * 130)}px` : '6px' }}
                  />
                  <span className="truncate text-[10px] font-medium text-slate-400">{point.period}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Top Selling Products</SectionTitle>
          <Card className="shadow-2xs overflow-hidden">
            {products === null ? (
              <Spinner />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Product Name</th>
                      <th className="px-4 py-2.5 text-right">Units Sold</th>
                      <th className="px-4 py-2.5 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {products.top_selling_products.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-slate-900">{p.name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-medium">{p.units_sold}</td>
                        <td className="px-4 py-2.5 text-right font-extrabold text-slate-900">{money(p.revenue)}</td>
                      </tr>
                    ))}
                    {products.top_selling_products.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-400">No product sales recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Top Selling Categories</SectionTitle>
          <Card className="shadow-2xs overflow-hidden">
            {products === null ? (
              <Spinner />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-600 uppercase border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Category Name</th>
                      <th className="px-4 py-2.5 text-right">Units Sold</th>
                      <th className="px-4 py-2.5 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {products.top_selling_categories.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-slate-900">{c.name}</td>
                        <td className="px-4 py-2.5 text-right text-slate-600 font-medium">{c.units_sold}</td>
                        <td className="px-4 py-2.5 text-right font-extrabold text-slate-900">{money(c.revenue)}</td>
                      </tr>
                    ))}
                    {products.top_selling_categories.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-xs text-slate-400">No category sales recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Batch & Expiry Report Section */}
      <div>
        <SectionTitle>Inventory Batches &amp; Expiry Report</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Active Inventory Batches */}
          <Card className="p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Active Batches</h3>
              <span className="text-[11px] font-bold text-[#7B3F4A]">{batches.length} Batches</span>
            </div>
            <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold sticky top-0">
                  <tr>
                    <th className="px-3 py-2">Item / SKU</th>
                    <th className="px-3 py-2">Batch No</th>
                    <th className="px-3 py-2 text-right">Available</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2">Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {batches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
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
          </Card>

          {/* Near Expiry / Expired Batches */}
          <Card className="p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-950">Expiry Alerts (&lt; 30 Days)</h3>
              <span className="text-[11px] font-bold text-red-600">{expiringBatches.length} Expiring / Expired</span>
            </div>
            <div className="overflow-x-auto max-h-72 border border-red-200 bg-red-50/20 rounded-lg">
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
          </Card>
        </div>
      </div>

      <div>
        <SectionTitle>Recent Transactions &amp; Orders Activity</SectionTitle>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="shadow-2xs">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase text-slate-700">Recent POS &amp; E-commerce Sales</p>
            <ul className="divide-y divide-slate-100">
              {activity?.recent_sales.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{s.invoice_no}</p>
                    <p className="text-[10px] text-slate-400">{s.channel}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-slate-900">{money(s.grand_total)}</p>
                    <Badge tone={s.payment_status === 'PAID' ? 'green' : 'amber'}>{s.payment_status}</Badge>
                  </div>
                </li>
              ))}
              {activity && activity.recent_sales.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-400">No recent sales.</li>}
            </ul>
          </Card>

          <Card className="shadow-2xs">
            <p className="border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase text-slate-700">Recent Store Orders</p>
            <ul className="divide-y divide-slate-100">
              {activity?.recent_orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">{o.order_no}</p>
                    <p className="text-[10px] text-slate-400">{o.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-slate-900">{money(o.grand_total)}</p>
                    <Badge>{o.status}</Badge>
                  </div>
                </li>
              ))}
              {activity && activity.recent_orders.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-400">No recent orders.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}

