import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getCustomerToken, clearCustomerSession } from '../../lib/api'

export default function Orders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('ALL')

  useEffect(() => {
    const token = getCustomerToken()
    if (!token) {
      clearCustomerSession()
      navigate('/login')
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
          clearCustomerSession()
          navigate('/login')
        } else {
          setError(err.response?.data?.error || 'Failed to load order history from server')
        }
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
      case 'SHIPPED':
      case 'OUT_FOR_DELIVERY':
        return {
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          dot: 'bg-blue-500',
          label: status === 'OUT_FOR_DELIVERY' ? 'Out for Delivery' : 'Shipped',
        }
      case 'PROCESSING':
      case 'PACKED':
      case 'CONFIRMED':
        return {
          bg: 'bg-purple-50 text-purple-800 border-purple-200',
          dot: 'bg-purple-500',
          label: status.charAt(0) + status.slice(1).toLowerCase(),
        }
      case 'PENDING':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Pending',
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
          label: status || 'Unknown',
        }
    }
  }

  const getPaymentBadge = (paymentStatus) => {
    switch (paymentStatus) {
      case 'PAID':
        return 'text-emerald-700 bg-emerald-50 border-emerald-200'
      case 'REFUNDED':
        return 'text-purple-700 bg-purple-50 border-purple-200'
      case 'FAILED':
        return 'text-red-700 bg-red-50 border-red-200'
      default:
        return 'text-amber-700 bg-amber-50 border-amber-200'
    }
  }

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'ALL') return true
    if (statusFilter === 'ACTIVE') return !['DELIVERED', 'CANCELLED'].includes(order.status)
    return order.status === statusFilter
  })

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#1E293B] font-sans selection:bg-purple-100 selection:text-purple-900">
      
      {/* Top Header */}
      <header className="bg-white border-b border-purple-100 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-700 via-purple-800 to-pink-600 flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#EC4899" stroke="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#4C1D95]">Kirana</span>
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#EC4899]">Bazaar</span>
              </div>
              <p className="text-[8px] sm:text-[9px] font-bold tracking-wider text-purple-900/60 uppercase">
                Accessories & Gifts
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/profile"
              className="text-xs font-bold text-gray-700 hover:text-purple-900 px-3 py-2 rounded-full hover:bg-purple-50 transition-colors flex items-center gap-1.5"
            >
              <span>👤</span>
              <span className="hidden sm:inline">My Profile</span>
            </Link>
            <Link
              to="/shop"
              className="text-xs font-bold text-white bg-[#6B21A8] hover:bg-[#581C87] px-4 py-2 rounded-full transition-colors shadow-xs"
            >
              Shop More
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        
        {/* Breadcrumb & Title */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 mb-2">
            <Link to="/" className="hover:text-purple-700">Home</Link>
            <span>/</span>
            <Link to="/profile" className="hover:text-purple-700">Account</Link>
            <span>/</span>
            <span className="text-purple-900 font-bold">My Orders</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-purple-950 tracking-tight">
                My Orders
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                Track your active shipments, view order details, and see past purchases.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'ACTIVE', label: 'In Progress' },
                { id: 'DELIVERED', label: 'Delivered' },
                { id: 'CANCELLED', label: 'Cancelled' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === pill.id
                      ? 'bg-purple-900 text-white shadow-xs'
                      : 'bg-white text-gray-600 border border-purple-100 hover:border-purple-300'
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
            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-gray-500">Loading your orders...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-center space-y-3 max-w-lg mx-auto">
            <span className="text-3xl">⚠️</span>
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
          <div className="bg-white rounded-3xl p-8 sm:p-14 border border-purple-100 shadow-xs text-center max-w-md mx-auto space-y-4 my-8">
            <div className="w-20 h-20 rounded-3xl bg-purple-50 text-purple-700 flex items-center justify-center text-4xl mx-auto shadow-inner">
              📦
            </div>
            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-purple-950">
                {statusFilter === 'ALL' ? 'No Orders Yet' : `No ${statusFilter.toLowerCase()} orders`}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {statusFilter === 'ALL'
                  ? 'You haven\'t placed any orders yet. Discover our vibrant collection and start shopping today!'
                  : 'There are no orders matching this filter.'}
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-[#6B21A8] to-[#EC4899] text-white font-extrabold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
              >
                <span>Start Shopping</span>
                <span>→</span>
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
                  className="bg-white rounded-3xl p-5 sm:p-6 border border-purple-100/80 shadow-xs hover:border-purple-200 hover:shadow-md transition-all space-y-4"
                >
                  {/* Top Bar: Order ID, Date, Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="font-mono font-black text-sm sm:text-base text-purple-950">
                        {order.order_no || `Order #${order.id}`}
                      </span>
                      <span className="text-[11px] text-gray-400">
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
                      <span className="text-[11px] font-semibold text-gray-400 block">Total Amount</span>
                      <p className="text-xl font-black text-purple-950">
                        ₹{Number(order.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Link
                        to={`/orders/${order.id}`}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-black transition-colors"
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
