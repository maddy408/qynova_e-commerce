import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FiUser, FiAlertCircle, FiBox, FiArrowRight } from 'react-icons/fi'
import { api, getCustomerToken, isTokenExpired, clearCustomerSession } from '../../lib/api'
import { ROUTES } from '../../routes/routes'

export default function Orders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ALL')

  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      navigate(ROUTES.LOGIN, { replace: true })
      return
    }

    setIsLoading(true)
    setError(null)

    api
      .get('/customers/orders')
      .then((res) => {
        if (Array.isArray(res.data?.orders)) {
          setOrders(res.data.orders)
        } else {
          setOrders([])
        }
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          const currentToken = getCustomerToken()
          if (!currentToken || isTokenExpired(currentToken)) {
            clearCustomerSession()
            navigate(ROUTES.LOGIN)
            return
          }
        }
        setError(err.response?.data?.error || 'Failed to load order history from server')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [navigate])

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DELIVERED':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'Delivered',
        }
      case 'OUT_FOR_DELIVERY':
        return {
          bg: 'bg-cyan-50 text-cyan-800 border-cyan-200',
          dot: 'bg-cyan-500',
          label: 'Out for Delivery',
        }
      case 'SHIPPED':
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          dot: 'bg-blue-500',
          label: 'Shipped',
        }
      case 'PACKED':
        return {
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          dot: 'bg-purple-500',
          label: 'Packed',
        }
      case 'PROCESSING':
        return {
          bg: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          dot: 'bg-indigo-500',
          label: 'Processing',
        }
      case 'CONFIRMED':
        return {
          bg: 'bg-sky-50 text-sky-800 border-sky-200',
          dot: 'bg-sky-500',
          label: 'Confirmed',
        }
      case 'PENDING':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Pending',
        }
      case 'OUT_OF_STOCK':
        return {
          bg: 'bg-orange-50 text-orange-900 border-orange-300',
          dot: 'bg-orange-500',
          label: 'Out of Stock',
        }
      case 'CANCELLED':
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          dot: 'bg-rose-500',
          label: 'Cancelled',
        }
      default:
        return {
          bg: 'bg-gray-50 text-gray-800 border-gray-200',
          dot: 'bg-gray-400',
          label: (status || 'Unknown').replace(/_/g, ' '),
        }
    }
  }

  const getPaymentBadge = (paymentStatus) => {
    switch (paymentStatus) {
      case 'PAID':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200'
      case 'REFUNDED':
        return 'text-[var(--color-brand)] bg-[var(--color-bg-main)] border-[var(--color-border-subtle)]'
      case 'FAILED':
        return 'text-red-700 bg-red-50 border-red-200'
      default:
        return 'text-amber-700 bg-amber-50 border-amber-200'
    }
  }

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'ACTIVE') return !['DELIVERED', 'CANCELLED', 'OUT_OF_STOCK'].includes(order.status)
    return order.status === statusFilter
  })

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-main)] font-sans selection:bg-[var(--color-primary-tint)] selection:text-[var(--color-text-main)]">
      
      {/* Top Header */}
      <header className="bg-white border-b border-[var(--color-border-subtle)] sticky top-0 z-30 shadow-xs">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 min-h-16 flex items-center justify-between gap-4">
          <Link to={ROUTES.HOME} className="flex items-center gap-2.5 group shrink-0">
            <img 
              src="/logo.jpeg" 
              alt="Shop with Adams" 
              className="h-9 sm:h-10 w-auto object-contain rounded-lg group-hover:scale-105 transition-transform"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/images/logo2.jpeg'
              }}
            />
            <div className="hidden sm:block">
              <span className="text-base sm:text-lg font-black tracking-tight text-[var(--color-text-main)]">Shop with Adams</span>
              <p className="text-[8px] sm:text-[9px] font-bold tracking-wider text-[var(--color-text-muted)] uppercase">
                Customer Orders
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={ROUTES.PROFILE}
              className="text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] px-3 py-2 rounded-full hover:bg-[var(--color-bg-alt)] transition-colors flex items-center gap-1.5"
            >
              <FiUser className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">My Profile</span>
            </Link>
            <Link
              to={ROUTES.SHOP}
              className="text-xs font-bold text-white bg-[var(--color-brand)] hover:bg-[var(--color-brand)] px-4 py-2 rounded-full transition-colors shadow-xs"
            >
              Shop More
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-10">
        
        {/* Breadcrumb & Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)] mb-2">
            <Link to={ROUTES.HOME} className="hover:text-[var(--color-brand)]">Home</Link>
            <span>/</span>
            <Link to={ROUTES.PROFILE} className="hover:text-[var(--color-brand)]">Account</Link>
            <span>/</span>
            <span className="text-[var(--color-text-main)] font-bold">My Orders</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text-main)] tracking-tight">
                My Orders
              </h1>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
                Track your active shipments, view order details, and see past purchases.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'ACTIVE', label: 'In Progress' },
                { id: 'DELIVERED', label: 'Delivered' },
                { id: 'OUT_OF_STOCK', label: 'Out of Stock' },
                { id: 'CANCELLED', label: 'Cancelled' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === pill.id
                      ? 'bg-[var(--color-brand)] text-white shadow-xs'
                      : 'bg-white text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] hover:border-[var(--color-brand)]/50'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-[var(--color-text-muted)]">Loading your orders...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-center space-y-3 max-w-lg mx-auto">
            <FiAlertCircle className="w-10 h-10 text-red-500 mx-auto" />
            <p className="text-sm font-bold text-red-800">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && filteredOrders.length === 0 && (
          <div className="bg-white rounded-3xl p-8 sm:p-14 border border-[var(--color-border-subtle)] shadow-xs text-center max-w-md mx-auto space-y-4 my-8">
            <div className="w-20 h-20 rounded-3xl bg-[var(--color-bg-alt)] text-[var(--color-brand)] flex items-center justify-center mx-auto shadow-inner">
              <FiBox className="w-9 h-9" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-[var(--color-text-main)]">
                {statusFilter === 'ALL' ? 'No Orders Yet' : `No ${statusFilter.toLowerCase()} orders`}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {statusFilter === 'ALL'
                  ? 'You haven\'t placed any orders yet. Discover our vibrant collection and start shopping today!'
                  : 'There are no orders matching this filter.'}
              </p>
            </div>
            <div className="pt-2">
              <Link
                to={ROUTES.SHOP}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--color-brand)] text-white font-extrabold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
              >
                <span>Start Shopping</span>
                <FiArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* Orders List */}
        {!isLoading && !error && filteredOrders.length > 0 && (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const statusBadge = getStatusBadge(order.status)
              const paymentBadgeClass = getPaymentBadge(order.payment_status)

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs hover:border-[var(--color-brand)]/40 hover:shadow-md transition-all space-y-4"
                >
                  {/* Top Bar: Order ID, Date, Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="font-mono font-black text-sm sm:text-base text-[var(--color-text-main)]">
                        {order.order_no || `Order #${order.id}`}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        • {formatDate(order.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {/* Status Badge */}
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
                        <span>{statusBadge.label}</span>
                      </span>

                      {/* Payment Status Badge */}
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${paymentBadgeClass}`}>
                        {order.payment_status || 'PENDING'}
                      </span>
                    </div>
                  </div>

                  {/* Summary & Actions Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-[var(--color-text-muted)] block">Total Amount</span>
                      <p className="text-xl font-black text-[var(--color-brand)]">
                        ₹{Number(order.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Link
                        to={ROUTES.ORDER_DETAIL(order.id)}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--color-bg-alt)] hover:bg-[var(--color-primary-tint)] text-[var(--color-brand)] text-xs font-black transition-colors"
                      >
                        <span>View Details</span>
                        <span>→</span>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </main>
    </div>
  )
}
