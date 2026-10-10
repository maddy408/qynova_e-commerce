import React, { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api, getCustomerToken, clearCustomerSession } from '../../lib/api'

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [delivery, setDelivery] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Cancellation modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  const fetchOrderDetails = () => {
    const token = getCustomerToken()
    if (!token) {
      clearCustomerSession()
      navigate('/login')
      return
    }

    setIsLoading(true)
    setError(null)

    api
      .get(`/orders/${id}`)
      .then((res) => {
        if (res.data?.order) {
          setOrder(res.data.order)
          // Also fetch delivery tracking info
          api
            .get(`/orders/${id}/delivery`)
            .then((dRes) => {
              if (dRes.data?.delivery) {
                setDelivery(dRes.data.delivery)
              }
            })
            .catch(() => {})
        } else {
          setError('Order details could not be found')
        }
      })
      .catch((err) => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          clearCustomerSession()
          navigate('/login')
        } else {
          setError(err.response?.data?.error || 'Order not found')
        }
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  useEffect(() => {
    fetchOrderDetails()
  }, [id, navigate])

  const handleCancelOrder = async (e) => {
    e.preventDefault()
    if (!cancelReason.trim()) {
      setCancelError('Please provide a reason for cancellation')
      return
    }

    setIsCancelling(true)
    setCancelError('')

    try {
      const res = await api.post(`/orders/${id}/cancel`, {
        reason: cancelReason.trim(),
      })
      if (res.data?.order) {
        setOrder(res.data.order)
        setIsCancelModalOpen(false)
        setCancelReason('')
      } else {
        throw new Error('Cancellation failed')
      }
    } catch (err) {
      setCancelError(err.response?.data?.error || err.message || 'Failed to cancel order')
    } finally {
      setIsCancelling(false)
    }
  }

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

  const canCancel = order && ['PENDING', 'CONFIRMED'].includes(order.status)

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
          label: 'Pending Confirmation',
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

  return (
    <div className="min-h-screen bg-[#FAF8FF] text-[#27213A] font-sans selection:bg-[#EDE5FF] selection:text-[#27213A]">
      
      {/* Top Header */}
      <header className="bg-white border-b border-[#E8E0F5] sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#7042D2] flex items-center justify-center shadow-md text-white group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="8" cy="21" r="1" />
                <circle cx="19" cy="21" r="1" />
                <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
                <path d="M12 5c.5-2 2-3 4-3-1 2-1 3-4 3z" fill="#EDE5FF" stroke="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-baseline leading-none">
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#27213A]">Qynova</span>
                <span className="text-lg sm:text-xl font-black tracking-tight text-[#8B5CF6]">.</span>
              </div>
              <p className="text-[8px] sm:text-[9px] font-bold tracking-wider text-[#716A82] uppercase">
                Order Details
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/orders"
              className="text-xs font-bold text-[#716A82] hover:text-[#27213A] px-3 py-2 rounded-full hover:bg-[#F5F0FF] transition-colors flex items-center gap-1.5"
            >
              <span>←</span>
              <span>All Orders</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-[#716A82] mb-4">
          <Link to="/" className="hover:text-[#8B5CF6]">Home</Link>
          <span>/</span>
          <Link to="/orders" className="hover:text-[#8B5CF6]">My Orders</Link>
          <span>/</span>
          <span className="text-[#27213A] font-bold">{order?.order_no || `Order #${id}`}</span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-gray-500">Loading order details...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-8 bg-red-50 border border-red-200 rounded-3xl text-center space-y-4 max-w-md mx-auto my-8">
            <span className="text-4xl">⚠️</span>
            <h3 className="text-lg font-black text-red-950">Could Not Load Order</h3>
            <p className="text-xs font-medium text-red-700">{error}</p>
            <Link
              to="/orders"
              className="inline-block px-6 py-2.5 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
            >
              Back to My Orders
            </Link>
          </div>
        )}

        {/* Order Details View */}
        {!isLoading && !error && order && (
          <div className="space-y-6">
            
            {/* Top Bar Card */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[#E8E0F5] shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-xl sm:text-2xl font-black text-[#27213A] font-mono">
                      {order.order_no || `Order #${order.id}`}
                    </h1>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusBadge(order.status).bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusBadge(order.status).dot}`} />
                      <span>{getStatusBadge(order.status).label}</span>
                    </span>
                  </div>
                  <p className="text-xs text-[#716A82]">
                    Placed on {formatDate(order.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => setIsCancelModalOpen(true)}
                      className="px-4 py-2 rounded-full border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Cancel Order
                    </button>
                  )}
                  <Link
                    to="/shop"
                    className="px-5 py-2 rounded-full bg-[#F5F0FF] text-[#7042D2] hover:bg-[#EDE5FF] text-xs font-bold transition-colors"
                  >
                    Buy Again
                  </Link>
                </div>
              </div>

              {/* Status Banner / Timeline Notice */}
              {order.status === 'CANCELLED' ? (
                <div className="p-4 bg-rose-50/80 border border-rose-200 rounded-2xl flex items-start gap-3">
                  <span className="text-lg">ℹ️</span>
                  <div className="text-xs">
                    <p className="font-bold text-rose-900">This order has been cancelled.</p>
                    {order.cancellation_reason && (
                      <p className="text-rose-700 mt-0.5">Reason: {order.cancellation_reason}</p>
                    )}
                    {order.cancelled_at && (
                      <p className="text-rose-600/80 text-[11px] mt-0.5">Cancelled at: {formatDate(order.cancelled_at)}</p>
                    )}
                  </div>
                </div>
              ) : (
                /* Delivery / Tracking Status Pill */
                <div className="p-4 bg-[#F5F0FF] border border-[#E8E0F5] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#EDE5FF] text-[#7042D2] flex items-center justify-center text-lg">
                      🚚
                    </div>
                    <div>
                      <p className="text-xs font-black text-[#27213A]">
                        {delivery?.courier_name ? `Shipment by ${delivery.courier_name}` : 'Order In Progress'}
                      </p>
                      <p className="text-[11px] text-[#716A82]">
                        {delivery?.tracking_number
                          ? `Tracking AWB: ${delivery.tracking_number} (${delivery.status || 'SHIPPED'})`
                          : `Status: ${getStatusBadge(order.status).label}`}
                      </p>
                    </div>
                  </div>

                  {delivery?.tracking_url && (
                    <a
                      href={delivery.tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#8B5CF6] text-white text-xs font-bold hover:bg-[#7042D2] transition-colors self-start sm:self-auto"
                    >
                      <span>Track Shipment</span>
                      <span>↗</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Grid Layout: Items & Order Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT: Items List (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Items Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[#E8E0F5] shadow-xs space-y-4">
                  <h2 className="text-sm font-black text-[#27213A] uppercase tracking-wider flex items-center gap-2">
                    <span>Items Ordered</span>
                    <span className="text-xs font-bold text-[#716A82]">({order.items?.length || 0})</span>
                  </h2>

                  <div className="divide-y divide-gray-100">
                    {order.items?.map((item) => (
                      <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-[#27213A] leading-snug">
                            {item.product_name_snapshot}
                          </p>
                          {item.variant_label_snapshot && (
                            <p className="text-xs font-medium text-[#7042D2] bg-[#F5F0FF] px-2 py-0.5 rounded-md inline-block">
                              {item.variant_label_snapshot}
                            </p>
                          )}
                          <p className="text-[11px] text-[#716A82]">
                            SKU: {item.sku_snapshot} • Qty: {item.quantity}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-[#8B5CF6]">
                            ₹{Number(item.line_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                          {Number(item.mrp) > Number(item.unit_price) && (
                            <p className="text-[11px] text-gray-400 line-through">
                              ₹{(Number(item.mrp) * Number(item.quantity)).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status History Timeline Card */}
                {Array.isArray(order.status_history) && order.status_history.length > 0 && (
                  <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[#E8E0F5] shadow-xs space-y-4">
                    <h2 className="text-sm font-black text-[#27213A] uppercase tracking-wider">
                      Status Updates
                    </h2>
                    <div className="relative pl-6 space-y-5 border-l-2 border-[#E8E0F5]">
                      {order.status_history.map((hist, idx) => (
                        <div key={hist.id || idx} className="relative">
                          <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-[#8B5CF6] border-2 border-white shadow-xs" />
                          <div className="text-xs">
                            <span className="font-bold text-[#27213A]">
                              {hist.to_status}
                            </span>
                            {hist.note && (
                              <p className="text-[#716A82] mt-0.5">{hist.note}</p>
                            )}
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {formatDate(hist.created_at)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* RIGHT: Address & Totals Summary (4 cols) */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Shipping Address */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E8E0F5] shadow-xs space-y-3">
                  <h3 className="text-xs font-black text-[#27213A] uppercase tracking-wider flex items-center gap-1.5">
                    <span>📍 Delivery Address</span>
                  </h3>
                  <div className="text-xs text-[#716A82] space-y-1">
                    <p className="font-bold text-[#27213A] text-sm">{order.shipping_name}</p>
                    <p>{order.shipping_line1}</p>
                    {order.shipping_line2 && <p>{order.shipping_line2}</p>}
                    <p>{order.shipping_city_district}, {order.shipping_state} - {order.shipping_pincode}</p>
                    <p className="text-[#716A82] pt-1">Phone: +91 {order.shipping_phone}</p>
                  </div>
                </div>

                {/* Price Breakdown Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E8E0F5] shadow-xs space-y-3.5">
                  <h3 className="text-xs font-black text-[#27213A] uppercase tracking-wider">
                    Payment Breakdown
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-[#716A82]">
                      <span>Items Subtotal</span>
                      <span className="font-semibold text-[#27213A]">₹{Number(order.subtotal).toFixed(2)}</span>
                    </div>

                    {Number(order.product_discount_total) > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Product Discount</span>
                        <span className="font-semibold">-₹{Number(order.product_discount_total).toFixed(2)}</span>
                      </div>
                    )}

                    {Number(order.coupon_discount_total) > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Coupon Discount {order.coupon_code ? `(${order.coupon_code})` : ''}</span>
                        <span className="font-semibold">-₹{Number(order.coupon_discount_total).toFixed(2)}</span>
                      </div>
                    )}

                    {Number(order.referral_discount_total) > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Referral Reward</span>
                        <span className="font-semibold">-₹{Number(order.referral_discount_total).toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-[#716A82]">
                      <span>Delivery Fee</span>
                      <span className="font-semibold text-[#27213A]">
                        {Number(order.shipping_total) === 0 ? (
                          <span className="text-emerald-700 font-bold uppercase text-[10px]">Free</span>
                        ) : (
                          `₹${Number(order.shipping_total).toFixed(2)}`
                        )}
                      </span>
                    </div>

                    {Number(order.tax_total) > 0 && (
                      <div className="flex justify-between text-[#716A82]">
                        <span>Taxes (GST)</span>
                        <span className="font-semibold text-[#27213A]">₹{Number(order.tax_total).toFixed(2)}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-[#E8E0F5] flex justify-between items-center text-sm">
                      <span className="font-black text-[#27213A]">Grand Total</span>
                      <span className="font-black text-[#8B5CF6] text-base">
                        ₹{Number(order.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="pt-2 flex justify-between items-center text-[11px] text-[#716A82]">
                      <span>Payment Status</span>
                      <span className="font-bold text-[#27213A] uppercase">
                        {order.payment_status}
                      </span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

      </main>

      {/* Cancellation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[#E8E0F5]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#27213A]">
                Cancel Order #{order?.order_no || id}
              </h3>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to cancel this order? Stock reservations and applied discounts will be released.
            </p>

            {cancelError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
                ⚠️ {cancelError}
              </div>
            )}

            <form onSubmit={handleCancelOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Ordered by mistake, found another deal, changing delivery address..."
                  rows={3}
                  className="w-full p-3 border border-[#E8E0F5] rounded-xl text-xs text-[#27213A] focus:outline-none focus:border-[#8B5CF6]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCancelModalOpen(false)}
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
