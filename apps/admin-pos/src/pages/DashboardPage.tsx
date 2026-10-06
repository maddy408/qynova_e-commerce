import { useEffect, useState } from 'react'
import { Card, PageHeader, Spinner } from '../components/ui'
import { api } from '../lib/api'

interface DashboardSummary {
  sales: { total_sales: string; today_sales: string; this_month_sales: string }
  orders: { total_orders: number; pending_orders: string; cancelled_orders: string }
  customers: { total_customers: number; new_customers_today: string }
  products: { total_products: number; low_stock_products: number; out_of_stock_products: number }
}

function formatCurrency(value: string | number) {
  return `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  )
}

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get('/dashboard/summary')
      .then((res) => setSummary(res.data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <PageHeader title="Dashboard" description="Store performance at a glance" />
      {loading ? (
        <Spinner />
      ) : !summary ? (
        <p className="text-sm text-slate-500">Could not load dashboard data.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Today's Sales" value={formatCurrency(summary.sales.today_sales)} />
          <StatCard label="This Month" value={formatCurrency(summary.sales.this_month_sales)} />
          <StatCard label="Total Sales" value={formatCurrency(summary.sales.total_sales)} />
          <StatCard label="Total Orders" value={String(summary.orders.total_orders)} hint={`${summary.orders.pending_orders} pending`} />
          <StatCard label="Total Customers" value={String(summary.customers.total_customers)} hint={`+${summary.customers.new_customers_today} today`} />
          <StatCard label="Total Products" value={String(summary.products.total_products)} />
          <StatCard label="Low Stock" value={String(summary.products.low_stock_products)} />
          <StatCard label="Out of Stock" value={String(summary.products.out_of_stock_products)} />
        </div>
      )}
    </div>
  )
}
