import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, Spinner } from '../components/ui'
import { api, getApiOrigin } from '../lib/api'
import { ROUTES } from '../routes/routes'

interface DashboardSummary {
  sales: {
    total_sales: string
    today_sales: string
    this_month_sales: string
    today_collection?: string
  }
  orders: {
    total_orders: number
    pending_orders: string
    processing_orders?: string
    completed_orders: string
    cancelled_orders: string
    today_orders: string
  }
  customers: {
    total_customers: number
    new_customers_today: string
    active_customers?: string
  }
  products: {
    total_products: number
    low_stock_products: number
    out_of_stock_products: number
  }
  finance: {
    total_income: string
    total_expense: string
    net_profit: string
  }
}

interface SalesChartPoint {
  period: string
  sales_amount: string
  order_count: number
}

interface PopularProduct {
  id: number
  name: string
  units_sold: string
  revenue: string
  primary_image?: string | null
}

interface CategoryItem {
  id: number
  name: string
  product_count?: number
  total_units_sold?: string | number
  image_path?: string | null
}

interface RecentSale {
  id: number
  invoice_no: string
  channel: string
  customer_name?: string | null
  items_summary?: string | null
  grand_total: string
  payment_status: string
  created_at: string
}

interface RecentOrder {
  id: number
  order_no: string
  customer_name?: string | null
  status: string
  payment_status: string
  grand_total: string
  created_at: string
}

function formatCurrency(value: string | number) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function imageUrl(path: string | null | undefined) {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${getApiOrigin()}/${path.replace(/^\/+/, '')}`
}

function formatRelativeTime(dateStr: string) {
  if (!dateStr) return 'Just now'
  const date = new Date(dateStr.replace(' ', 'T'))
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return 'Just now'
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin} mins ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getCategoryIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('veg')) return '🥦'
  if (lower.includes('fruit')) return '🍎'
  if (lower.includes('groc')) return '🥫'
  if (lower.includes('herb') || lower.includes('spice')) return '🌿'
  if (lower.includes('hair') || lower.includes('access')) return '🎀'
  if (lower.includes('bag') || lower.includes('pouch')) return '👜'
  if (lower.includes('toy')) return '🧸'
  if (lower.includes('jewel') || lower.includes('fashion')) return '💍'
  if (lower.includes('beauty')) return '💄'
  if (lower.includes('combo') || lower.includes('offer')) return '🎁'
  if (lower.includes('store') || lower.includes('util')) return '📦'
  return '🧴'
}

function getProductFallbackIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('tomato')) return '🍅'
  if (lower.includes('potato')) return '🥔'
  if (lower.includes('onion')) return '🧅'
  if (lower.includes('carrot')) return '🥕'
  if (lower.includes('bean')) return '🫘'
  if (lower.includes('scrunch') || lower.includes('hair')) return '🎀'
  if (lower.includes('handbag') || lower.includes('bag')) return '👜'
  if (lower.includes('car') || lower.includes('toy')) return '🏎️'
  if (lower.includes('glam') || lower.includes('beauty')) return '💄'
  return '📦'
}

function MiniBars({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-0.5 h-4 self-end">
      <span className={`w-1 rounded-xs ${color} opacity-35 h-1.5`} />
      <span className={`w-1 rounded-xs ${color} opacity-60 h-2.5`} />
      <span className={`w-1 rounded-xs ${color} opacity-90 h-4`} />
      <span className={`w-1 rounded-xs ${color} h-3`} />
    </div>
  )
}

function WaveSparkline({ color, isUp }: { color: string; isUp: boolean }) {
  const strokeColor = color === 'emerald' ? '#10b981' : color === 'rose' ? '#f43f5e' : '#0ea5e9'
  const fillColor = color === 'emerald' ? '#34d399' : color === 'rose' ? '#fb7185' : '#38bdf8'

  return (
    <div className="w-20 h-9 overflow-hidden pointer-events-none opacity-80 self-end">
      <svg className="w-full h-full" viewBox="0 0 100 45" preserveAspectRatio="none">
        <path
          d={
            isUp
              ? 'M0 38 Q 25 32, 50 18 T 100 8 L 100 45 L 0 45 Z'
              : 'M0 12 Q 25 18, 50 32 T 100 40 L 100 45 L 0 45 Z'
          }
          fill={fillColor}
          fillOpacity="0.18"
        />
        <path
          d={
            isUp
              ? 'M0 38 Q 25 32, 50 18 T 100 8'
              : 'M0 12 Q 25 18, 50 32 T 100 40'
          }
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

function getHeaderDateRange(chartDays: number) {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (chartDays - 1))
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${fmt(start)} - ${fmt(end)}`
}

function getTimelinePoints(chartDays: number, points: SalesChartPoint[]) {
  const result: Array<{ dateKey: string; label: string; amount: number; count: number }> = []
  const now = new Date()
  const pointMap = new Map<string, { amount: number; count: number }>()
  for (const pt of points) {
    pointMap.set(pt.period, {
      amount: Number(pt.sales_amount || 0),
      count: Number(pt.order_count || 0),
    })
  }

  for (let i = chartDays - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateKey = `${year}-${month}-${day}`
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const match = pointMap.get(dateKey)
    result.push({
      dateKey,
      label,
      amount: match ? match.amount : 0,
      count: match ? match.count : 0,
    })
  }
  return result
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [chartDays, setChartDays] = useState<number>(7)
  const [headerDateRange, setHeaderDateRange] = useState<string>(() => getHeaderDateRange(7))
  const [chartTimeline, setChartTimeline] = useState<
    Array<{ dateKey: string; label: string; amount: number; count: number }>
  >([])
  const [popularItems, setPopularItems] = useState<PopularProduct[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number
    y: number
    dateLabel: string
    amount: number
    count: number
  } | null>(null)

  // Fetch all live data from backend
  useEffect(() => {
    let isMounted = true

    const loadAll = async () => {
      setLoading(true)
      try {
        const [sumRes, chartRes, prodRes, actRes, catRes] = await Promise.all([
          api.get('/dashboard/summary'),
          api.get('/dashboard/sales-chart', { params: { period: 'daily', buckets: chartDays } }),
          api.get('/dashboard/product-analytics', { params: { limit: 10 } }),
          api.get('/dashboard/recent-activity', { params: { limit: 10 } }),
          api.get('/categories'),
        ])

        if (!isMounted) return

        const chartPts: SalesChartPoint[] = chartRes.data.chart || []
        setSummary(sumRes.data)
        setHeaderDateRange(getHeaderDateRange(chartDays))
        setChartTimeline(getTimelinePoints(chartDays, chartPts))
        setPopularItems(prodRes.data.top_selling_products || [])
        setRecentSales(actRes.data.recent_sales || [])
        setRecentOrders(actRes.data.recent_orders || [])
        setCategories(catRes.data.categories || catRes.data || [])
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadAll()
    return () => {
      isMounted = false
    }
  }, [chartDays])

  // Calculate SVG curve geometry for Sales Overview
  const { pathD, areaD, plottedPoints, yAxisTicks, maxVal } = useMemo(() => {
    const svgWidth = 560
    const svgHeight = 220
    const padLeft = 60
    const padRight = 24
    const padTop = 20
    const padBottom = 38

    const plotW = svgWidth - padLeft - padRight
    const plotH = svgHeight - padTop - padBottom

    const amounts = chartTimeline.map((p) => p.amount)
    const rawMax = Math.max(...amounts, 100)
    // Round max up to neat round number
    const maxVal = Math.ceil(rawMax / 1000) * 1000 || 1000

    const yAxisTicks = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal]

    const pts = chartTimeline.map((p, idx) => {
      const x = padLeft + (idx / Math.max(1, chartTimeline.length - 1)) * plotW
      const y = padTop + plotH - (p.amount / maxVal) * plotH
      return { ...p, x, y }
    })

    if (pts.length === 0) {
      return { pathD: '', areaD: '', plottedPoints: [], yAxisTicks, maxVal }
    }

    // Build smooth cubic bezier spline
    let pathD = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i]
      const p1 = pts[i + 1]
      const cpX = p0.x + (p1.x - p0.x) / 2
      pathD += ` C ${cpX} ${p0.y}, ${cpX} ${p1.y}, ${p1.x} ${p1.y}`
    }

    const baselineY = padTop + plotH
    const areaD = `${pathD} L ${pts[pts.length - 1].x} ${baselineY} L ${pts[0].x} ${baselineY} Z`

    return { pathD, areaD, plottedPoints: pts, yAxisTicks, maxVal }
  }, [chartTimeline])

  // Calculate Order Status breakdown
  const orderBreakdown = useMemo(() => {
    if (!summary) {
      return {
        total: 0,
        pending: 0,
        delivered: 0,
        processing: 0,
        cancelled: 0,
        pendingPct: 0,
        deliveredPct: 0,
        processingPct: 0,
        cancelledPct: 0,
      }
    }

    const total = Number(summary.orders.total_orders || 0)
    const pending = Number(summary.orders.pending_orders || 0)
    const delivered = Number(summary.orders.completed_orders || 0)
    const processing = Number(summary.orders.processing_orders || 0)
    const cancelled = Number(summary.orders.cancelled_orders || 0)

    const pct = (val: number) => (total > 0 ? Math.round((val / total) * 100) : 0)

    return {
      total,
      pending,
      delivered,
      processing,
      cancelled,
      pendingPct: pct(pending),
      deliveredPct: pct(delivered),
      processingPct: pct(processing),
      cancelledPct: pct(cancelled),
    }
  }, [summary])

  // Donut Arc calculation (circumference = 2 * PI * 58 ≈ 364.4)
  const donutArcs = useMemo(() => {
    const radius = 58
    const circumference = 2 * Math.PI * radius
    const total = orderBreakdown.total

    if (total === 0) {
      return [
        {
          color: '#e2e8f0',
          strokeDasharray: `${circumference} 0`,
          strokeDashoffset: 0,
        },
      ]
    }

    const segments = [
      { key: 'delivered', count: orderBreakdown.delivered, color: '#10b981' },
      { key: 'processing', count: orderBreakdown.processing, color: '#0ea5e9' },
      { key: 'pending', count: orderBreakdown.pending, color: '#f59e0b' },
      { key: 'cancelled', count: orderBreakdown.cancelled, color: '#f43f5e' },
    ]

    let cumulativeOffset = 0
    return segments.map((seg) => {
      const length = (seg.count / total) * circumference
      const arc = {
        color: seg.color,
        strokeDasharray: `${length} ${circumference - length}`,
        strokeDashoffset: -cumulativeOffset,
      }
      cumulativeOffset += length
      return arc
    })
  }, [orderBreakdown])

  // Top categories with dynamic proportions
  const topCategoryList = useMemo(() => {
    const list = [...categories].slice(0, 5)
    const maxProducts = Math.max(...list.map((c) => Number(c.product_count || 0)), 1)
    const totalProductsAll = list.reduce((acc, c) => acc + Number(c.product_count || 0), 0) || 1

    return list.map((cat) => {
      const pCount = Number(cat.product_count || 0)
      const pct = Math.round((pCount / totalProductsAll) * 100)
      return {
        ...cat,
        productCount: pCount,
        percent: pct,
        barWidth: Math.max(8, Math.round((pCount / maxProducts) * 100)),
      }
    })
  }, [categories])

  // Combined timeline of Recent Activity
  const activityList = useMemo(() => {
    const items: Array<{
      id: string
      type: 'order' | 'sale' | 'customer' | 'payment' | 'cancelled'
      title: string
      subtitle: string
      time: string
      iconBg: string
      icon: string
    }> = []

    for (const ord of recentOrders.slice(0, 3)) {
      if (ord.status === 'CANCELLED') {
        items.push({
          id: `ord-c-${ord.id}`,
          type: 'cancelled',
          title: 'Order cancelled',
          subtitle: `#${ord.order_no} • ${ord.customer_name || 'Customer'}`,
          time: formatRelativeTime(ord.created_at),
          iconBg: 'bg-rose-100 text-rose-600',
          icon: '✕',
        })
      } else {
        items.push({
          id: `ord-${ord.id}`,
          type: 'order',
          title: 'New order received',
          subtitle: `#${ord.order_no} • ${formatCurrency(ord.grand_total)}`,
          time: formatRelativeTime(ord.created_at),
          iconBg: 'bg-purple-100 text-purple-600',
          icon: '🛒',
        })
      }
    }

    for (const sale of recentSales.slice(0, 3)) {
      items.push({
        id: `sale-${sale.id}`,
        type: 'sale',
        title: sale.channel === 'POS' ? 'POS Receipt issued' : 'E-commerce sale',
        subtitle: sale.items_summary ? `${sale.items_summary.slice(0, 35)}...` : `#${sale.invoice_no}`,
        time: formatRelativeTime(sale.created_at),
        iconBg: 'bg-amber-100 text-amber-600',
        icon: '🏷️',
      })
    }

    return items.slice(0, 5)
  }, [recentOrders, recentSales])

  return (
    <div className="space-y-6 pb-12 font-sans text-slate-800 antialiased">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-normal">
            Real-time business performance, billing velocity, and store analytics
          </p>
        </div>

        {/* Date Range Picker Indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-white shadow-2xs text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer">
            <span className="text-sm">📅</span>
            <span>{headerDateRange}</span>
            <span className="text-[10px] text-slate-400">▼</span>
          </div>
        </div>
      </div>

      {loading && !summary ? (
        <div className="flex justify-center py-24">
          <Spinner className="w-9 h-9 text-purple-600" />
        </div>
      ) : !summary ? (
        <Card className="p-10 text-center text-sm text-slate-600">
          Could not load dashboard data from backend server.
        </Card>
      ) : (
        <>
          {/* ========================================================= */}
          {/* Top Statistics Cards (11 Cards Total)                     */}
          {/* Row 1: 6 Cards | Row 2: 5 Cards                           */}
          {/* ========================================================= */}
          <div className="space-y-3.5">
            {/* ROW 1: 6 EQUAL-WIDTH CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3.5">
              {/* 1. Today's Sales */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-600 text-white shadow-xs text-sm">
                    🛒
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Today's Sales
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {formatCurrency(summary.sales.today_sales)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                    ↑ Daily POS
                  </span>
                  <MiniBars color="bg-purple-600" />
                </div>
              </div>

              {/* 2. This Month */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-500 text-white shadow-xs text-sm">
                    👛
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    This Month
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {formatCurrency(summary.sales.this_month_sales)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium text-[10px]">Current 30 Days</span>
                  <MiniBars color="bg-teal-500" />
                </div>
              </div>

              {/* 3. Total Sales */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 text-white shadow-xs text-sm">
                    🪙
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Total Sales
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {formatCurrency(summary.sales.total_sales)}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium text-[10px]">Lifetime Revenue</span>
                  <MiniBars color="bg-blue-500" />
                </div>
              </div>

              {/* 4. Orders */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs text-sm">
                    📦
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Orders
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {summary.orders.total_orders}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium text-[10px]">
                    {summary.orders.pending_orders} pending
                  </span>
                  <MiniBars color="bg-amber-500" />
                </div>
              </div>

              {/* 5. Customers */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white shadow-xs text-sm">
                    👤
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Customers
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {summary.customers.total_customers}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-emerald-600 font-semibold text-[10px]">
                    +{summary.customers.new_customers_today} today
                  </span>
                  <MiniBars color="bg-sky-500" />
                </div>
              </div>

              {/* 6. Products */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs text-sm">
                    📦
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Products
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {summary.products.total_products}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium text-[10px]">Active SKUs</span>
                  <MiniBars color="bg-indigo-600" />
                </div>
              </div>
            </div>

            {/* ROW 2: 5 EQUAL-WIDTH CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {/* 7. Low Stock */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400 text-white shadow-xs text-sm">
                    ⚠️
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Low Stock
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {summary.products.low_stock_products}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium text-[10px]">Reorder alert</span>
                  <MiniBars color="bg-amber-400" />
                </div>
              </div>

              {/* 8. Out of Stock */}
              <div className="rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-400 text-white shadow-xs text-sm">
                    📋
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Out of Stock
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {summary.products.out_of_stock_products}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium text-[10px]">Zero inventory</span>
                  <MiniBars color="bg-rose-400" />
                </div>
              </div>

              {/* 9. Total Income */}
              <div className="relative rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-xs text-sm font-bold">
                    💲
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Total Income
                    </span>
                    <span className="text-xs font-bold text-emerald-600">↑</span>
                  </div>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {formatCurrency(summary.finance.total_income)}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-slate-400 font-medium text-[10px]">All recorded income</span>
                  <WaveSparkline color="emerald" isUp={true} />
                </div>
              </div>

              {/* 10. Total Expense */}
              <div className="relative rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-400 text-white shadow-xs text-sm">
                    🧾
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                      Total Expense
                    </span>
                    <span className="text-xs font-bold text-rose-500">↓</span>
                  </div>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-rose-600 tracking-tight">
                    {formatCurrency(summary.finance.total_expense)}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-slate-400 font-medium text-[10px]">All recorded expenses</span>
                  <WaveSparkline color="rose" isUp={false} />
                </div>
              </div>

              {/* 11. Net Profit */}
              <div className="relative rounded-2xl border border-slate-100 bg-white p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white shadow-xs text-sm">
                    📈
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    Net Profit
                  </span>
                </div>
                <div className="my-2.5">
                  <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {formatCurrency(summary.finance.net_profit)}
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <span className="text-slate-400 font-medium text-[10px]">Income − Expense</span>
                  <WaveSparkline color="sky" isUp={true} />
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* Middle Row: Sales Overview | Order Status | Quick Actions  */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Sales Overview (Dynamic Line / Area Flow Chart) */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Sales Overview</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-normal">
                    Total sales for the last {chartDays} days
                  </p>
                </div>

                {/* Period Selector */}
                <select
                  value={chartDays}
                  onChange={(e) => setChartDays(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={14}>Last 14 Days</option>
                  <option value={30}>Last 30 Days</option>
                </select>
              </div>

              {/* Dynamic SVG Flow Chart */}
              <div className="relative w-full h-[220px]">
                {/* Floating Tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute z-20 pointer-events-none rounded-lg bg-slate-900 text-white px-2.5 py-1.5 text-xs shadow-lg transition-transform"
                    style={{
                      left: `${(hoveredPoint.x / 560) * 100}%`,
                      top: `${Math.max(10, (hoveredPoint.y / 220) * 100 - 35)}%`,
                      transform: 'translate(-50%, -100%)',
                    }}
                  >
                    <div className="text-[10px] text-slate-300 font-medium">{hoveredPoint.dateLabel}</div>
                    <div className="font-bold text-white text-xs">{formatCurrency(hoveredPoint.amount)}</div>
                    <div className="text-[9px] text-slate-400">{hoveredPoint.count} orders</div>
                  </div>
                )}

                <svg
                  className="w-full h-full overflow-visible"
                  viewBox="0 0 560 220"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient id="purpleSalesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Gridlines & Y-Axis Labels */}
                  {yAxisTicks.map((tick, i) => {
                    const yPos = 20 + 162 - (tick / maxVal) * 162
                    return (
                      <g key={i}>
                        <line
                          x1="60"
                          y1={yPos}
                          x2="536"
                          y2={yPos}
                          stroke="#f1f5f9"
                          strokeDasharray={i === 0 ? '' : '3 3'}
                          strokeWidth="1"
                        />
                        <text
                          x="52"
                          y={yPos + 3.5}
                          textAnchor="end"
                          className="text-[10px] fill-slate-400 font-sans"
                        >
                          ₹ {tick >= 1000 ? `${Math.round(tick / 1000)}k` : tick}
                        </text>
                      </g>
                    )
                  })}

                  {/* Gradient Area Fill */}
                  {areaD && <path d={areaD} fill="url(#purpleSalesGradient)" />}

                  {/* Curved Spline Stroke */}
                  {pathD && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#8b5cf6"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  )}

                  {/* Data Points with hover interaction */}
                  {plottedPoints.map((pt, i) => (
                    <g key={i}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={hoveredPoint?.dateLabel === pt.label ? 6 : 4}
                        fill="#8b5cf6"
                        stroke="#ffffff"
                        strokeWidth="2.5"
                        className="transition-all cursor-pointer"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            x: pt.x,
                            y: pt.y,
                            dateLabel: pt.label,
                            amount: pt.amount,
                            count: pt.count,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                      {/* X-axis date labels */}
                      <text
                        x={pt.x}
                        y="206"
                        textAnchor="middle"
                        className="text-[10px] fill-slate-400 font-sans"
                      >
                        {pt.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* Order Status (Interactive Donut Chart) */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Order Status</h2>
              </div>

              {/* Donut and Legend */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 my-auto py-2">
                {/* SVG Donut */}
                <div className="relative w-36 h-36 flex-shrink-0">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 140 140">
                    {donutArcs.map((arc, i) => (
                      <circle
                        key={i}
                        cx="70"
                        cy="70"
                        r="55"
                        fill="none"
                        stroke={arc.color}
                        strokeWidth="22"
                        strokeDasharray={arc.strokeDasharray}
                        strokeDashoffset={arc.strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-500"
                      />
                    ))}
                  </svg>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-2xl font-black text-slate-900">
                      {orderBreakdown.total}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400">Total Orders</span>
                  </div>
                </div>

                {/* Legend list */}
                <div className="w-full sm:w-auto space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <span className="text-slate-600 font-medium text-[11px]">Pending</span>
                    </div>
                    <span className="font-bold text-slate-800 text-[11px]">
                      {orderBreakdown.pending}{' '}
                      <span className="text-slate-400 font-normal">({orderBreakdown.pendingPct}%)</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span className="text-slate-600 font-medium text-[11px]">Delivered</span>
                    </div>
                    <span className="font-bold text-slate-800 text-[11px]">
                      {orderBreakdown.delivered}{' '}
                      <span className="text-slate-400 font-normal">
                        ({orderBreakdown.deliveredPct}%)
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                      <span className="text-slate-600 font-medium text-[11px]">Processing</span>
                    </div>
                    <span className="font-bold text-slate-800 text-[11px]">
                      {orderBreakdown.processing}{' '}
                      <span className="text-slate-400 font-normal">
                        ({orderBreakdown.processingPct}%)
                      </span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      <span className="text-slate-600 font-medium text-[11px]">Cancelled</span>
                    </div>
                    <span className="font-bold text-slate-800 text-[11px]">
                      {orderBreakdown.cancelled}{' '}
                      <span className="text-slate-400 font-normal">
                        ({orderBreakdown.cancelledPct}%)
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions (5 Colored Action Buttons) */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3">Quick Actions</h2>
              </div>

              <div className="space-y-2.5 my-auto">
                {/* 1. Add New Product */}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.PRODUCT_NEW)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold text-xs shadow-xs hover:opacity-95 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">＋</span>
                  <span>Add New Product</span>
                </button>

                {/* 2. Manage Orders */}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.ORDERS)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-xs shadow-xs hover:opacity-95 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">🚚</span>
                  <span>Manage Orders</span>
                </button>

                {/* 3. View Reports */}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.REPORTS)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold text-xs shadow-xs hover:opacity-95 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">📊</span>
                  <span>View Reports</span>
                </button>

                {/* 4. Manage Customers */}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.CUSTOMERS)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-xs shadow-xs hover:opacity-95 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">👥</span>
                  <span>Manage Customers</span>
                </button>

                {/* 5. Update Inventory */}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.INVENTORY)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold text-xs shadow-xs hover:opacity-95 hover:shadow-md transition-all cursor-pointer"
                >
                  <span className="text-base leading-none">📦</span>
                  <span>Update Inventory</span>
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* Bottom Row: Popular Items | Top Categories | Recent Activity */}
          {/* ========================================================= */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Popular Items */}
            <div className="lg:col-span-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Popular Items</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Top performing catalog products ranked by order volume and sales
                  </p>
                </div>
                <Link
                  to={ROUTES.PRODUCTS}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
                >
                  View All
                </Link>
              </div>

              {/* 5 Top Selling Products Horizontal Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 my-3">
                {popularItems.slice(0, 5).map((item, idx) => {
                  const img = imageUrl(item.primary_image)
                  return (
                    <div
                      key={item.id}
                      onClick={() => navigate(ROUTES.PRODUCT_DETAIL(item.id))}
                      className="group relative rounded-xl border border-slate-100 bg-white p-2 text-center hover:border-purple-300 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between"
                    >
                      {/* Rank Badge */}
                      <span className="absolute top-1.5 left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white shadow-xs">
                        {idx + 1}
                      </span>

                      {/* Product Image / Icon */}
                      <div className="h-16 w-full flex items-center justify-center overflow-hidden rounded-lg bg-slate-50 mt-1 mb-1.5">
                        {img ? (
                          <img
                            src={img}
                            alt={item.name}
                            className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <span className="text-2xl select-none">
                            {getProductFallbackIcon(item.name)}
                          </span>
                        )}
                      </div>

                      {/* Product Name */}
                      <div className="font-bold text-xs text-slate-800 truncate" title={item.name}>
                        {item.name}
                      </div>

                      {/* Sold volume */}
                      <div className="text-[10px] text-slate-400 font-medium">
                        {item.units_sold} sold
                      </div>

                      {/* Price / revenue */}
                      <div className="text-[11px] font-bold text-slate-900 mt-1 flex items-center justify-center gap-0.5">
                        <span>{formatCurrency(item.revenue)}</span>
                        <span className="text-[10px] font-bold text-emerald-600">↑</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Promo Banner Card: Keep Your Store Always Fresh! */}
              <div className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white p-3 flex items-center justify-between mt-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🌱</span>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Keep Your Store Always Fresh!
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Better management. Higher sales.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.SALE)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 text-white text-xs hover:bg-purple-700 transition-colors shadow-2xs"
                >
                  ➔
                </button>
              </div>
            </div>

            {/* Top Categories */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Top Categories</h2>
                <Link
                  to={ROUTES.CATEGORIES}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
                >
                  View All
                </Link>
              </div>

              <div className="space-y-3.5 my-auto">
                {topCategoryList.map((cat) => (
                  <div key={cat.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{getCategoryIcon(cat.name)}</span>
                        <div>
                          <div className="font-bold text-slate-800 text-[11px]">{cat.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {cat.productCount} products
                          </div>
                        </div>
                      </div>
                      <span className="font-bold text-slate-700 text-xs">{cat.percent}%</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-500"
                        style={{ width: `${cat.barWidth}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base sm:text-lg font-bold text-slate-900">Recent Activity</h2>
                <Link
                  to={ROUTES.ORDERS}
                  className="text-xs font-bold text-purple-600 hover:text-purple-700 hover:underline"
                >
                  View All
                </Link>
              </div>

              <div className="space-y-3 my-auto">
                {activityList.map((act) => (
                  <div key={act.id} className="flex items-start gap-3">
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-2xs ${act.iconBg}`}
                    >
                      {act.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {act.title}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {act.time}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">{act.subtitle}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
