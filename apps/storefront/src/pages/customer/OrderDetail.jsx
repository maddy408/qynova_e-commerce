import React, { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { 
  FiAlertCircle, 
  FiAlertTriangle,
  FiInfo, 
  FiTruck, 
  FiExternalLink, 
  FiMapPin, 
  FiX, 
  FiCheck, 
  FiPackage, 
  FiClock, 
  FiShoppingBag,
  FiNavigation,
  FiRotateCcw
} from 'react-icons/fi'
import { api, getCustomerToken, isTokenExpired, clearCustomerSession } from '../../lib/api'
import { ROUTES } from '../../routes/routes'

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [delivery, setDelivery] = useState(null)
  const [returnData, setReturnData] = useState(null)
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
      navigate(ROUTES.LOGIN, { replace: true })
      return
    }

    setIsLoading(true)
    setError(null)

    api
      .get(ROUTES.ORDER_DETAIL(id))
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

              // Also fetch return tracking info
              api
                .get(`/orders/${id}/return`)
                .then((rRes) => {
                  if (rRes.data?.return) {
                    setReturnData(rRes.data.return)
                  }
                })
                .catch(() => {})
        } else {
          setError('Order details could not be found')
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
        setError(err.response?.data?.error || 'Order not found')
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
          label: 'Order Confirmed',
        }
      case 'PENDING':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Pending Confirmation',
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

  // Tracking Progress calculation
  const getStepProgress = (currentStatus) => {
    const statusMap = {
      PENDING: 1,
      CONFIRMED: 1,
      PROCESSING: 2,
      PACKED: 2,
      SHIPPED: 3,
      OUT_FOR_DELIVERY: 4,
      DELIVERED: 5,
    }
    return statusMap[currentStatus] || 1
  }

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
                Order Tracking
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={ROUTES.ORDERS}
              className="text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] px-3 py-2 rounded-full hover:bg-[var(--color-bg-alt)] transition-colors flex items-center gap-1.5"
            >
              <span>←</span>
              <span>All Orders</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-10">
        
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)] mb-4">
          <Link to={ROUTES.HOME} className="hover:text-[var(--color-brand)]">Home</Link>
          <span>/</span>
          <Link to={ROUTES.ORDERS} className="hover:text-[var(--color-brand)]">My Orders</Link>
          <span>/</span>
          <span className="text-[var(--color-text-main)] font-bold">{order?.order_no || `Order #${id}`}</span>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-4 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-bold text-gray-500">Loading order details...</p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-8 bg-red-50 border border-red-200 rounded-3xl text-center space-y-4 max-w-md mx-auto my-8">
            <FiAlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h3 className="text-lg font-black text-red-950">Could Not Load Order</h3>
            <p className="text-xs font-medium text-red-700">{error}</p>
            <Link
              to={ROUTES.ORDERS}
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
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text-main)] font-mono">
                      {order.order_no || `Order #${order.id}`}
                    </h1>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${getStatusBadge(order.status).bg}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusBadge(order.status).dot}`} />
                      <span>{getStatusBadge(order.status).label}</span>
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
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
                    to={ROUTES.SHOP}
                    className="px-5 py-2 rounded-full bg-[var(--color-bg-alt)] text-[var(--color-brand)] hover:bg-[var(--color-primary-tint)] text-xs font-bold transition-colors"
                  >
                    Buy Again
                  </Link>
                </div>
              </div>

              {/* Status Alerts */}
              {order.status === 'CANCELLED' && (
                <div className="p-4 sm:p-5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3.5 shadow-xs">
                  <FiAlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-rose-900 text-sm">Order Cancelled</p>
                    {order.cancellation_reason ? (
                      <p className="text-rose-700 mt-1">Reason: <span className="font-semibold">{order.cancellation_reason}</span></p>
                    ) : (
                      <p className="text-rose-700 mt-1">This order has been cancelled.</p>
                    )}
                    {order.cancelled_at && (
                      <p className="text-rose-500 text-[11px] mt-1">Cancelled on: {formatDate(order.cancelled_at)}</p>
                    )}
                  </div>
                </div>
              )}

              {order.status === 'OUT_OF_STOCK' && (
                <div className="p-4 sm:p-5 bg-orange-50 border border-orange-300 rounded-2xl flex items-start gap-3.5 shadow-xs">
                  <FiAlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-bold text-orange-950 text-sm">Action Notice: Item(s) Out of Stock</p>
                    <p className="text-orange-800 mt-1 leading-relaxed">
                      One or more products in this order are currently out of stock. Our team will contact you directly on your phone number (+91 {order.shipping_phone}) to provide a fast alternative or process a refund.
                    </p>
                  </div>
                </div>
              )}

              {/* Visual Order Tracking Stepper */}
              {order.status !== 'CANCELLED' && (
                <div className="p-5 sm:p-6 bg-white border border-[var(--color-border-subtle)] rounded-2xl shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-main)]">
                        Shipment &amp; Delivery Progress
                      </h3>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        Current Status: <span className="font-bold text-[var(--color-brand)]">{getStatusBadge(order.status).label}</span>
                      </p>
                    </div>
                    {delivery?.tracking_url && (
                      <a
                        href={delivery.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--color-brand)] text-white text-xs font-bold hover:opacity-90 transition-opacity self-start sm:self-auto shadow-xs"
                      >
                        <span>Live Tracking</span>
                        <FiExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="relative pt-2 pb-1">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-2">
                      {[
                        { step: 1, label: 'Order Placed', desc: 'Placed & Confirmed', icon: FiShoppingBag },
                        { step: 2, label: 'Order Packed', desc: 'Ready in warehouse', icon: FiPackage },
                        { step: 3, label: 'Shipped', desc: delivery?.courier_name ? `Via ${delivery.courier_name}` : 'Dispatched', icon: FiTruck },
                        { step: 4, label: 'Out for Delivery', desc: 'Courier agent en route', icon: FiNavigation },
                        { step: 5, label: 'Delivered', desc: 'Package received', icon: FiCheck },
                      ].map((s, idx, arr) => {
                        const Icon = s.icon
                        const currentStep = getStepProgress(order.status)
                        const isDone = currentStep > s.step || (currentStep === 5 && s.step === 5)
                        const isCurrent = currentStep === s.step && order.status !== 'OUT_OF_STOCK'

                        return (
                          <div key={s.step} className="relative flex md:flex-col items-center md:text-center gap-3 md:gap-2">
                            {/* Connector line for desktop */}
                            {idx < arr.length - 1 && (
                              <div
                                className={`hidden md:block absolute top-4.5 left-1/2 w-full h-1 -z-0 transition-colors ${
                                  currentStep > s.step ? 'bg-emerald-500' : 'bg-gray-200'
                                }`}
                              />
                            )}

                            {/* Step Icon Node */}
                            <div
                              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                                isDone
                                  ? 'bg-emerald-500 text-white shadow-sm ring-4 ring-emerald-50'
                                  : isCurrent
                                  ? 'bg-[var(--color-brand)] text-white shadow-md ring-4 ring-[var(--color-primary-tint)] animate-pulse'
                                  : 'bg-gray-100 text-gray-400 border border-gray-200'
                              }`}
                            >
                              {isDone ? <FiCheck className="w-5 h-5 stroke-[3]" /> : <Icon className="w-4.5 h-4.5" />}
                            </div>

                            {/* Step Text Info */}
                            <div className="min-w-0">
                              <p className={`text-xs font-bold leading-tight ${
                                isDone ? 'text-emerald-900' : isCurrent ? 'text-[var(--color-brand)] font-extrabold' : 'text-gray-400'
                              }`}>
                                {s.label}
                              </p>
                              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5 leading-tight">
                                {s.desc}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Courier / AWB details bar if present */}
                  {delivery && (delivery.courier_name || delivery.tracking_number) && (
                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-gray-50/70 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <FiTruck className="w-4 h-4 text-[var(--color-brand)]" />
                        <span className="text-[var(--color-text-muted)]">Courier Partner:</span>
                        <span className="font-bold text-[var(--color-text-main)]">{delivery.courier_name || 'Standard Courier'}</span>
                      </div>
                      {delivery.tracking_number && (
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--color-text-muted)]">Tracking AWB:</span>
                          <span className="font-mono font-bold text-[var(--color-brand)] bg-white px-2 py-0.5 rounded border border-gray-200">
                            {delivery.tracking_number}
                          </span>
                        </div>
                      )}
                      {delivery.expected_delivery_date && (
                        <div className="text-[11px] text-[var(--color-text-muted)]">
                          Estimated Delivery: <span className="font-bold text-[var(--color-text-main)]">{formatDate(delivery.expected_delivery_date)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Return / RMA Status Card & Event Timeline */}
              {returnData && (
                <div className="p-4 bg-purple-50/60 border border-purple-200/80 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg shrink-0">
                        <FiRotateCcw className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-black text-purple-950">
                            Return Request {returnData.return_no}
                          </p>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                            {returnData.status.replace(/_/g, ' ')}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${returnData.return_type === 'REPLACEMENT' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                            {returnData.return_type}
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-700/80 mt-0.5">
                          Reason: {returnData.reason} {returnData.refund_status && returnData.refund_status !== 'NOT_APPLICABLE' && `• Refund: ${returnData.refund_status}`}
                          {returnData.pickup_tracking_id && ` • Pickup AWB: ${returnData.pickup_tracking_id}`}
                        </p>
                      </div>
                    </div>

                    {returnData.pickup_tracking_url && (
                      <a
                        href={returnData.pickup_tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-purple-700 text-white text-xs font-bold hover:bg-purple-800 transition-colors self-start sm:self-auto shrink-0"
                      >
                        <span>Track Return</span>
                        <FiExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {/* Return Status History Timeline */}
                  {returnData.history && returnData.history.length > 0 && (
                    <div className="pt-2 border-t border-purple-200/60">
                      <p className="text-[10px] font-black uppercase tracking-wider text-purple-900 mb-2">
                        Return Progress
                      </p>
                      <div className="relative pl-5 space-y-3 before:absolute before:left-1.5 before:top-1.5 before:bottom-1.5 before:w-0.5 before:bg-purple-200">
                        {returnData.history.map((h, hIdx) => (
                          <div key={h.id || hIdx} className="relative text-xs">
                            <span className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ring-3 ring-white ${hIdx === returnData.history.length - 1 ? 'bg-purple-700 ring-purple-200' : 'bg-purple-300'}`} />
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <span className="font-bold text-purple-950">
                                {h.to_status ? h.to_status.replace(/_/g, ' ') : 'Updated'}
                              </span>
                              <span className="text-[10px] text-purple-600 font-medium">
                                {new Date(h.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            </div>
                            {h.note && (
                              <p className="text-[11px] text-purple-800 mt-0.5">{h.note}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Grid Layout: Items & Order Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT: Items List (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Items Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
                  <h2 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-2">
                    <span>Items Ordered</span>
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">({order.items?.length || 0})</span>
                  </h2>

                  <div className="divide-y divide-gray-100">
                    {order.items?.map((item) => (
                      <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-[var(--color-text-main)] leading-snug">
                            {item.product_name_snapshot}
                          </p>
                          {item.variant_label_snapshot && (
                            <p className="text-xs font-medium text-[var(--color-brand)] bg-[var(--color-bg-alt)] px-2 py-0.5 rounded-md inline-block">
                              {item.variant_label_snapshot}
                            </p>
                          )}
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            SKU: {item.sku_snapshot} • Qty: {item.quantity}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-[var(--color-brand)]">
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
                  <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[var(--color-border-subtle)] shadow-xs space-y-4">
                    <h2 className="text-sm font-black text-[var(--color-text-main)] uppercase tracking-wider">
                      Status Updates
                    </h2>
                    <div className="relative pl-6 space-y-5 border-l-2 border-[var(--color-border-subtle)]">
                      {order.status_history.map((hist, idx) => (
                        <div key={hist.id || idx} className="relative">
                          <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-[var(--color-brand)] border-2 border-white shadow-xs" />
                          <div className="text-xs">
                            <span className="font-bold text-[var(--color-text-main)]">
                              {hist.to_status}
                            </span>
                            {hist.note && (
                              <p className="text-[var(--color-text-muted)] mt-0.5">{hist.note}</p>
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
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs space-y-3">
                  <h3 className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider flex items-center gap-1.5">
                    <FiMapPin className="w-3.5 h-3.5 text-[var(--color-brand)]" />
                    <span>Delivery Address</span>
                  </h3>
                  <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                    <p className="font-bold text-[var(--color-text-main)] text-sm">{order.shipping_name}</p>
                    <p>{order.shipping_line1}</p>
                    {order.shipping_line2 && <p>{order.shipping_line2}</p>}
                    <p>{order.shipping_city_district}, {order.shipping_state} - {order.shipping_pincode}</p>
                    <p className="text-[var(--color-text-muted)] pt-1">Phone: +91 {order.shipping_phone}</p>
                  </div>
                </div>

                {/* Price Breakdown Card */}
                <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[var(--color-border-subtle)] shadow-xs space-y-3.5">
                  <h3 className="text-xs font-black text-[var(--color-text-main)] uppercase tracking-wider">
                    Payment Breakdown
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-[var(--color-text-muted)]">
                      <span>Items Subtotal</span>
                      <span className="font-semibold text-[var(--color-text-main)]">₹{Number(order.subtotal).toFixed(2)}</span>
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

                    <div className="flex justify-between text-[var(--color-text-muted)]">
                      <span>Delivery Fee</span>
                      <span className="font-semibold text-[var(--color-text-main)]">
                        {Number(order.shipping_total) === 0 ? (
                          <span className="text-emerald-700 font-bold uppercase text-[10px]">Free</span>
                        ) : (
                          `₹${Number(order.shipping_total).toFixed(2)}`
                        )}
                      </span>
                    </div>

                    {Number(order.tax_total) > 0 && (
                      <div className="flex justify-between text-[var(--color-text-muted)]">
                        <span>Taxes (GST)</span>
                        <span className="font-semibold text-[var(--color-text-main)]">₹{Number(order.tax_total).toFixed(2)}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-[var(--color-border-subtle)] flex justify-between items-center text-sm">
                      <span className="font-black text-[var(--color-text-main)]">Grand Total</span>
                      <span className="font-black text-[var(--color-brand)] text-base">
                        ₹{Number(order.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="pt-2 flex justify-between items-center text-[11px] text-[var(--color-text-muted)]">
                      <span>Payment Status</span>
                      <span className="font-bold text-[var(--color-text-main)] uppercase">
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
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-[var(--color-border-subtle)]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[var(--color-text-main)]">
                Cancel Order #{order?.order_no || id}
              </h3>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to cancel this order? Stock reservations and applied discounts will be released.
            </p>

            {cancelError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-center gap-1.5">
                <FiAlertCircle className="w-4 h-4 shrink-0" />
                <span>{cancelError}</span>
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
                  className="w-full p-3 border border-[var(--color-border-subtle)] rounded-xl text-xs text-[var(--color-text-main)] focus:outline-none focus:border-[var(--color-brand)]"
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
