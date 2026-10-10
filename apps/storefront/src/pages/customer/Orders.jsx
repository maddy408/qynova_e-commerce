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
          bg: 'bg-[#F8F3F6] text-[#601D49] border-[#E8E0E5]',
          dot: 'bg-[#601D49]',
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
        return 'text-[#601D49] bg-[#F8F3F6] border-[#E8E0E5]'
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
    <div className="min-h-screen bg-[#F8F3F6] text-[#2D252B] font-sans selection:bg-[#F2DDE9] selection:text-[#2D252B]">
      
      {/* Top Header */}
      <header className="bg-white border-b border-[#E8E0E5] sticky top-0 z-30 shadow-xs">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 min-h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#601D49] flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#F2DDE9" stroke="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#2D252B]">Qynova</span>
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#601D49]">.</span>
              </div>
              <p className="text-[8px] sm:text-[9px] font-bold tracking-wider text-[#6B5E68] uppercase">
                Customer Orders
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/profile"
              className="text-xs font-bold text-[#6B5E68] hover:text-[#2D252B] px-3 py-2 rounded-full hover:bg-[#F7F5F7] transition-colors flex items-center gap-1.5"
            >
              <span>👤</span>
              <span className="hidden sm:inline">My Profile</span>
            </Link>
            <Link
              to="/shop"
              className="text-xs font-bold text-white bg-[#601D49] hover:bg-[#601D49] px-4 py-2 rounded-full transition-colors shadow-xs"
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
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6B5E68] mb-2">
            <Link to="/" className="hover:text-[#601D49]">Home</Link>
            <span>/</span>
            <Link to="/profile" className="hover:text-[#601D49]">Account</Link>
            <span>/</span>
            <span className="text-[#2D252B] font-bold">My Orders</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#2D252B] tracking-tight">
                My Orders
              </h1>
              <p className="text-xs sm:text-sm text-[#6B5E68] mt-1">
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
                      ? 'bg-[#601D49] text-white shadow-xs'
                      : 'bg-white text-[#6B5E68] border border-[#E8E0E5] hover:border-[#601D49]/50'
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
            <div className="w-10 h-10 border-4 border-[#601D49] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-[#6B5E68]">Loading your orders...</p>
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
          <div className="bg-white rounded-3xl p-8 sm:p-14 border border-[#E8E0E5] shadow-xs text-center max-w-md mx-auto space-y-4 my-8">
            <div className="w-20 h-20 rounded-3xl bg-[#F7F5F7] text-[#601D49] flex items-center justify-center text-4xl mx-auto shadow-inner">
              📦
            </div>
            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-[#2D252B]">
                {statusFilter === 'ALL' ? 'No Orders Yet' : `No ${statusFilter.toLowerCase()} orders`}
              </h3>
              <p className="text-xs text-[#6B5E68] leading-relaxed">
                {statusFilter === 'ALL'
                  ? 'You haven\'t placed any orders yet. Discover our vibrant collection and start shopping today!'
                  : 'There are no orders matching this filter.'}
              </p>
            </div>
            <div className="pt-2">
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#601D49] text-white font-extrabold text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
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
                  className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E8E0E5] shadow-xs hover:border-[#601D49]/40 hover:shadow-md transition-all space-y-4"
                >
                  {/* Top Bar: Order ID, Date, Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="font-mono font-black text-sm sm:text-base text-[#2D252B]">
                        {order.order_no || `Order #${order.id}`}
                      </span>
                      <span className="text-[11px] text-[#6B5E68]">
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
                      <span className="text-[11px] font-semibold text-[#6B5E68] block">Total Amount</span>
                      <p className="text-xl font-black text-[#601D49]">
                        ₹{Number(order.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Link
                        to={`/orders/${order.id}`}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#F7F5F7] hover:bg-[#F2DDE9] text-[#601D49] text-xs font-black transition-colors"
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
